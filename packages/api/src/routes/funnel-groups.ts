import { z } from "zod";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnels,
  funnelGroupsSpreadsheets,
  funnelGroupSnapshots,
} from "../db/schema.js";
import { syncGroupsFromSheet } from "../services/funnel-groups-sync.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const linkBodySchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
});

const dailyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

interface DailyPoint {
  date: string;
  participants: number;
  input: number;
  output: number;
  groupFull: number;
  groupOpen: number;
  groupTotal: number;
  clicksTotal: number;
  deltaParticipants: number;
  deltaInput: number;
  deltaOutput: number;
}

interface CampaignSeries {
  campaignId: string;
  campaignName: string;
  series: DailyPoint[];
}

export default fp(async function funnelGroupsRoutes(fastify) {
  async function ensureFunnelInProject(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/groups-spreadsheet
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/groups-spreadsheet",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [link] = await fastify.db
        .select()
        .from(funnelGroupsSpreadsheets)
        .where(eq(funnelGroupsSpreadsheets.funnelId, p.data.funnelId))
        .limit(1);

      if (!link) return reply.code(404).send({ error: "Nenhuma planilha vinculada" });

      return {
        id: link.id,
        spreadsheetId: link.spreadsheetId,
        spreadsheetName: link.spreadsheetName,
        sheetName: link.sheetName,
        lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
        createdAt: link.createdAt.toISOString(),
      };
    }
  );

  // POST /api/projects/:projectId/funnels/:funnelId/groups-spreadsheet
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/groups-spreadsheet",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = linkBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // Upsert: 1 link por funil
      await fastify.db
        .delete(funnelGroupsSpreadsheets)
        .where(eq(funnelGroupsSpreadsheets.funnelId, p.data.funnelId));

      const [link] = await fastify.db
        .insert(funnelGroupsSpreadsheets)
        .values({
          funnelId: p.data.funnelId,
          spreadsheetId: body.data.spreadsheetId,
          spreadsheetName: body.data.spreadsheetName,
          sheetName: body.data.sheetName,
        })
        .returning();

      return reply.code(201).send({
        id: link.id,
        spreadsheetId: link.spreadsheetId,
        spreadsheetName: link.spreadsheetName,
        sheetName: link.sheetName,
        lastSyncedAt: null,
        createdAt: link.createdAt.toISOString(),
      });
    }
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/groups-spreadsheet
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/groups-spreadsheet",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // Apaga link e snapshots (FK cascade já cuidaria, mas explicitamos pra clareza)
      await fastify.db
        .delete(funnelGroupSnapshots)
        .where(eq(funnelGroupSnapshots.funnelId, p.data.funnelId));
      await fastify.db
        .delete(funnelGroupsSpreadsheets)
        .where(eq(funnelGroupsSpreadsheets.funnelId, p.data.funnelId));

      return reply.code(204).send();
    }
  );

  // POST /api/projects/:projectId/funnels/:funnelId/groups-spreadsheet/sync
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/groups-spreadsheet/sync",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      try {
        const result = await syncGroupsFromSheet(fastify.db, p.data.funnelId);
        return result;
      } catch (err) {
        fastify.log.error({ err }, "[funnel-groups] sync failed");
        return reply.code(502).send({
          error: "Erro ao sincronizar",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // GET /api/projects/:projectId/funnels/:funnelId/group-snapshots/daily?from=&to=
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/group-snapshots/daily",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const q = dailyQuerySchema.safeParse(request.query);
      if (!q.success) return reply.code(400).send({ error: "Query inválida" });

      const funnel = await ensureFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      // Default: últimos 30 dias
      const to = q.data.to ? new Date(`${q.data.to}T23:59:59Z`) : new Date();
      const from = q.data.from
        ? new Date(`${q.data.from}T00:00:00Z`)
        : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Pega TODOS snapshots no range; aggregação para "último por dia" é feita aqui em memória
      const rows = await fastify.db
        .select()
        .from(funnelGroupSnapshots)
        .where(
          and(
            eq(funnelGroupSnapshots.funnelId, p.data.funnelId),
            gte(funnelGroupSnapshots.snapshotAt, from),
            lte(funnelGroupSnapshots.snapshotAt, to)
          )
        )
        .orderBy(desc(funnelGroupSnapshots.snapshotAt));

      if (rows.length === 0) {
        return { campaigns: [], aggregate: { series: [] }, kpis: emptyKpis() };
      }

      // 1. Agrupar por (campaignId, day) → último snapshot daquele dia
      type Snap = (typeof rows)[number];
      const lastByCampDay = new Map<string, Snap>(); // key = `${campaignId}|${YYYY-MM-DD}`
      const campaignNames = new Map<string, string>();

      for (const r of rows) {
        const day = formatDay(r.snapshotAt);
        const key = `${r.campaignId}|${day}`;
        // rows estão ordenadas desc por snapshotAt — o primeiro que vê é o último do dia
        if (!lastByCampDay.has(key)) {
          lastByCampDay.set(key, r);
        }
        if (!campaignNames.has(r.campaignId)) {
          campaignNames.set(r.campaignId, r.campaignName);
        }
      }

      // 2. Por campanha, montar série diária ordenada e calcular deltas
      const byCampaign = new Map<string, Snap[]>();
      for (const snap of lastByCampDay.values()) {
        const arr = byCampaign.get(snap.campaignId) ?? [];
        arr.push(snap);
        byCampaign.set(snap.campaignId, arr);
      }

      const campaigns: CampaignSeries[] = [];
      for (const [campaignId, snaps] of byCampaign) {
        snaps.sort((a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime());
        const series: DailyPoint[] = [];
        for (let i = 0; i < snaps.length; i++) {
          const cur = snaps[i];
          const prev = i > 0 ? snaps[i - 1] : null;
          series.push({
            date: formatDay(cur.snapshotAt),
            participants: cur.participantsAmount,
            input: cur.inputAmount,
            output: cur.outputAmount,
            groupFull: cur.groupFull,
            groupOpen: cur.groupOpen,
            groupTotal: cur.groupTotal,
            clicksTotal: cur.clicksTotal,
            deltaParticipants: prev ? cur.participantsAmount - prev.participantsAmount : 0,
            deltaInput: prev ? cur.inputAmount - prev.inputAmount : cur.inputAmount,
            deltaOutput: prev ? cur.outputAmount - prev.outputAmount : cur.outputAmount,
          });
        }
        campaigns.push({
          campaignId,
          campaignName: campaignNames.get(campaignId) ?? campaignId,
          series,
        });
      }

      // 3. Agregado total do funil por dia (soma de todas campanhas naquele dia)
      const allDays = new Set<string>();
      for (const c of campaigns) for (const s of c.series) allDays.add(s.date);
      const sortedDays = Array.from(allDays).sort();

      const aggSeries: DailyPoint[] = [];
      for (let idx = 0; idx < sortedDays.length; idx++) {
        const day = sortedDays[idx];
        let participants = 0,
          input = 0,
          output = 0,
          groupFull = 0,
          groupOpen = 0,
          groupTotal = 0,
          clicksTotal = 0;
        for (const c of campaigns) {
          const point = c.series.find((s) => s.date === day);
          if (point) {
            participants += point.participants;
            input += point.input;
            output += point.output;
            groupFull += point.groupFull;
            groupOpen += point.groupOpen;
            groupTotal += point.groupTotal;
            clicksTotal += point.clicksTotal;
          }
        }
        const prev = idx > 0 ? aggSeries[idx - 1] : null;
        aggSeries.push({
          date: day,
          participants,
          input,
          output,
          groupFull,
          groupOpen,
          groupTotal,
          clicksTotal,
          deltaParticipants: prev ? participants - prev.participants : 0,
          deltaInput: prev ? input - prev.input : input,
          deltaOutput: prev ? output - prev.output : output,
        });
      }

      // 4. KPIs (último dia vs penúltimo)
      const last = aggSeries[aggSeries.length - 1];
      const kpis = last
        ? {
            participants: last.participants,
            deltaParticipants: last.deltaParticipants,
            deltaInput: last.deltaInput,
            deltaOutput: last.deltaOutput,
            groupFull: last.groupFull,
            groupOpen: last.groupOpen,
            groupTotal: last.groupTotal,
            clicksTotal: last.clicksTotal,
            asOf: last.date,
          }
        : emptyKpis();

      return { campaigns, aggregate: { series: aggSeries }, kpis };
    }
  );
});

function formatDay(d: Date): string {
  // YYYY-MM-DD em UTC pra evitar shifts por timezone do servidor
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function emptyKpis() {
  return {
    participants: 0,
    deltaParticipants: 0,
    deltaInput: 0,
    deltaOutput: 0,
    groupFull: 0,
    groupOpen: 0,
    groupTotal: 0,
    clicksTotal: 0,
    asOf: null as string | null,
  };
}
