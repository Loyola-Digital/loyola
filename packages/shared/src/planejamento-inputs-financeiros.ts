/**
 * Inputs Financeiros do Painel de Planejamento — a aba
 * `[1] Simulador Cenários: Inputs Financeiros` da planilha (Story 48.1).
 *
 * A aba recebe 20 entradas manuais (custos variáveis, meta de margem,
 * repartição pagos/orgânicos, ticket, investimento por plataforma e público,
 * metas por canal orgânico, bases) e deriva as **receitas necessárias** que as
 * abas 2 e 3 usam como cenário base (`planejamento-cenarios.ts`, Story 48.2).
 *
 * ## Regras (IDs da triagem em `docs/specs/epic-48/classificacao_regras…`)
 *
 *   RN-001 custos totais = Σ seis percentuais
 *   RN-002 meta de margem repartida em pagos/orgânicos (orgânicos = complemento)
 *   RN-003 margem-alvo dos orgânicos = 1 − custos
 *   RN-004 receita necessária = meta de margem ÷ margem-alvo
 *   RN-005 margem média alvo = meta total ÷ receita total (indicador)
 *   RN-006 investimento repartido por plataforma e por público (complementos)
 *   RN-007 metas de margem por fonte paga reusam os % do investimento (D6) e
 *          as QUATRO fontes dividem pela margem-alvo dos pagos (D5 — não
 *          reproduz DV-001, em que o Google frio dividia pela dos orgânicos)
 *   RN-008 meta orgânica repartida por seis canais; receita por canal
 *   RN-009 status da distribuição por canal (falta / 100 % / passou)
 *
 * ## Vazio, zero e negativo (decisões D3 e PO-04 do Danilo, 2026-09-21)
 *
 *   - Entrada vazia (`null`/`undefined`) vale ZERO na conta — é o V0 da
 *     planilha. A tela mostra o campo vazio, não "0".
 *   - Denominador ZERO → `null` ("sem base"; a tela mostra "—"). Nunca `NaN`,
 *     `Infinity` ou erro em cascata.
 *   - Denominador NEGATIVO (custos acima de 100 % ⇒ margem-alvo negativa)
 *     produz número negativo, como na planilha (PO-04 = B, reproduz). Só o
 *     zero exato é "sem base".
 *
 * ## Unidades
 *
 * Frações como `number` decimal (0.25 = 25 %) e moeda como `number` em reais —
 * as mesmas do motor da 48.2, que consome as receitas daqui. A soma de
 * percentuais que precisa "fechar 100 %" (RN-009) é feita em inteiros de
 * centésimos de ponto percentual, porque `0,10 + 0,20 + 0,70` não dá 1 em
 * IEEE-754 (spec §1.4) e "falta distribuir 0 %" seria um erro visível.
 *
 * Módulo FOLHA de propósito: sem imports (a API importa por bare specifier, o
 * web por subpath). Por isso a lista de canais está repetida aqui em vez de
 * vir de `planejamento-cenarios.ts` — os dois módulos não podem se importar.
 */

/** Entrada numérica como chega do formulário; vazia vale zero na derivação. */
export type Entrada = number | null | undefined;

/** As 20 entradas manuais da aba 1, com os nomes normalizados da spec (§1.1 "Mapa de campos"). */
export interface InputsFinanceiros {
  // custos variáveis (G3:G8) — frações da receita bruta
  pctReembolso: Entrada;
  pctMarketplace: Entrada;
  pctImposto: Entrada;
  pctCustoProduto: Entrada;
  pctComissoes: Entrada;
  pctOutrosCustos: Entrada;
  // metas
  /** F13 — Meta de Margem de Contribuição Total (R$). */
  metaMargemTotal: Entrada;
  /** E14 — Representatividade da margem vinda dos leads pagos (fração). */
  pctMargemPagos: Entrada;
  /** F16 — Ticket Médio (R$). */
  ticketMedio: Entrada;
  /** F18 — Meta de MC dos leads pagos (fração). */
  mcAlvoPagos: Entrada;
  // investimento
  /** G23 — Investimento em Anúncios (R$). */
  investimentoAnuncios: Entrada;
  /** E24 — parte do investimento no Meta Ads (fração; Google = complemento). */
  pctInvestMeta: Entrada;
  /** E25 — público quente sob Meta (fração; frio = complemento). */
  pctMetaQuente: Entrada;
  /** E28 — público quente sob Google (fração; frio = complemento). */
  pctGoogleQuente: Entrada;
  // metas por canal orgânico (E42:E47) — frações da meta de margem dos orgânicos
  pctOrgWhatsapp: Entrada;
  pctOrgEmail: Entrada;
  pctOrgInstagram: Entrada;
  pctOrgTelegram: Entrada;
  pctOrgYoutube: Entrada;
  pctOrgAreaMembros: Entrada;
  // bases (G49:G54) — contagens
  baseWhatsapp: Entrada;
  baseEmail: Entrada;
  baseInstagram: Entrada;
  baseTelegram: Entrada;
  baseYoutube: Entrada;
  baseAreaMembros: Entrada;
}

/** Os seis canais orgânicos, na ordem da planilha (RN-040). */
export const CANAIS_ORGANICOS_DA_ABA_1 = [
  "whatsapp",
  "email",
  "instagram",
  "telegram",
  "youtube",
  "areaMembros",
] as const;
export type CanalDaAba1 = (typeof CANAIS_ORGANICOS_DA_ABA_1)[number];

/** Chaves das 20 entradas — para percorrer o formulário e o payload sem digitar a lista duas vezes. */
export const CAMPOS_DOS_INPUTS_FINANCEIROS = [
  "pctReembolso",
  "pctMarketplace",
  "pctImposto",
  "pctCustoProduto",
  "pctComissoes",
  "pctOutrosCustos",
  "metaMargemTotal",
  "pctMargemPagos",
  "ticketMedio",
  "mcAlvoPagos",
  "investimentoAnuncios",
  "pctInvestMeta",
  "pctMetaQuente",
  "pctGoogleQuente",
  "pctOrgWhatsapp",
  "pctOrgEmail",
  "pctOrgInstagram",
  "pctOrgTelegram",
  "pctOrgYoutube",
  "pctOrgAreaMembros",
  "baseWhatsapp",
  "baseEmail",
  "baseInstagram",
  "baseTelegram",
  "baseYoutube",
  "baseAreaMembros",
] as const satisfies readonly (keyof InputsFinanceiros)[];

/** Por canal orgânico: meta de margem (R$) e receita necessária (R$ ou `null`). */
export interface MetaDoCanal {
  pct: number;
  margem: number;
  receita: number | null;
}

/** Os três estados de RN-009. */
export type EstadoDaDistribuicao = "falta" | "ok" | "passou";

export interface StatusDaDistribuicao {
  estado: EstadoDaDistribuicao;
  /** Soma dos seis percentuais, como fração (exata em centésimos de ponto). */
  soma: number;
  /** Pontos percentuais inteiros que faltam (`falta`) ou sobram (`passou`); 0 quando `ok`. */
  pontos: number;
  /** Texto literal da planilha (E40). */
  texto: string;
}

export interface DerivadosFinanceiros {
  // RN-001 … RN-005
  pctCustosTotal: number;
  pctMargemOrganicos: number;
  metaMargemPagos: number;
  metaMargemOrganicos: number;
  mcAlvoOrganicos: number;
  receitaMetaPagos: number | null;
  receitaMetaOrganicos: number | null;
  receitaMetaTotal: number | null;
  mcAlvoMedia: number | null;
  // RN-006 — investimento
  pctInvestGoogle: number;
  pctMetaFrio: number;
  pctGoogleFrio: number;
  investMeta: number;
  investGoogle: number;
  investMetaQuente: number;
  investMetaFrio: number;
  investGoogleQuente: number;
  investGoogleFrio: number;
  // RN-007 — metas e receitas por fonte paga
  margemMetaAds: number;
  margemMetaQuente: number;
  margemMetaFrio: number;
  margemGoogleAds: number;
  margemGoogleQuente: number;
  margemGoogleFrio: number;
  receitaMetaQuente: number | null;
  receitaMetaFrio: number | null;
  receitaGoogleQuente: number | null;
  receitaGoogleFrio: number | null;
  receitaMetaAds: number | null;
  receitaGoogleAds: number | null;
  receitaMetaPagosSoma: number | null;
  // RN-008 / RN-009 — canais orgânicos
  canais: Record<CanalDaAba1, MetaDoCanal>;
  pctCheckOrganicos: number;
  receitaMetaOrganicosSoma: number | null;
  statusOrganicos: StatusDaDistribuicao;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Vazio vale zero (V0); `NaN`/`±Infinity` também, para nunca contaminarem a conta. */
function n(v: Entrada): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Divisão da aba 1: denominador ZERO → `null` (sem base); negativo → número
 * negativo (PO-04 = B, reproduz a planilha). Numerador `null` propaga.
 */
function div(numerador: number | null, denominador: number): number | null {
  if (numerador === null) return null;
  if (denominador === 0 || !Number.isFinite(denominador)) return null;
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/** Soma de `null`s propaga `null` (uma parcela sem base deixa o total sem base). */
function soma(...parcelas: (number | null)[]): number | null {
  let total = 0;
  for (const p of parcelas) {
    if (p === null) return null;
    total += p;
  }
  return total;
}

/** Fração → centésimos de ponto percentual, inteiro (0,25 → 2 500). */
function emCentesimos(pct: Entrada): number {
  return Math.round(n(pct) * 10000);
}

// ------------------------------------------------------------------
// RN-009 — status da distribuição por canal
// ------------------------------------------------------------------

/**
 * Compara a soma dos percentuais com 100 % em **inteiros de centésimos de
 * ponto percentual** — `0,10 + 0,20 + 0,70` fecha exatamente em 10 000, sem
 * tolerância mágica. `pontos` = `ROUND((1 − soma) × 100, 0)` da planilha,
 * meia unidade afastando-se de zero (a soma é sempre ≥ 0, então `Math.round`
 * coincide).
 */
export function statusDaDistribuicao(percentuais: readonly Entrada[]): StatusDaDistribuicao {
  const centesimos = percentuais.reduce<number>((acc, p) => acc + emCentesimos(p), 0);
  const somaFracao = centesimos / 10000;
  if (centesimos === 10000) return { estado: "ok", soma: somaFracao, pontos: 0, texto: "✅ 100%" };
  if (centesimos < 10000) {
    const pontos = Math.round((10000 - centesimos) / 100);
    return { estado: "falta", soma: somaFracao, pontos, texto: `⚠️ Falta distribuir ${pontos}%` };
  }
  const pontos = Math.round((centesimos - 10000) / 100);
  return { estado: "passou", soma: somaFracao, pontos, texto: `⛔️ Opa, passou de 100%! Reduzir ${pontos}%` };
}

// ------------------------------------------------------------------
// Derivação completa da aba 1
// ------------------------------------------------------------------

export function derivarInputsFinanceiros(e: InputsFinanceiros): DerivadosFinanceiros {
  // RN-001
  const pctCustosTotal =
    n(e.pctReembolso) +
    n(e.pctMarketplace) +
    n(e.pctImposto) +
    n(e.pctCustoProduto) +
    n(e.pctComissoes) +
    n(e.pctOutrosCustos);

  // RN-002
  const pctMargemPagos = n(e.pctMargemPagos);
  const pctMargemOrganicos = 1 - pctMargemPagos;
  const metaMargemTotal = n(e.metaMargemTotal);
  const metaMargemPagos = pctMargemPagos * metaMargemTotal;
  const metaMargemOrganicos = pctMargemOrganicos * metaMargemTotal;

  // RN-003
  const mcAlvoOrganicos = 1 - pctCustosTotal;
  const mcAlvoPagos = n(e.mcAlvoPagos);

  // RN-004
  const receitaMetaPagos = div(metaMargemPagos, mcAlvoPagos);
  const receitaMetaOrganicos = div(metaMargemOrganicos, mcAlvoOrganicos);
  const receitaMetaTotal = soma(receitaMetaPagos, receitaMetaOrganicos);

  // RN-005 — indicador; total zero ou sem base → null
  const mcAlvoMedia = receitaMetaTotal === null ? null : div(metaMargemTotal, receitaMetaTotal);

  // RN-006
  const investimentoAnuncios = n(e.investimentoAnuncios);
  const pctInvestMeta = n(e.pctInvestMeta);
  const pctMetaQuente = n(e.pctMetaQuente);
  const pctGoogleQuente = n(e.pctGoogleQuente);
  const pctInvestGoogle = 1 - pctInvestMeta;
  const pctMetaFrio = 1 - pctMetaQuente;
  const pctGoogleFrio = 1 - pctGoogleQuente;
  const investMeta = pctInvestMeta * investimentoAnuncios;
  const investGoogle = pctInvestGoogle * investimentoAnuncios;
  const investMetaQuente = pctMetaQuente * investMeta;
  const investMetaFrio = pctMetaFrio * investMeta;
  const investGoogleQuente = pctGoogleQuente * investGoogle;
  const investGoogleFrio = pctGoogleFrio * investGoogle;

  // RN-007 — D6: reusa os % do investimento; D5: as quatro ÷ mcAlvoPagos
  const margemMetaAds = pctInvestMeta * metaMargemPagos;
  const margemMetaQuente = pctMetaQuente * margemMetaAds;
  const margemMetaFrio = pctMetaFrio * margemMetaAds;
  const margemGoogleAds = pctInvestGoogle * metaMargemPagos;
  const margemGoogleQuente = pctGoogleQuente * margemGoogleAds;
  const margemGoogleFrio = pctGoogleFrio * margemGoogleAds;
  const receitaMetaQuente = div(margemMetaQuente, mcAlvoPagos);
  const receitaMetaFrio = div(margemMetaFrio, mcAlvoPagos);
  const receitaGoogleQuente = div(margemGoogleQuente, mcAlvoPagos);
  const receitaGoogleFrio = div(margemGoogleFrio, mcAlvoPagos); // não reproduz DV-001
  const receitaMetaAds = soma(receitaMetaQuente, receitaMetaFrio);
  const receitaGoogleAds = soma(receitaGoogleQuente, receitaGoogleFrio);
  const receitaMetaPagosSoma = soma(receitaMetaAds, receitaGoogleAds);

  // RN-008
  const pctPorCanal: Record<CanalDaAba1, Entrada> = {
    whatsapp: e.pctOrgWhatsapp,
    email: e.pctOrgEmail,
    instagram: e.pctOrgInstagram,
    telegram: e.pctOrgTelegram,
    youtube: e.pctOrgYoutube,
    areaMembros: e.pctOrgAreaMembros,
  };
  const canais = {} as Record<CanalDaAba1, MetaDoCanal>;
  let pctCheckOrganicos = 0;
  const receitasDosCanais: (number | null)[] = [];
  for (const canal of CANAIS_ORGANICOS_DA_ABA_1) {
    const pct = n(pctPorCanal[canal]);
    const margem = pct * metaMargemOrganicos;
    const receita = div(margem, mcAlvoOrganicos);
    canais[canal] = { pct, margem, receita };
    pctCheckOrganicos += pct;
    receitasDosCanais.push(receita);
  }
  const receitaMetaOrganicosSoma = soma(...receitasDosCanais);

  // RN-009
  const statusOrganicos = statusDaDistribuicao(CANAIS_ORGANICOS_DA_ABA_1.map((c) => pctPorCanal[c]));

  return {
    pctCustosTotal,
    pctMargemOrganicos,
    metaMargemPagos,
    metaMargemOrganicos,
    mcAlvoOrganicos,
    receitaMetaPagos,
    receitaMetaOrganicos,
    receitaMetaTotal,
    mcAlvoMedia,
    pctInvestGoogle,
    pctMetaFrio,
    pctGoogleFrio,
    investMeta,
    investGoogle,
    investMetaQuente,
    investMetaFrio,
    investGoogleQuente,
    investGoogleFrio,
    margemMetaAds,
    margemMetaQuente,
    margemMetaFrio,
    margemGoogleAds,
    margemGoogleQuente,
    margemGoogleFrio,
    receitaMetaQuente,
    receitaMetaFrio,
    receitaGoogleQuente,
    receitaGoogleFrio,
    receitaMetaAds,
    receitaGoogleAds,
    receitaMetaPagosSoma,
    canais,
    pctCheckOrganicos,
    receitaMetaOrganicosSoma,
    statusOrganicos,
  };
}
