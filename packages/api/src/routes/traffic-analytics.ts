import { z } from "zod";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  getProjectOverview,
  getProjectCampaignAnalytics,
  getProjectAdSetAnalytics,
  getProjectAdAnalytics,
  getTopPerformers,
  getAllAdSetsForProject,
  getAllAdsForProject,
  getCampaignDailyInsights,
  getCampaignDailyInsightsBulk,
  getPlacementBreakdown,
  invalidateProjectCache,
  makeAdCreativeCacheAdapter,
  type TopPerformerMetric,
} from "../services/traffic-analytics.js";
import {
  fetchAdCreativesWithCache,
  fetchVideoSource,
  decryptAccountToken,
  resolveEntityNames,
  type MetaEntityType,
  type ResolveEntityNamesCacheAdapter,
} from "../services/meta-ads.js";
import { metaAdsAccounts, metaAdsAccountProjects, metaEntityNamesCache, projectMembers } from "../db/schema.js";
import { getProjectMetaFreshness } from "../services/meta-sync-state.js";

// Story 18.26 Fase 1 / 18.37: TTL alinhado com stage-sales-data.ts (30d). Evita
// re-consultar a Meta a cada 24h e estourar rate limit; refresh vem do backfill.
const META_NAMES_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================
// SCHEMAS
// ============================================================

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const daysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  campaignId: z.string().optional(),
  campaignIds: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const campaignQuerySchema = z.object({
  campaignId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const adsetQuerySchema = z.object({
  adsetId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function trafficAnalyticsRoutes(fastify) {
  // Guests só acessam analytics de tráfego se forem membros do projeto COM a
  // permissão `traffic` marcada no convite. Não-guests passam direto. Mantém
  // alinhado com o sistema de convites (ProjectPermissions.traffic) em vez de
  // bloquear todo guest indiscriminadamente.
  async function guestCanAccessTraffic(
    userRole: string,
    userId: string,
    projectId: string | undefined,
  ): Promise<boolean> {
    if (userRole !== "guest") return true;
    if (!projectId) return false;
    const [member] = await fastify.db
      .select({ permissions: projectMembers.permissions })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member) return false;
    const perms = member.permissions as { traffic?: boolean };
    return perms.traffic === true;
  }

  // ---- GET /api/traffic/analytics/:projectId/overview ----
  fastify.get(
    "/api/traffic/analytics/:projectId/overview",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;
      const campaignIds = queryResult.success
        ? queryResult.data.campaignIds?.split(",").filter(Boolean) ?? (queryResult.data.campaignId ? [queryResult.data.campaignId] : undefined)
        : undefined;
      const startDate = queryResult.success ? queryResult.data.startDate : undefined;
      const endDate = queryResult.success ? queryResult.data.endDate : undefined;

      try {
        const overview = await getProjectOverview(
          fastify.db,
          paramResult.data.projectId,
          days,
          campaignIds,
          startDate,
          endDate,
        );
        return overview;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar analytics",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/campaigns ----
  fastify.get(
    "/api/traffic/analytics/:projectId/campaigns",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;
      const startDate = queryResult.success ? queryResult.data.startDate : undefined;
      const endDate = queryResult.success ? queryResult.data.endDate : undefined;

      try {
        const result = await getProjectCampaignAnalytics(
          fastify.db,
          paramResult.data.projectId,
          days,
          startDate,
          endDate,
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar analytics de campanhas",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/adsets ----
  fastify.get(
    "/api/traffic/analytics/:projectId/adsets",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = campaignQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "campaignId obrigatorio" });
      }

      try {
        const result = await getProjectAdSetAnalytics(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.campaignId,
          queryResult.data.days
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar analytics de ad sets",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/ads ----
  fastify.get(
    "/api/traffic/analytics/:projectId/ads",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = adsetQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "adsetId obrigatorio" });
      }

      try {
        const result = await getProjectAdAnalytics(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.adsetId,
          queryResult.data.days
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar analytics de ads",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/top-performers ---- (Story 7.8)
  // `campaignId` (single, legacy) e `campaignIds` (CSV, multi) são aceitos.
  // Se ambos presentes, `campaignIds` prevalece.
  const topPerformersQuerySchema = z.object({
    metric: z.enum(["roas", "cpl", "cplQualified", "leads", "sales", "ctr", "spend"]).default("roas"),
    limit: z.coerce.number().int().min(1).max(100).default(5),
    days: z.coerce.number().int().min(1).max(365).default(30),
    campaignId: z.string().optional(),
    campaignIds: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/top-performers",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = topPerformersQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      try {
        const idList = queryResult.data.campaignIds
          ? queryResult.data.campaignIds.split(",").map((s) => s.trim()).filter(Boolean)
          : queryResult.data.campaignId
            ? [queryResult.data.campaignId]
            : undefined;
        const result = await getTopPerformers(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.metric as TopPerformerMetric,
          queryResult.data.limit,
          queryResult.data.days,
          idList,
          queryResult.data.startDate,
          queryResult.data.endDate,
        );
        return { topPerformers: result, metric: queryResult.data.metric };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar top performers",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- POST /api/traffic/analytics/:projectId/meta-names/resolve ---- (Story 18.26 Fase 1)
  // Resolve Meta entity ids (ad/adset/campaign) -> nomes. DB-first (cache 24h
  // via meta_entity_names_cache, Story 28.7), batch Meta API com throttle pros
  // faltantes. Usar quando o caller ja tem os ids (ex: utm_medium/utm_content
  // da planilha) e so precisa do nome humano — evita chamar /all-adsets que
  // re-busca insights da Meta API a cada hit.
  const metaNamesResolveBodySchema = z.object({
    entityType: z.enum(["ad", "adset", "campaign"]),
    ids: z.array(z.string()).max(500), // hard cap pra evitar abuso
  });

  fastify.post(
    "/api/traffic/analytics/:projectId/meta-names/resolve",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }
      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }
      const bodyResult = metaNamesResolveBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({ error: "body invalido", details: bodyResult.error.flatten() });
      }
      const projectId = paramResult.data.projectId;
      const { entityType, ids } = bodyResult.data;
      const uniqueIds = Array.from(new Set(ids.filter((x) => x && x.trim().length > 0)));
      if (uniqueIds.length === 0) {
        return { names: {} as Record<string, string> };
      }

      // Adapter contra meta_entity_names_cache (mesmo padrao de stage-sales-data.ts)
      const adapter: ResolveEntityNamesCacheAdapter = {
        async loadCached(idsToLoad) {
          if (idsToLoad.length === 0) return [];
          const cutoff = new Date(Date.now() - META_NAMES_CACHE_TTL_MS);
          const rows = await fastify.db
            .select({
              entityId: metaEntityNamesCache.entityId,
              entityName: metaEntityNamesCache.entityName,
            })
            .from(metaEntityNamesCache)
            .where(
              and(
                eq(metaEntityNamesCache.projectId, projectId),
                eq(metaEntityNamesCache.entityType, entityType as MetaEntityType),
                inArray(metaEntityNamesCache.entityId, idsToLoad),
                gte(metaEntityNamesCache.lastSyncedAt, cutoff),
              ),
            );
          return rows;
        },
        async saveToCache(entries) {
          if (entries.length === 0) return;
          await fastify.db
            .insert(metaEntityNamesCache)
            .values(
              entries.map((e) => ({
                projectId,
                entityType: entityType as MetaEntityType,
                entityId: e.entityId,
                entityName: e.entityName,
                lastSyncedAt: new Date(),
              })),
            )
            .onConflictDoUpdate({
              target: [
                metaEntityNamesCache.projectId,
                metaEntityNamesCache.entityType,
                metaEntityNamesCache.entityId,
              ],
              set: {
                entityName: sql`EXCLUDED.entity_name`,
                lastSyncedAt: sql`EXCLUDED.last_synced_at`,
              },
            });
        },
      };

      // Obtem access token do projeto
      const [link] = await fastify.db
        .select({ accountId: metaAdsAccountProjects.accountId })
        .from(metaAdsAccountProjects)
        .where(eq(metaAdsAccountProjects.projectId, projectId))
        .limit(1);
      if (!link) {
        return { names: {} as Record<string, string> };
      }
      const [account] = await fastify.db
        .select()
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, link.accountId))
        .limit(1);
      if (!account) {
        return { names: {} as Record<string, string> };
      }
      let accessToken: string;
      try {
        accessToken = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);
      } catch {
        return { names: {} as Record<string, string> };
      }

      try {
        const resolved = await resolveEntityNames(uniqueIds, accessToken, adapter);
        const namesRecord: Record<string, string> = {};
        for (const [id, name] of resolved.entries()) {
          namesRecord[id] = name;
        }
        // Log de hit/miss (Story 18.26 AC-10)
        const cacheHits = await adapter.loadCached(uniqueIds);
        request.log.info(
          {
            projectId,
            entityType,
            requested: uniqueIds.length,
            cacheHits: cacheHits.length,
            resolved: resolved.size,
          },
          "meta-names/resolve",
        );
        return { names: namesRecord };
      } catch (err) {
        request.log.error(err, "meta-names/resolve failed");
        return reply.code(502).send({
          error: "Erro ao resolver nomes Meta",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // ---- GET /api/traffic/analytics/:projectId/all-adsets ---- (Story 7.8)
  fastify.get(
    "/api/traffic/analytics/:projectId/all-adsets",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;
      const campaignIds = queryResult.success
        ? queryResult.data.campaignIds?.split(",").filter(Boolean)
        : undefined;
      const startDate = queryResult.success ? queryResult.data.startDate : undefined;
      const endDate = queryResult.success ? queryResult.data.endDate : undefined;

      try {
        const result = await getAllAdSetsForProject(
          fastify.db,
          paramResult.data.projectId,
          days,
          campaignIds,
          startDate,
          endDate,
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar ad sets",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/all-ads ----
  fastify.get(
    "/api/traffic/analytics/:projectId/all-ads",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;
      const campaignIds = queryResult.success
        ? queryResult.data.campaignIds?.split(",").filter(Boolean)
        : undefined;
      const startDate = queryResult.success ? queryResult.data.startDate : undefined;
      const endDate = queryResult.success ? queryResult.data.endDate : undefined;

      try {
        const result = await getAllAdsForProject(
          fastify.db,
          paramResult.data.projectId,
          days,
          campaignIds,
          startDate,
          endDate,
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar ads",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/campaign-daily ---- (Story 8.3)
  // Aceita `campaignId` (singular, legacy) OU `campaignIds` (CSV). Quando lista,
  // agrega N campanhas por dia — usado pelos dashboards de funil pra somar todas
  // as campanhas selecionadas.
  const campaignDailyQuerySchema = z.object({
    campaignId: z.string().optional(),
    campaignIds: z.string().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/campaign-daily",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = campaignDailyQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "parâmetros inválidos" });
      }

      const idsList = queryResult.data.campaignIds
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];

      if (idsList.length === 0 && !queryResult.data.campaignId) {
        return reply.code(400).send({ error: "campaignId ou campaignIds obrigatório" });
      }

      try {
        if (idsList.length > 0) {
          const result = await getCampaignDailyInsightsBulk(
            fastify.db,
            paramResult.data.projectId,
            idsList,
            queryResult.data.days,
            queryResult.data.startDate,
            queryResult.data.endDate
          );
          return result;
        }

        const result = await getCampaignDailyInsights(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.campaignId!,
          queryResult.data.days,
          queryResult.data.startDate,
          queryResult.data.endDate
        );
        return result;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar daily insights da campanha",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/placements ---- (Story 8.7 + 10.7)
  fastify.get(
    "/api/traffic/analytics/:projectId/placements",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;
      const campaignIds = queryResult.success
        ? queryResult.data.campaignIds?.split(",").filter(Boolean) ?? (queryResult.data.campaignId ? [queryResult.data.campaignId] : undefined)
        : undefined;

      try {
        const result = await getPlacementBreakdown(
          fastify.db,
          paramResult.data.projectId,
          days,
          campaignIds
        );
        return { placements: result };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar placements",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/ad-creatives ---- (Story 8.1)
  const adCreativesQuerySchema = z.object({
    adIds: z.string().min(1),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/ad-creatives",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = adCreativesQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "adIds obrigatorio" });
      }

      const adIds = queryResult.data.adIds.split(",").filter(Boolean).slice(0, 50);
      if (adIds.length === 0) {
        return reply.code(400).send({ error: "adIds vazio" });
      }

      // Get Meta account for project
      const [link] = await fastify.db
        .select({ accountId: metaAdsAccountProjects.accountId })
        .from(metaAdsAccountProjects)
        .where(eq(metaAdsAccountProjects.projectId, paramResult.data.projectId))
        .limit(1);

      if (!link) {
        return reply.code(404).send({ error: "Conta Meta Ads nao encontrada" });
      }

      const [account] = await fastify.db
        .select()
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, link.accountId))
        .limit(1);

      if (!account) {
        return reply.code(404).send({ error: "Conta Meta Ads nao encontrada" });
      }

      try {
        const accessToken = decryptAccountToken(
          account.accessTokenEncrypted,
          account.accessTokenIv
        );
        // Story 18.26 Fase 2: DB cache 24h
        const creatives = await fetchAdCreativesWithCache(
          makeAdCreativeCacheAdapter(fastify.db, paramResult.data.projectId),
          account.metaAccountId,
          accessToken,
          adIds,
        );
        return { creatives };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar criativos",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- POST /api/traffic/analytics/:projectId/invalidate ----
  fastify.post(
    "/api/traffic/analytics/:projectId/invalidate",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      invalidateProjectCache(paramResult.data.projectId);
      return { ok: true };
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/video-source ---- (Story 9.5)
  const videoSourceQuerySchema = z.object({
    videoId: z.string().min(1),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/video-source",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = videoSourceQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "videoId obrigatorio" });
      }

      // Get Meta account for project
      const [link] = await fastify.db
        .select({ accountId: metaAdsAccountProjects.accountId })
        .from(metaAdsAccountProjects)
        .where(eq(metaAdsAccountProjects.projectId, paramResult.data.projectId))
        .limit(1);

      if (!link) {
        return reply.code(404).send({ error: "Conta Meta Ads nao encontrada" });
      }

      const [account] = await fastify.db
        .select()
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, link.accountId))
        .limit(1);

      if (!account) {
        return reply.code(404).send({ error: "Conta Meta Ads nao encontrada" });
      }

      try {
        const accessToken = decryptAccountToken(
          account.accessTokenEncrypted,
          account.accessTokenIv
        );
        const videoData = await fetchVideoSource(
          queryResult.data.videoId,
          accessToken
        );
        return videoData;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar video",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/meta-freshness ----
  // Frescor do sync Meta (max last_success_at do projeto) para o selo
  // "atualizado há X" nos painéis. Lê meta_sync_state — nunca chama a Meta.
  fastify.get(
    "/api/traffic/analytics/:projectId/meta-freshness",
    async (request, reply) => {
      if (!(await guestCanAccessTraffic(
        request.userRole,
        request.userId,
        (request.params as { projectId?: string }).projectId,
      ))) {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      try {
        return await getProjectMetaFreshness(fastify.db, paramResult.data.projectId);
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar freshness",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

});
