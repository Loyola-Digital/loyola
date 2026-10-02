/**
 * Story 49.5 — o payload ÚNICO do Debriefing de lançamento.
 *
 * Esta story é a dona do tipo (resolução 9 do @sm): as 49.3 (dinheiro e tempo)
 * e 49.4 (público) têm loaders e motores próprios; a composição é daqui, e a
 * 49.6 (rota, persistência, render) só consome `DebriefingPayload`.
 *
 * **Puro:** sem I/O e sem relógio — o `geradoEm` é INJETADO por quem orquestra.
 */

import type { DebriefingConfigLancamento } from "./debriefing-config.js";
import type { DebriefingMoneyTime, Lacuna } from "./debriefing-money-time-engine.js";
import type { DebriefingAudience, LacunaDePublico } from "./debriefing-audience-engine.js";

/** Versão do schema do payload — lida pela 49.6 (persistência) e pela 49.9. */
export const DEBRIEFING_PAYLOAD_VERSAO = 1 as const;

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
  return {
    tipo: "lancamento",
    versao: DEBRIEFING_PAYLOAD_VERSAO,
    config,
    dinheiroTempo: moneyTime,
    publico: audience,
    lacunas: unirLacunas(moneyTime.lacunas, audience.lacunas, audience.dimensoesNaoConfirmadas),
    geradoEm: iso,
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
