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
  // Story 18.55 (Captação Paga): quando presentes, CPL passa a ser
  // Invest ÷ Ingressos Únicos e ROAS = Fat. Total ÷ Invest. A tabela só
  // repassa esses campos quando stageType === "paid" (demais etapas mantêm
  // CPL por leads e ROAS pelo revenue legado).
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueTotal?: number;
  revenueUnico?: number;
  // Story 18.61: estado atual do criativo na Meta + adsets ativos (tooltip).
  status?: "active" | "paused" | "unknown";
  activeAdsets?: string[];
  // Story 18.65: retenção de vídeo (crus) — Hook/Hold/Body Conv. derivam daqui.
  videoViews3s?: number;
  videoViews75?: number;
  /**
   * Prévia do criativo no Facebook (`/watch/?v=<video_id>`). Ausente para
   * imagem/carrossel e quando o video_id não está no cache — nesse caso o nome
   * na tabela fica texto puro, sem link morto.
   */
  previewUrl?: string;
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
  cpl: number | null; // Invest / Leads (Paga: Invest / Ingressos Únicos)
  revenue: number;
  roas: number | null; // Faturamento / Invest (Paga: Fat. Total / Invest)
  utmTerm: string | null;
  temperature: "hot" | "cold" | "unknown";
  // Story 18.55: presentes apenas no modo Captação Paga
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueTotal?: number;
  revenueUnico?: number;
  // Story 18.61: estado atual do criativo na Meta + adsets ativos (tooltip).
  status?: "active" | "paused" | "unknown";
  activeAdsets?: string[];
  // Story 18.65: retenção de vídeo — derivadas (%) + crus (somáveis no Total).
  hookRate: number; // 3s ÷ impressões × 100 (Atenção Inicial)
  holdRate: number; // 75% ÷ 3s × 100 (Retenção Real)
  bodyConv: number; // leads ÷ 75% × 100 (Conversão do Corpo)
  videoViews3s: number;
  videoViews75: number;
  /** Prévia do criativo no Facebook. Ausente para imagem/carrossel. */
  previewUrl?: string;
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
 * Story 18.65: Hook Rate — Visualização 3s ÷ Impressões × 100 (Atenção Inicial:
 * dos que viram o anúncio, quantos assistiram os primeiros 3 segundos).
 * Verde ≥ 25%. Retorna 0 se impressões = 0 (mantém a coluna ordenável).
 */
export function calculateHookRate(views3s: number, impressions: number): number {
  if (impressions === 0) return 0;
  return (views3s / impressions) * 100;
}

/**
 * Story 18.65: Hold Rate — Visualização 75% ÷ Visualização 3s × 100 (Retenção
 * Real: dos que passaram pelo gancho, quantos seguiram retidos até 75% do corpo).
 * Verde ≥ 13%. Retorna 0 se 3s = 0.
 */
export function calculateHoldRate(views75: number, views3s: number): number {
  if (views3s === 0) return 0;
  return (views75 / views3s) * 100;
}

/**
 * Story 18.65: Body Conv. — Leads ÷ Visualização 75% × 100 (Conversão do Corpo:
 * dos que viram o corpo do vídeo, quantos converteram em lead).
 * Verde ≥ 3,7%. Retorna 0 se 75% = 0.
 */
export function calculateBodyConv(leads: number, views75: number): number {
  if (views75 === 0) return 0;
  return (leads / views75) * 100;
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
  // Story 18.55: modo Captação Paga — CPL por Ingresso Único, ROAS pelo Total
  const isPaidMode = creative.ingressosUnicos != null;

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
    cpl: isPaidMode
      ? calculateCpl(creative.spend, creative.ingressosUnicos!)
      : calculateCpl(creative.spend, creative.leads),
    revenue: creative.revenue,
    roas: isPaidMode
      ? calculateRoas(creative.revenueTotal ?? 0, creative.spend)
      : calculateRoas(creative.revenue, creative.spend),
    utmTerm: creative.utmTerm,
    temperature: calculateTemperature(creative.utmTerm),
    // Story 18.61: propaga status/adsets ativos (aditivo — não afeta métricas)
    status: creative.status,
    activeAdsets: creative.activeAdsets,
    // Story 18.65: retenção de vídeo — derivadas + crus (p/ o Total recalcular)
    hookRate: calculateHookRate(creative.videoViews3s ?? 0, creative.impressions),
    holdRate: calculateHoldRate(creative.videoViews75 ?? 0, creative.videoViews3s ?? 0),
    bodyConv: calculateBodyConv(creative.leads, creative.videoViews75 ?? 0),
    videoViews3s: creative.videoViews3s ?? 0,
    videoViews75: creative.videoViews75 ?? 0,
    // Aditivo — não afeta métrica nenhuma, só habilita o link no nome.
    previewUrl: creative.previewUrl,
    ...(isPaidMode
      ? {
          ingressosUnicos: creative.ingressosUnicos,
          ingressosTotais: creative.ingressosTotais ?? 0,
          revenueTotal: creative.revenueTotal ?? 0,
          revenueUnico: creative.revenueUnico ?? 0,
        }
      : {}),
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
