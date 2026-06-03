/**
 * Story 19.9 — Vendas PIX Direto lançadas manualmente no app.
 * Coexistem com vendas vindas da planilha Google Sheets, em seção separada.
 */

export type InvoiceStatus = "emitida" | "pendente";

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
  /** Story 19.9 ext: nome do produto vendido (texto livre, manual). */
  product: string | null;
  /** Story 19.9 ext: status da NF — null = não preenchido. */
  invoiceStatus: InvoiceStatus | null;
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
  product?: string;
  invoiceStatus?: InvoiceStatus | null;
}
