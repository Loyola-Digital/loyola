import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { publicMetricsCache } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { CROSS_LAUNCH_SCOPE } from "../services/cross-launch-sync.js";

/**
 * Story 39.I4 — CROSS-LAUNCH público (recompra entre funis do projeto, match
 * server-side por sha256 de e-mail — zero PII). Lê o cache pré-computado.
 */
const paramsSchema = z.object({ projectId: z.string().uuid() });

export default fp(async function publicCrossLaunchRoutes(fastify) {
  fastify.get<{ Params: z.infer<typeof paramsSchema> }>(
    "/api/public/v1/projects/:projectId/cross-launch",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = paramsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId } = parsed.data;

      const [row] = await fastify.db
        .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, projectId),
            eq(publicMetricsCache.scope, CROSS_LAUNCH_SCOPE),
            eq(publicMetricsCache.key, projectId),
          ),
        )
        .limit(1);

      if (!row) {
        return {
          projectId,
          semDados: true,
          message: "Cross-launch ainda não computado para este projeto (sync pendente).",
        };
      }
      return { projectId, computedAt: row.computedAt, ...(row.payload as Record<string, unknown>) };
    },
  );
});
