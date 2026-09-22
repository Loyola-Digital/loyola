"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganicosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";

// Story 48.3 — Painel de Planejamento: blocos por canal orgânico e as cinco
// combinações (aba 2). A API guarda e devolve SÓ entradas (E5); grades,
// cadeia de deduções e resumo rodam na tela com o shared.
// Rota: `/api/projects/:projectId/funnels/:funnelId/planejamento/organicos`.

export interface PlanejamentoOrganicosResponse extends OrganicosDoSimulador {
  funnelId: string;
  /** ISO; `null` quando o funil nunca salvou a aba 2. */
  updatedAt: string | null;
}

function basePath(projectId: string, funnelId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/planejamento/organicos`;
}

export function planejamentoOrganicosQueryKey(projectId: string, funnelId: string) {
  return ["planejamento-organicos", projectId, funnelId] as const;
}

export function usePlanejamentoOrganicos(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: planejamentoOrganicosQueryKey(projectId ?? "", funnelId ?? ""),
    queryFn: () => apiClient<PlanejamentoOrganicosResponse>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
  });
}

export function useSalvarPlanejamentoOrganicos(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: OrganicosDoSimulador) =>
      apiClient<PlanejamentoOrganicosResponse & { ok: true }>(basePath(projectId, funnelId), {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: (data) => {
      qc.setQueryData(planejamentoOrganicosQueryKey(projectId, funnelId), {
        funnelId: data.funnelId,
        blocos: data.blocos,
        combinacoes: data.combinacoes,
        updatedAt: data.updatedAt,
      } satisfies PlanejamentoOrganicosResponse);
    },
  });
}
