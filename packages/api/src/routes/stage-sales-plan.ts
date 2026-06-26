// Story 19.15 — Plano de Vendas (Evento Presencial).
// N planilhas de pesquisa (1 por tipo) são conectadas à etapa; a lista de
// participantes é a UNIÃO delas, deduplicada por email. Uma matriz GLOBAL de
// faixas de faturamento → oferta classifica cada participante. GET sales-plan
// devolve o documento já computado (KPIs + tiers + matriz).

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageSalesPlanSources,
  stageSalesPlanRules,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { parseFaturamento } from "../services/parse-faturamento.js";
import type {
  SalesPlanSource,
  SalesPlanSourceRole,
  SalesPlanRule,
  SalesPlanParticipant,
  SalesPlanTierGroup,
  SalesPlanResponse,
} from "@loyola-x/shared";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const mappingSchema = z
  .object({
    name: z.string().trim().max(255).optional(),
    email: z.string().trim().max(255).optional(),
    telefone: z.string().trim().max(255).optional(),
    tipo: z.string().trim().max(255).optional(),
    faturamento: z.string().trim().max(255).optional(),
  })
  .strip();

const sourcesBodySchema = z.object({
  sources: z
    .array(
      z.object({
        role: z.enum(["participants", "survey"]),
        tipo: z.string().trim().max(80).default(""),
        spreadsheetId: z.string().trim().min(1).max(255),
        spreadsheetName: z.string().trim().max(500).default(""),
        sheetName: z.string().trim().min(1).max(255),
        mapping: mappingSchema.default({}),
      }),
    )
    .max(50),
});

const rulesBodySchema = z.object({
  rules: z
    .array(
      z
        .object({
          label: z.string().trim().min(1).max(255),
          minRevenue: z.number().nonnegative().nullable().optional(),
          maxRevenue: z.number().nonnegative().nullable().optional(),
          offer: z.string().trim().max(500).default(""),
        })
        // min < max quando ambos informados
        .refine(
          (r) => r.minRevenue == null || r.maxRevenue == null || r.minRevenue < r.maxRevenue,
          { message: "minRevenue deve ser menor que maxRevenue" },
        ),
    )
    .max(100),
});

const MAX_PARTICIPANTS = 10000;

export default fp(async function stageSalesPlanRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async function getStage(projectId: string, funnelId: string, stageId: string) {
    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return stage ?? null;
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId";

  async function listSources(stageId: string): Promise<SalesPlanSource[]> {
    const rows = await fastify.db
      .select()
      .from(stageSalesPlanSources)
      .where(eq(stageSalesPlanSources.stageId, stageId))
      .orderBy(asc(stageSalesPlanSources.sortOrder));
    return rows.map((r) => ({
      id: r.id,
      stageId: r.stageId,
      role: (r.role as SalesPlanSourceRole) ?? "participants",
      tipo: r.tipo,
      spreadsheetId: r.spreadsheetId,
      spreadsheetName: r.spreadsheetName,
      sheetName: r.sheetName,
      mapping: r.mapping ?? {},
      sortOrder: r.sortOrder,
    }));
  }

  async function listRules(stageId: string): Promise<SalesPlanRule[]> {
    const rows = await fastify.db
      .select()
      .from(stageSalesPlanRules)
      .where(eq(stageSalesPlanRules.stageId, stageId))
      .orderBy(asc(stageSalesPlanRules.sortOrder));
    return rows.map((r) => ({
      id: r.id,
      stageId: r.stageId,
      label: r.label,
      minRevenue: r.minRevenue != null ? Number(r.minRevenue) : null,
      maxRevenue: r.maxRevenue != null ? Number(r.maxRevenue) : null,
      offer: r.offer,
      sortOrder: r.sortOrder,
    }));
  }

  // Monta a lista de participantes: a base é a planilha MESTRE (role
  // "participants" — todo mundo, com tipo). O faturamento é um lookup por email
  // nas planilhas de RESPOSTAS (role "survey"); quem não respondeu fica sem
  // faturamento. Dedup por email.
  async function loadParticipants(
    stageId: string,
  ): Promise<{ email: string; name: string; tipo: string; revenue: number | null; revenueRaw: string | null }[]> {
    const sources = await listSources(stageId);
    if (sources.length === 0) return [];

    // 1) faturamento por email (todas as planilhas de respostas; 1ª que parseia vence)
    const revenueByEmail = new Map<string, { raw: string; value: number }>();
    for (const src of sources.filter((s) => s.role === "survey")) {
      const mapping = src.mapping ?? {};
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
      const fatIdx = mapping.faturamento ? headers.indexOf(mapping.faturamento) : -1;
      if (emailIdx === -1 || fatIdx === -1) continue;
      for (const row of rows) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email || revenueByEmail.has(email)) continue;
        const raw = (row[fatIdx] ?? "").trim();
        if (!raw) continue;
        const value = parseFaturamento(raw);
        if (value != null) revenueByEmail.set(email, { raw, value });
      }
    }

    // 2) base de participantes (planilha mestre); enriquece com o faturamento
    type P = { email: string; name: string; tipo: string; revenue: number | null; revenueRaw: string | null };
    const byEmail = new Map<string, P>();
    for (const src of sources.filter((s) => s.role === "participants")) {
      if (byEmail.size >= MAX_PARTICIPANTS) break;
      const mapping = src.mapping ?? {};
      let data;
      try {
        data = await readSheetData(src.spreadsheetId, src.sheetName);
      } catch {
        continue;
      }
      const { headers, rows } = data;
      const emailIdx = mapping.email ? headers.indexOf(mapping.email) : -1;
      const nameIdx = mapping.name ? headers.indexOf(mapping.name) : -1;
      const tipoIdx = mapping.tipo ? headers.indexOf(mapping.tipo) : -1;
      if (emailIdx === -1) continue;
      for (const row of rows) {
        if (byEmail.size >= MAX_PARTICIPANTS) break;
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email || byEmail.has(email)) continue;
        const fat = revenueByEmail.get(email) ?? null;
        byEmail.set(email, {
          email,
          name: nameIdx !== -1 ? (row[nameIdx] ?? "").trim() : "",
          tipo: tipoIdx !== -1 ? (row[tipoIdx] ?? "").trim() : "",
          revenueRaw: fat?.raw ?? null,
          revenue: fat?.value ?? null,
        });
      }
    }
    return Array.from(byEmail.values());
  }

  // ---- FONTES (pesquisas conectadas) ----
  fastify.get(`${base}/sales-plan-sources`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    return { sources: await listSources(params.data.stageId) };
  });

  fastify.put(`${base}/sales-plan-sources`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = sourcesBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Corpo inválido" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const { stageId } = params.data;
    await fastify.db.delete(stageSalesPlanSources).where(eq(stageSalesPlanSources.stageId, stageId));
    if (body.data.sources.length > 0) {
      await fastify.db.insert(stageSalesPlanSources).values(
        body.data.sources.map((s, i) => ({
          stageId,
          role: s.role,
          tipo: s.tipo,
          spreadsheetId: s.spreadsheetId,
          spreadsheetName: s.spreadsheetName,
          sheetName: s.sheetName,
          mapping: s.mapping,
          sortOrder: i,
        })),
      );
    }
    return { sources: await listSources(stageId) };
  });

  // ---- REGRAS (matriz de faixas → oferta) ----
  fastify.get(`${base}/sales-plan-rules`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    return { rules: await listRules(params.data.stageId) };
  });

  fastify.put(`${base}/sales-plan-rules`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = rulesBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Corpo inválido" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const { stageId } = params.data;
    await fastify.db.delete(stageSalesPlanRules).where(eq(stageSalesPlanRules.stageId, stageId));
    if (body.data.rules.length > 0) {
      await fastify.db.insert(stageSalesPlanRules).values(
        body.data.rules.map((r, i) => ({
          stageId,
          label: r.label,
          minRevenue: r.minRevenue != null ? String(r.minRevenue) : null,
          maxRevenue: r.maxRevenue != null ? String(r.maxRevenue) : null,
          offer: r.offer,
          sortOrder: i,
        })),
      );
    }
    return { rules: await listRules(stageId) };
  });

  // ---- DOCUMENTO (cruzamento + matriz computados) ----
  fastify.get(`${base}/sales-plan`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [raw, rules] = await Promise.all([
      loadParticipants(params.data.stageId),
      listRules(params.data.stageId),
    ]);

    // 1ª faixa (em ordem) cujo intervalo [min, max) contém o faturamento.
    function matchRule(rev: number | null): SalesPlanRule | null {
      if (rev == null) return null;
      for (const rule of rules) {
        const okMin = rule.minRevenue == null || rev >= rule.minRevenue;
        const okMax = rule.maxRevenue == null || rev < rule.maxRevenue;
        if (okMin && okMax) return rule;
      }
      return null;
    }

    const tiers: SalesPlanTierGroup[] = rules.map((r) => ({
      ruleId: r.id,
      label: r.label,
      minRevenue: r.minRevenue,
      maxRevenue: r.maxRevenue,
      offer: r.offer,
      count: 0,
      participants: [],
    }));
    const tierById = new Map(tiers.map((t) => [t.ruleId, t]));

    const participants: SalesPlanParticipant[] = [];
    const unmatched: SalesPlanParticipant[] = [];
    const byTypeMap = new Map<string, number>();
    let withRevenue = 0;
    let totalRevenue = 0;

    for (const p of raw) {
      const rule = matchRule(p.revenue);
      const sp: SalesPlanParticipant = {
        email: p.email,
        name: p.name,
        tipo: p.tipo,
        revenue: p.revenue,
        revenueRaw: p.revenueRaw,
        ruleLabel: rule?.label ?? null,
        offer: rule?.offer ?? null,
      };
      participants.push(sp);
      byTypeMap.set(p.tipo, (byTypeMap.get(p.tipo) ?? 0) + 1);
      if (p.revenue != null) {
        withRevenue += 1;
        totalRevenue += p.revenue;
      }
      if (rule) {
        const t = tierById.get(rule.id)!;
        t.participants.push(sp);
        t.count += 1;
      } else {
        unmatched.push(sp);
      }
    }

    const byType = Array.from(byTypeMap, ([tipo, count]) => ({ tipo, count })).sort(
      (a, b) => b.count - a.count,
    );

    const response: SalesPlanResponse = {
      participants,
      tiers,
      unmatched,
      rules,
      summary: {
        totalParticipants: participants.length,
        withRevenue,
        withoutRevenue: participants.length - withRevenue,
        totalRevenue,
        byType,
      },
    };
    return response;
  });
});
