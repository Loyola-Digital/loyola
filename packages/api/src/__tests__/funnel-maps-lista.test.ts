/**
 * A ordem de "Todos os mapas".
 *
 * O que protege: o mais recentemente mexido no topo, e mapa que ninguém
 * desenhou no fim. A ordem anterior era alfabética por projeto/funil, o que
 * deixava o desenho recém-editado onde ele sempre esteve.
 */

import { describe, expect, it } from "vitest";
import { ordenarMapasPorAtividade } from "../services/funnel-maps-lista.js";

const m = (stageName: string, updatedAt: string | null, projectName = "P") => ({
  stageName,
  updatedAt,
  projectName,
});

describe("ordenarMapasPorAtividade", () => {
  it("mais recente primeiro", () => {
    const r = ordenarMapasPorAtividade([
      m("velho", "2026-05-01T10:00:00.000Z"),
      m("novo", "2026-09-05T10:00:00.000Z"),
      m("meio", "2026-08-01T10:00:00.000Z"),
    ]);
    expect(r.map((x) => x.stageName)).toEqual(["novo", "meio", "velho"]);
  });

  it("mapa nunca desenhado vai para o fim, por mais antigo que seja o resto", () => {
    const r = ordenarMapasPorAtividade([
      m("sem desenho", null),
      m("antigo", "2020-01-01T00:00:00.000Z"),
    ]);
    expect(r.map((x) => x.stageName)).toEqual(["antigo", "sem desenho"]);
  });

  it("entre os sem desenho, ordem alfabética — a lista não pode se remexer", () => {
    const ordem = () =>
      ordenarMapasPorAtividade([m("zebra", null), m("alfa", null), m("meio", null)]).map(
        (x) => x.stageName,
      );
    expect(ordem()).toEqual(["alfa", "meio", "zebra"]);
    expect(ordem()).toEqual(ordem());
  });

  it("empate na data desempata pelo nome, não pela sorte", () => {
    const d = "2026-09-05T10:00:00.000Z";
    expect(ordenarMapasPorAtividade([m("b", d), m("a", d)]).map((x) => x.stageName)).toEqual([
      "a",
      "b",
    ]);
  });

  it("não modifica a lista recebida", () => {
    const entrada = [m("a", "2020-01-01T00:00:00.000Z"), m("b", "2026-01-01T00:00:00.000Z")];
    ordenarMapasPorAtividade(entrada);
    expect(entrada.map((x) => x.stageName)).toEqual(["a", "b"]);
  });
});
