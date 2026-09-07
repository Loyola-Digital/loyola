"use client";

/**
 * Todos os mapas de funil do Loyola X, para a tela global.
 *
 * Lista as etapas do tipo `mapa` de todos os projetos que a pessoa enxerga —
 * inclusive as que ainda ninguém desenhou, senão a única forma de chegar até
 * uma etapa em branco seria navegando projeto por projeto.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  /**
   * Preenchido só no mapa AVULSO, que não mora numa etapa.
   *
   * É o que diz à tela por onde abrir: `null` significa "vá pelo caminho
   * projeto/funil/etapa", como sempre foi.
   */
  mapId: string | null;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  funnelId: string | null;
  funnelName: string | null;
  arquivado: boolean;
  stageId: string | null;
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

/**
 * Cria um mapa da tela Global.
 *
 * Com `funnelId`, o servidor cria a etapa `mapa` no funil e o desenho nasce
 * como qualquer outro. Sem, nasce avulso — para rascunhar o funil de um
 * cliente que ainda não está no sistema — e pode ser vinculado depois.
 */
export function useCriarMapa() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: { name: string; funnelId?: string | null; projectId?: string | null }) =>
      api<{ id: string; stageId: string | null }>("/api/funnel-maps", {
        method: "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funnel-maps-global"] }),
  });
}

/**
 * Duplica um mapa. A cópia nasce sempre AVULSA.
 *
 * Uma etapa tem um mapa só; duplicar dentro dela criaria duas etapas de mesmo
 * nome no funil. A cópia é quase sempre um rascunho — "e se fosse assim?" — e
 * não deveria entrar na estrutura do lançamento antes de alguém decidir.
 */
export function useDuplicarMapa() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) =>
      apiClient<{ id: string; name: string }>(`/api/funnel-maps/${id}/duplicar`, {
        method: "POST",
        body: JSON.stringify(name ? { name } : {}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funnel-maps"] }),
  });
}

export function useExcluirMapaAvulso() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/funnel-maps/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funnel-maps-global"] }),
  });
}

export function useVincularMapa() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, funnelId }: { id: string; funnelId: string }) =>
      api(`/api/funnel-maps/${id}/vincular`, {
        method: "PUT",
        body: JSON.stringify({ funnelId }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funnel-maps-global"] }),
  });
}

/** Renomear o mapa avulso e mudar a empresa dele. */
export function useAtualizarMapa() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dados }: { id: string; name?: string; projectId?: string | null }) =>
      api(`/api/funnel-maps/${id}`, { method: "PUT", body: JSON.stringify(dados) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["funnel-maps-global"] }),
  });
}
