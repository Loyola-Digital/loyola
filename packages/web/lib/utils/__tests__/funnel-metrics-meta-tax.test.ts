import { describe, expect, it } from "vitest";
import {
  applyMetaAdsTax,
  metaTaxAmount,
  sumMetaInsights,
  sumMetaSpendWithTax,
} from "@/lib/utils/funnel-metrics";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";

/**
 * Story 42.1 — trava a regra do imposto de 12,15% sobre Meta Ads.
 *
 * O imposto é "por dentro" (gross-up): o `spend` da API Meta é o LÍQUIDO e o
 * custo real é `spend / (1 − 0,1215)`. A decisão de junho/2026 foi explícita em
 * NÃO usar `spend × 1,1215` — as duas contas divergem e a diferença cresce com
 * o investimento.
 *
 * Aritmética de referência usada aqui: 878,50 é o líquido cujo bruto é
 * exatamente 1.000,00 (878,50 ÷ 0,8785 = 1.000). O imposto é 121,50, que é
 * 12,15% DO BRUTO — e não de 878,50 (que daria 106,74). Números redondos de
 * propósito: um teste que ninguém consegue conferir de cabeça não protege nada.
 */

/** Linha diária mínima — só os campos que a soma de spend consome. */
function row(dateStart: string, spend: string): CampaignDailyInsight {
  return {
    date_start: dateStart,
    date_stop: dateStart,
    impressions: "0",
    reach: "0",
    clicks: "0",
    spend,
    ctr: "0",
    cpc: "0",
    cpm: "0",
  };
}

describe("applyMetaAdsTax — regra da data (AC4)", () => {
  it("não tributa linha de 2025", () => {
    expect(applyMetaAdsTax(878.5, "2025-12-31")).toBe(878.5);
  });

  it("tributa linha de 2026 com gross-up por dentro", () => {
    expect(applyMetaAdsTax(878.5, "2026-01-01")).toBeCloseTo(1000, 2);
  });

  it("não é multiplicação simples pela alíquota", () => {
    // 878,50 × 1,1215 = 985,24 — a conta REJEITADA na decisão de junho/2026.
    expect(applyMetaAdsTax(878.5, "2026-01-01")).not.toBeCloseTo(985.24, 2);
  });

  it("deixa o valor intacto quando a data está vazia", () => {
    expect(applyMetaAdsTax(878.5, "")).toBe(878.5);
  });

  it("deixa o valor intacto quando o spend é zero", () => {
    expect(applyMetaAdsTax(0, "2026-05-01")).toBe(0);
  });
});

describe("metaTaxAmount — a parcela do imposto (AC5)", () => {
  it("devolve 12,15% do bruto, não do líquido", () => {
    expect(metaTaxAmount(878.5, "2026-06-15")).toBeCloseTo(121.5, 2);
  });

  it("é zero antes de 2026", () => {
    expect(metaTaxAmount(878.5, "2025-06-15")).toBe(0);
  });

  it("fecha com applyMetaAdsTax: líquido + parcela = valor tributado", () => {
    const liquido = 2777.96;
    expect(liquido + metaTaxAmount(liquido, "2026-04-22")).toBeCloseTo(
      applyMetaAdsTax(liquido, "2026-04-22"),
      2,
    );
  });
});

describe("sumMetaSpendWithTax — decomposição da soma (AC5)", () => {
  it("separa líquido e imposto numa janela toda em 2026", () => {
    const r = sumMetaSpendWithTax([[row("2026-05-01", "878.50"), row("2026-05-02", "878.50")]]);
    expect(r.spendLiquido).toBeCloseTo(1757, 2);
    expect(r.imposto).toBeCloseTo(243, 2);
    expect(r.spendComImposto).toBeCloseTo(2000, 2);
  });

  it("tributa só as linhas de 2026 num período que cruza a virada (AC4)", () => {
    const r = sumMetaSpendWithTax([[row("2025-12-31", "878.50"), row("2026-01-01", "878.50")]]);
    expect(r.spendLiquido).toBeCloseTo(1757, 2);
    // Só a linha de 2026 gera imposto.
    expect(r.imposto).toBeCloseTo(121.5, 2);
    expect(r.spendComImposto).toBeCloseTo(1878.5, 2);
  });

  it("soma várias campanhas (array de arrays)", () => {
    const r = sumMetaSpendWithTax([
      [row("2026-05-01", "878.50")],
      [row("2026-05-01", "878.50")],
    ]);
    expect(r.spendComImposto).toBeCloseTo(2000, 2);
  });

  it("devolve zeros para entrada vazia, sem NaN", () => {
    const r = sumMetaSpendWithTax([]);
    expect(r.spendLiquido).toBe(0);
    expect(r.imposto).toBe(0);
    expect(r.spendComImposto).toBe(0);
  });
});

describe("invariantes que impedem divergência entre cards (AC5/AC6)", () => {
  // Valores irregulares de propósito: é onde o erro de ponto flutuante aparece.
  const insights: CampaignDailyInsight[][] = [
    [row("2026-04-22", "2777.96"), row("2026-04-23", "1043.17"), row("2026-04-24", "88.09")],
    [row("2025-12-30", "512.44"), row("2026-04-25", "3.33")],
  ];

  it("invariante 1 — spendComImposto = spendLiquido + imposto", () => {
    const r = sumMetaSpendWithTax(insights);
    expect(r.spendComImposto).toBeCloseTo(r.spendLiquido + r.imposto, 2);
  });

  it("invariante 2 — bate com sumMetaInsights, que é o que os cards já exibem", () => {
    const decomposto = sumMetaSpendWithTax(insights);
    const agregado = sumMetaInsights(insights);
    expect(decomposto.spendComImposto).toBeCloseTo(agregado.spend, 2);
  });

  it("exemplo canônico do histórico do projeto: 2.777,96 → 3.162,16", () => {
    expect(applyMetaAdsTax(2777.96, "2026-04-22")).toBeCloseTo(3162.16, 2);
    expect(metaTaxAmount(2777.96, "2026-04-22")).toBeCloseTo(384.2, 2);
  });
});
