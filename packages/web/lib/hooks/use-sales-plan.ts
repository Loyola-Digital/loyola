"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SalesPlanSource,
  SalesPlanSourceInput,
  SalesPlanRule,
  SalesPlanRuleInput,
  SalesPlanResponse,
} from "@loyola-x/shared";

// Story 19.15 — Plano de Vendas (Evento Presencial): pesquisas conectadas,
// matriz de faixas e o documento cruzado (KPIs + tiers).
const STALE = 60 * 1000;

function stageBase(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

// ---- Fontes (pesquisas conectadas) ----
export function useSalesPlanSources(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-plan-sources", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ sources: SalesPlanSource[] }>(`${stageBase(projectId, funnelId, stageId)}/sales-plan-sources`),
    enabled,
    staleTime: STALE,
  });
}

export function useSetSalesPlanSources(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sources: SalesPlanSourceInput[]) =>
      apiClient<{ sources: SalesPlanSource[] }>(`${stageBase(projectId, funnelId, stageId)}/sales-plan-sources`, {
        method: "PUT",
        body: JSON.stringify({ sources }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-plan-sources", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["sales-plan", projectId, funnelId, stageId] });
    },
  });
}

// ---- Regras (matriz de faixas → oferta) ----
export function useSalesPlanRules(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-plan-rules", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<{ rules: SalesPlanRule[] }>(`${stageBase(projectId, funnelId, stageId)}/sales-plan-rules`),
    enabled,
    staleTime: STALE,
  });
}

export function useSetSalesPlanRules(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: SalesPlanRuleInput[]) =>
      apiClient<{ rules: SalesPlanRule[] }>(`${stageBase(projectId, funnelId, stageId)}/sales-plan-rules`, {
        method: "PUT",
        body: JSON.stringify({ rules }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-plan-rules", projectId, funnelId, stageId] });
      qc.invalidateQueries({ queryKey: ["sales-plan", projectId, funnelId, stageId] });
    },
  });
}

// ---- Documento computado (cruzamento + matriz) ----
export function useSalesPlan(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-plan", projectId, funnelId, stageId],
    queryFn: () => apiClient<SalesPlanResponse>(`${stageBase(projectId, funnelId, stageId)}/sales-plan`),
    staleTime: 30 * 1000,
  });
}
