import { describe, expect, it } from "vitest";
import {
  NOTA_DA_COBERTURA_DO_GOOGLE,
  cardsDoBlocoDoCanal,
  trafegoDoBlocoDaMeta,
  trafegoDoBlocoDoGoogle,
  type CardDoBloco,
  type EntradaDosCardsDoBloco,
  type TrafegoDoBloco,
} from "../cards-do-bloco-lyrio";
import { declararJanelaDoBloco, subtituloDoBloco } from "../janela-dos-cards-lyrio";
import { NOTA_DO_FUSO_DO_GOOGLE } from "../google-ads-na-regua";
import type { EstadoDasVendas, VendasPorCanalDoLyrio } from "../vendas-por-canal-lyrio";

/**
 * Story 42.16 — os blocos Meta Ads e Google Ads da etapa Lyrio: os mesmos
 * cards, o período em cada um. Hoje fixo: 16/10/2026 (dia de SP — a régua das
 * janelas é uma string, sem relógio; o relógio e o fuso são provados em
 * `google-ads-na-regua.test.ts`).
 */
const HOJE = "2026-10-16";
const zero = { vendas: 0, compradores: 0, receitaUsd: 0 };
const dados = (p: Partial<VendasPorCanalDoLyrio> = {}): VendasPorCanalDoLyrio => ({
  days: 90,
  desde: "2026-07-19",
  atributosDesde: "2026-10-06",
  canais: [
    { canal: "meta", rotulo: "Meta", vendas: 20, compradores: 20, receitaUsd: 100 },
    { canal: "google", rotulo: "Google", vendas: 50, compradores: 50, receitaUsd: 400 },
    { canal: "organico", rotulo: "Orgânico ou cupom", vendas: 5, compradores: 5, receitaUsd: 40 },
    { canal: "sem_atribuicao", rotulo: "Sem atribuição", vendas: 9, compradores: 9, receitaUsd: 70 },
  ],
  conflito: zero,
  totalPago: { vendas: 84, compradores: 84, receitaUsd: 610 },
  metaPorEntidade: { campaign: [], adset: [], ad: [] },
  foraDaQuebra: { semValor: 0, semUsuario: 0 },
  ...p,
});
const trafego: TrafegoDoBloco = { tipo: "pronto", investimentoBrl: 1000, impressoes: 100_000, cliques: 2_000 };
const pronto: EstadoDasVendas = { tipo: "pronto", dados: dados() };
const entrada = (canal: "meta" | "google", p: Partial<EntradaDosCardsDoBloco> = {}): EntradaDosCardsDoBloco => ({
  canal,
  ctx: { diasDoFiltro: 90, hoje: HOJE },
  trafego,
  vendas: pronto,
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · ao vivo" },
  ...p,
});
/** O `Intl` separa "R$" do número com NBSP; os valores esperados são escritos com espaço comum. */
const sp = (c: CardDoBloco): CardDoBloco => ({ ...c, valor: c.valor.replace(/\u00a0/g, " ") });
const porId = (cs: CardDoBloco[]) => Object.fromEntries(cs.map((c) => [c.id, sp(c)]));
const todos = (r: ReturnType<typeof cardsDoBlocoDoCanal>) => [...r.principais, ...r.funil, ...r.taxas];

describe("AC2a/AC3a — os dois blocos têm os MESMOS cards e o mesmo funil, com o canal no rótulo", () => {
  it.each(["meta", "google"] as const)("canal %s: 5 cards, 3 etapas, CTR e CPM, nesta ordem", (canal) => {
    const nome = canal === "meta" ? "Meta" : "Google";
    const r = cardsDoBlocoDoCanal(entrada(canal));
    expect(r.principais.map((c) => c.rotulo)).toEqual([`Investimento (${nome})`, `Vendas (${nome})`, `Receita (${nome})`, `ROAS (${nome})`, "Custo por venda"]);
    expect(r.funil.map((c) => c.rotulo)).toEqual(["Impressões", "Cliques", `Vendas (${nome})`]);
    expect(r.taxas.map((c) => c.rotulo)).toEqual(["CTR", "CPM"]);
  });
  it("AC2e (D17) — Conversões e CPA nativos do Google saíram", () => {
    const rotulos = todos(cardsDoBlocoDoCanal(entrada("google"))).map((c) => c.rotulo);
    expect(rotulos.some((r) => /Convers|CPA/.test(r))).toBe(false);
  });
});

describe("AC5a — os números de cada card, por canal", () => {
  it("Meta: vendas e receita do canal Meta; ROAS, custo por venda, CTR, CPM e a taxa nas setas", () => {
    const r = cardsDoBlocoDoCanal(entrada("meta"));
    const c = porId(r.principais);
    expect(c["investimento-meta"].valor).toBe("R$ 1.000,00");
    expect(c["vendas-meta"].valor).toBe("20");
    expect(c["receita-meta"].valor).toBe("R$ 500,00");
    expect(c["roas-meta"].valor).toBe("0.50x");
    expect(c["custo-meta"].valor).toBe("R$ 50,00");
    expect(r.taxas.map((x) => sp(x).valor)).toEqual(["2.00%", "R$ 10,00"]);
    expect(r.setas).toEqual(["2.00%", "1.00%"]);
    expect(r.funil.map((x) => x.valor)).toEqual(["100.000", "2.000", "20"]);
  });
  it("Google: vendas e receita do canal Google, contra o investimento do Google", () => {
    const c = porId(cardsDoBlocoDoCanal(entrada("google")).principais);
    expect(c["vendas-google"].valor).toBe("50");
    expect(c["receita-google"].valor).toBe("R$ 2.000,00");
    expect(c["roas-google"].valor).toBe("2.00x");
    expect(c["custo-google"].valor).toBe("R$ 20,00");
  });

  it.each(["meta", "google"] as const)("%s — divisão por zero: sem impressão, sem clique, sem venda → \"—\", nunca Infinity nem 0", (canal) => {
    const semNada = dados({ canais: dados().canais.map((x) => ({ ...x, vendas: 0, compradores: 0, receitaUsd: 0 })) });
    const r = cardsDoBlocoDoCanal(entrada(canal, { trafego: { tipo: "pronto", investimentoBrl: 0, impressoes: 0, cliques: 0 }, vendas: { tipo: "pronto", dados: semNada } }));
    const c = porId(r.principais);
    expect(c[`investimento-${canal}`].valor).toBe("R$ 0,00");
    expect(c[`roas-${canal}`].valor).toBe("—");
    expect(c[`custo-${canal}`].valor).toBe("—");
    expect(r.taxas.map((x) => x.valor)).toEqual(["—", "—"]);
    expect(r.setas).toEqual(["—", "—"]);
    // sem número e sem causa (ausência legítima): sem memorial
    expect(c[`roas-${canal}`].formula).toBeUndefined();
    expect(r.taxas[0].formula).toBeUndefined();
  });

  it.each(["meta", "google"] as const)("%s — câmbio ausente: receita e ROAS \"—\" (nunca US$ com cara de R$); vendas e custo por venda seguem", (canal) => {
    const c = porId(cardsDoBlocoDoCanal(entrada(canal, { cambio: { taxa: null, fonte: "fx" } })).principais);
    expect(c[`receita-${canal}`].valor).toBe("—");
    expect(c[`roas-${canal}`].valor).toBe("—");
    expect(c[`vendas-${canal}`].valor).not.toBe("—");
    expect(c[`custo-${canal}`].valor).not.toBe("—");
    expect(c[`receita-${canal}`].formula?.values[0]).toMatchObject({ label: "Câmbio US$ → R$", value: "indisponível" });
  });

  it.each(["meta", "google"] as const)("%s — investimento desconhecido (consulta em erro): tráfego e quocientes \"—\" com a causa; a venda segue", (canal) => {
    const r = cardsDoBlocoDoCanal(entrada(canal, { trafego: { tipo: "erro", mensagem: "invalid_grant" } }));
    const c = porId(r.principais);
    for (const id of [`investimento-${canal}`, `roas-${canal}`, `custo-${canal}`]) expect(c[id].valor).toBe("—");
    expect(r.funil.slice(0, 2).map((x) => x.valor)).toEqual(["—", "—"]);
    expect(r.taxas.map((x) => x.valor)).toEqual(["—", "—"]);
    expect(c[`vendas-${canal}`].valor).not.toBe("—");
    expect(c[`receita-${canal}`].valor).not.toBe("—");
    expect(c[`investimento-${canal}`].formula?.result).toBe("—");
    expect(JSON.stringify(c[`roas-${canal}`].formula)).toContain("invalid_grant");
    expect(r.avisoDoTrafego?.titulo).toBeTruthy();
  });

  it.each(["meta", "google"] as const)("%s — venda em erro: os cards de venda \"—\", com o aviso (role=alert no bloco) e a causa no memorial; o tráfego segue", (canal) => {
    const r = cardsDoBlocoDoCanal(entrada(canal, { vendas: { tipo: "erro", mensagem: "502 Bad Gateway" } }));
    const c = porId(r.principais);
    for (const id of [`vendas-${canal}`, `receita-${canal}`, `roas-${canal}`, `custo-${canal}`]) {
      expect(c[id].valor).toBe("—");
      expect(JSON.stringify(c[id].formula)).toContain("502 Bad Gateway");
    }
    expect(r.funil[2].valor).toBe("—");
    expect(c[`investimento-${canal}`].valor).toBe("R$ 1.000,00");
    expect(r.avisoDasVendas).toBe(`Não foi possível carregar as vendas ${canal === "meta" ? "da Meta" : "do Google"}: 502 Bad Gateway`);
  });

  it.each(["meta", "google"] as const)("%s — sem RevenueCat (oculto) e carregando: a venda é \"—\", nunca 0", (canal) => {
    for (const vendas of [{ tipo: "oculto" } as const, { tipo: "carregando" } as const]) {
      const r = cardsDoBlocoDoCanal(entrada(canal, { vendas }));
      expect(porId(r.principais)[`vendas-${canal}`].valor).toBe("—");
      expect(r.carregandoVendas).toBe(vendas.tipo === "carregando");
    }
  });
});

describe("AC2f — estados do Google: sem conta, erro e carregando", () => {
  it("sem conta: o aviso de `avisoDoGoogle` e os cards do Google \"—\" com a causa, nunca R$ 0", () => {
    const r = cardsDoBlocoDoCanal(entrada("google", { trafego: trafegoDoBlocoDoGoogle({ tipo: "sem_conta" }) }));
    expect(r.avisoDoTrafego?.titulo).toBe("Nenhuma conta Google Ads conectada ao projeto.");
    expect(porId(r.principais)["investimento-google"].valor).toBe("—");
    expect(porId(r.principais)["investimento-google"].formula?.expression).toBe("Sem conta Google Ads conectada");
  });
  it("erro: o aviso do erro, com a mensagem; carregando: sem aviso, o bloco espera", () => {
    const r = cardsDoBlocoDoCanal(entrada("google", { trafego: trafegoDoBlocoDoGoogle({ tipo: "erro", mensagem: "x: invalid_grant" }) }));
    expect(r.avisoDoTrafego).toMatchObject({ titulo: "Não foi possível buscar os dados do Google Ads.", detalhe: "x: invalid_grant" });
    const c = cardsDoBlocoDoCanal(entrada("google", { trafego: trafegoDoBlocoDoGoogle({ tipo: "carregando" }) }));
    expect(c.carregandoTrafego).toBe(true);
    expect(c.avisoDoTrafego).toBeNull();
  });
  it("o tráfego do Google vem da régua de SP (impressões e cliques também); o da Meta respeita o erro antes do dado", () => {
    expect(trafegoDoBlocoDoGoogle({ tipo: "pronto", spend: 12.5, impressions: 1500, clicks: 15, porCampanha: new Map(), diasPorCampanha: new Map() })).toEqual({ tipo: "pronto", investimentoBrl: 12.5, impressoes: 1500, cliques: 15 });
    expect(trafegoDoBlocoDaMeta({ spend: 10, impressions: 100, linkClicks: 3 }, "falhou")).toEqual({ tipo: "erro", mensagem: "falhou" });
    expect(trafegoDoBlocoDaMeta(undefined, null)).toEqual({ tipo: "carregando" });
    expect(trafegoDoBlocoDaMeta({ spend: 10, impressions: 100, linkClicks: 3 }, null)).toEqual({ tipo: "pronto", investimentoBrl: 10, impressoes: 100, cliques: 3 });
  });
});

describe("AC2g — o memorial do investimento declara o fuso da conta do Google (e só no Google)", () => {
  it("Google com NOTA_DO_FUSO_DO_GOOGLE; Meta com o imposto", () => {
    expect(porId(cardsDoBlocoDoCanal(entrada("google")).principais)["investimento-google"].formula?.note).toContain(NOTA_DO_FUSO_DO_GOOGLE);
    const meta = porId(cardsDoBlocoDoCanal(entrada("meta")).principais)["investimento-meta"].formula?.note ?? "";
    expect(meta).toContain("12,15%");
    expect(meta).not.toContain(NOTA_DO_FUSO_DO_GOOGLE);
  });
});

describe("AC1/AC5c — o período de cada card: `dd/mm a dd/mm` e `desde dd/mm`, para days = 1, 7 e 90", () => {
  // atributosDesde = 06/10: começa DEPOIS do início da janela de 90 dias, e antes do de 7 e de 1
  const casos = [
    { dias: 1, intervalo: "16/10 a 16/10", venda: "16/10 a 16/10" },
    { dias: 7, intervalo: "10/10 a 16/10", venda: "10/10 a 16/10" },
    { dias: 90, intervalo: "19/07 a 16/10", venda: "desde 06/10" },
  ];
  it.each(casos)("days = $dias: a declaração do filtro e a da venda", ({ dias, intervalo, venda }) => {
    expect(declararJanelaDoBloco({ diasDoFiltro: dias, hoje: HOJE }).etiqueta).toBe(intervalo);
    expect(declararJanelaDoBloco({ diasDoFiltro: dias, hoje: HOJE }, { desde: "2026-10-06", oQue: "o canal da venda" }).etiqueta).toBe(venda);
  });

  it.each(casos)("Meta, days = $dias: tráfego leva o intervalo; Vendas, Receita, ROAS, Custo por venda e a etapa Vendas levam a data efetiva", ({ dias, intervalo, venda }) => {
    const r = cardsDoBlocoDoCanal(entrada("meta", { ctx: { diasDoFiltro: dias, hoje: HOJE } }));
    const c = porId([...r.principais, ...r.funil, ...r.taxas]);
    for (const id of ["investimento-meta", "impressoes-meta", "cliques-meta", "ctr-meta", "cpm-meta"]) expect(c[id].declaracao.etiqueta).toBe(intervalo);
    for (const id of ["vendas-meta", "receita-meta", "roas-meta", "custo-meta", "funil-vendas-meta"]) expect(c[id].declaracao.etiqueta).toBe(venda);
    expect(r.subtitulo).toBe(`Meta Ads · ${intervalo}`);
  });

  it.each(casos)("Google, days = $dias: TODOS os cards levam o intervalo — a rota não dá a cobertura do canal Google (AC2d)", ({ dias, intervalo }) => {
    const r = cardsDoBlocoDoCanal(entrada("google", { ctx: { diasDoFiltro: dias, hoje: HOJE } }));
    for (const c of todos(r)) expect(c.declaracao.etiqueta).toBe(intervalo);
    expect(r.subtitulo).toBe(`Google Ads · ${intervalo}`);
    expect(porId(r.principais)["vendas-google"].formula?.note).toContain(NOTA_DA_COBERTURA_DO_GOOGLE);
  });

  it("a data de cobertura vem da API: outra data, outra etiqueta; sem data, o intervalo (nunca uma data fixa)", () => {
    const outra = cardsDoBlocoDoCanal(entrada("meta", { vendas: { tipo: "pronto", dados: dados({ atributosDesde: "2026-09-01" }) } }));
    expect(porId(outra.principais)["vendas-meta"].declaracao.etiqueta).toBe("desde 01/09");
    const nunca = cardsDoBlocoDoCanal(entrada("meta", { vendas: { tipo: "pronto", dados: dados({ atributosDesde: null }) } }));
    expect(porId(nunca.principais)["vendas-meta"].declaracao.etiqueta).toBe("19/07 a 16/10");
    const semVenda = cardsDoBlocoDoCanal(entrada("meta", { vendas: { tipo: "carregando" } }));
    expect(porId(semVenda.principais)["vendas-meta"].declaracao.etiqueta).toBe("19/07 a 16/10");
  });

  it("AC1c — o período vai no memorial de todo card com número, com a frase \"segue o filtro de N dias\"", () => {
    for (const canal of ["meta", "google"] as const) {
      for (const c of todos(cardsDoBlocoDoCanal(entrada(canal)))) {
        expect(c.formula?.period, `${canal}/${c.id}`).toBe(c.declaracao.periodo);
        expect(c.declaracao.periodo).toContain("segue o filtro de 90 dias");
        expect(c.declaracao.periodo).toContain("19/07 a 16/10");
      }
    }
    const desde = porId(cardsDoBlocoDoCanal(entrada("meta")).principais)["vendas-meta"].declaracao.periodo;
    expect(desde).toContain("o período efetivo é 06/10 a 16/10");
  });

  it("AC3c — o subtítulo de cada bloco", () => {
    expect(subtituloDoBloco("Meta Ads", 7, HOJE)).toBe("Meta Ads · 10/10 a 16/10");
    expect(subtituloDoBloco("Google Ads", 90, HOJE)).toBe("Google Ads · 19/07 a 16/10");
  });
});
