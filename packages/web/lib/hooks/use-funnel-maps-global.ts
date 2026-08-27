"use client";

/**
 * Todos os mapas de funil do Loyola X, para a tela global.
 *
 * Lista as etapas do tipo `mapa` de todos os projetos que a pessoa enxerga —
 * inclusive as que ainda ninguém desenhou, senão a única forma de chegar até
 * uma etapa em branco seria navegando projeto por projeto.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

/** Só o que a miniatura desenha: retângulo e cor. */
export interface PreviaDoBloco {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: string;
}

export interface MapaNaLista {
  projectId: string;
  projectName: string;
  projectColor: string | null;
  funnelId: string;
  funnelName: string;
  arquivado: boolean;
  stageId: string;
  stageName: string;
  /** null = etapa criada, desenho ainda não salvo. */
  updatedAt: string | null;
  abas: number;
  blocos: number;
  conectores: number;
  previa: PreviaDoBloco[];
}

export function useFunnelMapsGlobal() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-maps-global"],
    queryFn: () => apiClient<{ mapas: MapaNaLista[] }>("/api/funnel-maps"),
    staleTime: 60 * 1000,
  });
}
