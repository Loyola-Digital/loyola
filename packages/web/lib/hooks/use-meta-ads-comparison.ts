"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { MetaAdsComparisonData } from "@loyola-x/shared";

export function useMetaAdsComparison(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  compareFunnelId: string | null,
  days?: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["meta-ads-comparison", projectId, funnelId, stageId, days ?? 30],
    queryFn: () =>
      apiClient<MetaAdsComparisonData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/meta-ads-comparison?days=${days ?? 30}`
      ),
    enabled: !!projectId && !!funnelId && !!stageId && !!compareFunnelId,
    staleTime: 30 * 1000,
  });
}
