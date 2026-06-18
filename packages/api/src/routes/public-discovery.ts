import { z } from "zod";
import { eq, and, isNull, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, funnels, funnelStages } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";

/**
 * Story 36.3 — Camada de DISCOVERY da API pública read-only (`/api/public/v1/*`).
 *
 * Hierarquia que a IA/MCP percorre de cima pra baixo, sem adivinhar IDs:
 *   projects → funnels → stages
 *
 * Modelo de auth (decisão de produto): UMA chave admin global; o `projectId`/`funnelId`
 * vem no path. Todas as rotas usam `requireScope(PUBLIC_READ_SCOPE)`. O middleware
 * `api-key-auth` (Story 36.2) já valida a chave, força GET-only e aplica rate limit.
 *
 * Lê SOMENTE tabelas de domínio (`projects`, `funnels`, `funnel_stages`) — leitura
 * barata, sem agregação pesada e sem chamar APIs externas.
 */

// MVP: scope único de leitura. Reaproveita `meta:read` (já é o default das chaves
// geradas na 36.1) para a chave existente funcionar em tudo sem regenerar.
// Granularização (`sales:read`, etc.) fica para evolução futura.
export const PUBLIC_READ_SCOPE = "meta:read";

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const funnelIdParamSchema = z.object({
  funnelId: z.string().uuid(),
});

export default fp(async function publicDiscoveryRoutes(fastify) {
  // ---- GET /api/public/v1/projects ----
  // Ponto de entrada do LLM: lista os projetos disponíveis.
  fastify.get(
    "/api/public/v1/projects",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async () => {
      const rows = await fastify.db
        .select({
          id: projects.id,
          name: projects.name,
          clientName: projects.clientName,
          isActive: projects.isActive,
        })
        .from(projects)
        .orderBy(asc(projects.name));

      return { projects: rows };
    }
  );

  // ---- GET /api/public/v1/projects/:projectId/funnels ----
  // Funis (lançamentos/perpétuos) de um projeto, ativos (não arquivados).
  fastify.get<{ Params: z.infer<typeof projectIdParamSchema> }>(
    "/api/public/v1/projects/:projectId/funnels",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = projectIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "projectId inválido", code: "BAD_REQUEST" });
      }
      const { projectId } = parsed.data;

      const [project] = await fastify.db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) {
        return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });
      }

      const rows = await fastify.db
        .select({
          id: funnels.id,
          name: funnels.name,
          type: funnels.type,
          campaigns: funnels.campaigns,
          googleAdsCampaigns: funnels.googleAdsCampaigns,
          sortOrder: funnels.sortOrder,
        })
        .from(funnels)
        .where(and(eq(funnels.projectId, projectId), isNull(funnels.archivedAt)))
        .orderBy(asc(funnels.type), asc(funnels.sortOrder));

      return {
        projectId,
        funnels: rows.map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type, // "launch" | "perpetual"
          metaCampaignCount: f.campaigns.length,
          googleCampaignCount: f.googleAdsCampaigns.length,
        })),
      };
    }
  );

  // ---- GET /api/public/v1/funnels/:funnelId/stages ----
  // Etapas de um funil (TOFU/MOFU/BOFU representadas por stageType + ordem).
  fastify.get<{ Params: z.infer<typeof funnelIdParamSchema> }>(
    "/api/public/v1/funnels/:funnelId/stages",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = funnelIdParamSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "funnelId inválido", code: "BAD_REQUEST" });
      }
      const { funnelId } = parsed.data;

      const [funnel] = await fastify.db
        .select({ id: funnels.id, projectId: funnels.projectId, name: funnels.name })
        .from(funnels)
        .where(eq(funnels.id, funnelId))
        .limit(1);
      if (!funnel) {
        return reply.code(404).send({ error: "Funil não encontrado", code: "NOT_FOUND" });
      }

      const rows = await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          stageType: funnelStages.stageType,
          sortOrder: funnelStages.sortOrder,
          leadGoal: funnelStages.leadGoal,
          projectionEndDate: funnelStages.projectionEndDate,
          campaigns: funnelStages.campaigns,
          googleAdsCampaigns: funnelStages.googleAdsCampaigns,
        })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId))
        .orderBy(asc(funnelStages.sortOrder));

      return {
        funnelId,
        projectId: funnel.projectId,
        funnelName: funnel.name,
        stages: rows.map((s) => ({
          id: s.id,
          name: s.name,
          stageType: s.stageType, // "paid" | "free" | "sales" | "cpl"
          sortOrder: s.sortOrder,
          leadGoal: s.leadGoal,
          projectionEndDate: s.projectionEndDate,
          metaCampaignCount: s.campaigns.length,
          googleCampaignCount: s.googleAdsCampaigns.length,
        })),
      };
    }
  );
});
