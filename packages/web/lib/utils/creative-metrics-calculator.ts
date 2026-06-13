/**
 * Story 18.24: Calculadora de Métricas de Criativos
 * Funções puras para calcular ROAS, CPL, CTR, CPC, CPM, % de gasto
 */

export interface CreativeMetrics {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
  utmTerm: string | null;
  totalSpend?: number; // para cálculo de percentual
}

export interface CalculatedMetrics {
  adId: string;
  adName: string;
  spend: number;
  spendPercent: number; // %
  impressions: number;
  clicks: number;
  ctr: number; // Cliques / Impressões * 100
  cpc: number | null; // Invest / Cliques
  cpm: number | null; // (Invest / Impressões) * 1000
  leads: number;
  cpl: number | null; // Invest / Leads
  revenue: number;
  roas: number | null; // Faturamento / Invest
  utmTerm: string | null;
  temperature: "hot" | "cold" | "unknown";
}

/**
 * Calcula temperatura do público baseado em utm_term.
 * Story 18.46 (AC7): também considera o Campaign Name (param opcional),
 * pois algumas campanhas codificam hot/cold no nome em vez do utm_term.
 */
export function calculateTemperature(
  utmTerm: string | null | undefined,
  campaignName?: string | null,
): "hot" | "cold" | "unknown" {
  const haystack = `${utmTerm ?? ""} ${campaignName ?? ""}`.toLowerCase();
  if (!haystack.trim()) return "unknown";
  if (haystack.includes("hot")) return "hot";
  if (haystack.includes("cold")) return "cold";
  return "unknown";
}

/**
 * Calcula CTR (Click-Through Rate)
 * Cliques / Impressões * 100
 */
export function calculateCtr(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return (clicks / impressions) * 100;
}

/**
 * Calcula CPC (Cost Per Click)
 * Invest / Cliques
 * Retorna null se Cliques = 0
 */
export function calculateCpc(spend: number, clicks: number): number | null {
  if (clicks === 0) return null;
  return spend / clicks;
}

/**
 * Calcula CPM (Cost Per Mille/Thousand Impressions)
 * (Invest / Impressões) * 1000
 * Retorna null se Impressões = 0
 */
export function calculateCpm(spend: number, impressions: number): number | null {
  if (impressions === 0) return null;
  return (spend / impressions) * 1000;
}

/**
 * Calcula CPL (Cost Per Lead)
 * Invest / Leads
 * Retorna null se Leads = 0
 */
export function calculateCpl(spend: number, leads: number): number | null {
  if (leads === 0) return null;
  return spend / leads;
}

/**
 * Calcula ROAS (Return on Ad Spend)
 * Faturamento / Invest
 * Retorna null se Invest = 0
 */
export function calculateRoas(revenue: number, spend: number): number | null {
  if (spend === 0) return null;
  return revenue / spend;
}

/**
 * Calcula percentual de gasto em relação ao total
 * (Spend desta row / Total Spend) * 100
 */
export function calculateSpendPercent(spend: number, totalSpend: number): number {
  if (totalSpend === 0) return 0;
  return (spend / totalSpend) * 100;
}

/**
 * Calcula todas as métricas para um criativo
 */
export function calculateCreativeMetrics(
  creative: CreativeMetrics
): CalculatedMetrics {
  const totalSpend = creative.totalSpend || creative.spend;

  return {
    adId: creative.adId,
    adName: creative.adName,
    spend: creative.spend,
    spendPercent: calculateSpendPercent(creative.spend, totalSpend),
    impressions: creative.impressions,
    clicks: creative.clicks,
    ctr: calculateCtr(creative.clicks, creative.impressions),
    cpc: calculateCpc(creative.spend, creative.clicks),
    cpm: calculateCpm(creative.spend, creative.impressions),
    leads: creative.leads,
    cpl: calculateCpl(creative.spend, creative.leads),
    revenue: creative.revenue,
    roas: calculateRoas(creative.revenue, creative.spend),
    utmTerm: creative.utmTerm,
    temperature: calculateTemperature(creative.utmTerm),
  };
}

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const INT_FORMATTER = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

/**
 * Formata número para exibição (com fallback "—" para valores inválidos).
 *
 * - `currency`: BRL completo (R$ 120.786,80). `compact: true` usa K/M
 *   (R$ 14,3K) — usado em celulas estreitas da tabela.
 * - `percentage`: 2 casas decimais com %.
 * - `number`: inteiro com separador de milhar. `compact: true` usa K/M.
 */
export function formatMetricValue(
  value: number | null | undefined,
  type: "currency" | "percentage" | "number" = "number",
  options: { compact?: boolean } = {}
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "—";
  }

  switch (type) {
    case "currency":
      if (options.compact) {
        if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
        if (value >= 1_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}K`;
      }
      return BRL_FORMATTER.format(value);
    case "percentage":
      return `${value.toFixed(2)}%`;
    case "number":
      if (options.compact) {
        if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
        if (value >= 1_000) return `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}K`;
      }
      return INT_FORMATTER.format(value);
  }
}
