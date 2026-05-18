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
