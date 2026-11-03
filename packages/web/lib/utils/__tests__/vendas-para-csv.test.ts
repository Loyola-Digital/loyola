import { describe, expect, it } from "vitest";
import {
  csvDasVendas,
  estaReembolsada,
  origemDaVenda,
  situacaoDaVenda,
} from "../vendas-para-csv";
import type { UnifiedSale } from "@/lib/hooks/use-manual-sales";

function venda(over: Partial<UnifiedSale> = {}): UnifiedSale {
  return {
    id: "sheet:1:tx|abc|Curso",
    source: "spreadsheet",
    customerName: "Maria Souza",
    customerEmail: "maria@exemplo.com",
    customerPhone: null,
    product: "Curso",
    value: 1997,
    sellerName: "meta-ads",
    saleDate: "2026-10-15T12:00:00.000Z",
    invoiceStatus: null,
    manualSaleId: null,
    sourceLabel: null,
    valorRecebido: null,
    negociacao: null,
    refundedAt: null,
    refundReason: null,
    refundStatus: null,
    ...over,
  };
}

describe("estaReembolsada — os dois caminhos do reembolso", () => {
  it("vale tanto para o lançado à mão quanto para o status da planilha", () => {
    expect(estaReembolsada(venda())).toBe(false);
    expect(estaReembolsada(venda({ refundStatus: "refunded" }))).toBe(true);
    expect(estaReembolsada(venda({ refundStatus: "chargeback" }))).toBe(true);
    expect(estaReembolsada(venda({ refundedAt: "2026-10-20T00:00:00.000Z" }))).toBe(true);
  });

  it("chargeback é nomeado como estorno, e não como reembolso simples", () => {
    expect(situacaoDaVenda(venda())).toBe("Paga");
    expect(situacaoDaVenda(venda({ refundStatus: "refunded" }))).toBe("Reembolsada");
    expect(situacaoDaVenda(venda({ refundStatus: "chargeback" }))).toBe("Estornada (chargeback)");
  });

  it("a origem é a mesma do selo da tabela", () => {
    expect(origemDaVenda(venda())).toBe("Kiwify");
    expect(origemDaVenda(venda({ sourceLabel: "TMB" }))).toBe("TMB");
    expect(origemDaVenda(venda({ source: "manual" }))).toBe("PIX (manual)");
  });
});

describe("csvDasVendas", () => {
  it("a venda reembolsada vai no arquivo, marcada — não desaparece", () => {
    const csv = csvDasVendas([
      venda(),
      venda({ customerName: "João", refundStatus: "refunded", refundReason: "desistiu" }),
    ]);
    const linhas = csv.split("\n");
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("Situação");
    expect(linhas[1]).toContain('"Paga"');
    expect(linhas[2]).toContain('"Reembolsada"');
    expect(linhas[2]).toContain('"desistiu"');
  });

  it("valor com vírgula decimal (o Excel pt-BR lê como número) e data em dd/mm/aaaa", () => {
    const linha = csvDasVendas([venda({ value: 1997.5 })]).split("\n")[1];
    expect(linha).toContain('"1997,50"');
    expect(linha).toContain('"15/10/2026"');
  });

  it("ponto-e-vírgula e aspas no nome não quebram a coluna", () => {
    const linha = csvDasVendas([venda({ customerName: 'Ana; a "boa"' })]).split("\n")[1];
    expect(linha).toContain('"Ana; a ""boa"""');
    // 11 colunas: o separador dentro do campo fica protegido pelas aspas.
    expect(linha.split('";"')).toHaveLength(11);
  });
});
