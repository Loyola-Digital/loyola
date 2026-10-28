import { describe, it, expect } from "vitest";
import {
  metaRow,
  googleRow,
  buildCampaignRows,
  sortRows,
  totalSpend,
  campanhasDoGoogleNaRegua,
  consultasDoDetalhamento,
  dimensaoDoFiltro,
  dimensoesHabilitadas,
  linhasDoFiltro,
  mostraAvisoDoGoogle,
  rodapeDoFiltro,
  DICA_DO_GOOGLE_SO_CAMPANHA,
  type MetaEntityInput,
  type GoogleCampaignInput,
} from "../lyrio-detail-rows";

const meta = (over: Partial<MetaEntityInput> = {}): MetaEntityInput => ({
  campaignId: "120245795896940452",
  campaignName: "engajamento_lyrio_2026-06_cold",
  spend: 1121.5,
  impressions: 100_000,
  clicks: 2_000,
  linkClicks: 1_000,
  ...over,
});

const google = (over: Partial<GoogleCampaignInput> = {}): GoogleCampaignInput => ({
  id: "g-1",
  name: "app_lyrio_search",
  status: "ENABLED",
  spend: 500,
  impressions: 50_000,
  clicks: 800,
  ...over,
});

describe("metaRow", () => {
  /**
   * A regra central do módulo. O spend chega TRIBUTADO do backend; qualquer
   * multiplicação aqui produziria spend × 1,1215² — o bug da Story 29.24.
   */
  it("não reaplica o imposto do Meta sobre o spend", () => {
    expect(metaRow(meta({ spend: 1121.5 })).spend).toBe(1121.5);
  });

  it("CPC e CTR usam cliques no link quando existem", () => {
    const r = metaRow(meta({ spend: 1000, clicks: 2000, linkClicks: 500, impressions: 100_000 }));
    expect(r.clicks).toBe(500);
    expect(r.cpc).toBe(2); // 1000 / 500, não 1000 / 2000
    expect(r.ctr).toBeCloseTo(0.5, 10); // 500 / 100000 × 100
  });

  it("sem cliques no link, Cliques/CTR/CPC são null (“—”) — NÃO caem para cliques totais (Story 29.77)", () => {
    // Diferencial: com o fallback da 42.5 de volta isto dava clicks 400,
    // CTR 4% e CPC 2,50. A regra do produto (shared `clique-no-link`, 18.78)
    // é sem fallback, e as três colunas precisam concordar entre si.
    for (const linkClicks of [0, null, undefined]) {
      const r = metaRow(meta({ spend: 1000, clicks: 400, linkClicks, impressions: 10_000 }));
      expect(r.clicks).toBeNull();
      expect(r.ctr).toBeNull();
      expect(r.cpc).toBeNull();
    }
  });

  it("CTR e CPC saem das MESMAS funções do shared que o Perpétuo usa", async () => {
    const { ctrDeLink, cpcDeLink } = await import("@loyola-x/shared/src/clique-no-link");
    const r = metaRow(meta({ spend: 1000, clicks: 2000, linkClicks: 500, impressions: 100_000 }));
    expect(r.ctr).toBe(ctrDeLink(500, 100_000));
    expect(r.cpc).toBe(cpcDeLink(500, 1000));
  });

  it("CPM é por mil impressões", () => {
    expect(metaRow(meta({ spend: 1000, impressions: 100_000 })).cpm).toBe(10);
  });

  it("sem impressões, CTR é null e não NaN nem zero", () => {
    expect(metaRow(meta({ impressions: 0 })).ctr).toBeNull();
  });

  it("Hook e Hold saem das métricas de vídeo; sem vídeo ficam null", () => {
    const comVideo = metaRow(meta({ impressions: 100_000, videoViews3s: 30_000, videoViews75: 6_000 }));
    expect(comVideo.hookRate).toBeCloseTo(30, 10);
    expect(comVideo.holdRate).toBeCloseTo(20, 10);

    const semVideo = metaRow(meta());
    expect(semVideo.hookRate).toBeNull();
    expect(semVideo.holdRate).toBeNull();
  });

  it("linha da Meta não expõe status nesta tela", () => {
    expect(metaRow(meta()).status).toBeNull();
  });
});

describe("googleRow", () => {
  /** O imposto é da Meta. Somá-lo ao Google inflaria o investimento em 13,8%. */
  it("não aplica imposto do Meta no spend do Google", () => {
    expect(googleRow(google({ spend: 500 })).spend).toBe(500);
  });

  it("Story 42.16 (D16) — CTR, CPC e CPM RECALCULADOS da soma na régua de SP (não mais copiados da API)", () => {
    const r = googleRow(google({ spend: 500, impressions: 50_000, clicks: 800 }));
    expect(r.ctr).toBeCloseTo(1.6, 10);
    expect(r.cpc).toBeCloseTo(0.625, 10);
    expect(r.cpm).toBeCloseTo(10, 10);
  });

  it("Story 42.16 — divisão por zero vira null (\"—\"), nunca Infinity nem 0", () => {
    const r = googleRow(google({ spend: 12, impressions: 0, clicks: 0 }));
    expect(r).toMatchObject({ ctr: null, cpc: null, cpm: null });
  });

  it("Hook e Hold ficam null — o Google reporta retenção em quartis", () => {
    const r = googleRow(google());
    expect(r.hookRate).toBeNull();
    expect(r.holdRate).toBeNull();
  });

  it("preserva o status da campanha", () => {
    expect(googleRow(google({ status: "PAUSED" })).status).toBe("PAUSED");
  });
});

describe("buildCampaignRows", () => {
  it("junta as duas plataformas marcando a origem de cada linha", () => {
    const rows = buildCampaignRows([meta(), meta({ campaignId: "b" })], [google()]);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.platform === "meta")).toHaveLength(2);
    expect(rows.filter((r) => r.platform === "google")).toHaveLength(1);
  });

  it("soma de investimento das duas plataformas, sem imposto duplicado", () => {
    const rows = buildCampaignRows([meta({ spend: 1121.5 })], [google({ spend: 500 })]);
    expect(totalSpend(rows)).toBeCloseTo(1621.5, 10);
  });

  it("sem campanha de uma das plataformas, a outra segue inteira", () => {
    expect(buildCampaignRows([], [google()])).toHaveLength(1);
    expect(buildCampaignRows([meta()], [])).toHaveLength(1);
    expect(buildCampaignRows([], [])).toEqual([]);
  });
});

describe("sortRows", () => {
  const rows = buildCampaignRows(
    [
      meta({ campaignId: "a", campaignName: "Alfa", spend: 300 }),
      meta({ campaignId: "b", campaignName: "Beta", spend: 100 }),
    ],
    [google({ id: "c", name: "Gama", spend: 200 })],
  );

  it("ordena por número nas duas direções", () => {
    expect(sortRows(rows, "spend", "desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(sortRows(rows, "spend", "asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("ordena por nome respeitando acentuação pt-BR", () => {
    const comAcento = buildCampaignRows(
      [meta({ campaignId: "1", campaignName: "Ávila" }), meta({ campaignId: "2", campaignName: "Bravo" })],
      [],
    );
    expect(sortRows(comAcento, "name", "asc").map((r) => r.name)).toEqual(["Ávila", "Bravo"]);
  });

  /** Linha sem dado é desconhecida, não "a pior" — vai pro fim nas duas direções. */
  it("null vai para o fim tanto em asc quanto em desc", () => {
    const mistas = buildCampaignRows(
      [
        meta({ campaignId: "com", impressions: 100_000, videoViews3s: 30_000, videoViews75: 6_000 }),
        meta({ campaignId: "sem" }),
      ],
      [],
    );
    expect(sortRows(mistas, "hookRate", "desc").map((r) => r.id)).toEqual(["com", "sem"]);
    expect(sortRows(mistas, "hookRate", "asc").map((r) => r.id)).toEqual(["com", "sem"]);
  });

  it("não muta o array original", () => {
    const antes = rows.map((r) => r.id);
    sortRows(rows, "spend", "asc");
    expect(rows.map((r) => r.id)).toEqual(antes);
  });
});

describe("Story 42.16 (AC4f, PO-03) — campanhasDoGoogleNaRegua", () => {
  const vinculadas = [
    { id: "g-1", name: "app_lyrio_search" },
    { id: "g-2", name: "app_lyrio_uac" },
    { id: "g-3", name: "app_lyrio_parada" },
  ];
  const porCampanha = new Map([
    ["g-1", { spend: 100, impressions: 10_000, clicks: 200 }],
    ["g-2", { spend: 0, impressions: 0, clicks: 0 }],
  ]);
  it("o nome vem do vínculo da etapa; as métricas da régua; o status da consulta de hoje (só o status)", () => {
    const r = campanhasDoGoogleNaRegua(vinculadas, porCampanha, new Map([["g-1", "ENABLED"]]));
    expect(r).toEqual([{ id: "g-1", name: "app_lyrio_search", status: "ENABLED", spend: 100, impressions: 10_000, clicks: 200 }]);
  });
  it("sem entrega na janela (tudo zero) ou sem consulta, a campanha não vira linha", () => {
    expect(campanhasDoGoogleNaRegua(vinculadas, porCampanha, new Map()).map((c) => c.id)).toEqual(["g-1"]);
  });
  it("sem status conhecido (a consulta de status falhou), a linha segue com status null", () => {
    expect(campanhasDoGoogleNaRegua(vinculadas, porCampanha, new Map())[0].status).toBeNull();
  });
  it("uma campanha só com clique (sem gasto) tem entrega e entra", () => {
    const r = campanhasDoGoogleNaRegua(vinculadas, new Map([["g-3", { spend: 0, impressions: 0, clicks: 1 }]]), new Map());
    expect(r.map((c) => c.id)).toEqual(["g-3"]);
  });
});

describe("Story 42.16 (AC4, AC5d) — o filtro Plataforma do Detalhamento", () => {
  const rows = buildCampaignRows([meta({ campaignId: "m-1", spend: 1000 }), meta({ campaignId: "m-2", spend: 200 })], [google({ id: "g-1", spend: 50 })]);

  it("AC4a/b/c — quais linhas: Todas = as duas; Meta = só Meta; Google = só Google", () => {
    expect(linhasDoFiltro(rows, "todas").map((r) => r.id)).toEqual(["m-1", "m-2", "g-1"]);
    expect(linhasDoFiltro(rows, "meta").map((r) => r.id)).toEqual(["m-1", "m-2"]);
    expect(linhasDoFiltro(rows, "google").map((r) => r.id)).toEqual(["g-1"]);
  });

  it("AC4d — o Total de investimento é o das linhas exibidas, por filtro", () => {
    expect(totalSpend(linhasDoFiltro(rows, "todas"))).toBeCloseTo(1250, 10);
    expect(totalSpend(linhasDoFiltro(rows, "meta"))).toBeCloseTo(1200, 10);
    expect(totalSpend(linhasDoFiltro(rows, "google"))).toBeCloseTo(50, 10);
  });

  it("AC4c — dimensões habilitadas: Google só Campanha; Todas e Meta, as três; a dica é a da story", () => {
    expect(dimensoesHabilitadas("todas")).toEqual(["campaign", "adset", "ad"]);
    expect(dimensoesHabilitadas("meta")).toEqual(["campaign", "adset", "ad"]);
    expect(dimensoesHabilitadas("google")).toEqual(["campaign"]);
    expect(DICA_DO_GOOGLE_SO_CAMPANHA).toBe("O Google só tem nível de campanha neste painel");
  });

  it("AC4c — quem estava em Público ou Criativo volta para Campanha com Google; com Todas/Meta a escolha fica", () => {
    expect(dimensaoDoFiltro("google", "adset")).toBe("campaign");
    expect(dimensaoDoFiltro("google", "ad")).toBe("campaign");
    expect(dimensaoDoFiltro("google", "campaign")).toBe("campaign");
    expect(dimensaoDoFiltro("meta", "ad")).toBe("ad");
    expect(dimensaoDoFiltro("todas", "adset")).toBe("adset");
  });

  it("AC4b/c — qual consulta fica ligada: a plataforma fora do filtro não consulta; só a dimensão ativa", () => {
    const tem = { meta: true, google: true };
    expect(consultasDoDetalhamento("todas", "campaign", tem)).toEqual({ metaCampanhas: true, metaPublicos: false, metaCriativos: false, googleStatus: true });
    expect(consultasDoDetalhamento("meta", "campaign", tem)).toEqual({ metaCampanhas: true, metaPublicos: false, metaCriativos: false, googleStatus: false });
    expect(consultasDoDetalhamento("google", "campaign", tem)).toEqual({ metaCampanhas: false, metaPublicos: false, metaCriativos: false, googleStatus: true });
    // Google com uma aba da Meta escolhida antes: a dimensão efetiva é Campanha, e a Meta segue desligada
    expect(consultasDoDetalhamento("google", "ad", tem)).toEqual({ metaCampanhas: false, metaPublicos: false, metaCriativos: false, googleStatus: true });
    expect(consultasDoDetalhamento("meta", "adset", tem)).toEqual({ metaCampanhas: false, metaPublicos: true, metaCriativos: false, googleStatus: false });
    expect(consultasDoDetalhamento("todas", "ad", tem)).toEqual({ metaCampanhas: false, metaPublicos: false, metaCriativos: true, googleStatus: false });
    // sem a plataforma vinculada, nada dela consulta
    expect(consultasDoDetalhamento("todas", "campaign", { meta: false, google: true }).metaCampanhas).toBe(false);
    expect(consultasDoDetalhamento("todas", "campaign", { meta: true, google: false }).googleStatus).toBe(false);
  });

  it("AC4e — o aviso do Google só com Todas ou Google", () => {
    expect(mostraAvisoDoGoogle("todas")).toBe(true);
    expect(mostraAvisoDoGoogle("google")).toBe(true);
    expect(mostraAvisoDoGoogle("meta")).toBe(false);
  });

  it("AC4d — o rodapé de vendas segue o filtro: com Google somem o não identificado, o sem linha e o total da Meta", () => {
    const c = (vendas: number) => ({ vendas, compradores: vendas, receitaUsd: vendas * 10 });
    const vendas = { naoIdentificado: c(2), semLinha: c(3), totalMeta: c(10) };
    expect(rodapeDoFiltro("todas", vendas)).toEqual({ naoIdentificado: c(2), semLinha: c(3), totalDeVendas: c(10) });
    expect(rodapeDoFiltro("meta", vendas)).toEqual({ naoIdentificado: c(2), semLinha: c(3), totalDeVendas: c(10) });
    expect(rodapeDoFiltro("google", vendas)).toEqual({ naoIdentificado: null, semLinha: null, totalDeVendas: null });
    expect(rodapeDoFiltro("todas", null)).toEqual({ naoIdentificado: null, semLinha: null, totalDeVendas: null });
  });
});
