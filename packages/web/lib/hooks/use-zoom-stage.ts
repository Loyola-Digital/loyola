"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const STALE = 60 * 1000;

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
  status: string | null;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/zoom`;
}

export function useZoomConnection(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-connection", projectId, funnelId, stageId],
    queryFn: () => apiClient<ZoomConnectionResponse>(`${base(projectId, funnelId, stageId)}/connection`),
    staleTime: STALE,
  });
}

export function useSetZoomConnection(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { accountId: string; clientId: string; clientSecret: string }) =>
      apiClient<{ connected: boolean }>(`${base(projectId, funnelId, stageId)}/connection`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-connection", projectId, funnelId, stageId] });
    },
  });
}

export function useDeleteZoomConnection(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<void>(`${base(projectId, funnelId, stageId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zoom-connection", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["zoom-meetings", projectId, funnelId, stageId] });
    },
  });
}

export function useZoomPastMeetings(projectId: string, funnelId: string, stageId: string, enabled = false) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["zoom-past-meetings", projectId, funnelId, stageId],
    queryFn: () => apiClient<{ meetings: ZoomPastMeeting[] }>(`${base(projectId, funnelId, stageId)}/past-meetings`),
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
      apiClient<{ participants: ZoomParticipant[]; total: number }>(
        `${base(projectId, funnelId, stageId)}/meetings/${meetingRowId}/participants`,
      ),
    enabled: !!meetingRowId,
    staleTime: STALE,
  });
}
