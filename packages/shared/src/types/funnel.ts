export type FunnelType = "launch" | "perpetual";

export interface FunnelCampaign {
  id: string;
  name: string;
}

export interface SwitchyFolderRef {
  id: number;
  name: string;
}

export interface SwitchyLinkRef {
  uniq: number;
  id: string;
  domain: string;
}

export type StageType = "paid" | "free" | "sales" | "cpl";
export type StageSalesSubtype = "capture" | "main_product" | "sales";

export interface SaleColumnMapping {
  email: string;
  /**
   * Story 28.4: identificador único da transação (Kiwify/Hotmart `ID` ou
   * `Transaction`). Quando mapeado, o backend deduplica vendas por este
   * campo em vez de email — resolve casos de recompras/retries onde o mesmo
   * email gera múltiplas transações reais que não devem ser somadas.
   */
  transactionId?: string;
  valorBruto?: string;
  valorLiquido?: string;
  formaPagamento?: string;
  canalOrigem?: string;
  dataVenda?: string;
  /**
   * UTMs da venda (opcionais) — quando a planilha de vendas já registra as
   * UTMs da compra (Kiwify, Hotmart, etc.), mapear aqui permite atribuir
   * venda diretamente a ad/campanha sem depender do cruzamento por email
   * com a planilha de leads.
   */
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface StageSalesSpreadsheet {
  id: string;
  stageId: string;
  subtype: StageSalesSubtype;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  createdAt: string;
}

/**
 * Story 29.7: plataforma de pagamento — determina o fee% descontado da
 * Receita Bruta pra calcular Margem real.
 *
 * Componentes de fee (somados):
 * - Reembolso: 4%
 * - Marketplace: 4.99% (Kiwify) | 10% (Hotmart)
 * - Imposto: 11%
 * - Outros custos: 1%
 *
 * Totais: Kiwify=20.99% / Hotmart=26% / Other=0%
 */
export type SalesPlatform = "kiwify" | "hotmart" | "other";

export const PLATFORM_FEE_RATES: Record<SalesPlatform, number> = {
  kiwify: 0.2099,
  hotmart: 0.26,
  other: 0,
};

/**
 * Epic 29 — Planilha de vendas conectada a um funil de tipo perpétuo.
 * 1 por funil (sem stage). Mesmo mapper de colunas do StageSalesSpreadsheet.
 */
export interface PerpetualSpreadsheet {
  id: string;
  funnelId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: SaleColumnMapping;
  /** Story 29.7: plataforma de pagamento (null = sem desconto de fees) */
  platform: SalesPlatform | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Epic 29 Story 29.3 — Métricas agregadas da planilha de vendas do perpétuo.
 * porUtmSource é BRUTO (sem normalização Pago/Orgânico) — granularidade total
 * pro time identificar qual canal específico converte.
 */
export interface PerpetualSalesData {
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  /** Story 29.7: bruto × (1 − feeRate) — sempre confiável (calculado server) */
  faturamentoLiquidoCalculado: number;
  platform: SalesPlatform | null;
  feeRate: number;
  ticketMedioBruto: number;
  ticketMedioLiquido: number;
  porUtmSource: { source: string; vendas: number; bruto: number; liquido: number }[];
  /** Story 29.8: por utm_medium (público) + utm_content (criativo) */
  porUtmMedium: { medium: string; vendas: number; bruto: number; liquido: number }[];
  porUtmContent: { content: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  semDados: boolean;
}

/**
 * Série diária de receita bruta da planilha. Chave = data local (YYYY-MM-DD).
 * Sem dedup — cada linha da planilha é uma transação distinta.
 */
export interface PerpetualSalesDataDaily {
  byDay: Record<string, number>;
  semDados: boolean;
}

export interface FunnelStage {
  id: string;
  funnelId: string;
  name: string;
  stageType: StageType;
  metaAccountId: string | null;
  campaigns: FunnelCampaign[];
  googleAdsAccountId: string | null;
  googleAdsCampaigns: FunnelCampaign[];
  switchyFolderIds: SwitchyFolderRef[];
  switchyLinkedLinks: SwitchyLinkRef[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StageSalesData {
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  ticketMedioBruto: number;
  ticketMedioLiquido: number;
  ticketMedioPago: number;
  ticketMedioOrganico: number;
  ticketMedioSemTrack: number;
  porCanal: { canal: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  porUtmSource: { fonte: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_medium. utm_medium carrega o adset_id (padrão Loyola).
   * Backend resolve pra adset_name via cache persistente (Story 28.7) — quando
   * não resolveu, `name === medium` (fallback).
   */
  porUtmMedium: { medium: string; name: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_term. Quando utm_term carrega o adset_id (padrão Loyola),
   * o backend resolve pra adset_name via Meta API (cache persistente, Story
   * 28.7) e preenche `name`. Quando não resolveu, `name === term` (fallback).
   */
  porUtmTerm: { term: string; name: string; vendas: number; bruto: number; liquido: number }[];
  /**
   * Agregação por utm_content. utm_content carrega o ad_id (padrão Loyola); o
   * backend resolve pra ad_name via Meta API (cache persistente, Story 28.7).
   * Quando não resolveu, `name === content` (fallback).
   */
  porUtmContent: { content: string; name: string; vendas: number; bruto: number; liquido: number }[];
  semDados: boolean;
  /**
   * Story 28.4: counters de instrumentação. Só é preenchido quando o request
   * inclui `?debug=1`. Permite investigar discrepâncias entre o que a planilha
   * tem e o que o dashboard exibe — onde linhas foram descartadas, quantas
   * keys de dedup ficaram após agregação.
   */
  debug?: {
    spreadsheetsLoaded: { id: string; name: string; totalRows: number; validRows: number }[];
    totalRowsRead: number;
    skippedEmailEmpty: number;
    skippedDateInvalid: number;
    skippedDateOutOfRange: number;
    uniqueDedupeKeys: number;
    dedupeStrategy: "email" | "transactionId" | "mixed";
  };
}

export interface Funnel {
  id: string;
  projectId: string;
  name: string;
  type: FunnelType;
  metaAccountId: string | null;
  campaigns: FunnelCampaign[];
  googleAdsAccountId: string | null;
  googleAdsCampaigns: FunnelCampaign[];
  switchyFolderIds: SwitchyFolderRef[];
  switchyLinkedLinks: SwitchyLinkRef[];
  compareFunnelId: string | null;
  /** Substring case-insensitive a buscar em campaign.name pra detectar
   * campanhas órfãs (Epic 25). Null = alerta desativado. */
  matchCode: string | null;
  /** Story 18.19 fix: Meta Total + Data Final do gráfico
   * "Leads: Reais vs Projeção vs Meta" — persistido no DB (era localStorage). */
  leadsGoalMeta: number | null;
  leadsGoalDataFinal: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComparisonDayMetrics {
  dayIndex: number;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
}

export interface OrphanCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
}

export interface OrphanStageGroup {
  stageName: string;
  orphans: OrphanCampaign[];
}

export interface OrphanCampaignsResponse {
  hasMatchCode: boolean;
  matchCode: string | null;
  totalMatching: number;
  orphans: OrphanCampaign[];
  byStage: Record<string, OrphanStageGroup>;
}

export interface MetaAdsComparisonData {
  compareFunnelName: string;
  compareStageName: string;
  days: ComparisonDayMetrics[];
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
  };
  semDados: boolean;
  reason?: string;
}
