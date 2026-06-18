import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { publicMetricsCache } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { LEAD_ORIGIN_SCOPE } from "../services/lead-origin-sync.js";

/**
 * Story 36.7 (Buraco 2): leads por origem (Pago/Orgânico/Sem Track) × temperatura
 * (quente/frio) + únicos, de um stage. Lê o agregado pré-computado em
 * public_metrics_cache (populado pelo job/sync). Zero PII.
 */
const paramSchema = z.object({
  projectId: z.string().uuid(),
  stageId: z.string().uuid(),
});

export default fp(async function publicLeadsRoutes(fastify) {
  fastify.get<{ Params: z.infer<typeof paramSchema> }>(
    "/api/public/v1/projects/:projectId/stages/:stageId/leads-summary",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = paramSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId, stageId } = parsed.data;

      const [row] = await fastify.db
        .select({
          payload: publicMetricsCache.payload,
          computedAt: publicMetricsCache.computedAt,
        })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, projectId),
            eq(publicMetricsCache.scope, LEAD_ORIGIN_SCOPE),
            eq(publicMetricsCache.key, stageId),
          ),
        )
        .limit(1);

      if (!row) {
        return {
          projectId,
          stageId,
          semDados: true,
          message: "Sem dados de leads em cache para este stage (sync ainda não rodou ou stage sem survey).",
        };
      }

      return {
        projectId,
        stageId,
        computedAt: row.computedAt,
        ...(row.payload as Record<string, unknown>),
      };
    },
  );
});
