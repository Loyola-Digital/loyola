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
  limit: z.coerce.number().int().min(1).max(200).default(50),
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
  leads: number;
  purchases: number;
  revenue: number;
  lpViews: number;
  lastSyncedAt: Date | null;
}

function emptyAgg(): MetricAgg {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    purchases: 0,
    revenue: 0,
    lpViews: 0,
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
  agg.leads += parseLeads(row.actions);
  agg.purchases += parsePurchases(row.actions);
  agg.revenue += parsePurchaseRevenue(row.actionValues);
  agg.lpViews += parseActionCount(row.actions, "landing_page_view");
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
    cpm: a.impressions > 0 ? round((a.spend / a.impressions) * 1000) : null,
    cpl: round(safeDiv(a.spend, a.leads)),
    cpa: round(safeDiv(a.spend, a.purchases)),
    roas: round(safeDiv(a.revenue, a.spend)),
    // Connect Rate = LP views / cliques (proxy de quem chegou na LP/conexão).
    // Bate com o "Connect Rate" do dashboard (ex.: 22.631 LPV / 35.882 cliques = 63%).
    connectRate: a.clicks > 0 ? round((a.lpViews / a.clicks) * 100) : null,
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
      const { campaignId, orderBy, limit } = query.data;

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
        videoMetrics: unknown;
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
            videoMetrics: row.videoMetrics ?? null,
          };
          byAd.set(row.adId, acc);
        }
        accumulate(acc, row);
        if (row.videoMetrics && !acc.videoMetrics) acc.videoMetrics = row.videoMetrics;
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
        return {
          adId: id,
          adName: acc.adName,
          campaignId: acc.campaignId,
          campaignName: acc.campaignName,
          adsetId: acc.adsetId,
          adsetName: acc.adsetName,
          creative: creativeMap.get(id) ?? null,
          videoMetrics: acc.videoMetrics ?? null,
          ...deriveMetrics(acc),
        };
      });

      const orderVal = (c: (typeof creatives)[number]): number => {
        const v = c[orderBy as keyof typeof c];
        return typeof v === "number" ? v : -Infinity;
      };
      creatives.sort((a, b) => orderVal(b) - orderVal(a));

      return {
        projectId,
        range: { from, to },
        campaignId: campaignId ?? null,
        orderBy,
        partial: daysWithData.size < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        count: creatives.length,
        creatives: creatives.slice(0, limit),
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
      const { from, to } = resolveRange(query.data.from, query.data.to);

      // Etapa sem campanha vinculada = série vazia (não é erro — etapa orgânica).
      if (campaignIds.length === 0) {
        return {
          projectId,
          stageId,
          stageName: stage.name,
          campaignIds: [],
          range: { from, to },
          partial: true,
          lastSyncedAt: null,
          days: [],
        };
      }

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
            inArray(metaAdInsightsDaily.campaignId, campaignIds),
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
        stageId,
        stageName: stage.name,
        campaignIds,
        range: { from, to },
        partial: days.length < daysInRange(from, to),
        lastSyncedAt: lastSyncedAt ? (lastSyncedAt as Date).toISOString() : null,
        days,
      };
    }
  );
});
