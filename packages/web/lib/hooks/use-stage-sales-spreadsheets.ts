"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { StageSalesSpreadsheet, SaleColumnMapping, StageSalesSubtype } from "@loyola-x/shared";

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
      queryClient.invalidateQueries({
        queryKey: ["stage-sales-spreadsheets", projectId, funnelId, stageId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["stage-sales-spreadsheets", projectId, funnelId, stageId],
      });
    },
  });
}
