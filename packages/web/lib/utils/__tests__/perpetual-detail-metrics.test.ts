import { describe, it, expect } from "vitest";
import { deriveDetailMetrics, type DetailMetricsInput } from "../perpetual-detail-metrics";

// Constantes do domínio, espelhadas do dashboard.
const META_TAX_RATE = 0.1215;
const FEE_KIWIFY = 0.2099;

/** Gross-up do Meta: o mesmo de `utils/meta-tax.ts` no backend. */
const comImposto = (bruto: number) => bruto / (1 - META_TAX_RATE);

// Caso real conferido pelo usuário — funil c7b90503, 09/07 → 01/08/2026.
const SPEND_BRUTO = 9997.68;
const SPEND_CORRETO = comImposto(SPEND_BRUTO); // R$ 11.380,40
const VENDAS = 323;
const FATURAMENTO = 20861;

const base: DetailMetricsInput = {
  spend: SPEND_CORRETO, // como chega do backend: JÁ tributado
  impressions: 500_000,
  clicks: 12_000,
  linkClicks: 8_000,
  revenue: FATURAMENTO,
  sales: VENDAS,
};

describe("deriveDetailMetrics — Story 29.27 (guarda contra dupla tributação)", () => {
  it("não aplica gross-up de novo: spend de saída = spend de entrada", () => {
    const r = deriveDetailMetrics(base, FEE_KIWIFY);
    expect(r.spend).toBeCloseTo(SPEND_CORRETO, 2);
    expect(r.spend).toBeCloseTo(11380.4, 1);
  });

  it("o valor errado da 29.24 (spend × 1,1215²) NÃO aparece", () => {
    const duplicado = comImposto(SPEND_CORRETO); // ~12.954,35
    const r = deriveDetailMetrics(base, FEE_KIWIFY);
    expect(duplicado).toBeCloseTo(12954.35, 1); // confirma a referência
    expect(r.spend).not.toBeCloseTo(duplicado, 1);
    // O excesso que a tabela exibia a mais: ~R$ 1.573,95
    expect(duplicado - r.spend).toBeCloseTo(1573.95, 1);
  });

  it("CAC, CPC e CPM derivam do spend tributado UMA vez", () => {
    const r = deriveDetailMetrics(base, FEE_KIWIFY);
    expect(r.costPerSale).toBeCloseTo(SPEND_CORRETO / VENDAS, 6);
    expect(r.costPerSale).toBeCloseTo(35.23, 2);
    expect(r.cpc).toBeCloseTo(SPEND_CORRETO / 8_000, 6); // link clicks têm prioridade
    expect(r.cpm).toBeCloseTo((SPEND_CORRETO / 500_000) * 1000, 6);
  });

  it("ROAS mantém numerador BRUTO (regra da 29.20)", () => {
    const r = deriveDetailMetrics(base, FEE_KIWIFY);
    expect(r.roas).toBeCloseTo(FATURAMENTO / SPEND_CORRETO, 6);
    // Se o numerador fosse líquido, o ROAS cairia ~21% — não é o caso.
    expect(r.roas).not.toBeCloseTo((FATURAMENTO * (1 - FEE_KIWIFY)) / SPEND_CORRETO, 4);
  });

  it("Margem = faturamento LÍQUIDO − investimento c/ imposto", () => {
    const r = deriveDetailMetrics(base, FEE_KIWIFY);
    const esperada = FATURAMENTO * (1 - FEE_KIWIFY) - SPEND_CORRETO;
    expect(r.marginPerSale).toBeCloseTo(esperada / VENDAS, 6);
    expect(r.marginPct).toBeCloseTo((esperada / FATURAMENTO) * 100, 6);
  });

  it("Σ das linhas reconcilia com o total do período (AC3)", () => {
    // Três entidades cujo spend soma o total do período, cada uma já tributada.
    const partes = [0.5, 0.3, 0.2].map((p) =>
      deriveDetailMetrics({ ...base, spend: SPEND_CORRETO * p }, FEE_KIWIFY),
    );
    const soma = partes.reduce((s, r) => s + r.spend, 0);
    expect(soma).toBeCloseTo(SPEND_CORRETO, 2);
    // Com o bug antigo, a soma daria ~12.954 e não bateria com o card.
    expect(soma).not.toBeCloseTo(comImposto(SPEND_CORRETO), 1);
  });

  it("CPC cai para clicks quando não há linkClicks", () => {
    const r = deriveDetailMetrics({ ...base, linkClicks: null }, FEE_KIWIFY);
    expect(r.cpc).toBeCloseTo(SPEND_CORRETO / 12_000, 6);
  });

  it("guardas de divisão por zero", () => {
    const vazio = deriveDetailMetrics(
      { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, revenue: 0, sales: 0 },
      FEE_KIWIFY,
    );
    expect(vazio.cpc).toBe(0);
    expect(vazio.cpm).toBe(0);
    expect(vazio.roas).toBeNull();
    expect(vazio.costPerSale).toBeNull();
    expect(vazio.marginPct).toBeNull();
    expect(vazio.marginPerSale).toBeNull();
  });

  it("linha sem venda mas com spend: CAC null, margem negativa", () => {
    const r = deriveDetailMetrics({ ...base, revenue: 0, sales: 0 }, FEE_KIWIFY);
    expect(r.costPerSale).toBeNull();
    expect(r.marginPct).toBeNull();
    expect(r.spend).toBeCloseTo(SPEND_CORRETO, 2);
  });

  it("feeRate 0 (sem plataforma): margem = faturamento bruto − investimento", () => {
    const r = deriveDetailMetrics(base, 0);
    expect(r.marginPerSale).toBeCloseTo((FATURAMENTO - SPEND_CORRETO) / VENDAS, 6);
  });
});
