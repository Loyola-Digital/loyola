/**
 * Story 19.9 — Vendas PIX Direto lançadas manualmente no app.
 * Coexistem com vendas vindas da planilha Google Sheets, em seção separada.
 */

import type { MemberkitEnrollmentStatus } from "./memberkit.js";

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
  /** Story 19.10 — valor efetivamente recebido (Caixa) na venda de evento. */
  valorRecebido: number | null;
  /** Story 19.10 — texto livre da negociação (evento presencial). */
  negociacao: string | null;
  /** Story 19.11 — status da matrícula MemberKit desta venda. */
  memberkitStatus: MemberkitEnrollmentStatus | null;
  /** Story 19.11 — quando a matrícula foi sincronizada (ISO). */
  memberkitSyncedAt: string | null;
  /** Story 19.11 — id do membro retornado pelo MemberKit. */
  memberkitUserId: string | null;
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
  /**
   * Vendedor como usuário da plataforma (etapas "sales"/"paid"). Story 19.10:
   * opcional — na etapa de Evento Presencial o vendedor é o Closer (texto livre,
   * via `sellerName`), que não é usuário do app. Informar `sellerUserId` OU `sellerName`.
   */
  sellerUserId?: string;
  /** Story 19.10 — nome do vendedor/closer (texto livre), usado quando não há `sellerUserId`. */
  sellerName?: string;
  saleDate: string;
  product?: string;
  invoiceStatus?: InvoiceStatus | null;
  /** Story 19.10 — valor efetivamente recebido (Caixa) na venda de evento. */
  valorRecebido?: number | null;
  /** Story 19.10 — texto livre da negociação (evento presencial); null limpa o campo. */
  negociacao?: string | null;
}
