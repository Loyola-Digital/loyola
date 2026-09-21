"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";

// Story 48.1 — Painel de Planejamento: Inputs Financeiros do funil de lançamento.
//
// A API guarda e devolve SÓ as 26 entradas escalares (AC1/E5); toda derivação
// roda na tela com `derivarInputsFinanceiros` do shared. Rota escopada por
// projeto (PO-01): `/api/projects/:projectId/funnels/:funnelId/planejamento/inputs`.

/** As 26 entradas como a API devolve: `number | null`, nunca `undefined`. */
export type InputsFinanceirosPersistidos = { [K in keyof InputsFinanceiros]: number | null };

export interface PlanejamentoInputsResponse {
  funnelId: string;
  inputs: InputsFinanceirosPersistidos;
  /** ISO; `null` quando o funil nunca salvou. */
  updatedAt: string | null;
}

function basePath(projectId: string, funnelId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/planejamento/inputs`;
}

export function planejamentoInputsQueryKey(projectId: string, funnelId: string) {
  return ["planejamento-inputs", projectId, funnelId] as const;
}

export function usePlanejamentoInputs(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: planejamentoInputsQueryKey(projectId ?? "", funnelId ?? ""),
    queryFn: () => apiClient<PlanejamentoInputsResponse>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
  });
}

export function useSalvarPlanejamentoInputs(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inputs: InputsFinanceirosPersistidos) =>
      apiClient<PlanejamentoInputsResponse & { ok: true }>(basePath(projectId, funnelId), {
        method: "PUT",
        body: JSON.stringify(inputs),
      }),
    onSuccess: (data) => {
      qc.setQueryData(planejamentoInputsQueryKey(projectId, funnelId), {
        funnelId: data.funnelId,
        inputs: data.inputs,
        updatedAt: data.updatedAt,
      } satisfies PlanejamentoInputsResponse);
    },
  });
}
