/**
 * Story 29.39 (QA-01) — regressão da conversão fração ⇄ pontos percentuais.
 *
 * O teste central é a VARREDURA: o defeito não aparecia nos valores redondos
 * que se testa por instinto (2,5%, 5%, 15% passavam com a implementação
 * ingênua). Só uma varredura ampla revela que 27% das taxas quebravam.
 */

import { describe, it, expect } from "vitest";
import { fracaoParaPP, ppParaFracao } from "../percent.js";

describe("fracaoParaPP — os casos que quebravam", () => {
  it.each([
    [0.07, "7"],
    [0.0399, "3.99"],
    [0.035, "3.5"],
    [0.0199, "1.99"],
    [0.029, "2.9"],
  ])("%s → %s (era lixo binário antes)", (fracao, esperado) => {
    expect(fracaoParaPP(fracao)).toBe(esperado);
  });

  it("não introduz zeros à direita", () => {
    expect(fracaoParaPP(0.025)).toBe("2.5");
    expect(fracaoParaPP(0.15)).toBe("15");
    expect(fracaoParaPP(0.3)).toBe("30");
  });

  it("preserva as 3 casas que `numeric(6,5)` permite em pontos percentuais", () => {
    expect(fracaoParaPP(0.12345)).toBe("12.345");
  });

  it("zero e valores não-finitos não estouram", () => {
    expect(fracaoParaPP(0)).toBe("0");
    expect(fracaoParaPP(NaN)).toBe("");
    expect(fracaoParaPP(Infinity)).toBe("");
  });
});

describe("ppParaFracao", () => {
  it.each([
    [2.9, 0.029],
    [3.99, 0.0399],
    [7, 0.07],
    [15, 0.15],
  ])("%s%% → %s", (pp, esperado) => {
    expect(ppParaFracao(pp)).toBe(esperado);
  });

  it("não-finito devolve NaN em vez de número plausível (GR-01)", () => {
    expect(ppParaFracao(NaN)).toBeNaN();
  });
});

describe("ida e volta — varredura ampla", () => {
  /**
   * Este é o teste que teria pego o defeito original. Os valores redondos que
   * se escolhe por instinto (2,5 · 5 · 15) passavam mesmo com a implementação
   * ingênua; o problema só aparece em massa.
   */
  it("toda taxa de 0,01% a 20,00% sobrevive ao ciclo pp → fração → pp", () => {
    const quebradas: string[] = [];
    for (let i = 1; i <= 2000; i++) {
      const pp = i / 100;
      const gravado = Number(ppParaFracao(pp).toFixed(5)); // como o numeric(6,5)
      const exibido = fracaoParaPP(gravado);
      if (exibido !== String(pp)) quebradas.push(`${pp} → ${exibido}`);
    }
    // A implementação ingênua devolvia 537 aqui.
    expect(quebradas).toEqual([]);
  });

  it("margens típicas (1% a 90%) também sobrevivem", () => {
    const quebradas: string[] = [];
    for (let pp = 1; pp <= 90; pp++) {
      const gravado = Number(ppParaFracao(pp).toFixed(4)); // numeric(6,4) da margem
      if (fracaoParaPP(gravado) !== String(pp)) quebradas.push(String(pp));
    }
    expect(quebradas).toEqual([]);
  });
});
