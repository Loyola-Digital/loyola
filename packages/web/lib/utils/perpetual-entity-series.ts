/**
 * Story 29.42 — montagem das séries por entidade dos gráficos do Perpétuo.
 *
 * Vive fora do `perpetual-dashboard.tsx` (2.700 linhas) porque é regra de
 * domínio e precisa ser testável sem montar o dashboard — mesmo padrão que a
 * 29.40 estabeleceu com `perpetual-lp-rows.ts`.
 *
 * ## A identidade que este módulo preserva
 *
 * ```
 *   soma das series + nao-atribuido = agregado do dia
 * ```
 *
 * E **não** `soma das séries = agregado`, que é falsa. Medição em produção
 * (@po, 2026-08-07, 30 dias): o grão de anúncio soma R$ 93.795,22 contra
 * R$ 95.273,29 do grão de campanha — 1,55% de diferença, concentrada em 59
 * pares campanha-dia que existem só no nível de campanha (anúncio deletado que
 * a Meta ainda reporta). O grão de anúncio é subconjunto, nunca superconjunto.
 *
 * Por isso `(sem anúncio atribuído)` é uma série visível, e não um resto que
 * some. Mesmo tratamento que a 29.40 deu à LP não resolvida.
 *
 * ## Teto de exibição
 *
 * `TOP_N_SERIES` corta o que é PLOTADO, nunca o que é somado. As séries são
 * montadas sobre o conjunto inteiro e só então fatiadas — inclusive o
 * percentual da nota que denuncia o corte, que sobre o conjunto cortado seria
 * um número cortado denunciando o próprio corte.
 */

/** Rótulo da série que carrega o investimento sem anúncio correspondente. */
export const UNATTRIBUTED_SERIES_KEY = "(sem anúncio atribuído)";

/** Story 29.42 (AC5) — quantas entidades são plotadas. Decisão do usuário. */
export const TOP_N_SERIES = 10;

export interface EntityDailyInput {
  entityId: string;
  entityName: string;
  dateStart: string;
  /** BRUTO — o gross-up acontece aqui, uma única vez. */
  spend: number;
}

export interface EntitySalesInput {
  /** chave = ID cru da entidade (valor do UTM) */
  [entityId: string]: {
    revenueByDay: Record<string, number>;
    salesByDay: Record<string, number>;
  };
}

/** Um ponto de uma série, num dia. */
export interface SeriesPoint {
  /** `null` = a entidade não rodou nesse dia. NUNCA zero — zero afirma outra coisa. */
  spend: number | null;
  revenue: number | null;
  margin: number | null;
  sales: number | null;
  cac: number | null;
  marginPct: number | null;
}

export interface EntitySeries {
  key: string;
  name: string;
  /** Investimento total no período — critério do top-N. */
  totalSpend: number;
  /** `dateIso -> ponto`. Dia ausente do mapa = entidade não rodou. */
  byDate: Record<string, SeriesPoint>;
}

export interface BuildSeriesResult {
  /** Todas as séries, ordenadas por investimento desc. Inclui a de não-atribuído. */
  all: EntitySeries[];
  /** As `TOP_N_SERIES` de maior investimento — o que vai ao gráfico. */
  plotted: EntitySeries[];
  /** Quantas ficaram de fora do gráfico. */
  omittedCount: number;
  /** Quanto do investimento do período está nas omitidas, em %. */
  omittedSpendShare: number;
  /** Dias do eixo X, em ordem. */
  dates: string[];
}

export interface BuildSeriesParams {
  rows: EntityDailyInput[];
  /** Investimento por dia sem anúncio correspondente (do backend). */
  unattributedByDate: Record<string, number>;
  /** Receita/vendas por entidade por dia, quando há planilha. */
  salesByEntity: EntitySalesInput | null;
  /** Fee da plataforma, para a margem líquida. Zero sem planilha. */
  feeRate: number;
  /** `entityId -> nome exibido` já normalizado, para casar com o Detalhamento. */
  resolveName: (entityId: string, fallback: string) => string;
  /**
   * Gross-up do imposto, INJETADO — não reimplementado aqui.
   *
   * A regra é date-aware (só vale a partir de `META_TAX_EFFECTIVE_DATE`) e já
   * vive no dashboard, onde `dailyChartData` a usa. Uma segunda cópia
   * divergiria da primeira no dia em que a data ou a alíquota mudassem, e a
   * divergência apareceria como gráfico contradizendo card — sem erro de tipo,
   * sem erro em runtime.
   */
  applyTax: (spend: number, dateIsoYmd: string) => number;
}

/**
 * Deriva as métricas de um dia a partir dos aditivos.
 *
 * Taxas SEMPRE re-derivadas dos somatórios, nunca médias de médias — regra
 * estabelecida no projeto e a razão de `deriveDetailMetrics` existir.
 * Denominador zero vira `null`, e o recharts deixa a lacuna em vez de plotar
 * `Infinity` no eixo.
 */
function derivePoint(spend: number, revenue: number, sales: number, feeRate: number): SeriesPoint {
  const margin = revenue * (1 - feeRate) - spend;
  return {
    spend,
    revenue,
    margin,
    sales,
    cac: sales > 0 ? spend / sales : null,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : null,
  };
}

export function buildEntitySeries({
  rows,
  unattributedByDate,
  salesByEntity,
  feeRate,
  resolveName,
  applyTax,
}: BuildSeriesParams): BuildSeriesResult {
  // Eixo X: a união dos dias com investimento atribuído e não atribuído. Um dia
  // em que só houve gasto sem anúncio ainda é um dia do período.
  const dates = [
    ...new Set([...rows.map((r) => r.dateStart), ...Object.keys(unattributedByDate)]),
  ].sort();

  // --- Agrega investimento por (nome resolvido, dia).
  // O agrupamento é por NOME, não por id: um Ad Name pode ter N ad_ids (cópias),
  // e a tabela do Detalhamento agrupa da mesma forma. Séries por id não
  // corresponderiam às linhas da tabela logo acima.
  const porNome = new Map<string, { spendByDate: Map<string, number>; ids: Set<string> }>();
  for (const r of rows) {
    const nome = resolveName(r.entityId, r.entityName);
    let e = porNome.get(nome);
    if (!e) {
      e = { spendByDate: new Map(), ids: new Set() };
      porNome.set(nome, e);
    }
    e.ids.add(r.entityId);
    e.spendByDate.set(
      r.dateStart,
      (e.spendByDate.get(r.dateStart) ?? 0) + applyTax(r.spend, r.dateStart),
    );
  }

  // --- Receita/vendas: casadas pelos MESMOS ids que compõem cada nome.
  const series: EntitySeries[] = [];
  for (const [nome, { spendByDate, ids }] of porNome) {
    const revenueByDate = new Map<string, number>();
    const salesByDate = new Map<string, number>();
    if (salesByEntity) {
      for (const id of ids) {
        const s = salesByEntity[id];
        if (!s) continue;
        for (const [d, v] of Object.entries(s.revenueByDay)) {
          revenueByDate.set(d, (revenueByDate.get(d) ?? 0) + v);
        }
        for (const [d, v] of Object.entries(s.salesByDay)) {
          salesByDate.set(d, (salesByDate.get(d) ?? 0) + v);
        }
      }
    }

    const byDate: Record<string, SeriesPoint> = {};
    let totalSpend = 0;
    // Um dia entra na série se a entidade teve gasto OU venda nele. Dia sem
    // nenhum dos dois fica de fora do mapa — e ausente vira lacuna no gráfico,
    // não um zero que afirmaria "rodou e não gastou".
    for (const d of dates) {
      const spend = spendByDate.get(d);
      const revenue = revenueByDate.get(d);
      const sales = salesByDate.get(d);
      if (spend == null && revenue == null && sales == null) continue;
      byDate[d] = derivePoint(spend ?? 0, revenue ?? 0, sales ?? 0, feeRate);
      totalSpend += spend ?? 0;
    }
    series.push({ key: nome, name: nome, totalSpend, byDate });
  }

  // --- A série do não-atribuído. Só existe se houver o que atribuir.
  const totalUnattributed = Object.values(unattributedByDate).reduce((s, v) => s + v, 0);
  if (totalUnattributed > 0) {
    const byDate: Record<string, SeriesPoint> = {};
    let totalSpend = 0;
    for (const [d, v] of Object.entries(unattributedByDate)) {
      const spend = applyTax(v, d);
      // Sem receita atribuível: CAC e margem % ficam `null`, não zero.
      byDate[d] = derivePoint(spend, 0, 0, feeRate);
      totalSpend += spend;
    }
    series.push({
      key: UNATTRIBUTED_SERIES_KEY,
      name: UNATTRIBUTED_SERIES_KEY,
      totalSpend,
      byDate,
    });
  }

  // --- Ordenação e teto de EXIBIÇÃO.
  const all = [...series].sort((a, b) => b.totalSpend - a.totalSpend);
  const plotted = all.slice(0, TOP_N_SERIES);
  const omitted = all.slice(TOP_N_SERIES);
  // O denominador é o total do CONJUNTO INTEIRO. Calculá-lo sobre `plotted`
  // faria a nota que denuncia o corte ser ela mesma um número cortado.
  const totalGeral = all.reduce((s, x) => s + x.totalSpend, 0);
  const omittedSpend = omitted.reduce((s, x) => s + x.totalSpend, 0);

  return {
    all,
    plotted,
    omittedCount: omitted.length,
    omittedSpendShare: totalGeral > 0 ? (omittedSpend / totalGeral) * 100 : 0,
    dates,
  };
}

/**
 * Achata as séries no formato que o recharts consome: uma linha por dia, com
 * uma chave por série.
 *
 * Dia em que a série não tem ponto sai como `undefined` — o recharts entende
 * como lacuna e, com `connectNulls={false}`, não liga os vizinhos.
 */
export function toRechartsRows(
  plotted: EntitySeries[],
  dates: string[],
  metric: keyof SeriesPoint,
): Array<Record<string, string | number | undefined>> {
  return dates.map((d) => {
    const row: Record<string, string | number | undefined> = { date: d.slice(5) };
    for (const s of plotted) {
      row[s.key] = s.byDate[d]?.[metric] ?? undefined;
    }
    return row;
  });
}

/**
 * Linhas do recharts com as DUAS métricas de um gráfico — a da área e a da
 * linha — no mesmo objeto.
 *
 * A chave da linha ganha o sufixo `__l` porque a mesma entidade aparece nas
 * duas marcas: sem sufixo, a segunda sobrescreveria a primeira no mesmo
 * objeto e o gráfico plotaria a mesma série duas vezes.
 */
export const LINE_KEY_SUFFIX = "__l";

export function toComposedRows(
  plotted: EntitySeries[],
  dates: string[],
  areaMetric: keyof SeriesPoint,
  lineMetric: keyof SeriesPoint,
): Array<Record<string, string | number | undefined>> {
  return dates.map((d) => {
    const row: Record<string, string | number | undefined> = { date: d.slice(5) };
    for (const s of plotted) {
      const p = s.byDate[d];
      row[s.key] = p?.[areaMetric] ?? undefined;
      row[`${s.key}${LINE_KEY_SUFFIX}`] = p?.[lineMetric] ?? undefined;
    }
    return row;
  });
}

/**
 * Total de uma métrica ADITIVA num dia, somando TODAS as séries.
 *
 * Existe para o teste de reconciliação do AC10 — e opera sobre `all`, nunca
 * sobre `plotted`: reconciliar contra o conjunto cortado provaria apenas que o
 * corte é consistente consigo mesmo.
 */
export function totalForDate(
  all: EntitySeries[],
  date: string,
  metric: "spend" | "revenue" | "sales",
): number {
  return all.reduce((s, serie) => s + (serie.byDate[date]?.[metric] ?? 0), 0);
}
