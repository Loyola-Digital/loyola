"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { PerpetualSalesData, PerpetualSalesDataDaily } from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

function buildRangeQuery(days: number, startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `startDate=${startDate}&endDate=${endDate}`;
  return `days=${days}`;
}

export function usePerpetualSalesData(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data", projectId, funnelId, days, startDate, endDate],
    queryFn: () =>
      apiClient<PerpetualSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data?${buildRangeQuery(days, startDate, endDate)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

export function usePerpetualSalesDataDaily(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data-daily", projectId, funnelId, days, startDate, endDate],
    queryFn: () =>
      apiClient<PerpetualSalesDataDaily>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily?${buildRangeQuery(days, startDate, endDate)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}
