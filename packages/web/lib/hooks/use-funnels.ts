"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Funnel, FunnelType, FunnelCampaign } from "@loyola-x/shared";

// ============================================================
// TYPES
// ============================================================

export interface CreateFunnelInput {
  name: string;
  type: FunnelType;
  metaAccountId?: string | null;
  campaigns?: FunnelCampaign[];
}

export interface UpdateFunnelInput {
  name?: string;
  type?: FunnelType;
  metaAccountId?: string | null;
  campaigns?: FunnelCampaign[];
  googleAdsAccountId?: string | null;
  googleAdsCampaigns?: FunnelCampaign[];
}

export interface MetaCampaignOption {
  id: string;
  name: string;
  status: string;
  objective: string;
}

export interface CampaignPickerResponse {
  campaigns: MetaCampaignOption[];
  accountLinked: boolean;
}

// ============================================================
// FUNNEL HOOKS
// ============================================================

const FUNNEL_STALE_TIME = 5 * 60 * 1000; // 5min

export function useFunnels(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnels", projectId],
    queryFn: () =>
      apiClient<Funnel[]>(`/api/projects/${projectId}/funnels`),
    enabled: !!projectId,
    staleTime: FUNNEL_STALE_TIME,
  });
}

export function useFunnel(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel", projectId, funnelId],
    queryFn: () =>
      apiClient<Funnel>(`/api/projects/${projectId}/funnels/${funnelId}`),
    enabled: !!projectId && !!funnelId,
    staleTime: FUNNEL_STALE_TIME,
    select: (funnel) => ({
      funnel,
      campaignIds: funnel.campaigns.map((c) => c.id),
      funnelType: funnel.type,
    }),
  });
}

export function useCreateFunnel(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFunnelInput) =>
      apiClient<Funnel>(`/api/projects/${projectId}/funnels`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnels", projectId] });
    },
  });
}

export function useUpdateFunnel(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateFunnelInput) =>
      apiClient<Funnel>(`/api/projects/${projectId}/funnels/${funnelId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnels", projectId] });
      queryClient.invalidateQueries({ queryKey: ["funnel", projectId, funnelId] });
    },
  });
}

export function useDeleteFunnel(projectId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (funnelId: string) =>
      apiClient<void>(`/api/projects/${projectId}/funnels/${funnelId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnels", projectId] });
    },
  });
}

// ============================================================
// CAMPAIGN PICKER (Story 10.2)
// ============================================================

export function useCampaignPicker(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-campaigns", projectId],
    queryFn: () =>
      apiClient<CampaignPickerResponse>(
        `/api/projects/${projectId}/meta-campaigns`
      ),
    enabled: !!projectId,
    staleTime: FUNNEL_STALE_TIME,
    select: (data) => ({
      campaigns: data.campaigns.filter((c) => c.status !== "DELETED"),
      isLoading: false,
      accountLinked: data.accountLinked,
    }),
  });
}

// ============================================================
// GOOGLE ADS CAMPAIGN PICKER
// ============================================================

interface GoogleCampaignPickerResponse {
  campaigns: { id: string; name: string; status: string }[];
  accountLinked: boolean;
  accountId: string | null;
}

export function useGoogleAdsCampaignPicker(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-ads-campaigns-picker", projectId],
    queryFn: () =>
      apiClient<GoogleCampaignPickerResponse>(
        `/api/projects/${projectId}/google-ads-campaigns`
      ),
    enabled: !!projectId,
    staleTime: FUNNEL_STALE_TIME,
    select: (data) => ({
      campaigns: data.campaigns.filter((c) => c.status !== "REMOVED"),
      accountLinked: data.accountLinked,
      accountId: data.accountId,
    }),
  });
}
