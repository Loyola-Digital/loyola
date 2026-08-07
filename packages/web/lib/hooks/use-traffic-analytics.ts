"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

export interface CampaignAnalytics {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number | null;
  cpl: number | null;
  linkClicks: number | null;
  landingPageViews: number | null;
  connectRate: number | null;
  qualifiedLeads: number | null;
  cplQualified: number | null;
  qualificationRate: number | null;
  sales: number | null;
  revenue: number | null;
  costPerSale: number | null;
  roas: number | null;
  conversionRate: number | null;
  /**
   * Story 29.29: métricas de vídeo — só vêm no nível de anúncio (`/all-ads`),
   * somadas por Ad Name. Base de Hook/Hold/Body Conversion.
   */
  videoViews3s?: number;
  videoViews75?: number;
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach: number | null;
  avgFrequency: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalLinkClicks: number | null;
  totalLandingPageViews: number | null;
  connectRate: number | null;
  totalQualifiedLeads: number | null;
  avgCplQualified: number | null;
  totalSales: number | null;
  totalRevenue: number | null;
  totalCheckouts: number | null;
  checkoutRate: number | null;
  checkoutConversionRate: number | null;
  roas: number | null;
  cac: number | null;
  margin: number | null;
  marginPercent: number | null;
  totalCampaigns: number;
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

export interface CampaignAnalyticsResponse {
  campaigns: CampaignAnalytics[];
  unattributedLeads: number;
  unattributedSales: { count: number; revenue: number };
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

export interface AdSetAnalyticsResponse {
  adsets: CampaignAnalytics[];
  unattributedLeads: number;
  unattributedSales: { count: number; revenue: number };
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

export interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplay: number;
}

export interface MetaAdCreative {
  adId: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  ctaType: string | null;
  objectType: string | null;
  videoId: string | null;
}

export interface AdAnalyticsResponse {
  ads: (CampaignAnalytics & { creative: MetaAdCreative | null; videoMetrics: VideoMetrics | null })[];
  unattributedLeads: number;
  unattributedSales: { count: number; revenue: number };
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

// ============================================================
// HOOKS
// ============================================================

const TRAFFIC_STALE_TIME = 15 * 60 * 1000; // 15min — avoid redundant refetches on tab focus / remount; backend cacheia 30min então mais agressivo aqui não ajuda
const CREATIVE_STALE_TIME = 30 * 60 * 1000; // 30min — creatives rarely change

export function useTrafficOverview(
  projectId: string | null,
  days: number = 30,
  campaignIds?: string[] | null,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  const campaignParam = campaignIds && campaignIds.length > 0 ? `&campaignIds=${campaignIds.join(",")}` : "";
  // Fix 1 (29.8): quando startDate/endDate, usa range explicito (custom no passado).
  // Senao usa days retroativos.
  const rangeParam = startDate && endDate
    ? `startDate=${startDate}&endDate=${endDate}`
    : `days=${days}`;
  return useQuery({
    queryKey: ["traffic-overview", projectId, days, campaignIds, startDate, endDate],
    queryFn: () =>
      apiClient<OverviewAnalytics>(
        `/api/traffic/analytics/${projectId}/overview?${rangeParam}${campaignParam}`
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface MetaFreshness {
  /** ISO do sync de performance Meta mais recente do projeto, ou null se nunca sincronizou. */
  lastSyncedAt: string | null;
}

/**
 * Frescor do cache Meta (quando o sync rodou pela última vez). Alimenta o selo
 * "atualizado há X" nos painéis. refetch a cada 60s para o selo não envelhecer.
 */
export function useMetaFreshness(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-freshness", projectId],
    queryFn: () =>
      apiClient<MetaFreshness>(`/api/traffic/analytics/${projectId}/meta-freshness`),
    enabled: !!projectId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useTrafficCampaigns(
  projectId: string | null,
  days: number = 30,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  // Custom range (calendário no passado) tem prioridade; senão days retroativos.
  const rangeParam = startDate && endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";
  return useQuery({
    queryKey: ["traffic-campaigns", projectId, days, startDate, endDate],
    queryFn: () =>
      apiClient<CampaignAnalyticsResponse>(
        `/api/traffic/analytics/${projectId}/campaigns?days=${days}${rangeParam}`
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export function useTrafficAdSets(
  projectId: string | null,
  campaignId: string | null,
  days: number = 30
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-adsets", projectId, campaignId, days],
    queryFn: () =>
      apiClient<AdSetAnalyticsResponse>(
        `/api/traffic/analytics/${projectId}/adsets?campaignId=${campaignId}&days=${days}`
      ),
    enabled: !!projectId && !!campaignId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export function useTrafficAds(
  projectId: string | null,
  adsetId: string | null,
  days: number = 30
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-ads", projectId, adsetId, days],
    queryFn: () =>
      apiClient<AdAnalyticsResponse>(
        `/api/traffic/analytics/${projectId}/ads?adsetId=${adsetId}&days=${days}`
      ),
    enabled: !!projectId && !!adsetId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

// ============================================================
// TOP PERFORMERS & ALL ADSETS (Story 7.8)
// ============================================================

export type TopPerformerMetric = "roas" | "cpl" | "cplQualified" | "leads" | "sales" | "ctr" | "spend";

export interface TopPerformerAd extends CampaignAnalytics {
  adsetName: string;
  parentCampaignName: string;
  creative: MetaAdCreative | null;
  videoMetrics: VideoMetrics | null;
}

export interface TopPerformersResponse {
  topPerformers: TopPerformerAd[];
  metric: TopPerformerMetric;
}

export interface AllAdSetsResponse {
  adsets: (CampaignAnalytics & { parentCampaignName: string })[];
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

export function useTopPerformers(
  projectId: string | null,
  metric: TopPerformerMetric = "roas",
  limit: number = 5,
  days: number = 30,
  campaignIds?: string | string[] | null,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  // Normaliza pra sempre enviar `campaignIds` (CSV) quando houver mais de uma,
  // `campaignId` (single) pra 1 só — compat com schema atual do backend.
  const idList = Array.isArray(campaignIds)
    ? campaignIds.filter(Boolean)
    : campaignIds
      ? [campaignIds]
      : [];
  const campaignParam =
    idList.length === 0
      ? ""
      : idList.length === 1
        ? `&campaignId=${encodeURIComponent(idList[0])}`
        : `&campaignIds=${encodeURIComponent(idList.join(","))}`;
  // Story 29.8 ext: custom range alcança o ranking de criativos
  const rangeParam = startDate && endDate
    ? `&startDate=${startDate}&endDate=${endDate}`
    : "";
  const cacheKeyIds = idList.length > 0 ? [...idList].sort().join(",") : null;
  return useQuery({
    queryKey: ["traffic-top-performers", projectId, metric, limit, days, cacheKeyIds, startDate, endDate],
    queryFn: () =>
      apiClient<TopPerformersResponse>(
        `/api/traffic/analytics/${projectId}/top-performers?metric=${metric}&limit=${limit}&days=${days}${campaignParam}${rangeParam}`,
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface CampaignDailyInsight {
  date_start: string;
  date_stop: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

export function useCampaignDailyInsights(
  projectId: string | null,
  campaignId: string | null,
  days: number = 30,
  startDate?: string,
  endDate?: string
) {
  const apiClient = useApiClient();
  let queryString = `/api/traffic/analytics/${projectId}/campaign-daily?campaignId=${campaignId}&days=${days}`;
  if (startDate) queryString += `&startDate=${startDate}`;
  if (endDate) queryString += `&endDate=${endDate}`;

  return useQuery({
    queryKey: ["traffic-campaign-daily", projectId, campaignId, days, startDate, endDate],
    queryFn: () => apiClient<CampaignDailyInsight[]>(queryString),
    enabled: !!projectId && !!campaignId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

// Bulk: agrega daily insights de N campanhas por dia. Usado pelos dashboards
// de funil que somam todas as campanhas selecionadas.
export function useCampaignDailyInsightsBulk(
  projectId: string | null,
  campaignIds: string[] | null,
  days: number = 30,
  startDate?: string,
  endDate?: string
) {
  const apiClient = useApiClient();
  const sortedIds = campaignIds ? [...campaignIds].sort() : [];
  const idsKey = sortedIds.join(",");
  let queryString = `/api/traffic/analytics/${projectId}/campaign-daily?campaignIds=${idsKey}&days=${days}`;
  if (startDate) queryString += `&startDate=${startDate}`;
  if (endDate) queryString += `&endDate=${endDate}`;

  return useQuery({
    queryKey: ["traffic-campaign-daily-bulk", projectId, idsKey, days, startDate, endDate],
    queryFn: () => apiClient<CampaignDailyInsight[]>(queryString),
    enabled: !!projectId && sortedIds.length > 0,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface PlacementInsight {
  platform: string;
  position: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  leads: number | null;
  cpl: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
}

export interface PlacementBreakdownResponse {
  placements: PlacementInsight[];
}

export function usePlacementBreakdown(projectId: string | null, days: number = 30, campaignIds?: string[] | null) {
  const apiClient = useApiClient();
  const campaignParam = campaignIds && campaignIds.length > 0 ? `&campaignIds=${campaignIds.join(",")}` : "";
  return useQuery({
    queryKey: ["traffic-placements", projectId, days, campaignIds],
    queryFn: () =>
      apiClient<PlacementBreakdownResponse>(
        `/api/traffic/analytics/${projectId}/placements?days=${days}${campaignParam}`
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface AdCreativesResponse {
  creatives: MetaAdCreative[];
  /**
   * Story 29.34: quantos ad_ids o backend RECEBEU e qual o teto por request.
   * `requested > limit` significa que houve corte — sem isso, a UI não
   * distingue "a Meta não tem esse criativo" de "nós não perguntamos por ele".
   * Opcionais: response antigo (sem os campos) continua válido.
   */
  requested?: number;
  limit?: number;
}

export function useAdCreatives(
  projectId: string | null,
  adIds: string[]
) {
  const apiClient = useApiClient();
  const idsParam = adIds.join(",");
  return useQuery({
    queryKey: ["traffic-ad-creatives", projectId, idsParam],
    queryFn: () =>
      apiClient<AdCreativesResponse>(
        `/api/traffic/analytics/${projectId}/ad-creatives?adIds=${encodeURIComponent(idsParam)}`
      ),
    enabled: !!projectId && adIds.length > 0,
    staleTime: CREATIVE_STALE_TIME,
  });
}

export interface AdLinkUrlsResponse {
  /** ad_id → URL de destino. `null` = está no cache, mas a Meta não deu URL. */
  linkUrls: Record<string, string | null>;
  requested: number;
  resolved: number;
  /**
   * ad_ids que não estão no cache. Distinto de `linkUrls[id] === null`: aqui a
   * causa é "ainda não sincronizado", que se resolve sozinho; lá é "a Meta não
   * tem". O tooltip da linha "Sem link resolvido" usa essa diferença para não
   * mandar o gestor procurar no lugar errado.
   */
  missingFromCache: string[];
}

/**
 * Story 29.40 — URLs de destino para a tabela de LPs.
 *
 * Diferente de `useAdCreatives`, este endpoint NÃO tem teto de 50: lê do cache
 * do Postgres, onde não há rate limit. O teto lá existe porque aquele caminho
 * chama a Meta. Aqui ele seria fatal — a soma da tabela de LPs precisa fechar
 * com a do Detalhamento (AC6), e isso exige todos os anúncios, não os 50
 * maiores.
 */
export function useAdLinkUrls(projectId: string | null, adIds: string[]) {
  const apiClient = useApiClient();
  const idsParam = adIds.join(",");
  return useQuery({
    queryKey: ["traffic-ad-link-urls", projectId, idsParam],
    queryFn: () =>
      apiClient<AdLinkUrlsResponse>(
        `/api/traffic/analytics/${projectId}/ad-link-urls?adIds=${encodeURIComponent(idsParam)}`,
      ),
    enabled: !!projectId && adIds.length > 0,
    staleTime: CREATIVE_STALE_TIME,
  });
}

// ============================================================
// Story 29.42 — série diária por entidade (campanha / público / criativo).
// ============================================================

export type EntityDailyGroupBy = "campaign" | "adset" | "ad";

export interface EntityDailyRow {
  entityId: string;
  entityName: string;
  dateStart: string;
  /** BRUTO. O gross-up de 12,15% é aplicado UMA vez, no consumidor. */
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
}

export interface EntityDailyResponse {
  rows: EntityDailyRow[];
  /**
   * Investimento por dia que existe no grão de campanha e não aparece em
   * nenhuma linha de anúncio — medido em 1,55% do total (@po, 2026-08-07).
   * Vazio quando `groupBy === "campaign"`.
   */
  unattributedByDate: Record<string, number>;
  daysWithoutCoverage: string[];
  since: string;
  until: string;
  groupBy: EntityDailyGroupBy;
}

/**
 * Story 29.42 (AC6) — um request por (dimensão, período), nunca um por entidade.
 *
 * O endpoint lê do cache do Postgres e não chama a Meta, então não há teto de
 * entidades como no `/ad-creatives`.
 */
export function useEntityDaily(
  projectId: string | null,
  groupBy: EntityDailyGroupBy | null,
  campaignIds: string[] | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  const idsKey = campaignIds ? [...campaignIds].sort().join(",") : "";
  return useQuery({
    queryKey: ["traffic-entity-daily", projectId, groupBy, idsKey, days, startDate, endDate],
    queryFn: () => {
      const range = startDate && endDate ? `startDate=${startDate}&endDate=${endDate}` : `days=${days}`;
      const ids = idsKey ? `&campaignIds=${encodeURIComponent(idsKey)}` : "";
      return apiClient<EntityDailyResponse>(
        `/api/traffic/analytics/${projectId}/entity-daily?groupBy=${groupBy}&${range}${ids}`,
      );
    },
    enabled: !!projectId && !!groupBy,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface VideoSourceData {
  sourceUrl: string | null;
  embedHtml: string | null;
  permalinkUrl: string | null;
  picture: string | null;
}

export function useVideoSource(projectId: string | null, videoId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-video-source", projectId, videoId],
    queryFn: () =>
      apiClient<VideoSourceData>(
        `/api/traffic/analytics/${projectId}/video-source?videoId=${videoId}`
      ),
    enabled: !!projectId && !!videoId,
    staleTime: 55 * 60 * 1000, // 55min (embed URLs are stable)
  });
}

export function useAllAdSets(
  projectId: string | null,
  days: number = 30,
  campaignIds?: string[] | null,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  const campaignParam = campaignIds && campaignIds.length > 0 ? `&campaignIds=${campaignIds.join(",")}` : "";
  const rangeParam = startDate && endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";
  return useQuery({
    queryKey: ["traffic-all-adsets", projectId, days, campaignIds, startDate, endDate],
    queryFn: () =>
      apiClient<AllAdSetsResponse>(
        `/api/traffic/analytics/${projectId}/all-adsets?days=${days}${campaignParam}${rangeParam}`
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}

export interface AllAdsResponse {
  ads: (CampaignAnalytics & { parentCampaignName: string })[];
}

export function useAllAds(
  projectId: string | null,
  days: number = 30,
  campaignIds?: string[] | null,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  const campaignParam = campaignIds && campaignIds.length > 0 ? `&campaignIds=${campaignIds.join(",")}` : "";
  const rangeParam = startDate && endDate ? `&startDate=${startDate}&endDate=${endDate}` : "";
  return useQuery({
    queryKey: ["traffic-all-ads", projectId, days, campaignIds, startDate, endDate],
    queryFn: () =>
      apiClient<AllAdsResponse>(
        `/api/traffic/analytics/${projectId}/all-ads?days=${days}${campaignParam}${rangeParam}`
      ),
    enabled: !!projectId,
    staleTime: TRAFFIC_STALE_TIME,
  });
}
