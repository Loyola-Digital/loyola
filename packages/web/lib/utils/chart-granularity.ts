// Agregação de séries diárias do dashboard por granularidade (Diário/Semanal/
// Mensal). Usada nos gráficos "Margem no Tempo" e "Investimento no Tempo" do
// perpétuo. Pura e testável — não toca em React nem em Date "de agora".
//
// Semana começa no DOMINGO (decisão do produto). Datas manipuladas como
// YYYY-MM-DD ao meio-dia UTC pra não cruzar meia-noite por fuso.

export type ChartGranularity = "day" | "week" | "month";

export interface DailySeriesPoint {
  dateIso: string;      // YYYY-MM-DD
  spend: number;        // investimento COM imposto
  spendBruto: number;   // investimento SEM imposto
  spendTax: number;     // imposto (12,15%)
  revenue: number;      // receita bruta
  margin: number;       // margem líquida do dia (aditiva)
  /**
   * ⚠️ Vendas do PIXEL da Meta. NÃO é o número de compradores.
   *
   * Story 29.60: existem três contagens diferentes de "vendas por dia", e este
   * é a menos exata das três. Medido no BBE (17/07–23/08):
   *
   * ```
   *   únicas (planilha, dedup por comprador/dia) .... 115
   *   linhas da planilha (com order bump) ........... 140
   *   pixel Meta (purchase) .........................  98   <- este campo
   * ```
   *
   * Para plotar ou exibir "vendas", use `salesCount`.
   */
  sales: number;
  /**
   * Story 29.60 — compradores distintos no dia, da planilha (`salesByDay`,
   * dedupado desde a 29.53). É o número que o Quadro de Dados Diários mostra.
   *
   * Opcional porque o campo é aditivo: série montada por código anterior à
   * 29.60 continua agregando sem ele.
   */
  salesCount?: number;
}

export interface AggregatedSeriesPoint {
  dateIso: string;      // data representativa do bucket (dia / domingo da semana / 1º do mês)
  bucketKey: string;    // chave de dedup/ordenação
  label: string;        // rótulo curto do eixo X
  rangeLabel: string;   // rótulo completo (usado no tooltip)
  spend: number;
  spendBruto: number;
  spendTax: number;
  revenue: number;
  margin: number;
  /** ⚠️ Pixel da Meta — ver `DailySeriesPoint.sales`. */
  sales: number;
  /**
   * Story 29.60 — compradores distintos, somados no bucket.
   *
   * ⚠️ Somar compradores/dia por semana NÃO dá compradores/semana: quem comprou
   * terça e quinta conta duas vezes. Desvio deliberado, já assumido pela 29.53
   * (AC2) para a série diária e pela 44.12 — são perguntas diferentes, e
   * "quantos compradores nesta semana?" exigiria deduplicar na origem. A UI
   * declara isso na legenda (AC6).
   */
  salesCount: number;
}

const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Parse YYYY-MM-DD como UTC ao meio-dia — evita mudar de dia por fuso.
function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Domingo (YYYY-MM-DD) da semana que contém `iso`. getUTCDay(): 0=domingo.
export function startOfWeekSunday(iso: string): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toIso(d);
}

function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

// "DD/MM" a partir de YYYY-MM-DD (string-only, sem Date/fuso).
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// "DD/MM/AAAA"
function fullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// "fev/26" a partir de YYYY-MM(-DD)
function monthShort(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MESES_CURTO[Number(m) - 1]}/${y.slice(2)}`;
}

// "Fevereiro de 2026"
function monthLong(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MESES_LONGO[Number(m) - 1]} de ${y}`;
}

/**
 * Agrega uma série diária por granularidade. `day` devolve os próprios dias
 * (com rótulos formatados). `week`/`month` somam spend/receita/margem/vendas
 * dos dias do bucket — margem é aditiva, então a soma das margens diárias é a
 * margem do período. A ordem de saída é cronológica.
 */
export function aggregateSeriesByGranularity(
  daily: DailySeriesPoint[],
  granularity: ChartGranularity,
): AggregatedSeriesPoint[] {
  if (granularity === "day") {
    return daily.map((d) => ({
      ...d,
      // Story 29.60: o campo é opcional na entrada e obrigatório na saída —
      // série antiga agrega como zero em vez de `undefined`, que o Recharts
      // plotaria como buraco na linha.
      salesCount: d.salesCount ?? 0,
      bucketKey: d.dateIso,
      label: ddmm(d.dateIso),
      rangeLabel: fullDate(d.dateIso),
    }));
  }

  const buckets = new Map<string, AggregatedSeriesPoint>();
  for (const d of daily) {
    const key = granularity === "week" ? startOfWeekSunday(d.dateIso) : d.dateIso.slice(0, 7);
    let b = buckets.get(key);
    if (!b) {
      b = {
        dateIso: granularity === "week" ? key : `${key}-01`,
        bucketKey: key,
        label: "",
        rangeLabel: "",
        spend: 0, spendBruto: 0, spendTax: 0, revenue: 0, margin: 0, sales: 0, salesCount: 0,
      };
      buckets.set(key, b);
    }
    b.spend += d.spend;
    b.spendBruto += d.spendBruto;
    b.spendTax += d.spendTax;
    b.revenue += d.revenue;
    b.margin += d.margin;
    b.sales += d.sales;
    // Story 29.60 (AC2): sem esta linha, Semanal e Mensal plotariam o pixel
    // enquanto Diário plota o único — a série mudaria de significado ao trocar
    // o seletor, sem nada na tela indicando.
    b.salesCount += d.salesCount ?? 0;
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.bucketKey.localeCompare(b.bucketKey))
    .map((b) => {
      if (granularity === "week") {
        return { ...b, label: ddmm(b.bucketKey), rangeLabel: `${ddmm(b.bucketKey)} – ${ddmm(addDays(b.bucketKey, 6))}` };
      }
      return { ...b, label: monthShort(b.dateIso), rangeLabel: monthLong(b.dateIso) };
    });
}
