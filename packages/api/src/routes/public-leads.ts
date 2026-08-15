import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { publicMetricsCache } from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { LEAD_ORIGIN_SCOPE, resolveLeadSource } from "../services/lead-origin-sync.js";
import { SURVEY_SCOPE } from "../services/survey-aggregation.js";
import { SALES_DAILY_SCOPE } from "../services/sales-daily-sync.js";

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
        // Story 36.9 (AC5): a mensagem antiga juntava duas causas com ações
        // OPOSTAS — "sync ainda não rodou" (espere) e "stage sem survey"
        // (configure). Foi essa ambiguidade que fez o chamado de 2026-08-14
        // pedir "rodar o sync" para um problema que rodar o sync não resolvia.
        const fonte = await resolveLeadSource(fastify.db, stageId);
        return fonte
          ? {
              projectId,
              stageId,
              semDados: true,
              motivo: "sync_pendente" as const,
              message:
                "A etapa tem fonte de leads conectada, mas o cache ainda não foi computado. O sync roda diariamente; para antecipar, use scripts/backfill-lead-origin.ts.",
            }
          : {
              projectId,
              stageId,
              semDados: true,
              motivo: "etapa_sem_fonte" as const,
              message:
                "A etapa não tem planilha de leads nem pesquisa conectada. Rodar o sync não muda isso — é preciso conectar uma planilha à etapa.",
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

  // ---- GET /api/public/v1/projects/:projectId/stages/:stageId/survey ----
  // Pesquisa de qualificação (Story 36.7, Buraco 1): distribuições por pergunta
  // (profissão, renda, etc.) × origem (total/pago/orgânico) + por criativo (byAdId).
  // Réplica fiel da agregação do dashboard. Zero PII.
  fastify.get<{ Params: z.infer<typeof paramSchema> }>(
    "/api/public/v1/projects/:projectId/stages/:stageId/survey",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = paramSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId, stageId } = parsed.data;

      const [row] = await fastify.db
        .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, projectId),
            eq(publicMetricsCache.scope, SURVEY_SCOPE),
            eq(publicMetricsCache.key, stageId),
          ),
        )
        .limit(1);

      if (!row) {
        return {
          projectId,
          stageId,
          semDados: true,
          message: "Sem dados de pesquisa em cache (stage sem pesquisa conectada ou sync ainda não rodou).",
        };
      }

      // Resumão v4 #6: taxa de resposta da pesquisa — cruza com o cache de
      // leads-origin do MESMO stage (totalLeads da planilha de leads). null
      // quando o stage não tem cache de leads (sem denominador — não invente).
      const payload = row.payload as Record<string, unknown>;
      let surveyResponseRate: number | null = null;
      let totalLeads: number | null = null;
      const [leadsRow] = await fastify.db
        .select({ payload: publicMetricsCache.payload })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, projectId),
            eq(publicMetricsCache.scope, LEAD_ORIGIN_SCOPE),
            eq(publicMetricsCache.key, stageId),
          ),
        )
        .limit(1);
      const leadsPayload = leadsRow?.payload as { totalLeads?: number } | undefined;
      const totalResponses = (payload as { totalResponses?: number }).totalResponses ?? 0;
      if (leadsPayload?.totalLeads && leadsPayload.totalLeads > 0) {
        totalLeads = leadsPayload.totalLeads;
        surveyResponseRate = Math.round((totalResponses / leadsPayload.totalLeads) * 10000) / 100;
      }

      return {
        projectId,
        stageId,
        computedAt: row.computedAt,
        totalLeads,
        surveyResponseRate,
        ...payload,
      };
    },
  );

  // ---- GET /api/public/v1/projects/:projectId/stages/:stageId/sales-daily ----
  // "Dados Diários" — metade de vendas (Story 36.7, Buraco 3): faturamento +
  // ingressos por dia × origem (Pago/Org/Sem Track) + por origem. Combine com
  // /meta/v1/projects/:id/daily (investimento) para ROAS real. Zero PII.
  fastify.get<{ Params: z.infer<typeof paramSchema> }>(
    "/api/public/v1/projects/:projectId/stages/:stageId/sales-daily",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = paramSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId, stageId } = parsed.data;

      const [row] = await fastify.db
        .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
        .from(publicMetricsCache)
        .where(
          and(
            eq(publicMetricsCache.projectId, projectId),
            eq(publicMetricsCache.scope, SALES_DAILY_SCOPE),
            eq(publicMetricsCache.key, stageId),
          ),
        )
        .limit(1);

      if (!row) {
        return {
          projectId,
          stageId,
          semDados: true,
          message: "Sem dados de vendas em cache (stage sem planilha de vendas ou sync ainda não rodou).",
        };
      }

      return { projectId, stageId, computedAt: row.computedAt, ...(row.payload as Record<string, unknown>) };
    },
  );
});
