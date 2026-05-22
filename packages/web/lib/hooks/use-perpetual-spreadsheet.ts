"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PerpetualSpreadsheet, SaleColumnMapping } from "@loyola-x/shared";

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
