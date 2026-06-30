"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EventProduct,
  EventCloser,
  EventProductInput,
  EventCloserInput,
  FunnelSalesSpreadsheetRef,
  EventLead,
  EventMapResponse,
  SetEventLeadStatusInput,
  SetEventLeadSellerInput,
  SetEventLeadSellerBulkInput,
  EventLeadAnswersResponse,
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

export function useEventLeads(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-leads", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ leads: EventLead[] }>(`${stageBase(projectId, funnelId, stageId)}/event-leads`),
    enabled,
    staleTime: STALE,
  });
}

// ---- Mapa do Evento (Story 19.13) ----
export function useEventMap(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-map", projectId, funnelId, stageId],
    queryFn: () => apiClient<EventMapResponse>(`${stageBase(projectId, funnelId, stageId)}/event-map`),
    staleTime: 30 * 1000,
  });
}

export function useSetEventLeadStatus(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetEventLeadStatusInput) =>
      apiClient<{ email: string; status: string }>(`${stageBase(projectId, funnelId, stageId)}/event-lead-status`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-map", projectId, funnelId, stageId] });
    },
  });
}

export function useSetEventLeadSeller(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetEventLeadSellerInput) =>
      apiClient<{ email: string; seller: string | null }>(`${stageBase(projectId, funnelId, stageId)}/event-lead-seller`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-map", projectId, funnelId, stageId] });
    },
  });
}

export function useSetEventLeadSellerBulk(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetEventLeadSellerBulkInput) =>
      apiClient<{ count: number; seller: string | null }>(
        `${stageBase(projectId, funnelId, stageId)}/event-lead-seller-bulk`,
        {
          method: "PUT",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-map", projectId, funnelId, stageId] });
    },
  });
}

// Respostas completas de um lead (todas as colunas das planilhas), por email.
// Só dispara quando há um email selecionado (modal aberto).
export function useEventLeadAnswers(
  projectId: string,
  funnelId: string,
  stageId: string,
  email: string | null,
  name?: string | null,
  phone?: string | null,
  surveyAt?: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["event-lead-answers", projectId, funnelId, stageId, email, name, phone, surveyAt],
    queryFn: () => {
      // phone/name/surveyAt são fallback: se o lead comprou com um email e
      // respondeu a pesquisa com outro (ou anônimo, casado por horário), o
      // backend localiza as respostas por telefone, nome ou hora de submissão.
      const phoneParam = phone ? `&phone=${encodeURIComponent(phone)}` : "";
      const nameParam = name ? `&name=${encodeURIComponent(name)}` : "";
      const surveyAtParam = surveyAt ? `&surveyAt=${encodeURIComponent(surveyAt)}` : "";
      return apiClient<EventLeadAnswersResponse>(
        `${stageBase(projectId, funnelId, stageId)}/event-lead-answers?email=${encodeURIComponent(email ?? "")}${phoneParam}${nameParam}${surveyAtParam}`,
      );
    },
    enabled: !!email,
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
