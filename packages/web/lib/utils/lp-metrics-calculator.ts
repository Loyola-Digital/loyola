/**
 * Story 18.44: Calculadora de métricas para tabela de LPs
 *
 * Funções puras para cálculo de (fórmulas atualizadas pela 18.46):
 * - CPM: (Investimento ÷ Impressões) × 1000
 * - CPC: Investimento ÷ Cliques
 * - CTR: (Cliques ÷ Impressões) × 100
 * - Connect Rate: (LP Views ÷ Cliques no link) × 100
 * - Tx Conv.: (Resultado ÷ Cliques no link) × 100 — Resultado = Leads (free) ou Vendas (paid)
 * - CPL: Investimento ÷ Leads
 * - CPV: Investimento ÷ Vendas
 * - ROAS: Faturamento ÷ Investimento
 *
 * Story 18.58: os tooltips dos headers da tabela descrevem estas fórmulas —
 * ao mudar um cálculo aqui, atualizar COLUMN_TOOLTIPS em
 * lib/components/funnels/lp-performance-table.tsx.
 */

export interface MetricsCalculated {
  cpm: number | null; // R$
  cpc: number | null; // R$
  ctr: number | null; // %
  connectRate: number | null; // %
  txConv: number | null; // %
  cpv?: number | null; // R$ (legado — substituído por cplPagoUnico na 18.60)
  cplPagoUnico?: number | null; // R$ (Captação Paga — Story 18.60: Invest ÷ Ing. Únicos)
  roas?: number | null; // ratio (Captação Paga)
  cpl?: number | null; // R$ (Captação Gratuita)
}

/**
 * CPM = (Investimento ÷ Impressões) × 1000
 */
export function calculateCPM(investimento: number, impressoes: number): number | null {
  if (impressoes === 0) return null;
  return (investimento / impressoes) * 1000;
}

/**
 * CPC = Investimento ÷ Cliques
 */
export function calculateCPC(investimento: number, cliques: number): number | null {
  if (cliques === 0) return null;
  return investimento / cliques;
}

/**
 * CTR = (Cliques ÷ Impressões) × 100
 */
export function calculateCTR(cliques: number, impressoes: number): number | null {
  if (impressoes === 0) return null;
  return (cliques / impressoes) * 100;
}

/**
 * Story 18.46 (AC5): Connect Rate = (LP View ÷ Link Clicks) × 100
 * Mede a % de cliques que efetivamente carregaram a LP (Landing Page View).
 * Pode passar de 100% por particularidades de rastreamento — exibir valor real.
 */
export function calculateConnectRate(
  lpViews: number,
  cliques: number,
): number | null {
  if (cliques === 0) return null;
  return (lpViews / cliques) * 100;
}

/**
 * Story 18.46: Tx Conv. = (Resultado ÷ Link Clicks) × 100
 * Resultado = Leads (Captação Gratuita) ou Vendas (Captação Paga).
 * Mede a % dos cliques no link que viraram lead/venda — consistente com a
 * tabela Dados Diários (Leads ÷ Link Clicks).
 */
export function calculateTxConv(
  resultado: number,
  cliques: number,
): number | null {
  if (cliques === 0) return null;
  return (resultado / cliques) * 100;
}

/**
 * CPV = Investimento ÷ Vendas
 * Custo por venda/lead
 */
export function calculateCPV(investimento: number, vendas: number): number | null {
  if (vendas === 0) return null;
  return investimento / vendas;
}

/**
 * Story 18.60: CPL Pago Único = Investimento ÷ Ingressos Únicos
 * Custo por comprador único de ingresso atribuído à LP (via co= da venda).
 */
export function calculateCplPagoUnico(
  investimento: number,
  ingressosUnicos: number,
): number | null {
  if (ingressosUnicos === 0) return null;
  return investimento / ingressosUnicos;
}

/**
 * ROAS = Faturamento ÷ Investimento
 * Return on Ad Spend
 */
export function calculateROAS(
  faturamento: number,
  investimento: number,
): number | null {
  if (investimento === 0) return null;
  return faturamento / investimento;
}

/**
 * CPL = Investimento ÷ Leads
 * Custo por lead (Captação Gratuita)
 */
export function calculateCPL(investimento: number, leads: number): number | null {
  if (leads === 0) return null;
  return investimento / leads;
}

/**
 * Calcular todas as métricas para Captação Paga
 */
export function calculatePaidMetrics(params: {
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  // Story 18.60: Ing. Únicos + Fat. Total substituem Vendas/Faturamento como base
  // das métricas de resultado (CPL Pago Único, Tx Conv., ROAS).
  ingressosUnicos: number;
  revenueTotal: number;
}): MetricsCalculated {
  return {
    cpm: calculateCPM(params.investimento, params.impressoes),
    cpc: calculateCPC(params.investimento, params.cliques),
    ctr: calculateCTR(params.cliques, params.impressoes),
    // Story 18.46 (AC5): Connect Rate = LP View ÷ Link Clicks
    connectRate: calculateConnectRate(params.lpViews, params.cliques),
    // Story 18.60: Tx Conv. (paga) = Ing. Únicos ÷ Link Clicks (alinha 18.52)
    txConv: calculateTxConv(params.ingressosUnicos, params.cliques),
    // Story 18.60: CPL Pago Único = Investimento ÷ Ing. Únicos
    cplPagoUnico: calculateCplPagoUnico(params.investimento, params.ingressosUnicos),
    // Story 18.60: ROAS = Fat. Total ÷ Investimento
    roas: calculateROAS(params.revenueTotal, params.investimento),
  };
}

/**
 * Calcular todas as métricas para Captação Gratuita
 */
export function calculateFreeMetrics(params: {
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  leads: number;
}): MetricsCalculated {
  return {
    cpm: calculateCPM(params.investimento, params.impressoes),
    cpc: calculateCPC(params.investimento, params.cliques),
    ctr: calculateCTR(params.cliques, params.impressoes),
    // Story 18.46 (AC5): Connect Rate = LP View ÷ Link Clicks
    connectRate: calculateConnectRate(params.lpViews, params.cliques),
    // Story 18.46: Tx Conv. = Leads ÷ Link Clicks (free)
    txConv: calculateTxConv(params.leads, params.cliques),
    cpl: calculateCPL(params.investimento, params.leads),
  };
}

/**
 * Formatar número como moeda (R$)
 */
export function formatCurrency(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formatar número como percentual (máximo 2 casas decimais)
 */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  const result = parseFloat(value.toFixed(decimals));
  return `${result.toFixed(2)}%`;
}

/**
 * Formatar número como ratio/ROAS (máximo 2 casas decimais)
 */
export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  const result = parseFloat(value.toFixed(decimals));
  return result.toFixed(2);
}
