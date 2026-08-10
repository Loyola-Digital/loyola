"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PerpetualSpreadsheet,
  SaleColumnMapping,
  SalesPlatform,
  PerpetualProduct,
  PerpetualProductType,
} from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

export function usePerpetualSpreadsheet(
  projectId: string | null,
  funnelId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-spreadsheet", projectId, funnelId],
    queryFn: () =>
      apiClient<PerpetualSpreadsheet | null>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-spreadsheet`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

export interface UpsertPerpetualSpreadsheetInput {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  platform?: SalesPlatform | null;
}

function invalidatePerpetualSpreadsheet(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId: string,
) {
  qc.invalidateQueries({ queryKey: ["perpetual-spreadsheet", projectId, funnelId] });
  // Pre-invalidação pra story 29.4 (dados agregados consumindo a planilha)
  qc.invalidateQueries({ queryKey: ["perpetual-sales-data", projectId, funnelId] });
}

export function useConnectPerpetualSpreadsheet(
  projectId: string,
  funnelId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertPerpetualSpreadsheetInput) =>
      apiClient<PerpetualSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-spreadsheet`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      invalidatePerpetualSpreadsheet(queryClient, projectId, funnelId);
    },
  });
}

export function useDisconnectPerpetualSpreadsheet(
  projectId: string,
  funnelId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-spreadsheet`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidatePerpetualSpreadsheet(queryClient, projectId, funnelId);
    },
  });
}

// ============================================================
// Story 29.49 — classificação de produtos (principal / order bump / upsell).
// ============================================================

export interface PerpetualProductsResponse {
  /**
   * `false` = a coluna Produto não foi mapeada no wizard (ou sumiu da
   * planilha). Distinto de `products: []`, que é "a coluna existe e não há
   * produto nenhum" — as duas pedem ações diferentes do gestor.
   */
  productMapped: boolean;
  products: PerpetualProduct[];
}

export function usePerpetualProducts(
  projectId: string | null,
  funnelId: string | null,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-products", projectId, funnelId],
    queryFn: () =>
      apiClient<PerpetualProductsResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-spreadsheet/products`,
      ),
    enabled: !!projectId && !!funnelId && enabled,
    staleTime: STALE_TIME,
  });
}

export function useSavePerpetualProductTypes(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productTypes: Record<string, PerpetualProductType>) =>
      apiClient<PerpetualSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-spreadsheet/product-types`,
        { method: "PUT", body: JSON.stringify({ productTypes }) },
      ),
    onSuccess: () => {
      invalidatePerpetualSpreadsheet(queryClient, projectId, funnelId);
      // A lista de produtos carrega o tipo de cada um — sem invalidar, o
      // diálogo reabre mostrando a classificação anterior.
      queryClient.invalidateQueries({ queryKey: ["perpetual-products", projectId, funnelId] });
    },
  });
}
