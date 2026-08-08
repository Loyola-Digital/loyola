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

/**
 * Rótulo da série residual — o que não se atribui a nenhuma entidade da dimensão.
 *
 * Carrega DUAS ausências distintas, de pontas opostas do funil:
 *
 *   • **investimento sem anúncio** — a Meta reporta o gasto no nível da campanha
 *     e não existe linha de anúncio (anúncio excluído, tipicamente). Medido em
 *     1,55% do total pelo @po em 2026-08-07.
 *   • **venda sem entidade** — a venda não tem UTM (`(sem origem)` na planilha),
 *     ou aponta para um anúncio que não está no cache de insights.
 *
 * Um bucket só, e não dois, porque é o que faz as TRÊS reconciliações fecharem
 * com uma série a mais em vez de duas — e porque a margem do resíduo (receita
 * não atribuível − investimento não atribuível) é uma leitura legítima, ao passo
 * que duas séries meia-métrica cada não seriam.
 *
 * O gate QA-01 pegou a segunda ausência sumindo em silêncio: as séries eram
 * montadas só a partir das linhas de investimento, então venda sem entidade
 * correspondente nunca entrava em lugar nenhum.
 */
export const UNATTRIBUTED_SERIES_KEY = "(sem atribuição)";

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
  /** Entidades por investimento desc, com o resíduo por último (se existir). */
  all: EntitySeries[];
  /**
   * O que vai ao gráfico: as `TOP_N_SERIES` entidades de maior investimento
   * **mais o resíduo**, que nunca é cortado (ver o comentário do corte).
   */
  plotted: EntitySeries[];
  /** Quantas ENTIDADES ficaram de fora. O resíduo nunca conta aqui. */
  omittedCount: number;
  /** Quanto do investimento das entidades está nas omitidas, em %. */
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

  // --- O resíduo de VENDAS, antes do eixo X: uma venda cuja chave não casa com
  // nenhuma entidade das linhas de investimento pode estar num dia que nenhuma
  // outra fonte conhece, e esse dia precisa entrar no eixo.
  const idsAtribuidos = new Set<string>();
  for (const { ids } of porNome.values()) for (const id of ids) idsAtribuidos.add(id);

  const residualRevenue = new Map<string, number>();
  const residualSales = new Map<string, number>();
  if (salesByEntity) {
    for (const [id, s] of Object.entries(salesByEntity)) {
      if (idsAtribuidos.has(id)) continue;
      for (const [d, v] of Object.entries(s.revenueByDay)) {
        residualRevenue.set(d, (residualRevenue.get(d) ?? 0) + v);
      }
      for (const [d, v] of Object.entries(s.salesByDay)) {
        residualSales.set(d, (residualSales.get(d) ?? 0) + v);
      }
    }
  }

  // Eixo X: união de TODAS as origens de dia — investimento atribuído, gasto sem
  // anúncio, e venda sem entidade. Montado depois do resíduo justamente porque a
  // última origem só existe depois de saber quem casou.
  const dates = [
    ...new Set([
      ...rows.map((r) => r.dateStart),
      ...Object.keys(unattributedByDate),
      ...residualRevenue.keys(),
      ...residualSales.keys(),
    ]),
  ].sort();

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

  // --- A série residual: as duas ausências, num bucket só.
  //
  // Gate QA-01: antes daqui só entrava o investimento sem anúncio. Toda venda
  // cuja chave não casasse com uma entidade das linhas de investimento era
  // descartada em silêncio — incluindo, garantidamente, TODA venda sem UTM,
  // que o backend rotula "(sem origem)". Na tela isso aparecia como o gráfico
  // por dimensão mostrando menos faturamento que o agregado logo acima.
  const diasResiduais = [
    ...new Set([
      ...Object.keys(unattributedByDate),
      ...residualRevenue.keys(),
      ...residualSales.keys(),
    ]),
  ].sort();

  if (diasResiduais.length > 0) {
    const byDate: Record<string, SeriesPoint> = {};
    let totalSpend = 0;
    for (const d of diasResiduais) {
      const spendBruto = unattributedByDate[d] ?? 0;
      const spend = spendBruto > 0 ? applyTax(spendBruto, d) : 0;
      byDate[d] = derivePoint(
        spend,
        residualRevenue.get(d) ?? 0,
        residualSales.get(d) ?? 0,
        feeRate,
      );
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
  //
  // Gate QA-07: o resíduo **não disputa vaga**. Ele não é uma entidade
  // concorrendo por espaço — é a prestação de contas do que sobrou, e some do
  // gráfico exatamente quando mais importa aparecer.
  //
  // O defeito era ordená-lo junto por `totalSpend`, que no resíduo conta apenas
  // o investimento sem anúncio: receita residual não pontua. Resultado, na
  // dimensão **Por Campanha** — a inicial da tela —, `unattributedByDate` é
  // vazio por construção, o resíduo fica com `totalSpend = 0`, ordena por
  // último e é sempre cortado havendo mais de 10 campanhas. O faturamento sem
  // UTM voltava a sumir do gráfico, com os testes verdes: eles operavam sobre
  // `all`, e o defeito morava no recorte de `plotted`.
  const entidades = series.filter((s) => s.key !== UNATTRIBUTED_SERIES_KEY);
  const residual = series.find((s) => s.key === UNATTRIBUTED_SERIES_KEY);

  const entidadesOrdenadas = [...entidades].sort((a, b) => b.totalSpend - a.totalSpend);
  const exibidas = entidadesOrdenadas.slice(0, TOP_N_SERIES);
  const omitted = entidadesOrdenadas.slice(TOP_N_SERIES);

  // `all` mantém o resíduo por último: é onde a leitura o espera, e é sobre
  // `all` que a reconciliação opera.
  const all = residual ? [...entidadesOrdenadas, residual] : entidadesOrdenadas;
  const plotted = residual ? [...exibidas, residual] : exibidas;

  // O denominador é o investimento das ENTIDADES, e a contagem também: o
  // resíduo nunca é omitido, então incluí-lo aqui inflaria o "fora do gráfico"
  // com algo que está dentro dele.
  const totalEntidades = entidadesOrdenadas.reduce((s, x) => s + x.totalSpend, 0);
  const omittedSpend = omitted.reduce((s, x) => s + x.totalSpend, 0);

  return {
    all,
    plotted,
    omittedCount: omitted.length,
    omittedSpendShare: totalEntidades > 0 ? (omittedSpend / totalEntidades) * 100 : 0,
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
