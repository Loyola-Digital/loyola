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
      queryClient.invalidateQueries({
        queryKey: ["manual-sales", projectId, funnelId, stageId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ["manual-sales", projectId, funnelId, stageId],
      });
    },
  });
}

export { buildKey as buildManualSalesKey };
