// ============================================================
// Story 29.78 — a tabela das VSLs do funil perpétuo (bloco VSL da aba Meta Ads).
//
// Este módulo faz a parte da API que tem regra, separada da rota para poder
// ser testada sem banco e sem VTurb:
//
//   1. QUAIS vídeos: a união dos vínculos das etapas do funil, sem duplicata
//      (um vídeo vinculado a duas etapas aparece uma vez) e em ordem
//      determinística. A `/chain` da Análise MVP pega UM vídeo com `.limit(1)`
//      sem `orderBy` — aqui, não (AC5, PO-15).
//   2. QUAL pitch: o ATUAL do VTurb, lido de `/players/list` — nunca a cópia
//      gravada no vínculo, que não se atualiza (AC4, PO-04). Pitch 0 ou
//      ausente é "não configurado", pela mesma regra da cadeia
//      (`pitchInvalido`, `vturb-chain.ts`). O painel por vídeo (`overview`)
//      usa a mesma escolha (AC12, `pitchDoPainel`).
//   3. QUANTAS chamadas: uma `/players/list` por leitura e uma `sessions/stats`
//      por vídeo, com concorrência limitada — a cota do VTurb é de 60/min POR
//      CONTA, dividida entre todos os projetos (AC7). Funil sem vídeo não
//      chama o VTurb.
//   4. O QUE FALHA ONDE: falha de um vídeo fica na linha dele; falha da lista
//      de players é falha geral e sobe (AC8).
//
// A rota devolve só BRUTOS. As taxas (truncadas a 2 casas, "igual o VTurb") e
// a linha de Total são calculadas no web, a partir deles (AC2/AC3) — a linha
// de Total não tem taxa pronta, e ter a conta num lugar só evita duas.
// ============================================================

import { and, eq } from "drizzle-orm";
import { funnels, funnelStages, vturbPlayers } from "../db/schema.js";
import { pitchInvalido } from "./vturb-chain.js";
import type { VturbPlayer, VturbSessionStats } from "./vturb.js";

/** Um vínculo vídeo ↔ etapa, como sai do banco. */
export interface VinculoDoFunil {
  playerId: string;
  playerName: string;
}

/** Um vídeo da tabela, já sem duplicata. */
export interface VideoDoFunil {
  playerId: string;
  nome: string;
}

/** Os quatro contadores de que as duas taxas precisam (nomes do VTurb entre parênteses). */
export interface BrutosDaVsl {
  /** `total_viewed_device_uniq` — denominador do Play Rate. */
  viewedUniq: number;
  /** `total_started_device_uniq` — numerador do Play Rate. */
  startedUniq: number;
  /** `total_over_pitch` — numerador da Retenção ao pitch. */
  overPitch: number;
  /** `total_under_pitch` — com `overPitch`, o denominador da Retenção. */
  underPitch: number;
}

export interface LinhaDaTabelaDeVsls {
  playerId: string;
  nome: string;
  /** Pitch ATUAL do VTurb, em segundos. `null` quando 0, ausente ou o vídeo sumiu da conta. */
  pitchTime: number | null;
  /** `false` → a Retenção ao pitch não é calculável ("pitch não configurado no VTurb"). */
  pitchConfigurado: boolean;
  /** `null` quando a leitura do vídeo falhou — ver `erro`. */
  brutos: BrutosDaVsl | null;
  /** Mensagem da falha deste vídeo; `null` quando leu. */
  erro: string | null;
}

/**
 * O funil pertence ao projeto? É o recorte que impede um `funnelId` de outro
 * projeto de ler vínculos que não são dele. Exportado para o teste serializar
 * o PREDICADO — um banco mockado devolve o que mandarem e não prova o filtro.
 */
export function condicaoDoFunilNoProjeto(projectId: string, funnelId: string) {
  return and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId));
}

/** Os vínculos das etapas do funil, do projeto da URL. Mesmo motivo do predicado acima. */
export function condicaoDosVinculosDoFunil(projectId: string, funnelId: string) {
  return and(eq(funnelStages.funnelId, funnelId), eq(vturbPlayers.projectId, projectId));
}

const ordemDeNome = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function compararVideos(a: { nome: string; playerId: string }, b: { nome: string; playerId: string }): number {
  return ordemDeNome.compare(a.nome, b.nome) || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0);
}

/**
 * Story 29.78 (AC5) — a união dos vínculos do funil.
 *
 * Chave: `player_id`. O nome é a cópia gravada em cada vínculo, e dois
 * vínculos do mesmo vídeo podem ter nomes diferentes (renomeado no VTurb entre
 * um e outro); ordenar ANTES de deduplicar faz o nome escolhido não depender
 * da ordem em que o banco devolveu as linhas.
 *
 * Ordem: por nome (pt-BR, sem caixa nem acento, números em ordem natural) e,
 * no empate, pelo `player_id`.
 */
export function unirVideosDoFunil(vinculos: readonly VinculoDoFunil[]): VideoDoFunil[] {
  const candidatos = vinculos
    .map((v) => ({ playerId: v.playerId, nome: v.playerName }))
    .sort(compararVideos);
  const vistos = new Set<string>();
  const unicos: VideoDoFunil[] = [];
  for (const c of candidatos) {
    if (vistos.has(c.playerId)) continue;
    vistos.add(c.playerId);
    unicos.push(c);
  }
  return unicos;
}

/**
 * `fn` sobre cada item, no máximo `limite` ao mesmo tempo, com o resultado na
 * ORDEM dos itens (não na de conclusão). É o freio da cota: um funil com dez
 * vídeos não dispara dez chamadas simultâneas numa conta de 60/min.
 */
export async function mapearComConcorrencia<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i]!, i);
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}

/** Os quatro brutos, e só eles — as taxas prontas do VTurb ficam para trás (AC3). */
export function brutosDaVsl(stats: VturbSessionStats): BrutosDaVsl {
  return {
    viewedUniq: Number(stats.total_viewed_device_uniq ?? 0),
    startedUniq: Number(stats.total_started_device_uniq ?? 0),
    overPitch: Number(stats.total_over_pitch ?? 0),
    underPitch: Number(stats.total_under_pitch ?? 0),
  };
}

/** O pitch de um vídeo como a tela o usa: o número, ou `null` com `pitchConfigurado: false`. */
export interface PitchAtual {
  /** Em segundos; `null` quando 0, ausente, não numérico ou o vídeo sumiu da conta. */
  pitchTime: number | null;
  pitchConfigurado: boolean;
}

/**
 * Story 29.78 (AC4) — o pitch ATUAL de um player, a partir da linha dele na
 * `/players/list` (`undefined` = o vídeo não está mais na conta).
 *
 * `/players/list` não passa pela normalização de `sessions/stats`; o número
 * pode chegar como texto. A regra de "pitch não configurado" é a da cadeia
 * (`pitchInvalido`): 0, ausente ou não numérico.
 */
export function pitchAtualDoPlayer(atual: Pick<VturbPlayer, "pitch_time"> | undefined): PitchAtual {
  const bruto = atual?.pitch_time == null ? null : Number(atual.pitch_time);
  const pitchConfigurado = !pitchInvalido(bruto);
  return { pitchTime: pitchConfigurado ? bruto : null, pitchConfigurado };
}

/**
 * Story 29.78 (AC12) — o pitch do PAINEL por vídeo: o atual do VTurb para o
 * player do vínculo, nunca a cópia gravada no vínculo (`vturb_players.pitch_time`
 * só se regrava num novo vínculo e envelhece em silêncio).
 *
 * Recebe o vínculo inteiro — com a cópia — de propósito: a decisão "o atual,
 * nunca a cópia" mora aqui, e o teste a prova com cópia ≠ atual. É a mesma
 * fonte da tabela das VSLs (AC4), então os dois números do bloco não divergem.
 */
export function pitchDoPainel(
  vinculo: { playerId: string; pitchTime: number | null },
  daConta: readonly Pick<VturbPlayer, "id" | "pitch_time">[],
): PitchAtual {
  return pitchAtualDoPlayer(daConta.find((p) => p.id === vinculo.playerId));
}

/** Quantas `sessions/stats` ao mesmo tempo. Três deixa folga na cota de 60/min da conta. */
export const CONCORRENCIA_DA_TABELA = 3;

/**
 * Story 29.78 — as linhas da tabela, com as chamadas ao VTurb injetadas.
 *
 * - Sem vídeo: devolve `[]` SEM chamar o VTurb (nem a lista de players).
 * - `listarPlayers` falhou: a exceção sobe — sem o pitch atual nenhuma linha
 *   pode dizer a Retenção, e isso é falha geral do bloco, não de um vídeo.
 * - `lerStats` falhou num vídeo: a linha dele leva a mensagem; as outras seguem.
 */
export async function lerTabelaDasVsls(input: {
  videos: readonly VideoDoFunil[];
  listarPlayers: () => Promise<Pick<VturbPlayer, "id" | "pitch_time" | "duration">[]>;
  lerStats: (video: { playerId: string; pitchTime: number | null; videoDuration: number | null }) => Promise<VturbSessionStats>;
  concorrencia?: number;
}): Promise<LinhaDaTabelaDeVsls[]> {
  if (input.videos.length === 0) return [];

  const daConta = new Map((await input.listarPlayers()).map((p) => [p.id, p]));

  return mapearComConcorrencia(input.videos, input.concorrencia ?? CONCORRENCIA_DA_TABELA, async (video) => {
    const atual = daConta.get(video.playerId);
    const { pitchTime, pitchConfigurado } = pitchAtualDoPlayer(atual);
    try {
      const stats = await input.lerStats({
        playerId: video.playerId,
        pitchTime,
        videoDuration: atual?.duration == null ? null : Number(atual.duration) || null,
      });
      return { ...video, pitchTime, pitchConfigurado, brutos: brutosDaVsl(stats), erro: null };
    } catch (err) {
      return {
        ...video,
        pitchTime,
        pitchConfigurado,
        brutos: null,
        erro: err instanceof Error && err.message ? err.message : "Falha ao consultar o VTurb",
      };
    }
  });
}
