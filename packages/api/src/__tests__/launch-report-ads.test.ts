import { describe, it, expect } from "vitest";
import {
  aggregateAdHighlights,
  MIN_PCT_INVEST,
  MIN_RESPONDENTES_FAIXA,
  TOP_TABELA,
  type AdInput,
  type CompradorInput,
  type FaixaPorAd,
} from "../services/launch-report-ads";

/** Story 41.4 — §3.8 e §7.2. */

const CAMP_HOT = "dg-pg04-ago-26--vendas-captacao--2026-07-11--hot--cbo--videos";
const CAMP_COLD = "dg-pg04-ago-26--vendas-captacao--2026-07-11--cold--cbo--videos";

function ad(over: Partial<AdInput> & { adName: string }): AdInput {
  return {
    adId: over.adId ?? over.adName,
    adName: over.adName,
    campaignId: over.campaignId ?? "c1",
    campaignName: over.campaignName ?? CAMP_HOT,
    spendBruto: over.spendBruto ?? 0,
    impressoes: over.impressoes ?? 0,
    cliques: over.cliques ?? 0,
  };
}

function comprador(over: Partial<CompradorInput> & { email: string }): CompradorInput {
  return {
    email: over.email,
    origem: over.origem ?? "Pago",
    publico: over.publico ?? "Quente",
    adName: over.adName ?? null,
    faturamento: over.faturamento ?? 0,
  };
}

const visaoDe = (r: ReturnType<typeof aggregateAdHighlights>, nome: string) =>
  r.visoes.find((v) => v.visao === nome)!;

// ---------------------------------------------------------------------------

describe("AC1 — três visões, mesmo ad_name separado", () => {
  const ads = [
    ad({ adName: "criativo-A", campaignName: CAMP_HOT, spendBruto: 300, impressoes: 10_000, cliques: 200 }),
    ad({ adName: "criativo-A", adId: "a2", campaignName: CAMP_COLD, spendBruto: 200, impressoes: 8000, cliques: 100 }),
  ];

  it("o mesmo criativo aparece nas duas visões, sem somar", () => {
    const r = aggregateAdHighlights({
      ads, compradores: [], invQuente: 300, invFrio: 200, invTotal: 500,
    });
    expect(visaoDe(r, "Quente").tabela).toHaveLength(1);
    expect(visaoDe(r, "Quente").tabela[0]!.spendAjustado).toBeCloseTo(300, 2);
    expect(visaoDe(r, "Frio").tabela[0]!.spendAjustado).toBeCloseTo(200, 2);
  });

  it("na visão Total ele é somado — lá o agrupamento é por nome", () => {
    const r = aggregateAdHighlights({
      ads, compradores: [], invQuente: 300, invFrio: 200, invTotal: 500,
    });
    const total = visaoDe(r, "Total");
    expect(total.tabela).toHaveLength(1);
    expect(total.tabela[0]!.spendAjustado).toBeCloseTo(500, 2);
    expect(total.tabela[0]!.impressoes).toBe(18_000);
  });

  it("o universo de compradores respeita a temperatura da visão", () => {
    const compradores = [
      comprador({ email: "q@x.com", publico: "Quente", adName: "criativo-A", faturamento: 100 }),
      comprador({ email: "f@x.com", publico: "Frio", adName: "criativo-A", faturamento: 200 }),
      comprador({ email: "org@x.com", origem: "Orgânico", adName: "criativo-A", faturamento: 999 }),
    ];
    const r = aggregateAdHighlights({ ads, compradores, invQuente: 300, invFrio: 200, invTotal: 500 });
    expect(visaoDe(r, "Quente").tabela[0]!.vendas).toBe(1);
    expect(visaoDe(r, "Quente").tabela[0]!.faturamento).toBe(100);
    expect(visaoDe(r, "Frio").tabela[0]!.faturamento).toBe(200);
    // Total = pagos quentes + frios; o orgânico NUNCA entra.
    expect(visaoDe(r, "Total").tabela[0]!.vendas).toBe(2);
    expect(visaoDe(r, "Total").tabela[0]!.faturamento).toBe(300);
  });
});

describe("AC2 — reescala fecha com o campaign-level (invariante A6)", () => {
  it("Σ spend ajustado === INV da visão", () => {
    const ads = [
      ad({ adName: "a", spendBruto: 100 }),
      ad({ adName: "b", spendBruto: 300 }),
    ];
    // ad-level soma 400, mas o campaign-level (com imposto) é 455,45
    const r = aggregateAdHighlights({ ads, compradores: [], invQuente: 455.45, invFrio: 0, invTotal: 455.45 });
    const v = visaoDe(r, "Quente");
    expect(v.fator).toBeCloseTo(455.45 / 400, 6);
    expect(v.somaSpendAjustado).toBeCloseTo(455.45, 2);
    expect(Math.abs(v.somaSpendAjustado - v.invVisao)).toBeLessThanOrEqual(1.0);
  });

  it("reescala SEMPRE, mesmo quando o ad-level já bate (fator 1,0 — caso PG04)", () => {
    const ads = [ad({ adName: "a", spendBruto: 500 })];
    const v = visaoDe(
      aggregateAdHighlights({ ads, compradores: [], invQuente: 500, invFrio: 0, invTotal: 500 }),
      "Quente",
    );
    expect(v.fator).toBe(1);
    expect(v.somaSpendAjustado).toBeCloseTo(500, 2);
    expect(v.motivoSkip).toBeNull();
  });

  it("sem ad-level: fator 0 e motivo de skip registrado (caso PG02)", () => {
    const v = visaoDe(
      aggregateAdHighlights({ ads: [], compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000 }),
      "Quente",
    );
    expect(v.fator).toBe(0);
    expect(v.somaSpendAjustado).toBe(0);
    expect(v.motivoSkip).toContain("sem ad-level");
  });

  it("cada visão usa o INV DELA, não o total (é o que o A6 pega)", () => {
    const ads = [
      ad({ adName: "h", campaignName: CAMP_HOT, spendBruto: 100 }),
      ad({ adName: "c", campaignName: CAMP_COLD, spendBruto: 100 }),
    ];
    const r = aggregateAdHighlights({ ads, compradores: [], invQuente: 600, invFrio: 400, invTotal: 1000 });
    expect(visaoDe(r, "Quente").somaSpendAjustado).toBeCloseTo(600, 2);
    expect(visaoDe(r, "Frio").somaSpendAjustado).toBeCloseTo(400, 2);
    expect(visaoDe(r, "Total").somaSpendAjustado).toBeCloseTo(1000, 2);
  });
});

describe("AC3 — métricas por anúncio", () => {
  it("deriva tudo DEPOIS da reescala", () => {
    const ads = [ad({ adName: "a", spendBruto: 100, impressoes: 10_000, cliques: 200 })];
    const compradores = [comprador({ email: "x@x.com", adName: "a", faturamento: 500 })];
    // fator = 2,0 → spend ajustado 200
    const l = visaoDe(
      aggregateAdHighlights({ ads, compradores, invQuente: 200, invFrio: 0, invTotal: 200 }),
      "Quente",
    ).tabela[0]!;

    expect(l.spendAjustado).toBeCloseTo(200, 2);
    expect(l.pctInvest).toBeCloseTo(100, 2);
    expect(l.ctr).toBeCloseTo(2, 4); // 200/10.000 — não muda com a reescala
    expect(l.cpc).toBeCloseTo(1, 4); // 200/200, com o AJUSTADO
    expect(l.cpm).toBeCloseTo(20, 4); // 200/10.000×1000
    expect(l.cpv).toBeCloseTo(200, 2);
    expect(l.roas).toBeCloseTo(2.5, 4); // 500/200
  });

  it("faturamento soma TODAS as linhas do e-mail, inclusive order bump", () => {
    // O comprador já chega com o faturamento consolidado pelo motor (§2.9):
    // captação 100 + order bump 500. Contar só a captação subestimaria o ROAS.
    const ads = [ad({ adName: "a", spendBruto: 100 })];
    const compradores = [comprador({ email: "x@x.com", adName: "a", faturamento: 600 })];
    const l = visaoDe(
      aggregateAdHighlights({ ads, compradores, invQuente: 100, invFrio: 0, invTotal: 100 }),
      "Quente",
    ).tabela[0]!;
    expect(l.faturamento).toBe(600);
    expect(l.roas).toBeCloseTo(6, 4);
  });

  it("divisão por zero devolve 0, não null nem NaN", () => {
    const ads = [ad({ adName: "a", spendBruto: 100, impressoes: 0, cliques: 0 })];
    const l = visaoDe(
      aggregateAdHighlights({ ads, compradores: [], invQuente: 100, invFrio: 0, invTotal: 100 }),
      "Quente",
    ).tabela[0]!;
    for (const v of [l.ctr, l.cpc, l.cpm, l.cpv, l.roas]) {
      expect(v).toBe(0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("AC4 — os 8 rankings e o filtro de escala", () => {
  // 'grande' 60%, 'medio' 39,5%, 'micro' 0,5% — micro fica ABAIXO do limiar.
  const ads = [
    ad({ adName: "grande", spendBruto: 600, impressoes: 100_000, cliques: 1000 }),
    ad({ adName: "medio", spendBruto: 395, impressoes: 50_000, cliques: 900 }),
    ad({ adName: "micro", spendBruto: 5, impressoes: 200, cliques: 20 }),
  ];
  const compradores = [
    comprador({ email: "a@x.com", adName: "grande", faturamento: 1000 }),
    comprador({ email: "b@x.com", adName: "medio", faturamento: 500 }),
    // 'micro' teve uma venda de sorte com ROAS altíssimo
    comprador({ email: "c@x.com", adName: "micro", faturamento: 900 }),
  ];
  const r = aggregateAdHighlights({ ads, compradores, invQuente: 1000, invFrio: 0, invTotal: 1000 });
  const v = visaoDe(r, "Quente");

  it("o anúncio de R$ 10 com venda de sorte NÃO lidera o ranking de ROAS", () => {
    // Sem o filtro de escala, 'micro' teria ROAS 90 e apareceria em primeiro.
    expect(v.maiorRoas.map((l) => l.adName)).not.toContain("micro");
    expect(v.maiorRoas[0]!.adName).toBe("grande");
  });

  it("o filtro é pct_invest >= 1% — micro com 0,5% fica de fora", () => {
    expect(v.escalaveis).toBe(2);
    expect(MIN_PCT_INVEST).toBe(1.0);
  });

  it("exatamente 1% ENTRA (o limiar é inclusivo)", () => {
    const noLimiar = aggregateAdHighlights({
      ads: [ad({ adName: "grande", spendBruto: 990 }), ad({ adName: "exato", spendBruto: 10 })],
      compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000,
    });
    expect(visaoDe(noLimiar, "Quente").escalaveis).toBe(2);
  });

  it("maiorEscala fica FORA do filtro de escala", () => {
    expect(v.maiorEscala!.adName).toBe("grande");

    // ⚠️ A reescala NORMALIZA: com um único anúncio o fator fecha a soma no INV
    // e ele fica com 100% do investimento. Para existir anúncio abaixo de 1% é
    // preciso haver mais de 100 anúncios — que é o caso real de um lançamento
    // com muitos criativos (o PG04 tem 412).
    const pulverizado = aggregateAdHighlights({
      ads: Array.from({ length: 200 }, (_, i) => ad({ adName: `ad${i}`, spendBruto: 5 })),
      compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000,
    });
    const vp = visaoDe(pulverizado, "Quente");
    expect(vp.escalaveis).toBe(0); // cada um tem 0,5%
    expect(vp.maiorEscala).not.toBeNull(); // mas o maior escala continua existindo
    expect(vp.maiorCtr).toEqual([]); // e os rankings de destaque ficam vazios
  });

  it("rankings de 'menor' excluem zeros", () => {
    const comZerado = aggregateAdHighlights({
      ads: [
        ad({ adName: "sem-clique", spendBruto: 500, impressoes: 1000, cliques: 0 }),
        ad({ adName: "com-clique", spendBruto: 500, impressoes: 1000, cliques: 100 }),
      ],
      compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000,
    });
    const vz = visaoDe(comZerado, "Quente");
    // 'sem-clique' tem cpc 0 — não pode ser "o de menor CPC".
    expect(vz.menorCpc.map((l) => l.adName)).toEqual(["com-clique"]);
    // idem para CPV: nenhum teve venda
    expect(vz.menorCpv).toEqual([]);
  });

  it("top 3 em cada ranking", () => {
    const muitos = aggregateAdHighlights({
      ads: Array.from({ length: 10 }, (_, i) =>
        ad({ adName: `ad${i}`, spendBruto: 100, impressoes: 1000, cliques: 10 + i }),
      ),
      compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000,
    });
    expect(visaoDe(muitos, "Quente").maiorCtr).toHaveLength(3);
  });

  it("conta zerados, total e escaláveis", () => {
    expect(v.totalAds).toBe(3);
    expect(v.zerados).toBe(0);
    const semVenda = aggregateAdHighlights({
      ads, compradores: [], invQuente: 1000, invFrio: 0, invTotal: 1000,
    });
    expect(visaoDe(semVenda, "Quente").zerados).toBe(3);
  });

  it("tabela é top 25 por spend ajustado, em ordem decrescente", () => {
    const muitos = aggregateAdHighlights({
      ads: Array.from({ length: 40 }, (_, i) => ad({ adName: `ad${i}`, spendBruto: i + 1 })),
      compradores: [], invQuente: 820, invFrio: 0, invTotal: 820,
    });
    const t = visaoDe(muitos, "Quente").tabela;
    expect(t).toHaveLength(TOP_TABELA);
    expect(t[0]!.adName).toBe("ad39");
    expect(t[0]!.spendAjustado).toBeGreaterThan(t[1]!.spendAjustado);
  });
});

describe("AC5 — Faixa por criativo", () => {
  const ads = [
    ad({ adName: "qualificado", spendBruto: 500 }),
    ad({ adName: "poucos-resp", spendBruto: 500 }),
  ];
  const faixas: FaixaPorAd[] = [
    { adName: "qualificado", match: 20, pctA: 40, pctAB: 70 },
    { adName: "poucos-resp", match: 4, pctA: 99, pctAB: 100 },
  ];

  it("anúncio com menos de 5 respondentes fica fora dos rankings de Faixa", () => {
    const v = visaoDe(
      aggregateAdHighlights({ ads, compradores: [], faixas, invQuente: 1000, invFrio: 0, invTotal: 1000 }),
      "Quente",
    );
    expect(v.maiorPctA.map((l) => l.adName)).toEqual(["qualificado"]);
    expect(v.maiorPctAB.map((l) => l.adName)).toEqual(["qualificado"]);
    expect(MIN_RESPONDENTES_FAIXA).toBe(5);
  });

  it("mas ele continua nos OUTROS rankings e na tabela", () => {
    const v = visaoDe(
      aggregateAdHighlights({ ads, compradores: [], faixas, invQuente: 1000, invFrio: 0, invTotal: 1000 }),
      "Quente",
    );
    expect(v.tabela.map((l) => l.adName)).toContain("poucos-resp");
    expect(v.totalAds).toBe(2);
  });

  it("anúncio sem entrada de Faixa tem match 0 e não entra nesses rankings", () => {
    const v = visaoDe(
      aggregateAdHighlights({
        ads: [ad({ adName: "sem-faixa", spendBruto: 500 })],
        compradores: [], faixas: [], invQuente: 500, invFrio: 0, invTotal: 500,
      }),
      "Quente",
    );
    expect(v.tabela[0]!.match).toBe(0);
    expect(v.maiorPctA).toEqual([]);
  });
});

describe("AC6 — insumos de alerta", () => {
  it("W6 — % de vendas pagas sem ad_name", () => {
    const compradores = [
      comprador({ email: "a@x.com", adName: "x" }),
      comprador({ email: "b@x.com", adName: null }),
      comprador({ email: "c@x.com", adName: null }),
      comprador({ email: "d@x.com", adName: null }),
      // orgânico não entra no denominador
      comprador({ email: "e@x.com", origem: "Orgânico", adName: null }),
    ];
    const r = aggregateAdHighlights({
      ads: [ad({ adName: "x", spendBruto: 100 })],
      compradores, invQuente: 100, invFrio: 0, invTotal: 100,
    });
    expect(r.pctVendasPagasSemAdName).toBeCloseTo(75, 2);
  });

  it("W6 é 0 quando não há venda paga — sem divisão por zero", () => {
    const r = aggregateAdHighlights({ ads: [], compradores: [], invQuente: 0, invFrio: 0, invTotal: 0 });
    expect(r.pctVendasPagasSemAdName).toBe(0);
  });

  it("W3 — spend suspeito é medido sobre o CRU, não o reescalado", () => {
    // Se medisse sobre o ajustado, a reescala mascararia o sintoma.
    const r = aggregateAdHighlights({
      ads: [ad({ adName: "corrompido", spendBruto: 14.96, impressoes: 27_035 })],
      compradores: [], invQuente: 5000, invFrio: 0, invTotal: 5000,
    });
    expect(r.adsComSpendSuspeito).toEqual([
      { adName: "corrompido", spend: 14.96, impressoes: 27_035 },
    ]);
  });

  it("W3 não dispara com spend normal", () => {
    const r = aggregateAdHighlights({
      ads: [ad({ adName: "ok", spendBruto: 500, impressoes: 27_035 })],
      compradores: [], invQuente: 500, invFrio: 0, invTotal: 500,
    });
    expect(r.adsComSpendSuspeito).toEqual([]);
  });
});

describe("comportamento de borda", () => {
  it("ad sem nome cai em '(sem nome)' e não some", () => {
    const r = aggregateAdHighlights({
      ads: [ad({ adName: "" as unknown as string, spendBruto: 100 })],
      compradores: [], invQuente: 100, invFrio: 0, invTotal: 100,
    });
    expect(visaoDe(r, "Quente").tabela[0]!.adName).toBe("(sem nome)");
  });

  it("entrada totalmente vazia não explode", () => {
    const r = aggregateAdHighlights({ ads: [], compradores: [], invQuente: 0, invFrio: 0, invTotal: 0 });
    expect(r.visoes).toHaveLength(3);
    for (const v of r.visoes) {
      expect(v.maiorEscala).toBeNull();
      expect(v.tabela).toEqual([]);
      expect(v.totalAds).toBe(0);
    }
  });
});
