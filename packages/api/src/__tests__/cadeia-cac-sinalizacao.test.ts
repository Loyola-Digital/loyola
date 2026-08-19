import { describe, it, expect } from "vitest";
import { sinalizar, alvoVigente, TOLERANCIA_DO_ALVO, type Teto, type TetoAusente } from "@loyola-x/shared";

/**
 * Story 44.9 AC6 — a sinalização da spec §6.
 *
 * O que estes testes travam é a inversão: a spec escreve *"🟢 ≥ alvo"*, que só
 * vale para métrica em que MAIOR é melhor. `cpm` e `cpc` são `"menor"` — ao pé
 * da letra, a regra pintaria de verde um CPC ruim, em 2 das 5 métricas, e a
 * tela ficaria plausível.
 *
 * ⚠️ Cada asserção verificada por REVERSÃO.
 */

describe("sinalizar — métrica em que MAIOR é melhor", () => {
  it("no alvo ou acima é verde", () => {
    expect(sinalizar("connectRate", 0.9, 0.85)).toBe("verde");
    expect(sinalizar("connectRate", 0.85, 0.85)).toBe("verde"); // exatamente no alvo
    expect(sinalizar("convLP", 0.05, 0.04)).toBe("verde");
  });

  it("até 15% abaixo é amarelo", () => {
    // 0,85 × 0,85 = 0,7225 — a fronteira exata ainda é amarelo.
    expect(sinalizar("connectRate", 0.7225, 0.85)).toBe("amarelo");
    expect(sinalizar("connectRate", 0.8, 0.85)).toBe("amarelo");
  });

  it("mais de 15% abaixo é vermelho", () => {
    expect(sinalizar("connectRate", 0.72, 0.85)).toBe("vermelho");
    expect(sinalizar("ctr", 0.01, 0.02)).toBe("vermelho");
  });
});

describe("sinalizar — métrica em que MENOR é melhor (a inversão da §6)", () => {
  it("CPC no alvo ou ABAIXO é verde — não acima", () => {
    expect(sinalizar("cpc", 0.4, 0.5)).toBe("verde");
    expect(sinalizar("cpc", 0.5, 0.5)).toBe("verde");
    // Ao pé da letra, "🟢 ≥ alvo" daria verde aqui. É o defeito.
    expect(sinalizar("cpc", 2.0, 0.5)).not.toBe("verde");
  });

  it("CPC até 15% ACIMA do alvo é amarelo", () => {
    // 0,5 × 1,15 = 0,575 — a fronteira exata ainda é amarelo.
    expect(sinalizar("cpc", 0.575, 0.5)).toBe("amarelo");
    expect(sinalizar("cpc", 0.55, 0.5)).toBe("amarelo");
  });

  it("CPC mais de 15% acima é vermelho", () => {
    expect(sinalizar("cpc", 0.58, 0.5)).toBe("vermelho");
    expect(sinalizar("cpm", 25, 15)).toBe("vermelho");
  });

  it("⚠️ o limiar usa ×1,15, NUNCA ×0,85 — usar o mesmo fator aperta o critério", () => {
    // Com alvo 0,5: a tolerância certa vai até 0,575.
    // Se alguém usasse 0,85 dos dois lados, o corte cairia para 0,425 — e
    // 0,55 (que está dentro da tolerância) viraria vermelho.
    expect(sinalizar("cpc", 0.55, 0.5)).toBe("amarelo");
    expect(0.5 * (1 + TOLERANCIA_DO_ALVO)).toBeCloseTo(0.575, 10);
  });
});

describe("sinalizar — ausência é declarada, nunca vira cor", () => {
  it("sem valor atual devolve null", () => {
    expect(sinalizar("cpc", null, 0.5)).toBeNull();
    expect(sinalizar("cpc", undefined, 0.5)).toBeNull();
  });

  it("sem alvo devolve null", () => {
    expect(sinalizar("cpc", 0.5, null)).toBeNull();
    expect(sinalizar("connectRate", 0.9, undefined)).toBeNull();
  });

  it("alvo zero ou negativo devolve null, não verde", () => {
    // Verde aqui diria "está no alvo" sobre um alvo que não existe.
    expect(sinalizar("cpc", 0.5, 0)).toBeNull();
    expect(sinalizar("connectRate", 0.9, -1)).toBeNull();
  });

  it("NaN e Infinity devolvem null", () => {
    expect(sinalizar("cpc", NaN, 0.5)).toBeNull();
    expect(sinalizar("cpc", 0.5, Infinity)).toBeNull();
  });
});

describe("alvoVigente — teto quando existe, benchmark quando não", () => {
  const teto = (valor: number): Teto => ({
    metrica: "cpc",
    valor,
    campaignId: "c1",
    de: "2026-08-01",
    ate: "2026-08-07",
    base: 50_000,
    confianca: "alta",
    fonte: "ad-level",
  });
  const ausente: TetoAusente = { metrica: "cpc", valor: null, motivo: "baseInsuficiente" };

  it("com teto, o alvo é o teto — o benchmark não entra", () => {
    expect(alvoVigente(teto(0.5), 1.2)).toBe(0.5);
  });

  it("sem teto, o alvo passa a ser o benchmark", () => {
    expect(alvoVigente(ausente, 1.2)).toBe(1.2);
  });

  it("sem teto e sem benchmark não há alvo — e portanto não há selo", () => {
    expect(alvoVigente(ausente, null)).toBeNull();
    expect(sinalizar("cpc", 0.9, alvoVigente(ausente, null))).toBeNull();
  });
});
