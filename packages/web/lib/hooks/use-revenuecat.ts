"use client";

// Etapa Lyrio — hooks da integração RevenueCat.
// Conexão por projeto (Secret API Key), config por etapa (rcProject + webhook) e
// agregação de vendas (vinda dos webhooks). JSON via apiClient.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

const STALE = 60 * 1000;

// ---- Tipos (espelham routes/revenuecat.ts) ----

export interface RevenuecatProject {
  id: string;
  name: string;
}

export interface RevenuecatStageConfig {
  rcProjectId: string | null;
  label: string | null;
  webhook: { path: string; token: string } | null;
  /** Story 42.4 — percentuais da Margem de Contribuição, sobre o faturamento
   * bruto. A API sempre devolve os três preenchidos (defaults 15/5/1). */
  platformFeePct: number;
  taxPct: number;
  otherCostsPct: number;
}

export interface RevenuecatSales {
  days: number;
  totalSales: number;
  revenueUsd: number;
  byCurrency: { currency: string; revenue: number; sales: number }[];
  daily: { day: string; sales: number; revenueUsd: number }[];
  byStore: { store: string; sales: number; revenueUsd: number }[];
  byProduct: { productId: string; sales: number; revenueUsd: number }[];
}

export interface RevenuecatMetric {
  id: string;
  name: string;
  value: number;
  unit: string | null;
}

export interface RevenuecatOverview {
  /** false = nenhum app do RevenueCat selecionado na etapa. */
  configured: boolean;
  metrics: RevenuecatMetric[];
}

// ---- Connection (por projeto) ----

export function useRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-connection", projectId],
    queryFn: () =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`),
    staleTime: STALE,
  });
}

export function useSaveRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`, {
        method: "PUT",
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["revenuecat-projects", projectId] });
    },
  });
}

export function useDeleteRevenuecatConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ connected: boolean }>(`/api/projects/${projectId}/revenuecat/connection`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenuecat-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["revenuecat-projects", projectId] });
    },
  });
}

export function useRevenuecatProjects(projectId: string, enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-projects", projectId],
    queryFn: () =>
      apiClient<{ projects: RevenuecatProject[] }>(`/api/projects/${projectId}/revenuecat/projects`),
    enabled,
    staleTime: STALE,
  });
}

// ---- Config + webhook (por etapa) ----

export function useRevenuecatConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-config", stageId],
    queryFn: () =>
      apiClient<RevenuecatStageConfig>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/config`,
      ),
    staleTime: STALE,
  });
}

export function useSaveRevenuecatConfig(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    // PUT parcial: o que não vier no body é preservado pela API (Story 42.4).
    mutationFn: (data: {
      rcProjectId?: string | null;
      label?: string | null;
      platformFeePct?: number;
      taxPct?: number;
      otherCostsPct?: number;
    }) =>
      apiClient<{ ok: boolean }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/config`,
        { method: "PUT", body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-config", stageId] }),
  });
}

export function useEnsureRevenuecatWebhook(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rotate: boolean) =>
      rotate
        ? apiClient<{ path: string; token: string }>(
            `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/webhook/rotate`,
            { method: "POST" },
          )
        : apiClient<{ path: string; token: string }>(
            `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/webhook`,
          ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-config", stageId] }),
  });
}

// ---- Sales (agregação) ----

export function useRevenuecatSales(
  projectId: string,
  funnelId: string,
  stageId: string,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-sales", stageId, days],
    queryFn: () =>
      apiClient<RevenuecatSales>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/sales?days=${days}`,
      ),
    staleTime: STALE,
  });
}

// Overview agregado puxado da API do RevenueCat (não depende do webhook).
export function useRevenuecatOverview(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-overview", stageId],
    queryFn: () =>
      apiClient<RevenuecatOverview>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/overview`,
      ),
    staleTime: STALE,
  });
}

// ============================================================
// Backfill do histórico de assinaturas
// ============================================================

/**
 * O webhook só registra o que acontece depois de plugado; o backfill traz o que
 * veio antes, lendo as assinaturas cliente a cliente na API v2. É percurso
 * longo (milhares de clientes), então roda por LOTE: cada disparo avança um
 * pedaço e salva o cursor, e `temMais` diz se ainda falta.
 */
export interface RevenuecatBackfillStatus {
  status: "idle" | "running" | "done" | "error";
  customersProcessed: number;
  subscriptionsUpserted: number;
  temMais: boolean;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  temAlgumaAssinatura: boolean;
}

export interface RevenuecatBackfillResult {
  status: "done" | "partial" | "error";
  customersProcessed: number;
  subscriptionsUpserted: number;
  temMais: boolean;
  error?: string;
}

export function useRevenuecatBackfillStatus(
  projectId: string,
  funnelId: string,
  stageId: string,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["revenuecat-backfill", stageId],
    queryFn: () =>
      apiClient<RevenuecatBackfillStatus>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/backfill`,
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 10 * 1000,
  });
}

export function useRunRevenuecatBackfill(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limite?: number) =>
      apiClient<RevenuecatBackfillResult>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/revenuecat/backfill`,
        { method: "POST", body: JSON.stringify(limite ? { limite } : {}) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["revenuecat-backfill", stageId] }),
  });
}
