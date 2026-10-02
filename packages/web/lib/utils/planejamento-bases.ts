// Story 48.14 — várias bases de referência lado a lado.
//
// Pedido do Danilo (01/10), para planejar o `dg-pg05` com o `dg-pg04` e o
// `dg-pg02` ao mesmo tempo. Decisão 2 = (a): as bases aparecem LADO A LADO no
// rótulo, cada uma com o nome do funil — nunca a média das duas:
//
//     Ticket Médio (dg-pg04 real: R$ 1.187,00 · dg-pg02 real: R$ 1.312,00)
//     Reembolso (fz-m2-jul26 base: 4,00% real: 3,10% · fz-m1-abr26 real: 2,80%)
//
// Este módulo junta as duas camadas da referência — o planejado (`base:`,
// Story 48.9, `planejamento-referencia.ts`) e o realizado (`real:`, Story
// 48.11, `planejamento-realizado.ts`) — por base marcada. Ele só FORMATA e
// ORDENA: as leituras vêm das mesmas rotas de antes, uma vez por base marcada,
// e nada aqui preenche campo (48.9 AC5 / 48.14 AC6).

import {
  referenciaDaConversaoOrganica,
  referenciaDaConversaoPaga,
  referenciaDoInput,
  type BaseDeReferencia,
} from "@/lib/utils/planejamento-referencia";
import {
  declaracaoDoRealizado,
  realizadoDaConversaoOrganica,
  realizadoDaConversaoPaga,
  realizadoDoInput,
  realizadoDoInvestimentoMeta,
  type RealizadoDaBase,
} from "@/lib/utils/planejamento-realizado";
import type { CampoDosInputs } from "@/lib/utils/planejamento-inputs-form";
import type { CanalOrganico, FontePaga } from "@loyola-x/shared/src/planejamento-cenarios";

/** Uma base marcada, com as duas camadas já montadas. */
export interface ReferenciaDeBase {
  funnelId: string;
  /** Nome do funil — identifica o grupo da base em cada rótulo. */
  nome: string;
  /** Camada A (planejado). Base sem simulador: as três leituras `null` e `semSimulador: true`. */
  referencia: BaseDeReferencia;
  /** Camada B (realizado). Sem resposta da rota → `temResposta: false`, nunca ausência calada. */
  realizado: RealizadoDaBase;
  /** A leitura do `/realizado` dessa base ainda não voltou. */
  lendoRealizado?: boolean;
}

/** O que uma base tem a dizer sobre UM campo. `null` = sem valor (o grupo some). */
export interface GrupoDaBase {
  nome: string;
  base: string | null;
  real: string | null;
}

/**
 * O rótulo com um grupo por base (AC2):
 *
 * - base com simulador → `dg-pgNN base: X real: Y` (cada leitura só se tiver valor);
 * - base sem simulador → `dg-pgNN real: Y`;
 * - base sem valor nenhum para o campo → o grupo dela NÃO aparece (nunca `0`,
 *   nunca `—`);
 * - nenhuma base com valor → rótulo limpo.
 *
 * Com UMA base o formato é o mesmo, com o nome: o gestor não precisa saber
 * quantas estão marcadas para ler o rótulo.
 */
export function rotuloComBases(rotulo: string, grupos: readonly GrupoDaBase[]): string {
  const textos: string[] = [];
  for (const g of grupos) {
    const leituras: string[] = [];
    if (g.base !== null) leituras.push(`base: ${g.base}`);
    if (g.real !== null) leituras.push(`real: ${g.real}`);
    if (leituras.length > 0) textos.push(`${g.nome} ${leituras.join(" ")}`);
  }
  return textos.length === 0 ? rotulo : `${rotulo} (${textos.join(" · ")})`;
}

/** Os grupos de um dos 26 campos da aba 1. */
export function gruposDoInput(bases: readonly ReferenciaDeBase[], campo: CampoDosInputs): GrupoDaBase[] {
  return bases.map((b) => ({
    nome: b.nome,
    base: referenciaDoInput(b.referencia, campo),
    real: realizadoDoInput(b.realizado, campo),
  }));
}

/** Os grupos da "Conversão média em vendas" de um canal orgânico (aba 2). */
export function gruposDaConversaoOrganica(bases: readonly ReferenciaDeBase[], canal: CanalOrganico): GrupoDaBase[] {
  return bases.map((b) => ({
    nome: b.nome,
    base: referenciaDaConversaoOrganica(b.referencia, canal),
    real: realizadoDaConversaoOrganica(b.realizado, canal),
  }));
}

/** Os grupos da "Conversão média em vendas" de uma fonte paga (aba 3). */
export function gruposDaConversaoPaga(bases: readonly ReferenciaDeBase[], fonte: FontePaga): GrupoDaBase[] {
  return bases.map((b) => ({
    nome: b.nome,
    base: referenciaDaConversaoPaga(b.referencia, fonte),
    real: realizadoDaConversaoPaga(b.realizado, fonte),
  }));
}

/**
 * Os grupos dos cartões calculados "Meta · quente" / "Meta · frio" (AC5): só o
 * realizado em R$ — o pedido foi o investimento REAL de cada temperatura.
 */
export function gruposDoInvestimentoMeta(bases: readonly ReferenciaDeBase[], temperatura: "quente" | "frio"): GrupoDaBase[] {
  return bases.map((b) => ({
    nome: b.nome,
    base: null,
    real: realizadoDoInvestimentoMeta(b.realizado, temperatura),
  }));
}

/**
 * As bases marcadas na ORDEM DA LISTA de `/bases` (do lançamento mais recente
 * para o mais antigo) — não na ordem em que foram marcadas (AC1). Id marcado
 * que não está mais na lista é ignorado.
 */
export function basesMarcadasNaOrdemDaLista<T extends { funnelId: string }>(
  lista: readonly T[],
  marcadas: readonly string[],
): T[] {
  return lista.filter((b) => marcadas.includes(b.funnelId));
}

/** Marca ou desmarca uma base. Devolve uma lista nova; não toca em mais nada (AC6). */
export function alternarBase(marcadas: readonly string[], funnelId: string): string[] {
  return marcadas.includes(funnelId) ? marcadas.filter((id) => id !== funnelId) : [...marcadas, funnelId];
}

/** A etapa de vendas escolhida para UMA base — as escolhas das outras ficam como estavam (AC3). */
export function escolherEtapaDaBase(
  escolhas: Readonly<Record<string, string>>,
  funnelId: string,
  stageId: string,
): Record<string, string> {
  return { ...escolhas, [funnelId]: stageId };
}

/** Uma linha da declaração do realizado (AC4). */
export interface LinhaDaDeclaracao {
  funnelId: string;
  nome: string;
  /** 48.13 AC5, agora por base: a base não tem Planejamento salvo. */
  avisoSemSimulador: string | null;
  /** `true` enquanto a rota `/realizado` dessa base não respondeu. */
  lendo: boolean;
  /** `true` quando a rota dessa base falhou — só a linha DELA diz isso. */
  falha: boolean;
  /** O texto depois de "real:". */
  texto: string;
}

export const AVISO_SEM_SIMULADOR = "sem Planejamento salvo — só o realizado (real:) aparece";

/**
 * Uma linha por base marcada, começando pelo nome do funil (AC4).
 *
 * A falha de leitura de uma base (`temResposta: false`) fica NA LINHA DELA: as
 * outras seguem com a própria procedência. Uma declaração única para "o
 * realizado" faria uma rota que caiu esconder as que responderam.
 */
export function linhasDaDeclaracao(bases: readonly ReferenciaDeBase[]): LinhaDaDeclaracao[] {
  return bases.map((b) => {
    const semSimulador = b.referencia.semSimulador === true;
    const avisoSemSimulador = semSimulador ? AVISO_SEM_SIMULADOR : null;
    if (b.lendoRealizado) {
      return { funnelId: b.funnelId, nome: b.nome, avisoSemSimulador, lendo: true, falha: false, texto: "lendo os valores realizados…" };
    }
    const { falha, texto } = declaracaoDoRealizado(b.realizado, semSimulador);
    return { funnelId: b.funnelId, nome: b.nome, avisoSemSimulador, lendo: false, falha, texto };
  });
}
