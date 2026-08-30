/**
 * O parser de expressões derivadas.
 *
 * Metade destes testes é sobre o que a gramática **recusa**. É a parte que
 * importa: a expressão vem de um campo de texto de um widget, e a alternativa
 * (`eval`) daria acesso ao processo inteiro a partir dali.
 */

import { describe, expect, it } from "vitest";
import {
  ErroDeExpressao,
  MAX_CARACTERES,
  analisar,
  avaliar,
  calcular,
  referencias,
} from "../services/bi/expressao.js";

/** Um `buscar` de mentira: q0.a = 100, q1.b = 40, q0.zero = 0. */
const VALORES: Record<string, number | null> = {
  "0.a": 100,
  "0.revenue": 5000,
  "0.zero": 0,
  "0.vazio": null,
  "1.b": 40,
  "1.spend": 1200,
};
const buscar = (q: number, col: string) => VALORES[`${q}.${col}`];

describe("T1 · a conta que motiva a feature", () => {
  it('"q0.revenue - q1.spend" avalia certo', () => {
    expect(calcular("q0.revenue - q1.spend", buscar).valor).toBe(3800);
  });

  it("aceita espaços em qualquer lugar, ou nenhum", () => {
    expect(calcular("q0.revenue-q1.spend", buscar).valor).toBe(3800);
    expect(calcular("  q0.revenue   -   q1.spend  ", buscar).valor).toBe(3800);
  });
});

describe("T2 · precedência e parênteses", () => {
  it("multiplicação vem antes da soma", () => {
    expect(calcular("q0.a + q1.b * 2", buscar).valor).toBe(180);
  });

  it("parêntese muda a ordem", () => {
    expect(calcular("(q0.a + q1.b) * 2", buscar).valor).toBe(280);
  });

  it("divisão e subtração associam à esquerda", () => {
    expect(calcular("100 - 40 - 10", buscar).valor).toBe(50);
    expect(calcular("100 / 10 / 2", buscar).valor).toBe(5);
  });

  it("menos unário funciona, inclusive encadeado", () => {
    expect(calcular("-q1.b", buscar).valor).toBe(-40);
    expect(calcular("q0.a + -q1.b", buscar).valor).toBe(60);
  });

  it("decimal é aceito", () => {
    expect(calcular("q0.a * 1.5", buscar).valor).toBe(150);
  });
});

describe("T3 · nada executa", () => {
  const ataques = [
    "process.exit(1)",
    "constructor.constructor('return process')()",
    "require('fs').readFileSync('/etc/passwd')",
    "globalThis",
    "q0.a; process.exit(1)",
    "`${process.env.DATABASE_URL}`",
    "q0.a || process.exit(1)",
    "this.constructor",
    "[].constructor",
    "q0.a && (() => {})()",
  ];

  it.each(ataques)("%s é erro de análise", (texto) => {
    expect(() => analisar(texto)).toThrow(ErroDeExpressao);
  });

  it("o atalho `calcular` devolve null e aviso em vez de lançar", () => {
    const r = calcular("process.exit(1)", buscar);
    expect(r.valor).toBeNull();
    expect(r.avisos).toHaveLength(1);
  });

  it("expressão gigante é recusada antes de virar árvore", () => {
    expect(() => analisar("1+".repeat(MAX_CARACTERES) + "1")).toThrow(/caracteres/i);
  });

  it("sobra depois do fim é erro, não meia conta aceita em silêncio", () => {
    // `q0.a q1.b` devolveria 100 se a sobra fosse ignorada — o valor da primeira
    // metade, com cara de total.
    expect(() => analisar("q0.a q1.b")).toThrow(/sobrou/i);
  });

  it("parêntese sem fechar é erro", () => {
    expect(() => analisar("(q0.a + q1.b")).toThrow(/parêntese/i);
  });

  it("expressão vazia é erro", () => {
    expect(() => analisar("   ")).toThrow(/vazia/i);
  });
});

describe("T4 · divisão por zero", () => {
  it("devolve null, nunca Infinity", () => {
    const r = calcular("q0.a / q0.zero", buscar);
    expect(r.valor).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/zero/i);
  });

  it("o null se propaga pela conta inteira", () => {
    // Se a divisão virasse Infinity, este total seria Infinity — e entraria na
    // soma e na ordenação de todo o resto.
    expect(calcular("(q0.a / q0.zero) + 10", buscar).valor).toBeNull();
  });
});

describe("T5 · referência inexistente", () => {
  it("query que não existe vira null com aviso, sem exceção", () => {
    const r = calcular("q7.qualquer + 1", buscar);
    expect(r.valor).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/q7\.qualquer/);
  });

  it("coluna que não existe na query também", () => {
    const r = calcular("q0.inventada", buscar);
    expect(r.valor).toBeNull();
    expect(r.avisos).toHaveLength(1);
  });

  it("coluna existente porém sem amostra é null, e não aviso de erro", () => {
    // `null` no dado é diferente de referência quebrada: um é ausência de
    // medição, o outro é a expressão apontando para o nada.
    const r = calcular("q0.vazio + 1", buscar);
    expect(r.valor).toBeNull();
    expect(r.avisos).toEqual([]);
  });
});

describe("leitura da árvore", () => {
  it("lista as referências que a expressão usa", () => {
    expect(referencias(analisar("q0.revenue - q1.spend * 2"))).toEqual([
      { query: 0, coluna: "revenue" },
      { query: 1, coluna: "spend" },
    ]);
  });

  it("a árvore reflete a precedência", () => {
    const no = analisar("1 + 2 * 3");
    expect(no.tipo).toBe("bin");
    if (no.tipo === "bin") {
      expect(no.op).toBe("+");
      expect(no.dir.tipo).toBe("bin");
    }
  });

  it("avaliar aceita árvore já analisada", () => {
    expect(avaliar(analisar("q0.a"), buscar).valor).toBe(100);
  });
});
