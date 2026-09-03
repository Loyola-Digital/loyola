import { describe, it, expect } from "vitest";
import {
  METRICAS,
  CATEGORIAS,
  metricasPadrao,
  contarMarcadas,
  contarPorCategoria,
  buscarMetricas,
  categoriasIndisponiveis,
  valorDaMetrica,
  maximosPorMetrica,
  larguraDaBarra,
  corDaBarra,
  metricaPorId,
} from "../metricas-do-criativo";
import { aggregateCreativesByName } from "../top-creatives";
import type { AggregatedCreative } from "../top-creatives";
import type { TopPerformerAd } from "@/lib/hooks/use-traffic-analytics";

const criativo = (over: Partial<AggregatedCreative>): AggregatedCreative =>
  ({
    name: "c",
    ids: ["a1"],
    spend: 100,
    impressions: 10_000,
    clicks: 200,
    reach: 8_000,
    ctr: 2,
    cpc: 0.5,
    creative: null,
    hookRate: null,
    views3s: null,
    views75: null,
    holdRate: null,
    cpm: null,
    linkClicks: null,
    ctrLink: null,
    cpcLink: null,
    amostraBaixa: false,
    leadsPagos: 0,
    leadsOrg: 0,
    leadsSemTrack: 0,
    cplPago: null,
    cplQualified: null,
    leadsLegacy: 0,
    salesLegacy: 0,
    roasLegacy: null,
    ...over,
  }) as AggregatedCreative;

describe("badge — o botão é a soma dos checkboxes (AC3)", () => {
  it("abre com CPM, Hook, Hold e CTR marcados — o 'Métricas (4)' do relato", () => {
    const padrao = metricasPadrao();
    expect(padrao.sort()).toEqual(["cpm", "ctrLink", "hookRate", "holdRate"].sort());
    expect(contarMarcadas(padrao)).toBe(4);
  });

  it("o badge do botão é a soma dos badges das categorias", () => {
    const padrao = metricasPadrao();
    const soma = CATEGORIAS.reduce((s, c) => s + contarPorCategoria(padrao, c.id), 0);
    expect(soma).toBe(contarMarcadas(padrao));
  });

  it("id desconhecido não infla o badge", () => {
    expect(contarMarcadas(["cpm", "inexistente"])).toBe(1);
  });

  it("categoria sem métrica marcada conta zero — e zero não vira badge na tela", () => {
    expect(contarPorCategoria(metricasPadrao(), "vendas")).toBe(0);
    expect(contarPorCategoria(metricasPadrao(), "funil")).toBe(2);
  });
});

describe("busca de métrica", () => {
  it("termo vazio devolve todas", () => {
    expect(buscarMetricas("")).toHaveLength(METRICAS.length);
  });

  it("casa por substring, sem diferenciar maiúscula", () => {
    expect(buscarMetricas("hook")).toEqual(["hookRate"]);
    expect(buscarMetricas("RATE").sort()).toEqual(["holdRate", "hookRate"]);
  });
});

describe("categoriasIndisponiveis — desabilitar não é esconder (AC5)", () => {
  it("sem planilha de leads, a categoria LEADS traz o motivo", () => {
    const fora = categoriasIndisponiveis({ temPlanilhaDeLeads: false, temPlanilhaDeVendas: true });
    expect(fora.leads).toContain("planilha de leads");
    expect(fora.vendas).toBeUndefined();
  });

  it("sem planilha de vendas, VENDAS e TAXA DE CONVERSÃO caem juntas", () => {
    const fora = categoriasIndisponiveis({ temPlanilhaDeLeads: true, temPlanilhaDeVendas: false });
    expect(fora.vendas).toBeTruthy();
    expect(fora.conversao).toBeTruthy();
  });

  it("com as duas fontes, nada fica indisponível", () => {
    expect(
      Object.keys(categoriasIndisponiveis({ temPlanilhaDeLeads: true, temPlanilhaDeVendas: true })),
    ).toHaveLength(0);
  });
});

describe("valorDaMetrica — ausência atravessa a cadeia inteira", () => {
  it("CPM sai do agregado, não recalculado no card", () => {
    expect(valorDaMetrica("cpm", criativo({ cpm: 10 }))).toBe(10);
  });

  it("taxa de conversão precisa de cliques no link, não de cliques totais", () => {
    // `clicks` é 200 no fixture. Se a taxa usasse ele, daria 5%.
    const c = criativo({ linkClicks: 50, clicks: 200 });
    expect(valorDaMetrica("txConversao", c, { conversoes: 10 })).toBe(20);
  });

  it("sem cliques no link medidos, a taxa é null — não a taxa sobre cliques totais", () => {
    const c = criativo({ linkClicks: null, clicks: 200 });
    expect(valorDaMetrica("txConversao", c, { conversoes: 10 })).toBeNull();
  });

  it("ROAS e CAC exigem investimento positivo", () => {
    expect(valorDaMetrica("roas", criativo({ spend: 0 }), { faturamento: 500 })).toBeNull();
    expect(valorDaMetrica("cac", criativo({ spend: 0 }), { vendas: 5 })).toBeNull();
    expect(valorDaMetrica("roas", criativo({ spend: 100 }), { faturamento: 500 })).toBe(5);
    expect(valorDaMetrica("cac", criativo({ spend: 100 }), { vendas: 5 })).toBe(20);
  });

  it("métrica desconhecida devolve null em vez de quebrar o card", () => {
    expect(valorDaMetrica("nao-existe", criativo({}))).toBeNull();
  });
});

describe("barras — comparam os criativos exibidos entre si (AC7)", () => {
  const lista = [criativo({ name: "a", cpm: 10 }), criativo({ name: "b", cpm: 40 })];
  const max = maximosPorMetrica(["cpm"], lista, () => ({}));

  it("o máximo é o maior da lista", () => {
    expect(max.get("cpm")).toBe(40);
  });

  it("o maior enche a barra; o resto é proporcional", () => {
    expect(larguraDaBarra(40, max.get("cpm"))).toBe(100);
    expect(larguraDaBarra(10, max.get("cpm"))).toBe(25);
  });

  it("valor null não desenha barra — e não é zero", () => {
    // Zero é medição ("ninguém clicou"); null é ausência ("não medimos").
    expect(larguraDaBarra(null, 40)).toBeNull();
    expect(larguraDaBarra(0, 40)).toBe(0);
  });

  it("sem máximo (ninguém tem a métrica) não há barra", () => {
    expect(larguraDaBarra(10, undefined)).toBeNull();
    expect(larguraDaBarra(10, 0)).toBeNull();
  });

  it("valores nulos não entram no cálculo do máximo", () => {
    const m = maximosPorMetrica(["cpm"], [criativo({ cpm: null }), criativo({ cpm: 7 })], () => ({}));
    expect(m.get("cpm")).toBe(7);
  });
});

describe("cor da barra — meta, custo e neutra", () => {
  const hook = metricaPorId("hookRate")!;
  const cpm = metricaPorId("cpm")!;
  const imp = metricaPorId("impressions")!;

  it("métrica com meta fica verde a partir dela", () => {
    expect(corDaBarra(hook, 25)).toBe("meta-ok");
    expect(corDaBarra(hook, 24.99)).toBe("meta-abaixo");
  });

  it("métrica de custo tem cor própria — barra cheia ali não é bom", () => {
    expect(corDaBarra(cpm, 50)).toBe("custo");
    expect(cpm.menorEhMelhor).toBe(true);
  });

  it("métrica sem meta nem custo é neutra", () => {
    expect(corDaBarra(imp, 1000)).toBe("neutra");
  });

  it("valor ausente é sempre neutro — nunca 'abaixo da meta'", () => {
    // Pintar ausência de vermelho acusa o criativo de um desempenho que
    // ninguém mediu.
    expect(corDaBarra(hook, null)).toBe("neutra");
  });
});

// ============================================================
// Agregação (AC8/AC11) — os números que o painel passa a mostrar
// ============================================================

const ad = (over: Partial<TopPerformerAd>): TopPerformerAd =>
  ({
    campaignId: "a1",
    campaignName: "Criativo X",
    spend: 100,
    impressions: 1000,
    clicks: 50,
    reach: 900,
    frequency: 1,
    ctr: 5,
    cpc: 2,
    cpm: 100,
    leads: null,
    cpl: null,
    linkClicks: null,
    landingPageViews: null,
    connectRate: null,
    qualifiedLeads: null,
    cplQualified: null,
    qualificationRate: null,
    sales: null,
    revenue: null,
    costPerSale: null,
    roas: null,
    conversionRate: null,
    adsetName: "conj",
    parentCampaignName: "camp",
    creative: null,
    videoMetrics: null,
    ...over,
  }) as TopPerformerAd;

describe("Hold Rate agregado — do GRUPO, não do anúncio líder (AC8/AC10)", () => {
  it("soma views75 e views3s só dos anúncios que têm vídeo", () => {
    const [g] = aggregateCreativesByName([
      ad({ campaignId: "a1", spend: 900, videoMetrics: { p25: 0, p50: 0, p75: 300, p100: 0, thruplay: 0, views3s: 1000 } }),
      ad({ campaignId: "a2", spend: 100, videoMetrics: { p25: 0, p50: 0, p75: 100, p100: 0, thruplay: 0, views3s: 1000 } }),
      // Estático: não tem vídeo, e não pode entrar em nenhuma das pontas.
      ad({ campaignId: "a3", spend: 10, videoMetrics: null }),
    ]);
    // (300 + 100) / (1000 + 1000) = 20%
    expect(g.views75).toBe(400);
    expect(g.holdRate).toBeCloseTo(20, 5);
  });

  it("NÃO é o hold do anúncio líder — é isso que a 29.64 pagou caro", () => {
    // O líder (maior gasto) tem hold de 30%; o grupo tem 20%. Se a agregação
    // usasse `videoMetrics` do líder, este teste passaria com 30.
    const [g] = aggregateCreativesByName([
      ad({ campaignId: "a1", spend: 900, videoMetrics: { p25: 0, p50: 0, p75: 300, p100: 0, thruplay: 0, views3s: 1000 } }),
      ad({ campaignId: "a2", spend: 100, videoMetrics: { p25: 0, p50: 0, p75: 100, p100: 0, thruplay: 0, views3s: 1000 } }),
    ]);
    expect(g.holdRate).not.toBeCloseTo(30, 1);
    expect(g.holdRate).toBeCloseTo(20, 5);
  });

  it("nenhum anúncio com vídeo → null, nunca 0", () => {
    const [g] = aggregateCreativesByName([ad({ videoMetrics: null })]);
    expect(g.holdRate).toBeNull();
    expect(g.views75).toBeNull();
  });
});

describe("CPM agregado — soma antes de dividir", () => {
  it("é Σ spend ÷ Σ impressões × 1000, não a média dos CPMs", () => {
    const [g] = aggregateCreativesByName([
      ad({ campaignId: "a1", spend: 100, impressions: 10_000, cpm: 10 }),
      // CPM de 1000 num anúncio de 10 impressões: a média dos CPMs daria 505.
      ad({ campaignId: "a2", spend: 10, impressions: 10, cpm: 1000 }),
    ]);
    expect(g.cpm).toBeCloseTo((110 / 10_010) * 1000, 5);
    expect(g.cpm).toBeLessThan(20);
  });
});

describe("cliques no link — diferente de cliques totais (AC11)", () => {
  it("soma linkClicks e deriva CTR/CPC deles", () => {
    const [g] = aggregateCreativesByName([
      ad({ campaignId: "a1", spend: 100, impressions: 1000, clicks: 500, linkClicks: 50 }),
    ]);
    expect(g.linkClicks).toBe(50);
    // CTR de link = 5%; o CTR de todos os cliques seria 50%.
    expect(g.ctrLink).toBeCloseTo(5, 5);
    expect(g.ctr).toBeCloseTo(50, 5);
    expect(g.cpcLink).toBeCloseTo(2, 5);
  });

  it("nenhum anúncio com linkClicks → null, nunca 0", () => {
    // A Meta não devolve inline_link_clicks para todo objetivo de campanha.
    // Zerar transformaria "não medido" em "ninguém clicou".
    const [g] = aggregateCreativesByName([ad({ linkClicks: null })]);
    expect(g.linkClicks).toBeNull();
    expect(g.ctrLink).toBeNull();
    expect(g.cpcLink).toBeNull();
  });
});
