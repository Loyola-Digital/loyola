"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PerpetualUpsellSpreadsheet,
  PerpetualUpsellData,
  SaleColumnMapping,
} from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

// ---- Planilha de Upsell High Ticket ----
export function usePerpetualUpsellSpreadsheet(
  projectId: string | null,
  funnelId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-upsell-spreadsheet", projectId, funnelId],
    queryFn: () =>
      apiClient<PerpetualUpsellSpreadsheet | null>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-upsell-spreadsheet`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

export interface UpsertPerpetualUpsellSpreadsheetInput {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
}

function invalidateUpsell(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string,
  funnelId: string,
) {
  qc.invalidateQueries({ queryKey: ["perpetual-upsell-spreadsheet", projectId, funnelId] });
  qc.invalidateQueries({ queryKey: ["perpetual-upsell-data", projectId, funnelId] });
}

export function useConnectPerpetualUpsellSpreadsheet(
  projectId: string,
  funnelId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpsertPerpetualUpsellSpreadsheetInput) =>
      apiClient<PerpetualUpsellSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-upsell-spreadsheet`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      invalidateUpsell(queryClient, projectId, funnelId);
    },
  });
}

export function useDisconnectPerpetualUpsellSpreadsheet(
  projectId: string,
  funnelId: string,
) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-upsell-spreadsheet`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      invalidateUpsell(queryClient, projectId, funnelId);
    },
  });
}

// ---- Dados de cross-sell ----
export function usePerpetualUpsellData(
  projectId: string | null,
  funnelId: string | null,
  days?: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-upsell-data", projectId, funnelId, days ?? null, startDate ?? null, endDate ?? null],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (startDate && endDate) {
        qs.set("startDate", startDate);
        qs.set("endDate", endDate);
      } else if (days) {
        qs.set("days", String(days));
      }
      const q = qs.toString();
      return apiClient<PerpetualUpsellData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual-upsell/data${q ? `?${q}` : ""}`,
      );
    },
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}
