/**
 * Story 49.19 (AC4/AC8) — o teste exato de Fisher bilateral contra valores de
 * referência publicados:
 * - "a senhora que prova o chá" (Fisher, 1935): [[3,1],[1,3]] → 17/35 ≈ 0,4857
 *   (o exemplo `TeaTasting` do `?fisher.test` do R: p-value = 0.4857);
 * - o exemplo da Wikipédia ("Fisher's exact test", dieta × sexo): [[1,9],[11,3]]
 *   → p ≈ 0,002759 (bilateral);
 * - o exemplo `Convictions` do `?fisher.test` do R: `matrix(c(2, 10, 15, 3), nrow = 2)`,
 *   isto é, as linhas [2, 15] e [10, 3] → p-value = 0.0005367;
 * - e, para p perto de 0,05 dos dois lados e tabelas grandes, o
 *   `scipy.stats.fisher_exact` 1.17.1 (alternative="two-sided"), conferido em
 *   fração exata (`fractions.Fraction` sobre `math.comb`).
 */

import { describe, expect, it } from "vitest";
import { ALFA_DO_FISHER, fisherExatoBilateral } from "../services/fisher-exato.js";

const p = (a: number, b: number, c: number, d: number) => fisherExatoBilateral(a, b, c, d).pValor;

describe("fisherExatoBilateral — referências publicadas", () => {
  it("chá de Fisher (R TeaTasting): 17/35 ≈ 0,4857 — bilateral, não o unilateral (0,2429)", () => {
    expect(p(3, 1, 1, 3)).toBeCloseTo(17 / 35, 12);
    expect(p(3, 1, 1, 3)).not.toBeCloseTo(0.2429, 3);
  });

  it("Wikipédia (dieta × sexo): 41/14858 ≈ 0,002759", () => {
    expect(p(1, 9, 11, 3)).toBeCloseTo(41 / 14858, 14);
    expect(p(1, 9, 11, 3)).toBeCloseTo(0.002759, 6);
  });

  it("R Convictions: 0,0005367 (3571/6653325)", () => {
    expect(p(2, 15, 10, 3)).toBeCloseTo(3571 / 6653325, 15);
    expect(p(2, 15, 10, 3)).toBeCloseTo(0.0005367, 7);
  });

  it("scipy: tabelas grandes (taxas de conversão de LP)", () => {
    expect(p(30, 970, 12, 988) / 0.007287953507168595).toBeCloseTo(1, 10);
    expect(p(40, 50000, 10, 49000) / 2.490227093603622e-5).toBeCloseTo(1, 10);
  });

  it("scipy: tabela com C(n, k) de ~1.500 dígitos (além do `double`) — o p e a decisão continuam certos", () => {
    const r = fisherExatoBilateral(300, 99700, 220, 99780);
    expect(r.pValor / 0.0005107687000996574).toBeCloseTo(1, 9);
    expect(r.abaixoDoAlfa).toBe(true);
    expect(p(260, 149740, 200, 149800) / 0.005846102313657507).toBeCloseTo(1, 9);
  });
});

describe("fisherExatoBilateral — p ≈ 0,05 dos dois lados (a decisão do método)", () => {
  it("p = 0,04990… (247649/4962480) → abaixo do alfa", () => {
    const r = fisherExatoBilateral(1, 10, 10, 11);
    expect(r.pValor).toBeCloseTo(247649 / 4962480, 15);
    expect(r.abaixoDoAlfa).toBe(true);
  });

  it("p = 0,05008… (963/19228) → não está abaixo", () => {
    const r = fisherExatoBilateral(1, 5, 13, 5);
    expect(r.pValor).toBeCloseTo(963 / 19228, 15);
    expect(r.abaixoDoAlfa).toBe(false);
  });

  it("p = exatamente 1/20 em TODAS as orientações → não está abaixo (no scipy sai 0,05 numa e 0,0499… noutra)", () => {
    const orientacoes: [number, number, number, number][] = [
      [0, 2, 12, 2],
      [2, 0, 2, 12],
      [12, 2, 0, 2],
      [2, 12, 2, 0],
      [0, 12, 2, 2],
      [2, 2, 0, 12],
      [12, 0, 2, 2],
      [2, 2, 12, 0],
    ];
    for (const t of orientacoes) {
      const r = fisherExatoBilateral(...t);
      expect(r.abaixoDoAlfa, t.join(",")).toBe(false);
      expect(r.pValor, t.join(",")).toBeCloseTo(0.05, 15);
    }
  });

  it("o alfa é o do método", () => {
    expect(ALFA_DO_FISHER.valor).toBe(0.05);
    expect(Number(ALFA_DO_FISHER.numerador) / Number(ALFA_DO_FISHER.denominador)).toBe(0.05);
  });
});

describe("fisherExatoBilateral — propriedades e entradas", () => {
  it("trocar as linhas ou as colunas não muda o p", () => {
    for (const [a, b, c, d] of [
      [1, 9, 11, 3],
      [2, 286, 14, 274],
      [7, 0, 3, 5],
    ] as const) {
      const base = p(a, b, c, d);
      expect(p(c, d, a, b)).toBeCloseTo(base, 14);
      expect(p(b, a, d, c)).toBeCloseTo(base, 14);
      expect(p(a, c, b, d)).toBeCloseTo(base, 14);
    }
  });

  it("tabela sem informação → p = 1 (vazia, uma coluna zerada, proporções iguais)", () => {
    expect(fisherExatoBilateral(0, 0, 0, 0)).toEqual({ pValor: 1, abaixoDoAlfa: false });
    expect(p(0, 10, 0, 12)).toBe(1);
    expect(p(5, 0, 7, 0)).toBe(1);
    expect(p(1, 59, 1, 59)).toBeCloseTo(1, 14);
  });

  it("separação perfeita 5×5: 2/252 ≈ 0,00794", () => {
    expect(p(5, 0, 0, 5)).toBeCloseTo(2 / 252, 15);
  });

  it("entrada que não é inteiro ≥ 0 → RangeError (nunca um p inventado)", () => {
    expect(() => fisherExatoBilateral(-1, 2, 3, 4)).toThrow(RangeError);
    expect(() => fisherExatoBilateral(1.5, 2, 3, 4)).toThrow(RangeError);
    expect(() => fisherExatoBilateral(1, 2, Number.NaN, 4)).toThrow(RangeError);
  });
});
