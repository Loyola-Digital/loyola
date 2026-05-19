/**
 * Story 18.24: Endpoint para Desempenho de Criativos por Stage
 * GET /api/funnels/:funnelId/stages/:stageId/creative-performance
 *
 * Retorna lista de criativos (ads) com métricas agregadas para um stage específico.
 * Dados vêm de Meta Ads Insights, filtrados por stage_id = Paid.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages } from "../db/schema.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

// ============================================================
// TYPES
// ============================================================

interface CreativePerformanceResponse {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
  utmTerm: string | null;
}

// ============================================================
// ROUTE
// ============================================================

export default fp(async function stageCreativePerformanceRoutes(fastify) {
  fastify.get<{ Params: z.infer<typeof paramsSchema>; Querystring: z.infer<typeof querySchema> }>(
    "/api/funnels/:funnelId/stages/:stageId/creative-performance",
    async (request, reply) => {
      // Parse params
      const paramsResult = paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: "Parametros inválidos",
          details: paramsResult.error.flatten().fieldErrors,
        });
      }

      const { funnelId, stageId } = paramsResult.data;

      // Parse query
      const queryResult = querySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: "Query inválido",
          details: queryResult.error.flatten().fieldErrors,
        });
      }

      const { days } = queryResult.data;

      try {
        // Validar que stage pertence ao funil
        const stage = await fastify.db
          .select()
          .from(funnelStages)
          .where(and(eq(funnelStages.id, stageId), eq(funnelStages.funnelId, funnelId)))
          .limit(1);

        if (!stage.length) {
          return reply.code(404).send({ error: "Stage não encontrado" });
        }

        // Validar que funil existe
        const funnel = await fastify.db
          .select()
          .from(funnels)
          .where(eq(funnels.id, funnelId))
          .limit(1);

        if (!funnel.length) {
          return reply.code(404).send({ error: "Funil não encontrado" });
        }

        /**
         * TODO: Story 18.24 — Implementar busca de dados de criativos
         *
         * Atualmente retorna array vazio. Próximas etapas:
         * 1. Buscar Meta Ads accounts ligados ao projeto
         * 2. Chamar Meta Ads API com filtros:
         *    - date_range: últimos `days`
         *    - stage_id: "Paid" (ou stage.stageType)
         * 3. Agregar por meta_adid
         * 4. Mapear resposta para CreativePerformanceResponse[]
         *
         * Exemplo de response structure esperado:
         * {
         *   "adId": "123456789",
         *   "adName": "Ad Creative Jan 2026",
         *   "spend": 5000.00,
         *   "impressions": 50000,
         *   "clicks": 1500,
         *   "leads": 300,
         *   "revenue": 15000.00,
         *   "utmTerm": "hot-audience-jan"
         * }
         */
        const creatives: CreativePerformanceResponse[] = [];

        return reply.code(200).send({
          stageId,
          stageType: stage[0].stageType,
          days,
          creatives,
          summary: {
            totalSpend: creatives.reduce((sum, c) => sum + c.spend, 0),
            totalLeads: creatives.reduce((sum, c) => sum + c.leads, 0),
            totalRevenue: creatives.reduce((sum, c) => sum + c.revenue, 0),
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: "Erro ao buscar dados de criativos",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
});
