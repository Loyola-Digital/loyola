import { describe, expect, it } from "vitest";
import { TRACO, formatar, formatarCurto, formatarData } from "./formato";

describe("null nunca vira zero", () => {
  it("null e undefined viram traço em qualquer tipo", () => {
    for (const t of ["currency", "number", "percent", "date", "text"] as const) {
      expect(formatar(null, t)).toBe(TRACO);
      expect(formatar(undefined, t)).toBe(TRACO);
    }
  });

  it("zero de verdade continua sendo zero", () => {
    // A distinção inteira do épico: "gastei R$ 0" é diferente de "não sei".
    expect(formatar(0, "currency")).toContain("0,00");
    expect(formatar(0, "number")).toBe("0");
  });

  it("valor não numérico vira traço, não NaN na tela", () => {
    expect(formatar("abc", "number")).toBe(TRACO);
  });
});

describe("formatos", () => {
  it("moeda sai em real", () => {
    expect(formatar(1234.5, "currency")).toMatch(/R\$/);
    expect(formatar(1234.5, "currency")).toContain("1.234,50");
  });

  it("percentual multiplica a razão por cem", () => {
    // A taxa chega como 0,0123 — se o KPI mostrasse 0,01% e o gráfico 1,23%, a
    // mesma métrica teria dois valores na mesma tela.
    expect(formatar(0.0123, "percent")).toBe("1,23%");
  });

  it("número inteiro não ganha casas decimais à toa", () => {
    expect(formatar(15000, "number")).toBe("15.000");
  });

  it("data vira dia/mês sem passar por fuso", () => {
    expect(formatarData("2026-08-26")).toBe("26/08");
    expect(formatar("2026-01-05", "date")).toBe("05/01");
  });

  it("data fora do formato passa intacta, em vez de virar Invalid Date", () => {
    expect(formatarData("semana 32")).toBe("semana 32");
  });
});

describe("eixo do gráfico", () => {
  it("abrevia milhar e milhão", () => {
    expect(formatarCurto(15000, "number")).toBe("15k");
    expect(formatarCurto(2_500_000, "currency")).toBe("R$ 2,5M");
  });

  it("null no eixo também é traço", () => {
    expect(formatarCurto(null, "currency")).toBe(TRACO);
  });
});
