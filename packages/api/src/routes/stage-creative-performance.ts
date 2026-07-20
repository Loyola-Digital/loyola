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
  publicMetricsCache,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { fetchAllAdInsights, fetchCampaignInsights } from "../services/meta-ads.js";
import { getAdEffectiveStatusFromDb } from "../services/meta-db-source.js";
import { getMetaAccountForProject } from "../services/traffic-analytics.js";
import {
  computeCreativeSalesMetrics,
  type CreativeSalesMetrics,
} from "../utils/creative-sales-metrics.js";

const paramsSchema = z.object({
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  // refresh=1 ignora o cache e recomputa ao vivo (botão Atualizar).
  refresh: z.coerce.boolean().optional().default(false),
});

// Cache DB-first (Story perf): este endpoint chama a Meta AO VIVO
// (fetchAllAdInsights + fetchCampaignInsights) + lê 2 planilhas por request —
// caro e lento a cada abertura do dash. Guardamos a resposta montada em
// public_metrics_cache e servimos instantâneo por CACHE_TTL. A 1ª abertura
// (ou refresh) paga; as próximas leem do banco. Zero mudança nos números.
const CREATIVE_PERF_SCOPE = "creative-performance";
// TTL longo: depois de semeado uma vez, o dash abre INSTANTÂNEO por 2h sem
// re-bater na Meta (o botão Atualizar força fresco na hora). Evita o "loading
// infinito" que vinha de recomputar ao vivo a cada abertura.
const CREATIVE_PERF_TTL_MS = 2 * 60 * 60 * 1000; // 2h
// Orçamento de tempo pras chamadas à Meta: sob rate limit elas retentam com
// backoff (até minutos) e o request ficava preso. Estourou → serve o cache
// vencido (se houver) e não trava o usuário.
const META_FETCH_BUDGET_MS = 25_000;

class MetaBudgetExceeded extends Error {
  constructor() {
    super("Meta fetch excedeu o orçamento de tempo");
    this.name = "MetaBudgetExceeded";
  }
}

function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new MetaBudgetExceeded()), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

interface CreativePerformanceResponse {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
  utmTerm: string | null;
  // Story 18.46: identificação de LP (AC3) e LP View real (AC4)
  campaignName: string | null;
  landingPageViews: number;
  // Story 18.55: Único/Total por criativo (só quando revenueSource=sale_content;
  // regras da 18.51a espelhadas em utils/creative-sales-metrics.ts)
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueTotal?: number;
  revenueUnico?: number;
  // Story 18.61: estado atual do criativo na Meta, agregado por regra OR sobre
  // os ad_ids do grupo. "active" se ≥1 ad_id ACTIVE; "paused" se todos os ad_ids
  // conhecidos são não-ACTIVE; "unknown" quando nenhum ad_id tem status no cache.
  status?: "active" | "paused" | "unknown";
  // Story 18.61: adset_name distintos dos ad_ids ativos (tooltip). Só presente
  // quando status === "active".
  activeAdsets?: string[];
}

/**
 * Story 18.46 (AC4): extrai Landing Page Views do array `actions` do Meta Ads.
 * Meta retorna `{ action_type: "landing_page_view", value: "123" }`.
 */
function parseLandingPageViews(
  actions: { action_type: string; value: string }[] | undefined,
): number {
  if (!actions) return 0;
  const lpv = actions.find((a) => a.action_type === "landing_page_view");
  return lpv ? parseNumber(lpv.value) : 0;
}

/**
 * Story 18.59 (AC3/AC4): extrai Cliques no Link do array `actions` do Meta Ads.
 * Meta retorna `{ action_type: "link_click", value: "22" }`. Igual à seção de
 * LPs (que usa inline_link_clicks), o CTR/CPC dos criativos deve usar cliques
 * no link — `ad.clicks` (cliques totais: perfil, reações etc.) inflava o
 * denominador e distorcia o CTR vs Gerenciador de Anúncios.
 */
function parseLinkClicks(
  actions: { action_type: string; value: string }[] | undefined,
): number {
  if (!actions) return 0;
  const lc = actions.find((a) => a.action_type === "link_click");
  return lc ? parseNumber(lc.value) : 0;
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

/**
 * Story 18.50: extrai LP (lpX no nome → LPA se ausente, decisão Danilo) e
 * temperatura (hot/cold/unknown) do nome da campanha. É a MESMA regra usada
 * pelo corte de spend (lpBreakdown) e pela atribuição de vendas (via co= →
 * campanha do anúncio), garantindo que spend e faturamento batam por LP.
 */
function lpAndTempFromCampaignName(campaignName: string | null | undefined): {
  lpName: string;
  temperature: "hot" | "cold" | "unknown";
} {
  const cn = (campaignName || "").toLowerCase();
  const m = cn.match(/lp([a-z])/);
  const lpName = m ? `LP${m[1].toUpperCase()}` : "LPA";
  const temperature: "hot" | "cold" | "unknown" = cn.includes("hot")
    ? "hot"
    : cn.includes("cold")
      ? "cold"
      : "unknown";
  return { lpName, temperature };
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
      const { days, refresh } = queryResult.data;
      const cacheKey = `${stageId}:${days}`;
      // Fora do try pra o catch (serve-stale-on-error) enxergar.
      let staleCached: { payload: unknown; computedAt: Date } | null = null;

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
          .select({
            id: funnels.id,
            projectId: funnels.projectId,
            campaigns: funnels.campaigns,
          })
          .from(funnels)
          .where(eq(funnels.id, funnelId))
          .limit(1);

        if (!funnel) {
          return reply.code(404).send({ error: "Funil nao encontrado" });
        }

        // Cache DB-first: serve instantâneo se houver resposta fresca (< TTL) e
        // não for refresh. `staleCached` guarda a linha (mesmo vencida) pra usar
        // como fallback se a Meta travar/rate-limit — nunca deixar o dash preso.
        {
          const [cached] = await fastify.db
            .select({ payload: publicMetricsCache.payload, computedAt: publicMetricsCache.computedAt })
            .from(publicMetricsCache)
            .where(
              and(
                eq(publicMetricsCache.projectId, funnel.projectId),
                eq(publicMetricsCache.scope, CREATIVE_PERF_SCOPE),
                eq(publicMetricsCache.key, cacheKey),
              ),
            )
            .limit(1);
          if (cached) {
            staleCached = { payload: cached.payload, computedAt: cached.computedAt };
            if (!refresh && Date.now() - new Date(cached.computedAt).getTime() < CREATIVE_PERF_TTL_MS) {
              return reply.code(200).send({
                ...(cached.payload as Record<string, unknown>),
                _cache: { hit: true, computedAt: cached.computedAt },
              });
            }
          }
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

        // 3. Fetch insights filtrado por campaign IDs.
        // Stage pode ter campaigns proprias (override por etapa). Senao,
        // cai pra funnel.campaigns que e onde a config Meta vive no projeto.
        // Sem filtro => fetchAllAdInsights traria a conta Meta inteira (bug
        // original: tabela mostrava ads de outros lancamentos).
        const stageCampaigns = stage.campaigns ?? [];
        const funnelCampaigns = funnel.campaigns ?? [];
        const usingStage = stageCampaigns.length > 0;
        const appliedCampaigns = usingStage ? stageCampaigns : funnelCampaigns;
        const campaignIdsForFetch = appliedCampaigns.map((c) => c.id);

        // Sem campanhas configuradas em nenhum nivel -> resposta vazia.
        // Evita o pior caso (puxar TODOS os ads da conta).
        if (campaignIdsForFetch.length === 0) {
          return reply.code(200).send({
            stageId,
            stageType: stage.stageType,
            days,
            creatives: [],
            summary: { totalSpend: 0, totalLeads: 0, totalRevenue: 0 },
            appliedFilter: { source: "none" as const, campaigns: [] },
          });
        }

        const filteredAds = await withBudget(
          fetchAllAdInsights(
            metaAccount.metaAccountId,
            metaAccount.accessToken,
            days,
            campaignIdsForFetch,
          ),
          META_FETCH_BUDGET_MS,
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
        // Story 18.49: rastreia de onde veio o revenue (co= da venda vs email do lead)
        let revenueSource: "sale_content" | "lead_email" | "none" = "none";
        // Story 18.55: Único/Total por criativo — preenchido só no modo sale_content
        let creativeSaleMetrics: CreativeSalesMetrics | null = null;

        // Story 18.50: vendas/faturamento por LP×temperatura, atribuídas via
        // co= da venda → campanha do anúncio (mesma fonte de LP que o spend).
        const salesByLp = new Map<string, { vendas: number; faturamento: number }>();
        // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP×temperatura,
        // agregados dos mapas por ad_id da 18.55. Populado logo após
        // computeCreativeSalesMetrics (mesma cadeia adId → campanha → LP).
        const salesUniqueByLp = new Map<
          string,
          { ingressosUnicos: number; ingressosTotais: number; revenueUnico: number; revenueTotal: number }
        >();
        // Story 18.50: mapa ad_id → campaign_name (dos insights do Meta) pra
        // herdar a LP da venda a partir do co=. Vendas cujo co= não casa com
        // anúncio do stage (orgânico/recuperação) ficam de fora naturalmente.
        const campaignByAdId = new Map<string, string>();
        for (const ad of filteredAds) {
          const aid = normalizeNumericId(ad.ad_id || "");
          if (aid && ad.campaign_name && !campaignByAdId.has(aid)) {
            campaignByAdId.set(aid, ad.campaign_name);
          }
        }

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

          // Debug: Log sheet data info
          if (leadsData) {
            fastify.log.info({
              debug: "creative-performance",
              stageId,
              stageType: stage.stageType,
              leadsSheetRows: leadsData.rows.length,
              leadsSheetHeaders: leadsData.headers,
              leadsColumnMapping: leadsSheet.columnMapping,
            });
          } else {
            fastify.log.info({
              debug: "creative-performance",
              stageId,
              stageType: stage.stageType,
              message: "leadsData is null after readSheetData",
            });
          }

          if (leadsData) {
            const leadsMapping = (leadsSheet.columnMapping ?? {}) as {
              email?: string;
              utm_content?: string;
              utm_term?: string;
            };
            const salesMapping = salesData && salesSheet ? (salesSheet.columnMapping as {
              email: string;
              transactionId?: string;
              valorBruto?: string;
              valorLiquido?: string;
              utm_content?: string;
              // Story 18.55: produto (order bump) e data (compra mais recente)
              productName?: string;
              dataVenda?: string;
            }) : null;

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
            const saleEmailIdx = salesMapping ? findCol(salesData!.headers, salesMapping.email) : -1;
            const saleBrutoIdx = salesMapping ? findCol(salesData!.headers, salesMapping.valorBruto) : -1;
            const saleLiquidoIdx = salesMapping ? findCol(salesData!.headers, salesMapping.valorLiquido) : -1;
            const saleUtmContentIdx = salesMapping ? findCol(salesData!.headers, salesMapping.utm_content) : -1;
            const saleTxIdx = salesMapping ? findCol(salesData!.headers, salesMapping.transactionId) : -1;
            // Story 18.55: colunas de produto (order bump) e data da venda
            const saleProductIdx = salesMapping ? findCol(salesData!.headers, salesMapping.productName) : -1;
            const saleDataIdx = salesMapping ? findCol(salesData!.headers, salesMapping.dataVenda) : -1;

            // 5a-bis. Story 18.49: atribuição DIRETA de revenue pelo `co=`
            // (utm_content) da própria VENDA → ad_id → ad_name. Resolve
            // Faturamento/ROAS zerados na Paga: o comprador frequentemente NÃO é
            // um lead popup, então o cruzamento por email do lead (5a/5b) falhava
            // e o revenue caía pra 0. A planilha de vendas (`n8n-kiwify-captação`)
            // já tem `co=`, `valorBruto` e a chave de dedup (transactionId/email,
            // mesma estratégia da Story 18.48 — recompras acumulam, não duplicam).
            // Quando há `co=` na venda, esta fonte SUBSTITUI o cruzamento por
            // email (evita dupla contagem). Sem `co=`, mantém o fallback legacy.
            let revenueFromSaleContent = false;
            if (salesData && salesMapping && saleUtmContentIdx !== -1) {
              // Story 18.50: contabiliza 1 venda (dedupada) na LP herdada do
              // co= → campanha do anúncio. Vendas sem co= que case com anúncio
              // do stage ficam fora (orgânico/recuperação não têm campanha paga).
              const attributeSaleToLp = (adId: string, value: number) => {
                const campaignName = campaignByAdId.get(adId);
                if (!campaignName) return;
                const { lpName, temperature } = lpAndTempFromCampaignName(campaignName);
                const key = `${lpName}__${temperature}`;
                const agg = salesByLp.get(key) ?? { vendas: 0, faturamento: 0 };
                agg.vendas += 1;
                agg.faturamento += value;
                salesByLp.set(key, agg);
              };
              // dedup por transactionId (preferido) ou email — espelha a 18.48.
              // Story 18.55: este loop agora alimenta SÓ a atribuição por LP
              // (18.50, semântica intacta). O revenue por criativo passou pro
              // computeCreativeSalesMetrics abaixo (Fat. Total linha-a-linha).
              const saleDedup = new Map<string, { adId: string; value: number }>();
              for (const row of salesData.rows) {
                const adId = normalizeNumericId(row[saleUtmContentIdx] ?? "");
                if (!adId) continue;
                const bruto = saleBrutoIdx !== -1 ? parseNumber(row[saleBrutoIdx]) : 0;
                const liquido = saleLiquidoIdx !== -1 ? parseNumber(row[saleLiquidoIdx]) : 0;
                const value = bruto > 0 ? bruto : liquido;
                if (value <= 0) continue;

                const email = saleEmailIdx !== -1 ? normalizeEmail(row[saleEmailIdx] ?? "") : "";
                const txId = saleTxIdx !== -1 ? (row[saleTxIdx] ?? "").trim() : "";
                const dedupKey = txId ? `tx|${txId}` : email ? `email|${email}` : null;

                if (!dedupKey) {
                  // sem chave de dedup → atribui direto (não há como deduplicar)
                  attributeSaleToLp(adId, value);
                  continue;
                }
                const existing = saleDedup.get(dedupKey);
                if (existing) {
                  existing.value += value; // recompra: acumula no mesmo registro
                  existing.adId = adId; // last-write do ad (espelha lastDate da 18.48)
                } else {
                  saleDedup.set(dedupKey, { adId, value });
                }
              }
              for (const { adId, value } of saleDedup.values()) {
                attributeSaleToLp(adId, value);
              }

              // Story 18.55: Único/Total por criativo (regras 18.51a).
              creativeSaleMetrics = computeCreativeSalesMetrics(
                salesData.rows,
                {
                  utmContent: saleUtmContentIdx,
                  email: saleEmailIdx,
                  bruto: saleBrutoIdx,
                  liquido: saleLiquidoIdx,
                  tx: saleTxIdx,
                  product: saleProductIdx,
                  date: saleDataIdx,
                },
                (salesSheet.orderBumpProducts as string[] | null) ?? [],
              );
              // AC1: revenue legado = Fat. Total. Vs 18.49: recompra deixa de
              // acumular no último ad (last-write) — cada compra fica no
              // criativo do próprio co=. Total do stage inalterado.
              for (const [adId, v] of creativeSaleMetrics.revenueTotalByAdId) {
                revenueByAdId.set(adId, v);
              }
              // Story 18.60: agrega os 4 mapas por ad_id (18.55) em LP×temperatura,
              // reusando a mesma cadeia adId → campanha → LP do attributeSaleToLp.
              // O ÚNICO já foi resolvido a 1 adId por email em
              // computeCreativeSalesMetrics, então somar por LP não duplica.
              const addUniqueToLp = (
                adIdMap: Map<string, number>,
                field: "ingressosUnicos" | "ingressosTotais" | "revenueUnico" | "revenueTotal",
              ) => {
                for (const [adId, val] of adIdMap) {
                  const campaignName = campaignByAdId.get(adId);
                  if (!campaignName) continue;
                  const { lpName, temperature } = lpAndTempFromCampaignName(campaignName);
                  const key = `${lpName}__${temperature}`;
                  const agg = salesUniqueByLp.get(key) ?? {
                    ingressosUnicos: 0,
                    ingressosTotais: 0,
                    revenueUnico: 0,
                    revenueTotal: 0,
                  };
                  agg[field] += val;
                  salesUniqueByLp.set(key, agg);
                }
              };
              addUniqueToLp(creativeSaleMetrics.ingressosTotaisByAdId, "ingressosTotais");
              addUniqueToLp(creativeSaleMetrics.ingressosUnicosByAdId, "ingressosUnicos");
              addUniqueToLp(creativeSaleMetrics.revenueTotalByAdId, "revenueTotal");
              addUniqueToLp(creativeSaleMetrics.revenueUnicoByAdId, "revenueUnico");
              revenueFromSaleContent = true;
              revenueSource = "sale_content";
            }

            // 5a. Agrega vendas por email (bruto preferido; liquido como fallback)
            // Fallback legacy (Gratuita / planilhas sem `co=`): cruza email do
            // lead × venda. Só roda quando NÃO atribuímos via `co=` da venda.
            const salesByEmail = new Map<string, number>();
            if (!revenueFromSaleContent && salesData && salesMapping && saleEmailIdx !== -1) {
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
            // captura moda do utm_term por adId e filtra por utm_campaign.
            fastify.log.info({
              debug: "creative-performance-leads-walk",
              stageId,
              leadUtmContentIdx,
              totalLeadsRows: leadsData.rows.length,
            });

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

                // Revenue (fallback legacy): dedup por email dentro do ad.
                // Story 18.49: pulado quando o revenue veio do `co=` da venda.
                if (!revenueFromSaleContent && !agg.emails.has(email)) {
                  agg.emails.add(email);
                  const saleValue = salesByEmail.get(email);
                  if (saleValue && saleValue > 0) {
                    revenueByAdId.set(
                      adId,
                      (revenueByAdId.get(adId) ?? 0) + saleValue,
                    );
                    revenueSource = "lead_email";
                  }
                }
              }
            }
          }
        }

        // 6. Agrupa por ad_name (mesmo padrao da Top Creatives Gallery).
        // Quando o mesmo criativo e usado em N adsets, Meta cria N ad_ids
        // distintos com mesmo ad_name. Agrupar por ad_id quebra essa visao
        // (mesmo nome aparece N vezes). Agrupar por ad_name consolida no
        // criativo unico — match com a galeria.
        type AdNameGroup = {
          adName: string;
          adIds: string[]; // pra cruzamento com leads/revenue
          spend: number;
          impressions: number;
          clicks: number;
          // Story 18.46: campaign_name (AC3) e landing_page_view agregado (AC4)
          campaignName: string | null;
          landingPageViews: number;
        };
        const groupedByName = new Map<string, AdNameGroup>();

        // Story 18.61: adset_name por ad_id (dos insights já buscados — sem novo
        // I/O à Meta) para o tooltip "Ativo em: <adsets>" (AC4).
        const adsetNameByAdId = new Map<string, string>();

        for (const ad of filteredAds) {
          const adId = ad.ad_id || "";
          const adName = (ad.ad_name || "").trim() || "(sem nome)";
          if (!adId) continue;

          if (ad.adset_name && !adsetNameByAdId.has(adId)) {
            adsetNameByAdId.set(adId, ad.adset_name);
          }

          let group = groupedByName.get(adName);
          if (!group) {
            group = {
              adName,
              adIds: [],
              spend: 0,
              impressions: 0,
              clicks: 0,
              campaignName: null,
              landingPageViews: 0,
            };
            groupedByName.set(adName, group);
          }
          group.adIds.push(adId);

          const spend = parseFloat(ad.spend || "0");
          const impressions = parseFloat(ad.impressions || "0");
          // Story 18.59 (AC3): cliques no link (action link_click já buscada) em
          // vez de ad.clicks (totais) — alinha CTR/CPC ao Gerenciador e à tabela
          // de LPs. Zero chamadas novas à Meta API (AC4).
          const clicks = parseLinkClicks(ad.actions);

          if (!isNaN(spend)) group.spend += spend;
          if (!isNaN(impressions)) group.impressions += impressions;
          if (!isNaN(clicks)) group.clicks += clicks;

          // Story 18.46: captura campaign_name (primeiro não-vazio) e soma LP Views
          if (!group.campaignName && ad.campaign_name) {
            group.campaignName = ad.campaign_name;
          }
          group.landingPageViews += parseLandingPageViews(ad.actions);
        }

        // Story 18.61: estado atual (effective_status) por ad_id, lido do cache
        // (meta_entity_names_cache, entity_type='ad'). NUNCA chama a Meta no
        // request do dashboard (regra batch+cache) — o backfill de nomes mantém
        // o status quente. Ausência de status = "unknown" → "—" no frontend.
        const allAdIds = filteredAds
          .map((ad) => ad.ad_id || "")
          .filter((id) => id.length > 0);
        const statusByAdId = await getAdEffectiveStatusFromDb(
          fastify.db,
          funnel.projectId,
          allAdIds,
        );

        // 7. Monta resposta — uma linha por ad_name.
        // O filtro de campanha ja foi aplicado no fetchAllAdInsights (Meta API
        // filtra por campaign.id deterministicamente).
        // Leads/revenue/utmTerm consolidam de TODOS os ad_ids que compartilham
        // o mesmo nome (mesma logica da Top Creatives Gallery).
        const creatives: CreativePerformanceResponse[] = [];
        for (const group of groupedByName.values()) {
          let totalLeads = 0;
          let totalRevenue = 0;
          // Story 18.55: Único/Total consolidados de todos os ad_ids do grupo
          let groupIngressosUnicos = 0;
          let groupIngressosTotais = 0;
          let groupRevenueTotal = 0;
          let groupRevenueUnico = 0;
          const aggregatedTermCounts = new Map<string, number>();

          for (const adId of group.adIds) {
            const leadsAgg = leadsByAdId.get(adId);
            if (leadsAgg) {
              totalLeads += leadsAgg.count;
              for (const [term, count] of leadsAgg.utmTermCounts.entries()) {
                aggregatedTermCounts.set(
                  term,
                  (aggregatedTermCounts.get(term) ?? 0) + count,
                );
              }
            }
            totalRevenue += revenueByAdId.get(adId) ?? 0;
            if (creativeSaleMetrics) {
              groupIngressosUnicos += creativeSaleMetrics.ingressosUnicosByAdId.get(adId) ?? 0;
              groupIngressosTotais += creativeSaleMetrics.ingressosTotaisByAdId.get(adId) ?? 0;
              groupRevenueTotal += creativeSaleMetrics.revenueTotalByAdId.get(adId) ?? 0;
              groupRevenueUnico += creativeSaleMetrics.revenueUnicoByAdId.get(adId) ?? 0;
            }
          }

          // Determina topUtmTerm (moda) sobre o conjunto agregado
          let topUtmTerm: string | null = null;
          if (aggregatedTermCounts.size > 0) {
            let bestCount = -1;
            for (const [term, count] of aggregatedTermCounts.entries()) {
              if (count > bestCount) {
                bestCount = count;
                topUtmTerm = term;
              }
            }
          }

          // Story 18.61: regra OR de status por ad_name. "active" se ALGUM ad_id
          // do grupo estiver ACTIVE; "paused" se todos os ad_ids conhecidos são
          // não-ACTIVE; "unknown" quando NENHUM ad_id tem status no cache.
          const activeAdIds = group.adIds.filter(
            (id) => statusByAdId.get(id) === "ACTIVE",
          );
          const knownAdIds = group.adIds.filter((id) => statusByAdId.has(id));
          let status: "active" | "paused" | "unknown";
          if (activeAdIds.length > 0) status = "active";
          else if (knownAdIds.length > 0) status = "paused";
          else status = "unknown";
          // adset_name distintos dos ad_ids ativos (tooltip AC4) — só quando Ativo.
          const activeAdsets =
            status === "active"
              ? Array.from(
                  new Set(
                    activeAdIds
                      .map((id) => adsetNameByAdId.get(id))
                      .filter((n): n is string => !!n),
                  ),
                )
              : [];

          // adId representativo = primeiro adId do grupo (uso pra link Ads Library)
          creatives.push({
            adId: group.adIds[0],
            adName: group.adName,
            spend: group.spend,
            impressions: group.impressions,
            clicks: group.clicks,
            leads: totalLeads,
            revenue: totalRevenue,
            utmTerm: topUtmTerm,
            campaignName: group.campaignName,
            landingPageViews: group.landingPageViews,
            // Story 18.61: status agregado (OR) + adsets ativos (aditivo)
            status,
            ...(activeAdsets.length > 0 ? { activeAdsets } : {}),
            // Story 18.55: só no modo sale_content (senão os campos ficam fora
            // da resposta e o frontend mantém o comportamento legado)
            ...(creativeSaleMetrics
              ? {
                  ingressosUnicos: groupIngressosUnicos,
                  ingressosTotais: groupIngressosTotais,
                  revenueTotal: groupRevenueTotal,
                  revenueUnico: groupRevenueUnico,
                }
              : {}),
          });
        }

        const totalSpend = creatives.reduce((s, c) => s + (c.spend || 0), 0);
        const totalLeads = creatives.reduce((s, c) => s + (c.leads || 0), 0);
        const totalRevenue = creatives.reduce((s, c) => s + (c.revenue || 0), 0);

        // Story 18.46: corte por LP (campaign_name contém lpX) × temperatura.
        // Usa insights por CAMPANHA (não por ad): no nível de ad o Meta infla
        // link_click (conta cliques por adset/posicionamento sem dedup), o que
        // divergia do card de Connect Rate do funil. O nível campanha bate com
        // o card (mesma fonte: useCampaignDailyInsightsBulk). NÃO altera `creatives`.
        type LpBreakdownRow = {
          lpName: string; // "LPA"
          temperature: "hot" | "cold" | "unknown";
          spend: number;
          clicks: number;
          impressions: number;
          landingPageViews: number;
          // Story 18.50: vendas/faturamento por LP (atribuídos via co= → campanha)
          vendas: number;
          faturamento: number;
          // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP (18.55 por ad_id → LP)
          ingressosUnicos?: number;
          ingressosTotais?: number;
          revenueUnico?: number;
          revenueTotal?: number;
        };
        const campaignInsights = await withBudget(
          fetchCampaignInsights(
            metaAccount.metaAccountId,
            metaAccount.accessToken,
            days,
            undefined,
            undefined,
            campaignIdsForFetch, // Story 18.46: filtra na query (traz lpc/lpd de baixo volume)
          ),
          META_FETCH_BUDGET_MS,
        );
        const allowedCampaignIds = new Set(campaignIdsForFetch);
        const lpBreakdownMap = new Map<string, LpBreakdownRow>();
        for (const ci of campaignInsights) {
          // Só campanhas do funil/stage (mesmo conjunto do fetch de ads)
          if (allowedCampaignIds.size > 0 && !allowedCampaignIds.has(ci.campaign_id)) continue;
          const cn = (ci.campaign_name || "").toLowerCase();
          const m = cn.match(/lp([a-z])/);
          // Sem lpX no campaign_name → LPA (decisão Danilo 2026-06-12)
          const lpName = m ? `LP${m[1].toUpperCase()}` : "LPA";
          const temperature: "hot" | "cold" | "unknown" = cn.includes("hot")
            ? "hot"
            : cn.includes("cold")
              ? "cold"
              : "unknown";
          const key = `${lpName}__${temperature}`;
          let agg = lpBreakdownMap.get(key);
          if (!agg) {
            agg = { lpName, temperature, spend: 0, clicks: 0, impressions: 0, landingPageViews: 0, vendas: 0, faturamento: 0 };
            lpBreakdownMap.set(key, agg);
          }
          const s = parseFloat(ci.spend || "0");
          const i = parseFloat(ci.impressions || "0");
          if (!isNaN(s)) agg.spend += s;
          if (!isNaN(i)) agg.impressions += i;
          // Story 18.46: "Inline Link Clicks" do nível campanha — bate com o
          // que o gestor exporta do Ads Manager (ex: 4075 no total).
          const ilc = parseFloat(ci.inline_link_clicks || "0");
          if (!isNaN(ilc)) agg.clicks += ilc;
          agg.landingPageViews += parseLandingPageViews(ci.actions);
        }
        // Story 18.50: injeta vendas/faturamento por LP×temperatura (atribuídos
        // via co= → campanha). Cria linha nova se a LP só tem venda e nenhum
        // spend no corte por campanha (raro, mas mantém o faturamento visível).
        for (const [key, sv] of salesByLp.entries()) {
          let agg = lpBreakdownMap.get(key);
          if (!agg) {
            const [lpName, temperature] = key.split("__");
            agg = {
              lpName,
              temperature: temperature as "hot" | "cold" | "unknown",
              spend: 0,
              clicks: 0,
              impressions: 0,
              landingPageViews: 0,
              vendas: 0,
              faturamento: 0,
            };
            lpBreakdownMap.set(key, agg);
          }
          agg.vendas += sv.vendas;
          agg.faturamento += sv.faturamento;
        }
        // Story 18.60: injeta Ing. Únicos/Totais + Fat. Único/Total por LP×temperatura.
        for (const [key, uv] of salesUniqueByLp.entries()) {
          let agg = lpBreakdownMap.get(key);
          if (!agg) {
            const [lpName, temperature] = key.split("__");
            agg = {
              lpName,
              temperature: temperature as "hot" | "cold" | "unknown",
              spend: 0,
              clicks: 0,
              impressions: 0,
              landingPageViews: 0,
              vendas: 0,
              faturamento: 0,
            };
            lpBreakdownMap.set(key, agg);
          }
          agg.ingressosUnicos = (agg.ingressosUnicos ?? 0) + uv.ingressosUnicos;
          agg.ingressosTotais = (agg.ingressosTotais ?? 0) + uv.ingressosTotais;
          agg.revenueUnico = (agg.revenueUnico ?? 0) + uv.revenueUnico;
          agg.revenueTotal = (agg.revenueTotal ?? 0) + uv.revenueTotal;
        }
        const lpBreakdown = Array.from(lpBreakdownMap.values());

        const payload = {
          stageId,
          stageType: stage.stageType,
          days,
          creatives,
          lpBreakdown,
          summary: {
            totalSpend,
            totalLeads,
            totalRevenue,
          },
          // Transparencia: mostra ao frontend qual filtro de campanha foi
          // aplicado, pra usuario poder validar que esta vendo o conjunto certo.
          appliedFilter: {
            source: usingStage ? ("stage" as const) : ("funnel" as const),
            campaigns: appliedCampaigns,
          },
          // DEBUG: Include debug info in response for troubleshooting zero leads
          _debug: {
            leadsSheetExists: !!leadsSheet,
            salesSheetExists: !!salesSheet,
            // Story 18.49: fonte do revenue (co= da venda vs email do lead)
            revenueSource,
            revenueByAdIdCount: revenueByAdId.size,
            totalRevenue,
            leadsByAdIdCount: leadsByAdId.size,
            leadsByAdId: Array.from(leadsByAdId.entries()).map(([adId, agg]) => ({
              adId,
              count: agg.count,
            })),
          },
        };

        // Grava no cache (upsert) pra as próximas aberturas do dash serem
        // instantâneas. Fire-and-forget: falha de cache não derruba a resposta.
        const now = new Date();
        void fastify.db
          .insert(publicMetricsCache)
          .values({ projectId: funnel.projectId, scope: CREATIVE_PERF_SCOPE, key: cacheKey, payload, computedAt: now })
          .onConflictDoUpdate({
            target: [publicMetricsCache.projectId, publicMetricsCache.scope, publicMetricsCache.key],
            set: { payload, computedAt: now },
          })
          .catch((err) => fastify.log.error({ err }, "[creative-performance] falha ao gravar cache"));

        return reply.code(200).send({ ...payload, _cache: { hit: false, computedAt: now } });
      } catch (error) {
        // Serve-stale-on-error: se a Meta travou/rate-limit (orçamento estourado)
        // ou qualquer falha, devolve o cache vencido em vez de 500 — o dash NÃO
        // fica preso em "loading infinito". Fresco vem no próximo Atualizar.
        if (staleCached) {
          fastify.log.warn(
            { err: error instanceof Error ? error.message : String(error) },
            "[creative-performance] falha ao computar ao vivo — servindo cache vencido",
          );
          return reply.code(200).send({
            ...(staleCached.payload as Record<string, unknown>),
            _cache: { hit: true, stale: true, computedAt: staleCached.computedAt },
          });
        }
        fastify.log.error(error);
        // Sem cache algum + falha na Meta: resposta vazia graciosa (não 500 —
        // o frontend mostra "sem dados" em vez de girar/retentar infinito).
        return reply.code(200).send({
          stageId,
          days,
          creatives: [],
          lpBreakdown: [],
          summary: { totalSpend: 0, totalLeads: 0, totalRevenue: 0 },
          _cache: { hit: false, error: true },
        });
      }
    },
  );
});
