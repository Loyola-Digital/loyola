"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateManualSaleInput,
  ManualSale,
  ManualSalesResponse,
} from "@loyola-x/shared";

const STALE_TIME = 30 * 1000;

function buildKey(projectId: string, funnelId: string, stageId: string, days: number) {
  return ["manual-sales", projectId, funnelId, stageId, days] as const;
}

/**
 * Invalida TODAS as queries que dependem de vendas manuais da etapa, pra a venda
 * aparecer na hora (sem F5): a lista bruta (manual-sales), a lista unificada
 * exibida na tela (all-sales) e o Mapa do Evento (event-map, status "comprou").
 * Prefixo parcial → cobre qualquer subtype/days.
 */
function invalidateSalesQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  for (const key of ["manual-sales", "all-sales", "event-map"]) {
    queryClient.invalidateQueries({ queryKey: [key, projectId, funnelId, stageId] });
  }
}

export interface EligibleSeller {
  userId: string;
  name: string;
  email: string;
}

/**
 * Vendedores elegíveis (owner + project_members) — usado no Select do
 * modal de venda manual. Necessário porque o owner do projeto não vira
 * row automática em project_members.
 */
export function useEligibleSellers(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["manual-sales-sellers", projectId],
    queryFn: () =>
      apiClient<EligibleSeller[]>(`/api/projects/${projectId}/manual-sales/sellers`),
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
}

export function useManualSales(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["manual-sales", projectId, funnelId, stageId, days],
    queryFn: () =>
      apiClient<ManualSalesResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales?days=${days}`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}

export function useCreateManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateManualSaleInput) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export function useDeleteManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) =>
      apiClient<{ success: true }>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export function useUpdateManualSale(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      saleId,
      input,
    }: {
      saleId: string;
      input: Partial<CreateManualSaleInput>;
    }) =>
      apiClient<ManualSale>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/manual-sales/${saleId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      invalidateSalesQueries(queryClient, projectId, funnelId, stageId);
    },
  });
}

export { buildKey as buildManualSalesKey };

// ============================================================
// Story 19.9 ext — all-sales unificado (manual + planilha)
// ============================================================

export interface UnifiedSale {
  id: string;
  source: "manual" | "spreadsheet";
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  product: string | null;
  value: number;
  sellerName: string | null;
  saleDate: string | null;
  invoiceStatus: "emitida" | "pendente" | null;
  manualSaleId: string | null;
  /** Rótulo da fonte da venda (ex: "TMB"). null = sem rótulo especial. */
  sourceLabel: string | null;
  /** Story 19.10 — valor recebido (Caixa) e negociação (evento presencial). */
  valorRecebido: number | null;
  negociacao: string | null;
}

export interface AllSalesResponse {
  sales: UnifiedSale[];
  summary: {
    totalSales: number;
    totalRevenue: number;
    manualSales: number;
    manualRevenue: number;
    spreadsheetSales: number;
    spreadsheetRevenue: number;
  };
}

export function useAllSales(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  // "all", um subtype único, ou lista CSV (ex: "main_product,tmb").
  // Vendas manuais sempre entram, independente do subtype.
  subtype: "capture" | "main_product" | "sales" | "tmb" | "all" | (string & {}),
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["all-sales", projectId, funnelId, stageId, subtype, days],
    queryFn: () =>
      apiClient<AllSalesResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/all-sales?subtype=${encodeURIComponent(subtype)}&days=${days}`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
