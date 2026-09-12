"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface FunnelBatchTurn {
  id: string;
  date: string;
  /** A virada de lote. Vazio = o dia tem observação, mas não é virada. */
  label: string;
  /** Observação de texto livre do dia. */
  nota: string | null;
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
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns`,
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
        { method: "POST", body: JSON.stringify(data) },
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
        { method: "PATCH", body: JSON.stringify({ label: data.label }) },
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
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: turnsKey(projectId, funnelId) });
    },
  });
}

/**
 * Grava a marca de um dia — virada de lote e/ou observação — por DATA.
 *
 * Uma chamada só, idempotente: o servidor decide entre criar, atualizar e
 * apagar. Quem clica numa linha da tabela sabe a data, não o id — a linha pode
 * ainda não ter marca nenhuma.
 *
 * Campo ausente não é mexido: mandar só `nota` preserva a virada de lote.
 */
export function useSalvarMarcaDoDia(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      date,
      ...dados
    }: {
      date: string;
      label?: string;
      nota?: string | null;
    }) =>
      apiClient(
        `/api/projects/${projectId}/funnels/${funnelId}/batch-turns/por-data/${date}`,
        { method: "PUT", body: JSON.stringify(dados) },
      ),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: turnsKey(projectId, funnelId) }),
  });
}
