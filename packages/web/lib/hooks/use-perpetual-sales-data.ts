"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { PerpetualSalesData, PerpetualSalesDataDaily } from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

export function usePerpetualSalesData(
  projectId: string | null,
  funnelId: string | null,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data", projectId, funnelId, days],
    queryFn: () =>
      apiClient<PerpetualSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data?days=${days}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

export function usePerpetualSalesDataDaily(
  projectId: string | null,
  funnelId: string | null,
  days: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data-daily", projectId, funnelId, days],
    queryFn: () =>
      apiClient<PerpetualSalesDataDaily>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily?days=${days}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}
