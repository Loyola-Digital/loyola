import { describe, it, expect } from "vitest";
import { arrDoMrr, fmtUsd, fmtPct, fmtMovimento, avisoDaSerie } from "../overview-revenuecat";

describe("arrDoMrr (AC3)", () => {
  it("os números reais: MRR US$ 596 → ARR US$ 7.152", () => {
    expect(arrDoMrr(596)).toBe(7152);
  });

  it("null não vira zero", () => {
    // Um card de receita anual mostrando 0 afirma que a empresa não fatura.
    expect(arrDoMrr(null)).toBeNull();
    expect(arrDoMrr(undefined)).toBeNull();
  });
});

describe("formatação", () => {
  it("mrr e revenue saem em DÓLAR", () => {
    // Vêm em USD da API. Exibir como real erraria por ~5x.
    expect(fmtUsd(2318)).toContain("US$");
    expect(fmtUsd(2318)).toContain("2.318,00");
  });

  it("ausência vira travessão, não zero (AC4)", () => {
    expect(fmtUsd(null)).toBe("—");
    expect(fmtPct(null)).toBe("—");
    expect(fmtMovimento(null)).toBe("—");
  });

  it("zero real continua sendo zero", () => {
    expect(fmtUsd(0)).toContain("0,00");
    expect(fmtMovimento(0)).toBe("0");
  });

  it("o movimento mostra a direção", () => {
    expect(fmtMovimento(45)).toBe("+45");
    expect(fmtMovimento(-12)).toBe("-12");
  });

  it("a taxa de conversão de trial, com os números medidos", () => {
    expect(fmtPct(0.1421)).toBe("14,21%");
  });
});

describe("avisoDaSerie (AC5)", () => {
  it("declara a data de início em formato brasileiro", () => {
    const a = avisoDaSerie("2026-08-10")!;
    expect(a).toContain("10/08/2026");
  });

  it("sem série, não há aviso", () => {
    expect(avisoDaSerie(null)).toBeNull();
  });
});
