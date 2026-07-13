"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  StageSalesSpreadsheet,
  SaleColumnMapping,
  StageSalesSubtype,
  StageSalesProductsResponse,
} from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

export function useStageSalesSpreadsheets(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-sales-spreadsheets", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageSalesSpreadsheet[]>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets`
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}

export interface ConnectSaleSpreadsheetInput {
  subtype: StageSalesSubtype;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
}

// Invalida metadata E os dados agregados (faturamento/vendas/canais). Sem
// invalidar stage-sales-data, conectar outra planilha mantém os KPIs da
// planilha antiga em cache até reload.
function invalidateStageSalesData(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId: string,
  stageId: string
) {
  qc.invalidateQueries({ queryKey: ["stage-sales-spreadsheets", projectId, funnelId, stageId] });
  qc.invalidateQueries({ queryKey: ["stage-sales-data", projectId, funnelId, stageId] });
}

export function useConnectSaleSpreadsheet(
  projectId: string,
  funnelId: string,
  stageId: string
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConnectSaleSpreadsheetInput) =>
      apiClient<StageSalesSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      invalidateStageSalesData(queryClient, projectId, funnelId, stageId);
    },
  });
}

export function useDisconnectSaleSpreadsheet(
  projectId: string,
  funnelId: string,
  stageId: string
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subtype: StageSalesSubtype) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/${subtype}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      invalidateStageSalesData(queryClient, projectId, funnelId, stageId);
    },
  });
}

export interface UpdateSaleSpreadsheetInput {
  id: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  /** Story 18.51a: opcional — preserva marcação existente quando ausente. */
  orderBumpProducts?: string[];
}

// Story 18.51a: lista os productName distintos da planilha (via id) pro wizard
// de order bumps. Não usa staleTime longo — reflete edições recentes.
export function useStageSalesProducts(
  projectId: string,
  funnelId: string,
  stageId: string,
  spreadsheetId: string | null,
  enabled: boolean
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-sales-products", projectId, funnelId, stageId, spreadsheetId],
    queryFn: () =>
      apiClient<StageSalesProductsResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/by-id/${spreadsheetId}/products`
      ),
    enabled: enabled && !!projectId && !!funnelId && !!stageId && !!spreadsheetId,
    staleTime: 30 * 1000,
  });
}

// Story 18.51a: salva só a marcação de order bumps. Reenvia os campos
// existentes da planilha (o PUT exige mapping), variando só orderBumpProducts.
export interface UpdateOrderBumpsInput {
  current: StageSalesSpreadsheet;
  orderBumpProducts: string[];
}

export function useUpdateOrderBumps(
  projectId: string,
  funnelId: string,
  stageId: string
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ current, orderBumpProducts }: UpdateOrderBumpsInput) =>
      apiClient<StageSalesSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/by-id/${current.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            spreadsheetId: current.spreadsheetId,
            spreadsheetName: current.spreadsheetName,
            sheetName: current.sheetName,
            columnMapping: current.columnMapping,
            orderBumpProducts,
          }),
        }
      ),
    onSuccess: () => {
      invalidateStageSalesData(queryClient, projectId, funnelId, stageId);
      queryClient.invalidateQueries({ queryKey: ["stage-sales-products", projectId, funnelId, stageId] });
    },
  });
}

// Atualiza uma planilha específica por id (edita mapeamento sem remapear tudo).
export function useUpdateSaleSpreadsheetById(
  projectId: string,
  funnelId: string,
  stageId: string
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateSaleSpreadsheetInput) =>
      apiClient<StageSalesSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/by-id/${id}`,
        { method: "PUT", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      invalidateStageSalesData(queryClient, projectId, funnelId, stageId);
    },
  });
}

// Deleta planilha específica por id (etapa Vendas tem N planilhas com
// subtype='sales'; subtype-only delete apagaria todas).
export function useDeleteSaleSpreadsheetById(
  projectId: string,
  funnelId: string,
  stageId: string
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-spreadsheets/by-id/${id}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      invalidateStageSalesData(queryClient, projectId, funnelId, stageId);
    },
  });
}
