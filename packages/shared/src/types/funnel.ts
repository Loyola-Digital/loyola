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

export type StageType = "paid" | "free";
export type StageSalesSubtype = "capture" | "main_product";

export interface SaleColumnMapping {
  email: string;
  valorBruto?: string;
  valorLiquido?: string;
  formaPagamento?: string;
  canalOrigem?: string;
  dataVenda?: string;
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
  porCanal: { canal: string; vendas: number; bruto: number; liquido: number }[];
  porFormaPagamento: { forma: string; vendas: number; bruto: number; liquido: number }[];
  semDados: boolean;
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
