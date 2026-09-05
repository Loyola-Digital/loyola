/**
 * As opções dos filtros do Swipe Files.
 *
 * O que estes testes protegem: a lista chega ordenada por uso (a biblioteca
 * real tem 589 tags usadas uma vez só — em ordem alfabética as inúteis vêm
 * primeiro) e não se remexe entre duas leituras.
 */

import { describe, expect, it } from "vitest";
import { contarFacetas } from "../services/swipe-facetas.js";

describe("contarFacetas", () => {
  it("ordena do mais usado ao menos usado", () => {
    expect(contarFacetas(["a", "b", "a", "c", "a", "b"])).toEqual([
      { valor: "a", n: 3 },
      { valor: "b", n: 2 },
      { valor: "c", n: 1 },
    ]);
  });

  it("empate sai em ordem alfabética — a lista não pode se remexer entre leituras", () => {
    const ordem = () => contarFacetas(["zebra", "alfa", "meio"]).map((o) => o.valor);
    expect(ordem()).toEqual(["alfa", "meio", "zebra"]);
    expect(ordem()).toEqual(ordem());
  });

  it("ignora vazio, nulo e só espaço", () => {
    expect(contarFacetas([null, undefined, "", "   ", "x"])).toEqual([{ valor: "x", n: 1 }]);
  });

  it("apara as pontas antes de contar — 'Meta ' e 'Meta' são o mesmo filtro", () => {
    expect(contarFacetas(["Meta ", " Meta"])).toEqual([{ valor: "Meta", n: 2 }]);
  });

  it("acento entra na ordem alfabética do português", () => {
    expect(contarFacetas(["educação", "edição"]).map((o) => o.valor)).toEqual([
      "edição",
      "educação",
    ]);
  });
});
