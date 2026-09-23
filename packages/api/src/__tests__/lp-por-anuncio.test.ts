import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  classificarLinkDoCache,
  condicaoDasCampanhasDosAnuncios,
  condicaoDoCacheDeCriativos,
  linkComCorrecao,
  listasDaCura,
  type LinkDoAnuncio,
} from "../services/lp-do-anuncio.js";
import { LINK_URL_RESOLVER_VERSION } from "../services/meta-ads.js";
import {
  montarLpPorAnuncio,
  type LinhaDeAnuncio,
  type LinhaDeCampanha,
} from "../utils/lp-por-anuncio.js";

/**
 * Story 18.83 — a LP do lançamento é o link que a pessoa viu.
 *
 * Fixture: `bbe-pr2-out-26 › Captação Paga`, 90 dias, medida no banco em
 * 2026-09-23 (ver `_origem` no JSON). O caso que motivou a story está nela: a
 * leva03 roda em campanhas `…videos-lpa` e leva à captura-d.
 *
 * Cada teste diz qual mutação ele derruba — sem isso, "a suíte passou" não
 * prova nada.
 */

interface LinhaDaFixture extends LinhaDeAnuncio {
  ad_id: string;
  campaign_id: string;
  campaign_name: string;
  linkUrl: string;
}
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/bbe-pr2-lp-por-anuncio.json", import.meta.url), "utf-8"),
) as { anuncios: LinhaDaFixture[] };

const anuncios = fixture.anuncios;
const campanhasPermitidas = [...new Set(anuncios.map((a) => a.campaign_id))];

/** O nível campanha da Meta, somado dos anúncios (na fixture eles fecham). */
function campanhasDe(linhas: LinhaDeAnuncio[]): LinhaDeCampanha[] {
  const porId = new Map<string, LinhaDeCampanha & { _s: number; _i: number; _c: number; _l: number; _p: number }>();
  for (const a of linhas) {
    const id = a.campaign_id!;
    const c = porId.get(id) ?? {
      campaign_id: id, campaign_name: a.campaign_name, _s: 0, _i: 0, _c: 0, _l: 0, _p: 0,
    };
    c._s += Number(a.spend);
    c._i += Number(a.impressions);
    c._c += Number(a.inline_link_clicks);
    c._l += Number(a.actions?.find((x) => x.action_type === "landing_page_view")?.value ?? 0);
    c._p += Number(a.actions?.find((x) => x.action_type === "offsite_conversion.fb_pixel_lead")?.value ?? 0);
    porId.set(id, c);
  }
  return [...porId.values()].map((c) => ({
    campaign_id: c.campaign_id,
    campaign_name: c.campaign_name,
    spend: c._s.toFixed(2),
    impressions: String(c._i),
    inline_link_clicks: String(c._c),
    actions: [
      { action_type: "landing_page_view", value: String(c._l) },
      { action_type: "offsite_conversion.fb_pixel_lead", value: String(c._p) },
    ],
  }));
}

function linksDaFixture(): Map<string, LinkDoAnuncio> {
  return new Map(
    anuncios.map((a) => [
      a.ad_id,
      classificarLinkDoCache({ creative: { linkUrl: a.linkUrl, linkUrlResolver: LINK_URL_RESOLVER_VERSION } }),
    ]),
  );
}

const semVendas = { vendas: new Map(), ingressos: null };

describe("classificarLinkDoCache — a identidade e as causas (AC1/AC5)", () => {
  it("http/https, www, barra final e query caem na MESMA chave", () => {
    const chaves = [
      "https://lps.netaobombeef.com/bbepr2-captura-d",
      "http://www.lps.netaobombeef.com/bbepr2-captura-d/",
      "https://LPS.netaobombeef.com/bbepr2-captura-d?utm_source=meta&fbclid=x",
    ].map((u) => classificarLinkDoCache({ creative: { linkUrl: u, linkUrlResolver: 2 } }).chave);
    expect(new Set(chaves)).toEqual(new Set(["lps.netaobombeef.com/bbepr2-captura-d"]));
  });

  it("sem linha no cache → fora do cache", () => {
    expect(classificarLinkDoCache(undefined)).toEqual({ url: null, chave: null, causa: "fora_do_cache" });
  });

  it("linkUrl nulo gravado por resolver antigo → cache desatualizado, NÃO 'sem link na Meta'", () => {
    // Mutação: tirar a checagem do carimbo → vira `sem_link_na_meta` e o teste cai.
    const r = classificarLinkDoCache({ creative: { linkUrl: null, linkUrlResolver: LINK_URL_RESOLVER_VERSION - 1 } });
    expect(r.causa).toBe("cache_desatualizado");
    expect(classificarLinkDoCache({ creative: { linkUrl: null } }).causa).toBe("cache_desatualizado");
  });

  it("linkUrl nulo carimbado pelo resolver atual → sem link na Meta", () => {
    const r = classificarLinkDoCache({ creative: { linkUrl: null, linkUrlResolver: LINK_URL_RESOLVER_VERSION } });
    expect(r.causa).toBe("sem_link_na_meta");
  });

  it("link que não é página (tel:) não vira linha própria", () => {
    const r = classificarLinkDoCache({ creative: { linkUrl: "tel:+5511999999999", linkUrlResolver: 2 } });
    expect(r.chave).toBeNull();
    expect(r.causa).toBe("sem_link_na_meta");
  });
});

describe("montarLpPorAnuncio — bbe-pr2, a campanha …videos-lpa que leva a DUAS páginas (AC1)", () => {
  const out = montarLpPorAnuncio({
    anuncios,
    campanhas: campanhasDe(anuncios),
    campanhasPermitidas,
    links: linksDaFixture(),
    vendas: semVendas,
  });

  it("cada anúncio carrega a URL dele — a leva03 fica na captura-d, não no 'LPA' do nome", () => {
    // Mutação: derivar a chave do nome da campanha → a leva03 vira captura-a e cai.
    const leva03 = out.anuncios.filter((a) => a.adId === "120247625370380489" || a.adId === "120247625370600489");
    expect(leva03).toHaveLength(2);
    for (const a of leva03) {
      expect(a.campaignName).toMatch(/videos-lpa$/);
      expect(a.lpKey).toBe("lps.netaobombeef.com/bbepr2-captura-d");
    }
    const spendLeva03 = leva03.reduce((s, a) => s + a.spend, 0);
    expect(spendLeva03).toBeCloseTo(3149.84, 2);
  });

  it("a mesma campanha aparece em duas URLs", () => {
    const hotVideosLpa = out.anuncios.filter((a) => /lp01_hot_cbo_videos-lpa$/.test(a.campaignName));
    expect(new Set(hotVideosLpa.map((a) => a.lpKey))).toEqual(
      new Set(["lps.netaobombeef.com/bbepr2-captura-a", "lps.netaobombeef.com/bbepr2-captura-d"]),
    );
  });

  it("temperatura sai do nome da CAMPANHA (AC7)", () => {
    const a = out.anuncios.find((x) => x.adId === "120247625370600489")!;
    expect(a.temperature).toBe("hot");
  });

  it("nível anúncio fecha com o campanha → nenhuma linha de 5ª causa", () => {
    expect(out.campanhasSemDadoPorAnuncio).toEqual([]);
  });

  it("invariante: soma dos anúncios = soma das campanhas (gasto, impressões, cliques, LP View, pixel)", () => {
    const camp = campanhasDe(anuncios);
    const somaCamp = (k: "spend" | "impressions" | "inline_link_clicks") =>
      camp.reduce((s, c) => s + Number(c[k]), 0);
    expect(out.anuncios.reduce((s, a) => s + a.spend, 0)).toBeCloseTo(somaCamp("spend"), 2);
    expect(out.anuncios.reduce((s, a) => s + a.impressions, 0)).toBe(somaCamp("impressions"));
    expect(out.anuncios.reduce((s, a) => s + a.clicks, 0)).toBe(somaCamp("inline_link_clicks"));
    const acaoCamp = (t: string) =>
      camp.reduce((s, c) => s + Number(c.actions?.find((x) => x.action_type === t)?.value ?? 0), 0);
    expect(out.anuncios.reduce((s, a) => s + a.landingPageViews, 0)).toBe(acaoCamp("landing_page_view"));
    expect(out.anuncios.reduce((s, a) => s + a.pixelLeads, 0)).toBe(acaoCamp("offsite_conversion.fb_pixel_lead"));
    // Âncora na medição de produção (90 dias, banco): R$ 20.165,26 sem imposto.
    expect(out.anuncios.reduce((s, a) => s + a.spend, 0)).toBeCloseTo(20165.26, 2);
  });
});

describe("montarLpPorAnuncio — cliques no link são `inline_link_clicks` (AC3)", () => {
  it("usa inline_link_clicks, não actions.link_click", () => {
    // Mutação: ler `link_click` do actions → 999 e o teste cai.
    const out = montarLpPorAnuncio({
      anuncios: [{
        ad_id: "1", campaign_id: "c", campaign_name: "x", spend: "10", impressions: "100",
        inline_link_clicks: "7",
        actions: [{ action_type: "link_click", value: "999" }],
      }],
      campanhas: [],
      campanhasPermitidas: ["c"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.anuncios[0].clicks).toBe(7);
  });
});

describe("montarLpPorAnuncio — 5ª causa: campanha sem dado por anúncio (AC3/AC5)", () => {
  const camp: LinhaDeCampanha = {
    campaign_id: "dg-pg02-antiga",
    campaign_name: "dg-pg02--captacao--cold--lpb",
    spend: "812.40",
    impressions: "40000",
    inline_link_clicks: "900",
    actions: [
      { action_type: "landing_page_view", value: "700" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "12" },
    ],
  };

  it("entra INTEIRA — o gasto nunca some do Total", () => {
    // Mutação: ignorar campanha sem anúncio → a lista fica vazia e o Total cai R$ 812,40.
    const out = montarLpPorAnuncio({
      anuncios: [],
      campanhas: [camp],
      campanhasPermitidas: ["dg-pg02-antiga"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.campanhasSemDadoPorAnuncio).toEqual([
      expect.objectContaining({
        campaignId: "dg-pg02-antiga",
        inteira: true,
        temperature: "cold",
        spend: 812.4,
        impressions: 40000,
        clicks: 900,
        landingPageViews: 700,
        pixelLeads: 12,
      }),
    ]);
  });

  it("campanha com anúncios que não explicam o gasto todo → só a diferença", () => {
    const out = montarLpPorAnuncio({
      anuncios: [{ ad_id: "a1", campaign_id: "dg-pg02-antiga", campaign_name: camp.campaign_name, spend: "800.00", impressions: "39000", inline_link_clicks: "880" }],
      campanhas: [camp],
      campanhasPermitidas: ["dg-pg02-antiga"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.campanhasSemDadoPorAnuncio).toHaveLength(1);
    expect(out.campanhasSemDadoPorAnuncio[0].inteira).toBe(false);
    expect(out.campanhasSemDadoPorAnuncio[0].spend).toBeCloseTo(12.4, 2);
    expect(out.campanhasSemDadoPorAnuncio[0].clicks).toBe(20);
  });

  it("diferença só de contagem, sem gasto, não abre linha (1 clique medido no bbe-pr2)", () => {
    const out = montarLpPorAnuncio({
      anuncios: [{ ad_id: "a1", campaign_id: "c", campaign_name: "x", spend: "10.00", impressions: "100", inline_link_clicks: "4" }],
      campanhas: [{ campaign_id: "c", campaign_name: "x", spend: "10.00", impressions: "100", inline_link_clicks: "5" }],
      campanhasPermitidas: ["c"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.campanhasSemDadoPorAnuncio).toEqual([]);
  });

  it("campanha de fora da etapa não entra", () => {
    const out = montarLpPorAnuncio({
      anuncios: [{ ad_id: "a1", campaign_id: "outra", campaign_name: "x", spend: "10" }],
      campanhas: [{ campaign_id: "outra", spend: "10" }],
      campanhasPermitidas: ["c"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.anuncios).toEqual([]);
    expect(out.campanhasSemDadoPorAnuncio).toEqual([]);
  });
});

describe("montarLpPorAnuncio — vendas por anúncio, no universo de hoje (AC4/PO-05)", () => {
  it("vendas e ingressos saem do anúncio; ad_id de fora da etapa não aparece", () => {
    const ing = {
      ingressosUnicosByAdId: new Map([["a1", 2], ["fora", 9]]),
      ingressosTotaisByAdId: new Map([["a1", 3], ["fora", 9]]),
      revenueUnicoByAdId: new Map([["a1", 94]]),
      revenueTotalByAdId: new Map([["a1", 141], ["fora", 999]]),
    };
    const out = montarLpPorAnuncio({
      anuncios: [{ ad_id: "a1", campaign_id: "c", campaign_name: "x", spend: "10" }],
      campanhas: [],
      campanhasPermitidas: ["c"],
      links: new Map([["a1", { url: "https://p.com/a", chave: "p.com/a", causa: null }]]),
      vendas: { vendas: new Map([["a1", { vendas: 2, faturamento: 94 }]]), ingressos: ing },
    });
    expect(out.anuncios).toEqual([
      expect.objectContaining({
        adId: "a1", lpKey: "p.com/a", vendas: 2, faturamento: 94,
        ingressosUnicos: 2, ingressosTotais: 3, revenueUnico: 94, revenueTotal: 141,
      }),
    ]);
  });

  it("sem atribuição por co= os campos de ingresso ficam FORA (não zero)", () => {
    const out = montarLpPorAnuncio({
      anuncios: [{ ad_id: "a1", campaign_id: "c", campaign_name: "x", spend: "10" }],
      campanhas: [],
      campanhasPermitidas: ["c"],
      links: new Map(),
      vendas: semVendas,
    });
    expect(out.anuncios[0]).not.toHaveProperty("ingressosUnicos");
    expect(out.anuncios[0].causa).toBe("fora_do_cache");
  });
});

describe("recorte da leitura do cache e das campanhas (predicado do Drizzle)", () => {
  // Banco mockado aceitaria o `where` sem o projeto — o que prova é a SQL.
  it("cache de criativos: project_id E ad_id", () => {
    const q = new PgDialect().sqlToQuery(condicaoDoCacheDeCriativos("proj-1", ["a1", "a2"])!);
    expect(q.sql).toContain('"meta_ad_creatives_cache"."project_id"');
    expect(q.sql).toContain('"meta_ad_creatives_cache"."ad_id"');
    expect(q.params).toEqual(["proj-1", "a1", "a2"]);
  });

  it("ad → campanha no banco: project_id E ad_id", () => {
    const q = new PgDialect().sqlToQuery(condicaoDasCampanhasDosAnuncios("proj-1", ["a1"])!);
    expect(q.sql).toContain('"meta_ad_insights_daily"."project_id"');
    expect(q.sql).toContain('"meta_ad_insights_daily"."ad_id"');
    expect(q.params).toEqual(["proj-1", "a1"]);
  });
});

describe("listasDaCura — só as causas curáveis (AC8)", () => {
  it("cache velho e fora do cache vão; 'sem link na Meta' e resolvido não", () => {
    const links = new Map<string, LinkDoAnuncio>([
      ["velho", { url: null, chave: null, causa: "cache_desatualizado" }],
      ["fora", { url: null, chave: null, causa: "fora_do_cache" }],
      ["meta", { url: null, chave: null, causa: "sem_link_na_meta" }],
      ["ok", { url: "https://p.com", chave: "p.com", causa: null }],
    ]);
    expect(listasDaCura(links)).toEqual({ staleInCache: ["velho"], missingFromCache: ["fora"] });
  });
});

describe("linkComCorrecao — a correção por campanha só vale para o sem link (AC5)", () => {
  const correcoes = { "c1": "https://www.p.com/captura-d/?utm=1" };

  it("anúncio sem link da campanha corrigida → URL da correção, normalizada", () => {
    const r = linkComCorrecao({ url: null, chave: null, causa: "cache_desatualizado" }, "c1", correcoes);
    expect(r).toEqual({ url: correcoes.c1, chave: "p.com/captura-d", causa: null, corrigido: true });
  });

  it("anúncio COM link não muda por causa da correção", () => {
    // Mutação: aplicar a correção antes de olhar a chave → vira captura-d e cai.
    const r = linkComCorrecao({ url: "https://p.com/a", chave: "p.com/a", causa: null }, "c1", correcoes);
    expect(r.chave).toBe("p.com/a");
    expect(r.corrigido).toBe(false);
  });

  it("campanha sem correção, ou correção que não é URL, continua sem link", () => {
    expect(linkComCorrecao({ url: null, chave: null, causa: "fora_do_cache" }, "c2", correcoes).chave).toBeNull();
    expect(linkComCorrecao({ url: null, chave: null, causa: "fora_do_cache" }, "c1", { c1: "tel:1" }).chave).toBeNull();
  });
});
