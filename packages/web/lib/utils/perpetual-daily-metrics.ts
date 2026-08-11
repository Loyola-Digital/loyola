// ============================================================
// Story 29.51 — derivação das métricas de UM DIA do Quadro de Dados Diários
// do Perpétuo (ou dos totais do período: são a mesma conta).
//
// ⚠️ O `spend` que chega aqui JÁ VEM TRIBUTADO.
//
// `perpetual-dashboard.tsx` aplica `applyMetaTax` (gross-up de 12,15% desde
// 2026-01-01) ao montar cada linha, ANTES de chamar esta função. Multiplicar
// por qualquer fator de imposto aqui produz `spend × 1,1383²`, que infla
// Investimento/CAC/CPC/CPM e deprime ROAS — foi o bug da Story 29.24,
// corrigido na 29.27 e reaberto no lote 29.26–29.30. É o erro mais repetido
// deste epic. O teste "guarda de imposto" existe para travá-lo.
//
// Por que este módulo não reusa `deriveDetailMetrics` (perpetual-detail-metrics):
// aquele recalcula `margin` como `revenue × (1−feeRate) − spend`, enquanto o
// quadro diário resolve a margem com regra de FONTE diferente — sem planilha
// conectada a linha traz `margin = 0`, não `−spend` (Story 29.10, para não
// mostrar prejuízo inventado em projeto sem fonte de vendas). Reusá-lo
// reintroduziria exatamente o número enganoso que a 29.10 removeu.
//
// Portanto `margin` ENTRA pronto e sai intocado; este módulo só o divide.
// ============================================================

/**
 * Métricas cruas de um dia — ou a soma delas ao longo do período.
 *
 * O rodapé "Total" usa esta MESMA interface com os somatórios, e por isso
 * chama a mesma função: as derivadas do período saem dos totais, nunca da
 * média das derivadas diárias (que seria o paradoxo de Simpson pela porta da
 * frente — média de médias não é a média).
 */
export interface DailyMetricsInput {
  /** Investimento do dia, JÁ com imposto aplicado. */
  spend: number;
  /** Faturamento BRUTO (planilha; fallback pixel Meta). */
  revenue: number;
  /** Margem já resolvida pela linha — nunca recalculada aqui. */
  margin: number;
  salesCount: number;
  impressions: number;
  /** Cliques no link (`link_click`). */
  linkClicks: number;
  /** Cliques totais (inclui curtida, comentário, clique no perfil). */
  clicks: number;
  /** Landing page views (`landing_page_view`). */
  lpViews: number;
}

export interface DailyMetricsOutput {
  cac: number | null;
  roas: number | null;
  marginPct: number | null;
  connectRate: number | null;
  cpc: number | null;
  ctr: number | null;
  cpm: number | null;
  /**
   * A base de cliques efetivamente usada em CPC e CTR — e o número que a
   * coluna "Cliques" mostra.
   *
   * Sai daqui, e não de um cálculo paralelo na tela, porque as três precisam
   * concordar: se a coluna mostrasse `link_click` puro enquanto o CPC
   * dividisse por cliques totais, quem fizesse `Investimento ÷ Cliques` na
   * calculadora acharia outro número e concluiria — com razão aparente — que
   * o dashboard está errado.
   */
  costClicks: number;
}

/** Denominador zerado → `null` → a UI mostra "—", nunca 0, NaN ou Infinity. */
function div(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/**
 * Deriva as métricas de um dia (ou do período inteiro) a partir dos crus.
 *
 * @param v métricas cruas; `spend` JÁ tributado, `margin` JÁ resolvida
 */
export function deriveDailyMetrics(v: DailyMetricsInput): DailyMetricsOutput {
  // Mesmo fallback de `deriveDetailMetrics` (perpetual-detail-metrics.ts:83) e
  // do Detalhamento por entidade: os números do dia batem com os da entidade
  // no mesmo recorte porque a base de cliques é a mesma regra.
  const costClicks = v.linkClicks > 0 ? v.linkClicks : v.clicks;

  return {
    cac: div(v.spend, v.salesCount),
    roas: div(v.revenue, v.spend),
    marginPct: v.revenue > 0 ? (v.margin / v.revenue) * 100 : null,

    // Connect Rate é a ÚNICA que não aceita o fallback, de propósito: ela
    // responde "dos que clicaram NO LINK, quantos chegaram na LP". Trocar o
    // denominador por cliques totais (curtida, comentário, clique no perfil)
    // infla a taxa artificialmente. Dia sem `link_click` → null → "—".
    connectRate: v.linkClicks > 0 ? (v.lpViews / v.linkClicks) * 100 : null,

    cpc: div(v.spend, costClicks),
    ctr: v.impressions > 0 ? (costClicks / v.impressions) * 100 : null,
    cpm: v.impressions > 0 ? (v.spend / v.impressions) * 1000 : null,
    costClicks,
  };
}

/**
 * Soma as métricas cruas de várias linhas — a entrada do rodapé "Total".
 *
 * Só campos ADITIVOS entram aqui. As derivadas saem de `deriveDailyMetrics`
 * aplicada a este somatório, jamais de uma média das derivadas por linha.
 */
export function sumDailyMetrics(rows: DailyMetricsInput[]): DailyMetricsInput {
  return rows.reduce<DailyMetricsInput>(
    (a, r) => ({
      spend: a.spend + r.spend,
      revenue: a.revenue + r.revenue,
      margin: a.margin + r.margin,
      salesCount: a.salesCount + r.salesCount,
      impressions: a.impressions + r.impressions,
      linkClicks: a.linkClicks + r.linkClicks,
      clicks: a.clicks + r.clicks,
      lpViews: a.lpViews + r.lpViews,
    }),
    {
      spend: 0, revenue: 0, margin: 0, salesCount: 0,
      impressions: 0, linkClicks: 0, clicks: 0, lpViews: 0,
    },
  );
}
