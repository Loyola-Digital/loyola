import { describe, it, expect } from "vitest";
import { mergeCachedAndFreshInsights } from "../services/meta-insights-cache.js";
import type { MetaDailyInsight } from "../services/meta-ads.js";

// Helper: monta uma linha diária mínima com spend explícito.
function day(
  campaign_id: string,
  date_start: string,
  spend: string,
): MetaDailyInsight & { campaign_id: string } {
  return {
    campaign_id,
    date_start,
    date_stop: date_start,
    impressions: "0",
    reach: "0",
    clicks: "0",
    spend,
    ctr: "0",
    cpc: "0",
    cpm: "0",
  };
}

// Soma o spend do jeito que o caller (getCampaignDailyInsightsBulk) faz: por dia.
function totalSpend(rows: MetaDailyInsight[]): number {
  return rows.reduce((s, r) => s + parseFloat(r.spend || "0"), 0);
}

describe("mergeCachedAndFreshInsights", () => {
  it("NÃO duplica dias presentes tanto no cache quanto no refetch (bug do investimento 2x)", () => {
    // Cenário real: campanha 'A' gastou nos dias 10 e 11. Esses 2 dias estão no
    // cache DB (fresh). Mas o range pedido (ex. 01..28) tem dias sem gasto, então
    // a campanha inteira foi refetchada — `fresh` traz os MESMOS dias 10 e 11.
    const cached = [day("A", "2026-02-10", "100.00"), day("A", "2026-02-11", "200.00")];
    const fresh = [day("A", "2026-02-10", "100.00"), day("A", "2026-02-11", "200.00")];

    const merged = mergeCachedAndFreshInsights(cached, fresh);

    // Antes do fix: [...cached, ...fresh] = 4 linhas => spend somado em dobro (600).
    // Depois: 2 linhas => spend correto (300).
    expect(merged).toHaveLength(2);
    expect(totalSpend(merged)).toBe(300);
  });

  it("prefere a linha `fresh` (mais recente) quando há colisão de (campanha, dia)", () => {
    const cached = [day("A", "2026-02-10", "100.00")]; // valor antigo
    const fresh = [day("A", "2026-02-10", "150.00")]; // Meta reajustou atribuição

    const merged = mergeCachedAndFreshInsights(cached, fresh);

    expect(merged).toHaveLength(1);
    expect(totalSpend(merged)).toBe(150);
  });

  it("preserva dias que só existem no cache (campanha não refetchada)", () => {
    // Campanha 'B' estava 100% cacheada e não entrou no refetch → fresh não a traz.
    const cached = [day("B", "2026-02-10", "50.00"), day("B", "2026-02-11", "70.00")];
    const fresh: Array<MetaDailyInsight & { campaign_id?: string }> = [];

    const merged = mergeCachedAndFreshInsights(cached, fresh);

    expect(merged).toHaveLength(2);
    expect(totalSpend(merged)).toBe(120);
  });

  it("combina cache + fresh de campanhas distintas sem colidir entre elas", () => {
    const cached = [day("A", "2026-02-10", "100.00"), day("B", "2026-02-10", "40.00")];
    const fresh = [day("A", "2026-02-10", "100.00"), day("A", "2026-02-12", "80.00")];

    const merged = mergeCachedAndFreshInsights(cached, fresh);

    // A/10 (dedup), B/10 (só cache), A/12 (só fresh) = 3 linhas, 220 no total.
    expect(merged).toHaveLength(3);
    expect(totalSpend(merged)).toBe(220);
  });

  it("mantém o refetch parcial sem perder os dias que só o cache tinha", () => {
    // Refetch trouxe só o dia 10; cache tinha 10 e 11. Resultado deve ter os dois.
    const cached = [day("A", "2026-02-10", "100.00"), day("A", "2026-02-11", "200.00")];
    const fresh = [day("A", "2026-02-10", "100.00")];

    const merged = mergeCachedAndFreshInsights(cached, fresh);

    expect(merged).toHaveLength(2);
    expect(totalSpend(merged)).toBe(300);
  });
});
