import { describe, expect, it } from "vitest";
import { PROPORCAO_MINIMA, enquadrar } from "../enquadramento";

const LARGURA = 600;

describe("enquadrar", () => {
  it("não mexe num A4 em pé", () => {
    // 595 × 842 é o A4 em pontos: a proporção (0,707) já está no intervalo.
    const r = enquadrar(595, 842, LARGURA);
    expect(r.altura).toBe(849);
    expect(r.cortou).toBe(false);
  });

  it("corta a landing page, que é o caso que quebrava a grade", () => {
    // Uma página de 1080 × 9000: a proporção real (0,12) viraria um card de
    // 5000px de altura e 14 MB de bitmap.
    const r = enquadrar(1080, 9000, LARGURA);
    expect(r.altura).toBe(Math.round(LARGURA / PROPORCAO_MINIMA));
    expect(r.cortou).toBe(true);
    // O que importa: cabe na tela.
    expect(r.altura).toBeLessThanOrEqual(1000);
  });

  it("não deixa a paisagem virar uma faixa", () => {
    const r = enquadrar(1600, 400, LARGURA);
    expect(r.largura / r.altura).toBeLessThanOrEqual(1.6 + 0.01);
  });

  it("página degenerada não vira canvas inválido", () => {
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [Number.NaN, 100],
    ] as const) {
      const r = enquadrar(w, h, LARGURA);
      expect(r.altura).toBeGreaterThan(0);
      expect(Number.isFinite(r.altura)).toBe(true);
    }
  });

  it("a largura do bitmap é sempre respeitada", () => {
    expect(enquadrar(1080, 9000, LARGURA).largura).toBe(LARGURA);
  });
});
