"use client";

/**
 * Mapa do funil: blocos e conectores desenhados sobre o lançamento.
 *
 * O documento inteiro vai e volta numa chamada só — o canvas edita tudo junto,
 * e salvar por peça deixaria o desenho meio gravado quando algo falhasse.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StatusBloco } from "@/lib/utils/funnel-map-palette";

export interface BlocoDoMapa {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  status: StatusBloco;
  /** Etapa do Loyola X que este bloco representa, quando representa. */
  stageId?: string | null;
  notes?: string | null;
  url?: string | null;
  /** Nota adesiva e bloco de texto guardam o conteúdo aqui, não no `label`. */
  texto?: string | null;
  estilo?: "h1" | "h2" | "h3" | "corpo" | null;
  negrito?: boolean;
  italico?: boolean;
  fonte?: number | null;
  emoji?: string | null;
}

export type PontoDeConexao = "top" | "right" | "bottom" | "left";

export interface ConectorDoMapa {
  id: string;
  fromBox: string;
  fromPoint: PontoDeConexao;
  toBox: string;
  toPoint: PontoDeConexao;
  type: "solid" | "dashed";
  label?: string | null;
}

export interface AbaDoMapa {
  id: string;
  name: string;
  boxes: BlocoDoMapa[];
  connectors: ConectorDoMapa[];
}

export interface MapaDoFunil {
  tabs: AbaDoMapa[];
  /**
   * O desenho ainda não foi salvo por ninguém: o que veio é uma sugestão
   * montada a partir das etapas cadastradas. A tela avisa, para não parecer
   * que alguém já desenhou aquilo.
   */
  rascunho: boolean;
  updatedAt: string | null;
}

function base(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/map`;
}

export function useFunnelMap(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-map", projectId, funnelId, stageId],
    queryFn: () => apiClient<MapaDoFunil>(base(projectId, funnelId, stageId)),
    staleTime: 60 * 1000,
  });
}

export function useSaveFunnelMap(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tabs: AbaDoMapa[]) =>
      apiClient<{ ok: true; updatedAt: string }>(base(projectId, funnelId, stageId), {
        method: "PUT",
        body: JSON.stringify({ tabs }),
      }),
    onSuccess: () => {
      // Só marca como salvo; não refaz a query, senão o canvas piscaria de volta
      // para o servidor no meio da edição.
      qc.setQueryData<MapaDoFunil>(["funnel-map", projectId, funnelId, stageId], (atual) =>
        atual ? { ...atual, rascunho: false } : atual,
      );
    },
  });
}
