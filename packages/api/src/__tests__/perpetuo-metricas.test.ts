import { describe, it, expect } from "vitest";
import { calcularMetricasDoPerpetuo } from "@loyola-x/shared";

/**
 * Story 44.28 — a extração dos KPIs do topo do dashboard perpétuo.
 *
 * ⚠️ Estes testes existem porque `turbo build` verde e suíte verde **não
 * provam** que o número não mudou. A conta vivia como `useMemo` dentro do
 * componente; mover para o `shared` é refatoração de comportamento, e a lição
 * já registrada neste repo é que "a suíte continuou verde" não prova
 * preservação.
 */
describe("calcularMetricasDoPerpetuo — os três ramos (Story 44.28)", () => {
  const vendas = { totalVendas: 73, faturamentoBruto: 29310.34, faturamentoLiquidoCalculado: 21000 };

  it("ramo 3 (o normal): reproduz o CAC da fixture do briefing", () => {
    const m = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 15757.56 },
      vendas,
    })!;
    // §2.1 do briefing: 30 dias → CAC R$ 215,86 · ROAS 1.86x
    expect(m.cac).toBeCloseTo(215.86, 2);
    expect(m.roas).toBeCloseTo(29310.34 / 15757.56, 6);
    expect(m.totalSales).toBe(73);
  });

  it("as três janelas da fixture fecham — é a régua canônica do @po", () => {
    const casos: [number, number, number][] = [
      [25895.74, 157, 164.94],
      [15757.56, 73, 215.86],
      [4333.25, 17, 254.9],
    ];
    for (const [spend, v, cacEsperado] of casos) {
      const m = calcularMetricasDoPerpetuo({
        temCampanhas: true,
        midia: { totalSpend: spend },
        vendas: { ...vendas, totalVendas: v },
      })!;
      expect(m.cac).toBeCloseTo(cacEsperado, 2);
    }
  });

  /**
   * ⚠️ Story 29.10 — o ramo que mais custou para existir.
   *
   * Sem planilha conectada, vendas e receita são ZERO e os derivados `null`.
   * Nunca o pixel da Meta por baixo: era esse o fallback silencioso que
   * mostrava faturamento onde não havia fonte de venda nenhuma.
   */
  it("ramo 2 (Story 29.10): sem planilha, vendas ZERO e derivados null — nunca o pixel", () => {
    const m = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 5000 },
      vendas: null,
    })!;
    expect(m.totalSpend).toBe(5000);
    expect(m.totalSales).toBe(0);
    expect(m.totalRevenue).toBe(0);
    expect(m.cac).toBeNull();
    expect(m.margin).toBeNull();
    expect(m.roas).toBeNull();
  });

  it("ramo 1: sem campanha, KPIs 100% da planilha e margem = receita líquida", () => {
    const m = calcularMetricasDoPerpetuo({ temCampanhas: false, midia: null, vendas })!;
    expect(m.totalSpend).toBe(0);
    expect(m.margin).toBe(21000); // sem mídia a descontar
    expect(m.cac).toBeNull();
    expect(m.roas).toBeNull();
    expect(m.marginPercent).toBeCloseTo((21000 / 29310.34) * 100, 6);
  });

  it("sem campanha e sem planilha: null — ausência é a resposta, não zeros", () => {
    expect(calcularMetricasDoPerpetuo({ temCampanhas: false, midia: null, vendas: null })).toBeNull();
    expect(calcularMetricasDoPerpetuo({ temCampanhas: true, midia: null, vendas })).toBeNull();
  });

  it("o spend agregado tem precedência — é o que bate ao centavo com a tela", () => {
    const m = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 999 },
      vendas,
      spendComTaxAgregado: 15757.56,
    })!;
    expect(m.totalSpend).toBe(15757.56);
    // ⚠️ Zero NÃO tem precedência: cai no `overview`, como antes.
    const zero = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 999 },
      vendas,
      spendComTaxAgregado: 0,
    })!;
    expect(zero.totalSpend).toBe(999);
  });

  it("denominador zero devolve null, nunca 0 nem Infinity", () => {
    const semVenda = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 1000 },
      vendas: { totalVendas: 0, faturamentoBruto: 0, faturamentoLiquidoCalculado: 0 },
    })!;
    expect(semVenda.cac).toBeNull();
    expect(semVenda.marginPercent).toBeNull();
    const semSpend = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 0 },
      vendas,
    })!;
    expect(semSpend.roas).toBeNull();
  });

  /** ROAS sobre o BRUTO; só o denominador carrega o imposto (regra da 29.20). */
  it("ROAS usa faturamento BRUTO, margem usa o LÍQUIDO", () => {
    const m = calcularMetricasDoPerpetuo({
      temCampanhas: true,
      midia: { totalSpend: 10000 },
      vendas: { totalVendas: 10, faturamentoBruto: 30000, faturamentoLiquidoCalculado: 21000 },
    })!;
    expect(m.roas).toBe(3); // 30000 / 10000 — bruto
    expect(m.margin).toBe(11000); // 21000 − 10000 — líquido
  });
});
