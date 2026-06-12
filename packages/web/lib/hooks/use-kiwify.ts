"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Epic 35 — hooks da integração Kiwify (Assinaturas / recorrência).
// Conexão por projeto (client_id + client_secret + account_id criptografados no
// backend). Produtos derivados das assinaturas recurring; dashboard de recorrência
// agregado no backend (SWR L1+L2). O frontend NUNCA recebe nem renderiza o
// client_secret/Bearer/account_id — o GET de conexão devolve apenas { connected }.
// Story 35.4: useKiwifyConnection / useSetKiwifyConnection / useDeleteKiwifyConnection.
// Espelha use-hotmart.ts (34.4/34.5) com +1 campo (accountId).
//
// Diferenças vs Hotmart (contrato do backend — routes/kiwify.ts + services/kiwify.ts):
//  - mutation de set recebe { clientId, clientSecret, accountId }.
//  - dashboard usa MoneyByCurrency ({ currency, value }) e expõe gaps honestos
//    (activeSubscriptions/churnRate = null — a Kiwify não tem /subscriptions).

const STALE = 5 * 60 * 1000;

function projBase(projectId: string) {
  return `/api/projects/${projectId}/kiwify`;
}

// ---- Tipos ----

/** Resposta do GET/PUT/DELETE de conexão — só status, nunca segredo. */
export interface KiwifyConnectionResponse {
  connected: boolean;
}

export interface KiwifyProduct {
  id: string;
  name: string;
}

/** Valor monetário por moeda. `value` em CENTAVOS (espelha o backend). */
export interface KiwifyMoneyByCurrency {
  currency: string;
  value: number;
}

export interface KiwifyChargeBucket {
  count: number;
  value: KiwifyMoneyByCurrency[];
}

export interface KiwifyStatusCount {
  status: string;
  count: number;
}

/**
 * Contrato de saída do dashboard de recorrência (espelha KiwifyDashboard do
 * backend). `activeSubscriptions` e `churnRate` são gaps honestos (null) — a
 * Kiwify não expõe estado de assinatura via pull (fase 2 / webhooks).
 */
export interface KiwifyDashboard {
  /** Σ net_amount (centavos) de paid/approved no período, por moeda. */
  recurringRevenue: KiwifyMoneyByCurrency[];
  /** receita recorrente dos últimos 30 dias (MRR aproximado), por moeda. */
  mrrApprox: KiwifyMoneyByCurrency[];
  charges: {
    /** status paid + approved */
    paid: KiwifyChargeBucket;
    /** refunded + refund_requested + pending_refund */
    refunded: KiwifyChargeBucket;
    /** chargedback */
    chargeback: KiwifyChargeBucket;
    /** waiting_payment + pending + processing + authorized */
    pending: KiwifyChargeBucket;
    /** refused (sem valor — não houve receita) */
    refused: { count: number };
  };
  /** taxa de reembolso (%) de /stats */
  refundRate: number;
  /** taxa de chargeback (%) de /stats */
  chargebackRate: number;
  /** parent_order_id vazio (novo) vs preenchido (renovação) */
  newVsRenewal: { new: number; renewal: number };
  statusDistribution: KiwifyStatusCount[];
  currencyPrimary: string;
  /** GAP honesto — não disponível via pull (fase 2 / webhooks). */
  activeSubscriptions: null;
  /** GAP honesto — não disponível via pull (fase 2 / webhooks). */
  churnRate: null;
}

// ---- Conexão (projeto) — Story 35.4 ----

// GET /api/projects/:projectId/kiwify/connection -> { connected }
export function useKiwifyConnection(projectId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-connection", projectId],
    queryFn: () => apiClient<KiwifyConnectionResponse>(`${projBase(projectId)}/connection`),
    staleTime: STALE,
  });
}

// PUT /api/projects/:projectId/kiwify/connection  body { clientId, clientSecret, accountId }
export function useSetKiwifyConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { clientId: string; clientSecret: string; accountId: string }) =>
      apiClient<KiwifyConnectionResponse>(`${projBase(projectId)}/connection`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["kiwify-products", projectId] });
    },
  });
}

// DELETE /api/projects/:projectId/kiwify/connection
export function useDeleteKiwifyConnection(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<KiwifyConnectionResponse>(`${projBase(projectId)}/connection`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiwify-connection", projectId] });
      qc.invalidateQueries({ queryKey: ["kiwify-products", projectId] });
    },
  });
}

// ---- Produtos + Dashboard ----

// GET /api/projects/:projectId/kiwify/products?months=N -> { products }
export function useKiwifyProducts(projectId: string, opts: { months: number; enabled: boolean }) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-products", projectId, opts.months],
    queryFn: () =>
      apiClient<{ products: KiwifyProduct[] }>(
        `${projBase(projectId)}/products?months=${opts.months}`,
      ),
    enabled: opts.enabled,
    staleTime: STALE,
  });
}

// GET /api/projects/:projectId/kiwify/dashboard?productId=&months=N -> KiwifyDashboard
export function useKiwifyDashboard(
  projectId: string,
  opts: { productId: string | null; months: number; enabled: boolean },
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["kiwify-dashboard", projectId, opts.productId, opts.months],
    queryFn: () =>
      apiClient<KiwifyDashboard>(
        `${projBase(projectId)}/dashboard?productId=${encodeURIComponent(
          opts.productId ?? "",
        )}&months=${opts.months}`,
      ),
    enabled: opts.enabled && !!opts.productId,
    staleTime: STALE,
  });
}
