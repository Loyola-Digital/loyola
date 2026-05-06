"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FunnelBatchTurn {
  id: string;
  date: string;
  label: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const turnsKey = (projectId: string, funnelId: string) =>
  ["funnel-batch-turns", projectId, funnelId] as const;

export function useFunnelBatchTurns(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: turnsKey(projectId, funnelId),
    queryFn: () =>
      apiClient<FunnelBatchTurn[]>(
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns`
      ),
    staleTime: 60 * 1000,
  });
}

export function useCreateFunnelBatchTurn(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { date: string; label: string }) =>
      apiClient<FunnelBatchTurn>(
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: turnsKey(projectId, funnelId) });
    },
  });
}

export function useUpdateFunnelBatchTurn(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; label: string }) =>
      apiClient<FunnelBatchTurn>(
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns/${data.id}`,
        { method: "PATCH", body: JSON.stringify({ label: data.label }) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: turnsKey(projectId, funnelId) });
    },
  });
}

export function useDeleteFunnelBatchTurn(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: turnsKey(projectId, funnelId) });
    },
  });
}
