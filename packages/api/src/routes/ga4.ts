import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import { ga4Connections, funnels, funnelStages, projects, projectMembers } from "../db/schema.js";
import { exchangeGoogleCode } from "../services/google-ads.js";
import {
  encryptGa4Secret,
  decryptGa4Secret,
  getGa4OAuthUrl,
  getGa4AccessToken,
  listGa4Properties,
  runGa4Report,
  aggregateGa4StageReport,
  ymdDaysAgo,
} from "../services/ga4.js";

// ============================================================
// Epic 37 — Rotas GA4 (Google Analytics Data API).
// Conexão OAuth por projeto (refresh_token cifrado + property selecionada).
// Cada ETAPA escolhe a página via funnel_stages.ga4_page_filter (gravado na rota
// de funnel-stages). Analytics por etapa cacheado em memória (GA4 tem cota).
//
// SEGURANÇA: GET connection devolve só status + property (não-secreta). NUNCA
// serializar/logar refresh_token nem access_token.
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const connectionBodySchema = z.object({
  refreshToken: z.string().min(1),
  propertyId: z.string().min(1).max(32).regex(/^\d+$/, "propertyId deve ser numérico"),
  propertyName: z.string().max(255).optional(),
});

const propertiesBodySchema = z.object({ refreshToken: z.string().min(1) });
const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// Cache L1 (memória) do dashboard por etapa — TTL 10min (GA4 tem cota de API).
const FRESH_TTL_MS = 10 * 60 * 1000;
const memCache = new LRUCache<string, object>({ max: 500, ttl: FRESH_TTL_MS });

export default fp(async function ga4Routes(fastify) {
  // Acesso ao projeto (espelha kiwify): guest sem vínculo -> null (404).
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

  async function getConnectionRow(projectId: string) {
    const [row] = await fastify.db
      .select()
      .from(ga4Connections)
      .where(eq(ga4Connections.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  // ---- GET /api/google-analytics/auth/url ----
  fastify.get("/api/google-analytics/auth/url", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const origin =
      (request.query as { origin?: string }).origin ?? fastify.config.CORS_ORIGIN ?? "http://localhost:3000";
    const redirectUri = `${origin}/settings/google-analytics/callback`;
    try {
      return { url: getGa4OAuthUrl(redirectUri), redirectUri };
    } catch (err) {
      return reply.code(500).send({
        error: "Google OAuth não configurado",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- POST /api/google-analytics/auth/callback (code -> refreshToken + properties) ----
  const callbackSchema = z.object({ code: z.string().min(1), redirectUri: z.string().url() });
  fastify.post("/api/google-analytics/auth/callback", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = callbackSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "code e redirectUri obrigatórios" });
    try {
      const { refreshToken } = await exchangeGoogleCode(parsed.data.code, parsed.data.redirectUri);
      const accessToken = await getGa4AccessToken(refreshToken);
      const properties = await listGa4Properties(accessToken);
      return { refreshToken, properties };
    } catch (err) {
      request.log.error({ err }, "[ga4-auth] callback falhou");
      return reply.code(400).send({
        error: "Falha na autenticação Google Analytics",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- POST /api/projects/:projectId/ga4/properties (lista properties dado um refreshToken) ----
  fastify.post("/api/projects/:projectId/ga4/properties", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = propertiesBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "refreshToken obrigatório" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    try {
      const accessToken = await getGa4AccessToken(body.data.refreshToken);
      return { properties: await listGa4Properties(accessToken) };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao listar properties GA4",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET connection (status + property, sem segredo) ----
  fastify.get("/api/projects/:projectId/ga4/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const row = await getConnectionRow(params.data.projectId);
    return row
      ? { connected: true, propertyId: row.propertyId, propertyName: row.propertyName }
      : { connected: false };
  });

  // ---- PUT connection (valida refreshToken, cifra e salva) ----
  fastify.put("/api/projects/:projectId/ga4/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Valida o refreshToken antes de persistir (obtém access_token).
    try {
      await getGa4AccessToken(body.data.refreshToken);
    } catch (err) {
      return reply.code(502).send({
        error: "refresh token GA4 inválido",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const enc = encryptGa4Secret(body.data.refreshToken);
    const now = new Date();
    await fastify.db
      .insert(ga4Connections)
      .values({
        projectId: params.data.projectId,
        refreshTokenEncrypted: enc.encrypted,
        refreshTokenIv: enc.iv,
        propertyId: body.data.propertyId,
        propertyName: body.data.propertyName ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ga4Connections.projectId,
        set: {
          refreshTokenEncrypted: enc.encrypted,
          refreshTokenIv: enc.iv,
          propertyId: body.data.propertyId,
          propertyName: body.data.propertyName ?? null,
          updatedAt: now,
        },
      });

    // Invalida cache de analytics do projeto (property pode ter mudado).
    for (const key of memCache.keys()) {
      if (key.startsWith(`${params.data.projectId}:`)) memCache.delete(key);
    }
    return { connected: true, propertyId: body.data.propertyId, propertyName: body.data.propertyName ?? null };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/ga4/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    await fastify.db.delete(ga4Connections).where(eq(ga4Connections.projectId, params.data.projectId));
    for (const key of memCache.keys()) {
      if (key.startsWith(`${params.data.projectId}:`)) memCache.delete(key);
    }
    return { connected: false };
  });

  // ---- GET stage analytics (runReport filtrado pela página da etapa) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/ga4-analytics",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = analyticsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const conn = await getConnectionRow(params.data.projectId);
      if (!conn) return reply.code(409).send({ error: "GA4 não conectado neste projeto" });

      // Garante que a etapa pertence ao funil e o funil ao projeto.
      const [stage] = await fastify.db
        .select({ ga4PageFilter: funnelStages.ga4PageFilter, funnelProject: funnels.projectId, funnelId: funnelStages.funnelId })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnelStages.funnelId, funnels.id))
        .where(and(eq(funnelStages.id, params.data.stageId), eq(funnelStages.funnelId, params.data.funnelId)))
        .limit(1);
      if (!stage || stage.funnelProject !== params.data.projectId) {
        return reply.code(404).send({ error: "Etapa não encontrada" });
      }

      const cacheKey = `${params.data.projectId}:${params.data.stageId}:${query.data.days}`;
      const cached = memCache.get(cacheKey);
      if (cached) return cached;

      try {
        const accessToken = await getGa4AccessToken(
          decryptGa4Secret(conn.refreshTokenEncrypted, conn.refreshTokenIv),
        );
        const rows = await runGa4Report(accessToken, conn.propertyId, {
          startDate: ymdDaysAgo(query.data.days),
          endDate: ymdDaysAgo(0),
          pageFilter: stage.ga4PageFilter,
        });
        const result = {
          ...aggregateGa4StageReport(rows),
          pageFilter: stage.ga4PageFilter ?? null,
          configured: Boolean(stage.ga4PageFilter),
        };
        memCache.set(cacheKey, result);
        return result;
      } catch (err) {
        request.log.error({ err }, "Erro no GA4 stage analytics");
        return reply.code(502).send({
          error: "Erro ao consultar GA4",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
});
