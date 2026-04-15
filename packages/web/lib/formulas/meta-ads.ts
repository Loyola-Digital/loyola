import { subDays } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Factories puras para o memorial de cálculo do dashboard Meta Ads (Tráfego).
 * Retornam `undefined` quando o denominador é zero (evita divisão por zero);
 * `<MetricTooltip>` faz passthrough nesses casos.
 *
 * Convenção de filtro: `days` é o número de dias olhados para trás a partir
 * de hoje (alinhado com `DayRangePicker`). Quando `days = 0` (custom/all),
 * `period` é omitido do memorial.
 */

export interface MetaAdsFilters {
  /** Número de dias olhados para trás (0 = all/custom). */
  days: number;
  /** Nome da conta Meta ativa — ex: "Loyola Ads BR". Opcional. */
  accountName?: string;
}

const nf = new Intl.NumberFormat("pt-BR");
const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata valor monetário como R$ 1.234,56 (consistente entre card e memorial). */
function fmtBRL(v: number): string {
  return brlFormatter.format(v);
}

function formatPeriodFromDays(days: number): string | undefined {
  if (days <= 0) return undefined;
  const until = new Date();
  const since = subDays(until, days);
  return `${format(since, "dd/MM", { locale: ptBR })} — ${format(until, "dd/MM", { locale: ptBR })}`;
}

function buildNote(filters: MetaAdsFilters): string | undefined {
  if (filters.accountName) return `Conta: ${filters.accountName}`;
  return undefined;
}

// ============================================================
// Métricas brutas (Σ no período)
// ============================================================

export function buildSpendFormula(spend: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ spend",
    values: [{ label: "Investimento total", value: fmtBRL(spend), source: "Meta Ads API · insights.spend" }],
    result: fmtBRL(spend),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildImpressionsFormula(impressions: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ impressions",
    values: [{ label: "Impressões", value: impressions, source: "Meta Ads API · insights.impressions" }],
    result: nf.format(impressions),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildMetaAdsReachFormula(reach: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ reach",
    values: [{ label: "Alcance", value: reach, source: "Meta Ads API · insights.reach" }],
    result: nf.format(reach),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildClicksFormula(clicks: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ clicks",
    values: [{ label: "Cliques", value: clicks, source: "Meta Ads API · insights.clicks" }],
    result: nf.format(clicks),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildLeadsFormula(leads: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ leads",
    values: [{ label: "Leads", value: leads, source: "CRM · leads por campanha" }],
    result: nf.format(leads),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildQualifiedLeadsFormula(qualified: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ qualified leads",
    values: [{ label: "Leads qualificados", value: qualified, source: "CRM · qualifiedLeads" }],
    result: nf.format(qualified),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildSalesFormula(sales: number, filters: MetaAdsFilters): MetricFormula {
  return {
    expression: "Σ sales",
    values: [{ label: "Vendas", value: sales, source: "CRM · sales" }],
    result: nf.format(sales),
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

// ============================================================
// Métricas derivadas (undefined se denominador = 0)
// ============================================================

export function buildFrequencyFormula(
  impressions: number,
  reach: number,
  filters: MetaAdsFilters,
): MetricFormula | undefined {
  if (reach <= 0) return undefined;
  const freq = impressions / reach;
  return {
    expression: "Impressions ÷ Reach",
    values: [
      { label: "Impressões", value: impressions, source: "Meta Ads API · impressions" },
      { label: "Alcance", value: reach, source: "Meta Ads API · reach" },
    ],
    result: `${nf.format(impressions)} ÷ ${nf.format(reach)} = ${freq.toFixed(2)}`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildCtrFormula(
  clicks: number,
  impressions: number,
  filters: MetaAdsFilters,
): MetricFormula | undefined {
  if (impressions <= 0) return undefined;
  const ctr = (clicks / impressions) * 100;
  return {
    expression: "Clicks ÷ Impressions × 100",
    values: [
      { label: "Cliques", value: clicks, source: "Meta Ads API · clicks" },
      { label: "Impressões", value: impressions, source: "Meta Ads API · impressions" },
    ],
    result: `${nf.format(clicks)} ÷ ${nf.format(impressions)} × 100 = ${ctr.toFixed(2)}%`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildCplFormula(
  spend: number,
  leads: number,
  filters: MetaAdsFilters,
): MetricFormula | undefined {
  if (leads <= 0) return undefined;
  const cpl = spend / leads;
  return {
    expression: "Spend ÷ Leads",
    values: [
      { label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · spend" },
      { label: "Leads", value: leads, source: "CRM · leads" },
    ],
    result: `${fmtBRL(spend)} ÷ ${nf.format(leads)} = ${fmtBRL(cpl)}`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildCplQualifiedFormula(
  spend: number,
  qualified: number,
  filters: MetaAdsFilters,
): MetricFormula | undefined {
  if (qualified <= 0) return undefined;
  const cpl = spend / qualified;
  return {
    expression: "Spend ÷ Leads Qualificados",
    values: [
      { label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · spend" },
      { label: "Leads qualificados", value: qualified, source: "CRM · qualifiedLeads" },
    ],
    result: `${fmtBRL(spend)} ÷ ${nf.format(qualified)} = ${fmtBRL(cpl)}`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

export function buildRoasFormula(
  revenue: number,
  spend: number,
  filters: MetaAdsFilters,
): MetricFormula | undefined {
  if (spend <= 0) return undefined;
  const roas = revenue / spend;
  return {
    expression: "Revenue ÷ Spend",
    values: [
      { label: "Receita", value: fmtBRL(revenue), source: "CRM · revenue" },
      { label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · spend" },
    ],
    result: `${fmtBRL(revenue)} ÷ ${fmtBRL(spend)} = ${roas.toFixed(2)}x`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

// ============================================================
// Chart daily point (spend / clicks por dia)
// ============================================================

export function buildSpendDailyFormula(spend: number, dateLabel: string): MetricFormula {
  return {
    expression: `Spend do dia ${dateLabel}`,
    values: [{ label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · spend (time series)" }],
    result: fmtBRL(spend),
    period: dateLabel,
  };
}

export function buildClicksDailyFormula(clicks: number, dateLabel: string): MetricFormula {
  return {
    expression: `Clicks do dia ${dateLabel}`,
    values: [{ label: "Cliques", value: clicks, source: "Meta Ads API · clicks (time series)" }],
    result: nf.format(clicks),
    period: dateLabel,
  };
}
