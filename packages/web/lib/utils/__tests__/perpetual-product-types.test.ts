// Story 29.49 (AC5, web) — chave canônica, resumo e agrupamento por tipo.
import { describe, it, expect } from "vitest";
import {
  productKey,
  contarPorTipo,
  agruparPorTipo,
  TIPO_PADRAO,
} from "@/lib/utils/perpetual-product-types";

describe("productKey", () => {
  // A mesma regra do backend. Se as duas divergirem, o gestor classifica e a
  // classificacao nao "pega" — sem erro em lugar nenhum.
  it("normaliza espaco e caixa", () => {
    expect(productKey("  Combo De Facas ")).toBe("combo de facas");
    expect(productKey("IMERSÃO")).toBe(productKey("imersão"));
  });
});

describe("contarPorTipo", () => {
  it("conta os tres tipos", () => {
    expect(contarPorTipo(["principal", "order_bump", "order_bump", "upsell"])).toEqual({
      principal: 1,
      order_bump: 2,
      upsell: 1,
    });
  });

  it("undefined conta como principal — e o default, nao um quarto estado", () => {
    expect(contarPorTipo([undefined, undefined, "upsell"])).toEqual({
      principal: 2,
      order_bump: 0,
      upsell: 1,
    });
  });

  it("lista vazia devolve os tres zerados, nao objeto vazio", () => {
    expect(contarPorTipo([])).toEqual({ principal: 0, order_bump: 0, upsell: 0 });
  });
});

describe("agruparPorTipo", () => {
  it("separa preservando a grafia original e a ordem recebida", () => {
    const out = agruparPorTipo([
      { name: "Workshop do Netão", type: "principal" },
      { name: "Combo de Facas", type: "order_bump" },
      { name: "E-book Cortes", type: "order_bump" },
      { name: "Mentoria Pro", type: "upsell" },
    ]);
    expect(out.principal).toEqual(["Workshop do Netão"]);
    expect(out.order_bump).toEqual(["Combo de Facas", "E-book Cortes"]);
    expect(out.upsell).toEqual(["Mentoria Pro"]);
  });

  it("sem produtos, os tres grupos existem vazios (a 29.50 itera sobre eles)", () => {
    expect(agruparPorTipo([])).toEqual({ principal: [], order_bump: [], upsell: [] });
  });

  it("o default e principal", () => {
    expect(TIPO_PADRAO).toBe("principal");
  });
});
