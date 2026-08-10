"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const STALE = 10 * 60 * 1000; // 10min — mesma TTL do cache backend

interface ZoomConnectionResponse {
  connected: boolean;
  accountId?: string;
  clientId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ZoomPastMeeting {
  id: string;
  uuid: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
}

export interface ZoomLinkedMeeting {
  id: string;
  meetingId: string;
  meetingUuid: string;
  topic: string | null;
  label: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  lastSyncedAt: string | null;
}

export interface ZoomParticipant {
  id: string | null;
  name: string;
  email: string | null;
  joinTime: string | null;
  leaveTime: string | null;
  durationSeconds: number;
  sessions?: number;
  status: string | null;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/zoom`;
}

/** Conexão Zoom é global do projeto — vale pra todas as etapas. */
function projectBase(projectId: string) {
  return `/api/projects/${projectId}/zoom`;
}

export function useZoomConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-connection", projectId],
    queryFn: () => apiClient<ZoomConnectionResponse>(`${projectBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

export function useSetZoomConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accountId: string; clientId: string; clientSecret: string }) =>
      apiClient<{ connected: boolean }>(`${projectBase(projectId)}/connection`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-connection", projectId] });
    },
  });
}

export function useDeleteZoomConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<void>(`${projectBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["zoom-past-meetings", projectId] });
    },
  });
}

export function useZoomPastMeetings(projectId: string, enabled = false) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-past-meetings", projectId],
    queryFn: () => apiClient<{ meetings: ZoomPastMeeting[] }>(`${projectBase(projectId)}/past-meetings`),
    enabled,
    staleTime: STALE,
  });
}

export function useZoomLinkedMeetings(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-meetings", projectId, funnelId, stageId],
    queryFn: () => apiClient<{ meetings: ZoomLinkedMeeting[] }>(`${base(projectId, funnelId, stageId)}/meetings`),
    staleTime: STALE,
  });
}

export function useLinkZoomMeeting(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { meetingId: string; label?: string }) =>
      apiClient<{ success: boolean; meetingUuid: string }>(`${base(projectId, funnelId, stageId)}/meetings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-meetings", projectId, funnelId, stageId] });
    },
  });
}

export function useUnlinkZoomMeeting(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingRowId: string) =>
      apiClient<void>(`${base(projectId, funnelId, stageId)}/meetings/${meetingRowId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-meetings", projectId, funnelId, stageId] });
    },
  });
}

export interface ZoomRawSession {
  joinTime: string;
  leaveTime: string;
  durationSeconds: number;
}

/**
 * Story 28.6: mensagem do chat in-meeting. Persistido em
 * `cached_data.chat` no DB pra sobreviver ao corte da API Zoom em 22/05.
 */
export interface ZoomChatMessage {
  sender: string;
  senderEmail?: string;
  dateTime: string; // ISO 8601
  message: string;
}

export interface ZoomParticipantsResponse {
  participants: ZoomParticipant[];
  total: number;
  totalSessions?: number;
  instancesFound?: number;
  source?: "webinar" | "meeting";
  rawSessions?: ZoomRawSession[];
  chat?: ZoomChatMessage[];
  syncing?: boolean;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  message?: string;
}

export function useZoomMeetingParticipants(
  projectId: string,
  funnelId: string,
  stageId: string,
  meetingRowId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-participants", projectId, funnelId, stageId, meetingRowId],
    queryFn: () =>
      apiClient<ZoomParticipantsResponse>(
        `${base(projectId, funnelId, stageId)}/meetings/${meetingRowId}/participants`,
      ),
    enabled: !!meetingRowId,
    staleTime: STALE,
    // Polling 3s enquanto syncing=true (background sync rodando)
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.syncing ? 3000 : false;
    },
  });
}

export function useZoomMeetingSync(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetingRowId: string) =>
      apiClient<{ syncing: boolean; alreadyRunning?: boolean }>(
        `${base(projectId, funnelId, stageId)}/meetings/${meetingRowId}/sync`,
        { method: "POST" },
      ),
    onSuccess: (_data, meetingRowId) => {
      qc.invalidateQueries({ queryKey: ["zoom-participants", projectId, funnelId, stageId, meetingRowId] });
    },
  });
}
