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
  /**
   * Alinhamento do texto dentro do bloco. Vazio = à esquerda.
   *
   * Só vale para nota e bloco de texto: no card de funil o conteúdo é ícone
   * mais rótulo, já centralizado por natureza.
   */
  alinhamento?: "esquerda" | "centro" | "direita" | null;
  negrito?: boolean;
  italico?: boolean;
  fonte?: number | null;
  /** Emoji do bloco livre — só em blocos criados antes da troca por ícone. */
  emoji?: string | null;
  /** Nome do ícone lucide do bloco livre. */
  icone?: string | null;
  /**
   * Bloco `imagem`: o arquivo no bucket.
   *
   * `imageKey` é o caminho no bucket, guardado para poder apagar o objeto
   * quando o bloco sair — só a URL não permite isso.
   */
  imageUrl?: string | null;
  imageKey?: string | null;
  /** Bloco `forma`: qual figura desenhar. Ver `FORMAS`. */
  forma?: string | null;
  /**
   * Referências do Swipe Files presas a este bloco.
   *
   * Só os ids — título, miniatura e tipo vêm da biblioteca na hora de
   * desenhar. Copiar isso para dentro do mapa faria a referência congelar:
   * trocar o print no Swipe Files não alcançaria os mapas que já o citam.
   */
  swipeIds?: string[] | null;
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

/**
 * Endereço do mapa — pelo funil, ou pelo id quando ele é avulso.
 *
 * Um mapa criado do Global sem funil não tem projeto, funil nem etapa: o
 * caminho de sempre simplesmente não existe para ele. As duas formas convivem
 * porque o editor é o mesmo; o que muda é de onde ele lê e para onde grava.
 */
export type EnderecoDoMapa =
  | { tipo: "funil"; projectId: string; funnelId: string; stageId: string }
  | { tipo: "avulso"; mapId: string }
  /** Link público: lê sem login, só leitura. Ver `compartilhado` na rota. */
  | { tipo: "compartilhado"; token: string };

export function urlDoMapa(e: EnderecoDoMapa): string {
  if (e.tipo === "compartilhado") return `/api/compartilhado/mapas/${e.token}`;
  return e.tipo === "avulso"
    ? `/api/funnel-maps/${e.mapId}`
    : base(e.projectId, e.funnelId, e.stageId);
}

export function chaveDoMapa(e: EnderecoDoMapa): (string | undefined)[] {
  if (e.tipo === "compartilhado")
    return ["funnel-map", "compartilhado", e.token];
  return e.tipo === "avulso"
    ? ["funnel-map", "avulso", e.mapId]
    : ["funnel-map", e.projectId, e.funnelId, e.stageId];
}

/** Leitura por endereço. Serve aos dois tipos de mapa. */
export function useMapaPorEndereco(e: EnderecoDoMapa) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: chaveDoMapa(e),
    queryFn: () => apiClient<MapaDoFunil>(urlDoMapa(e)),
    staleTime: 60 * 1000,
    /*
     * O link público é "ao vivo" por polling.
     *
     * 5 segundos: perto o bastante para quem está numa call vendo o dono mexer,
     * e barato — a resposta é o JSON do desenho, sem imagem. SSE seria mais
     * imediato, mas pediria barramento no servidor e quebraria em silêncio com
     * mais de uma instância da API. Pausa sozinho com a aba em segundo plano.
     */
    refetchInterval: e.tipo === "compartilhado" ? 5_000 : false,
    // Link revogado devolve 404; tentar de novo só atrasaria a mensagem.
    retry: e.tipo === "compartilhado" ? false : 3,
  });
}

export function useSalvarMapaPorEndereco(e: EnderecoDoMapa) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tabs: AbaDoMapa[]) =>
      apiClient<{ ok: true; updatedAt: string }>(urlDoMapa(e), {
        method: "PUT",
        body: JSON.stringify({ tabs }),
      }),
    onSuccess: (_resposta, tabs) => {
      /**
       * O cache recebe o que ACABOU de ser salvo.
       *
       * Antes marcava só `rascunho: false` e deixava as `tabs` antigas ali. O
       * desenho no servidor estava certo, mas com `staleTime` de um minuto
       * quem saía do funil e voltava dentro desse intervalo recebia o cache —
       * e via o mapa como estava ANTES de salvar. Só um F5 mostrava o certo, o
       * que faz o save parecer que não funcionou.
       *
       * Continua sem refazer a query: um `invalidate` aqui traria o servidor
       * por cima de quem já voltou a editar, e o canvas piscaria no meio do
       * trabalho. Escrever o que foi salvo mantém o cache verdadeiro sem
       * nenhuma ida à rede.
       */
      qc.setQueryData<MapaDoFunil>(chaveDoMapa(e), (atual) =>
        atual ? { ...atual, tabs, rascunho: false } : atual,
      );
    },
  });
}

export function useFunnelMap(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-map", projectId, funnelId, stageId],
    queryFn: () => apiClient<MapaDoFunil>(base(projectId, funnelId, stageId)),
    staleTime: 60 * 1000,
  });
}

export function useSaveFunnelMap(
  projectId: string,
  funnelId: string,
  stageId: string,
) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tabs: AbaDoMapa[]) =>
      apiClient<{ ok: true; updatedAt: string }>(
        base(projectId, funnelId, stageId),
        {
          method: "PUT",
          body: JSON.stringify({ tabs }),
        },
      ),
    onSuccess: (_resposta, tabs) => {
      // Mesmo motivo do `useSalvarMapaPorEndereco`: sem gravar as `tabs`, o
      // cache serve o desenho de antes do save por um minuto inteiro.
      qc.setQueryData<MapaDoFunil>(
        ["funnel-map", projectId, funnelId, stageId],
        (atual) => (atual ? { ...atual, tabs, rascunho: false } : atual),
      );
    },
  });
}

// ---- Compartilhar por link ------------------------------------------------

const chaveDoLink = (mapId: string | null) =>
  ["funnel-map-link", mapId] as const;

/** O token atual, ou `null` quando o mapa não está compartilhado. */
export function useLinkDoMapa(mapId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: chaveDoLink(mapId),
    queryFn: () =>
      apiClient<{ token: string | null }>(
        `/api/funnel-maps/${mapId}/compartilhar`,
      ),
    enabled: Boolean(mapId),
  });
}

/** Liga o link. Idempotente: se já existe, o servidor devolve o mesmo. */
export function useLigarLink(mapId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ token: string }>(`/api/funnel-maps/${mapId}/compartilhar`, {
        method: "POST",
      }),
    onSuccess: (r) => qc.setQueryData(chaveDoLink(mapId), r),
  });
}

/** Revoga: o link antigo para de funcionar na hora e nunca volta a valer. */
export function useRevogarLink(mapId: string | null) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<{ token: null }>(`/api/funnel-maps/${mapId}/compartilhar`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.setQueryData(chaveDoLink(mapId), { token: null }),
  });
}
