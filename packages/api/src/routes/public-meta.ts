import { z } from "zod";
import { eq, and, gte, lte, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  projects,
  funnels,
  funnelStages,
  metaAdInsightsDaily,
  metaAdCreativesCache,
} from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";
import { somarVideoMetrics } from "../services/video-metrics-agg.js";
import { AD_PERMALINK_RESOLVER_VERSION } from "../services/meta-ads.js";
import { applyMetaTax } from "../utils/meta-tax.js";
import {
  parseLeads,
  parsePurchases,
  parsePurchaseRevenue,
  parseActionCount,
  safeDiv,
  round,
} from "../utils/meta-metrics.js";

/**
 * Story 36.3 — Endpoints públicos de leitura de performance Meta Ads.
 *
 *   GET /api/public/meta/v1/projects/:projectId/campaigns
 *   GET /api/public/meta/v1/projects/:projectId/creatives
 *   GET /api/public/meta/v1/projects/:projectId/creatives/:adId/timeseries
 *
 * Lê SOMENTE dos caches (`meta_campaign_insights_daily`, `meta_ad_insights_daily`,
 * `meta_entity_names_cache`, `meta_ad_creatives_cache`) — NÃO chama a Graph API ao vivo.
 * Se faltar dado no range, retorna o que tem + `partial: true`.
 *
 * `spend` já vem COM o imposto Meta (gross-up 12,15% p/ datas ≥2026) via `applyMetaTax`,
 * porque não há frontend para aplicá-lo depois — assim bate com o dashboard interno.
 *
 * ── CONTRATO DE `videoMetrics` (Story 43.3) ─────────────────────────────────
 *
 * TODOS os campos são CONTAGENS DE EVENTOS NO PERÍODO. Nenhum é taxa.
 *
 *   views3s    reproduções de 3s — o `video_view` do Gerenciador
 *   plays      vídeo começou a tocar; EXCLUI replays
 *   p25..p100  assistiu X% do vídeo — INCLUI quem PULOU até o ponto
 *   thruplay   completou OU assistiu ≥15s (não existe `video_15_sec` separado)
 *
 * As três métricas de gancho/retenção derivam disto:
 *
 *   play do hook       = views3s ÷ impressions
 *   conversão do hook  = thruplay ÷ views3s      (thruplay É o 15s)
 *   retenção do body   = p75 ÷ views3s
 *
 * NÃO use `p25` como proxy de gancho: ele conta quem arrastou até os 25% sem
 * assistir, e sai sistematicamente maior que `views3s`.
 *
 * `views3s` e `plays` só existem em linhas sincronizadas a partir da 43.3.
 * Histórico anterior vem sem eles — `undefined`, nunca zero, porque "não
 * medimos" e "ninguém assistiu" são coisas diferentes.
 *
 * Desde a Story 43.2, os valores são a SOMA do período. Antes vinham de um
 * único dia, o que produzia taxas ~N× menores.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const rangeQuerySchema = z.object({
  from: z.string().regex(YMD).optional(),
  to: z.string().regex(YMD).optional(),
});

const creativesQuerySchema = rangeQuerySchema.extend({
  campaignId: z.string().min(1).optional(),
  orderBy: z
    .enum(["spend", "ctr", "cpc", "cpm", "cpl", "cpa", "roas", "leads", "impressions", "clicks"])
    .default("spend"),
  // Story 43.4 — teto MEDIDO, não escolhido por gosto. Medição em produção
  // (2026-08-14, janela de 30 dias, projeto com mais criativos):
  //
  //   433 criativos  ->  259 KB serializados  (611 B por criativo)
  //   query do banco ->  192 ms
  //   projeção com limit=500  ->  ~299 KB
  //
  // 500 cabe confortavelmente. O default segue 50 para não mudar o
  // comportamento de quem já consome (AC6).
  limit: z.coerce.number().int().min(1).max(500).default(50),
  /** Story 43.4 — paginação. Com `total` e `offset` o consumidor busca tudo. */
  offset: z.coerce.number().int().min(0).default(0),
});

const projectParam = z.object({ projectId: z.string().uuid() });
const adTimeseriesParam = z.object({
  projectId: z.string().uuid(),
  adId: z.string().min(1),
});

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Range default: últimos 30 dias (hoje e 29 dias atrás). */
function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const toStr = to ?? ymd(today);
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 29);
  const fromStr = from ?? ymd(fromDate);
  return { from: fromStr, to: toStr };
}

/** Dias inclusivos entre duas datas YYYY-MM-DD. */
function daysInRange(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

interface MetricAgg {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  lpViews: number;
  checkouts: number;
  lastSyncedAt: Date | null;
}

function emptyAgg(): MetricAgg {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    leads: 0,
    purchases: 0,
    revenue: 0,
    lpViews: 0,
    checkouts: 0,
    lastSyncedAt: null,
  };
}

type InsightRow = {
  dateStart: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  actions: { action_type: string; value: string }[] | null;
  actionValues: { action_type: string; value: string }[] | null;
  lastSyncedAt: Date;
};

function accumulate(agg: MetricAgg, row: InsightRow): void {
  agg.spend += applyMetaTax(parseFloat(row.spend || "0"), row.dateStart);
  agg.impressions += parseFloat(row.impressions || "0");
  agg.reach += parseFloat(row.reach || "0");
  agg.clicks += parseFloat(row.clicks || "0");
  // Auditoria 6.2/39.9: `clicks` da Meta são cliques TOTAIS — link_click é a
  // métrica de tráfego real (a que o dashboard interno usa no Detalhamento).
  agg.linkClicks += parseActionCount(row.actions, "link_click");
  agg.leads += parseLeads(row.actions);
  agg.purchases += parsePurchases(row.actions);
  agg.revenue += parsePurchaseRevenue(row.actionValues);
  agg.lpViews += parseActionCount(row.actions, "landing_page_view");
  // Resumão v4 #7: funil de checkout (initiate_checkout do pixel).
  agg.checkouts += parseActionCount(row.actions, "initiate_checkout");
  if (!agg.lastSyncedAt || row.lastSyncedAt > agg.lastSyncedAt) {
    agg.lastSyncedAt = row.lastSyncedAt;
  }
}

/** Métricas derivadas + arredondamento, a partir de um agregado. */
function deriveMetrics(a: MetricAgg) {
  return {
    spend: round(a.spend) ?? 0,
    impressions: a.impressions,
    reach: a.reach,
    clicks: a.clicks,
    leads: a.leads,
    purchases: a.purchases,
    revenue: round(a.revenue) ?? 0,
    landingPageViews: a.lpViews,
    ctr: a.impressions > 0 ? round((a.clicks / a.impressions) * 100) : null,
    cpc: round(safeDiv(a.spend, a.clicks)),
    // 39.9: variantes por LINK CLICK (tráfego real; ctr/cpc acima usam cliques totais)
    linkClicks: a.linkClicks,
    ctrLink: a.impressions > 0 ? round((a.linkClicks / a.impressions) * 100) : null,
    cpcLink: round(safeDiv(a.spend, a.linkClicks)),
    cpm: a.impressions > 0 ? round((a.spend / a.impressions) * 1000) : null,
    cpl: round(safeDiv(a.spend, a.leads)),
    cpa: round(safeDiv(a.spend, a.purchases)),
    roas: round(safeDiv(a.revenue, a.spend)),
    // ⚠️ Resumão v4 #5: este "connectRate" é LP views ÷ cliques — NÃO é a taxa
    // de conexão WhatsApp/atendimento do mercado. `lpRate` é o nome honesto
    // (mesmo valor); `connectRate` fica por compatibilidade. O connect real de
    // WhatsApp não existe como dado no Loyola X ainda (story 39.11).
    connectRate: a.clicks > 0 ? round((a.lpViews / a.clicks) * 100) : null,
    lpRate: a.clicks > 0 ? round((a.lpViews / a.clicks) * 100) : null,
    // Resumão v4 #7: purchases ÷ initiate_checkout (funil de checkout do pixel).
    checkouts: a.checkouts,
    checkoutRate: a.checkouts > 0 ? round((a.purchases / a.checkouts) * 100) : null,
  };
}

export default fp(async function publicMetaRoutes(fastify) {
  async function assertProject(projectId: string): Promise<boolean> {
    const [p] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return Boolean(p);
  }

  // ---- GET /api/public/meta/v1/projects/:projectId/campaigns ----
  fastify.get<{ Params: z.infer<typeof projectParam>; Querystring: z.infer<typeof rangeQuerySchema> }>(
    "/api/public/meta/v1/projects/:projectId/campaigns",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = projectParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "projectId inválido", code: "BAD_REQUEST" });
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST", details: query.error.flatten().fieldErrors });

      const { projectId } = params.data;
      if (!(await assertProject(projectId))) return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });

      const { from, to } = resolveRange(query.data.from, query.data.to);

      // Agrega por campanha a partir do cache ad-level (meta_ad_insights_daily) —
      // fonte ÚNICA, populada pelo job 36.4. campaignName vem direto da linha;
      // activeCreatives = adIds distintos. Garante consistência campanha↔criativos.
      const rows = await fastify.db
        .select({
          campaignId: metaAdInsightsDaily.campaignId,
          campaignName: metaAdInsightsDaily.campaignName,
          adId: metaAdInsightsDaily.adId,
          dateStart: metaAdInsightsDaily.dateStart,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(
          and(
            eq(metaAdInsightsDaily.projectId, projectId),
            gte(metaAdInsightsDaily.dateStart, from),
            lte(metaAdInsightsDaily.dateStart, to)
          )
        );

      interface CampaignAgg extends MetricAgg {
        campaignName: string | null;
        adIds: Set<string>;
      }
      const byCampaign = new Map<string, CampaignAgg>();
      const daysWithData = new Set<string>();
      let lastSyncedAt: Date | null = null;
      for (const row of rows) {
        if (!row.campaignId) continue;
        let agg = byCampaign.get(row.campaignId);
        if (!agg) {
          agg = { ...emptyAgg(), campaignName: row.campaignName, adIds: new Set<string>() };
          byCampaign.set(row.campaignId, agg);
        }
        accumulate(agg, row);
        agg.adIds.add(row.adId);
        if (!agg.campaignName && row.campaignName) agg.campaignName = row.campaignName;
        daysWithData.add(row.dateStart);
        if (agg.lastSyncedAt && (!lastSyncedAt || agg.lastSyncedAt > lastSyncedAt)) {
          lastSyncedAt = agg.lastSyncedAt;
        }
      }

      const campaigns = [...byCampaign.entries()]
        .map(([id, agg]) => ({
          campaignId: id,
          campaignName: agg.campaignName,
          activeCreatives: agg.adIds.size,
          ...deriveMetrics(agg),
        }))
        .sort((a, b) => b.spend - a.spend);

      return {
        projectId,
        // Selo anti-dupla-taxação (Brief v5 #10): o gross-up de 12,15% JÁ está
        // aplicado no spend servido — cliente NUNCA deve reaplicar (÷0,8785 ou ×1,13).
        spendIncludesMetaTax: true,
        range: { from, to },
        partial: daysWithData.size < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        campaigns,
      };
    }
  );

  // ---- GET /api/public/meta/v1/projects/:projectId/creatives ----
  fastify.get<{ Params: z.infer<typeof projectParam>; Querystring: z.infer<typeof creativesQuerySchema> }>(
    "/api/public/meta/v1/projects/:projectId/creatives",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = projectParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "projectId inválido", code: "BAD_REQUEST" });
      const query = creativesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST", details: query.error.flatten().fieldErrors });

      const { projectId } = params.data;
      if (!(await assertProject(projectId))) return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });

      const { from, to } = resolveRange(query.data.from, query.data.to);
      const { campaignId, orderBy, limit, offset } = query.data;

      const filters = [
        eq(metaAdInsightsDaily.projectId, projectId),
        gte(metaAdInsightsDaily.dateStart, from),
        lte(metaAdInsightsDaily.dateStart, to),
      ];
      if (campaignId) filters.push(eq(metaAdInsightsDaily.campaignId, campaignId));

      const rows = await fastify.db
        .select({
          adId: metaAdInsightsDaily.adId,
          adName: metaAdInsightsDaily.adName,
          campaignId: metaAdInsightsDaily.campaignId,
          campaignName: metaAdInsightsDaily.campaignName,
          adsetId: metaAdInsightsDaily.adsetId,
          adsetName: metaAdInsightsDaily.adsetName,
          dateStart: metaAdInsightsDaily.dateStart,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          videoMetrics: metaAdInsightsDaily.videoMetrics,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(and(...filters));

      interface AdAcc extends MetricAgg {
        adName: string | null;
        campaignId: string | null;
        campaignName: string | null;
        adsetId: string | null;
        adsetName: string | null;
        /** Story 43.2: uma entrada por dia; somadas em `somarVideoMetrics`. */
        videoMetricsDiarios: unknown[];
      }
      const byAd = new Map<string, AdAcc>();
      const daysWithData = new Set<string>();
      for (const row of rows) {
        let acc = byAd.get(row.adId);
        if (!acc) {
          acc = {
            ...emptyAgg(),
            adName: row.adName,
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            adsetId: row.adsetId,
            adsetName: row.adsetName,
            videoMetricsDiarios: [],
          };
          byAd.set(row.adId, acc);
        }
        accumulate(acc, row);
        // Story 43.2: coleta as linhas diárias para somar depois. Antes daqui
        // saía `acc.videoMetrics = row.videoMetrics` na PRIMEIRA linha com
        // valor — o que dava numerador de um dia contra denominador de N.
        if (row.videoMetrics) acc.videoMetricsDiarios.push(row.videoMetrics);
        daysWithData.add(row.dateStart);
      }

      const adIds = [...byAd.keys()];
      const creativeRows = adIds.length
        ? await fastify.db
            .select({ adId: metaAdCreativesCache.adId, creative: metaAdCreativesCache.creative })
            .from(metaAdCreativesCache)
            .where(and(eq(metaAdCreativesCache.projectId, projectId), inArray(metaAdCreativesCache.adId, adIds)))
        : [];
      const creativeMap = new Map(creativeRows.map((r) => [r.adId, r.creative]));

      let lastSyncedAt: Date | null = null;
      const creatives = adIds.map((id) => {
        const acc = byAd.get(id)!;
        if (acc.lastSyncedAt && (!lastSyncedAt || acc.lastSyncedAt > lastSyncedAt)) lastSyncedAt = acc.lastSyncedAt;
        const creative = creativeMap.get(id) ?? null;
        return {
          adId: id,
          adName: acc.adName,
          campaignId: acc.campaignId,
          campaignName: acc.campaignName,
          adsetId: acc.adsetId,
          adsetName: acc.adsetName,
          creative,
          // Story 36.8 — link do ANÚNCIO, promovido ao topo do objeto porque é
          // uma leitura diferente de `creative.linkUrl` (o DESTINO do clique).
          // Explicitamente `null` quando ausente: em JSON, `undefined` some da
          // resposta, e chave ausente é pior de consumir que valor nulo.
          adPermalinkUrl: creative?.adPermalinkUrl ?? null,
          // Sem isto, `adPermalinkUrl: null` de linha gravada antes desta story
          // seria lido como "a Meta não tem post para este anúncio". Mesmo
          // mecanismo do `linkUrlResolver` da 29.43.
          adPermalinkStale: (creative?.adPermalinkResolver ?? 0) < AD_PERMALINK_RESOLVER_VERSION,
          videoMetrics: somarVideoMetrics(acc.videoMetricsDiarios),
          ...deriveMetrics(acc),
        };
      });

      const orderVal = (c: (typeof creatives)[number]): number => {
        const v = c[orderBy as keyof typeof c];
        return typeof v === "number" ? v : -Infinity;
      };
      // Story 43.4 — desempate OBRIGATÓRIO por adId. Ordenar só pela métrica
      // deixa a ordem indefinida entre empatados, e aí paginar por offset pula
      // ou repete criativo entre requisições. É o mesmo defeito que o QA-15
      // apontou na paginação do backfill da 42.6.
      creatives.sort((a, b) => {
        const d = orderVal(b) - orderVal(a);
        return d !== 0 ? d : a.adId.localeCompare(b.adId);
      });

      const pagina = creatives.slice(offset, offset + limit);

      return {
        projectId,
        spendIncludesMetaTax: true,
        range: { from, to },
        campaignId: campaignId ?? null,
        orderBy,
        partial: daysWithData.size < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        /** @deprecated Story 43.4 — use `total`. Mantido por compatibilidade. */
        count: creatives.length,
        // Story 43.4 — sem estes três, `limit=50` (o default) devolve 50 de 448
        // e PARECE o conjunto inteiro: a resposta truncada é idêntica em forma
        // a uma completa.
        total: creatives.length,
        returned: pagina.length,
        offset,
        truncated: offset + pagina.length < creatives.length,
        creatives: pagina,
      };
    }
  );

  // ---- GET /api/public/meta/v1/projects/:projectId/creatives/:adId/timeseries ----
  fastify.get<{ Params: z.infer<typeof adTimeseriesParam>; Querystring: z.infer<typeof rangeQuerySchema> }>(
    "/api/public/meta/v1/projects/:projectId/creatives/:adId/timeseries",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = adTimeseriesParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST", details: query.error.flatten().fieldErrors });

      const { projectId, adId } = params.data;
      if (!(await assertProject(projectId))) return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });

      const { from, to } = resolveRange(query.data.from, query.data.to);

      const rows = (await fastify.db
        .select({
          dateStart: metaAdInsightsDaily.dateStart,
          adName: metaAdInsightsDaily.adName,
          campaignId: metaAdInsightsDaily.campaignId,
          campaignName: metaAdInsightsDaily.campaignName,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(
          and(
            eq(metaAdInsightsDaily.projectId, projectId),
            eq(metaAdInsightsDaily.adId, adId),
            gte(metaAdInsightsDaily.dateStart, from),
            lte(metaAdInsightsDaily.dateStart, to)
          )
        )
        .orderBy(metaAdInsightsDaily.dateStart)) as (InsightRow & { adName: string | null; campaignId: string | null; campaignName: string | null })[];

      if (rows.length === 0) {
        // Distingue "adId desconhecido" (404) de "sem dados no range" (200 vazio).
        const [exists] = await fastify.db
          .select({ adId: metaAdInsightsDaily.adId })
          .from(metaAdInsightsDaily)
          .where(and(eq(metaAdInsightsDaily.projectId, projectId), eq(metaAdInsightsDaily.adId, adId)))
          .limit(1);
        if (!exists) return reply.code(404).send({ error: "Criativo (adId) não encontrado", code: "NOT_FOUND" });
      }

      let lastSyncedAt: Date | null = null;
      const series = rows.map((row) => {
        if (row.lastSyncedAt && (!lastSyncedAt || row.lastSyncedAt > lastSyncedAt)) lastSyncedAt = row.lastSyncedAt;
        const agg = emptyAgg();
        accumulate(agg, row);
        return { date: row.dateStart, ...deriveMetrics(agg) };
      });

      const head = rows[0];
      return {
        projectId,
        spendIncludesMetaTax: true,
        adId,
        adName: head?.adName ?? null,
        campaignId: head?.campaignId ?? null,
        campaignName: head?.campaignName ?? null,
        range: { from, to },
        partial: series.length < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        series,
      };
    }
  );

  // ---- GET /api/public/meta/v1/projects/:projectId/daily ----
  // "Dados Diários" (parte Meta): série diária agregada do projeto inteiro com
  // todas as métricas + connectRate. Faturamento/ingressos por origem (parte de
  // vendas) virão quando a Story 36.5 entrar.
  fastify.get<{ Params: z.infer<typeof projectParam>; Querystring: z.infer<typeof rangeQuerySchema> }>(
    "/api/public/meta/v1/projects/:projectId/daily",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = projectParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "projectId inválido", code: "BAD_REQUEST" });
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST", details: query.error.flatten().fieldErrors });

      const { projectId } = params.data;
      if (!(await assertProject(projectId))) return reply.code(404).send({ error: "Projeto não encontrado", code: "NOT_FOUND" });

      const { from, to } = resolveRange(query.data.from, query.data.to);

      const rows = (await fastify.db
        .select({
          dateStart: metaAdInsightsDaily.dateStart,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(
          and(
            eq(metaAdInsightsDaily.projectId, projectId),
            gte(metaAdInsightsDaily.dateStart, from),
            lte(metaAdInsightsDaily.dateStart, to)
          )
        )) as InsightRow[];

      const byDay = new Map<string, MetricAgg>();
      let lastSyncedAt: Date | null = null;
      for (const row of rows) {
        let agg = byDay.get(row.dateStart);
        if (!agg) {
          agg = emptyAgg();
          byDay.set(row.dateStart, agg);
        }
        accumulate(agg, row);
        if (agg.lastSyncedAt && (!lastSyncedAt || agg.lastSyncedAt > lastSyncedAt)) lastSyncedAt = agg.lastSyncedAt;
      }

      const days = [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, agg]) => ({ date, ...deriveMetrics(agg) }));

      return {
        projectId,
        spendIncludesMetaTax: true,
        range: { from, to },
        partial: days.length < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        days,
      };
    }
  );

  // ---- GET /api/public/meta/v1/projects/:projectId/stages/:stageId/daily ----
  // Auditoria da metodologia (Tier 1.2): o /daily de projeto mistura funis e
  // evergreen no mesmo balde. Esta variante agrega SÓ as campanhas vinculadas
  // à ETAPA (funnel_stages.campaigns) — mídia isolada por etapa, sem contaminação.
  const stageDailyParam = z.object({ projectId: z.string().uuid(), stageId: z.string().uuid() });
  fastify.get<{ Params: z.infer<typeof stageDailyParam>; Querystring: z.infer<typeof rangeQuerySchema> }>(
    "/api/public/meta/v1/projects/:projectId/stages/:stageId/daily",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = stageDailyParam.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST", details: query.error.flatten().fieldErrors });

      const { projectId, stageId } = params.data;
      const [stage] = await fastify.db
        .select({ id: funnelStages.id, name: funnelStages.name, campaigns: funnelStages.campaigns })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(and(eq(funnelStages.id, stageId), eq(funnels.projectId, projectId)))
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });

      const campaignIds = ((stage.campaigns ?? []) as { id: string }[]).map((c) => c.id);
      // Sem from/to: série COMPLETA das campanhas da etapa. Um lançamento é
      // finito e frequentemente PASSADO — o default "últimos 30 dias" (herdado
      // do /daily de projeto) devolvia days:[] pra etapa encerrada (BBE mar/26).
      const explicitRange = Boolean(query.data.from || query.data.to);
      const { from, to } = resolveRange(query.data.from, query.data.to);

      // Etapa sem campanha vinculada = série vazia (não é erro — etapa orgânica).
      if (campaignIds.length === 0) {
        return {
          projectId,
          stageId,
          stageName: stage.name,
          campaignIds: [],
          range: explicitRange ? { from, to } : { from: null, to: null },
          partial: true,
          lastSyncedAt: null,
          days: [],
        };
      }

      const baseConditions = [
        eq(metaAdInsightsDaily.projectId, projectId),
        inArray(metaAdInsightsDaily.campaignId, campaignIds),
      ];
      const rows = (await fastify.db
        .select({
          dateStart: metaAdInsightsDaily.dateStart,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(
          explicitRange
            ? and(...baseConditions, gte(metaAdInsightsDaily.dateStart, from), lte(metaAdInsightsDaily.dateStart, to))
            : and(...baseConditions)
        )) as InsightRow[];

      const byDay = new Map<string, MetricAgg>();
      let lastSyncedAt: Date | null = null;
      for (const row of rows) {
        let agg = byDay.get(row.dateStart);
        if (!agg) {
          agg = emptyAgg();
          byDay.set(row.dateStart, agg);
        }
        accumulate(agg, row);
        if (agg.lastSyncedAt && (!lastSyncedAt || agg.lastSyncedAt > lastSyncedAt)) lastSyncedAt = agg.lastSyncedAt;
      }

      const days = [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, agg]) => ({ date, ...deriveMetrics(agg) }));

      // Range efetivo: o pedido (explícito) ou o observado nos dados (default).
      const effFrom = explicitRange ? from : (days[0]?.date ?? null);
      const effTo = explicitRange ? to : (days[days.length - 1]?.date ?? null);

      return {
        projectId,
        stageId,
        stageName: stage.name,
        spendIncludesMetaTax: true,
        campaignIds,
        range: { from: effFrom, to: effTo },
        partial: explicitRange
          ? days.length < daysInRange(from, to)
          : effFrom != null && days.length < daysInRange(effFrom, effTo as string),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        days,
      };
    }
  );

  // ---- GET .../stages/:stageId/campaigns/daily ---------------------------
  /**
   * Story 44.1 — série DIÁRIA por campanha das campanhas vinculadas à etapa.
   *
   * O `/stages/:stageId/daily` agrega todas as campanhas da etapa num balde só.
   * A aba de decomposição de CAC precisa do grão anterior: cada campanha é uma
   * coluna, e o CAC de cada uma é decomposto separadamente.
   *
   * ## Fonte: ad-level, e a razão importa
   *
   * Lê `meta_ad_insights_daily` agregado por campanha — a MESMA fonte do
   * `/campaigns` e do `/stages/:stageId/daily`. Não é a escolha óbvia (existe
   * `meta_campaign_insights_daily`, com grão já por campanha), e foi medida
   * antes de ser feita: as duas tabelas divergem em `spend` em 21 das 164
   * campanhas comuns, com diferença de até R$ 24.424,85.
   *
   * Duas fontes para o mesmo número quebraria o propósito da aba, que é a tela
   * e o agente Inácio dizerem a mesma coisa.
   *
   * ## O que se perde, e por que é aceitável
   *
   * 41 campanhas existem só em `meta_campaign_insights_daily` — anteriores ao
   * job 36.4, que popula o ad-level. Medido em 2026-08-17: **nenhuma está
   * ativa**; todas encerraram antes de junho (40 do DG & CPDF até 18/05, 1 do
   * Lyrio). Para série corrente a perda é zero.
   *
   * Para o TETO histórico a perda seria real — e por isso ele é tratado à parte
   * (Story 44.5), onde campaign-level é permitido com a fonte rotulada.
   *
   * ## Sem taxa derivada, de propósito
   *
   * Devolve só os brutos somáveis. Toda taxa é razão de somas sobre o período
   * que o consumidor escolher; entregar `cpm`/`ctr` por dia convidaria a tirar
   * média de médias diárias, que dá outro número.
   */
  const stageCampaignsDailyParam = z.object({
    projectId: z.string().uuid(),
    stageId: z.string().uuid(),
  });
  fastify.get<{
    Params: z.infer<typeof stageCampaignsDailyParam>;
    Querystring: z.infer<typeof rangeQuerySchema>;
  }>(
    "/api/public/meta/v1/projects/:projectId/stages/:stageId/campaigns/daily",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const params = stageCampaignsDailyParam.safeParse(request.params);
      if (!params.success)
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success)
        return reply.code(400).send({
          error: "Parâmetros inválidos",
          code: "BAD_REQUEST",
          details: query.error.flatten().fieldErrors,
        });

      const { projectId, stageId } = params.data;
      // Prova de vínculo etapa↔funil↔projeto. Sem o innerJoin, o stageId de
      // outro projeto passaria — o mesmo IDOR que a Story 43.7 introduziu e o
      // gate pegou.
      const [stage] = await fastify.db
        .select({ id: funnelStages.id, name: funnelStages.name, campaigns: funnelStages.campaigns })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(and(eq(funnelStages.id, stageId), eq(funnels.projectId, projectId)))
        .limit(1);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada", code: "NOT_FOUND" });

      const campaignIds = ((stage.campaigns ?? []) as { id: string }[]).map((c) => c.id);
      const explicitRange = Boolean(query.data.from || query.data.to);
      const { from, to } = resolveRange(query.data.from, query.data.to);

      // Etapa sem campanha não é erro — é etapa orgânica.
      if (campaignIds.length === 0) {
        return {
          projectId,
          stageId,
          stageName: stage.name,
          fonte: "ad-level" as const,
          spendIncludesMetaTax: true,
          range: explicitRange ? { from, to } : { from: null, to: null },
          campanhas: [],
        };
      }

      const base = [
        eq(metaAdInsightsDaily.projectId, projectId),
        inArray(metaAdInsightsDaily.campaignId, campaignIds),
      ];
      const rows = await fastify.db
        .select({
          campaignId: metaAdInsightsDaily.campaignId,
          campaignName: metaAdInsightsDaily.campaignName,
          dateStart: metaAdInsightsDaily.dateStart,
          spend: metaAdInsightsDaily.spend,
          impressions: metaAdInsightsDaily.impressions,
          reach: metaAdInsightsDaily.reach,
          clicks: metaAdInsightsDaily.clicks,
          actions: metaAdInsightsDaily.actions,
          actionValues: metaAdInsightsDaily.actionValues,
          lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
        })
        .from(metaAdInsightsDaily)
        .where(
          explicitRange
            ? and(
                ...base,
                gte(metaAdInsightsDaily.dateStart, from),
                lte(metaAdInsightsDaily.dateStart, to)
              )
            : and(...base)
        );

      // (campanha → dia → agregado). O `accumulate` já aplica o gross-up de
      // imposto uma única vez (`applyMetaTax`) e lê link_click,
      // landing_page_view e initiate_checkout de `actions[]`.
      const porCampanha = new Map<
        string,
        { nome: string | null; dias: Map<string, MetricAgg>; lastSyncedAt: Date | null }
      >();
      for (const row of rows) {
        if (!row.campaignId) continue;
        let c = porCampanha.get(row.campaignId);
        if (!c) {
          c = { nome: row.campaignName ?? null, dias: new Map(), lastSyncedAt: null };
          porCampanha.set(row.campaignId, c);
        }
        if (!c.nome && row.campaignName) c.nome = row.campaignName;
        let agg = c.dias.get(row.dateStart);
        if (!agg) {
          agg = emptyAgg();
          c.dias.set(row.dateStart, agg);
        }
        accumulate(agg, row as InsightRow);
        if (!c.lastSyncedAt || row.lastSyncedAt > c.lastSyncedAt) c.lastSyncedAt = row.lastSyncedAt;
      }

      const campanhas = campaignIds.map((campaignId) => {
        const c = porCampanha.get(campaignId);
        // Campanha vinculada à etapa sem NENHUMA linha no cache: `days: null` +
        // motivo. Devolver `days: []` diria "rodou e não teve nada", que é
        // afirmação diferente e falsa.
        if (!c) {
          return {
            campaignId,
            campaignName: null,
            days: null,
            motivo: "semDados" as const,
            lastSyncedAt: null,
          };
        }
        const days = [...c.dias.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, a]) => ({
            date,
            // Só brutos somáveis — ver a nota sobre razão de somas acima.
            spend: round(a.spend) ?? 0,
            impressions: a.impressions,
            linkClicks: a.linkClicks,
            landingPageViews: a.lpViews,
            checkouts: a.checkouts,
            // Pixel, não Loyola. A venda/lead real por campanha vem da Story
            // 44.3 (utm_content → adId → campaignId).
            leadsProxyPixel: a.leads,
            purchasesProxyPixel: a.purchases,
            revenueProxyPixel: round(a.revenue) ?? 0,
          }));
        return {
          campaignId,
          campaignName: c.nome,
          days,
          motivo: null,
          lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
        };
      });

      return {
        projectId,
        stageId,
        stageName: stage.name,
        /** Story 44.1: fonte declarada — a série corrente é sempre ad-level. */
        fonte: "ad-level" as const,
        spendIncludesMetaTax: true,
        range: explicitRange ? { from, to } : { from: null, to: null },
        campanhas,
      };
    }
  );
});
