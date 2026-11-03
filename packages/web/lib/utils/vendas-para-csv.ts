/**
 * A tabela de vendas da etapa em arquivo, e o estado de reembolso de cada
 * venda.
 *
 * O reembolso chega por dois caminhos diferentes e a tela trata os dois igual:
 * `refundedAt` é o reembolso lançado à mão (Evento Presencial, com data e
 * motivo) e `refundStatus` é o que veio da coluna de status do checkout
 * (Kiwify/Hotmart), onde só existe o status trocado. Daí o helper: a venda
 * reembolsada CONTINUA na lista — ela aconteceu — mas não entra na receita.
 */

import type { UnifiedSale } from "@/lib/hooks/use-manual-sales";
import { montarCsv } from "./baixar-csv";

export function estaReembolsada(venda: UnifiedSale): boolean {
  return !!venda.refundedAt || !!venda.refundStatus;
}

export function situacaoDaVenda(venda: UnifiedSale): string {
  if (venda.refundStatus === "chargeback") return "Estornada (chargeback)";
  if (estaReembolsada(venda)) return "Reembolsada";
  return "Paga";
}

/** De onde a venda veio, em texto — o mesmo que o selo mostra na tabela. */
export function origemDaVenda(venda: UnifiedSale): string {
  if (venda.source === "manual") return "PIX (manual)";
  return venda.sourceLabel ?? "Kiwify";
}

function dataBr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

const CABECALHO = [
  "Data",
  "Cliente",
  "E-mail",
  "Telefone",
  "Produto",
  "Vendedor",
  "Origem",
  "Situação",
  "Motivo do reembolso",
  "NF",
  "Valor",
] as const;

export function csvDasVendas(vendas: readonly UnifiedSale[]): string {
  return montarCsv(
    CABECALHO,
    vendas.map((v) => [
      dataBr(v.saleDate),
      v.customerName ?? "",
      v.customerEmail ?? "",
      v.customerPhone ?? "",
      v.product ?? "",
      v.sellerName ?? "",
      origemDaVenda(v),
      situacaoDaVenda(v),
      v.refundReason ?? "",
      // Vazio em vez de "—": a planilha é lida por gente e por fórmula.
      v.invoiceStatus === "emitida" ? "Emitida" : v.invoiceStatus === "pendente" ? "Pendente" : "",
      // Vírgula decimal: é assim que o Excel pt-BR reconhece como número.
      v.value.toFixed(2).replace(".", ","),
    ]),
  );
}
