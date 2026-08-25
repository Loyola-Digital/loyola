/**
 * Série acumulada da comparação de lançamentos.
 *
 * O gráfico mostra dia a dia, e dia a dia responde "como foi ontem". Não
 * responde "estamos à frente ou atrás do lançamento passado a esta altura?" —
 * para isso é preciso somar o caminho todo até aqui, que é como o time decide
 * se acelera ou segura o investimento.
 *
 * ## Por que não é só somar
 *
 * Metade das métricas não se soma. CPL, CPV, CPC, CPM e CTR são razões: somar o CPL
 * de cada dia dá um número sem significado, e tirar a média das médias dá outro
 * — errado de um jeito difícil de perceber, porque parece plausível. Um dia com
 * 2 leads a R$ 50 e outro com 200 leads a R$ 10 não têm CPL acumulado de R$ 30;
 * têm R$ 10,40.
 *
 * O acumulado correto é a razão dos ACUMULADOS: investimento acumulado ÷ leads
 * acumulados. É o que este módulo faz.
 */

/** Os componentes brutos de um dia — tudo que é somável. */
export interface DiaBruto {
  spend: number;
  impressions: number;
  /** Cliques usados no CTR/CPC. */
  clicks: number;
  leads: number;
  faturamento: number;
  vendas: number;
}

export type MetricaComparada =
  | "spend" | "faturamento" | "vendas" | "leads" | "clicks" | "impressions"
  | "cpl" | "cpv" | "ctr" | "cpc" | "cpm";

/** Métricas que se somam. O resto é razão e precisa ser recalculado. */
const SOMAVEIS = new Set<MetricaComparada>([
  "spend", "faturamento", "vendas", "leads", "clicks", "impressions",
]);

export function ehSomavel(metrica: MetricaComparada): boolean {
  return SOMAVEIS.has(metrica);
}

function vazio(): DiaBruto {
  return { spend: 0, impressions: 0, clicks: 0, leads: 0, faturamento: 0, vendas: 0 };
}

/** Soma dois dias. Usado para varrer a série acumulando. */
function somar(a: DiaBruto, b: DiaBruto): DiaBruto {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    leads: a.leads + b.leads,
    faturamento: a.faturamento + b.faturamento,
    vendas: a.vendas + b.vendas,
  };
}

/**
 * Valor de uma métrica a partir dos totais acumulados.
 *
 * `undefined` quando o denominador é zero — e não zero: "ainda não houve lead"
 * não é "o CPL é R$ 0,00". A linha do gráfico corta ali em vez de desabar até o
 * eixo, que leria como desempenho ótimo.
 */
export function valorAcumulado(t: DiaBruto, metrica: MetricaComparada): number | undefined {
  switch (metrica) {
    case "spend": return t.spend;
    case "faturamento": return t.faturamento;
    case "vendas": return t.vendas;
    case "leads": return t.leads;
    case "clicks": return t.clicks;
    case "impressions": return t.impressions;
    case "cpl": return t.leads > 0 ? t.spend / t.leads : undefined;
    // CPV custa por VENDA, não por lead: o lead de popup entra em volume muito
    // maior e faz o custo parecer baixo mesmo quando ninguem compra.
    case "cpv": return t.vendas > 0 ? t.spend / t.vendas : undefined;
    case "cpc": return t.clicks > 0 ? t.spend / t.clicks : undefined;
    case "cpm": return t.impressions > 0 ? (t.spend / t.impressions) * 1000 : undefined;
    case "ctr": return t.impressions > 0 ? (t.clicks / t.impressions) * 100 : undefined;
  }
}

/**
 * Percorre a série somando, e devolve o valor da métrica em cada ponto.
 *
 * Dias ausentes (uma série mais curta que a outra) contam como zero na soma,
 * mas o ponto sai `undefined` — o lançamento que ainda não chegou naquele dia
 * não tem valor acumulado, e desenhar uma reta parada dali em diante sugeriria
 * estagnação em vez de ausência.
 */
export function serieAcumulada(
  dias: Array<DiaBruto | null | undefined>,
  metrica: MetricaComparada,
): Array<number | undefined> {
  let total = vazio();
  return dias.map((dia) => {
    if (!dia) return undefined;
    total = somar(total, dia);
    return valorAcumulado(total, metrica);
  });
}
