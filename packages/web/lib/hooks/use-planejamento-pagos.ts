"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PagosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";

// Story 48.4 — Painel de Planejamento: blocos por fonte paga e as cinco
// combinações (aba 3). A API guarda e devolve SÓ entradas (E5).
// Rota: `/api/projects/:projectId/funnels/:funnelId/planejamento/pagos`.

export interface PlanejamentoPagosResponse extends PagosDoSimulador {
  funnelId: string;
  /** ISO; `null` quando o funil nunca salvou a aba 3. */
  updatedAt: string | null;
}

function basePath(projectId: string, funnelId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/planejamento/pagos`;
}

export function planejamentoPagosQueryKey(projectId: string, funnelId: string) {
  return ["planejamento-pagos", projectId, funnelId] as const;
}

export function usePlanejamentoPagos(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: planejamentoPagosQueryKey(projectId ?? "", funnelId ?? ""),
    queryFn: () => apiClient<PlanejamentoPagosResponse>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
  });
}

export function useSalvarPlanejamentoPagos(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: PagosDoSimulador) =>
      apiClient<PlanejamentoPagosResponse & { ok: true }>(basePath(projectId, funnelId), {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: (data) => {
      qc.setQueryData(planejamentoPagosQueryKey(projectId, funnelId), {
        funnelId: data.funnelId,
        blocos: data.blocos,
        combinacoes: data.combinacoes,
        updatedAt: data.updatedAt,
      } satisfies PlanejamentoPagosResponse);
    },
  });
}
