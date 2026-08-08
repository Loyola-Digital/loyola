/**
 * Story 29.44 (AC2/AC3/AC4) — as taxas da cadeia que o sistema JÁ mede.
 *
 * Até aqui, `measuredRates` da aba Análise MVP devolvia uma única entrada
 * (`CTR`) que **não corresponde a etapa de nenhum template** — ou seja, a
 * cadeia inteira caía em digitação manual. O que faltava não era instrumento:
 * era ligar os instrumentos que já existem.
 *
 * ## De onde vem cada taxa
 *
 * | Etapa | Numerador | Denominador |
 * |---|---|---|
 * | `connect_rate`    | VTurb `total_viewed_device_uniq`  | Meta `totalLinkClicks` |
 * | `play_rate`       | herdado do backend (29.41)        | idem |
 * | `pitch_rate`      | herdado do backend (29.41)        | idem |
 * | `conv_post_pitch` | Meta `totalCheckouts`             | VTurb `total_over_pitch` |
 * | `conv_checkout`   | Meta `totalSales`                 | Meta `totalCheckouts` |
 *
 * `play_rate` e `pitch_rate` são **herdados**, não recalculados: o backend da
 * 29.41 já os deriva dos brutos com a guarda de `pitch_time` (AC2 daquela
 * story). Recalcular aqui duplicaria a regra e as duas cópias divergiriam.
 *
 * ## CHAIN-01: por que o numerador do connect rate vem do VTurb
 *
 * Existem dois "pageviews": `totalLandingPageViews` (Meta, evento do pixel) e
 * `total_viewed_device_uniq` (VTurb, player carregou). Não são o mesmo evento.
 * `play_rate` tem como denominador o pageview do VTurb — então o numerador do
 * `connect_rate` precisa ser esse mesmo, senão a cadeia quebra em silêncio e o
 * produto das taxas produz um CAC plausível e errado. Decisão do @po na
 * validação de 2026-08-07.
 *
 * ## A guarda de >100%, e por que ela não é paranoia
 *
 * Dois elos cruzam sistemas cujas populações **não coincidem**:
 *
 * - `connect_rate` — o VTurb conta TODA visita à página (orgânico, e-mail,
 *   direto), a Meta conta só o clique no anúncio. Página com tráfego não pago
 *   passa de 100% com facilidade.
 * - `conv_post_pitch` — a Meta atribui `initiate_checkout` por janela de
 *   conversão do pixel; o VTurb conta por sessão do vídeo. Quem chega ao
 *   checkout por link direto entra no numerador sem passar pelo denominador.
 *
 * Nos dois casos, taxa acima de 100% é **evidência de que o elo não fecha**,
 * não um número a ser aparado. Truncar em 1,0 transformaria essa evidência num
 * valor de aparência perfeita. A etapa vira ausente, com o motivo, e volta a
 * aceitar entrada manual.
 */

import type { TaxaMedida } from "@/lib/hooks/use-vturb";

/** Uma taxa medida pelo sistema, com o material para conferi-la na tela. */
export interface MeasuredRate {
  /** `null` = AUSENTE. Nunca zero para significar ausência (GR-01). */
  value: number | null;
  /** Por que está ausente. Só preenchido quando `value === null`. */
  motivo?: string;
  numerador: number | null;
  denominador: number | null;
  /** Sistema + endpoint + campo. "VTurb" sozinho é insuficiente (29.41 AC5). */
  source: string | null;
}

export interface ChainSourcesOverview {
  totalLinkClicks: number | null;
  totalCheckouts: number | null;
  totalSales: number | null;
}

export interface ChainSourcesVturb {
  playerName: string;
  playerId: string;
  viewedUniq: number;
  startedUniq: number;
  overPitch: number;
  /** Herdadas do backend da 29.41 — não recalcular. */
  playRate: TaxaMedida;
  pitchRate: TaxaMedida;
}

export interface ChainSources {
  overview: ChainSourcesOverview | null;
  vturb: ChainSourcesVturb | null;
}

const AUSENTE = (motivo: string, numerador: number | null, denominador: number | null): MeasuredRate => ({
  value: null,
  motivo,
  numerador,
  denominador,
  source: null,
});

/**
 * Divide com todas as guardas do protocolo aplicadas na borda.
 *
 * Zero no numerador devolve AUSENTE, não `0`: `assertRate` (U-01) aborta com
 * zero de propósito — "taxa zero quase sempre significa etapa não medida" — e
 * deixar passar faria a cadeia inteira estourar em ProtocolViolation em vez de
 * exibir a etapa como sem base.
 */
function taxa(
  numerador: number | null | undefined,
  denominador: number | null | undefined,
  source: string,
  motivoAcimaDe100: string,
): MeasuredRate {
  const n = numerador ?? null;
  const d = denominador ?? null;
  if (d == null || !(d > 0)) return AUSENTE("sem base no período (denominador zero ou ausente)", n, d);
  if (n == null) return AUSENTE("numerador não disponível no período", n, d);
  if (n === 0) return AUSENTE("numerador zero no período — sem base para taxa", n, d);
  const v = n / d;
  if (v > 1) return AUSENTE(motivoAcimaDe100, n, d);
  return { value: v, numerador: n, denominador: d, source };
}

/** Converte a `TaxaMedida` do backend (29.41) para o formato desta tela. */
function daTaxaMedida(t: TaxaMedida | undefined, source: string): MeasuredRate {
  if (!t) return AUSENTE("VSL não vinculada a este funil", null, null);
  if (t.valor == null) {
    return { value: null, motivo: t.motivo ?? "não medida", numerador: t.numerador, denominador: t.denominador, source: null };
  }
  return { value: t.valor, numerador: t.numerador, denominador: t.denominador, source };
}

/**
 * Monta o mapa `chave da etapa → taxa medida`.
 *
 * Etapa ausente do mapa, ou presente com `value: null`, continua editável na
 * tela — a regra de editabilidade da 29.36 é "editável quando o sistema não
 * fornece", e ela permanece intacta.
 */
export function buildMeasuredRates({ overview, vturb }: ChainSources): Record<string, MeasuredRate> {
  const out: Record<string, MeasuredRate> = {};
  const player = vturb ? `player ${vturb.playerName} (${vturb.playerId})` : "";

  // --- connect_rate: pageviews (VTurb) ÷ cliques no link (Meta) ---
  if (vturb && overview) {
    out.connect_rate = taxa(
      vturb.viewedUniq,
      overview.totalLinkClicks,
      `VTurb /sessions/stats total_viewed_device_uniq ÷ Meta insights link_click — ${player}`,
      "acima de 100% — a página recebe visitas fora do anúncio (orgânico, e-mail, direto); " +
        "o numerador do VTurb não é subconjunto dos cliques da Meta neste período",
    );
  } else if (!vturb) {
    out.connect_rate = AUSENTE("VSL não vinculada — sem contagem de pageviews", null, null);
  }

  // --- play_rate e pitch_rate: herdados do backend (29.41) ---
  if (vturb) {
    out.play_rate = daTaxaMedida(vturb.playRate, `VTurb /sessions/stats — ${player}`);
    out.pitch_rate = daTaxaMedida(vturb.pitchRate, `VTurb /sessions/stats — ${player}`);

    // --- conv_post_pitch: checkouts (Meta) ÷ únicos no pitch (VTurb) ---
    out.conv_post_pitch = taxa(
      overview?.totalCheckouts,
      vturb.overPitch,
      `Meta insights initiate_checkout ÷ VTurb total_over_pitch — ${player}`,
      "acima de 100% — a Meta atribui checkout por janela de conversão do pixel e o VTurb " +
        "conta por sessão do vídeo; há checkout de quem não passou pelo pitch neste período",
    );
  }

  // --- conv_checkout: compras aprovadas ÷ checkouts iniciados (ambos Meta) ---
  if (overview) {
    out.conv_checkout = taxa(
      overview.totalSales,
      overview.totalCheckouts,
      "Meta insights purchase ÷ initiate_checkout",
      "acima de 100% — mais compras que checkouts iniciados no período; " +
        "provável diferença de janela de atribuição entre os dois eventos",
    );
  }

  return out;
}

/**
 * Delta entre dois períodos, em PONTOS PERCENTUAIS.
 *
 * `null` quando qualquer das pontas falta — jamais tratar ausência como zero e
 * reportar uma queda de 51 pp que nunca aconteceu.
 *
 * Pontos percentuais, não variação relativa: 51% → 58% é **+7,0 pp**, e não
 * +13,7%. Os dois números descrevem o mesmo fato e levam a leituras diferentes;
 * misturá-los é o erro clássico de leitura de funil.
 */
export function deltaEmPontosPercentuais(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): number | null {
  if (atual == null || anterior == null) return null;
  return (atual - anterior) * 100;
}
