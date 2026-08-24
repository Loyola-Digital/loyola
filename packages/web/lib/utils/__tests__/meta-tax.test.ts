import { describe, it, expect } from "vitest";
import { comImpostoMeta } from "../meta-tax";

describe("imposto sobre Meta Ads", () => {
  it("faz gross-up por dentro, não acréscimo simples", () => {
    // O caso real que expôs a divergência: o gráfico mostrava 238,67 e a tabela
    // da mesma etapa, 271,68.
    expect(comImpostoMeta(238.67, "2026-04-17")).toBeCloseTo(271.68, 2);
    // Acréscimo simples daria 267,67 — parecido o bastante para passar batido.
    expect(comImpostoMeta(238.67, "2026-04-17")).not.toBeCloseTo(267.67, 1);
  });

  it("não aplica antes da vigência", () => {
    expect(comImpostoMeta(100, "2025-12-31")).toBe(100);
    expect(comImpostoMeta(100, "2026-01-01")).toBeCloseTo(113.83, 2);
  });

  it("sem data, não inventa imposto", () => {
    expect(comImpostoMeta(100, null)).toBe(100);
    expect(comImpostoMeta(100, undefined)).toBe(100);
  });

  it("zero continua zero", () => {
    expect(comImpostoMeta(0, "2026-04-17")).toBe(0);
  });
});
