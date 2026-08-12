import { describe, expect, it } from "vitest";
import {
  calcularMargemContribuicao,
  validarPercentuaisMargem,
  type MargemContribuicaoInput,
} from "@/lib/utils/lyrio-margin";
import { metaTaxAmount } from "@/lib/utils/funnel-metrics";

/**
 * Story 42.4 — caso canônico é o memorial que o gestor especificou.
 *
 * Comparações com `toBeCloseTo(x, 2)`: a margem exata é 2208,4803…, e o imposto
 * da Meta sai de uma divisão por 0,8785. Assertiva com `toBe` reprovaria a
 * implementação correta.
 */

const CASO_CANONICO: MargemContribuicaoInput = {
  faturamentoBrutoBrl: 10_000,
  platformFeePct: 15,
  taxPct: 5,
  otherCostsPct: 1,
  investimentoMetaLiquidoBrl: 5_000,
  // 5.000 ÷ (1 − 0,1215) − 5.000 = 691,5197…
  impostoMetaBrl: metaTaxAmount(5_000, "2026-08-01"),
  investimentoGoogleBrl: 0,
};

describe("calcularMargemContribuicao — caso canônico do gestor", () => {
  const r = calcularMargemContribuicao(CASO_CANONICO);

  it("desconta 15% de plataforma sobre o bruto", () => {
    expect(r.descontosPlataforma).toBeCloseTo(1_500, 2);
  });

  it("desconta 5% de imposto sobre o bruto", () => {
    expect(r.imposto).toBeCloseTo(500, 2);
  });

  it("desconta 1% de outros custos sobre o bruto", () => {
    expect(r.outrosCustos).toBeCloseTo(100, 2);
  });

  it("chega a 7.900,00 de faturamento líquido", () => {
    expect(r.faturamentoLiquido).toBeCloseTo(7_900, 2);
  });

  it("soma 5.691,52 de investimento total (com o imposto da Meta)", () => {
    expect(r.investimentoTotal).toBeCloseTo(5_691.52, 2);
  });

  it("fecha em 2.208,48 de margem", () => {
    expect(r.margem).toBeCloseTo(2_208.48, 2);
  });

  it("os percentuais incidem sobre o bruto, não em cascata", () => {
    // Em cascata, o imposto de 5% cairia sobre 8.500 (= 425), não sobre 10.000.
    expect(r.imposto).not.toBeCloseTo(425, 2);
  });
});

describe("calcularMargemContribuicao — bordas", () => {
  it("percentuais zerados deixam o líquido igual ao bruto", () => {
    const r = calcularMargemContribuicao({
      ...CASO_CANONICO,
      platformFeePct: 0,
      taxPct: 0,
      otherCostsPct: 0,
    });
    expect(r.faturamentoLiquido).toBeCloseTo(10_000, 2);
  });

  it("margem negativa não é zerada — investimento acima do líquido", () => {
    const r = calcularMargemContribuicao({
      ...CASO_CANONICO,
      investimentoMetaLiquidoBrl: 20_000,
      impostoMetaBrl: metaTaxAmount(20_000, "2026-08-01"),
    });
    expect(r.margem).toBeLessThan(0);
    expect(r.margem).toBeCloseTo(7_900 - 22_766.08, 1);
  });

  it("faturamento zero devolve margem = −investimento, sem NaN", () => {
    const r = calcularMargemContribuicao({ ...CASO_CANONICO, faturamentoBrutoBrl: 0 });
    expect(r.faturamentoLiquido).toBe(0);
    expect(r.margem).toBeCloseTo(-5_691.52, 2);
    expect(Number.isNaN(r.margem)).toBe(false);
  });

  it("sem imposto Meta (período anterior a 2026), margem = líquido − investimento", () => {
    const r = calcularMargemContribuicao({
      ...CASO_CANONICO,
      impostoMetaBrl: metaTaxAmount(5_000, "2025-12-31"),
    });
    expect(r.investimentoTotal).toBeCloseTo(5_000, 2);
    expect(r.margem).toBeCloseTo(2_900, 2);
  });

  it("soma o Google sem aplicar o imposto da Meta sobre ele", () => {
    const r = calcularMargemContribuicao({ ...CASO_CANONICO, investimentoGoogleBrl: 1_000 });
    // 5.000 + 691,52 + 1.000 — o Google entra íntegro.
    expect(r.investimentoTotal).toBeCloseTo(6_691.52, 2);
    expect(r.margem).toBeCloseTo(1_208.48, 2);
  });
});

describe("validarPercentuaisMargem", () => {
  const base = { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 };

  it("aceita a configuração padrão", () => {
    expect(validarPercentuaisMargem(base).ok).toBe(true);
  });

  it("aceita soma exatamente igual a 100", () => {
    expect(
      validarPercentuaisMargem({ platformFeePct: 50, taxPct: 30, otherCostsPct: 20 }).ok,
    ).toBe(true);
  });

  it("rejeita soma acima de 100", () => {
    const r = validarPercentuaisMargem({ platformFeePct: 60, taxPct: 30, otherCostsPct: 20 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("100%");
  });

  it("rejeita percentual negativo", () => {
    const r = validarPercentuaisMargem({ ...base, taxPct: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Imposto");
  });

  it("rejeita percentual acima de 100 isolado", () => {
    expect(validarPercentuaisMargem({ ...base, platformFeePct: 101 }).ok).toBe(false);
  });

  it("rejeita valor não numérico", () => {
    expect(validarPercentuaisMargem({ ...base, taxPct: Number.NaN }).ok).toBe(false);
  });
});
