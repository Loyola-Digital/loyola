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
  LINK_URL_RESOLVER_VERSION,
  type MetaEntityType,
  type ResolveEntityNamesCacheAdapter,
} from "../services/meta-ads.js";
import { metaAdsAccounts, metaAdsAccountProjects, metaEntityNamesCache, metaAdCreativesCache, projectMembers } from "../db/schema.js";
import { getProjectMetaFreshness } from "../services/meta-sync-state.js";
import { getEntityDailySeries } from "../services/meta-entity-daily.js";

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
  /**
   * Teto de criativos por request. Protege o rate limit da Meta — o mesmo que
   * derrubou a integração em 2026-07-16.
   *
   * Story 29.34: exportado no response (`limit`/`requested`) para que a UI
   * possa dizer que houve corte. Truncar é legítimo; truncar em silêncio faz o
   * consumidor ler dado incompleto como dado ausente.
   */
  const AD_CREATIVES_LIMIT = 50;
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

      // Story 29.34 (QA-03): o corte em 50 existe desde a 8.1 para proteger o
      // rate limit da Meta, e está certo. O que estava errado era ser MUDO: o
      // chamador recebia menos criativos do que pediu sem nenhum sinal, e a UI
      // não tinha como distinguir "a Meta não tem esse dado" de "nós não
      // perguntamos". Agora o total pedido volta no response.
      const requestedAdIds = queryResult.data.adIds.split(",").filter(Boolean);
      const adIds = requestedAdIds.slice(0, AD_CREATIVES_LIMIT);
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
        // Story 29.34: `requested` > `limit` diz à UI que houve corte. Campos
        // aditivos — consumidor antigo que só lê `creatives` segue funcionando.
        return { creatives, requested: requestedAdIds.length, limit: AD_CREATIVES_LIMIT };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar criativos",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/traffic/analytics/:projectId/ad-link-urls ---- (Story 29.40, AC1/AC5)
  /**
   * Devolve `ad_id → URL de destino` LENDO DO BANCO, sem teto de 50.
   *
   * Por que não reusar `/ad-creatives`: aquele endpoint corta em 50 porque
   * CHAMA a Meta, e o corte protege o rate limit que derrubou a integração em
   * 2026-07-16. O corte está certo lá — a tabela de Criativos mostra as linhas
   * de maior investimento e o resto exibe "—", que é aceitável.
   *
   * Aqui não é. Uma LP só existe na tabela se TODOS os anúncios que apontam
   * para ela forem considerados: com teto de 50, o investimento do 51º anúncio
   * em diante desapareceria, e a soma da tabela deixaria de bater com o
   * Detalhamento — que é justamente o que o AC6 proíbe.
   *
   * A saída é a regra que o projeto adotou depois daquele estouro: ler do
   * cache. `meta_ad_creatives_cache` já guarda o criativo por ad_id, e ler do
   * Postgres não tem rate limit — o teto some sem risco nenhum.
   *
   * O que NÃO fazemos aqui: buscar na Meta o que falta no cache. Um gestor
   * abrindo a aba com 800 anúncios novos dispararia 16 lotes de uma vez. O
   * cache é populado pelo caminho normal (`/ad-creatives`, sync de criativos),
   * e o que ainda não chegou volta como `null` — vira a linha "Sem link
   * resolvido" (AC5), que é visível e honesta, em vez de uma espera de 30s.
   */
  const adLinkUrlsQuerySchema = z.object({
    adIds: z.string().min(1),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/ad-link-urls",
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

      const queryResult = adLinkUrlsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "adIds obrigatorio" });
      }

      const adIds = [...new Set(queryResult.data.adIds.split(",").filter(Boolean))];
      if (adIds.length === 0) {
        return reply.code(400).send({ error: "adIds vazio" });
      }

      const rows = await fastify.db
        .select({
          adId: metaAdCreativesCache.adId,
          creative: metaAdCreativesCache.creative,
        })
        .from(metaAdCreativesCache)
        .where(
          and(
            eq(metaAdCreativesCache.projectId, paramResult.data.projectId),
            inArray(metaAdCreativesCache.adId, adIds),
          ),
        );

      const linkUrls: Record<string, string | null> = {};
      // Story 29.43 (AC2): ad_ids cuja linha foi escrita por código anterior à
      // correção da 29.40 — `linkUrl: null` ali significa "não foi perguntado",
      // não "a Meta não tem".
      const staleInCache: string[] = [];
      for (const row of rows) {
        const c = row.creative as { linkUrl?: string | null; linkUrlResolver?: number } | null;
        const url = c?.linkUrl ?? null;
        linkUrls[row.adId] = url;
        if (url === null && (c?.linkUrlResolver ?? 0) < LINK_URL_RESOLVER_VERSION) {
          staleInCache.push(row.adId);
        }
      }

      // Story 29.43 (AC2) — TRÊS causas para a ausência de LP, com ações
      // diferentes. Tratá-las como uma só manda o gestor procurar no lugar
      // errado, que era o defeito:
      //
      //   missingFromCache → nunca sincronizado; abrir a aba Criativos resolve
      //   staleInCache     → cache escrito por código antigo; exige backfill
      //   null e carimbado → a Meta realmente não tem URL para este anúncio
      //
      // O carimbo (`linkUrlResolver`) torna a terceira categoria AFIRMÁVEL. Sem
      // ele o projeto só podia inferir pela proporção de resolvidos — critério
      // que quebra justamente num cache misto, que é o estado atual: em
      // 2026-08-08, 511 linhas novas convivem com 1.661 antigas.
      const cached = new Set(rows.map((r) => r.adId));
      const missingFromCache = adIds.filter((id) => !cached.has(id));

      return {
        linkUrls,
        requested: adIds.length,
        resolved: Object.values(linkUrls).filter(Boolean).length,
        missingFromCache,
        staleInCache,
      };
    },
  );

  // ---- GET /api/traffic/analytics/:projectId/entity-daily ---- (Story 29.42, AC6/AC7)
  /**
   * Série diária por entidade, para os gráficos por dimensão do Perpétuo.
   *
   * Lê do banco e NÃO chama a Meta: o rate limit derrubou a integração em
   * 2026-07-16 e a regra desde então é ler do cache que o sync mantém quente.
   * Range sem cobertura devolve o que há e sinaliza em `daysWithoutCoverage` —
   * nunca dispara fetch ao vivo.
   *
   * `spend` volta BRUTO, mesma convenção de `/campaign-daily`. O gross-up dos
   * 12,15% é do frontend, e acontece uma única vez. Ver `meta-entity-daily.ts`.
   */
  const entityDailyQuerySchema = z.object({
    groupBy: z.enum(["campaign", "adset", "ad"]),
    campaignIds: z.string().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/entity-daily",
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

      const queryResult = entityDailyQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "parametros invalidos" });
      }
      const { groupBy, days, startDate, endDate } = queryResult.data;

      // Mesma aritmetica de `/campaign-daily`: datas explicitas tem precedencia
      // sobre `days`, e o range e inclusivo nas duas pontas.
      const hoje = new Date();
      const until = startDate && endDate ? endDate : hoje.toISOString().slice(0, 10);
      const since =
        startDate && endDate
          ? startDate
          : new Date(hoje.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

      const campaignIds = queryResult.data.campaignIds
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      try {
        const result = await getEntityDailySeries(
          fastify.db,
          paramResult.data.projectId,
          groupBy,
          since,
          until,
          campaignIds,
        );
        return { ...result, since, until, groupBy };
      } catch (err) {
        return reply.code(500).send({
          error: "Erro ao montar a serie diaria por entidade",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
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
