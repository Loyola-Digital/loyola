/**
 * O que protege: o agrupamento não pode reordenar nada.
 *
 * Era o bug — a sidebar quebrava por tipo com ordem fixa (perpétuo primeiro) e
 * jogava para o topo um funil arquivado de maio, na frente de um mexido no dia
 * anterior. Os casos abaixo são os dados reais de "DG & CPDF" e "FZ & MFB".
 */

import { describe, expect, it } from "vitest";
import { agruparPorTipo } from "./agrupar-funis";

const f = (id: string, type: string) => ({ id, type });

describe("agruparPorTipo", () => {
  it("o grupo do funil mais recente vem primeiro, seja qual for o tipo", () => {
    // DG & CPDF: dg-pg04 (set/26) é launch; dg-a1 (mai/26, arquivado) é perpétuo.
    const g = agruparPorTipo([
      f("dg-pg04", "launch"),
      f("dg-pg02", "launch"),
      f("dg-a1", "perpetual"),
    ]);
    expect(g.map((x) => x.tipo)).toEqual(["launch", "perpetual"]);
    expect(g[0].funnels[0].id).toBe("dg-pg04");
  });

  it("perpétuo na frente quando é ele que tem o trabalho recente", () => {
    // BBE: bbe-fc1 (perpétuo, hoje) antes de bbe-pr2 (launch, três dias atrás).
    const g = agruparPorTipo([
      f("bbe-fc1", "perpetual"),
      f("bbe-fh", "perpetual"),
      f("bbe-pr2", "launch"),
    ]);
    expect(g.map((x) => x.tipo)).toEqual(["perpetual", "launch"]);
  });

  it("preserva a ordem do servidor dentro de cada grupo", () => {
    const g = agruparPorTipo([f("a", "launch"), f("b", "perpetual"), f("c", "launch")]);
    expect(g[0].funnels.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("tipo desconhecido aparece — a função agrupa, não filtra", () => {
    const g = agruparPorTipo([f("m", "mobile"), f("x", "tipo-que-ninguem-viu")]);
    expect(g.map((x) => x.tipo)).toEqual(["mobile", "tipo-que-ninguem-viu"]);
  });

  it("lista vazia não vira grupo vazio", () => {
    expect(agruparPorTipo([])).toEqual([]);
  });
});
