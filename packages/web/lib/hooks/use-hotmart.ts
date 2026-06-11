"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 34 — hooks da integração Hotmart (Assinaturas).
// Conexão por projeto (client_id + client_secret criptografados no backend);
// produtos derivados das assinaturas; dashboard de recorrência agregado no
// backend. O frontend NUNCA recebe nem renderiza o client_secret/Basic —
// o GET de conexão devolve apenas { connected }.
// Story 34.4: useHotmartConnection / useSetHotmartConnection / useDeleteHotmartConnection.
// Story 34.5: useHotmartProducts / useHotmartDashboard.

const STALE = 5 * 60 * 1000;

function projBase(projectId: string) {
  return `/api/projects/${projectId}/hotmart`;
}

// ---- Tipos ----

/** Resposta do GET de conexão — só status, nunca segredo. */
export interface HotmartConnectionResponse {
  connected: boolean;
}

export interface HotmartProduct {
  id: string;
  name: string;
}

export interface HotmartMoneyMetric {
  value: number;
  currency: string;
}

export interface HotmartStatusCount {
  status: string;
  count: number;
}

export interface HotmartDashboard {
  productId: string;
  months: number;
  totalSubscriptions: number;
  /** vigentes (ACTIVE) */
  active: number;
  /** soma dos 3 CANCELLED_BY_* */
  cancelled: number;
  /** OVERDUE + DELAYED (inadimplentes) */
  overdue: number;
  refunded: { count: number; value: HotmartMoneyMetric[] };
  /** por moeda (BRL primeiro) */
  mrr: HotmartMoneyMetric[];
  /** por moeda */
  ltv: HotmartMoneyMetric[];
  /** lifetime médio em meses */
  ltMonths: number;
  /** 0..100 (ativas/total) */
  retentionRate: number;
  /** 0..100 (canceladas/total) */
  churnRate: number;
  renewalsNextMonth: { count: number; value: HotmartMoneyMetric[] };
  statusDistribution: HotmartStatusCount[];
}

// ---- Conexão (projeto) — Story 34.4 ----

// GET /api/projects/:projectId/hotmart/connection -> { connected }
export function useHotmartConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["hotmart-connection", projectId],
    queryFn: () => apiClient<HotmartConnectionResponse>(`${projBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

// PUT /api/projects/:projectId/hotmart/connection  body { clientId, clientSecret }
export function useSetHotmartConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; clientSecret: string }) =>
      apiClient<HotmartConnectionResponse>(`${projBase(projectId)}/connection`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotmart-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["hotmart-products", projectId] });
    },
  });
}

// DELETE /api/projects/:projectId/hotmart/connection
export function useDeleteHotmartConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient<void>(`${projBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hotmart-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["hotmart-products", projectId] });
    },
  });
}

// ---- Produtos + Dashboard — Story 34.5 ----

// GET /api/projects/:projectId/hotmart/products?months=N -> { products }
export function useHotmartProducts(projectId: string, opts: { months: number; enabled: boolean }) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["hotmart-products", projectId, opts.months],
    queryFn: () =>
      apiClient<{ products: HotmartProduct[] }>(
        `${projBase(projectId)}/products?months=${opts.months}`,
      ),
    enabled: opts.enabled,
    staleTime: STALE,
  });
}

// GET /api/projects/:projectId/hotmart/dashboard?productId=&months=N -> HotmartDashboard
export function useHotmartDashboard(
  projectId: string,
  opts: { productId: string | null; months: number; enabled: boolean },
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["hotmart-dashboard", projectId, opts.productId, opts.months],
    queryFn: () =>
      apiClient<HotmartDashboard>(
        `${projBase(projectId)}/dashboard?productId=${encodeURIComponent(
          opts.productId ?? "",
        )}&months=${opts.months}`,
      ),
    enabled: opts.enabled && !!opts.productId,
    staleTime: STALE,
  });
}
