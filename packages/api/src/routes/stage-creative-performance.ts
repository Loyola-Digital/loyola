/**
 * Story 18.24: Endpoint para Desempenho de Criativos por Stage
 * GET /api/funnels/:funnelId/stages/:stageId/creative-performance
 *
 * Cruza Meta Ads Insights (spend/impressions/clicks/ad_name) com a planilha
 * de leads (utm_content → ad_id, utm_term, email) e a planilha de vendas
 * (email → faturamento) pra montar a tabela de desempenho por criativo.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnels,
  funnelStages,
  funnelSpreadsheets,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { fetchAllAdInsights } from "../services/meta-ads.js";
import { getMetaAccountForProject } from "../services/traffic-analytics.js";

const paramsSchema = z.object({
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

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

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Espelho do helper do creative-revenue.ts: planilhas exportadas do Google
 * Sheets as vezes prefixam IDs numéricos com `_` (forçar texto). Limpa pra
 * cruzar com ad_id puro do Meta.
 */
function normalizeNumericId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("_")) {
    const rest = trimmed.slice(1);
    if (/^\d+$/.test(rest)) return rest;
  }
  return trimmed;
}

export default fp(async function stageCreativePerformanceRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/funnels/:funnelId/stages/:stageId/creative-performance",
    async (request, reply) => {
      const paramsResult = paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: "Parametros invalidos",
          details: paramsResult.error.flatten().fieldErrors,
        });
      }
      const { funnelId, stageId } = paramsResult.data;

      const queryResult = querySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: "Query invalida",
          details: queryResult.error.flatten().fieldErrors,
        });
      }
      const { days } = queryResult.data;

      try {
        // 1. Valida stage dentro do funil + obtem projectId do funil
        const [stage] = await fastify.db
          .select({
            id: funnelStages.id,
            stageType: funnelStages.stageType,
            campaigns: funnelStages.campaigns,
          })
          .from(funnelStages)
          .where(
            and(eq(funnelStages.id, stageId), eq(funnelStages.funnelId, funnelId)),
          )
          .limit(1);

        if (!stage) {
          return reply.code(404).send({ error: "Stage nao encontrado" });
        }

        const [funnel] = await fastify.db
          .select({ id: funnels.id, projectId: funnels.projectId })
          .from(funnels)
          .where(eq(funnels.id, funnelId))
          .limit(1);

        if (!funnel) {
          return reply.code(404).send({ error: "Funil nao encontrado" });
        }

        // 2. Meta Ads account ligado ao projeto
        const metaAccount = await getMetaAccountForProject(
          fastify.db,
          funnel.projectId,
        );

        // Sem conta Meta → response vazio (graceful)
        if (!metaAccount) {
          return reply.code(200).send({
            stageId,
            stageType: stage.stageType,
            days,
            creatives: [],
            summary: { totalSpend: 0, totalLeads: 0, totalRevenue: 0 },
          });
        }

        // 3. Fetch insights dos ads, filtrado pelos campaigns do stage
        const stageCampaignIds = (stage.campaigns || []).map((c) => c.id);
        const filteredAds = await fetchAllAdInsights(
          metaAccount.metaAccountId,
          metaAccount.accessToken,
          days,
          stageCampaignIds.length > 0 ? stageCampaignIds : undefined,
        );

        // 4. Planilhas de leads e vendas do stage (mesmo padrao do creative-revenue)
        const [leadsSheet] = await fastify.db
          .select()
          .from(funnelSpreadsheets)
          .where(
            and(
              eq(funnelSpreadsheets.stageId, stageId),
              eq(funnelSpreadsheets.type, "leads"),
            ),
          )
          .limit(1);

        const [salesSheet] = await fastify.db
          .select()
          .from(stageSalesSpreadsheets)
          .where(
            and(
              eq(stageSalesSpreadsheets.stageId, stageId),
              eq(stageSalesSpreadsheets.subtype, "capture"),
            ),
          )
          .limit(1);

        // 5. Indices de adId → leads/revenue/utmTerm. Vazios quando nao ha
        // planilhas — nesse caso retornamos so spend/impressions/clicks do Meta.
        const leadsByAdId = new Map<
          string,
          { count: number; emails: Set<string>; utmTermCounts: Map<string, number> }
        >();
        const revenueByAdId = new Map<string, number>();

        if (leadsSheet && salesSheet) {
          let leadsData, salesData;
          try {
            [leadsData, salesData] = await Promise.all([
              readSheetData(leadsSheet.spreadsheetId, leadsSheet.sheetName),
              readSheetData(salesSheet.spreadsheetId, salesSheet.sheetName),
            ]);
          } catch (err) {
            fastify.log.warn(
              { err },
              "creative-performance: falha lendo planilhas — seguindo com leads=0",
            );
            leadsData = null;
            salesData = null;
          }

          if (leadsData && salesData) {
            const leadsMapping = (leadsSheet.columnMapping ?? {}) as {
              email?: string;
              utm_content?: string;
              utm_term?: string;
            };
            const salesMapping = salesSheet.columnMapping as {
              email: string;
              valorBruto?: string;
              valorLiquido?: string;
            };

            function findCol(headers: string[], name: string | undefined): number {
              if (!name) return -1;
              const normalized = name.trim().toLowerCase();
              return headers.findIndex(
                (h) => h.trim().toLowerCase() === normalized,
              );
            }

            const leadEmailIdx = findCol(leadsData.headers, leadsMapping.email);
            const leadUtmContentIdx = findCol(
              leadsData.headers,
              leadsMapping.utm_content,
            );
            const leadUtmTermIdx = findCol(leadsData.headers, leadsMapping.utm_term);
            const saleEmailIdx = findCol(salesData.headers, salesMapping.email);
            const saleBrutoIdx = findCol(salesData.headers, salesMapping.valorBruto);
            const saleLiquidoIdx = findCol(
              salesData.headers,
              salesMapping.valorLiquido,
            );

            // 5a. Agrega vendas por email (bruto preferido; liquido como fallback)
            const salesByEmail = new Map<string, number>();
            if (saleEmailIdx !== -1) {
              for (const row of salesData.rows) {
                const email = normalizeEmail(row[saleEmailIdx] ?? "");
                if (!email) continue;
                const bruto =
                  saleBrutoIdx !== -1 ? parseNumber(row[saleBrutoIdx]) : 0;
                const liquido =
                  saleLiquidoIdx !== -1 ? parseNumber(row[saleLiquidoIdx]) : 0;
                const value = bruto > 0 ? bruto : liquido;
                salesByEmail.set(
                  email,
                  (salesByEmail.get(email) ?? 0) + value,
                );
              }
            }

            // 5b. Walk leads — conta leads por adId, dedup email pra revenue,
            // captura moda do utm_term por adId pra calculo de temperatura.
            if (leadUtmContentIdx !== -1) {
              for (const row of leadsData.rows) {
                const adIdRaw = row[leadUtmContentIdx] ?? "";
                const adId = normalizeNumericId(adIdRaw);
                if (!adId) continue;

                const email =
                  leadEmailIdx !== -1
                    ? normalizeEmail(row[leadEmailIdx] ?? "")
                    : "";
                const utmTerm =
                  leadUtmTermIdx !== -1
                    ? (row[leadUtmTermIdx] ?? "").trim()
                    : "";

                let agg = leadsByAdId.get(adId);
                if (!agg) {
                  agg = {
                    count: 0,
                    emails: new Set(),
                    utmTermCounts: new Map(),
                  };
                  leadsByAdId.set(adId, agg);
                }
                agg.count += 1;
                if (utmTerm) {
                  agg.utmTermCounts.set(
                    utmTerm,
                    (agg.utmTermCounts.get(utmTerm) ?? 0) + 1,
                  );
                }
                if (!email) continue;

                // Revenue: dedup por email dentro do ad (espelha creative-revenue)
                if (!agg.emails.has(email)) {
                  agg.emails.add(email);
                  const saleValue = salesByEmail.get(email);
                  if (saleValue && saleValue > 0) {
                    revenueByAdId.set(
                      adId,
                      (revenueByAdId.get(adId) ?? 0) + saleValue,
                    );
                  }
                }
              }
            }
          }
        }

        // 6. Agrupa por ad_name e agrega métricas
        // Map: adName → { spend, impressions, clicks, adIds, utmTermsByAdId }
        const groupedByAdName = new Map<
          string,
          {
            spend: number;
            impressions: number;
            clicks: number;
            adIds: Set<string>;
            utmTermsByAdId: Map<string, string | null>;
          }
        >();

        for (const ad of filteredAds) {
          const adName = (ad.ad_name || "(sem nome)").trim();
          let group = groupedByAdName.get(adName);

          if (!group) {
            group = {
              spend: 0,
              impressions: 0,
              clicks: 0,
              adIds: new Set(),
              utmTermsByAdId: new Map(),
            };
            groupedByAdName.set(adName, group);
          }

          const adId = ad.ad_id || "";
          if (!adId) continue;

          const spend = parseFloat(ad.spend || "0");
          const impressions = parseFloat(ad.impressions || "0");
          const clicks = parseFloat(ad.clicks || "0");

          if (!isNaN(spend)) group.spend += spend;
          if (!isNaN(impressions)) group.impressions += impressions;
          if (!isNaN(clicks)) group.clicks += clicks;

          group.adIds.add(adId);

          // Captura utmTerm para cada adId dentro do grupo
          const leadsAgg = leadsByAdId.get(adId);
          let topUtmTerm: string | null = null;
          if (leadsAgg && leadsAgg.utmTermCounts.size > 0) {
            let bestCount = -1;
            for (const [term, count] of leadsAgg.utmTermCounts.entries()) {
              if (count > bestCount) {
                bestCount = count;
                topUtmTerm = term;
              }
            }
          }
          group.utmTermsByAdId.set(adId, topUtmTerm);
        }

        // 7. Monta resposta agrupada — uma linha por ad_name
        const creatives: CreativePerformanceResponse[] = [];
        for (const [adName, group] of groupedByAdName.entries()) {
          // Agrupa leads e revenue por ad_name (soma de todos adIds no grupo)
          let totalLeads = 0;
          let totalRevenue = 0;
          const allUtmTerms = new Map<string, number>();

          for (const adId of group.adIds) {
            const leadsAgg = leadsByAdId.get(adId);
            if (leadsAgg) {
              totalLeads += leadsAgg.count;
              // Agrega contagem de utm_terms
              for (const [term, count] of leadsAgg.utmTermCounts.entries()) {
                allUtmTerms.set(term, (allUtmTerms.get(term) ?? 0) + count);
              }
            }
            const revenue = revenueByAdId.get(adId) ?? 0;
            totalRevenue += revenue;
          }

          // Determina topUtmTerm (moda agregada)
          let topUtmTerm: string | null = null;
          if (allUtmTerms.size > 0) {
            let bestCount = -1;
            for (const [term, count] of allUtmTerms.entries()) {
              if (count > bestCount) {
                bestCount = count;
                topUtmTerm = term;
              }
            }
          }

          // Usa primeiro adId como representante
          const firstAdId = Array.from(group.adIds)[0] || "";

          creatives.push({
            adId: firstAdId,
            adName,
            spend: group.spend,
            impressions: group.impressions,
            clicks: group.clicks,
            leads: totalLeads,
            revenue: totalRevenue,
            utmTerm: topUtmTerm,
          });
        }

        const totalSpend = creatives.reduce((s, c) => s + (c.spend || 0), 0);
        const totalLeads = creatives.reduce((s, c) => s + (c.leads || 0), 0);
        const totalRevenue = creatives.reduce((s, c) => s + (c.revenue || 0), 0);

        return reply.code(200).send({
          stageId,
          stageType: stage.stageType,
          days,
          creatives,
          summary: {
            totalSpend,
            totalLeads,
            totalRevenue,
          },
        });
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: "Erro ao buscar dados de criativos",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
});
