"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface MetaAdsAccount {
  id: string;
  accountName: string;
  metaAccountId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  projects: { projectId: string; projectName: string }[];
}

export interface CreateMetaAdsAccountInput {
  accountName: string;
  metaAccountId: string;
  accessToken: string;
}

export function useMetaAdsAccounts() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-accounts"],
    queryFn: () => apiClient<MetaAdsAccount[]>("/api/meta-ads/accounts"),
  });
}

export function useCreateMetaAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMetaAdsAccountInput) =>
      apiClient<MetaAdsAccount>("/api/meta-ads/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useDeleteMetaAdsAccount() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/api/meta-ads/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useLinkMetaAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/meta-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

export function useUnlinkMetaAdsProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, projectId }: { accountId: string; projectId: string }) =>
      apiClient(`/api/meta-ads/accounts/${accountId}/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meta-ads-accounts"] });
    },
  });
}

// ============================================================
// ANALYTICS HOOKS (Story 7.2)
// ============================================================

export interface MetaAdSetWithInsights {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  bid_amount?: string;
  insights: MetaInsightData | null;
}

export interface MetaAdWithInsights {
  id: string;
  name: string;
  status: string;
  creative?: { id: string };
  insights: MetaInsightData | null;
}

export interface MetaInsightData {
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  date_start: string;
  date_stop: string;
}

export interface MetaDailyInsight extends MetaInsightData {
  date_start: string;
  date_stop: string;
}

export interface MetaCampaignInsight extends MetaInsightData {
  campaign_id: string;
  campaign_name: string;
}

export function useMetaAdsCampaignInsights(accountId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-campaign-insights", accountId, days],
    queryFn: () =>
      apiClient<MetaCampaignInsight[]>(
        `/api/meta-ads/accounts/${accountId}/insights/campaigns?days=${days}`
      ),
    enabled: !!accountId,
  });
}

export function useMetaAdsDailyInsights(accountId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-daily-insights", accountId, days],
    queryFn: () =>
      apiClient<MetaDailyInsight[]>(
        `/api/meta-ads/accounts/${accountId}/insights/daily?days=${days}`
      ),
    enabled: !!accountId,
  });
}

export function useMetaAdsAdSets(accountId: string | null, campaignId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-adsets", accountId, campaignId, days],
    queryFn: () =>
      apiClient<MetaAdSetWithInsights[]>(
        `/api/meta-ads/accounts/${accountId}/adsets?campaignId=${campaignId}&days=${days}`
      ),
    enabled: !!accountId && !!campaignId,
  });
}

export function useMetaAdsAds(accountId: string | null, adsetId: string | null, days: number = 30) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-ads", accountId, adsetId, days],
    queryFn: () =>
      apiClient<MetaAdWithInsights[]>(
        `/api/meta-ads/accounts/${accountId}/ads?adsetId=${adsetId}&days=${days}`
      ),
    enabled: !!accountId && !!adsetId,
  });
}
