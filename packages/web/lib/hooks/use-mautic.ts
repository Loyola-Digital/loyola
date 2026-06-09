"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 32.1 — hooks da integração Mautic. Conexão por projeto; vínculo de
// campanha + métricas por etapa.

const STALE = 5 * 60 * 1000;

export interface MauticConnectionResponse {
  connected: boolean;
  baseUrl?: string;
  username?: string;
}

export interface MauticCampaign {
  id: string;
  name: string;
}

export interface MauticStageLink {
  campaignId: string;
  campaignName: string;
  matchMode: string;
}

export interface MauticStageCampaignResponse {
  linked: MauticStageLink | null;
  suggested: MauticCampaign | null;
  matchToken: string;
}

export interface MauticMetricsResponse {
  campaignName: string;
  emailCount: number;
  sent: number;
  opens: number;
  openRate: number | null;
  clicks: number | null;
  clickRate: number | null;
  bounces: number | null;
  unsubscribes: number | null;
  statsAvailable: boolean;
}

function projBase(projectId: string) {
  return `/api/projects/${projectId}/mautic`;
}
function stageBase(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

// ---- Conexão (projeto) ----
export function useMauticConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["mautic-connection", projectId],
    queryFn: () => apiClient<MauticConnectionResponse>(`${projBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

export function useSetMauticConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { baseUrl: string; username: string; password: string }) =>
      apiClient<MauticConnectionResponse>(`${projBase(projectId)}/connection`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mautic-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["mautic-campaigns", projectId] });
    },
  });
}

export function useDeleteMauticConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<void>(`${projBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mautic-connection", projectId] });
    },
  });
}

export function useMauticCampaigns(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["mautic-campaigns", projectId],
    queryFn: () => apiClient<{ campaigns: MauticCampaign[] }>(`${projBase(projectId)}/campaigns`),
    enabled,
    staleTime: STALE,
  });
}

// ---- Vínculo de campanha (etapa) ----
export function useMauticStageCampaign(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["mautic-stage-campaign", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<MauticStageCampaignResponse>(`${stageBase(projectId, funnelId, stageId)}/mautic-campaign`),
    staleTime: STALE,
  });
}

export function useSetMauticStageCampaign(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { auto: true } | { campaignId: string; campaignName: string }) =>
      apiClient<{ linked: MauticStageLink }>(`${stageBase(projectId, funnelId, stageId)}/mautic-campaign`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mautic-stage-campaign", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["mautic-metrics", projectId, funnelId, stageId] });
    },
  });
}

export function useDeleteMauticStageCampaign(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<void>(`${stageBase(projectId, funnelId, stageId)}/mautic-campaign`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mautic-stage-campaign", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["mautic-metrics", projectId, funnelId, stageId] });
    },
  });
}

// ---- Dashboard geral de emails (Story 32.2) ----
export interface MauticEmailRow {
  id: string;
  name: string;
  emailType: string | null;
  sent: number;
  opens: number;
  openRate: number | null;
  clicks: number | null;
  clickRate: number | null;
  bounces: number | null;
  unsubscribes: number | null;
}

export interface MauticEmailsResponse {
  matchToken: string;
  emails: MauticEmailRow[];
  statsAvailable: boolean;
}

export function useMauticEmails(projectId: string, funnelId: string, stageId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["mautic-emails", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<MauticEmailsResponse>(`${stageBase(projectId, funnelId, stageId)}/mautic-emails`),
    enabled,
    staleTime: STALE,
  });
}

export function useMauticMetrics(projectId: string, funnelId: string, stageId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["mautic-metrics", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<MauticMetricsResponse>(`${stageBase(projectId, funnelId, stageId)}/mautic-metrics`),
    enabled,
    staleTime: STALE,
  });
}
