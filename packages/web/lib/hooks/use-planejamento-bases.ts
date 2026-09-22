"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { TipoDeLancamento } from "@loyola-x/shared/src/planejamento-lancamentos";

// Story 48.9 — os lançamentos que podem servir de BASE para este: mesmo
// expert (projeto), mesmo tipo, anteriores, e com simulador salvo.

export interface BaseDisponivel {
  funnelId: string;
  nome: string;
  tipo: TipoDeLancamento;
  rotuloDoTipo: string;
  edicao: number | null;
  criadoEm: string;
  simuladorAtualizadoEm: string | null;
}

export interface PlanejamentoBasesResponse {
  funnelId: string;
  /** Tipo do PRÓPRIO funil; `null` quando o nome não casa com o dicionário. */
  tipo: TipoDeLancamento | null;
  bases: BaseDisponivel[];
}

export function usePlanejamentoBases(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["planejamento-bases", projectId ?? "", funnelId ?? ""],
    queryFn: () =>
      apiClient<PlanejamentoBasesResponse>(`/api/projects/${projectId!}/funnels/${funnelId!}/planejamento/bases`),
    enabled: !!projectId && !!funnelId,
  });
}
