"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { RealizadoDaApi } from "@/lib/utils/planejamento-realizado";

// Story 48.11 — o realizado de um lançamento: investimento Meta por
// temperatura e as etapas do funil. Chamado com o `funnelId` da BASE, como os
// outros hooks do painel na Story 48.9.
//
// `retry: false` de propósito: numa API ainda sem esta rota, o 404 é resposta
// definitiva, e insistir só atrasaria a tela — que funciona sem ela (AC9).

export function usePlanejamentoRealizado(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["planejamento-realizado", projectId ?? "", funnelId ?? ""],
    queryFn: () =>
      apiClient<RealizadoDaApi>(`/api/projects/${projectId!}/funnels/${funnelId!}/planejamento/realizado`),
    enabled: !!projectId && !!funnelId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
