"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RotulosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";

// Story 48.5 — Painel de Planejamento: rótulos dos cinco cenários do Resumo
// Final (aba 4, DV-017 = A). Tudo o mais da aba é consolidação das abas 1–3
// e roda na tela. Rota: `/api/projects/:projectId/funnels/:funnelId/planejamento/resumo`.

export interface PlanejamentoResumoResponse extends RotulosDoSimulador {
  funnelId: string;
  updatedAt: string | null;
}

function basePath(projectId: string, funnelId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/planejamento/resumo`;
}

export function planejamentoResumoQueryKey(projectId: string, funnelId: string) {
  return ["planejamento-resumo", projectId, funnelId] as const;
}

export function usePlanejamentoResumo(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: planejamentoResumoQueryKey(projectId ?? "", funnelId ?? ""),
    queryFn: () => apiClient<PlanejamentoResumoResponse>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
  });
}

export function useSalvarPlanejamentoResumo(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: RotulosDoSimulador) =>
      apiClient<PlanejamentoResumoResponse & { ok: true }>(basePath(projectId, funnelId), {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: (data) => {
      qc.setQueryData(planejamentoResumoQueryKey(projectId, funnelId), {
        funnelId: data.funnelId,
        cenarios: data.cenarios,
        updatedAt: data.updatedAt,
      } satisfies PlanejamentoResumoResponse);
    },
  });
}
