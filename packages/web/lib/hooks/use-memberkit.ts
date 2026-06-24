"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MemberkitConnectionStatus,
  MemberkitClassroom,
  MemberkitMemberStatus,
  StageMemberkitEnrollment,
  SetStageMemberkitEnrollmentInput,
} from "@loyola-x/shared";

// Story 19.11 — hooks da integração MemberKit. Conexão (API key) por projeto;
// config de matrícula (turma/status/autoEnroll) por etapa.

const STALE = 5 * 60 * 1000;

function projBase(projectId: string) {
  return `/api/projects/${projectId}/memberkit`;
}
function stageBase(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

// ---- Conexão (projeto) ----
export function useMemberkitConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["memberkit-connection", projectId],
    queryFn: () => apiClient<MemberkitConnectionStatus>(`${projBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

export function useSetMemberkitConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { apiKey: string }) =>
      apiClient<MemberkitConnectionStatus>(`${projBase(projectId)}/connection`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberkit-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["memberkit-classrooms", projectId] });
    },
  });
}

export function useDeleteMemberkitConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<void>(`${projBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberkit-connection", projectId] });
    },
  });
}

// ---- Pickers ----
export function useMemberkitClassrooms(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["memberkit-classrooms", projectId],
    queryFn: () =>
      apiClient<{ classrooms: MemberkitClassroom[] }>(`${projBase(projectId)}/classrooms`),
    enabled,
    staleTime: STALE,
  });
}

// ---- Config de matrícula (etapa) ----
export function useStageMemberkitEnrollment(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["memberkit-enrollment", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageMemberkitEnrollment>(`${stageBase(projectId, funnelId, stageId)}/memberkit-enrollment`),
    staleTime: STALE,
  });
}

export function useSetStageMemberkitEnrollment(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SetStageMemberkitEnrollmentInput) =>
      apiClient<StageMemberkitEnrollment>(
        `${stageBase(projectId, funnelId, stageId)}/memberkit-enrollment`,
        { method: "PUT", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberkit-enrollment", projectId, funnelId, stageId] });
    },
  });
}

// ---- Matrícula manual / retry de uma venda ----
export function useEnrollSaleMemberkit(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) =>
      apiClient<{ status: string }>(
        `${stageBase(projectId, funnelId, stageId)}/manual-sales/${saleId}/memberkit-enroll`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-sales", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["all-sales", projectId, funnelId, stageId] });
    },
  });
}

export type { MemberkitMemberStatus };
