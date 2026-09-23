import { describe, expect, it } from "vitest";
import { atribuirLpFunnel, type PessoaDaPlanilha } from "../utils/lp-funnel-atribuicao.js";

/**
 * Story 18.83 (AC9) — o mini-funil da LP chaveia pela URL do anúncio.
 *
 * `urlDoAnuncio` é o mapa `ad_id → URL` (cache + correção). Os ids e URLs são
 * os do `bbe-pr2`: a leva03 (`120247625370600489`) está numa campanha
 * `…videos-lpa` e leva à captura-d.
 */

const A = "lps.netaobombeef.com/bbepr2-captura-a";
const D = "lps.netaobombeef.com/bbepr2-captura-d";
const VENDAS = "lps.netaobombeef.com/bbepr2-vendas";

const URLS: Record<string, string> = {
  "120247233964490489": A,
  "120247625370600489": D, // leva03: campanha …videos-lpa → captura-d
  "999-vendas": VENDAS,
};
const urlDoAnuncio = (id: string) => URLS[id] ?? null;

const p = (email: string, adId = "", phone = ""): PessoaDaPlanilha => ({ email, phone, adId });

describe("atribuirLpFunnel — UTM própria é o utm_content → URL (PO-09)", () => {
  it("o lead da leva03 vai para a captura-d, não para a 'LPA' da campanha", () => {
    // Mutação: voltar à letra do term/campanha → o lead iria para "LPA" e a
    // linha da captura-d ficaria sem ele.
    const r = atribuirLpFunnel({
      porEtapa: { leads: [p("x@a.com", "120247625370600489")], aplicacoes: [], pesquisas: [] },
      compras: [],
      urlDoAnuncio,
    });
    expect(r.lps).toEqual([expect.objectContaining({ lp: D, leads: 1 })]);
    expect(r.cobertura).toEqual({ term: 0, campanha: 0, anuncio: 1, heranca: 0, semLp: 0 });
  });

  it("linha sem utm_content não tem URL: vai para semLp (a letra não conta mais)", () => {
    const r = atribuirLpFunnel({
      porEtapa: { leads: [p("y@a.com", "")], aplicacoes: [], pesquisas: [] },
      compras: [],
      urlDoAnuncio,
    });
    expect(r.lps).toEqual([]);
    expect(r.semLp.leads).toBe(1);
    expect(r.cobertura.semLp).toBe(1);
  });
});

describe("atribuirLpFunnel — aplicação SÓ por herança (PO-17)", () => {
  it("aplicação com utm_content da página de VENDAS conta no card da captura da pessoa", () => {
    // Mutação: contar a aplicação pelo link próprio → ela vai para a página de
    // vendas (que não é linha da tabela) e o degrau da captura-d fica 0.
    const r = atribuirLpFunnel({
      porEtapa: {
        leads: [p("ana@a.com", "120247625370600489")],
        aplicacoes: [p("ana@a.com", "999-vendas")],
        pesquisas: [],
      },
      compras: [],
      urlDoAnuncio,
    });
    const d = r.lps.find((l) => l.lp === D)!;
    expect(d.aplicacoes).toBe(1);
    expect(r.lps.find((l) => l.lp === VENDAS)).toBeUndefined();
    expect(r.cobertura.heranca).toBe(1);
  });

  it("aplicação sem lead de captura → semLp, mesmo com utm_content", () => {
    const r = atribuirLpFunnel({
      porEtapa: { leads: [], aplicacoes: [p("bia@a.com", "120247233964490489")], pesquisas: [] },
      compras: [],
      urlDoAnuncio,
    });
    expect(r.lps).toEqual([]);
    expect(r.semLp.aplicacoes).toBe(1);
  });

  it("herança também pelo telefone", () => {
    const r = atribuirLpFunnel({
      porEtapa: {
        leads: [p("", "120247233964490489", "11998887777")],
        aplicacoes: [p("", "", "11998887777")],
        pesquisas: [],
      },
      compras: [],
      urlDoAnuncio,
    });
    expect(r.lps.find((l) => l.lp === A)!.aplicacoes).toBe(1);
  });
});

describe("atribuirLpFunnel — pesquisa e compra: própria, depois herança", () => {
  it("pesquisa com utm_content próprio vence a herança", () => {
    const r = atribuirLpFunnel({
      porEtapa: {
        leads: [p("c@a.com", "120247233964490489")],
        aplicacoes: [],
        pesquisas: [p("c@a.com", "120247625370600489")],
      },
      compras: [],
      urlDoAnuncio,
    });
    expect(r.lps.find((l) => l.lp === D)!.pesquisas).toBe(1);
    expect(r.lps.find((l) => l.lp === A)!.pesquisas).toBe(0);
  });

  it("compra pelo co= da venda; sem co= herda do lead; receita soma por e-mail", () => {
    const r = atribuirLpFunnel({
      porEtapa: { leads: [p("d@a.com", "120247233964490489")], aplicacoes: [], pesquisas: [] },
      compras: [
        { email: "e@a.com", adId: "120247625370600489", bruto: 47 },
        { email: "d@a.com", adId: "", bruto: 47 },
        { email: "d@a.com", adId: "", bruto: 27 },
      ],
      urlDoAnuncio,
    });
    expect(r.lps.find((l) => l.lp === D)).toEqual(expect.objectContaining({ compras: 1, receita: 47 }));
    expect(r.lps.find((l) => l.lp === A)).toEqual(expect.objectContaining({ compras: 1, receita: 74 }));
    expect(r.cobertura).toEqual({ term: 0, campanha: 0, anuncio: 2, heranca: 1, semLp: 0 });
  });
});
