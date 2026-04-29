"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { StageSalesSubtype } from "@loyola-x/shared";

export interface StageHotColdBuyersResponse {
  hot: number;
  cold: number;
  outros: number;
  total: number;
  items: {
    hot: string[];
    cold: string[];
    outros: string[];
  };
  /** false quando a coluna utm_term não está mapeada na planilha */
  hasMapping: boolean;
  /** true quando ainda não há vendas/dados pra agregar */
  semDados: boolean;
}

const STALE_TIME = 30 * 1000;

export function useStageHotColdBuyers(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  subtype: StageSalesSubtype,
  days?: number,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-hot-cold-buyers", projectId, funnelId, stageId, subtype, days],
    queryFn: () => {
      const qs = new URLSearchParams({ subtype });
      if (days) qs.set("days", String(days));
      return apiClient<StageHotColdBuyersResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/hot-cold-buyers?${qs}`,
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
