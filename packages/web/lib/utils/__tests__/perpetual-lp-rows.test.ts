import { describe, it, expect } from "vitest";
import { buildLpRows, sortLpRows, UNRESOLVED_LP_KEY, type LpAdInput } from "../perpetual-lp-rows";
import { deriveDetailMetrics } from "../perpetual-detail-metrics";

const ad = (over: Partial<LpAdInput> & { campaignId: string }): LpAdInput => ({
  spend: 100, impressions: 1000, clicks: 50, linkClicks: 40, revenue: 500, sales: 2, ...over,
});

describe("buildLpRows — Story 29.40", () => {
  describe("AC6 — reconciliação com o Detalhamento (a invariante da story)", () => {
    // Esta é a razão do módulo existir: a tabela de LPs e o Detalhamento no
    // modo Criativo somam a MESMA população. Se divergirem, uma das duas está
    // mentindo, e o gestor não tem como saber qual.
    const ads = [
      ad({ campaignId: "a1", spend: 120.5, revenue: 800, sales: 3 }),
      ad({ campaignId: "a2", spend: 80.25, revenue: 400, sales: 1 }),
      ad({ campaignId: "a3", spend: 55.75, revenue: 0, sales: 0 }),
      ad({ campaignId: "a4", spend: 200, revenue: 1200, sales: 5 }),
    ];
    const links = {
      a1: "https://x.com.br/lp-a?utm_source=meta",
      a2: "https://www.x.com.br/lp-a/",
      a3: "https://x.com.br/lp-b",
      a4: null, // sem link → bucket não resolvido
    };

    it("investimento total das linhas === investimento total dos anúncios", () => {
      const rows = buildLpRows(ads, links, [], 0.1);
      const somaLinhas = rows.reduce((s, r) => s + r.spend, 0);
      const somaAds = ads.reduce((s, a) => s + a.spend, 0);
      expect(somaLinhas).toBeCloseTo(somaAds, 10);
      expect(somaLinhas).toBeCloseTo(456.5, 10);
    });

    it("faturamento e vendas também fecham", () => {
      const rows = buildLpRows(ads, links, [], 0.1);
      expect(rows.reduce((s, r) => s + r.revenue, 0)).toBeCloseTo(2400, 10);
      expect(rows.reduce((s, r) => s + r.sales, 0)).toBe(9);
    });

    it("a linha não resolvida ENTRA na soma — omiti-la quebraria a reconciliação", () => {
      const rows = buildLpRows(ads, links, [], 0.1);
      const unresolved = rows.find((r) => r.isUnresolved);
      expect(unresolved).toBeDefined();
      expect(unresolved!.spend).toBe(200);
      // sem ela, a soma daria 256,5 e não 456,5 — 44% do investimento sumido
      const semUnresolved = rows.filter((r) => !r.isUnresolved).reduce((s, r) => s + r.spend, 0);
      expect(semUnresolved).not.toBeCloseTo(456.5, 10);
    });

    it("nenhum anúncio é contado duas vezes", () => {
      const rows = buildLpRows(ads, links, [], 0.1);
      // 2 LPs reais (lp-a com a1+a2, lp-b com a3) + 1 bucket = 3 linhas
      expect(rows).toHaveLength(3);
    });
  });

  describe("AC2 — agrupamento pela identidade da LP", () => {
    it("UTM e www não separam a mesma página", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1", spend: 10 }), ad({ campaignId: "a2", spend: 20 })],
        { a1: "https://x.com.br/lp?utm_source=meta", a2: "https://www.x.com.br/lp/" },
        [], 0,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].spend).toBe(30);
      expect(rows[0].key).toBe("x.com.br/lp");
    });

    it("paths distintos permanecem linhas distintas", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1" }), ad({ campaignId: "a2" })],
        { a1: "https://x.com.br/lp-a", a2: "https://x.com.br/lp-b" },
        [], 0,
      );
      expect(rows).toHaveLength(2);
    });
  });

  describe("AC4 — aritmética idêntica à do Detalhamento", () => {
    it("as métricas da linha batem com deriveDetailMetrics sobre os somatórios", () => {
      const ads = [
        ad({ campaignId: "a1", spend: 100, impressions: 1000, clicks: 50, linkClicks: 40, revenue: 600, sales: 2 }),
        ad({ campaignId: "a2", spend: 300, impressions: 3000, clicks: 150, linkClicks: 120, revenue: 900, sales: 4 }),
      ];
      const feeRate = 0.1;
      const rows = buildLpRows(ads, { a1: "https://x.com.br/lp", a2: "https://x.com.br/lp" }, [], feeRate);
      const esperado = deriveDetailMetrics(
        { spend: 400, impressions: 4000, clicks: 200, linkClicks: 160, revenue: 1500, sales: 6 },
        feeRate,
      );
      expect(rows[0].margin).toBeCloseTo(esperado.margin, 10);
      expect(rows[0].marginPct).toBeCloseTo(esperado.marginPct!, 10);
      expect(rows[0].costPerSale).toBeCloseTo(esperado.costPerSale!, 10);
      expect(rows[0].roas).toBeCloseTo(esperado.roas!, 10);
    });

    it("margem é receita LÍQUIDA menos investimento (decisão do Epic 29)", () => {
      // 1000 bruto, fee 10% → 900 líquido; menos 400 de investimento = 500
      const rows = buildLpRows(
        [ad({ campaignId: "a1", spend: 400, revenue: 1000, sales: 5 })],
        { a1: "https://x.com.br/lp" }, [], 0.1,
      );
      expect(rows[0].margin).toBeCloseTo(500, 10);
    });

    it("ROAS usa o faturamento BRUTO no numerador", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1", spend: 400, revenue: 1000, sales: 5 })],
        { a1: "https://x.com.br/lp" }, [], 0.1,
      );
      expect(rows[0].roas).toBeCloseTo(2.5, 10); // 1000/400, não 900/400
    });

    it("taxas são re-derivadas dos somatórios, nunca média das taxas", () => {
      // a1 ROAS 10, a2 ROAS 1. Média das taxas = 5,5. Correto = 1100/200 = 5,5?
      // Não: usa valores que distinguem. a1: 100→1000 (10x), a2: 300→300 (1x).
      // média = 5,5 · correto = 1300/400 = 3,25
      const rows = buildLpRows(
        [
          ad({ campaignId: "a1", spend: 100, revenue: 1000, sales: 1 }),
          ad({ campaignId: "a2", spend: 300, revenue: 300, sales: 1 }),
        ],
        { a1: "https://x.com.br/lp", a2: "https://x.com.br/lp" }, [], 0,
      );
      expect(rows[0].roas).toBeCloseTo(3.25, 10);
      expect(rows[0].roas).not.toBeCloseTo(5.5, 2);
    });

    it("CAC é null quando não há vendas — nunca zero, nunca infinito", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1", spend: 100, revenue: 0, sales: 0 })],
        { a1: "https://x.com.br/lp" }, [], 0,
      );
      expect(rows[0].costPerSale).toBeNull();
    });

    it("ROAS é null quando não há investimento", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1", spend: 0, revenue: 500, sales: 1 })],
        { a1: "https://x.com.br/lp" }, [], 0,
      );
      expect(rows[0].roas).toBeNull();
    });
  });

  describe("AC5 — as duas causas de não-resolução são distinguidas", () => {
    it("separa 'sem link na Meta' de 'fora do cache'", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1" }), ad({ campaignId: "a2" })],
        { a1: null }, // a1 no cache sem URL; a2 nem aparece
        ["a2"],
        0,
      );
      const u = rows.find((r) => r.isUnresolved)!;
      expect(u.semLinkNaMeta).toBe(1);
      expect(u.foraDoCache).toBe(1);
    });

    it("URL malformada cai no bucket, não vira LP própria", () => {
      const rows = buildLpRows(
        [ad({ campaignId: "a1" })],
        { a1: "não é uma url" }, [], 0,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].isUnresolved).toBe(true);
    });
  });

  describe("bordas", () => {
    it("lista vazia devolve lista vazia", () => {
      expect(buildLpRows([], {}, [], 0)).toEqual([]);
    });

    it("mapa de links vazio joga tudo no bucket, sem perder investimento", () => {
      const ads = [ad({ campaignId: "a1", spend: 10 }), ad({ campaignId: "a2", spend: 20 })];
      const rows = buildLpRows(ads, {}, [], 0);
      expect(rows).toHaveLength(1);
      expect(rows[0].spend).toBe(30);
    });
  });
});

describe("sortLpRows — Story 29.40 (AC3)", () => {
  const mk = (key: string, spend: number, unresolved = false) => ({
    key, url: null, isUnresolved: unresolved, semLinkNaMeta: 0, foraDoCache: 0,
    revenue: 0, sales: 0, spend, cpc: 0, cpm: 0, roas: null, costPerSale: null,
    margin: 0, marginPct: null, marginPerSale: null, hookRate: null, holdRate: null, bodyConversion: null,
  });

  it("ordena o conjunto inteiro por investimento decrescente", () => {
    const rows = [mk("a", 10), mk("b", 300), mk("c", 50)];
    expect(sortLpRows(rows, "spend", "desc").map((r) => r.key)).toEqual(["b", "c", "a"]);
  });

  it("'Sem link resolvido' vai para o fim mesmo com o maior investimento", () => {
    // Ela não compete com as LPs reais — é o resto, não uma opção de escala.
    const rows = [mk("a", 10), mk(UNRESOLVED_LP_KEY, 9999, true), mk("c", 50)];
    const sorted = sortLpRows(rows, "spend", "desc");
    expect(sorted[sorted.length - 1].key).toBe(UNRESOLVED_LP_KEY);
    expect(sorted[0].key).toBe("c");
  });

  it("nulls vão para o fim em desc, não para o topo", () => {
    const rows = [
      { ...mk("a", 1), roas: 2 },
      { ...mk("b", 1), roas: null },
      { ...mk("c", 1), roas: 5 },
    ];
    expect(sortLpRows(rows, "roas", "desc").map((r) => r.key)).toEqual(["c", "a", "b"]);
  });

  it("não muta o array recebido", () => {
    const rows = [mk("a", 10), mk("b", 300)];
    const antes = rows.map((r) => r.key);
    sortLpRows(rows, "spend", "desc");
    expect(rows.map((r) => r.key)).toEqual(antes);
  });
});
