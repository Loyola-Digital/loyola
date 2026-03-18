import { z } from "zod";
import fp from "fastify-plugin";
import {
  getProjectOverview,
  getProjectCampaignAnalytics,
  getProjectAdSetAnalytics,
  getProjectAdAnalytics,
  invalidateProjectCache,
} from "../services/traffic-analytics.js";

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
      if (request.userRole !== "admin" && request.userRole !== "manager") {
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
      if (request.userRole !== "admin" && request.userRole !== "manager") {
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
      if (request.userRole !== "admin" && request.userRole !== "manager") {
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
      if (request.userRole !== "admin" && request.userRole !== "manager") {
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

  // ---- POST /api/traffic/analytics/:projectId/invalidate ----
  fastify.post(
    "/api/traffic/analytics/:projectId/invalidate",
    async (request, reply) => {
      if (request.userRole !== "admin" && request.userRole !== "manager") {
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
});
