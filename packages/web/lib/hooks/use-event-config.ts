"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EventProduct,
  EventCloser,
  EventProductInput,
  EventCloserInput,
  FunnelSalesSpreadsheetRef,
} from "@loyola-x/shared";

// Story 19.12 — config da etapa de Evento: produtos (com turma) e closers.
const STALE = 60 * 1000;

function stageBase(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

export function useEventProducts(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-products", projectId, funnelId, stageId],
    queryFn: () => apiClient<{ products: EventProduct[] }>(`${stageBase(projectId, funnelId, stageId)}/event-products`),
    enabled,
    staleTime: STALE,
  });
}

export function useSetEventProducts(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (products: EventProductInput[]) =>
      apiClient<{ products: EventProduct[] }>(`${stageBase(projectId, funnelId, stageId)}/event-products`, {
        method: "PUT",
        body: JSON.stringify({ products }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-products", projectId, funnelId, stageId] });
    },
  });
}

export function useEventClosers(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-closers", projectId, funnelId, stageId],
    queryFn: () => apiClient<{ closers: EventCloser[] }>(`${stageBase(projectId, funnelId, stageId)}/event-closers`),
    enabled,
    staleTime: STALE,
  });
}

export function useSetEventClosers(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (closers: EventCloserInput[]) =>
      apiClient<{ closers: EventCloser[] }>(`${stageBase(projectId, funnelId, stageId)}/event-closers`, {
        method: "PUT",
        body: JSON.stringify({ closers }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-closers", projectId, funnelId, stageId] });
    },
  });
}

// ---- Espelhamento de planilhas do funil (Story 19.12b) ----
export function useFunnelSalesSpreadsheets(projectId: string, funnelId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-sales-spreadsheets", projectId, funnelId],
    queryFn: () =>
      apiClient<{ spreadsheets: FunnelSalesSpreadsheetRef[] }>(
        `/api/projects/${projectId}/funnels/${funnelId}/sales-spreadsheets-all`,
      ),
    enabled,
    staleTime: STALE,
  });
}

export function useEventMirroredSheets(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-mirrored-sheets", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ sourceSpreadsheetIds: string[] }>(`${stageBase(projectId, funnelId, stageId)}/event-mirrored-sheets`),
    staleTime: STALE,
  });
}

export function useSetEventMirroredSheets(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceSpreadsheetIds: string[]) =>
      apiClient<{ sourceSpreadsheetIds: string[] }>(`${stageBase(projectId, funnelId, stageId)}/event-mirrored-sheets`, {
        method: "PUT",
        body: JSON.stringify({ sourceSpreadsheetIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-mirrored-sheets", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["all-sales", projectId, funnelId, stageId] });
    },
  });
}
