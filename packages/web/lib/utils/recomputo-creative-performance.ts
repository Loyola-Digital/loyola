// Story 18.81 — o botão "Atualizar" e o cache de `creative-performance`.
//
// A rota guarda a resposta no banco por 2h (public_metrics_cache) e só recomputa
// ao vivo com `?refresh=1`. O comentário da rota dizia que o botão Atualizar
// passava esse parâmetro — mas nenhum hook passava: o botão só invalidava o
// React Query, o refetch batia na API, a API achava o cache com menos de 2h e
// devolvia a MESMA resposta. Foi assim que a LPB ficou invisível: cache
// computado antes de a campanha gastar, e o botão que devia resolver não
// resolvia (D1 da story).
//
// O desenho: o botão PEDE recomputo para as queries que estão na tela (chave
// `stageId:days`); o queryFn CONSOME o pedido uma única vez e só nessa chamada
// põe `&refresh=1` na URL. Navegação normal continua lendo o cache de 2h —
// cada abertura de tela não pode virar 25s de Meta.
//
// Tudo aqui é puro para o vitest do web (que só coleta lib/utils) provar a URL
// que vai ser enviada — o tipo aceitar `refresh` não prova que ele vai na
// chamada.

/** Prefixo da queryKey compartilhada pelas duas tabelas (Criativos e LPs). */
export const CHAVE_CREATIVE_PERFORMANCE = "stage-creative-performance";

/** Mesma forma da chave do cache na rota (`${stageId}:${days}`), sem o sufixo de versão. */
export function chaveDeRecomputo(stageId: string, days: number): string {
  return `${stageId}:${days}`;
}

/**
 * Extrai a chave de recomputo de uma queryKey do React Query no formato
 * `[CHAVE_CREATIVE_PERFORMANCE, funnelId, stageId, days]`. Qualquer outra
 * forma devolve `null` — o botão não pode pedir recomputo do que não conhece.
 */
export function chaveDaQueryKey(queryKey: readonly unknown[]): string | null {
  if (queryKey.length !== 4) return null;
  const [prefixo, , stageId, days] = queryKey;
  if (prefixo !== CHAVE_CREATIVE_PERFORMANCE) return null;
  if (typeof stageId !== "string" || stageId.length === 0) return null;
  if (typeof days !== "number" || !Number.isFinite(days)) return null;
  return chaveDeRecomputo(stageId, days);
}

export function montarUrlCreativePerformance(args: {
  funnelId: string;
  stageId: string;
  days: number;
  recomputar: boolean;
}): string {
  const base = `/api/funnels/${args.funnelId}/stages/${args.stageId}/creative-performance?days=${args.days}`;
  return args.recomputar ? `${base}&refresh=1` : base;
}

export interface PedidosDeRecomputo {
  /** O botão Atualizar registra que a próxima chamada desta chave deve recomputar. */
  pedir(chave: string): void;
  /** O queryFn consome o pedido: `true` uma vez, depois `false` até novo pedido. */
  consumir(chave: string): boolean;
  /** Só para inspeção/teste. */
  pendentes(): string[];
}

export function criarPedidosDeRecomputo(): PedidosDeRecomputo {
  const pendentes = new Set<string>();
  return {
    pedir(chave) {
      pendentes.add(chave);
    },
    consumir(chave) {
      const tinha = pendentes.has(chave);
      pendentes.delete(chave);
      return tinha;
    },
    pendentes() {
      return [...pendentes];
    },
  };
}

/** Instância única do app — botão e hooks falam com a mesma. */
export const pedidosDeRecomputo = criarPedidosDeRecomputo();

/** O que a rota devolve em `_cache` (stage-creative-performance.ts). */
export interface CacheDaResposta {
  hit: boolean;
  /** `true` = a Meta falhou e a rota serviu o cache VENCIDO em vez de erro. */
  stale?: boolean;
  computedAt: string;
}

const FORMATO_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Texto do aviso quando a resposta é cache vencido (D2 da story). `null` quando
 * não há o que avisar — resposta fresca ou cache dentro do prazo.
 *
 * Fuso fixo em São Paulo: o gestor lê a hora do painel, não a do servidor.
 */
export function textoDeCacheVencido(cache: CacheDaResposta | undefined | null): string | null {
  if (!cache?.stale) return null;
  const quando = new Date(cache.computedAt);
  if (Number.isNaN(quando.getTime())) {
    return "Dados de cache vencido — a Meta não respondeu; clique em Atualizar";
  }
  const partes = FORMATO_SP.formatToParts(quando);
  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const carimbo = `${pega("day")}/${pega("month")} ${pega("hour")}:${pega("minute")}`;
  return `Dados de ${carimbo} — a Meta não respondeu; clique em Atualizar`;
}
