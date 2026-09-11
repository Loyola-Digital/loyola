import { describe, expect, it } from "vitest";
import { formasDoCaminho } from "../services/plausible.js";

describe("formasDoCaminho", () => {
  it("manda as duas grafias, com e sem barra final", () => {
    // Medido no site do time: `/bbepr2-captura-a/` devolve 15 conversões e
    // `/bbepr2-captura-a` devolve 0 — a mesma página, zero sem erro nenhum.
    expect(formasDoCaminho("/captura")).toEqual(["/captura", "/captura/"]);
    expect(formasDoCaminho("/captura/")).toEqual(["/captura", "/captura/"]);
  });

  it("tira a query string", () => {
    // `event:page` nunca inclui query; colar a URL com UTM daria outro zero.
    expect(formasDoCaminho("/oferta?utm_source=meta")).toEqual([
      "/oferta",
      "/oferta/",
    ]);
  });

  it("tira o fragmento", () => {
    expect(formasDoCaminho("/oferta#preco")).toEqual(["/oferta", "/oferta/"]);
  });

  it("a raiz continua sendo a raiz", () => {
    // Tirar a barra de "/" deixaria string vazia, que casa com nada.
    expect(formasDoCaminho("/")).toEqual(["/"]);
  });

  it("apara espaço que veio do copiar e colar", () => {
    expect(formasDoCaminho("  /oferta  ")).toEqual(["/oferta", "/oferta/"]);
  });

  it("colapsa barras repetidas no fim", () => {
    expect(formasDoCaminho("/oferta//")).toEqual(["/oferta", "/oferta//"]);
  });

  it("devolve algo mesmo com entrada vazia", () => {
    // Nunca lista vazia: o filtro iria ao Plausible sem valor nenhum.
    expect(formasDoCaminho("")).toHaveLength(1);
    expect(formasDoCaminho("?x=1")).toHaveLength(1);
  });
});
