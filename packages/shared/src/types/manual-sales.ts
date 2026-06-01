/**
 * Story 19.9 — Vendas PIX Direto lançadas manualmente no app.
 * Coexistem com vendas vindas da planilha Google Sheets, em seção separada.
 */

export interface ManualSale {
  id: string;
  stageId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  value: number;
  sellerUserId: string | null;
  sellerName: string;
  saleDate: string;
  createdBy: string;
  createdAt: string;
}

export interface ManualSaleSellerRanking {
  sellerUserId: string | null;
  sellerName: string;
  totalSales: number;
  totalRevenue: number;
}

export interface ManualSalesSummary {
  totalSales: number;
  totalRevenue: number;
  avgTicket: number;
  sellersRanking: ManualSaleSellerRanking[];
}

export interface ManualSalesResponse {
  sales: ManualSale[];
  summary: ManualSalesSummary;
}

export interface CreateManualSaleInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  value: number;
  sellerUserId: string;
  saleDate: string;
}
