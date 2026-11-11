import { describe, expect, it } from "vitest";
import { fraseDoPeriodo, type NumerosDoPeriodo } from "../instagram-em-uma-frase";

const base: NumerosDoPeriodo = {
  alcance: 728_300,
  alcanceAnterior: 171_700,
  compartilhamentos: 18_600,
  compartilhamentosAnterior: 2_180,
  entraram: 2_968,
  sairam: 2_168,
  pctNaoSeguidores: 88.6,
};

const texto = (n: NumerosDoPeriodo) => fraseDoPeriodo(n).map((t) => t.texto).join("");

describe("fraseDoPeriodo", () => {
  it("junta alcance, reação e saldo numa frase só", () => {
    const f = texto(base);
    expect(f).toContain("728 mil contas, 4,2 vezes o período anterior");
    expect(f).toContain("88,6% de quem viu ainda não seguia");
    expect(f).toContain("ganhou +800 seguidores");
  });

  it("quando mais da metade do que entra vai embora, a frase diz isso", () => {
    expect(texto(base)).toContain("de cada 100 que entraram, 73 foram embora");
    expect(texto({ ...base, sairam: 300 })).not.toContain("foram embora");
  });

  it("perder seguidores é dito como perder, não como ganhar menos", () => {
    const f = texto({ ...base, entraram: 500, sairam: 1_500 });
    expect(f).toContain("perdeu −1,0 mil seguidores");
  });

  it("sem período anterior não inventa comparação", () => {
    const f = texto({ ...base, alcanceAnterior: null, compartilhamentosAnterior: null });
    expect(f).toContain("728 mil contas.");
    expect(f).not.toContain("vezes o período anterior");
  });

  it("variação pequena não vira notícia", () => {
    expect(texto({ ...base, alcanceAnterior: 730_000 })).toContain("quase o mesmo do período anterior");
  });

  it("sem alcance, uma frase só — e nenhuma conta sobre zero", () => {
    expect(fraseDoPeriodo({ ...base, alcance: 0 })).toHaveLength(1);
  });

  it("os números que importam saem em negrito", () => {
    const fortes = fraseDoPeriodo(base).filter((t) => t.forte).map((t) => t.texto);
    expect(fortes.some((t) => t.includes("728 mil contas"))).toBe(true);
    expect(fortes.some((t) => t.includes("+800 seguidores"))).toBe(true);
  });
});
