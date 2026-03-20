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
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number | null;
  cpl: number | null;
  qualifiedLeads: number | null;
  cplQualified: number | null;
  qualificationRate: number | null;
  sales: number | null;
  revenue: number | null;
  costPerSale: number | null;
  roas: number | null;
  conversionRate: number | null;
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalQualifiedLeads: number | null;
  avgCplQualified: number | null;
  totalSales: number | null;
  totalRevenue: number | null;
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

export function useTrafficOverview(projectId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-overview", projectId, days],
    queryFn: () =>
      apiClient<OverviewAnalytics>(
        `/api/traffic/analytics/${projectId}/overview?days=${days}`
      ),
    enabled: !!projectId,
  });
}

export function useTrafficCampaigns(projectId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-campaigns", projectId, days],
    queryFn: () =>
      apiClient<CampaignAnalyticsResponse>(
        `/api/traffic/analytics/${projectId}/campaigns?days=${days}`
      ),
    enabled: !!projectId,
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
  });
}

// ============================================================
// TOP PERFORMERS & ALL ADSETS (Story 7.8)
// ============================================================

export type TopPerformerMetric = "roas" | "cpl" | "cplQualified" | "leads" | "sales" | "ctr";

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
  campaignId?: string | null
) {
  const apiClient = useApiClient();
  const campaignParam = campaignId ? `&campaignId=${campaignId}` : "";
  return useQuery({
    queryKey: ["traffic-top-performers", projectId, metric, limit, days, campaignId],
    queryFn: () =>
      apiClient<TopPerformersResponse>(
        `/api/traffic/analytics/${projectId}/top-performers?metric=${metric}&limit=${limit}&days=${days}${campaignParam}`
      ),
    enabled: !!projectId,
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
}

export function useCampaignDailyInsights(
  projectId: string | null,
  campaignId: string | null,
  days: number = 30
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-campaign-daily", projectId, campaignId, days],
    queryFn: () =>
      apiClient<CampaignDailyInsight[]>(
        `/api/traffic/analytics/${projectId}/campaign-daily?campaignId=${campaignId}&days=${days}`
      ),
    enabled: !!projectId && !!campaignId,
  });
}

export interface PlacementInsight {
  platform: string;
  position: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

export interface PlacementBreakdownResponse {
  placements: PlacementInsight[];
}

export function usePlacementBreakdown(projectId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-placements", projectId, days],
    queryFn: () =>
      apiClient<PlacementBreakdownResponse>(
        `/api/traffic/analytics/${projectId}/placements?days=${days}`
      ),
    enabled: !!projectId,
  });
}

export interface AdCreativesResponse {
  creatives: MetaAdCreative[];
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
  });
}

export function useAllAdSets(projectId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["traffic-all-adsets", projectId, days],
    queryFn: () =>
      apiClient<AllAdSetsResponse>(
        `/api/traffic/analytics/${projectId}/all-adsets?days=${days}`
      ),
    enabled: !!projectId,
  });
}
