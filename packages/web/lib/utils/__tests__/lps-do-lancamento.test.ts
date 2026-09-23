/**
 * Story 18.83 — "Desempenho de Testes de LPs" do lançamento pela URL do anúncio.
 *
 * Fixture real: `bbe-pr2-out-26 › Captação Paga`, 90 dias, medida no banco em
 * 2026-09-23 (`_origem` no JSON). A leva03 (campanhas `…videos-lpa` que levam à
 * captura-d) é o caso que motivou a story. Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAVE_SEM_LINK,
  ROTULO_SEM_LINK,
  chaveDoCardDaLp,
  descreverSemLink,
  linkDoAnuncio,
  mesclarCorrecao,
  montarLinhasDeLpPorUrl,
  type AnuncioDaLp,
  type LpPorAnuncio,
  type LpRow,
} from "@/lib/utils/lps-do-lancamento";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import type { LeadsPorTemperatura } from "@/lib/utils/contagem-de-leads";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/bbe-pr2-lp-por-anuncio.json", import.meta.url), "utf-8"),
) as {
  anuncios: AnuncioDaLp[];
  leadsPagosPorAnuncio: Record<string, LeadsPorTemperatura>;
  leadsByLpAntes: Record<string, LeadsPorTemperatura>;
};

const A = "lps.netaobombeef.com/bbepr2-captura-a";
const D = "lps.netaobombeef.com/bbepr2-captura-d";
const E = "lps.netaobombeef.com/bbepr2-captura-e";
const A02 = "lps.netaobombeef.com/bbe-pr2-a02-lpa";
const LEVA03 = ["120247625370380489", "120247625370600489"];
const HOJE = "2026-09-23";

const bbe: LpPorAnuncio = { anuncios: fixture.anuncios, campanhasSemDadoPorAnuncio: [] };

function linhas(
  lp: LpPorAnuncio = bbe,
  extra: Partial<Parameters<typeof montarLinhasDeLpPorUrl>[0]> = {},
): LpRow[] {
  return montarLinhasDeLpPorUrl({
    lpPorAnuncio: lp,
    correcoes: {},
    leadsPorAnuncio: fixture.leadsPagosPorAnuncio,
    publico: "todos",
    dataDoImposto: HOJE,
    ...extra,
  });
}
const linha = (rows: LpRow[], k: string) => rows.find((r) => r.lpKey === k);
const soma = (rows: LpRow[], k: keyof LpRow) => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);

describe("bbe-pr2 — a linha é a URL do anúncio (AC1/AC2)", () => {
  const rows = linhas();

  it("quatro URLs, nenhuma 'LPA'", () => {
    expect(rows.map((r) => r.lpKey).sort()).toEqual([A02, A, D, E].sort());
    expect(rows.every((r) => !/^LP[A-Z]$/.test(r.lpName))).toBe(true);
  });

  it("a leva03 (campanhas …videos-lpa) fica na captura-d — dividir por campanha derruba", () => {
    // Mutação: agrupar pelo nome da campanha → os R$ 3.149,84 da leva03 voltam
    // para a captura-a e a captura-d cai para o "LPD" de antes.
    const leva03 = fixture.anuncios.filter((a) => LEVA03.includes(a.adId));
    const semLeva03 = fixture.anuncios.filter((a) => a.lpKey === D && !LEVA03.includes(a.adId));
    const cruD = leva03.reduce((s, a) => s + a.spend, 0) + semLeva03.reduce((s, a) => s + a.spend, 0);
    expect(linha(rows, D)!.investimento).toBeCloseTo(applyMetaAdsTax(cruD, HOJE), 2);
    expect(leva03.reduce((s, a) => s + a.spend, 0)).toBeCloseTo(3149.84, 2);
  });

  it("valores da validação visual: captura-a ≈ R$ 12,5 mil e captura-d ≈ R$ 7,8 mil (com imposto)", () => {
    expect(Math.round(linha(rows, A)!.investimento / 100) * 100).toBe(12500);
    expect(Math.round(linha(rows, D)!.investimento / 100) * 100).toBe(7800);
  });

  it("o texto é a URL sem protocolo e o href é o link do criativo", () => {
    const d = linha(rows, D)!;
    expect(d.lpName).toBe(D);
    expect(d.url).toMatch(/^https:\/\/lps\.netaobombeef\.com\/bbepr2-captura-d/);
  });
});

describe("Total invariante (AC3) — trocar a chave só redistribui", () => {
  it("investimento, impressões, cliques, LP View e pixel fecham com a soma dos anúncios", () => {
    const rows = linhas();
    const cru = (k: keyof AnuncioDaLp) => fixture.anuncios.reduce((s, a) => s + (a[k] as number), 0);
    expect(soma(rows, "investimento")).toBeCloseTo(applyMetaAdsTax(cru("spend"), HOJE), 2);
    expect(soma(rows, "impressoes")).toBe(cru("impressions"));
    expect(soma(rows, "cliques")).toBe(cru("clicks"));
    expect(soma(rows, "lpViews")).toBe(cru("landingPageViews"));
  });

  it("imposto de 12,15 % entra UMA vez", () => {
    // Mutação: aplicar o imposto por anúncio E por linha → ×1,138 a mais.
    const rows = linhas();
    const cru = fixture.anuncios.reduce((s, a) => s + a.spend, 0);
    expect(soma(rows, "investimento") / cru).toBeCloseTo(1 / (1 - 0.1215), 6);
  });

  it("anúncio sem URL e campanha sem dado por anúncio entram em 'Sem link resolvido' — o Total não perde nada", () => {
    // Mutação: descartar o anúncio sem link (ou somá-lo em "LPA") → o Total cai.
    const semUrl: AnuncioDaLp = { ...fixture.anuncios[0], adId: "sem-url", lpKey: null, url: null, causa: "cache_desatualizado", spend: 100 };
    const lp: LpPorAnuncio = {
      anuncios: [...fixture.anuncios, semUrl],
      campanhasSemDadoPorAnuncio: [{
        campaignId: "dg-pg02-antiga", campaignName: "x--cold--lpb", temperature: "cold", inteira: true,
        spend: 812.4, impressions: 40000, clicks: 900, landingPageViews: 700, pixelLeads: 12,
      }],
    };
    const rows = linhas(lp);
    const cru = fixture.anuncios.reduce((s, a) => s + a.spend, 0) + 100 + 812.4;
    expect(soma(rows, "investimento")).toBeCloseTo(applyMetaAdsTax(cru, HOJE), 2);
    const sem = linha(rows, CHAVE_SEM_LINK)!;
    expect(sem.lpName).toBe(ROTULO_SEM_LINK);
    expect(sem.investimento).toBeCloseTo(applyMetaAdsTax(912.4, HOJE), 2);
    expect(sem.semLink).toEqual(expect.objectContaining({ cacheDesatualizado: 1, semDadoPorAnuncio: 1 }));
    // A campanha sem dado por anúncio vai inteira (5ª causa).
    expect(sem.semLink!.campanhas.map((c) => c.id)).toEqual(["dg-pg02-antiga", fixture.anuncios[0].campaignId]);
    // "Sem link resolvido" nunca é somado em "LPA": a linha A não muda.
    expect(linha(rows, A)!.investimento).toBeCloseTo(linha(linhas(), A)!.investimento, 6);
  });

  it("'Sem link resolvido' fica no fim", () => {
    const lp: LpPorAnuncio = {
      anuncios: [...fixture.anuncios, { ...fixture.anuncios[0], adId: "x", lpKey: null, url: null, causa: "fora_do_cache", spend: 99999 }],
      campanhasSemDadoPorAnuncio: [],
    };
    const rows = linhas(lp);
    expect(rows[rows.length - 1].lpKey).toBe(CHAVE_SEM_LINK);
  });
});

describe("Leads pela URL do anúncio (AC4) — o caso dos 16 leads", () => {
  it("os 16 leads da leva03 vão para a captura-d (a letra da utm_term derrubaria)", () => {
    // Mutação: contar pela letra `lpX` do texto → a captura-d volta aos 31 do
    // "LPD" e a captura-a aos 36 do "LPA".
    const rows = linhas();
    const leadsLeva03 = LEVA03.reduce((s, id) => s + (fixture.leadsPagosPorAnuncio[id]?.total ?? 0), 0);
    expect(leadsLeva03).toBe(16);
    expect(linha(rows, D)!.leads).toBe(fixture.leadsByLpAntes.lpd.total + 16);
    expect(linha(rows, A)!.leads).toBe(fixture.leadsByLpAntes.lpa.total - 16);
    expect(linha(rows, E)!.leads).toBe(2);
  });

  it("Hot/Cold: gasto pela campanha; lead pelo texto do lead (AC7/PO-07)", () => {
    const hot = linhas(bbe, { publico: "hot" });
    const cruHotD = fixture.anuncios.filter((a) => a.lpKey === D && a.temperature === "hot").reduce((s, a) => s + a.spend, 0);
    expect(linha(hot, D)!.investimento).toBeCloseTo(applyMetaAdsTax(cruHotD, HOJE), 2);
    // 9 hot da leva03 + 3 hot do lpd hot.
    expect(linha(hot, D)!.leads).toBe(12);
  });

  it("lead de anúncio fora da etapa no período não entra em linha nenhuma", () => {
    const rows = linhas(bbe, { leadsPorAnuncio: { ...fixture.leadsPagosPorAnuncio, "fora-da-etapa": { hot: 5, cold: 0, total: 5 } } });
    expect(soma(rows, "leads")).toBe(soma(linhas(), "leads"));
  });

  it("LP sem formulário → pixel, avaliado POR URL (a página nova a02-lpa)", () => {
    // Mutação: chavear a regra pelo rótulo → a a02-lpa (campanha "…a02-lpa")
    // herdaria a planilha da "LPA" e nunca viraria linha de pixel.
    const comPixel: LpPorAnuncio = {
      anuncios: fixture.anuncios.map((a) => (a.lpKey === A02 ? { ...a, pixelLeads: 4 } : a)),
      campanhasSemDadoPorAnuncio: [],
    };
    const a02 = linha(linhas(comPixel), A02)!;
    expect(a02.leadsFonte).toBe("pixel");
    expect(a02.leads).toBe(8);
    expect(linha(linhas(comPixel), A)!.leadsFonte).toBe("planilha");
  });

  it("a linha 'Sem link resolvido' não usa pixel — não é uma página", () => {
    const lp: LpPorAnuncio = {
      anuncios: [...fixture.anuncios, { ...fixture.anuncios[0], adId: "x", lpKey: null, url: null, causa: "fora_do_cache", pixelLeads: 30 }],
      campanhasSemDadoPorAnuncio: [],
    };
    const sem = linha(linhas(lp), CHAVE_SEM_LINK)!;
    expect(sem.leads).toBe(0);
    expect(sem.leadsFonte).toBe("planilha");
  });
});

describe("Correção manual por campanha (AC5/PO-15)", () => {
  const campanhaLeva03 = fixture.anuncios.find((a) => a.adId === LEVA03[1])!.campaignId;
  // A leva03 sem link (cache velho): cai em "Sem link resolvido".
  const semLink: LpPorAnuncio = {
    anuncios: fixture.anuncios.map((a) =>
      LEVA03.includes(a.adId) ? { ...a, lpKey: null, url: null, causa: "cache_desatualizado" as const } : a,
    ),
    campanhasSemDadoPorAnuncio: [],
  };

  it("sem correção, a leva03 está em 'Sem link resolvido' com gasto E lead", () => {
    const rows = linhas(semLink);
    const sem = linha(rows, CHAVE_SEM_LINK)!;
    expect(sem.leads).toBe(16);
    expect(sem.semLink!.cacheDesatualizado).toBe(2);
  });

  it("corrigir a campanha leva gasto E lead para a MESMA URL", () => {
    // Mutação: aplicar a correção só no gasto → a linha D ganha o dinheiro e o
    // lead fica em "Sem link resolvido" (esta asserção de leads cai).
    const url = "https://www.lps.netaobombeef.com/bbepr2-captura-d/?utm_source=x";
    const correcoes = Object.fromEntries(
      fixture.anuncios.filter((a) => LEVA03.includes(a.adId)).map((a) => [a.campaignId, url]),
    );
    const rows = linhas(semLink, { correcoes });
    expect(linha(rows, CHAVE_SEM_LINK)).toBeUndefined();
    const d = linha(rows, D)!;
    expect(d.leads).toBe(fixture.leadsByLpAntes.lpd.total + 16);
    expect(d.investimento).toBeCloseTo(linha(linhas(), D)!.investimento, 6);
    expect(d.correcoes!.map((c) => c.campaignId).sort()).toEqual(Object.keys(correcoes).sort());
  });

  it("anúncio com URL resolvida NÃO muda por causa da correção", () => {
    // A campanha hot …videos-lpa também tem anúncios que levam à captura-a:
    // corrigi-la para a D não pode arrastá-los.
    const rows = linhas(semLink, { correcoes: { [campanhaLeva03]: "https://lps.netaobombeef.com/bbepr2-captura-d" } });
    expect(linha(rows, A)!.investimento).toBeCloseTo(linha(linhas(), A)!.investimento, 6);
  });

  it("campanha sem dado por anúncio corrigida vai inteira; só o nível campanha se move (PO-15a)", () => {
    const lp: LpPorAnuncio = {
      anuncios: [],
      campanhasSemDadoPorAnuncio: [{
        campaignId: "c-antiga", campaignName: "x--cold", temperature: "cold", inteira: true,
        spend: 100, impressions: 1000, clicks: 10, landingPageViews: 8, pixelLeads: 1,
      }],
    };
    const rows = linhas(lp, { correcoes: { "c-antiga": "https://p.com/x" }, leadsPorAnuncio: {} });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ lpKey: "p.com/x", cliques: 10, lpViews: 8 }));
  });

  it("apagar a correção (valor vazio) devolve para 'Sem link resolvido'", () => {
    const rows = linhas(semLink, { correcoes: mesclarCorrecao({ [campanhaLeva03]: "https://p.com/d" }, campanhaLeva03, "") });
    expect(linha(rows, CHAVE_SEM_LINK)).toBeDefined();
  });
});

describe("peças da tela", () => {
  it("linkDoAnuncio: URL própria vence a correção", () => {
    expect(linkDoAnuncio({ lpKey: "p.com/a", url: "https://p.com/a", campaignId: "c" }, { c: "https://p.com/b" }))
      .toEqual({ chave: "p.com/a", url: "https://p.com/a", corrigido: false });
  });

  it("descreverSemLink lista cada causa com a ação dela", () => {
    const t = descreverSemLink({
      foraDoCache: 1, cacheDesatualizado: 2, semLinkNaMeta: 3, causaIndeterminada: 0, semDadoPorAnuncio: 1, campanhas: [],
    });
    expect(t).toContain("2 anúncio(s) com cache desatualizado");
    expect(t).toContain("1 anúncio(s) fora do cache");
    expect(t).toContain("3 anúncio(s) sem link na Meta");
    expect(t).toContain("1 campanha(s) com gasto sem dado por anúncio");
    expect(t).not.toContain("não determinada");
  });

  it("chaveDoCardDaLp: URL exata (path com maiúscula preservado); rótulo em maiúsculas", () => {
    expect(chaveDoCardDaLp("p.com/Inscricao")).toBe("p.com/Inscricao");
    expect(chaveDoCardDaLp("lpa")).toBe("LPA");
  });

  it("mesclarCorrecao preserva as outras campanhas", () => {
    expect(mesclarCorrecao({ a: "https://x.com" }, "b", " https://y.com ")).toEqual({ a: "https://x.com", b: "https://y.com" });
  });
});
