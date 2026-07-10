import { describe, it, expect } from "vitest";
import { classifyRefundStatus, isRefundBucket } from "../services/sales-status.js";

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
});
