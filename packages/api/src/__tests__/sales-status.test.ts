import { describe, it, expect } from "vitest";
import { classifyRefundStatus, isRefundBucket, isRevenueBucket } from "../services/sales-status.js";

describe("classifyRefundStatus", () => {
  it("sem coluna de status → tudo é 'paid' (legado, nenhum reembolso)", () => {
    expect(classifyRefundStatus("refunded", false)).toBe("paid");
    expect(classifyRefundStatus("chargeback", false)).toBe("paid");
    expect(classifyRefundStatus(undefined, false)).toBe("paid");
  });

  it("célula de status vazia numa planilha com a coluna → 'paid'", () => {
    expect(classifyRefundStatus("", true)).toBe("paid");
    expect(classifyRefundStatus(null, true)).toBe("paid");
    expect(classifyRefundStatus("   ", true)).toBe("paid");
  });

  it("classifica status pagos (EN + PT, com/sem acento)", () => {
    for (const s of ["paid", "approved", "Aprovado", "aprovada", "PAGO", "Concluído", "completed"]) {
      expect(classifyRefundStatus(s, true)).toBe("paid");
    }
  });

  it("classifica reembolsos (EN + PT)", () => {
    for (const s of ["refunded", "refund", "Reembolsado", "reembolso", "Estornado", "devolvido"]) {
      expect(classifyRefundStatus(s, true)).toBe("refunded");
    }
  });

  it("classifica chargebacks", () => {
    for (const s of ["chargeback", "chargedback", "charged_back", "Disputa"]) {
      expect(classifyRefundStatus(s, true)).toBe("chargeback");
    }
  });

  it("status parciais/variações caem no fallback por substring", () => {
    expect(classifyRefundStatus("Reembolso parcial", true)).toBe("refunded");
    expect(classifyRefundStatus("estorno total", true)).toBe("refunded");
    expect(classifyRefundStatus("chargeback em análise", true)).toBe("chargeback");
  });

  it("pendente/recusado → 'other' (não é venda paga nem reembolso)", () => {
    expect(classifyRefundStatus("waiting_payment", true)).toBe("other");
    expect(classifyRefundStatus("refused", true)).toBe("other");
    expect(classifyRefundStatus("xyz-desconhecido", true)).toBe("other");
  });

  it("isRefundBucket só é true para refunded/chargeback", () => {
    expect(isRefundBucket("refunded")).toBe(true);
    expect(isRefundBucket("chargeback")).toBe(true);
    expect(isRefundBucket("paid")).toBe(false);
    expect(isRefundBucket("other")).toBe(false);
  });

  // Story 29.26
  it("isRevenueBucket só é true para paid", () => {
    expect(isRevenueBucket("paid")).toBe(true);
    expect(isRevenueBucket("refunded")).toBe(false);
    expect(isRevenueBucket("chargeback")).toBe(false);
    expect(isRevenueBucket("other")).toBe(false);
  });

  it("isRevenueBucket e isRefundBucket respondem perguntas diferentes", () => {
    // "other" (recusada/pendente) não é reembolso — mas também não é receita.
    // Era exatamente essa lacuna que deixava venda recusada entrar no faturamento.
    const other = classifyRefundStatus("refused", true);
    expect(isRefundBucket(other)).toBe(false);
    expect(isRevenueBucket(other)).toBe(false);
  });

  it("planilha sem coluna de status: tudo é receita (legado preservado)", () => {
    for (const s of ["refused", "waiting_payment", "refunded", ""]) {
      expect(isRevenueBucket(classifyRefundStatus(s, false))).toBe(true);
    }
  });
});

// ============================================================
// Story 29.26 — agregação: só venda paga vira receita
// Replica a decisão de filtro dos loaders do perpétuo sobre os dados reais
// conferidos pelo usuário no funil c7b90503 (09/07 → 01/08/2026).
// ============================================================

describe("agregação de vendas por status (Story 29.26)", () => {
  type Row = { status: string; valor: number };

  /** Espelha o laço de `perpetual-sales-data.ts`: reembolso primeiro, depois receita. */
  function agregar(rows: Row[], hasStatusCol: boolean) {
    let vendas = 0;
    let faturamento = 0;
    let reembolsos = 0;
    for (const r of rows) {
      const bucket = classifyRefundStatus(r.status, hasStatusCol);
      if (isRefundBucket(bucket)) {
        reembolsos += 1;
        continue;
      }
      if (!isRevenueBucket(bucket)) continue;
      vendas += 1;
      faturamento += r.valor;
    }
    return { vendas, faturamento, reembolsos };
  }

  const planilha: Row[] = [
    ...Array.from({ length: 323 }, () => ({ status: "paid", valor: 64.59 })),
    ...Array.from({ length: 3 }, () => ({ status: "refunded", valor: 60.33 })),
    ...Array.from({ length: 45 }, () => ({ status: "refused", valor: 82.0 })),
    ...Array.from({ length: 26 }, () => ({ status: "waiting_payment", valor: 64.69 })),
  ];

  it("conta só as 323 pagas — recusadas e aguardando ficam fora", () => {
    const r = agregar(planilha, true);
    expect(r.vendas).toBe(323);
    expect(r.reembolsos).toBe(3);
  });

  it("os R$ 5.371,80 de recusadas/pendentes não entram no faturamento", () => {
    const r = agregar(planilha, true);
    const fantasma = 45 * 82.0 + 26 * 64.69;
    expect(fantasma).toBeCloseTo(5371.94, 2); // ordem de grandeza do caso real
    expect(r.faturamento).toBeCloseTo(323 * 64.59, 2);
    expect(r.faturamento).toBeLessThan(r.faturamento + fantasma);
  });

  it("comportamento ANTIGO (só isRefundBucket) contaria 394 — é o bug corrigido", () => {
    const antigo = planilha.filter(
      (r) => !isRefundBucket(classifyRefundStatus(r.status, true)),
    ).length;
    expect(antigo).toBe(394);
    expect(agregar(planilha, true).vendas).toBe(323);
  });

  it("sem coluna de status, todas as linhas contam (nenhuma regressão)", () => {
    const r = agregar(planilha, false);
    expect(r.vendas).toBe(planilha.length);
    expect(r.reembolsos).toBe(0);
  });
});
