"use client";

/**
 * Comentários no mapa de funil.
 *
 * ## Separados do desenho, e por quê
 *
 * O mapa é gravado inteiro a cada save. Se o comentário morasse no mesmo
 * documento, quem arrastasse um bloco apagaria o que outra pessoa acabou de
 * escrever — e duas comentando ao mesmo tempo perderiam uma a outra.
 *
 * Sendo outra rota, o comentário nasce sem tocar no desenho e sobrevive a
 * qualquer edição dele.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

export interface ComentarioDoMapa {
  id: string;
  tabId: string;
  /** Vazio = comentário que abre a conversa. Preenchido = resposta. */
  parentId: string | null;
  /** Bloco a que se refere. Vazio = alfinete solto no fundo. */
  boxId: string | null;
  x: number;
  y: number;
  texto: string;
  resolvido: boolean;
  createdAt: string;
  autorId: string | null;
  autor: string | null;
}

/** Uma conversa: o comentário que abre, mais o que veio depois. */
export interface ConversaDoMapa extends ComentarioDoMapa {
  respostas: ComentarioDoMapa[];
}

function chave(mapId: string | null) {
  return ["mapa-comentarios", mapId] as const;
}

/**
 * Agrupa a lista plana em conversas.
 *
 * O servidor devolve tudo numa lista só, ordenada por data. Montar a árvore
 * aqui evita duas consultas e mantém a ordem: as respostas ficam na sequência
 * em que foram escritas.
 */
export function emConversas(lista: ComentarioDoMapa[]): ConversaDoMapa[] {
  const raizes = lista.filter((c) => !c.parentId).map((c) => ({ ...c, respostas: [] as ComentarioDoMapa[] }));
  const porId = new Map(raizes.map((c) => [c.id, c]));
  for (const c of lista) {
    if (!c.parentId) continue;
    // Resposta cujo pai sumiu é descartada em silêncio: apagar a conversa já
    // leva as respostas por CASCADE, então isto só aconteceria com dado velho.
    porId.get(c.parentId)?.respostas.push(c);
  }
  return raizes;
}

export function useComentariosDoMapa(mapId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: chave(mapId),
    queryFn: () => api<{ comentarios: ComentarioDoMapa[] }>(`/api/funnel-maps/${mapId}/comentarios`),
    enabled: Boolean(mapId),
    // Comentário é assíncrono por natureza: alguém escreve enquanto o outro
    // desenha. Meio minuto é curto o bastante para a conversa fluir e longo o
    // bastante para não pesar num mapa aberto a tarde toda.
    refetchInterval: 30_000,
  });
}

export function useComentar(mapId: string | null) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dados: {
      tabId: string;
      texto: string;
      parentId?: string | null;
      boxId?: string | null;
      x?: number;
      y?: number;
    }) =>
      api(`/api/funnel-maps/${mapId}/comentarios`, {
        method: "POST",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chave(mapId) }),
  });
}

export function useAtualizarComentario(mapId: string | null) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...dados
    }: {
      id: string;
      texto?: string;
      resolvido?: boolean;
      x?: number;
      y?: number;
    }) =>
      api(`/api/funnel-maps/comentarios/${id}`, {
        method: "PUT",
        body: JSON.stringify(dados),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chave(mapId) }),
  });
}

export function useApagarComentario(mapId: string | null) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/funnel-maps/comentarios/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chave(mapId) }),
  });
}
