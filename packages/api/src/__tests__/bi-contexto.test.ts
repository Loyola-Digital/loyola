/**
 * O contexto do dashboard aplicado ao widget.
 *
 * O que estes testes protegem é a diferença entre "o filtro não se aplica aqui"
 * e "o filtro sumiu": as duas coisas produzem o mesmo número na tela, e só uma
 * delas é correta.
 */

import { describe, expect, it } from "vitest";
import { aplicarContexto, slicersGuardados } from "../services/bi/contexto.js";
import { querySpecSchema, type QuerySpec } from "../services/bi/query.js";

const PERIODO = { start: "2026-08-01", end: "2026-08-26" };

function spec(over: Record<string, unknown> = {}): QuerySpec {
  return querySpecSchema.parse({
    entity: "trafego",
    metrics: ["trafego.spend"],
    filters: {
      "trafego.date": { operator: "$between", value: ["2020-01-01", "2020-01-31"] },
    },
    ...over,
  });
}

describe("o período é do dashboard, não do widget", () => {
  it("sobrescreve o período que o widget carregava", () => {
    const { spec: s } = aplicarContexto(spec(), { periodo: PERIODO, slicers: [] });
    expect(s.filters["trafego.date"]).toEqual({
      operator: "$between",
      value: [PERIODO.start, PERIODO.end],
    });
  });

  it("cada entidade recebe o filtro na SUA dimensão de data", () => {
    const vendas = querySpecSchema.parse({
      entity: "vendas",
      metrics: ["vendas.revenue"],
      filters: {},
    });
    const { spec: s } = aplicarContexto(vendas, { periodo: PERIODO, slicers: [] });
    expect(s.filters["vendas.date"]).toBeDefined();
    expect(s.filters["trafego.date"]).toBeUndefined();
  });

  it("os filtros próprios do widget continuam de pé", () => {
    const { spec: s } = aplicarContexto(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2020-01-01", "2020-01-31"] },
          "trafego.campaign": { operator: "$like", value: "%bbe%" },
        },
      }),
      { periodo: PERIODO, slicers: [] },
    );
    expect(s.filters["trafego.campaign"]).toEqual({ operator: "$like", value: "%bbe%" });
  });
});

describe("slicers", () => {
  it("entram como $in na dimensão escolhida", () => {
    const { spec: s } = aplicarContexto(spec(), {
      periodo: PERIODO,
      slicers: [{ field: "trafego.campaign", values: ["bbe-fc1-a1", "bbe-fc1-a2"] }],
    });
    expect(s.filters["trafego.campaign"]).toEqual({
      operator: "$in",
      value: ["bbe-fc1-a1", "bbe-fc1-a2"],
    });
  });

  it("slicer de outra entidade NÃO é aplicado, e avisa", () => {
    // Silenciar aqui seria o pior caminho: o card mostraria o total sem recorte
    // com cara de recortado.
    const { spec: s, avisos } = aplicarContexto(spec(), {
      periodo: PERIODO,
      slicers: [{ field: "vendas.produto", values: ["Mentoria"] }],
    });
    expect(s.filters["vendas.produto"]).toBeUndefined();
    expect(avisos.join(" ")).toMatch(/não existe aqui/i);
  });

  it("campo inventado é ignorado sem quebrar a execução", () => {
    const { spec: s } = aplicarContexto(spec(), {
      periodo: PERIODO,
      slicers: [{ field: "pg_user.usename", values: ["postgres"] }],
    });
    expect(s.filters["pg_user.usename"]).toBeUndefined();
  });

  it("slicer sobre dimensão que o widget já filtrava vira INTERSEÇÃO", () => {
    // Substituir alargaria o recorte: o widget que só olhava a campanha A
    // passaria a mostrar B também, sem ninguém ter pedido.
    const { spec: s } = aplicarContexto(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2020-01-01", "2020-01-31"] },
          "trafego.campaign": { operator: "$in", value: ["a", "b"] },
        },
      }),
      { periodo: PERIODO, slicers: [{ field: "trafego.campaign", values: ["b", "c"] }] },
    );
    expect(s.filters["trafego.campaign"]).toEqual({ operator: "$in", value: ["b"] });
  });

  it("interseção vazia avisa em vez de devolver um widget mudo", () => {
    const { avisos } = aplicarContexto(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2020-01-01", "2020-01-31"] },
          "trafego.campaign": { operator: "$in", value: ["a"] },
        },
      }),
      { periodo: PERIODO, slicers: [{ field: "trafego.campaign", values: ["z"] }] },
    );
    expect(avisos.join(" ")).toMatch(/não cruza/i);
  });

  it("métrica não serve como slicer", () => {
    const { spec: s } = aplicarContexto(spec(), {
      periodo: PERIODO,
      slicers: [{ field: "trafego.spend", values: ["100"] }],
    });
    expect(s.filters["trafego.spend"]).toBeUndefined();
  });

  it("o spec original não é mutado", () => {
    const original = spec();
    aplicarContexto(original, {
      periodo: PERIODO,
      slicers: [{ field: "trafego.campaign", values: ["x"] }],
    });
    expect(original.filters["trafego.campaign"]).toBeUndefined();
    expect(original.filters["trafego.date"]!.value).toEqual(["2020-01-01", "2020-01-31"]);
  });
});

describe("leitura do que está guardado", () => {
  it("slicer com forma inválida não derruba o dashboard", () => {
    expect(slicersGuardados([{ field: "trafego.campaign" }])).toEqual([]);
    expect(slicersGuardados(null)).toEqual([]);
  });

  it("slicer válido passa intacto", () => {
    const bom = [{ field: "trafego.campaign", values: ["a"] }];
    expect(slicersGuardados(bom)).toEqual(bom);
  });
});
