import { z } from "zod";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  getProjectOverview,
  getProjectCampaignAnalytics,
  getProjectAdSetAnalytics,
  getProjectAdAnalytics,
  getTopPerformers,
  getAllAdSetsForProject,
  getCampaignDailyInsights,
  getPlacementBreakdown,
  invalidateProjectCache,
  type TopPerformerMetric,
} from "../services/traffic-analytics.js";
import {
  fetchAdCreatives,
  fetchVideoSource,
  decryptAccountToken,
} from "../services/meta-ads.js";
import { metaAdsAccounts, metaAdsAccountProjects } from "../db/schema.js";

// ============================================================
// SCHEMAS
// ============================================================

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const daysQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const campaignQuerySchema = z.object({
  campaignId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

const adsetQuerySchema = z.object({
  adsetId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function trafficAnalyticsRoutes(fastify) {
  // ---- GET /api/traffic/analytics/:projectId/overview ----
  fastify.get(
    "/api/traffic/analytics/:projectId/overview",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      try {
        const overview = await getProjectOverview(
          fastify.db,
          paramResult.data.projectId,
          days
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
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      try {
        const result = await getProjectCampaignAnalytics(
          fastify.db,
          paramResult.data.projectId,
          days
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
      if (request.userRole === "guest") {
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
      if (request.userRole === "guest") {
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
  const topPerformersQuerySchema = z.object({
    metric: z.enum(["roas", "cpl", "cplQualified", "leads", "sales", "ctr"]).default("roas"),
    limit: z.coerce.number().int().min(1).max(20).default(5),
    days: z.coerce.number().int().min(1).max(90).default(30),
    campaignId: z.string().optional(),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/top-performers",
    async (request, reply) => {
      if (request.userRole === "guest") {
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
        const result = await getTopPerformers(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.metric as TopPerformerMetric,
          queryResult.data.limit,
          queryResult.data.days,
          queryResult.data.campaignId
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

  // ---- GET /api/traffic/analytics/:projectId/all-adsets ---- (Story 7.8)
  fastify.get(
    "/api/traffic/analytics/:projectId/all-adsets",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      try {
        const result = await getAllAdSetsForProject(
          fastify.db,
          paramResult.data.projectId,
          days
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

  // ---- GET /api/traffic/analytics/:projectId/campaign-daily ---- (Story 8.3)
  const campaignDailyQuerySchema = z.object({
    campaignId: z.string().min(1),
    days: z.coerce.number().int().min(1).max(90).default(30),
  });

  fastify.get(
    "/api/traffic/analytics/:projectId/campaign-daily",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = campaignDailyQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "campaignId obrigatorio" });
      }

      try {
        const result = await getCampaignDailyInsights(
          fastify.db,
          paramResult.data.projectId,
          queryResult.data.campaignId,
          queryResult.data.days
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

  // ---- GET /api/traffic/analytics/:projectId/placements ---- (Story 8.7)
  fastify.get(
    "/api/traffic/analytics/:projectId/placements",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const queryResult = daysQuerySchema.safeParse(request.query);
      const days = queryResult.success ? queryResult.data.days : 30;

      try {
        const result = await getPlacementBreakdown(
          fastify.db,
          paramResult.data.projectId,
          days
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
      if (request.userRole === "guest") {
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
        const creatives = await fetchAdCreatives(
          account.metaAccountId,
          accessToken,
          adIds
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
      if (request.userRole === "guest") {
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
      if (request.userRole === "guest") {
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

});
