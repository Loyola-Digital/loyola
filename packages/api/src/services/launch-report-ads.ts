/**
 * Story 41.4 — destaques por anúncio (§3.8 e §7.2).
 *
 * A seção 6 do Resumão é a parte acionável: em três sub-abas (🔥 Quente,
 * ❄️ Frio, 🌗 Total) ela responde qual criativo escalar, qual pausar e qual traz
 * lead qualificado.
 *
 * Duas regras que não são óbvias:
 *
 * 1. **Reescala do spend (§3.8).** O ad-level da Meta é menos confiável que o
 *    campaign-level. O spend de cada anúncio é multiplicado por um fator para a
 *    soma fechar com o campaign-level **já com imposto**:
 *
 *        fator = INV_visao / Σ spend_bruto(ads da visão)
 *
 *    É o que o invariante A6 verifica (tol. R$ 1,00). A reescala é **sempre**
 *    aplicada, não condicionalmente: quando o ad-level já bate, o fator é ~1 e
 *    nada muda. Aplicar só quando "não bate" criaria dois caminhos e faria o A6
 *    passar por sorte — que é exatamente o caso do PG04, onde a cobertura é de
 *    100% e o fator dá 1,0000.
 *
 * 2. **Filtro de escala.** Só anúncios com `pct_invest >= 1%` entram nos
 *    rankings de destaque. Sem isso, um anúncio com R$ 12 de investimento e uma
 *    venda de sorte lidera o ranking de ROAS e alguém escala ele.
 *
 * E uma consequência estrutural: o **mesmo `ad_name` aparece separado** em
 * Quente e Frio. Ele roda em campanhas diferentes, e somá-lo apagaria justamente
 * a comparação que interessa.
 *
 * Funções puras sobre dados já carregados — o I/O é do loader.
 */

import { classificarPublico, type Publico } from "./launch-report-normalize.js";

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

/** Linha de ad-level já agregada por `ad_name` dentro de uma campanha. */
export interface AdInput {
  adId: string;
  adName: string | null;
  campaignId: string;
  campaignName: string;
  /** Spend **cru** do ad-level, sem gross-up. */
  spendBruto: number;
  impressoes: number;
  cliques: number;
}

/** Comprador único já resolvido pelo motor (§2.9). */
export interface CompradorInput {
  email: string;
  origem: string;
  publico: Publico;
  /** `ad_name` resolvido a partir do `utm_content`/`utm_term`. */
  adName: string | null;
  /** Soma de **todas** as linhas daquele e-mail — captação + order bumps. */
  faturamento: number;
}

/** Qualificação por criativo, vinda de `byAdId` de `computeSurveyForStage`. */
export interface FaixaPorAd {
  /** Nome resolvido do anúncio (agregação é por nome, não por id). */
  adName: string;
  /** Respondentes da pesquisa atribuídos a este anúncio. */
  match: number;
  /** % em Faixa A. */
  pctA: number;
  /** % em Faixa A ou B. */
  pctAB: number;
}

export interface AggregateAdHighlightsInput {
  ads: readonly AdInput[];
  compradores: readonly CompradorInput[];
  faixas?: readonly FaixaPorAd[];
  /** INV **com imposto** de cada visão, vindo do motor. */
  invQuente: number;
  invFrio: number;
  invTotal: number;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export type NomeVisao = "Quente" | "Frio" | "Total";

export interface AdRow {
  adName: string;
  spendAjustado: number;
  pctInvest: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  cpm: number;
  /** E-mails únicos do universo da visão com este `ad_name`. */
  vendas: number;
  /** Soma de todas as linhas dos e-mails atribuídos (inclui order bumps). */
  faturamento: number;
  cpv: number;
  roas: number;
  /** Respondentes da pesquisa. */
  match: number;
  pctA: number;
  pctAB: number;
}

export interface AdHighlights {
  visao: NomeVisao;
  invVisao: number;
  /** `INV_visao / Σ spend_bruto(ads)`. Zero quando não há ad-level. */
  fator: number;
  /** Σ dos `spendAjustado` — lado esquerdo do invariante A6. */
  somaSpendAjustado: number;
  /** Preenchido quando o A6 não pode ser avaliado para esta visão. */
  motivoSkip: string | null;

  maiorEscala: AdRow | null;
  maiorCtr: AdRow[];
  menorCpc: AdRow[];
  menorCpm: AdRow[];
  menorCpv: AdRow[];
  maiorRoas: AdRow[];
  maiorPctA: AdRow[];
  maiorPctAB: AdRow[];

  zerados: number;
  totalAds: number;
  escalaveis: number;
  /** Top 25 por spend ajustado. */
  tabela: AdRow[];
}

export interface DestaquesPorAnuncio {
  visoes: AdHighlights[];
  /** Insumo do alerta W6. */
  pctVendasPagasSemAdName: number;
  /** Insumo do alerta W3. */
  adsComSpendSuspeito: { adName: string; spend: number; impressoes: number }[];
}

// ---------------------------------------------------------------------------
// Constantes da spec
// ---------------------------------------------------------------------------

/** §3.8 — só anúncios acima disso entram nos rankings de destaque. */
export const MIN_PCT_INVEST = 1.0;
/** §3.8 — mínimo de respondentes para entrar nos rankings de Faixa. */
export const MIN_RESPONDENTES_FAIXA = 5;
/** §4 — tamanho da tabela completa. */
export const TOP_TABELA = 25;
/** W3 — spend abaixo disso com impressões acima do outro limiar = corrompido. */
export const SPEND_SUSPEITO = 20;
export const IMPRESSOES_SUSPEITAS = 1000;

const TOP_N = 3;

/**
 * Divisão guardada. Denominador zero → **0**, não `null`, seguindo o padrão de
 * `creative-metrics-calculator.ts` (mantém a coluna ordenável no front).
 */
function div(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// ---------------------------------------------------------------------------
// aggregateAdHighlights
// ---------------------------------------------------------------------------

export function aggregateAdHighlights(
  input: AggregateAdHighlightsInput,
): DestaquesPorAnuncio {
  const { ads, compradores, faixas = [], invQuente, invFrio, invTotal } = input;

  // Universo de compradores pagos por visão (§AC1).
  const pagos = compradores.filter((c) => c.origem === "Pago");
  const universo: Record<NomeVisao, CompradorInput[]> = {
    Quente: pagos.filter((c) => c.publico === "Quente"),
    Frio: pagos.filter((c) => c.publico === "Frio"),
    Total: pagos.filter((c) => c.publico === "Quente" || c.publico === "Frio"),
  };

  // Ads por visão — a temperatura vem da CAMPANHA em que o anúncio rodou, e é
  // por isso que o mesmo `ad_name` aparece separado em Quente e Frio.
  const adsDaVisao: Record<NomeVisao, AdInput[]> = {
    Quente: ads.filter((a) => classificarPublico(a.campaignName) === "Quente"),
    Frio: ads.filter((a) => classificarPublico(a.campaignName) === "Frio"),
    Total: [...ads],
  };

  const faixaPorNome = new Map(faixas.map((f) => [f.adName, f]));

  const visoes: AdHighlights[] = (["Quente", "Frio", "Total"] as const).map((visao) =>
    montarVisao({
      visao,
      ads: adsDaVisao[visao],
      compradores: universo[visao],
      faixaPorNome,
      invVisao: visao === "Quente" ? invQuente : visao === "Frio" ? invFrio : invTotal,
    }),
  );

  // W6 — % de vendas pagas sem `ad_name` resolvido. Denominador são os pagos,
  // porque é o ranking por criativo que fica incompleto.
  const semAdName = pagos.filter((c) => !c.adName).length;
  const pctVendasPagasSemAdName = div(semAdName, pagos.length) * 100;

  // W3 — spend baixo com muitas impressões. Sobre o spend **cru**: é o valor da
  // Meta que está corrompido, e a reescala mascararia o sintoma.
  const adsComSpendSuspeito = ads
    .filter((a) => a.spendBruto < SPEND_SUSPEITO && a.impressoes > IMPRESSOES_SUSPEITAS)
    .map((a) => ({
      adName: a.adName ?? a.adId,
      spend: a.spendBruto,
      impressoes: a.impressoes,
    }));

  return { visoes, pctVendasPagasSemAdName, adsComSpendSuspeito };
}

// ---------------------------------------------------------------------------
// Uma visão
// ---------------------------------------------------------------------------

function montarVisao(args: {
  visao: NomeVisao;
  ads: readonly AdInput[];
  compradores: readonly CompradorInput[];
  faixaPorNome: Map<string, FaixaPorAd>;
  invVisao: number;
}): AdHighlights {
  const { visao, ads, compradores, faixaPorNome, invVisao } = args;

  // --- agrupar por ad_name -------------------------------------------------
  // Agregação é por NOME, não por id: o mesmo criativo pode ter vários ad ids
  // (duplicado entre adsets), e o gestor raciocina por nome. Padrão consolidado
  // na Story 18.65.
  interface Agg {
    adName: string;
    spendBruto: number;
    impressoes: number;
    cliques: number;
  }
  const porNome = new Map<string, Agg>();
  for (const a of ads) {
    const nome = (a.adName ?? "").trim() || "(sem nome)";
    const e = porNome.get(nome);
    if (e) {
      e.spendBruto += a.spendBruto;
      e.impressoes += a.impressoes;
      e.cliques += a.cliques;
    } else {
      porNome.set(nome, {
        adName: nome,
        spendBruto: a.spendBruto,
        impressoes: a.impressoes,
        cliques: a.cliques,
      });
    }
  }

  // --- reescala (§3.8) -----------------------------------------------------
  const somaBruto = [...porNome.values()].reduce((s, a) => s + a.spendBruto, 0);
  // Etapa sem ad-level não é erro: fator 0, tudo zerado, e o A6 vira `skipped`
  // com o motivo registrado.
  const fator = somaBruto === 0 ? 0 : invVisao / somaBruto;
  const motivoSkip =
    somaBruto === 0
      ? `visão ${visao} sem ad-level no período — a reescala do §3.8 não é aplicável`
      : null;

  // --- vendas e faturamento por anúncio ------------------------------------
  // Ordem importa: o faturamento do comprador já vem somado de TODAS as linhas
  // do e-mail (captação + order bumps). Somar linha a linha por `ad_name`
  // perderia os order bumps, que não carregam o utm_content do criativo.
  const vendasPorNome = new Map<string, { vendas: number; faturamento: number }>();
  for (const c of compradores) {
    if (!c.adName) continue; // sem atribuição vira W6, não entra em ranking
    const e = vendasPorNome.get(c.adName);
    if (e) {
      e.vendas += 1;
      e.faturamento += c.faturamento;
    } else {
      vendasPorNome.set(c.adName, { vendas: 1, faturamento: c.faturamento });
    }
  }

  // --- derivar métricas ----------------------------------------------------
  const linhas: AdRow[] = [...porNome.values()].map((a) => {
    // Reescalar ANTES de derivar: calcular cpc/cpm/cpv/roas com o spend bruto e
    // reescalar depois daria números diferentes.
    const spendAjustado = a.spendBruto * fator;
    const v = vendasPorNome.get(a.adName) ?? { vendas: 0, faturamento: 0 };
    const faixa = faixaPorNome.get(a.adName);

    return {
      adName: a.adName,
      spendAjustado,
      pctInvest: div(spendAjustado, invVisao) * 100,
      impressoes: a.impressoes,
      cliques: a.cliques,
      ctr: div(a.cliques, a.impressoes) * 100,
      cpc: div(spendAjustado, a.cliques),
      cpm: div(spendAjustado, a.impressoes) * 1000,
      vendas: v.vendas,
      faturamento: v.faturamento,
      cpv: div(spendAjustado, v.vendas),
      roas: div(v.faturamento, spendAjustado),
      match: faixa?.match ?? 0,
      pctA: faixa?.pctA ?? 0,
      pctAB: faixa?.pctAB ?? 0,
    };
  });

  // --- rankings ------------------------------------------------------------
  // `maiorEscala` fica FORA do filtro de escala de propósito: a pergunta "onde
  // está o dinheiro" não deve ser filtrada por tamanho.
  //
  // ⚠️ Nota sobre o filtro: como a reescala **normaliza** (a soma dos ajustados
  // sempre fecha com `invVisao`), `pctInvest` é uma fatia do todo. Com poucos
  // anúncios, todos passam de 1% por construção — um anúncio só teria 100%. O
  // filtro só morde em lançamento pulverizado, que é exatamente onde ele
  // importa: o PG04 tem 412 anúncios.
  const maiorEscala =
    linhas.length === 0
      ? null
      : linhas.reduce((max, l) => (l.spendAjustado > max.spendAjustado ? l : max));

  const escalaveis = linhas.filter((l) => l.pctInvest >= MIN_PCT_INVEST);
  const comFaixa = escalaveis.filter((l) => l.match >= MIN_RESPONDENTES_FAIXA);

  /** Top N por maior valor. */
  const maior = (arr: AdRow[], chave: keyof AdRow): AdRow[] =>
    [...arr].sort((a, b) => (b[chave] as number) - (a[chave] as number)).slice(0, TOP_N);

  /**
   * Top N por menor valor, **excluindo zeros**: anúncio sem clique não é o de
   * menor CPC, e anúncio sem venda não é o de menor CPV.
   */
  const menor = (arr: AdRow[], chave: keyof AdRow): AdRow[] =>
    arr
      .filter((l) => (l[chave] as number) > 0)
      .sort((a, b) => (a[chave] as number) - (b[chave] as number))
      .slice(0, TOP_N);

  return {
    visao,
    invVisao,
    fator,
    somaSpendAjustado: linhas.reduce((s, l) => s + l.spendAjustado, 0),
    motivoSkip,

    maiorEscala,
    maiorCtr: maior(escalaveis, "ctr"),
    menorCpc: menor(escalaveis, "cpc"),
    menorCpm: menor(escalaveis, "cpm"),
    menorCpv: menor(escalaveis, "cpv"),
    maiorRoas: maior(escalaveis, "roas"),
    maiorPctA: maior(comFaixa, "pctA"),
    maiorPctAB: maior(comFaixa, "pctAB"),

    zerados: linhas.filter((l) => l.vendas === 0).length,
    totalAds: linhas.length,
    escalaveis: escalaveis.length,
    tabela: [...linhas].sort((a, b) => b.spendAjustado - a.spendAjustado).slice(0, TOP_TABELA),
  };
}
