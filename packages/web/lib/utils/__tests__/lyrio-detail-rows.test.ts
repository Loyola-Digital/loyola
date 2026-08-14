import { describe, it, expect } from "vitest";
import {
  metaRow,
  googleRow,
  buildCampaignRows,
  sortRows,
  totalSpend,
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
  ctr: 1.6,
  cpc: 0.625,
  cpm: 10,
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

  it("sem cliques no link cai para os cliques totais", () => {
    const r = metaRow(meta({ spend: 1000, clicks: 400, linkClicks: 0, impressions: 10_000 }));
    expect(r.clicks).toBe(400);
    expect(r.cpc).toBe(2.5);
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

  it("usa CTR, CPC e CPM prontos da API em vez de re-derivar", () => {
    const r = googleRow(google({ ctr: 1.6, cpc: 0.625, cpm: 10 }));
    expect(r.ctr).toBe(1.6);
    expect(r.cpc).toBe(0.625);
    expect(r.cpm).toBe(10);
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
