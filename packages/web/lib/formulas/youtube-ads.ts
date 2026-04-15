import { subDays } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { MetricFormula } from "@/lib/types/metric-formula";

/**
 * Factories puras para o memorial de cálculo do dashboard YouTube Ads
 * (Google Ads). Todas derivadas retornam `undefined` quando o denominador
 * é 0 — `<MetricTooltip>` faz passthrough.
 */

export interface YouTubeAdsFilters {
  days: number;
  accountName?: string;
}

const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRL = (v: number): string => brl.format(v);

function formatPeriodFromDays(days: number): string | undefined {
  if (days <= 0) return undefined;
  const until = new Date();
  const since = subDays(until, days);
  return `${format(since, "dd/MM", { locale: ptBR })} — ${format(until, "dd/MM", { locale: ptBR })}`;
}

function buildNote(filters: YouTubeAdsFilters): string | undefined {
  return filters.accountName ? `Conta: ${filters.accountName}` : undefined;
}

// Brutas
export function buildYtSpendFormula(spend: number, filters: YouTubeAdsFilters): MetricFormula {
  return { expression: "Σ cost", values: [{ label: "Investimento", value: fmtBRL(spend), source: "Google Ads API · metrics.cost_micros" }], result: fmtBRL(spend), period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtViewsFormula(views: number, filters: YouTubeAdsFilters): MetricFormula {
  return { expression: "Σ video_views", values: [{ label: "Visualizações", value: views, source: "Google Ads API · metrics.video_views" }], result: nf.format(views), period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtImpressionsFormula(impressions: number, filters: YouTubeAdsFilters): MetricFormula {
  return { expression: "Σ impressions", values: [{ label: "Impressões", value: impressions, source: "Google Ads API · metrics.impressions" }], result: nf.format(impressions), period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtClicksFormula(clicks: number, filters: YouTubeAdsFilters): MetricFormula {
  return { expression: "Σ clicks", values: [{ label: "Cliques", value: clicks, source: "Google Ads API · metrics.clicks" }], result: nf.format(clicks), period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtConversionsFormula(conversions: number, filters: YouTubeAdsFilters): MetricFormula {
  return { expression: "Σ conversions", values: [{ label: "Conversões", value: conversions, source: "Google Ads API · metrics.conversions" }], result: nf.format(conversions), period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}

// Derivadas (undefined se denominador <= 0)
export function buildYtCpvFormula(spend: number, views: number, filters: YouTubeAdsFilters): MetricFormula | undefined {
  if (views <= 0) return undefined;
  const cpv = spend / views;
  return { expression: "Cost ÷ Views", values: [{ label: "Investimento", value: fmtBRL(spend), source: "Google Ads API · cost" }, { label: "Views", value: views, source: "Google Ads API · video_views" }], result: `${fmtBRL(spend)} ÷ ${nf.format(views)} = ${fmtBRL(cpv)}`, period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtViewRateFormula(views: number, impressions: number, filters: YouTubeAdsFilters): MetricFormula | undefined {
  if (impressions <= 0) return undefined;
  const rate = (views / impressions) * 100;
  return { expression: "Views ÷ Impressions × 100", values: [{ label: "Views", value: views, source: "Google Ads API · video_views" }, { label: "Impressões", value: impressions, source: "Google Ads API · impressions" }], result: `${nf.format(views)} ÷ ${nf.format(impressions)} × 100 = ${rate.toFixed(2)}%`, period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtCtrFormula(clicks: number, impressions: number, filters: YouTubeAdsFilters): MetricFormula | undefined {
  if (impressions <= 0) return undefined;
  const ctr = (clicks / impressions) * 100;
  return { expression: "Clicks ÷ Impressions × 100", values: [{ label: "Cliques", value: clicks, source: "Google Ads API · clicks" }, { label: "Impressões", value: impressions, source: "Google Ads API · impressions" }], result: `${nf.format(clicks)} ÷ ${nf.format(impressions)} × 100 = ${ctr.toFixed(2)}%`, period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}
export function buildYtCpcFormula(spend: number, clicks: number, filters: YouTubeAdsFilters): MetricFormula | undefined {
  if (clicks <= 0) return undefined;
  const cpc = spend / clicks;
  return { expression: "Cost ÷ Clicks", values: [{ label: "Investimento", value: fmtBRL(spend), source: "Google Ads API · cost" }, { label: "Cliques", value: clicks, source: "Google Ads API · clicks" }], result: `${fmtBRL(spend)} ÷ ${nf.format(clicks)} = ${fmtBRL(cpc)}`, period: formatPeriodFromDays(filters.days), note: buildNote(filters) };
}

// Retention bars (quartiles)
export function buildYtRetentionFormula(label: "25%" | "50%" | "75%" | "100%", rate: number, filters: YouTubeAdsFilters): MetricFormula {
  return {
    expression: `video_quartile_${label} ÷ total_views`,
    values: [{ label: `Taxa de retenção ${label}`, value: `${(rate * 100).toFixed(2)}%`, source: `Google Ads API · video_quartile_p${label.replace("%", "")}_rate` }],
    result: `${(rate * 100).toFixed(2)}%`,
    period: formatPeriodFromDays(filters.days),
    note: buildNote(filters),
  };
}

// Daily chart points
export function buildYtSpendDailyFormula(spend: number, dateLabel: string): MetricFormula {
  return { expression: `Spend do dia ${dateLabel}`, values: [{ label: "Investimento", value: fmtBRL(spend), source: "Google Ads API · cost (time series)" }], result: fmtBRL(spend), period: dateLabel };
}
export function buildYtViewsDailyFormula(views: number, dateLabel: string): MetricFormula {
  return { expression: `Views do dia ${dateLabel}`, values: [{ label: "Visualizações", value: views, source: "Google Ads API · video_views (time series)" }], result: nf.format(views), period: dateLabel };
}
