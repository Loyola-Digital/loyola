import { describe, it, expect } from "vitest";
import { ehSomavel, serieAcumulada, valorAcumulado, type DiaBruto } from "../comparacao-acumulada";

const dia = (over: Partial<DiaBruto>): DiaBruto => ({
  spend: 0, impressions: 0, clicks: 0, leads: 0, faturamento: 0, vendas: 0, ...over,
});

describe("série acumulada da comparação", () => {
  it("soma o que é somável", () => {
    const r = serieAcumulada([dia({ spend: 100 }), dia({ spend: 250 }), dia({ spend: 50 })], "spend");
    expect(r).toEqual([100, 350, 400]);
  });

  it("CPL acumulado é razão dos acumulados, não média das médias", () => {
    // Dia 1: 2 leads a R$ 50. Dia 2: 200 leads a R$ 10.
    // Média das médias daria R$ 30 — plausível e errado.
    const r = serieAcumulada(
      [dia({ spend: 100, leads: 2 }), dia({ spend: 2000, leads: 200 })],
      "cpl",
    );
    expect(r[0]).toBe(50);
    expect(r[1]).toBeCloseTo(10.396, 2);
    expect(r[1]).not.toBeCloseTo(30, 0);
  });

  it("CTR acumulado usa cliques e impressões acumulados", () => {
    const r = serieAcumulada(
      [dia({ clicks: 10, impressions: 1000 }), dia({ clicks: 90, impressions: 1000 })],
      "ctr",
    );
    expect(r[0]).toBe(1);
    expect(r[1]).toBe(5); // 100 cliques / 2000 impressões
  });

  it("CPM acumulado por mil impressões", () => {
    const r = serieAcumulada([dia({ spend: 50, impressions: 10000 })], "cpm");
    expect(r[0]).toBe(5);
  });

  it("denominador zero não vira R$ 0,00", () => {
    // "Ainda não houve lead" não é "o CPL é zero" — a linha corta.
    const r = serieAcumulada([dia({ spend: 300, leads: 0 })], "cpl");
    expect(r[0]).toBeUndefined();
  });

  it("dia ausente não desenha reta parada", () => {
    const r = serieAcumulada([dia({ spend: 100 }), null, dia({ spend: 100 })], "spend");
    expect(r).toEqual([100, undefined, 200]);
  });

  it("o acumulado não regride quando um dia é zero", () => {
    const r = serieAcumulada([dia({ vendas: 3 }), dia({ vendas: 0 }), dia({ vendas: 2 })], "vendas");
    expect(r).toEqual([3, 3, 5]);
  });

  it("sabe quais métricas se somam", () => {
    expect(ehSomavel("spend")).toBe(true);
    expect(ehSomavel("leads")).toBe(true);
    expect(ehSomavel("cpl")).toBe(false);
    expect(ehSomavel("cpv")).toBe(false);
    expect(ehSomavel("ctr")).toBe(false);
  });

  it("CPV acumulado divide o investimento pelas VENDAS, não pelos leads", () => {
    // O mesmo dia visto pelas duas réguas: 500 leads de popup e 4 vendas.
    // Pelo lead o custo é R$ 4; pela venda, R$ 500 — é este que diz se o
    // lançamento se paga.
    const dias = [dia({ spend: 1000, leads: 300, vendas: 2 }), dia({ spend: 1000, leads: 200, vendas: 2 })];
    expect(serieAcumulada(dias, "cpv")).toEqual([500, 500]);
    expect(serieAcumulada(dias, "cpl")).toEqual([1000 / 300, 4]);
  });

  it("CPV acumulado é razão dos acumulados, não média das médias", () => {
    // Dia 1: 1 venda a R$ 900. Dia 2: 30 vendas a R$ 100.
    const r = serieAcumulada(
      [dia({ spend: 900, vendas: 1 }), dia({ spend: 3000, vendas: 30 })],
      "cpv",
    );
    expect(r[0]).toBe(900);
    expect(r[1]).toBeCloseTo(125.8, 1);
    expect(r[1]).not.toBeCloseTo(500, 0);
  });

  it("dia sem venda deixa o CPV vazio em vez de R$ 0,00", () => {
    // Investiu e não vendeu: o custo por venda não existe ainda. Zero leria
    // como aquisição de graça — o oposto do que aconteceu.
    const r = serieAcumulada([dia({ spend: 800, leads: 120 }), dia({ spend: 400, vendas: 3 })], "cpv");
    expect(r[0]).toBeUndefined();
    expect(r[1]).toBe(400);
  });

  it("valorAcumulado é coerente com a série", () => {
    const total = dia({ spend: 1000, leads: 40, vendas: 5 });
    expect(valorAcumulado(total, "cpl")).toBe(25);
    expect(valorAcumulado(total, "cpv")).toBe(200);
  });
});
