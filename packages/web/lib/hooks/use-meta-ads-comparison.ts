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
    // `days` NÃO entra na key: o backend ignora o período (usa janela fixa de 730d
    // pra alinhar Dia 1 × Dia 1), então trocar o range do dashboard não muda a
    // resposta — manter days na key só dispararia refetch redundante.
    queryKey: ["meta-ads-comparison", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<MetaAdsComparisonData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/meta-ads-comparison?days=${days ?? 30}`
      ),
    enabled: !!projectId && !!funnelId && !!stageId && !!compareFunnelId,
    staleTime: 30 * 1000,
  });
}
