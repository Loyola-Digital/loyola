import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Factories puras para o memorial de cálculo do dashboard Vendas (Ascensão).
 * Retornam `undefined` quando o denominador é zero.
 */

const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRL = (v: number): string => brl.format(v);
const SOURCE = "Google Sheets · planilha de vendas (column_mapping)";

// Volume KPIs (5)

export function buildSalesFrontFormula(total: number, products: string[]): MetricFormula {
  return {
    expression: "Count de vendas dos produtos front",
    values: [{ label: "Vendas front-end", value: total, source: SOURCE }],
    result: nf.format(total),
    note: products.length > 0 ? `Produtos front: ${products.join(", ")}` : undefined,
  };
}

export function buildSalesBackFormula(total: number, products: string[]): MetricFormula {
  return {
    expression: "Count de vendas dos produtos back",
    values: [{ label: "Vendas back-end", value: total, source: SOURCE }],
    result: nf.format(total),
    note: products.length > 0 ? `Produtos back: ${products.join(", ")}` : undefined,
  };
}

export function buildAscendedFormula(ascended: number, front: number): MetricFormula {
  return {
    expression: "Count de clientes que compraram front E back",
    values: [
      { label: "Ascenderam", value: ascended, source: SOURCE },
      { label: "Compraram front", value: front, source: SOURCE },
    ],
    result: nf.format(ascended),
    note: "Match por email entre compras front e back",
  };
}

export function buildConversionRateFormula(ascended: number, front: number): MetricFormula | undefined {
  if (front <= 0) return undefined;
  const rate = (ascended / front) * 100;
  return {
    expression: "Ascenderam ÷ Compraram front × 100",
    values: [
      { label: "Ascenderam", value: ascended, source: SOURCE },
      { label: "Compraram front", value: front, source: SOURCE },
    ],
    result: `${nf.format(ascended)} ÷ ${nf.format(front)} × 100 = ${rate.toFixed(2)}%`,
  };
}

export function buildAvgDaysFormula(avgDays: number): MetricFormula {
  return {
    expression: "Média de dias entre compra front e back (por cliente que ascendeu)",
    values: [{ label: "Média", value: `${avgDays} dias`, source: "Derivado (superiorDate − inferiorDate)" }],
    result: `${avgDays} dias`,
  };
}

// Revenue KPIs (4)

export function buildRevenueFrontFormula(revenue: number): MetricFormula {
  return {
    expression: "Σ valor das vendas front",
    values: [{ label: "Receita front-end", value: fmtBRL(revenue), source: SOURCE }],
    result: fmtBRL(revenue),
  };
}

export function buildRevenueBackFormula(revenue: number): MetricFormula {
  return {
    expression: "Σ valor das vendas back",
    values: [{ label: "Receita back-end", value: fmtBRL(revenue), source: SOURCE }],
    result: fmtBRL(revenue),
  };
}

export function buildTicketFrontFormula(ticket: number, totalFront: number, revenueFront: number): MetricFormula | undefined {
  if (totalFront <= 0) return undefined;
  return {
    expression: "Receita front ÷ Vendas front",
    values: [
      { label: "Receita front", value: fmtBRL(revenueFront), source: SOURCE },
      { label: "Vendas front", value: totalFront, source: SOURCE },
    ],
    result: `${fmtBRL(revenueFront)} ÷ ${nf.format(totalFront)} = ${fmtBRL(ticket)}`,
  };
}

export function buildLtvFormula(ltv: number): MetricFormula {
  return {
    expression: "(Receita front + Receita back) ÷ clientes únicos",
    values: [{ label: "LTV estimado", value: fmtBRL(ltv), source: "Derivado · receita combinada por cliente" }],
    result: fmtBRL(ltv),
    note: "Inclui apenas clientes com ao menos 1 compra; soma front + back por email",
  };
}

// Timeline / cohort daily points

export function buildSalesDailyPointFormula(label: "Front-end" | "Back-end", count: number, dateLabel: string): MetricFormula {
  return {
    expression: `Vendas ${label.toLowerCase()} do dia ${dateLabel}`,
    values: [{ label: `Vendas ${label.toLowerCase()}`, value: count, source: SOURCE }],
    result: nf.format(count),
    period: dateLabel,
  };
}

export function buildCohortPointFormula(metric: "Compraram front" | "Ascenderam", count: number, month: string): MetricFormula {
  return {
    expression: `${metric} em ${month}`,
    values: [{ label: metric, value: count, source: SOURCE }],
    result: nf.format(count),
    period: month,
  };
}
