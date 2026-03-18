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
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalCampaigns: number;
  hasCrm: boolean;
}

export interface CampaignAnalyticsResponse {
  campaigns: CampaignAnalytics[];
  unattributedLeads: number;
  hasCrm: boolean;
}

export interface AdSetAnalyticsResponse {
  adsets: CampaignAnalytics[];
  unattributedLeads: number;
  hasCrm: boolean;
}

export interface AdAnalyticsResponse {
  ads: CampaignAnalytics[];
  unattributedLeads: number;
  hasCrm: boolean;
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
