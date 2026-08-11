import { describe, expect, it } from "vitest";
import { deriveDailyMetrics } from "@/lib/utils/perpetual-daily-metrics";
import { deriveDetailMetrics } from "@/lib/utils/perpetual-detail-metrics";

/**
 * Gate QA da Story 29.51 — paridade entre o Quadro de Dados Diários e o
 * Detalhamento por entidade.
 *
 * O AC4 da 29.51 AFIRMA que "os números do dia batem com os da entidade para o
 * mesmo recorte" e usa isso para justificar a base de cliques compartilhada.
 * A afirmação estava correta na implementação, mas não havia teste que a
 * travasse: os dois módulos calculam CPC/CPM/ROAS/CAC em arquivos separados, e
 * nada impediria uma refatoração futura de mudar a regra em um só. A
 * divergência apareceria em produção como "o CPC do dia não bate com o do
 * criativo" — o tipo de erro que o gestor descobre antes do time.
 *
 * Estes testes são a trava. Se um dos módulos mudar a fórmula, quebram aqui.
 */

const feeRate = 0.0999; // taxa de plataforma; só afeta margem, não as de custo

describe("paridade Quadro Diário ⇄ Detalhamento (Story 29.51 AC4)", () => {
  const base = {
    spend: 1138.3, // já tributado nos DOIS módulos
    impressions: 50_000,
    clicks: 800,
    linkClicks: 500,
    revenue: 5000,
    sales: 10,
  };

  const detail = deriveDetailMetrics(base, feeRate);
  const daily = deriveDailyMetrics({
    spend: base.spend,
    revenue: base.revenue,
    margin: base.revenue * (1 - feeRate) - base.spend,
    salesCount: base.sales,
    impressions: base.impressions,
    linkClicks: base.linkClicks,
    clicks: base.clicks,
    lpViews: 400,
  });

  it("CPC é idêntico nos dois módulos", () => {
    expect(daily.cpc).toBe(detail.cpc);
  });

  it("CPM é idêntico nos dois módulos", () => {
    expect(daily.cpm).toBe(detail.cpm);
  });

  it("ROAS é idêntico nos dois módulos", () => {
    expect(daily.roas).toBe(detail.roas);
  });

  it("CAC (costPerSale no Detalhamento) é idêntico", () => {
    expect(daily.cac).toBe(detail.costPerSale);
  });

  it("Margem % é idêntica quando a margem de entrada é a mesma", () => {
    expect(daily.marginPct).toBe(detail.marginPct);
  });

  it("a base de cliques é a mesma regra — cai para cliques totais junto", () => {
    const semLink = { ...base, linkClicks: 0 };
    const d = deriveDetailMetrics(semLink, feeRate);
    const q = deriveDailyMetrics({
      spend: semLink.spend,
      revenue: semLink.revenue,
      margin: 0,
      salesCount: semLink.sales,
      impressions: semLink.impressions,
      linkClicks: 0,
      clicks: semLink.clicks,
      lpViews: 400,
    });
    expect(q.costClicks).toBe(semLink.clicks);
    expect(q.cpc).toBe(d.cpc);
  });
});

describe("divergência DELIBERADA no caso-zero", () => {
  // Não é bug: é a 29.51 AC5. O Detalhamento devolve 0 quando falta base, o
  // Quadro Diário devolve null → a UI mostra "—". "0" lê-se como "a métrica é
  // zero"; "—" lê-se como "não há base para calcular". Este teste documenta a
  // diferença para que ninguém a "conserte" achando que é descuido.
  const semBase = {
    spend: 100, impressions: 0, clicks: 0, linkClicks: 0, revenue: 0, sales: 0,
  };

  const detail = deriveDetailMetrics(semBase, 0.0999);
  const daily = deriveDailyMetrics({
    spend: 100, revenue: 0, margin: 0, salesCount: 0,
    impressions: 0, linkClicks: 0, clicks: 0, lpViews: 0,
  });

  it("Detalhamento devolve 0 para CPC/CPM sem base", () => {
    expect(detail.cpc).toBe(0);
    expect(detail.cpm).toBe(0);
  });

  it("Quadro Diário devolve null para CPC/CPM sem base", () => {
    expect(daily.cpc).toBeNull();
    expect(daily.cpm).toBeNull();
  });
});
