import { describe, it, expect } from "vitest";
import { parseValorPlanilha, parseNumeroPtBr } from "@loyola-x/shared";

/** O corpo exato que estava nas três rotas antes do fix. */
function antesDoFix(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

describe("parseValorPlanilha — o defeito do separador de milhar", () => {
  it("as 6 vendas reais do bbe-pr2-ago-26 somam R$ 9.573,00, não R$ 805,78", () => {
    // Células cruas da coluna "Preço Original", aba n8n-Kiwify.
    const celulas = ["1.097,00", "1.097,00", "1.097,00", "3.291,00", "2.194,00", "797,00"];

    const somaCorreta = celulas.reduce((s, c) => s + parseValorPlanilha(c), 0);
    expect(somaCorreta).toBeCloseTo(9573, 2);

    // E o corpo antigo chegava em outro planeta.
    const somaAntiga = celulas.reduce((s, c) => s + antesDoFix(c), 0);
    expect(somaAntiga).toBeCloseTo(805.776, 3);
    expect(somaAntiga).not.toBeCloseTo(9573, 0);
  });

  it("valor acima de mil deixa de virar um milésimo de si mesmo", () => {
    expect(parseValorPlanilha("1.097,00")).toBe(1097);
    expect(parseValorPlanilha("3.291,00")).toBe(3291);
    expect(parseValorPlanilha("12.345,67")).toBeCloseTo(12345.67, 2);
    expect(parseValorPlanilha("1.234.567,89")).toBeCloseTo(1234567.89, 2);
  });

  it("abaixo de mil sempre funcionou e continua funcionando", () => {
    // Era esta faixa que escondia o defeito.
    for (const v of ["797,00", "1,50", "0,99", "999,99"]) {
      expect(parseValorPlanilha(v)).toBe(antesDoFix(v));
    }
  });

  it("aceita o formato en-US sem trocar milhar por decimal", () => {
    expect(parseValorPlanilha("1,234.56")).toBeCloseTo(1234.56, 2);
    expect(parseValorPlanilha("1097.00")).toBe(1097);
  });

  it("símbolo de moeda e espaço não atrapalham", () => {
    expect(parseValorPlanilha("R$ 1.097,00")).toBe(1097);
    expect(parseValorPlanilha("  1.097,00  ")).toBe(1097);
  });

  it("célula vazia ou sem número é zero, não NaN", () => {
    expect(parseValorPlanilha("")).toBe(0);
    expect(parseValorPlanilha("   ")).toBe(0);
    expect(parseValorPlanilha(null)).toBe(0);
    expect(parseValorPlanilha(undefined)).toBe(0);
    expect(parseValorPlanilha("grátis")).toBe(0);
    expect(parseValorPlanilha("R$")).toBe(0);
  });

  it("nunca devolve NaN", () => {
    for (const v of ["", ",", ".", ",,", "..", "R$ ,", "1,2,3", "a.b,c"]) {
      expect(Number.isNaN(parseValorPlanilha(v))).toBe(false);
    }
  });
});

describe("parseNumeroPtBr — ponto e vírgula como milhar ou decimal", () => {
  it("com os dois separadores, o último é o decimal", () => {
    expect(parseNumeroPtBr("1.234,56")).toBeCloseTo(1234.56, 2); // BR
    expect(parseNumeroPtBr("1,234.56")).toBeCloseTo(1234.56, 2); // US
  });

  it("só vírgula: uma é decimal, várias são milhar", () => {
    expect(parseNumeroPtBr("30,5")).toBe(30.5);
    expect(parseNumeroPtBr("1,000,000")).toBe(1000000);
  });

  it("só ponto: três dígitos no fim é milhar, dois é decimal", () => {
    expect(parseNumeroPtBr("30.000")).toBe(30000);
    expect(parseNumeroPtBr("1.234.567")).toBe(1234567);
    expect(parseNumeroPtBr("30.50")).toBe(30.5);
  });

  it("o que não é número devolve null, não NaN", () => {
    expect(parseNumeroPtBr("")).toBeNull();
    expect(parseNumeroPtBr("abc")).toBeNull();
  });
});
