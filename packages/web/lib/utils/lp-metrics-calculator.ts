/**
 * Story 18.44: Calculadora de métricas para tabela de LPs
 *
 * Funções puras para cálculo de:
 * - CPM: (Investimento ÷ Impressões) × 1000
 * - CPC: Investimento ÷ Cliques
 * - CTR: (Cliques ÷ Impressões) × 100
 * - Connect Rate: (Conversões ÷ Cliques) × 100
 * - Tx Conv.: (Conversões ÷ LP Views) × 100
 * - CPL: Investimento ÷ Leads
 * - CPV: Investimento ÷ Vendas
 * - ROAS: Faturamento ÷ Investimento
 */

export interface MetricsCalculated {
  cpm: number | null; // R$
  cpc: number | null; // R$
  ctr: number | null; // %
  connectRate: number | null; // %
  txConv: number | null; // %
  cpv?: number | null; // R$ (Captação Paga)
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
 * Connect Rate = (Conversões ÷ Cliques) × 100
 * Conversão = chegou em LP
 */
export function calculateConnectRate(
  conversoes: number,
  cliques: number,
): number | null {
  if (cliques === 0) return null;
  return (conversoes / cliques) * 100;
}

/**
 * Tx Conv. = (Conversões ÷ LP Views) × 100
 * Taxa de conversão do visitante → compra
 */
export function calculateTxConv(
  conversoes: number,
  lpViews: number,
): number | null {
  if (lpViews === 0) return null;
  return (conversoes / lpViews) * 100;
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
  vendas: number;
  faturamento: number;
}): MetricsCalculated {
  return {
    cpm: calculateCPM(params.investimento, params.impressoes),
    cpc: calculateCPC(params.investimento, params.cliques),
    ctr: calculateCTR(params.cliques, params.impressoes),
    connectRate: calculateConnectRate(params.conversoes, params.cliques),
    txConv: calculateTxConv(params.conversoes, params.lpViews),
    cpv: calculateCPV(params.investimento, params.vendas),
    roas: calculateROAS(params.faturamento, params.investimento),
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
    connectRate: calculateConnectRate(params.conversoes, params.cliques),
    txConv: calculateTxConv(params.conversoes, params.lpViews),
    cpl: calculateCPL(params.investimento, params.leads),
  };
}

/**
 * Formatar número como moeda (R$)
 */
export function formatCurrency(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Formatar número como percentual
 */
export function formatPercent(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(decimals)}%`;
}

/**
 * Formatar número como ratio (ROAS)
 */
export function formatRatio(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(decimals);
}
