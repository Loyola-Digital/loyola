"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { TipoDeLancamento } from "@loyola-x/shared/src/planejamento-lancamentos";

// Story 48.9 — os lançamentos que podem servir de BASE para este: mesmo
// expert (projeto), mesmo tipo, anteriores.
//
// Story 48.13 — com a API nova, entram também os que NÃO têm simulador salvo
// (a tela mostra só o realizado deles). Os dois campos novos são opcionais de
// propósito: web e API deployam em ciclos diferentes, e com a API antiga eles
// não vêm — `lib/utils/planejamento-referencia.ts` decide o que fazer sem eles.

export interface BaseDisponivel {
  funnelId: string;
  nome: string;
  tipo: TipoDeLancamento;
  rotuloDoTipo: string;
  edicao: number | null;
  criadoEm: string;
  simuladorAtualizadoEm: string | null;
  /**
   * Story 48.13 — `false`: o lançamento não tem Planejamento salvo; serve de
   * base só pelo realizado. Ausente (API antiga) = tinha simulador, porque a
   * API antiga só devolvia esses.
   */
  temSimulador?: boolean;
}

export interface PlanejamentoBasesResponse {
  funnelId: string;
  /** Tipo do PRÓPRIO funil; `null` quando o nome não casa com o dicionário. */
  tipo: TipoDeLancamento | null;
  /**
   * Story 48.13 (AC7, PO-03) — `true`: a lista já inclui os anteriores sem
   * simulador, e uma lista vazia quer dizer "primeiro do tipo". Ausente (API
   * antiga): vazia pode ser só "ninguém tem simulador".
   */
  incluiSemSimulador?: boolean;
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
