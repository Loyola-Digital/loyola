/**
 * Colunas derivadas entre consultas.
 *
 * O caso que motiva tudo: "lucro" = receita de TUDO menos gasto de UMA campanha.
 * Duas consultas com filtros diferentes, uma coluna só na tela.
 */

import { describe, expect, it } from "vitest";
import {
  aplicarDerivadas,
  chaveDeMergeSugerida,
  validarDerivadas,
  type Derivada,
} from "../services/bi/derivadas.js";
import type { ResultadoDaQuery } from "../services/bi/query.js";

function res(
  columns: [string, string][],
  rows: Record<string, string | number | null>[],
): ResultadoDaQuery {
  return {
    columns: columns.map(([key, semanticType]) => ({ key, label: key, semanticType })),
    rows,
    avisos: [],
  };
}

const derivada = (over: Partial<Derivada> = {}): Derivada => ({
  name: "lucro",
  label: "Lucro",
  expression: "q0.vendas.revenue - q1.trafego.spend",
  mode: "scalar",
  semanticType: "currency",
  ...over,
});

describe("escalar", () => {
  it("combina duas consultas com escopos diferentes", () => {
    const r = aplicarDerivadas(
      [
        res([["vendas.revenue", "currency"]], [{ "vendas.revenue": 5000 }]),
        res([["trafego.spend", "currency"]], [{ "trafego.spend": 1200 }]),
      ],
      [derivada({ expression: "q0.vendas.revenue - q1.trafego.spend" })],
    );
    expect(r.rows[0]!.lucro).toBe(3800);
    expect(r.columns.at(-1)).toEqual({ key: "lucro", label: "Lucro", semanticType: "currency" });
  });

  it("sem derivadas o resultado passa intacto", () => {
    const base = res([["a", "number"]], [{ a: 1 }]);
    expect(aplicarDerivadas([base], [])).toBe(base);
  });

  it("avisa quando a consulta escalar tem várias linhas", () => {
    const r = aplicarDerivadas(
      [res([["d", "text"], ["v", "number"]], [{ d: "a", v: 1 }, { d: "b", v: 2 }])],
      [derivada({ expression: "q0.v * 2", name: "dobro", label: "Dobro" })],
    );
    expect(r.avisos.join(" ")).toMatch(/só a primeira/i);
  });
});

describe("T5 · referência que não existe", () => {
  it("q inexistente vira null com aviso, sem derrubar o widget", () => {
    const r = aplicarDerivadas(
      [res([["a", "number"]], [{ a: 10 }])],
      [derivada({ expression: "q0.a - q3.b" })],
    );
    expect(r.rows[0]!.lucro).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/q3\.b/);
  });

  it("expressão inválida vira coluna vazia com aviso", () => {
    const r = aplicarDerivadas(
      [res([["a", "number"]], [{ a: 10 }])],
      [derivada({ expression: "process.exit(1)" })],
    );
    expect(r.rows[0]!.lucro).toBeNull();
    expect(r.columns.some((c) => c.key === "lucro")).toBe(true);
  });
});

describe("T6 · modo por linha", () => {
  const porDia = () => [
    res(
      [["trafego.date", "date"], ["trafego.spend", "currency"]],
      [
        { "trafego.date": "2026-08-01", "trafego.spend": 100 },
        { "trafego.date": "2026-08-02", "trafego.spend": 200 },
      ],
    ),
    res(
      [["vendas.date", "date"], ["vendas.revenue", "currency"]],
      [{ "vendas.date": "2026-08-01", "vendas.revenue": 900 }],
    ),
  ];

  it("casa as linhas pela chave, mesmo com nomes de coluna diferentes", () => {
    // `trafego.date` e `vendas.date` são a mesma coisa com nomes diferentes — e é
    // exatamente entre entidades diferentes que a coluna derivada existe.
    const r = aplicarDerivadas(
      porDia(),
      [derivada({ expression: "q1.vendas.revenue - q0.trafego.spend", mode: "row" })],
      "trafego.date",
    );
    expect(r.rows[0]!.lucro).toBe(800);
  });

  it("linha sem par vira null naquela coluna, não zero", () => {
    const r = aplicarDerivadas(
      porDia(),
      [derivada({ expression: "q1.vendas.revenue - q0.trafego.spend", mode: "row" })],
      "trafego.date",
    );
    expect(r.rows[1]!.lucro).toBeNull();
  });

  it("modo linha sem chave de merge avisa em vez de inventar par", () => {
    const r = aplicarDerivadas(
      porDia(),
      [derivada({ expression: "q1.vendas.revenue - q0.trafego.spend", mode: "row" })],
    );
    expect(r.rows[0]!.lucro).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/casar as consultas/i);
  });
});

describe("T4 · divisão por zero na derivada", () => {
  it("devolve null, não Infinity", () => {
    const r = aplicarDerivadas(
      [res([["a", "number"], ["z", "number"]], [{ a: 10, z: 0 }])],
      [derivada({ expression: "q0.a / q0.z", name: "razao", label: "Razão" })],
    );
    expect(r.rows[0]!.razao).toBeNull();
  });
});

describe("validação na escrita", () => {
  it("recusa expressão que aponta para consulta inexistente", () => {
    const p = validarDerivadas([derivada({ expression: "q0.a + q2.b" })], 2);
    expect(p.join(" ")).toMatch(/q2/);
  });

  it("recusa nome de coluna repetido", () => {
    const p = validarDerivadas([derivada(), derivada()], 2);
    expect(p.join(" ")).toMatch(/duas vezes/i);
  });

  it("recusa modo linha sem chave de merge", () => {
    const p = validarDerivadas([derivada({ mode: "row" })], 2);
    expect(p.join(" ")).toMatch(/dimensão em comum/i);
  });

  it("derivada correta não gera problema nenhum", () => {
    expect(validarDerivadas([derivada()], 2)).toEqual([]);
  });
});

describe("AC5 · chave de merge escolhida sozinha", () => {
  it("prefere a data, que toda entidade tem", () => {
    expect(
      chaveDeMergeSugerida([
        ["trafego.date", "trafego.campaign"],
        ["vendas.date", "vendas.produto"],
      ]),
    ).toBe("trafego.date");
  });

  it("cai para a primeira dimensão em comum quando não há data", () => {
    expect(chaveDeMergeSugerida([["trafego.campaign"], ["grupos.campaign"]])).toBe(
      "trafego.campaign",
    );
  });

  it("sem nada em comum não sugere chave", () => {
    expect(chaveDeMergeSugerida([["trafego.ad"], ["vendas.produto"]])).toBeUndefined();
  });

  it("consulta única não precisa de chave", () => {
    expect(chaveDeMergeSugerida([[]])).toBeUndefined();
  });
});
