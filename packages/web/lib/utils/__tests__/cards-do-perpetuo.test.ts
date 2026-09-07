/**
 * Story 29.75 — as regras dos cards, com os números MEDIDOS em produção.
 *
 * `bbe-fc1-a1-mai-26`, período inteiro, 07/09, via
 * `packages/api/scripts/confere-contagem-perpetuo.ts`:
 *
 *   compradores 153 · linhas de bump 41 · checkouts de captação 149 (35 c/ bump)
 *   faturamento bruto R$ 59.975,37 · acessório R$ 6.114,33 · avulso R$ 1.735,00
 *
 * Cada teste do bloco "o defeito que abriu a story" falha se a regra antiga
 * voltar — é o que separa teste de decoração.
 */
import { describe, it, expect } from "vitest";
import {
  adesaoDeBump,
  representatividadeDeBump,
  aovDoPerpetuo,
} from "../cards-do-perpetuo";

/** Produção, 07/09. */
const P = {
  compradores: 153,
  linhasDeBump: 41,
  checkoutsDeCaptacao: 149,
  checkoutsComBump: 35,
  faturamentoBruto: 59975.37,
  bumpAcessorio: 6114.33,
  bumpAvulso: 1735.0,
  /** O que `resumirOrderBump` devolve hoje, e que era o que o card mostrava. */
  taxaPorCheckout: 35 / 149,
  aovPorCheckout: 58240.37 / 149,
};

describe("adesaoDeBump — AC2", () => {
  it("usa os números do resumo: 41 de 153", () => {
    const r = adesaoDeBump(P.linhasDeBump, P.compradores, P.taxaPorCheckout);
    expect(r.usaResumo).toBe(true);
    expect(r.taxa! * 100).toBeCloseTo(26.8, 1);
  });

  it("o defeito que abriu a story: NÃO devolve os 23,5% por checkout", () => {
    const r = adesaoDeBump(P.linhasDeBump, P.compradores, P.taxaPorCheckout);
    // Se alguém reverter para `ob.taxaDeAdesao`, este número volta a 23,5.
    expect(r.taxa! * 100).not.toBeCloseTo(23.5, 1);
  });

  it("sem classificação de produto na API, cai para a leitura por checkout", () => {
    const r = adesaoDeBump(null, P.compradores, P.taxaPorCheckout);
    expect(r.usaResumo).toBe(false);
    expect(r.taxa).toBe(P.taxaPorCheckout);
  });

  it("zero vendas não vira divisão por zero", () => {
    expect(adesaoDeBump(41, 0, null).taxa).toBeNull();
    expect(adesaoDeBump(41, 0, null).usaResumo).toBe(false);
  });

  it("passa de 100% quando há mais bumps que vendas — e isso é intencional", () => {
    // Um comprador com dois bumps conta duas vezes: foi a decisão do gestor ao
    // escolher bater com o resumo. A função não deve "proteger" o número.
    expect(adesaoDeBump(200, 153, null).taxa! * 100).toBeGreaterThan(100);
  });
});

describe("representatividadeDeBump — AC3", () => {
  it("a venda avulsa COMPÕE o total: 6.114,33 + 1.735,00", () => {
    const r = representatividadeDeBump(
      P.bumpAcessorio, P.bumpAvulso, P.faturamentoBruto, P.faturamentoBruto);
    expect(r.total).toBeCloseTo(7849.33, 2);
  });

  it("o defeito que abriu a story: o total NÃO é só o acessório", () => {
    const r = representatividadeDeBump(
      P.bumpAcessorio, P.bumpAvulso, P.faturamentoBruto, P.faturamentoBruto);
    expect(r.total).not.toBeCloseTo(P.bumpAcessorio, 2);
  });

  it("o denominador é o faturamento bruto, não a receita de captação", () => {
    const r = representatividadeDeBump(
      P.bumpAcessorio, P.bumpAvulso, P.faturamentoBruto, 99999);
    expect(r.base).toBe(P.faturamentoBruto);
    expect(r.taxa! * 100).toBeCloseTo(13.09, 1);
  });

  it("faturamento bruto ausente cai para o total da etapa", () => {
    const r = representatividadeDeBump(P.bumpAcessorio, P.bumpAvulso, null, 50000);
    expect(r.base).toBe(50000);
  });

  it("etapa sem faturamento não afirma taxa nenhuma", () => {
    expect(representatividadeDeBump(0, 0, 0, 0).taxa).toBeNull();
  });
});

describe("aovDoPerpetuo — AC4", () => {
  it("faturamento bruto ÷ vendas do resumo", () => {
    const r = aovDoPerpetuo(P.faturamentoBruto, P.compradores, P.aovPorCheckout);
    expect(r.usaResumo).toBe(true);
    // 59.975,37 ÷ 153 = 391,9958… — o esperado é o valor da divisão, não o
    // arredondamento dele a duas casas (391,99 erra por 0,006 e reprova).
    expect(r.valor!).toBeCloseTo(391.9958, 3);
  });

  it("o defeito que abriu a story: NÃO é receita de captação ÷ checkouts", () => {
    const r = aovDoPerpetuo(P.faturamentoBruto, P.compradores, P.aovPorCheckout);
    expect(r.valor!).not.toBeCloseTo(390.87, 2);
  });

  it("AOV × vendas fecha com o faturamento bruto — o ponto do AC4", () => {
    const r = aovDoPerpetuo(P.faturamentoBruto, P.compradores, null);
    expect(r.valor! * P.compradores).toBeCloseTo(P.faturamentoBruto, 2);
  });

  it("sem os números do resumo, mantém o AOV por checkout", () => {
    const r = aovDoPerpetuo(null, P.compradores, P.aovPorCheckout);
    expect(r.usaResumo).toBe(false);
    expect(r.valor).toBe(P.aovPorCheckout);
  });
});
