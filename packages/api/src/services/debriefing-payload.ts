/**
 * Story 49.5 — o payload ÚNICO do Debriefing de lançamento.
 *
 * Esta story é a dona do tipo (resolução 9 do @sm): as 49.3 (dinheiro e tempo)
 * e 49.4 (público) têm loaders e motores próprios; a composição é daqui, e a
 * 49.6 (rota, persistência, render) só consome `DebriefingPayload`.
 *
 * **Puro:** sem I/O e sem relógio — o `geradoEm` é INJETADO por quem orquestra.
 */

import type { DebriefingConfigLancamento, FaseQuePodeNaoTerAcontecido } from "./debriefing-config.js";
import { METRICAS_SEM_CARRINHO_DINHEIRO_TEMPO, type DebriefingMoneyTime, type Lacuna } from "./debriefing-money-time-engine.js";
import { METRICAS_SEM_CARRINHO_PUBLICO, type DebriefingAudience, type LacunaDePublico } from "./debriefing-audience-engine.js";
import { LACUNA_CARRINHO_AINDA_NAO_ABRIU } from "./debriefing-hygiene.js";

/**
 * Versão do schema do payload — lida pela 49.6 (persistência) e pela 49.9.
 *
 * Story 49.12 NÃO sobe a versão ([AUTO-DECISION], Dev Agent Record): os campos
 * novos (`situacao`, `config.situacaoDoLancamento`, `janela.corte`) são
 * ADITIVOS — payload salvo antes deles é um final (o único modo que existia) —
 * e o render imprime a versão (`const D`, "payload v1"), então subir a
 * constante mudaria o HTML do encerrado (contra o AC13 a).
 */
export const DEBRIEFING_PAYLOAD_VERSAO = 1 as const;

/**
 * Story 49.12 — final ou parcial (AC3). Ausente = payload anterior à 49.12 =
 * final. A parcial grava o corte, o D+N e a janela com o motivo do fim (AC5).
 */
export type SituacaoDoDebriefing =
  | { modo: "final" }
  | {
      modo: "parcial";
      /** Ontem em Brasília no instante da geração (R8-2), `YYYY-MM-DD`. */
      corte: string;
      /** D+N = corte − início da captação, em dias (AC3). */
      dMaisN: number;
      janela: { inicio: string; fim: string; motivoDoFim: string };
      /** O carrinho já tinha aberto até o corte (na 49.12, sempre `false` — o aberto é 422, AC4). */
      carrinhoAberto: boolean;
      /** As fases respondidas "ainda não aconteceu" na config (≠ "não houve", AC2). */
      aindaNaoAconteceu: FaseQuePodeNaoTerAcontecido[];
    };

/** Itens nomeados da lacuna do carrinho (49.12 AC6) — os dois motores. Cobrados pela F11. */
export const ITENS_DA_LACUNA_DO_CARRINHO: readonly string[] = [
  ...METRICAS_SEM_CARRINHO_DINHEIRO_TEMPO,
  ...METRICAS_SEM_CARRINHO_PUBLICO,
];

/**
 * Lacuna de composição: a dimensão de pesquisa que a 49.4 declarou não
 * confirmada (equivalente Loyola do M3 da Fase 12 — "campos NÃO CONFIRMADO do
 * perfil sinalizados nas lacunas"). Os motores a expõem em
 * `publico.dimensoesNaoConfirmadas[]`; a composição a leva para `lacunas[]`.
 */
export const LACUNA_DIMENSAO_NAO_CONFIRMADA = "DIMENSAO_NAO_CONFIRMADA" as const;

export type CodigoDeLacunaDoDebriefing =
  | Lacuna["codigo"]
  | LacunaDePublico["codigo"]
  | typeof LACUNA_DIMENSAO_NAO_CONFIRMADA;

export type OrigemDaLacuna = "dinheiroTempo" | "publico" | "composicao";

export interface LacunaDoDebriefing {
  codigo: CodigoDeLacunaDoDebriefing;
  motivo: string;
  detalhe?: string;
  /** De qual saída veio (as duas, quando o código é o mesmo — p. ex. `LISTAS_FRONT_COMUNIDADE`). */
  origem: OrigemDaLacuna[];
  /** Itens nomeados da lacuna (hoje: os campos de `DIMENSAO_NAO_CONFIRMADA`). */
  itens?: string[];
}

export interface DebriefingPayload {
  /** Discriminador — a 49.10 estende com `"perpetuo"`; a 49.9 e o viewer distinguem por ele. */
  tipo: "lancamento";
  versao: typeof DEBRIEFING_PAYLOAD_VERSAO;
  config: DebriefingConfigLancamento;
  dinheiroTempo: DebriefingMoneyTime;
  publico: DebriefingAudience;
  /** União das lacunas das duas saídas, deduplicada por `codigo`. */
  lacunas: LacunaDoDebriefing[];
  /** ISO 8601, injetado. */
  geradoEm: string;
  /** Preenchido pela 49.7 (texto da IA). */
  textos?: Record<string, unknown>;
  /** Story 49.12 — final ou parcial. Ausente (payload anterior à 49.12) = final. */
  situacao?: SituacaoDoDebriefing;
}

/** A parcial do payload, ou `null` (final, ou payload anterior à 49.12). */
export function parcialDo(p: Pick<DebriefingPayload, "situacao">): Extract<SituacaoDoDebriefing, { modo: "parcial" }> | null {
  return p.situacao?.modo === "parcial" ? p.situacao : null;
}

/**
 * Compõe o payload. `geradoEm` é obrigatório e vem de fora (string ISO ou
 * `Date` já construída por quem chama) — a função nunca lê o relógio.
 */
export function montarPayloadDebriefing(
  moneyTime: DebriefingMoneyTime,
  audience: DebriefingAudience,
  config: DebriefingConfigLancamento,
  geradoEm: string | Date,
): DebriefingPayload {
  const iso = typeof geradoEm === "string" ? geradoEm : geradoEm.toISOString();
  if (!iso || Number.isNaN(Date.parse(iso))) {
    throw new RangeError(`montarPayloadDebriefing: geradoEm inválido (${String(geradoEm)})`);
  }
  const lacunas = unirLacunas(moneyTime.lacunas, audience.lacunas, audience.dimensoesNaoConfirmadas);
  const doCarrinho = lacunas.find((l) => l.codigo === LACUNA_CARRINHO_AINDA_NAO_ABRIU);
  if (doCarrinho) doCarrinho.itens = [...ITENS_DA_LACUNA_DO_CARRINHO];
  return {
    tipo: "lancamento",
    versao: DEBRIEFING_PAYLOAD_VERSAO,
    config,
    dinheiroTempo: moneyTime,
    publico: audience,
    lacunas,
    geradoEm: iso,
    situacao: situacaoDoPayload(moneyTime, config),
  };
}

/** Story 49.12 (AC3/AC5) — a situação vem da config e da janela que os motores usaram. */
function situacaoDoPayload(mt: DebriefingMoneyTime, config: DebriefingConfigLancamento): SituacaoDoDebriefing {
  if (config.situacaoDoLancamento !== "em-andamento") return { modo: "final" };
  const corte = mt.janela.corte;
  if (!corte) throw new RangeError("montarPayloadDebriefing: lançamento em andamento sem corte na janela — o corte é entrada obrigatória");
  return {
    modo: "parcial",
    corte: corte.dia,
    dMaisN: corte.dMaisN,
    janela: { inicio: mt.janela.inicio, fim: mt.janela.fim, motivoDoFim: corte.texto },
    carrinhoAberto: corte.carrinhoAberto,
    aindaNaoAconteceu: [...config.aindaNaoAconteceu],
  };
}

/**
 * União deduplicada por `codigo`, na ordem de chegada (Motor I, depois Motor
 * II). O mesmo código nas duas saídas vira UMA lacuna com as duas origens e os
 * detalhes distintos juntados — nunca duas linhas para a mesma lacuna.
 */
export function unirLacunas(
  doDinheiro: readonly Lacuna[],
  doPublico: readonly LacunaDePublico[],
  dimensoesNaoConfirmadas: DebriefingAudience["dimensoesNaoConfirmadas"],
): LacunaDoDebriefing[] {
  const porCodigo = new Map<string, LacunaDoDebriefing>();
  const somar = (l: { codigo: CodigoDeLacunaDoDebriefing; motivo: string; detalhe?: string }, origem: OrigemDaLacuna) => {
    const atual = porCodigo.get(l.codigo);
    if (!atual) {
      porCodigo.set(l.codigo, {
        codigo: l.codigo,
        motivo: l.motivo,
        ...(l.detalhe ? { detalhe: l.detalhe } : {}),
        origem: [origem],
      });
      return;
    }
    if (!atual.origem.includes(origem)) atual.origem.push(origem);
    if (l.detalhe && !(atual.detalhe ?? "").split(" | ").includes(l.detalhe)) {
      atual.detalhe = atual.detalhe ? `${atual.detalhe} | ${l.detalhe}` : l.detalhe;
    }
  };
  for (const l of doDinheiro) somar(l, "dinheiroTempo");
  for (const l of doPublico) somar(l, "publico");
  if (dimensoesNaoConfirmadas.length > 0) {
    const itens = [...new Set(dimensoesNaoConfirmadas.map((d) => d.campo))];
    porCodigo.set(LACUNA_DIMENSAO_NAO_CONFIRMADA, {
      codigo: LACUNA_DIMENSAO_NAO_CONFIRMADA,
      motivo: "dimensão de pesquisa sem pergunta confirmada na config (49.1) — não aparece no relatório e não é inferida",
      detalhe: dimensoesNaoConfirmadas.map((d) => `${d.campo} (${d.motivo})`).join("; "),
      origem: ["composicao"],
      itens,
    });
  }
  return [...porCodigo.values()];
}
