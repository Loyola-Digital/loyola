"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { StageSalesData, StageSalesSubtype } from "@loyola-x/shared";

const STALE_TIME = 5 * 60 * 1000;

export function useStageSalesData(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  subtype: StageSalesSubtype,
  days?: number
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-sales-data", projectId, funnelId, stageId, subtype, days],
    queryFn: () => {
      const qs = new URLSearchParams({ subtype });
      if (days) qs.set("days", String(days));
      return apiClient<StageSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-data?${qs}`
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
