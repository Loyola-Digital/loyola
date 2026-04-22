import { subDays } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Factories puras para dashboards de Funis (Launch + Perpetual).
 * Agrega dados de múltiplas fontes: Meta Ads API (spend/impressions/clicks/leads),
 * Google Sheets (sales/revenue), CRM (leads qualificados), etc.
 */

export interface FunnelFilters {
  days: number;
  funnelType?: "launch" | "perpetual";
  funnelName?: string;
}

const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRL = (v: number): string => brl.format(v);

function period(filters: FunnelFilters): string | undefined {
  if (filters.days <= 0) return undefined;
  const until = new Date();
  const since = subDays(until, filters.days);
  return `${format(since, "dd/MM", { locale: ptBR })} — ${format(until, "dd/MM", { locale: ptBR })}`;
}

function note(filters: FunnelFilters): string | undefined {
  if (filters.funnelName) return `Funil: ${filters.funnelName} (${filters.funnelType ?? "—"})`;
  return undefined;
}

// ============================================================
// LAUNCH KPIs
// ============================================================

export function buildFunnelSpendFormula(spend: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (spend == null) return undefined;
  return { expression: "Σ spend (campanhas do funil)", values: [{ label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · spend (campanhas vinculadas ao funil)" }], result: fmtBRL(spend), period: period(f), note: note(f) };
}

export interface LeadsBreakdown {
  pagos: number;
  org: number;
  semTrack: number;
}

export function buildFunnelLeadsFormula(
  leads: number | null | undefined,
  f: FunnelFilters,
  breakdown?: LeadsBreakdown,
): MetricFormula | undefined {
  if (leads == null) return undefined;
  if (breakdown) {
    return {
      expression: "Σ linhas da planilha categorizadas por utm_source",
      values: [
        { label: "Leads pagos", value: breakdown.pagos, source: "Planilha · utm_source ∈ {meta, meta-ads, google-ads}" },
        { label: "Leads org", value: breakdown.org, source: "Planilha · utm_source preenchido mas não-pago" },
        { label: "Leads s/ track", value: breakdown.semTrack, source: "Planilha · utm_source vazio ou coluna não mapeada" },
        { label: "Total", value: leads, source: "Derivado · pagos + org + s/ track" },
      ],
      result: nf.format(leads),
      period: period(f),
      note: note(f),
    };
  }
  return { expression: "Σ leads (campanhas do funil)", values: [{ label: "Leads", value: leads, source: "CRM · leads atribuídos ao funil" }], result: nf.format(leads), period: period(f), note: note(f) };
}

export function buildFunnelCplFormula(
  spend: number | null | undefined,
  leads: number | null | undefined,
  f: FunnelFilters,
  variant: "pago" | "geral" | "legacy" = "legacy",
): MetricFormula | undefined {
  if (spend == null || leads == null || leads <= 0) return undefined;
  const cpl = spend / leads;
  if (variant === "pago") {
    return {
      expression: "Spend ÷ Leads pagos",
      values: [
        { label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · Σ spend das campanhas" },
        { label: "Leads pagos", value: leads, source: "Planilha · utm_source ∈ {meta, meta-ads, google-ads}" },
      ],
      result: `${fmtBRL(spend)} ÷ ${nf.format(leads)} = ${fmtBRL(cpl)}`,
      period: period(f),
      note: note(f),
    };
  }
  if (variant === "geral") {
    return {
      expression: "Spend ÷ Total de leads (pagos + org + s/ track)",
      values: [
        { label: "Investimento", value: fmtBRL(spend), source: "Meta Ads API · Σ spend das campanhas" },
        { label: "Total de leads", value: leads, source: "Planilha · todas as linhas categorizadas" },
      ],
      result: `${fmtBRL(spend)} ÷ ${nf.format(leads)} = ${fmtBRL(cpl)}`,
      period: period(f),
      note: note(f),
    };
  }
  return { expression: "Spend ÷ Leads", values: [{ label: "Investimento", value: fmtBRL(spend), source: "Meta Ads · spend" }, { label: "Leads", value: leads, source: "CRM" }], result: `${fmtBRL(spend)} ÷ ${nf.format(leads)} = ${fmtBRL(cpl)}`, period: period(f), note: note(f) };
}

export function buildFunnelConnectRateFormula(rate: number | null, f: FunnelFilters): MetricFormula | undefined {
  if (rate == null) return undefined;
  return { expression: "Leads Pagos ÷ Landing page views × 100", values: [{ label: "Connect Rate", value: `${rate.toFixed(2)}%`, source: "Planilha · leads pagos atribuídos; Meta Ads API · landing_page_views" }], result: `${rate.toFixed(2)}%`, period: period(f), note: note(f) };
}

export function buildFunnelCtrFormula(ctr: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (ctr == null) return undefined;
  return { expression: "Link clicks ÷ Impressions × 100 (recalculado no frontend)", values: [{ label: "CTR", value: `${ctr.toFixed(2)}%`, source: "Meta Ads API · actions[link_click] e impressions" }], result: `${ctr.toFixed(2)}%`, period: period(f), note: note(f) };
}

export function buildFunnelCpcFormula(cpc: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (cpc == null) return undefined;
  return { expression: "Spend ÷ Link clicks (recalculado no frontend)", values: [{ label: "CPC", value: fmtBRL(cpc), source: "Meta Ads API · spend ÷ actions[link_click]" }], result: fmtBRL(cpc), period: period(f), note: note(f) };
}

export function buildFunnelCpmFormula(cpm: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (cpm == null) return undefined;
  return { expression: "Spend ÷ Impressions × 1000 (recalculado no frontend)", values: [{ label: "CPM", value: fmtBRL(cpm), source: "Meta Ads API · spend e impressions" }], result: fmtBRL(cpm), period: period(f), note: note(f) };
}

// ============================================================
// PERPETUAL KPIs
// ============================================================

export function buildFunnelRoasFormula(roas: number | null, f: FunnelFilters): MetricFormula | undefined {
  if (roas == null) return undefined;
  return { expression: "Revenue ÷ Spend", values: [{ label: "ROAS", value: `${roas.toFixed(2)}x`, source: "Derivado · (Google Sheets revenue ÷ Meta Ads spend)" }], result: `${roas.toFixed(2)}x`, period: period(f), note: note(f) };
}

export function buildFunnelSalesCountFormula(sales: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (sales == null) return undefined;
  return { expression: "Σ vendas (atribuídas ao funil)", values: [{ label: "Vendas", value: sales, source: "Google Sheets · planilha de vendas" }], result: nf.format(sales), period: period(f), note: note(f) };
}

export function buildFunnelRevenueFormula(revenue: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (revenue == null) return undefined;
  return { expression: "Σ valor das vendas atribuídas", values: [{ label: "Receita", value: fmtBRL(revenue), source: "Google Sheets · valor das vendas" }], result: fmtBRL(revenue), period: period(f), note: note(f) };
}

export function buildFunnelCacFormula(cac: number | null, f: FunnelFilters): MetricFormula | undefined {
  if (cac == null) return undefined;
  return { expression: "Spend ÷ Vendas", values: [{ label: "CAC", value: fmtBRL(cac), source: "Derivado · (spend ÷ sales)" }], result: fmtBRL(cac), period: period(f), note: note(f) };
}

export function buildFunnelMarginFormula(margin: number | null | undefined, f: FunnelFilters): MetricFormula | undefined {
  if (margin == null) return undefined;
  return { expression: "Revenue − Spend", values: [{ label: "Margem", value: fmtBRL(margin), source: "Derivado" }], result: fmtBRL(margin), period: period(f), note: note(f) };
}

export function buildFunnelMarginPercentFormula(marginPercent: number | null, f: FunnelFilters): MetricFormula | undefined {
  if (marginPercent == null) return undefined;
  return { expression: "(Revenue − Spend) ÷ Revenue × 100", values: [{ label: "Margem %", value: `${marginPercent.toFixed(2)}%`, source: "Derivado" }], result: `${marginPercent.toFixed(2)}%`, period: period(f), note: note(f) };
}

// ============================================================
// Taxa cards (perpetual)
// ============================================================

export function buildFunnelRateFormula(label: string, sublabel: string, value: number | null, f: FunnelFilters): MetricFormula | undefined {
  if (value == null) return undefined;
  return { expression: sublabel, values: [{ label, value: `${value.toFixed(2)}%`, source: "Meta Ads API · derivado" }], result: `${value.toFixed(2)}%`, period: period(f), note: note(f) };
}

// ============================================================
// Survey card (launch)
// ============================================================

export function buildFunnelSurveyFormula(totalResponses: number, totalLeads: number | null | undefined): MetricFormula | undefined {
  if (totalLeads == null || totalLeads <= 0) return undefined;
  const rate = (totalResponses / totalLeads) * 100;
  return { expression: "Respostas da pesquisa ÷ Total de leads × 100", values: [{ label: "Respostas", value: totalResponses, source: "Google Sheets · pesquisa vinculada" }, { label: "Total de leads", value: totalLeads, source: "Planilha vinculada · contagem das linhas categorizadas" }], result: `${nf.format(totalResponses)} ÷ ${nf.format(totalLeads)} × 100 = ${rate.toFixed(1)}%` };
}

// ============================================================
// Daily chart points
// ============================================================

export function buildFunnelDailyFormula(label: string, apiSource: string, value: number, isCurrency: boolean, dateLabel: string): MetricFormula {
  return {
    expression: `${label} do dia ${dateLabel}`,
    values: [{ label, value: isCurrency ? fmtBRL(value) : nf.format(value), source: apiSource }],
    result: isCurrency ? fmtBRL(value) : nf.format(value),
    period: dateLabel,
  };
}

// ============================================================
// Funnel conversion stages
// ============================================================

export function buildFunnelStageFormula(stageLabel: string, value: number, apiSource: string): MetricFormula {
  return {
    expression: `Σ ${stageLabel.toLowerCase()}`,
    values: [{ label: stageLabel, value: nf.format(value), source: apiSource }],
    result: nf.format(value),
  };
}

export function buildFunnelStageConversionFormula(
  fromLabel: string,
  fromValue: number,
  toLabel: string,
  toValue: number,
): MetricFormula | undefined {
  if (fromValue <= 0) return undefined;
  const rate = (toValue / fromValue) * 100;
  return {
    expression: `${toLabel} ÷ ${fromLabel} × 100`,
    values: [
      { label: fromLabel, value: nf.format(fromValue), source: "Meta Ads API · derivado" },
      { label: toLabel, value: nf.format(toValue), source: "Meta Ads API · derivado" },
    ],
    result: `${nf.format(toValue)} ÷ ${nf.format(fromValue)} × 100 = ${rate.toFixed(1)}%`,
  };
}

// ============================================================
// Drill-down enrichment
// ============================================================

export interface EntityPath {
  campaign?: string;
  adset?: string;
  ad?: string;
}

function formatEntityPath(p: EntityPath): string {
  const parts: string[] = [];
  if (p.campaign) parts.push(`Campanha: ${p.campaign}`);
  if (p.adset) parts.push(`Ad Set: ${p.adset}`);
  if (p.ad) parts.push(`Ad: ${p.ad}`);
  return parts.join(" · ");
}

export function enrichFormulaForEntity(
  formula: MetricFormula | undefined,
  path: EntityPath,
): MetricFormula | undefined {
  if (!formula) return undefined;
  const entityNote = formatEntityPath(path);
  if (!entityNote) return formula;
  const combinedNote = formula.note ? `${entityNote}\n${formula.note}` : entityNote;
  return { ...formula, note: combinedNote };
}
