"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 38.3 — Alerta diário de pagamentos (Evento Presencial) no ClickUp.

export interface PaymentAlertMentionUser {
  id: string;
  username: string;
}

export interface PaymentAlertConfig {
  stageId: string;
  enabled: boolean;
  channelId: string;
  channelName: string | null;
  mentionUsers: PaymentAlertMentionUser[];
  lastSentDate: string | null;
}

export interface PaymentAlertResponse {
  clickupConfigured: boolean;
  alert: PaymentAlertConfig | null;
}

function basePath(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/payment-alert`;
}

export function useEventPaymentAlert(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-payment-alert", projectId, funnelId, stageId],
    queryFn: () => apiClient<PaymentAlertResponse>(basePath(projectId, funnelId, stageId)),
    staleTime: 60 * 1000,
  });
}

export function useSaveEventPaymentAlert(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      enabled: boolean;
      channelId: string;
      channelName?: string | null;
      mentionUsers: PaymentAlertMentionUser[];
    }) =>
      apiClient<PaymentAlertConfig>(basePath(projectId, funnelId, stageId), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-payment-alert", projectId, funnelId, stageId] });
    },
  });
}

export function useDeleteEventPaymentAlert(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: boolean }>(basePath(projectId, funnelId, stageId), { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-payment-alert", projectId, funnelId, stageId] });
    },
  });
}

export function useTestEventPaymentAlert(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ ok: boolean; paymentsToday: number }>(
        `${basePath(projectId, funnelId, stageId)}/test`,
        { method: "POST", body: JSON.stringify({}) },
      ),
  });
}

export function useClickupChatChannels(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["clickup-chat-channels", projectId],
    queryFn: () =>
      apiClient<{ channels: { id: string; name: string }[] }>(
        `/api/projects/${projectId}/clickup/chat-channels`,
      ),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

export function useClickupMembers(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["clickup-members", projectId],
    queryFn: () =>
      apiClient<{ members: { id: string; username: string; email: string | null }[] }>(
        `/api/projects/${projectId}/clickup/members`,
      ),
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}
