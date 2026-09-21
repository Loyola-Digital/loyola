// ============================================================
// Story 29.27 — derivação das métricas de custo de UMA linha do
// Detalhamento do Perpétuo.
//
// Extraído de `perpetual-dashboard.tsx` para ficar testável. A regra que este
// módulo protege é sutil e já foi violada uma vez (Story 29.24):
//
//   O `spend` que chega aqui JÁ VEM TRIBUTADO pelo backend.
//
// `services/traffic-analytics.ts` aplica `applyMetaTax` (gross-up de 12,15%
// desde 2026-01-01) em `getCampaignAnalytics`, `getAllAdSetsForProject`,
// `getAllAdsForProject` e `getTrafficOverview` — ou seja, em toda entidade que
// alimenta esta tabela. O ÚNICO endpoint que devolve spend bruto é
// `campaign-daily`, e ele alimenta os KPI cards, não as linhas.
//
// Portanto: NUNCA multiplicar `spend` por um fator de imposto aqui. Fazer isso
// produz spend × 1,1215², que infla Investimento/CAC/CPC/CPM e deprime
// ROAS/Margem — foi o bug que a 29.27 corrigiu.
//
// Story 29.77: o CPC daqui é de CLIQUE NO LINK, sem fallback — a regra vive
// em `shared/src/clique-no-link.ts` (18.78). Este módulo sobrescreve o `cpc`
// da linha (spread em `perpetual-dashboard.tsx`), e até a 29.77 ainda caía
// para cliques totais: um criativo sem `link_click` mostrava CTR `—` (já era
// `ctrDeLink`) e CPC preenchido na mesma linha.
// ============================================================

import { cpcDeLink } from "@loyola-x/shared/src/clique-no-link";

export interface DetailMetricsInput {
  /** Spend da entidade, JÁ com imposto aplicado pelo backend. */
  spend: number;
  impressions: number;
  /** Cliques totais — só informativo; CPC não os lê (Story 29.77). */
  clicks: number;
  /** Cliques no link; `null`/`0` = a Meta não devolveu → CPC `null` → `—`. */
  linkClicks?: number | null;
  /** Faturamento BRUTO atribuído (planilha). */
  revenue?: number | null;
  sales?: number | null;
  /** Story 29.29: reproduções de 3s (Meta `actions[].video_view`), só nível ad. */
  videoViews3s?: number | null;
  /** Story 29.29: retenção a 75% (`video_p75_watched_actions`), só nível ad. */
  videoViews75?: number | null;
}

export interface DetailMetricsOutput {
  spend: number;
  /** CPC de clique no link; `null` (→ `—`) sem `link_click`. */
  cpc: number | null;
  cpm: number;
  /** Numerador BRUTO (regra da 29.20); só o denominador carrega imposto. */
  roas: number | null;
  /** CAC — custo por venda. */
  costPerSale: number | null;
  /**
   * Story 29.34 — Margem ABSOLUTA da linha: receita líquida (após fees da
   * plataforma) menos investimento já tributado. Mesma definição da 29.20,
   * usada no card e no gráfico.
   *
   * Sai daqui, e não de um cálculo paralelo na tela, para que Margem e
   * Margem % NUNCA divirjam: as duas são a mesma variável, uma delas dividida
   * pelo faturamento bruto.
   */
  margin: number;
  /** Margem % sobre o faturamento bruto. */
  marginPct: number | null;
  marginPerSale: number | null;
  /**
   * Story 29.29 — funil do criativo em vídeo. `null` quando o denominador é
   * zero (anúncio de imagem, vídeo sem retenção, ou entidade que não é ad):
   * a UI mostra "—", nunca 0%.
   */
  hookRate: number | null;
  holdRate: number | null;
  bodyConversion: number | null;
}

/**
 * Deriva as métricas de custo da linha a partir de um spend já tributado.
 *
 * @param base    métricas cruas da entidade (spend COM imposto)
 * @param feeRate taxa da plataforma (Kiwify/Hotmart) para a margem líquida
 */
export function deriveDetailMetrics(
  base: DetailMetricsInput,
  feeRate: number,
): DetailMetricsOutput {
  const spend = base.spend;
  const grossRevenue = base.revenue ?? 0;
  const sales = base.sales ?? 0;
  const netRevenue = grossRevenue * (1 - feeRate);
  const margin = netRevenue - spend;

  // Story 29.29 — funil do criativo. Cada etapa usa a anterior como base, então
  // as três respondem perguntas encadeadas:
  //   Hook  — dos que VIRAM o anúncio, quantos assistiram os primeiros segundos
  //   Hold  — dos que passaram pelo gancho, quantos seguiram até 75% do vídeo
  //   Body  — dos que viram o corpo (75%+), quantos converteram
  const v3s = base.videoViews3s ?? 0;
  const v75 = base.videoViews75 ?? 0;

  return {
    spend,
    // Story 29.77: a MESMA função do CTR desta linha e do Top Criativos.
    // Sem `link_click` → `null` → `—`, nunca `spend ÷ cliques totais`.
    cpc: cpcDeLink(base.linkClicks, spend),
    cpm: base.impressions > 0 ? (spend / base.impressions) * 1000 : 0,
    roas: spend > 0 ? grossRevenue / spend : null,
    costPerSale: sales > 0 ? spend / sales : null,
    margin,
    marginPct: grossRevenue > 0 ? (margin / grossRevenue) * 100 : null,
    marginPerSale: sales > 0 ? margin / sales : null,
    hookRate: base.impressions > 0 && v3s > 0 ? (v3s / base.impressions) * 100 : null,
    holdRate: v3s > 0 && v75 > 0 ? (v75 / v3s) * 100 : null,
    bodyConversion: v75 > 0 ? (sales / v75) * 100 : null,
  };
}
