"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

const STALE_TIME = 15 * 60 * 1000; // 15 min

export interface GoogleAdsOverview {
  totalSpend: number;
  totalViews: number;
  totalImpressions: number;
  totalClicks: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  costPerConversion: number | null;
  retention: { p25: number; p50: number; p75: number; p100: number };
}

export interface GoogleAdsDailyInsight {
  date: string;
  spend: number;
  views: number;
  impressions: number;
  clicks: number;
}

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  views: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
}

export function useGoogleAdsOverview(accountId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-ads-overview", accountId, days],
    queryFn: () =>
      apiClient<GoogleAdsOverview>(
        `/api/google-ads/analytics/${accountId}/overview?days=${days}`
      ),
    enabled: !!accountId,
    staleTime: STALE_TIME,
  });
}

export function useGoogleAdsDailyInsights(
  accountId: string | null,
  days: number = 30,
  campaignId?: string
) {
  const apiClient = useApiClient();
  const params = new URLSearchParams({ days: String(days) });
  if (campaignId) params.set("campaignId", campaignId);

  return useQuery({
    queryKey: ["google-ads-daily", accountId, days, campaignId],
    queryFn: () =>
      apiClient<GoogleAdsDailyInsight[]>(
        `/api/google-ads/analytics/${accountId}/daily?${params.toString()}`
      ),
    enabled: !!accountId,
    staleTime: STALE_TIME,
  });
}

export function useGoogleAdsCampaigns(accountId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-ads-campaigns", accountId, days],
    queryFn: () =>
      apiClient<{ campaigns: GoogleAdsCampaign[] }>(
        `/api/google-ads/analytics/${accountId}/campaigns?days=${days}`
      ),
    enabled: !!accountId,
    staleTime: STALE_TIME,
  });
}
