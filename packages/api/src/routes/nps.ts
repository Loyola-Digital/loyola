import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelNpsDatasets, funnelSurveys, funnels, stageSalesPlanSources, npsBrindeStatus, stageEventLeadStatus } from "../db/schema.js";
import { readSheetData, getSpreadsheetSheets } from "../services/google-sheets.js";
import {
  mapNpsRows,
  buildLoyolaIndex,
  sheetToLoyolaRecords,
  crossNps,
  summarizeNps,
  findNameHeader,
  type LoyolaRecord,
  type NpsColumnMapping,
} from "../services/nps.js";

// ============================================================
// Epic 38 — Rotas NPS. Lista de NPS por etapa (planilha + mapeamento, igual
// funnel_surveys) cruzada por e-mail/nome com as respostas da pesquisa da etapa.
// Guest-block (mesma régua das surveys). Leitura de planilha ao vivo (Google).
// ============================================================

const stageParams = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});
const datasetParams = stageParams.extend({ datasetId: z.string().uuid() });

const createSchema = z.object({
  label: z.string().min(1).max(120),
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
});
const mappingSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  score: z.string().optional(),
  timestamp: z.string().optional(),
});

export default fp(async function npsRoutes(fastify) {
  async function getFunnel(projectId: string, funnelId: string) {
    const [f] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return f ?? null;
  }

  // ---- GET datasets da etapa ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps", async (request, reply) => {
    // Guest membro PODE ver o NPS — membership já validada pelo guest-guard global.
    const p = stageParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await getFunnel(p.data.projectId, p.data.funnelId))) return reply.code(404).send({ error: "Funil não encontrado" });

    const datasets = await fastify.db
      .select()
      .from(funnelNpsDatasets)
      .where(and(eq(funnelNpsDatasets.funnelId, p.data.funnelId), eq(funnelNpsDatasets.stageId, p.data.stageId)));
    return { datasets };
  });

  // ---- POST cria dataset (planilha + sheet) ----
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = stageParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    if (!(await getFunnel(p.data.projectId, p.data.funnelId))) return reply.code(404).send({ error: "Funil não encontrado" });

    const [dataset] = await fastify.db
      .insert(funnelNpsDatasets)
      .values({
        funnelId: p.data.funnelId,
        stageId: p.data.stageId,
        label: body.data.label,
        spreadsheetId: body.data.spreadsheetId,
        spreadsheetName: body.data.spreadsheetName,
        sheetName: body.data.sheetName,
      })
      .returning();
    return reply.code(201).send(dataset);
  });

  // ---- PATCH mapping (quais colunas são name/email/score/timestamp) ----
  fastify.patch("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps/:datasetId/mapping", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = datasetParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = mappingSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [updated] = await fastify.db
      .update(funnelNpsDatasets)
      .set({ columnMapping: body.data })
      .where(and(eq(funnelNpsDatasets.id, p.data.datasetId), eq(funnelNpsDatasets.stageId, p.data.stageId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Dataset não encontrado" });
    return updated;
  });

  // ---- DELETE dataset ----
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps/:datasetId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = datasetParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const deleted = await fastify.db
      .delete(funnelNpsDatasets)
      .where(and(eq(funnelNpsDatasets.id, p.data.datasetId), eq(funnelNpsDatasets.stageId, p.data.stageId)))
      .returning({ id: funnelNpsDatasets.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "Dataset não encontrado" });
    return { success: true };
  });

  // ---- GET colunas (headers) da planilha do dataset — pra montar o mapeamento ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps/:datasetId/columns", async (request, reply) => {
    // Guest membro PODE ler as colunas — membership validada pelo guest-guard global.
    const p = datasetParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const [ds] = await fastify.db.select().from(funnelNpsDatasets).where(eq(funnelNpsDatasets.id, p.data.datasetId)).limit(1);
    if (!ds || ds.stageId !== p.data.stageId) return reply.code(404).send({ error: "Dataset não encontrado" });
    try {
      const sheet = await readSheetData(ds.spreadsheetId, ds.sheetName);
      return { headers: sheet.headers };
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao ler a planilha", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET cruzamento (NPS × respostas da etapa) ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps/:datasetId/cross", async (request, reply) => {
    // Guest membro PODE ver o cruzamento de NPS — membership validada pelo guest-guard global.
    const p = datasetParams.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [ds] = await fastify.db.select().from(funnelNpsDatasets).where(eq(funnelNpsDatasets.id, p.data.datasetId)).limit(1);
    if (!ds || ds.stageId !== p.data.stageId) return reply.code(404).send({ error: "Dataset não encontrado" });

    try {
      // 1) Respondentes do NPS.
      const npsSheet = await readSheetData(ds.spreadsheetId, ds.sheetName);
      const respondents = mapNpsRows(npsSheet.headers, npsSheet.rows, ds.columnMapping as NpsColumnMapping);

      // 2) Respostas do Loyola pra cruzar: pesquisas do funil (funnel_surveys) E
      //    fontes da etapa de EVENTO (stage_sales_plan_sources: participantes +
      //    respostas). e-mail vem do mapping; nome do mapping.name ou detectado.
      const records: LoyolaRecord[] = [];
      const loyolaColumns = new Set<string>();
      const addSheet = async (
        spreadsheetId: string,
        sheetName: string,
        emailHeader: string | undefined,
        mappedName: string | undefined,
      ) => {
        const sheet = await readSheetData(spreadsheetId, sheetName);
        sheet.headers.forEach((h) => loyolaColumns.add(h));
        const nameHeader = mappedName ?? findNameHeader(sheet.headers);
        records.push(...sheetToLoyolaRecords(sheet.headers, sheet.rows, emailHeader, nameHeader));
      };

      const surveys = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.stageId, p.data.stageId));
      for (const s of surveys) {
        try {
          await addSheet(s.spreadsheetId, s.sheetName, s.columnMapping?.email, undefined);
        } catch (err) {
          request.log.warn({ err, surveyId: s.id }, "NPS: falha ao ler pesquisa do funil");
        }
      }

      const planSources = await fastify.db
        .select()
        .from(stageSalesPlanSources)
        .where(eq(stageSalesPlanSources.stageId, p.data.stageId));
      for (const s of planSources) {
        try {
          const m = (s.mapping ?? {}) as { email?: string; name?: string };
          await addSheet(s.spreadsheetId, s.sheetName, m.email, m.name);
        } catch (err) {
          request.log.warn({ err, sourceId: s.id }, "NPS: falha ao ler fonte da etapa");
        }
      }

      // Vendedor atribuído no Mapa do Evento (por email do lead) — pra mostrar no NPS.
      const sellerRows = await fastify.db
        .select({ leadEmail: stageEventLeadStatus.leadEmail, assignedSeller: stageEventLeadStatus.assignedSeller })
        .from(stageEventLeadStatus)
        .where(eq(stageEventLeadStatus.stageId, p.data.stageId));
      const sellerByEmail = new Map<string, string>();
      for (const sr of sellerRows) if (sr.assignedSeller) sellerByEmail.set(sr.leadEmail.toLowerCase(), sr.assignedSeller);

      const index = buildLoyolaIndex(records);
      const rows = crossNps(respondents, index, sellerByEmail);

      // Status do brinde (marcado no evento) por respondente.
      const brindeRows = await fastify.db
        .select({ respondentKey: npsBrindeStatus.respondentKey, delivered: npsBrindeStatus.delivered })
        .from(npsBrindeStatus)
        .where(eq(npsBrindeStatus.datasetId, ds.id));
      const brindeMap = new Map(brindeRows.map((b) => [b.respondentKey, b.delivered]));
      for (const r of rows) r.brindeDelivered = r.key ? (brindeMap.get(r.key) ?? false) : false;

      // Ordena: mais interessado primeiro (rank asc), depois maior nota.
      rows.sort((a, b) => a.interestRank - b.interestRank || (b.score ?? -1) - (a.score ?? -1));

      return {
        label: ds.label,
        rows,
        summary: summarizeNps(rows),
        loyolaColumns: Array.from(loyolaColumns),
        npsColumns: npsSheet.headers,
        surveysFound: surveys.length + planSources.length,
      };
    } catch (err) {
      request.log.error({ err }, "Erro no cruzamento NPS");
      return reply.code(502).send({ error: "Erro ao cruzar NPS", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- PUT status do brinde de um respondente (marcado no evento) ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/nps/:datasetId/brinde",
    async (request, reply) => {
      // Guest membro PODE marcar — membership validada pelo guest-guard global
      // (+ allowlist de writes). Sem bloqueio hard aqui.
      const p = datasetParams.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = z
        .object({ respondentKey: z.string().min(1).max(255), delivered: z.boolean() })
        .safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

      const [ds] = await fastify.db
        .select({ id: funnelNpsDatasets.id, stageId: funnelNpsDatasets.stageId })
        .from(funnelNpsDatasets)
        .where(eq(funnelNpsDatasets.id, p.data.datasetId))
        .limit(1);
      if (!ds || ds.stageId !== p.data.stageId) return reply.code(404).send({ error: "Dataset não encontrado" });

      await fastify.db
        .insert(npsBrindeStatus)
        .values({
          datasetId: p.data.datasetId,
          respondentKey: body.data.respondentKey,
          delivered: body.data.delivered,
        })
        .onConflictDoUpdate({
          target: [npsBrindeStatus.datasetId, npsBrindeStatus.respondentKey],
          set: { delivered: body.data.delivered, updatedAt: new Date() },
        });
      return { ok: true, respondentKey: body.data.respondentKey, delivered: body.data.delivered };
    },
  );

  // ---- GET helper: lista sheets de uma spreadsheet (pro wizard) ----
  fastify.get("/api/projects/:projectId/nps/spreadsheets/:spreadsheetId/sheets", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId } = request.params as { spreadsheetId: string };
    try {
      const result = await getSpreadsheetSheets(spreadsheetId);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao ler a planilha", details: err instanceof Error ? err.message : String(err) });
    }
  });
});
