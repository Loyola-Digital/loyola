"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface StageSalesConversion {
  captureBuyers: number;
  mainBuyers: number;
  crossBuyers: number;
  captureRevenue: number;
  mainRevenue: number;
  crossRevenue: number;
  conversionRate: number;
  hasCapture: boolean;
  hasMain: boolean;
}

const STALE_TIME = 60 * 1000;

export function useStageSalesConversion(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-sales-conversion", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageSalesConversion>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-conversion`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
