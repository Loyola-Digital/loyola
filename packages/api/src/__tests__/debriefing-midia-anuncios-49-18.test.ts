/**
 * Story 49.18 — mídia por anúncio no Debriefing: ranking por nome de anúncio
 * (AC1), estático × vídeo (AC3), frio ADV+ separado (AC4), peças de escassez
 * por dia (AC5), copy igual (AC6), comparação no mesmo D+N (AC7) e as seções
 * antigas intocadas (AC8). O AC2 (melhor versão isolada) aguarda a P-22.
 *
 * Motores REAIS sobre a entrada sintética da 49.5 com a fixture da 49.18, e o
 * orquestrador `gerarDebriefing` de ponta a ponta com o relógio fixado. Os SHA
 * do AC8 foram medidos no commit-base da story (`c0a63eb4`) pelo script
 * `ac8-4918.mts` (Dev Agent Record), sobre ESTA fixture.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classificarOrigem } from "@loyola-x/shared";
import {
  PUBLICOS_DA_MIDIA,
  TERMOS_DE_ESCASSEZ,
  comMelhorVersao,
  computeMidiaPorAnuncio,
  copyDosAnuncios,
  ehPecaDeEscassez,
  formatoPeloNomeDaCampanha,
  publicoDaCampanha,
  type AnuncioDiaDaMidia,
  type MidiaPorAnuncio,
} from "../services/debriefing-midia-anuncios.js";
import { computeDebriefingAudience, tipoPelaCampanha } from "../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../services/debriefing-audience-loader.js";
import { computeDebriefingMoneyTime } from "../services/debriefing-money-time-engine.js";
import { MARCA_DA_MIDIA_POR_ANUNCIO, SECOES_DO_DEBRIEFING, renderDebriefing } from "../services/debriefing-render.js";
import { gerarDebriefing } from "../services/debriefing-generate.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { configSintetica, entradaAudienceSintetica } from "./fixtures/debriefing-payload-sintetico.js";
import {
  AD_A1,
  AD_A2,
  AD_B,
  AD_C,
  AD_ESC1,
  AD_ESC2,
  CENARIOS_DO_AC8,
  NOME_A,
  NOME_B,
  NOME_C,
  NOME_ESC1,
  NOME_ESC2,
  PARAMS_DA_MIDIA,
  anunciosSinteticos,
  conteudoDasVendas,
  depsDaMidia,
  entradaMtMidia,
  payloadMidia,
  type CenarioDaMidia,
  type TextosDaFixture,
} from "./fixtures/debriefing-midia-anuncios-49-18.js";

const FATOR = 1 / (1 - 0.1215);
const ROT = { projeto: "Expert", lancamento: "PG05", etapas: {}, funis: {} };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const midia = (p: DebriefingPayload): MidiaPorAnuncio => {
  const m = p.publico.midiaPorAnuncio;
  expect(m).toBeDefined();
  return m!;
};
const final = (opts: Parameters<typeof payloadMidia>[1] = {}) => payloadMidia(configSintetica(), opts);
const linha = (m: MidiaPorAnuncio, nome: string) => {
  const l = m.ranking.find((r) => r.nome === nome);
  expect(l, nome).toBeDefined();
  return l!;
};

async function gerar(c: CenarioDaMidia) {
  const d = depsDaMidia(c, configSintetica());
  const r = await gerarDebriefing(d, PARAMS_DA_MIDIA);
  expect(r.status).toBe(200);
  const body = r.body as { html: string; payload: DebriefingPayload };
  expect(d.gravados[0]!.html).toBe(body.html);
  return { html: body.html, payload: body.payload };
}

/** O bloco da 49.18 no HTML. */
function bloco(html: string): string {
  const i = html.indexOf(`<section ${MARCA_DA_MIDIA_POR_ANUNCIO}>`);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf("</section>", i) + "</section>".length);
}
function semO4918(html: string): string {
  const b = bloco(html);
  return html.replace(b, "");
}
/** O texto de uma tabela do bloco, linha a linha (`célula | célula`). */
function linhasDaTabela(html: string, titulo: string): string[] {
  const depois = html.split(titulo)[1]!;
  const tab = depois.slice(0, depois.indexOf("</table>"));
  return [...tab.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1]!.matchAll(/<t[dh]>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1]!.replace(/<[^>]+>/g, "").trim()).join(" | ").trimEnd(),
  );
}
function secoesPorTitulo(html: string): Map<string, string> {
  return new Map([...html.matchAll(/<section[^>]*data-secao="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((m) => [m[1]!.replace(/&amp;/g, "&"), m[0]]));
}

// ---------------------------------------------------------------------------
// AC1 — ranking por nome de anúncio
// ---------------------------------------------------------------------------

describe("AC1 — ranking por nome de anúncio", () => {
  it("um nome com dois Ad IDs: investimento, compradores, faturamento e visitas SOMAM; CPA, ROAS, tier e compra por visita do nome", () => {
    const m = midia(final());
    const a = linha(m, NOME_A);
    expect(a.adIds).toEqual([AD_A1, AD_A2]);
    expect(a.investimentoComImposto).toBeCloseTo(150 * FATOR, 9);
    expect(a.compradores).toBe(2); // c1 (ingresso pelo AD_A1 + bump numa linha com o Ad ID do B) + c2 (combo, AD_A2)
    expect(a.faturamento).toBe(99 + 47 + 297);
    expect(a.cpa.valor).toBeCloseTo((150 * FATOR) / 2, 9);
    expect(a.roas.valor).toBeCloseTo(443 / (150 * FATOR), 9);
    expect(a.tierSuperior.valor).toBe(1); // c1 levou o bump, c2 o combo
    expect(a.landingPageViews).toBe(50);
    expect(a.compraPorVisita.valor).toBeCloseTo((2 / 50) * 100, 9);
    expect(a.pctDaVerba.valor).toBeCloseTo((150 / 345) * 100, 9); // 345 = Σ spend bruto do ad-level de captação
    // Post do Ad ID de MAIOR investimento entre os que têm post (o A1 não tem post).
    expect(a.adIdPrincipal).toBe(AD_A1);
    expect(a.linkDoPost).toBe("https://www.instagram.com/p/POST-A2/");
    expect(a.linkAdsManager).toContain(`selected_ad_ids=${AD_A1}`);
    expect(a.publicos).toEqual(["Quente", "Frio ADV+"]);
    expect(a.formatos).toEqual(["estatico"]);
  });

  it("ordem por investimento; só nomes de captação do ad-level; a soma das linhas fecha com o total do ranking", () => {
    const m = midia(final());
    expect(m.ranking.map((r) => r.nome)).toEqual([NOME_A, NOME_B, NOME_C]);
    const soma = m.ranking.reduce((s, r) => s + r.investimentoComImposto, 0);
    expect(m.totalDoRanking.investimentoComImposto).toBeCloseTo(soma, 9);
    expect(m.totalDoRanking.compradores).toBe(m.ranking.reduce((s, r) => s + r.compradores, 0));
  });

  it("a atribuição fecha: ranking + escassez + Ad ID fora do ad-level + sem Ad ID = compradores de captação do Motor I", () => {
    const p = final();
    const m = midia(p);
    expect(m.atribuicao).toMatchObject({ compradores: 8, noRanking: 4, naEscassez: 2, adIdForaDoAdLevel: 1, semAdId: 1 });
    expect(m.atribuicao.compradores).toBe(p.dinheiroTempo.ingressosUnicos);
  });

  it("sem landing_page_view no período: \"—\" com motivo, nunca 0 — no payload e no documento", async () => {
    const b = linha(midia(final()), NOME_B);
    expect(b.landingPageViews).toBeNull();
    expect(b.compraPorVisita).toMatchObject({ valor: null, motivo: "LANDING_PAGE_VIEW_AUSENTE" });
    const { html } = await gerar({ modo: "final", comparacao: null });
    const tr = linhasDaTabela(bloco(html), "Ranking por nome de anúncio").find((l) => l.startsWith(NOME_B))!;
    expect(tr.split(" | ")[9]).toBe("—");
    expect(bloco(html)).toContain('<td><span title="LANDING_PAGE_VIEW_AUSENTE">—</span></td>');
  });

  it("compra por visita no total: só compradores de Ad IDs COM landing_page_view no numerador", () => {
    const t = midia(final()).totalDoRanking;
    // A (2 compradores, 50 visitas) + C (0, 2 visitas); os 2 do B (sem landing_page_view) ficam fora.
    expect(t.landingPageViews).toBe(52);
    expect(t.compraPorVisita.valor).toBeCloseTo((2 / 52) * 100, 9);
    expect(t.compraPorVisita.memoria).toContain("2 comprador(es) de anúncio sem landing_page_view fora do numerador");
  });

  it("nome sem comprador: CPA \"—\" (SEM_COMPRADOR), ROAS 0 de faturamento 0", () => {
    const c = linha(midia(final()), NOME_C);
    expect(c.compradores).toBe(0);
    expect(c.cpa).toMatchObject({ valor: null, motivo: "SEM_COMPRADOR" });
    expect(c.roas.valor).toBe(0);
  });

  it("vendas sem utm_content: nada atribuído e as métricas por comprador são \"—\" com motivo", () => {
    const mtIn = entradaMtMidia(configSintetica());
    const mt = computeDebriefingMoneyTime(mtIn);
    const au = computeDebriefingAudience({
      ...entradaAudienceSintetica(mtIn),
      janela: mt.janela,
      compradores: higienizarVendasDoDebriefing(mtIn), // sem o mapa de utm_content
      criativos: { anuncios: anunciosSinteticos(), nomesDeAnuncio: {}, contaDeAnuncios: null, postsDosAnuncios: {} },
    });
    const m = au.midiaPorAnuncio!;
    expect(m.vendasComConteudo).toBe(false);
    expect(m.ranking[0]!.cpa.motivo).toBe("SEM_UTM_CONTENT_NA_VENDA");
    expect(m.atribuicao.semAdId).toBe(m.atribuicao.compradores);
  });

  it("o faturamento por linha é o do Motor I: Σ das linhas de captação = faturamento da captação", () => {
    const mtIn = entradaMtMidia(configSintetica());
    const mt = computeDebriefingMoneyTime(mtIn);
    const cap = higienizarVendasDoDebriefing(mtIn, conteudoDasVendas(mtIn)).filter((v) => v.grupo === "captacao");
    expect(cap.every((v) => v.centavos !== undefined)).toBe(true);
    expect(cap.reduce((s, v) => s + v.centavos!, 0) / 100).toBe(mt.captacao.faturamentoCaptacao.valor);
    // TMB conta a venda e soma 0 (como no Motor I).
    const tmb = higienizarVendasDoDebriefing(mtIn).filter((v) => v.planilhaId === "p-tmb");
    expect(tmb.map((v) => v.centavos)).toEqual([0]);
    expect(cap.find((v) => v.emailCru === "c6@x.com")!.dia).toBe("2026-04-21");
  });
});

describe("AC1 — bordas do motor puro", () => {
  const linhaDe = (adId: string, nome: string | null, dia = "2026-04-20"): AnuncioDiaDaMidia => ({
    adId,
    nome,
    campaignName: "x--vendas-captacao--hot--cbo--estaticos",
    dia,
    investimentoComImposto: 10,
    linkClicks: 5,
    landingPageViews: 4,
  });
  const rodar = (anuncios: AnuncioDiaDaMidia[], compradores: Parameters<typeof computeMidiaPorAnuncio>[0]["compradores"]) =>
    computeMidiaPorAnuncio({ anuncios, compradores, vendasComConteudo: true, postsDosAnuncios: {}, linkAdsManagerDe: () => null });

  it("Ad ID sem nome (nem no cache nem na linha): a linha é o próprio Ad ID, marcada como não resolvida", () => {
    const m = rodar([linhaDe(AD_C, null)], []);
    expect(m.ranking.map((r) => [r.nome, r.nomeNaoResolvido, r.adIds])).toEqual([[AD_C, true, [AD_C]]]);
  });

  it("nomes que só diferem no sufixo de cópia, maiúsculas ou acento são o MESMO anúncio", () => {
    const m = rodar([linhaDe(AD_A1, "Ad01 Criativo"), linhaDe(AD_A2, "ad01 criativo - Cópia"), linhaDe(AD_B, "ad01 críativo")], []);
    expect(m.ranking).toHaveLength(1);
    expect(m.ranking[0]!.adIds).toEqual([AD_A1, AD_A2, AD_B]);
    expect(m.ranking[0]!.investimentoComImposto).toBe(30);
  });

  it("comprador sem valor da venda → ROAS \"—\" (SEM_VALOR_DA_VENDA), CPA segue", () => {
    const m = rodar([linhaDe(AD_A1, NOME_A)], [{ adId: AD_A1, faturamento: null, tierSuperior: false, dia: "2026-04-20" }]);
    expect(m.ranking[0]!.roas).toMatchObject({ valor: null, motivo: "SEM_VALOR_DA_VENDA" });
    expect(m.ranking[0]!.cpa.valor).toBe(10);
  });

  it("comprador de peça de escassez sem data: fora dos dias, no total e contado à parte", () => {
    const m = rodar(
      [linhaDe(AD_ESC1, NOME_ESC1)],
      [
        { adId: AD_ESC1, faturamento: 99, tierSuperior: false, dia: null },
        { adId: AD_ESC1, faturamento: 99, tierSuperior: false, dia: "2026-04-20" },
      ],
    );
    expect(m.escassez.porDia.map((d) => [d.dia, d.compradores])).toEqual([["2026-04-20", 1]]);
    expect(m.escassez.compradoresSemData).toBe(1);
    expect(m.escassez.total.compradores).toBe(2);
    const p = final();
    p.publico.midiaPorAnuncio!.escassez.compradoresSemData = 1;
    expect(bloco(renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] }))).toContain("1 comprador(es) das peças sem data de compra legível");
  });

  it("dia de compra de peça sem linha de mídia no dia: o dia aparece com investimento 0", () => {
    const m = rodar([linhaDe(AD_ESC1, NOME_ESC1, "2026-04-20")], [{ adId: AD_ESC1, faturamento: 99, tierSuperior: true, dia: "2026-04-21" }]);
    expect(m.escassez.porDia.map((d) => [d.dia, d.investimentoComImposto, d.anunciosNoAr, d.compradores, d.soIngresso])).toEqual([
      ["2026-04-20", 10, [NOME_ESC1], 0, 0],
      ["2026-04-21", 0, [], 1, 0],
    ]);
  });

  it("ordem por investimento, não pelo Ad ID nem pelo nome", () => {
    const caro = { ...linhaDe(AD_C, "zz caro"), investimentoComImposto: 500 };
    const m = rodar([linhaDe(AD_A1, "aa barato"), caro], []);
    expect(m.ranking.map((r) => r.nome)).toEqual(["zz caro", "aa barato"]);
  });

  it("sem ad-level: não aplicável, sem linhas", () => {
    const m = rodar([], [{ adId: AD_A1, faturamento: 99, tierSuperior: false, dia: "2026-04-20" }]);
    expect(m).toMatchObject({ aplicavel: false, motivo: "SEM_AD_LEVEL", ranking: [], investimentoTotal: 0 });
    expect(m.atribuicao).toMatchObject({ compradores: 1, adIdForaDoAdLevel: 1 });
  });
});

// ---------------------------------------------------------------------------
// AC3 — estático × vídeo
// ---------------------------------------------------------------------------

describe("AC3 — estático × vídeo pelo nome da campanha, independente da dimensão", () => {
  it("o padrão de tipoPelaCampanha sem a condição da dimensão; tipoPelaCampanha continua igual", () => {
    expect(formatoPeloNomeDaCampanha("x--vendas-captacao--hot--cbo--videos--lpa")).toBe("video");
    expect(formatoPeloNomeDaCampanha("x--hot--cbo--estaticos-escassez--lpa")).toBe("estatico");
    expect(formatoPeloNomeDaCampanha("x--hot--cbo--Estáticos")).toBe("estatico");
    expect(formatoPeloNomeDaCampanha("x--hot--cbo--lpa")).toBeNull();
    expect(formatoPeloNomeDaCampanha("x--videos--estaticos")).toBeNull();
    expect(formatoPeloNomeDaCampanha(null)).toBeNull();
    // A função antiga: só na dimensão video-estatico.
    expect(tipoPelaCampanha("x--videos--lpa", "ia-humano")).toBeNull();
    expect(tipoPelaCampanha("x--videos--lpa", "video-estatico")).toBe("video");
    expect(tipoPelaCampanha("x--estaticos", "video-estatico")).toBe("estatico");
    expect(tipoPelaCampanha(null, "video-estatico")).toBeNull();
  });

  it("com a dimensão ia-humano da config: vídeo, estático e não identificado; nada descartado", () => {
    const m = midia(final());
    const f = Object.fromEntries(m.formatos.map((x) => [x.formato, x]));
    expect(f.video!.investimentoComImposto).toBeCloseTo(130 * FATOR, 9); // B (80 + 40) + C (10)
    expect(f.estatico!.investimentoComImposto).toBeCloseTo(195 * FATOR, 9); // A1 + A2 + escassez 1
    expect(f["nao-identificado"]!.investimentoComImposto).toBeCloseTo(20 * FATOR, 9); // escassez 2, campanha sem formato
    expect(m.formatos.reduce((s, x) => s + x.investimentoComImposto, 0)).toBeCloseTo(m.investimentoTotal, 9);
    expect([f.video!.compradores, f.estatico!.compradores, f["nao-identificado"]!.compradores]).toEqual([2, 3, 1]);
    expect(f.video!.linkClicks).toBe(44);
    expect(f.video!.conversaoDoClique.valor).toBeCloseTo((2 / 44) * 100, 9);
    expect(f.estatico!.cpa.valor).toBeCloseTo((195 * FATOR) / 3, 9);
    expect(f.estatico!.roas.valor).toBeCloseTo((99 + 47 + 297 + 99) / (195 * FATOR), 9);
  });
});

// ---------------------------------------------------------------------------
// AC4 — frio ADV+
// ---------------------------------------------------------------------------

describe("AC4 — cold-adv separado dentro do frio, só nesta análise", () => {
  it("publicoDaCampanha: a regra do Quente × Frio, com cold-adv à parte", () => {
    expect(publicoDaCampanha("dg-pg05--vendas-captacao--cold-adv--cbo--videos")).toBe("Frio ADV+");
    expect(publicoDaCampanha("dg-pg05--vendas-captacao--COLD-ADV--cbo")).toBe("Frio ADV+");
    expect(publicoDaCampanha("dg-pg05--vendas-captacao--cold--cbo")).toBe("Frio");
    expect(publicoDaCampanha("dg-pg05--vendas-captacao--hot--cbo")).toBe("Quente");
    expect(publicoDaCampanha("dg-pg05--vendas-captacao--cbo")).toBe("Indefinido");
  });

  it("a tabela por público soma o investimento; o classificador compartilhado não conhece ADV+", () => {
    const m = midia(final());
    const p = Object.fromEntries(m.publicos.map((x) => [x.publico, x]));
    expect(p["Frio ADV+"]!.investimentoComImposto).toBeCloseTo(50 * FATOR, 9);
    expect(p["Frio ADV+"]!.compradores).toBe(1);
    expect(p.Frio!.investimentoComImposto).toBeCloseTo(120 * FATOR, 9);
    expect(p.Quente!.compradores).toBe(3);
    expect(m.publicos.reduce((s, x) => s + x.investimentoComImposto, 0)).toBeCloseTo(m.investimentoTotal, 9);
    const c = classificarOrigem(
      { lead: { source: "fb", medium: "paid", campaign: "1", campaignName: "x--vendas-captacao--cold-adv--cbo", term: null }, venda: null, sellerName: null },
      { closerMediums: [], closerNomes: [], closerPorSellerName: false, ferramentasDeAtendimento: [] },
    );
    expect(String(c.canal)).not.toMatch(/adv/i);
  });
});

// ---------------------------------------------------------------------------
// AC5 — peças de escassez (R11-5: só no nome do anúncio)
// ---------------------------------------------------------------------------

describe("AC5 — peças de escassez pelo nome do anúncio, por dia de veiculação", () => {
  it("a constante única dos termos (a do método)", () => {
    // R11-5 + R12-5 (P-24): "falta" no singular entra como termo próprio.
    expect([...TERMOS_DE_ESCASSEZ]).toEqual(["faltam", "falta", "último dia", "últimas horas"]);
  });

  it("sem diferenciar maiúsculas, acentos nem o separador; palavra inteira", () => {
    for (const n of [
      "ad07-dg-pg05-out26--lote-promo--ultimo-dia",
      "ad07--lote-promo--último-dia",
      "AD09 ULTIMAS HORAS",
      "ad09_últimas_horas",
      "ad05-dg-pg05-out26--lote-promo--faltam-4-dias",
      "Faltam 3 dias",
    ]) {
      expect(ehPecaDeEscassez(n), n).toBe(true);
    }
    for (const n of ["ad10-dg-pg05-out26--delegue-60-da-sua-producao", "faltamento", "faltas-de-tempo", "ultimos dias", "ultimo-diario", null, ""]) {
      expect(ehPecaDeEscassez(n), String(n)).toBe(false);
    }
    // R12-5 (P-24): a peça do PG05 no singular é escassez; "faltam" e "falta" casam cada um como palavra inteira.
    expect(ehPecaDeEscassez("ad02-dg-pg05-out26--lote-promo--falta-1-dia")).toBe(true);
    expect(ehPecaDeEscassez("FALTA 1 DIA")).toBe(true);
  });

  it("saem do ranking e vão para a tabela própria: investimento, compradores e só ingresso por dia", () => {
    const m = midia(final());
    expect(m.ranking.some((r) => r.adIds.includes(AD_ESC1) || r.adIds.includes(AD_ESC2))).toBe(false);
    expect(m.escassez.anuncios).toEqual([
      { nome: NOME_ESC2, adIds: [AD_ESC2] },
      { nome: NOME_ESC1, adIds: [AD_ESC1] },
    ]);
    expect(m.escassez.porDia.map((d) => [d.dia, d.anunciosNoAr, d.compradores, d.soIngresso, d.parcelaSoIngresso.valor])).toEqual([
      ["2026-04-20", [NOME_ESC1], 1, 1, 1], // c3, ingresso
      ["2026-04-21", [NOME_ESC2, NOME_ESC1], 1, 0, 0], // c6, combo
    ]);
    expect(m.escassez.porDia[0]!.investimentoComImposto).toBeCloseTo(30 * FATOR, 9);
    expect(m.escassez.porDia[1]!.investimentoComImposto).toBeCloseTo(35 * FATOR, 9);
    expect(m.escassez.total).toMatchObject({ compradores: 2, soIngresso: 1 });
    expect(m.escassez.total.parcelaSoIngresso.valor).toBe(0.5);
  });

  it("no documento: a tabela por dia, com D+x, fora do ranking", async () => {
    const { html } = await gerar({ modo: "final", comparacao: null });
    const b = bloco(html);
    expect(linhasDaTabela(b, "Ranking por nome de anúncio").some((l) => /último-dia|ULTIMAS HORAS/.test(l))).toBe(false);
    const dias = linhasDaTabela(b, "Peças de escassez, por dia de veiculação");
    expect(dias).toEqual([
      "Dia | Peças no ar | Invest. (c/ imposto) | Compradores | Só ingresso | % só ingresso",
      "20/04 D+3 | ad07--lote-promo--último-dia | R$ 34,15 | 1 | 1 | 100,0%",
      `21/04 D+4 | ${NOME_ESC2}, ${NOME_ESC1} | R$ 39,84 | 1 | 0 | 0,0%`,
      "Total |  | R$ 73,99 | 2 | 1 | 50,0%",
    ]);
  });

  it("R12-5: a peça `falta-1-dia` (PG05) sai do ranking e entra na escassez", () => {
    const FALTA = "ad02-dg-pg05-out26--lote-promo--falta-1-dia";
    const m = computeMidiaPorAnuncio({
      anuncios: [
        { adId: AD_A1, nome: FALTA, campaignName: "x--hot--cbo--estaticos", dia: "2026-10-06", investimentoComImposto: 99, linkClicks: 3, landingPageViews: 6 },
        { adId: AD_C, nome: NOME_C, campaignName: "x--hot--cbo--estaticos", dia: "2026-10-06", investimentoComImposto: 10, linkClicks: 1, landingPageViews: 1 },
      ],
      compradores: [],
      vendasComConteudo: true,
      postsDosAnuncios: {},
      linkAdsManagerDe: () => null,
    });
    expect(m.ranking.map((r) => r.nome)).toEqual([NOME_C]);
    expect(m.escassez.anuncios).toEqual([{ nome: FALTA, adIds: [AD_A1] }]);
    expect(m.escassez.porDia.map((d) => [d.dia, d.investimentoComImposto])).toEqual([["2026-10-06", 99]]);
  });

  it("sem peça de escassez: a nota com os termos, sem tabela", async () => {
    const m = computeMidiaPorAnuncio({
      anuncios: [{ adId: AD_C, nome: NOME_C, campaignName: "x--hot", dia: "2026-04-20", investimentoComImposto: 1, linkClicks: 1, landingPageViews: 1 }],
      compradores: [],
      vendasComConteudo: true,
      postsDosAnuncios: {},
      linkAdsManagerDe: () => null,
    });
    expect(m.escassez.anuncios).toEqual([]);
    expect(m.escassez.porDia).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC6 — copy igual
// ---------------------------------------------------------------------------

describe("AC6 — copy pelo title + body do cache", () => {
  const ids = [AD_A1, AD_A2, AD_B, AD_C, AD_ESC1, AD_ESC2];
  const todos = (t: { title: string | null; body: string | null }): TextosDaFixture => Object.fromEntries(ids.map((id) => [id, t]));

  it("todos iguais → a diferença de resultado vem só da imagem", () => {
    const c = copyDosAnuncios(ids, todos({ title: "Imersão", body: "Vem" }));
    expect(c).toMatchObject({ anuncios: 6, comTexto: 6, textoIndisponivel: 0, copiesDistintas: 1, veredito: "so-imagem" });
    expect(c.texto).toContain("só da imagem");
  });

  it("body diferente (title igual) → quantas copies diferentes", () => {
    const t = todos({ title: "Imersão", body: "Vem" });
    t[AD_B] = { title: "Imersão", body: "Outro" };
    t[AD_C] = { title: "Outro", body: "Vem" };
    const c = copyDosAnuncios(ids, t);
    expect(c).toMatchObject({ comTexto: 6, copiesDistintas: 3, veredito: "copies-diferentes" });
    expect(c.texto).toContain("3 copies diferentes");
  });

  it("anúncio sem texto conta como \"texto indisponível\", e o documento diz quantos", () => {
    const t = todos({ title: "Imersão", body: "Vem" });
    t[AD_B] = { title: null, body: null };
    t[AD_C] = { title: "  ", body: "" };
    delete t[AD_ESC2];
    const c = copyDosAnuncios(ids, t);
    expect(c).toMatchObject({ comTexto: 3, textoIndisponivel: 3, copiesDistintas: 1, veredito: "so-imagem" });
    expect(c.texto).toContain("3 anúncio(s) com texto indisponível");
  });

  it("nenhum texto, um só texto e texto não lido", () => {
    expect(copyDosAnuncios(ids, {}).veredito).toBe("sem-texto");
    expect(copyDosAnuncios(ids, { [AD_A1]: { title: "x", body: null } }).veredito).toBe("um-anuncio-com-texto");
    expect(copyDosAnuncios(ids, undefined).veredito).toBe("nao-lido");
  });

  it("pelo motor e no documento (só os Ad IDs do ad-level)", async () => {
    const t = todos({ title: "Imersão", body: "Vem" });
    t[AD_B] = { title: null, body: null };
    t["120200000000000777"] = { title: "fora do ad-level", body: "x" };
    const { html, payload } = await gerar({ modo: "final", comparacao: null, textos: t });
    expect(midia(payload).copy).toMatchObject({ anuncios: 6, comTexto: 5, textoIndisponivel: 1, copiesDistintas: 1, veredito: "so-imagem" });
    expect(bloco(html)).toContain("a diferença de resultado entre eles vem só da imagem. 1 anúncio(s) com texto indisponível no cache.");
  });
});

// ---------------------------------------------------------------------------
// AC7 — comparação principal no mesmo D+N
// ---------------------------------------------------------------------------

describe("AC7 — ranking e estático × vídeo com a comparação principal", () => {
  it("parcial: a comparação cortada no mesmo D+N (D+4) dos dois lados", async () => {
    const { html, payload } = await gerar({ modo: "parcial", comparacao: "recalculada" });
    const m = midia(payload);
    // O atual não vê o B de 25/04 nem a venda do c9 (depois do corte).
    expect(linha(m, NOME_B).investimentoComImposto).toBeCloseTo(80 * FATOR, 9);
    expect(m.atribuicao.compradores).toBe(7);
    const b = bloco(html);
    const tot = linhasDaTabela(b, "Ranking por nome de anúncio").filter((l) => l.startsWith("Total"));
    // Comparação: mídia × 2 e sem c7/c9; o B de 25/04 também fica fora do lado dela.
    expect(tot).toEqual([
      "Total PG05 |  |  | R$ 273,19 | 78,7% | 3 | R$ 91,06 | 1,98 | 66,7% | 3,85% |",
      "Total PG04 (mesmo D+N: até 21/04/26 (D+4 dele)) |  |  | R$ 546,39 | 78,7% | 2 | R$ 273,19 | 0,81 | 100,0% | 3,85% |",
    ]);
    const f = linhasDaTabela(b, "Estático × vídeo");
    expect(f[0]).toBe("Lançamento | Formato | Anúncios | Invest. (c/ imposto) | % da verba | Compradores | CPA | ROAS | Link clicks | Conversão do clique");
    expect(f[1]).toBe("PG04 (mesmo D+N: até 21/04/26 (D+4 dele)) | Vídeo | 2 | R$ 204,89 | 29,5% | 0 | — | 0,00 | 34 | 0,00%");
    expect(f[4]).toBe("PG05 | Vídeo | 2 | R$ 102,45 | 29,5% | 1 | R$ 102,45 | 0,97 | 34 | 2,94%");
  });

  it("final: a comparação inteira, sem o rótulo de D+N", async () => {
    const { html } = await gerar({ modo: "final", comparacao: "recalculada" });
    const tot = linhasDaTabela(bloco(html), "Ranking por nome de anúncio").filter((l) => l.startsWith("Total"));
    expect(tot[1]).toBe("Total PG04 |  |  | R$ 637,45 | 81,2% | 2 | R$ 318,73 | 0,69 | 100,0% | 3,85% |");
  });

  it("relatório salvo antes da 49.18: \"—\" com nota, nunca zero", async () => {
    const { html } = await gerar({ modo: "final", comparacao: "salva-antiga" });
    const b = bloco(html);
    const tot = linhasDaTabela(b, "Ranking por nome de anúncio").filter((l) => l.startsWith("Total"));
    expect(tot[1]).toBe("Total PG04 |  |  | — | — | — | — | — | — | — |");
    expect(linhasDaTabela(b, "Estático × vídeo")[1]).toBe("PG04 | — | — | — | — | — | — | — | — | —");
    expect(b).toContain("Comparação sem número:</b> o relatório de PG04 usado na comparação foi gerado antes da mídia por anúncio existir");
  });

  it("comparação sem ad-level no período: \"—\" com nota", () => {
    const atual = final();
    const comp = payloadMidia({ ...configSintetica(), funnelId: "fb" }, { lado: "comparacao", semAdLevel: true });
    const html = renderDebriefing({ payload: atual, comparacao: { funnelId: "fb", nome: "PG02", payload: comp, origem: { tipo: "recalculada" } }, rotulos: ROT, alertas: [] });
    expect(bloco(html)).toContain("PG02 não tem ad-level no banco para o período");
    expect(linhasDaTabela(bloco(html), "Ranking por nome de anúncio").filter((l) => l.startsWith("Total"))[1]).toBe("Total PG02 |  |  | — | — | — | — | — | — | — |");
  });

  it("parcial com comparação só de relatório salvo: sem comparação no mesmo D+N, dito no bloco", async () => {
    const { html } = await gerar({ modo: "parcial", comparacao: "salva-antiga" });
    expect(bloco(html)).toContain("Sem comparação no mesmo D+N:</b> PG04 só tem relatório salvo");
  });
});

// ---------------------------------------------------------------------------
// AC8 — parcial e final; as seções antigas não mudam
// ---------------------------------------------------------------------------

/**
 * SHA do HTML INTEIRO e do payload no commit-base `c0a63eb4` (antes da story)
 * e de novo na `origin/main` @ `0f237e62` (a 49.17 mergeada, base depois do rebase: os mesmos SHA),
 * pelo `gerarDebriefing` sobre esta fixture e com o relógio fixado (script
 * `ac8-4918.mts`). Depois da story: o HTML sem o bloco da 49.18 e o payload
 * sem `publico.midiaPorAnuncio` dão os MESMOS SHA — cabeçalho, avisos, resumo
 * macro, as 18 seções, rodapé e o `const D` intocados.
 */
const SHA_DO_BASE: Record<string, { html: string; payload: string }> = {
  "final-edicao-unica": { html: "d0994ae2e87638a42ba673db9d636bd4d99155005ab6331a82b3084827de88cc", payload: "143b2a4a7eb3db7d7ce72e0827eae4363c8aa9385253fd574f7ce7e536ff0f61" },
  "final-comparacao-recalculada": { html: "993dc1d2dce4972b0b3dbd78f678a9e78c9d98df1ad4b29fd5755634191d4719", payload: "12e7536c4eb7b0dc9ce50bcc3239e893ae10bbf064df842842e2368a34a786ec" },
  "final-comparacao-salva-antiga": { html: "a94fb38c9ccae7c9b2f043654bc10c05c2b6dffb23c6cd6b15483efa27344625", payload: "4133158a7855cfef11c9c0ee7cb01f8062779dbe42b78e477f26f4c3d5114e4e" },
  "parcial-edicao-unica": { html: "4098811210184ad878f6bcbe2ad93468cecc37813097ac5c36e836019e7e77fc", payload: "7710689cd90a55a5c2dfd95e21c0d1502c4c4139d6d41b5d9ecf05eaf2768b04" },
  "parcial-comparacao-recalculada": { html: "4e51d227bf63cd785101d2f8b5584cd20db0ced6b2459b86ece5723d9f0e9a5a", payload: "f096313c9677d869444574c326ba70fd94d90c4d0630099f5e9e75dd30791828" },
  "parcial-comparacao-salva": { html: "867433e9e9d86d008c1e5d5de0e95ffdfee39f7a5aa0a6edef51df334c5239be", payload: "12242f83324bff10b5caf6e1659099a4d3d0438c1d45f546ea77b526949172f3" },
  "final-sem-ad-level": { html: "30354d2b252c6f85266ae907c061cb316f0ad9f4f31a86134768231573af25b2", payload: "ee0c82df44a925ae9bb83fae50fad146f0c420cdaea55aab07a1db087b90b71a" },
};

describe("AC8 — vale no parcial e no final; o resto do documento não muda", () => {
  it.each(Object.keys(CENARIOS_DO_AC8))("%s: HTML inteiro sem o bloco e payload sem o campo novo = os do commit-base", async (nome) => {
    const { html, payload } = await gerar(CENARIOS_DO_AC8[nome]!);
    expect(sha(html)).not.toBe(SHA_DO_BASE[nome]!.html);
    expect(sha(semO4918(html))).toBe(SHA_DO_BASE[nome]!.html);
    const p = structuredClone(payload);
    expect(p.publico.midiaPorAnuncio).toBeDefined();
    delete p.publico.midiaPorAnuncio;
    expect(sha(JSON.stringify(p))).toBe(SHA_DO_BASE[nome]!.payload);
  });

  it("por título: as 18 seções iguais com e sem o campo novo, no final e no parcial, com comparação", async () => {
    for (const c of [CENARIOS_DO_AC8["final-comparacao-recalculada"]!, CENARIOS_DO_AC8["parcial-comparacao-recalculada"]!]) {
      const d = depsDaMidia(c, configSintetica());
      await gerarDebriefing(d, PARAMS_DA_MIDIA);
      const novo = d.gravados[0]!.payload;
      const antigo = structuredClone(novo);
      delete antigo.publico.midiaPorAnuncio;
      const rot = { ...ROT, funis: { "20000000-0000-4000-8000-000000000002": "PG04" } };
      const comp = { funnelId: "20000000-0000-4000-8000-000000000002", nome: "PG04", payload: novo, origem: { tipo: "recalculada" as const } };
      const hn = secoesPorTitulo(renderDebriefing({ payload: novo, comparacao: comp, rotulos: rot, alertas: [] }));
      const ha = secoesPorTitulo(renderDebriefing({ payload: antigo, comparacao: { ...comp, payload: antigo }, rotulos: rot, alertas: [] }));
      expect([...hn.keys()]).toEqual([...SECOES_DO_DEBRIEFING]);
      for (const t of SECOES_DO_DEBRIEFING) expect(hn.get(t), t).toBe(ha.get(t));
    }
  });

  it("o bloco entra na aba de mídia, depois do Quente × Frio e antes de Vendas do Principal, fora da numeração", async () => {
    for (const c of [CENARIOS_DO_AC8["final-edicao-unica"]!, CENARIOS_DO_AC8["parcial-edicao-unica"]!]) {
      const { html } = await gerar(c);
      const aba = html.split('id="tab-midia"')[1]!.split('<div class="tab')[0]!;
      const iQF = aba.indexOf('data-secao="Quente × Frio"');
      const iBloco = aba.indexOf(`<section ${MARCA_DA_MIDIA_POR_ANUNCIO}>`);
      const iVendas = aba.indexOf('data-secao="Vendas do Principal"');
      expect(iQF).toBeGreaterThan(-1);
      expect(iBloco).toBeGreaterThan(iQF);
      expect(iVendas).toBeGreaterThan(iBloco);
      expect(bloco(html)).not.toContain("sec-num");
      const nums = [...html.matchAll(/<span class="sec-num">(\d{2})<\/span>/g)].map((m) => m[1]);
      expect(nums).toEqual(SECOES_DO_DEBRIEFING.map((_, i) => String(i).padStart(2, "0")));
    }
  });

  it("sem ad-level: o bloco declara a lacuna (nunca tabela de zeros)", async () => {
    const { html, payload } = await gerar({ modo: "final", comparacao: null, semAdLevel: true });
    expect(midia(payload)).toMatchObject({ aplicavel: false, motivo: "SEM_AD_LEVEL" });
    expect(bloco(html)).toContain("sem ad-level no banco para o período");
    expect(bloco(html)).not.toContain("<table");
  });

  it("payload salvo antes da 49.18 (sem o campo): o bloco diz que não foi calculado", () => {
    const p = final();
    delete p.publico.midiaPorAnuncio;
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    expect(bloco(html)).toContain("Mídia por anúncio não calculada");
  });
});

// ---------------------------------------------------------------------------
// AC9 — chamadores: orquestrador de ponta a ponta e render a partir do payload
// ---------------------------------------------------------------------------

describe("AC9 — chamadores", () => {
  it("gerarDebriefing: o payload gravado traz a mídia por anúncio do Motor II e o documento a mostra", async () => {
    const { html, payload } = await gerar({ modo: "final", comparacao: null });
    const m = midia(payload);
    expect(m.ranking.map((r) => [r.nome, r.compradores])).toEqual([
      [NOME_A, 2],
      [NOME_B, 2],
      [NOME_C, 0],
    ]);
    const linhas = linhasDaTabela(bloco(html), "Ranking por nome de anúncio");
    expect(linhas[0]).toBe("Anúncio | Público | Formato | Invest. (c/ imposto) | % da verba | Compradores | CPA | ROAS | Tier superior | Compra a cada visita | Post");
    expect(linhas.slice(1)).toEqual([
      `${NOME_A} (2 Ad IDs) | Quente + Frio ADV+ | Estático | R$ 170,75 | 43,5% | 2 | R$ 85,37 | 2,59 | 100,0% | 4,00% | Instagram`,
      // AC2: das duas versões (A1: CPA R$ 113,83; A2: CPA R$ 56,92), a A2.
      `↳ melhor versão isolada Ad ID ${AD_A2} · conjunto cj-cold-adv |  |  | R$ 56,92 | 14,5% | 1 | R$ 56,92 | 5,22 | 100,0% | 10,00% | Instagram`,
      `${NOME_B} | Frio | Vídeo | R$ 136,60 | 34,8% | 2 | R$ 68,30 | 1,45 | 0,0% | — | Facebook`,
      `↳ melhor versão isolada Ad ID ${AD_B} · conjunto cj-cold |  |  | R$ 136,60 | 34,8% | 2 | R$ 68,30 | 1,45 | 0,0% | — | Facebook`,
      `${NOME_C} | Quente | Vídeo | R$ 11,38 | 2,9% | 0 | — | 0,00 | — | 0,00% | Ads Manager`,
      // R$ 11,38 < 5% de R$ 228,80 (captação do Motor I) = R$ 11,44.
      "↳ melhor versão isolada nenhuma versão com ≥ 5% do investimento de captação |  |  |  |  |  |  |  |  |  |",
      "Total PG05 |  |  | R$ 318,73 | 81,2% | 4 | R$ 79,68 | 2,01 | 50,0% | 3,85% |",
    ]);
    expect(bloco(html)).toContain("compradores de captação 8 = no ranking 4 + peças de escassez 2 + ad_id fora do ad-level de captação 1 + sem ad_id no utm_content 1");
    const pub = linhasDaTabela(bloco(html), "Por público");
    expect(pub[3]).toBe("Frio ADV+ | 1 | R$ 56,92 | 14,5% | 1 | R$ 56,92 | 5,22 | 5,00%");
  });

  it("o render lê o payload (não recalcula): um número trocado no payload aparece no documento", () => {
    const p = final();
    const m = midia(p);
    m.ranking[0]!.investimentoComImposto = 123456.78;
    m.escassez.porDia[0]!.compradores = 42;
    m.formatos[0]!.anuncios = 77;
    m.copy.texto = "TEXTO DO PAYLOAD";
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    const b = bloco(html);
    expect(linhasDaTabela(b, "Ranking por nome de anúncio")[1]).toContain("R$ 123.456,78");
    expect(linhasDaTabela(b, "Peças de escassez, por dia de veiculação")[1]).toContain("| 42 |");
    expect(linhasDaTabela(b, "Estático × vídeo")[1]).toContain("Vídeo | 77 |");
    expect(b).toContain("TEXTO DO PAYLOAD");
  });

  it("o motor puro recebe o ad-level com o imposto por dia e o nome do cache antes do da linha", () => {
    const anuncio = (dia: string): AnuncioDiaDaMidia => ({ adId: AD_A1, nome: NOME_A, campaignName: "x--hot", dia, investimentoComImposto: 10, linkClicks: 1, landingPageViews: 1 });
    const m = computeMidiaPorAnuncio({ anuncios: [anuncio("2026-04-20")], compradores: [], vendasComConteudo: true, postsDosAnuncios: {}, linkAdsManagerDe: () => null });
    expect(m.investimentoTotal).toBe(10);
    // Pelo Motor II: o nome do cache vence o da linha.
    const mtIn = entradaMtMidia(configSintetica());
    const mt = computeDebriefingMoneyTime(mtIn);
    const au = computeDebriefingAudience({
      ...entradaAudienceSintetica(mtIn),
      janela: mt.janela,
      compradores: higienizarVendasDoDebriefing(mtIn, conteudoDasVendas(mtIn)),
      criativos: {
        anuncios: [{ adId: AD_A1, adName: "nome da linha", campaignId: "c", campaignName: "x--hot", dia: "2026-04-20", spendBruto: 100, impressoes: 1, linkClicks: 1 }],
        nomesDeAnuncio: { [AD_A1]: "nome do cache" },
        contaDeAnuncios: null,
        postsDosAnuncios: {},
      },
    });
    expect(au.midiaPorAnuncio!.ranking.map((r) => r.nome)).toEqual(["nome do cache"]);
    expect(au.midiaPorAnuncio!.investimentoTotal).toBeCloseTo(100 * FATOR, 9);
    expect(au.midiaPorAnuncio!.ranking[0]!.compradores).toBe(1); // c1 → AD_A1
  });
});

// ---------------------------------------------------------------------------
// QA 49.18 TEST-001 — um teste por item das listas e o chamador do Motor II
// ---------------------------------------------------------------------------

describe("QA TEST-001 — itens das listas de público e a chave do comprador no chamador", () => {
  it("E14: só cold-adv dentro do frio é ADV+; \"adv\" fora do frio não", () => {
    expect(publicoDaCampanha("x--vendas-captacao--hot-adv--cbo")).toBe("Quente");
    expect(publicoDaCampanha("x--vendas-captacao--adv--cbo")).toBe("Indefinido");
    expect(publicoDaCampanha("adv02--ia--x--vendas-captacao--cold--cbo")).toBe("Frio");
  });

  it("E8: a tabela por público tem as 4 linhas, e a do Indefinido leva o investimento dela", () => {
    const l = (adId: string, campaignName: string, inv: number): AnuncioDiaDaMidia => ({
      adId,
      nome: `n-${adId}`,
      campaignName,
      dia: "2026-04-20",
      investimentoComImposto: inv,
      linkClicks: 10,
      landingPageViews: 5,
    });
    const m = computeMidiaPorAnuncio({
      anuncios: [l("1200000000001", "x--vendas-captacao--hot--cbo", 30), l("1200000000002", "x--vendas-captacao--cbo", 70)],
      compradores: [],
      vendasComConteudo: true,
      postsDosAnuncios: {},
      linkAdsManagerDe: () => null,
    });
    expect([...PUBLICOS_DA_MIDIA]).toEqual(["Quente", "Frio", "Frio ADV+", "Indefinido"]);
    expect(m.publicos.map((x) => x.publico)).toEqual(["Quente", "Frio", "Frio ADV+", "Indefinido"]);
    expect(m.publicos.find((x) => x.publico === "Indefinido")!.investimentoComImposto).toBe(70);
    expect(m.publicos.reduce((s, x) => s + x.investimentoComImposto, 0)).toBe(100);
  });

  it("E10: identidade unida (bump com outro e-mail e o mesmo telefone) — o comprador é o do critério headline (e-mail), e o ROAS sai", () => {
    const p = final({ identidadeUnida: true });
    const m = midia(p);
    const b = linha(m, NOME_B);
    // c7 + c9 + c10 pelo anúncio B; o bump do outro e-mail é avulso (como no Motor I) e não soma.
    expect(b.compradores).toBe(3);
    expect(b.faturamento).toBe(99 * 3);
    expect(b.roas.motivo).toBeUndefined();
    expect(b.roas.valor).toBeCloseTo(297 / (120 * FATOR), 9);
    expect(b.tierSuperior.valor).toBe(0);
    expect(m.atribuicao.compradores).toBe(p.dinheiroTempo.ingressosUnicos);
  });
});

// ---------------------------------------------------------------------------
// AC2 (R12-3) — melhor versão isolada
// ---------------------------------------------------------------------------

describe("AC2 (R12-3) — melhor versão isolada: menor CPA entre as com ≥ 5% da captação do lançamento; ROAS desempata", () => {
  /** Um nome com as versões dadas: [adId, investimento, compradores, faturamento por comprador]. */
  const nome = (versoes: [string, number, number, number][]) =>
    computeMidiaPorAnuncio({
      anuncios: versoes.map(([adId, inv]) => ({
        adId,
        nome: "ad01 nome",
        campaignName: "x--vendas-captacao--hot--cbo--estaticos",
        dia: "2026-04-20",
        investimentoComImposto: inv,
        linkClicks: 10,
        landingPageViews: 10,
        conjuntoId: `cj-${adId}`,
        conjuntoNome: `conjunto ${adId.slice(-2)}`,
      })),
      compradores: versoes.flatMap(([adId, , n, fat]) => Array.from({ length: n }, () => ({ adId, faturamento: fat, tierSuperior: false, dia: "2026-04-20" }))),
      vendasComConteudo: true,
      postsDosAnuncios: {},
      linkAdsManagerDe: (id) => `ads:${id}`,
    });
  const melhor = (versoes: [string, number, number, number][], captacao: number) => comMelhorVersao(nome(versoes), captacao).ranking[0]!.melhorVersao!;
  const V1 = "120300000000000001";
  const V2 = "120300000000000002";
  const V3 = "120300000000000003";

  it("menor CPA vence (mesmo com ROAS menor)", () => {
    // V1: CPA 50, ROAS 2 · V2: CPA 60, ROAS 5. Mínimo: 5% de 1.000 = 50.
    const mv = melhor([[V1, 100, 2, 100], [V2, 60, 1, 300]], 1000);
    expect(mv.versao!.adId).toBe(V1);
    expect(mv.versao).toMatchObject({ conjuntoId: `cj-${V1}`, conjuntoNome: "conjunto 01", compradores: 2, linkAdsManager: `ads:${V1}` });
    expect(mv.versao!.cpa.valor).toBe(50);
    expect(mv.elegiveis).toBe(2);
  });

  it("CPA empatado: vence o maior ROAS; ROAS empatado também: o menor Ad ID", () => {
    // V1 e V2: CPA 50; V2 com ROAS maior (100 ÷ 50 = 2 contra 50 ÷ 100 × 2 = 1).
    expect(melhor([[V1, 100, 2, 50], [V2, 50, 1, 100]], 1000).versao!.adId).toBe(V2);
    // V3 e V2 idênticos em CPA e ROAS: o menor Ad ID (V2), seja qual for a ordem de entrada.
    expect(melhor([[V3, 100, 2, 100], [V2, 100, 2, 100]], 1000).versao!.adId).toBe(V2);
  });

  it("abaixo de 5% da captação do lançamento não é escolhida, mesmo com CPA menor; exatamente 5% é elegível", () => {
    // V1: CPA 10 com 40 (< 50 = 5% de 1.000) · V2: CPA 50 com 100.
    expect(melhor([[V1, 40, 4, 99], [V2, 100, 2, 99]], 1000).versao!.adId).toBe(V2);
    // Exatamente 50 = 5% de 1.000: entra (≥).
    expect(melhor([[V1, 50, 5, 99], [V2, 100, 2, 99]], 1000).versao!.adId).toBe(V1);
  });

  it("a base é o investimento de captação do LANÇAMENTO, não o do nome", () => {
    // O nome soma 640: 5% dele (32) deixaria o V1 (40, CPA 10) entrar; 5% da captação (1.000) = 50, não.
    expect(melhor([[V1, 40, 4, 99], [V2, 600, 10, 99]], 1000).versao!.adId).toBe(V2);
  });

  it("nome sem versão elegível: nenhuma escolhida, com o motivo — e o documento diz", () => {
    const mv = melhor([[V1, 40, 4, 99], [V2, 30, 3, 99]], 1000);
    expect(mv).toMatchObject({ versao: null, motivo: "SEM_VERSAO_ELEGIVEL", elegiveis: 0 });
    expect(mv.memoria).toContain("nenhuma versão com ≥ 5% do investimento de captação");
  });

  it("CPA nulo (sem comprador) nunca é a melhor; só versões sem comprador → motivo próprio", () => {
    expect(melhor([[V1, 500, 0, 0], [V2, 100, 1, 99]], 1000).versao!.adId).toBe(V2);
    expect(melhor([[V1, 500, 0, 0]], 1000)).toMatchObject({ versao: null, motivo: "SEM_COMPRADOR_NAS_ELEGIVEIS", elegiveis: 1 });
  });

  it("composição: a base é a captação do Motor I e cada linha do ranking traz a escolha", () => {
    const p = final();
    const m = midia(p);
    expect(m.criterioDaMelhorVersao).toMatchObject({ limiar: 0.05, investimentoDeCaptacao: p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto });
    expect(m.ranking.map((l) => [l.nome, l.melhorVersao!.versao?.adId ?? l.melhorVersao!.motivo])).toEqual([
      [NOME_A, AD_A2],
      [NOME_B, AD_B],
      [NOME_C, "SEM_VERSAO_ELEGIVEL"],
    ]);
    expect(linha(m, NOME_A).versoes.map((v) => [v.adId, v.conjuntoNome, v.compradores])).toEqual([
      [AD_A1, "cj-hot", 1],
      [AD_A2, "cj-cold-adv", 1],
    ]);
  });

  it("render a partir do payload completo: a versão que vier no payload é a mostrada", () => {
    const p = final();
    const a = linha(midia(p), NOME_A);
    a.melhorVersao = { ...a.melhorVersao!, versao: a.versoes[0]! }; // troca a escolha no payload
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] });
    const l = linhasDaTabela(bloco(html), "Ranking por nome de anúncio");
    expect(l[2]).toBe(`↳ melhor versão isolada Ad ID ${AD_A1} · conjunto cj-hot |  |  | R$ 113,83 | 29,0% | 1 | R$ 113,83 | 1,28 | 100,0% | 2,50% | Ads Manager`);
    // Sem a escolha no payload (gerado antes do AC2), nenhuma linha de versão.
    delete a.melhorVersao;
    const sem = linhasDaTabela(bloco(renderDebriefing({ payload: p, comparacao: null, rotulos: ROT, alertas: [] })), "Ranking por nome de anúncio");
    expect(sem[2]!.startsWith(NOME_B)).toBe(true);
  });
});
