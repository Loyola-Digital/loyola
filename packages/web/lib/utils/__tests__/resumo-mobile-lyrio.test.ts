import { describe, expect, it } from "vitest";
import { cardsDoResumo, fmtBRL, textoDaLinha, type CardDoResumo, type EntradaDoResumo } from "../resumo-mobile-lyrio";
import { cardsDoBlocoDoCanal, trafegoDoBlocoDaMeta, trafegoDoBlocoDoGoogle } from "../cards-do-bloco-lyrio";
import { investimentoDoGoogleNaRegua, trafegoDoGoogleNaRegua } from "../google-ads-na-regua";
import { sumMetaInsights, sumMetaSpendWithTax } from "../funnel-metrics";
import type { VendasPorCanalDoLyrio } from "../vendas-por-canal-lyrio";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";

/**
 * Story 42.15 (AC1–AC4, AC7, AC8a–c) — o Resumo CONSOLIDADO: cada card com o
 * total e Meta/Google em segundo plano. (A 42.14 está nos testes de janela que
 * continuam abaixo, adaptados à fonte nova da receita, D1.)
 *
 * Fixture: filtro de 90 dias em 16/10/2026 (19/07 a 16/10), câmbio 5, série de
 * assinaturas desde 10/08 e atributos de canal desde 06/10. A receita ORGÂNICA
 * e a sem atribuição são maiores que 0 e há conflito: é o que mostra que o total
 * não é a média dos canais (AC8c) e que o memorial fecha com o conflito (AC8b).
 */
const META_90 = { spendLiquido: 1757.5, imposto: 242.5, spendComImposto: 2000 };
const META_28 = { spendLiquido: 878.75, imposto: 121.25, spendComImposto: 1000 };
const OVERVIEW = [
  { id: "mrr", value: 596 },
  { id: "active_subscriptions", value: 120 },
  { id: "active_trials", value: 30 },
  { id: "revenue_last_28_days", value: 300 },
  { id: "new_customers_last_28_days", value: 900 },
];
const conta = (vendas: number, compradores: number, receitaUsd: number) => ({ vendas, compradores, receitaUsd });
const VENDAS: VendasPorCanalDoLyrio = {
  days: 90,
  desde: "2026-07-19",
  atributosDesde: "2026-10-06",
  canais: [
    { canal: "meta", rotulo: "Meta", ...conta(10, 8, 300) },
    { canal: "google", rotulo: "Google", ...conta(4, 3, 100) },
    { canal: "organico", rotulo: "Orgânico ou cupom", ...conta(6, 5, 150.5) },
    { canal: "sem_atribuicao", rotulo: "Sem atribuição", ...conta(3, 3, 49.5) },
  ],
  conflito: conta(1, 1, 25),
  totalPago: conta(24, 20, 625),
  metaPorEntidade: { campaign: [], adset: [], ad: [] },
  foraDaQuebra: { semValor: 0, semUsuario: 0 },
};
const entrada = (p: Partial<EntradaDoResumo> = {}): EntradaDoResumo => ({
  ctx: { diasDoFiltro: 90, hoje: "2026-10-16", serieDesde: "2026-08-10" },
  cambio: { taxa: 5, fonte: "/api/fx/usd-brl · manual" },
  meta: { temCampanhas: true, filtro: META_90, vinteOito: META_28 },
  google: { mostrar: true, filtro: { tipo: "pronto", spend: 500 }, vinteOito: { tipo: "pronto", spend: 100 } },
  vendas: { tipo: "pronto", dados: VENDAS },
  novosClientes: { tipo: "pronto", dados: { configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valor: 15232, medida: "New Customers", diaIncompleto: true } },
  overview: { tipo: "pronto", dados: OVERVIEW },
  percentuais: { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 },
  ...p,
});
const card = (e: EntradaDoResumo, id: string): CardDoResumo => {
  const c = cardsDoResumo(e).find((x) => x.id === id);
  if (!c) throw new Error(`sem card ${id}`);
  return c;
};
const linha = (c: CardDoResumo, id: string) => c.secundarias?.find((l) => l.id === id);
const reais = (s: string) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
const META_ERRO: EntradaDoResumo["meta"] = { temCampanhas: true, filtro: undefined, vinteOito: undefined, erroFiltro: "Erro ao buscar insights da Meta" };
const GOOGLE_ERRO: EntradaDoResumo["google"] = { mostrar: true, filtro: { tipo: "erro", mensagem: "invalid_grant" } };
const GOOGLE_SEM_CONTA: EntradaDoResumo["google"] = { mostrar: true, filtro: { tipo: "sem_conta" } };
const SEM_GOOGLE: EntradaDoResumo["google"] = { mostrar: false, filtro: { tipo: "sem_campanha" } };
const COM_LINHAS = ["investimento", "receita", "vendas", "roas", "margem"];

describe("os 8 cards do Resumo consolidado, na ordem do pedido (Os cards 1–8)", () => {
  it("Investimento (Total), Receita, Vendas (Total), ROAS, Margem, MRR, Assinaturas/Trials e Novos clientes", () => {
    expect(cardsDoResumo(entrada()).map((c) => c.rotulo)).toEqual([
      "Investimento (Total)", "Receita (RevenueCat)", "Vendas (Total)", "ROAS", "Margem de Contribuição",
      "MRR", "Assinaturas ativas / Trials ativos", "Novos clientes",
    ]);
  });
  it("AC1a — os cards Investimento (Meta) e Investimento (Google) separados não existem mais", () => {
    const ids = cardsDoResumo(entrada()).map((c) => c.id);
    expect(ids).not.toContain("investimento-meta");
    expect(ids).not.toContain("investimento-google");
  });
  it("todo card com número tem memorial com a janela; as linhas Meta e Google só nos cards 1–5", () => {
    for (const c of cardsDoResumo(entrada())) {
      expect(c.formula, c.rotulo).toBeDefined();
      expect(c.formula!.period, c.rotulo).toMatch(/(não )?segue o filtro de 90 dias$/);
      expect(c.secundarias?.map((l) => l.id) ?? [], c.rotulo).toEqual(COM_LINHAS.includes(c.id) ? ["meta", "google"] : []);
    }
  });
});

describe("AC1 — Investimento (Total) = Meta + Google, com os dois em segundo plano", () => {
  it("(a) total = Meta com 12,15% (2.000) + Google na régua (500) = 2.500; (b) as linhas são as duas parcelas", () => {
    const c = card(entrada(), "investimento");
    expect(c.valor).toBe(fmtBRL(2500));
    expect(linha(c, "meta")).toMatchObject({ rotulo: "Meta", valor: fmtBRL(2000) });
    expect(linha(c, "google")).toMatchObject({ rotulo: "Google", valor: fmtBRL(500) });
    expect(c.formula!.result).toBe(`${fmtBRL(2000)} + ${fmtBRL(500)} = ${fmtBRL(2500)}`);
    expect(c.declaracao).toMatchObject({ etiqueta: "últimos 90 dias", segueOFiltro: true, destaque: false });
  });
  it("as parcelas da Meta no memorial (líquido + imposto) fecham no valor da linha, ao centavo", () => {
    const c = card(entrada({ meta: { temCampanhas: true, filtro: { spendLiquido: 100.004, imposto: 13.836, spendComImposto: 113.84 } } }), "investimento");
    const v = c.formula!.values;
    expect(Math.round((reais(String(v[0].value)) + reais(String(v[1].value))) * 100)).toBe(11384);
    expect(c.valor).toBe(fmtBRL(613.84));
  });
  it("(c) sem campanha Google vinculada: sem a linha do Google, e o total é só a Meta", () => {
    const c = card(entrada({ google: SEM_GOOGLE }), "investimento");
    expect(c.valor).toBe(fmtBRL(2000));
    expect(c.secundarias!.map((l) => l.id)).toEqual(["meta"]);
  });
  it("(d) Google em erro: total e linha do Google '—'; a Meta continua; o memorial diz a causa — nunca R$ 0,00", () => {
    const c = card(entrada({ google: GOOGLE_ERRO }), "investimento");
    expect(c.valor).toBe("—");
    expect(linha(c, "google")!.valor).toBe("—");
    expect(linha(c, "meta")!.valor).toBe(fmtBRL(2000));
    expect(JSON.stringify(c.formula)).toContain("invalid_grant");
    expect(JSON.stringify(c.formula)).toContain(fmtBRL(2000)); // AC7c: a linha da Meta está no memorial
    expect(JSON.stringify(c)).not.toContain("R$ 0,00");
  });
  it("(d) Google sem conta: '—' com a causa; carregando: '—' sem memorial (nunca o total parcial)", () => {
    const sem = card(entrada({ google: GOOGLE_SEM_CONTA }), "investimento");
    expect(sem.valor).toBe("—");
    expect(sem.formula!.expression).toBe("Sem conta Google Ads conectada");
    const carregando = card(entrada({ google: { mostrar: true, filtro: { tipo: "carregando" } } }), "investimento");
    expect(carregando.valor).toBe("—");
    expect(carregando.carregando).toBeUndefined();
    expect(carregando.formula).toBeUndefined();
    expect(linha(carregando, "meta")!.valor).toBe(fmtBRL(2000));
    expect(linha(carregando, "google")!.valor).toBe("—");
    expect(card(entrada({ google: { mostrar: true, filtro: { tipo: "carregando" } } }), "roas").valor).toBe("—");
  });
  it("(e) Meta em erro: total e linha da Meta '—'; o Google continua; o memorial diz a causa", () => {
    const c = card(entrada({ meta: META_ERRO }), "investimento");
    expect(c.valor).toBe("—");
    expect(linha(c, "meta")!.valor).toBe("—");
    expect(linha(c, "google")!.valor).toBe(fmtBRL(500));
    expect(c.formula!.values[0]).toMatchObject({ label: "Erro", value: "Erro ao buscar insights da Meta" });
  });
  it("Meta e Google em erro: as duas causas no memorial", () => {
    const c = card(entrada({ meta: META_ERRO, google: GOOGLE_ERRO }), "investimento");
    expect(c.valor).toBe("—");
    expect(c.formula!.values.map((v) => v.label)).toEqual(["Investimento (Meta)", "Investimento (Google)"]);
  });
  it("sem campanha da Meta: a Meta é R$ 0 (não há investimento), não '—'", () => {
    const c = card(entrada({ meta: { temCampanhas: false, filtro: undefined } }), "investimento");
    expect(c.valor).toBe(fmtBRL(500));
    expect(linha(c, "meta")!.valor).toBe(fmtBRL(0));
  });
});

describe("AC2 — Receita e Vendas totais do webhook (D1)", () => {
  it("(a) Receita = totalPago.receitaUsd (625) × câmbio (5) = 3.125; Vendas = totalPago.vendas (24)", () => {
    expect(card(entrada(), "receita").valor).toBe(fmtBRL(3125));
    expect(card(entrada(), "vendas").valor).toBe("24");
  });
  it("(b) as linhas são canais[meta] e canais[google]", () => {
    expect(linha(card(entrada(), "receita"), "meta")!.valor).toBe(fmtBRL(1500));
    expect(linha(card(entrada(), "receita"), "google")!.valor).toBe(fmtBRL(500));
    expect(linha(card(entrada(), "vendas"), "meta")!.valor).toBe("10");
    expect(linha(card(entrada(), "vendas"), "google")!.valor).toBe("4");
  });
  it("(c) AC8b — o memorial lista TODOS os baldes, com o conflito > 0, e a soma deles é o total exibido", () => {
    const r = card(entrada(), "receita");
    const baldes = r.formula!.values.filter((v) => v.label !== "Câmbio US$ 1 →");
    expect(baldes.map((v) => v.label)).toEqual(["Meta", "Google", "Orgânico ou cupom", "Sem atribuição", "Meta e Google (conflito)"]);
    const soma = baldes.reduce((a, v) => a + Math.round(reais(String(v.value).split(" (")[0]) * 100), 0);
    expect(soma).toBe(312500);
    const v = card(entrada(), "vendas");
    expect(v.formula!.values.map((x) => Number(x.value))).toEqual([10, 4, 6, 3, 1]);
    expect(v.formula!.result).toBe("10 + 4 + 6 + 3 + 1 = 24");
  });
  it("(c) sem conflito, o balde do conflito não aparece", () => {
    const e = entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, conflito: conta(0, 0, 0), totalPago: conta(23, 19, 600) } } });
    expect(card(e, "receita").formula!.values.map((v) => v.label)).not.toContain("Meta e Google (conflito)");
  });
  it("(c) baldes com centavos que não fecham sozinhos ainda somam o total exibido", () => {
    const canais = VENDAS.canais.map((c, i) => ({ ...c, receitaUsd: [10.333, 20.333, 30.333, 0.001][i] }));
    const e = entrada({ cambio: { taxa: 5.4321, fonte: "x" }, vendas: { tipo: "pronto", dados: { ...VENDAS, canais, conflito: conta(0, 0, 0), totalPago: conta(23, 19, 61) } } });
    const r = card(e, "receita");
    const soma = r.formula!.values.filter((v) => v.label !== "Câmbio US$ 1 →").reduce((a, v) => a + Math.round(reais(String(v.value).split(" (")[0]) * 100), 0);
    expect(soma).toBe(Math.round(reais(r.valor) * 100));
  });
  it("(d) o memorial de Vendas diz que são eventos pagos, não pessoas, e aponta o CAC", () => {
    const n = card(entrada(), "vendas").formula!.note!;
    expect(n).toContain("Vendas são EVENTOS pagos (compra, renovação, conversão de teste), não pessoas");
    expect(n).toContain("veja o CAC");
  });
  it("(e) janela antes de serieDesde → `desde 10/08` na Receita e nas Vendas; o investimento não", () => {
    expect(card(entrada(), "receita").declaracao.etiqueta).toBe("desde 10/08");
    expect(card(entrada(), "vendas").declaracao.etiqueta).toBe("desde 10/08");
    expect(card(entrada(), "investimento").declaracao.etiqueta).toBe("últimos 90 dias");
    expect(card(entrada({ ctx: { diasDoFiltro: 28, hoje: "2026-10-16", serieDesde: "2026-08-10" }, vendas: { tipo: "pronto", dados: { ...VENDAS, days: 28 } } }), "receita").declaracao.etiqueta).toBe("últimos 28 dias");
  });
  it("(e) janela antes de atributosDesde → as linhas Meta e Google declaram a data, que vem da API", () => {
    const r = card(entrada(), "receita");
    expect(linha(r, "meta")!.nota).toBe("atribuição desde 06/10");
    expect(linha(r, "google")!.nota).toBe("atribuição desde 06/10");
    expect(r.formula!.note).toContain("só chega desde 06/10/2026");
    const depois = card(entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, atributosDesde: "2026-07-01" } } }), "receita");
    expect(linha(depois, "meta")!.nota).toBeUndefined();
  });
  it("(g) carregando → skeleton; erro → '—' com a causa; oculto → '—'", () => {
    for (const id of ["receita", "vendas", "roas", "margem"]) {
      expect(card(entrada({ vendas: { tipo: "carregando" } }), id), id).toMatchObject({ valor: "—", carregando: true });
      const erro = card(entrada({ vendas: { tipo: "erro", mensagem: "HTTP 500" } }), id);
      expect(erro.valor, id).toBe("—");
      expect(JSON.stringify(erro.formula), id).toContain("HTTP 500");
      expect(card(entrada({ vendas: { tipo: "oculto" } }), id).valor, id).toBe("—");
    }
  });
  it("sem câmbio a receita fica '—' com a causa, nunca dólar com cara de real", () => {
    const r = card(entrada({ cambio: { taxa: null, fonte: "/api/fx" } }), "receita");
    expect(r.valor).toBe("—");
    expect(r.formula!.values[0]).toMatchObject({ label: "Câmbio US$ → R$", value: "indisponível" });
    expect(card(entrada({ cambio: { taxa: null, fonte: "/api/fx" } }), "roas").valor).toBe("—");
  });
});

describe("AC3 — ROAS e Margem: total e por canal", () => {
  it("(a) ROAS total = 3.125 ÷ 2.500 = 1,25x; (b) Meta 1.500 ÷ 2.000 = 0,75x, Google 500 ÷ 500 = 1,00x", () => {
    const r = card(entrada(), "roas");
    expect(r.valor).toBe("1.25x");
    expect(linha(r, "meta")).toMatchObject({ rotulo: "ROAS Meta", valor: "0.75x" });
    expect(linha(r, "google")).toMatchObject({ rotulo: "ROAS Google", valor: "1.00x" });
  });
  it("(c) AC8c — com receita orgânica > 0, o ROAS total NÃO é a média dos canais, e o memorial diz por quê", () => {
    const r = card(entrada(), "roas");
    expect(r.valor).not.toBe(`${((0.75 + 1) / 2).toFixed(2)}x`);
    expect(r.formula!.note).toContain("o ROAS total não é a média do ROAS da Meta e do Google");
    expect(card(entrada(), "margem").formula!.note).toContain("a soma das margens da Meta e do Google não é a margem total");
  });
  it("(a) Margem total = 3.125 − 21% − 2.500 = −31,25; (b) Meta 1.500 − 21% − 2.000 = −815; Google 500 − 21% − 500 = −105", () => {
    const m = card(entrada(), "margem");
    expect(m.valor).toBe(fmtBRL(-31.25));
    expect(linha(m, "meta")).toMatchObject({ rotulo: "Margem Meta", valor: fmtBRL(-815) });
    expect(linha(m, "google")).toMatchObject({ rotulo: "Margem Google", valor: fmtBRL(-105) });
    expect(reais(linha(m, "meta")!.valor) + reais(linha(m, "google")!.valor)).not.toBe(reais(m.valor));
  });
  it("(e) margem negativa em vermelho, também nas linhas; positiva, não", () => {
    const m = card(entrada(), "margem");
    expect(m.negativo).toBe(true);
    expect(linha(m, "meta")!.negativo).toBe(true);
    const alta = card(entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, canais: VENDAS.canais.map((c) => ({ ...c, receitaUsd: c.receitaUsd * 10 })), totalPago: conta(24, 20, 6025) } } }), "margem");
    expect(alta.negativo).toBe(false);
    expect(linha(alta, "meta")!.negativo).toBe(false);
  });
  it("(d) Google em erro: ROAS e Margem '—' com a causa; as linhas da Meta continuam", () => {
    for (const id of ["roas", "margem"]) {
      const c = card(entrada({ google: GOOGLE_ERRO }), id);
      expect(c.valor, id).toBe("—");
      expect(c.formula!.values, id).toContainEqual(expect.objectContaining({ label: "Investimento (Google)", value: "invalid_grant" }));
      expect(linha(c, "meta")!.valor, id).not.toBe("—");
      expect(linha(c, "google")!.valor, id).toBe("—");
    }
  });
  it("(d) Meta em erro: ROAS e Margem '—' com a causa; as linhas do Google continuam", () => {
    for (const id of ["roas", "margem"]) {
      const c = card(entrada({ meta: META_ERRO }), id);
      expect(c.valor, id).toBe("—");
      expect(c.formula!.values, id).toContainEqual(expect.objectContaining({ label: "Investimento (Meta)", value: "Erro ao buscar insights da Meta" }));
      expect(linha(c, "meta")!.valor, id).toBe("—");
      expect(linha(c, "google")!.valor, id).not.toBe("—");
    }
  });
  it("(d) nenhuma razão mistura janelas: vendas que ECOAM outra janela (28 com o filtro em 90) não valem — '—' com a explicação", () => {
    const e = entrada({ vendas: { tipo: "pronto", dados: { ...VENDAS, days: 28 } } });
    for (const id of ["receita", "vendas", "roas", "margem"]) {
      const c = card(e, id);
      expect(c.valor, id).toBe("—");
      expect(JSON.stringify(c.formula), id).toContain("28 dias, não para os 90 do filtro");
      for (const l of c.secundarias ?? []) expect(l.valor, `${id} ${l.id}`).toBe("—");
    }
  });
  it("sem campanha Google: ROAS e Margem só com a linha da Meta; o total usa só a Meta", () => {
    const r = card(entrada({ google: SEM_GOOGLE }), "roas");
    expect(r.secundarias!.map((l) => l.id)).toEqual(["meta"]);
    expect(r.valor).toBe((3125 / 2000).toFixed(2) + "x");
  });
});

describe("AC4 — MRR, Assinaturas/Trials e Novos clientes", () => {
  it("(a) MRR e Novos clientes como na 42.14 (agora; o chart do filtro)", () => {
    expect(card(entrada(), "mrr")).toMatchObject({ valor: fmtBRL(2980), declaracao: expect.objectContaining({ etiqueta: "agora", destaque: true }) });
    expect(card(entrada(), "novos-clientes").valor).toBe("15.232");
    expect(card(entrada(), "mrr").formula!.note).toContain("A API marca este número com período de 28 dias (P28D)");
  });
  it("(b) um card só, com os dois números lado a lado, `agora` e âmbar; o memorial mantém os dois textos", () => {
    const c = card(entrada(), "assinaturas-trials");
    expect(c).toMatchObject({ rotulo: "Assinaturas ativas / Trials ativos", valor: "120 / 30", declaracao: expect.objectContaining({ etiqueta: "agora", destaque: true }) });
    expect(c.formula!.note).toContain("Assinaturas ativas agora — não é acumulado do período (o RevenueCat inclui as canceladas que ainda têm acesso).");
    expect(c.formula!.note).toContain("Trials em andamento agora. Ainda não viraram receita.");
    expect(cardsDoResumo(entrada()).map((x) => x.id)).not.toContain("trials");
  });
  it("overview em erro: MRR e Assinaturas/Trials '—' com a causa; Novos clientes não depende dele", () => {
    const e = entrada({ overview: { tipo: "erro", causa: "permissao", mensagem: "RevenueCat 403" } });
    expect(card(e, "mrr").valor).toBe("—");
    expect(card(e, "assinaturas-trials").valor).toBe("— / —");
    expect(card(e, "assinaturas-trials").formula!.note).toContain("permissão");
    expect(card(e, "novos-clientes").valor).toBe("15.232");
  });
});

describe("AC7c — a linha corta no celular; o texto inteiro está no memorial", () => {
  const casos: [string, Partial<EntradaDoResumo>][] = [
    ["pronto", {}],
    ["Google em erro", { google: GOOGLE_ERRO }],
    ["Meta em erro", { meta: META_ERRO }],
  ];
  for (const [nome, p] of casos) {
    it(`${nome}: toda linha com número aparece, valor e nota, no memorial do card`, () => {
      for (const c of cardsDoResumo(entrada(p))) {
        if (!c.formula) continue;
        const texto = JSON.stringify(c.formula);
        for (const l of c.secundarias ?? []) {
          if (l.valor === "—") continue;
          expect(texto, `${c.rotulo} · ${textoDaLinha(l)}`).toContain(l.valor);
          if (l.nota) expect(texto, `${c.rotulo} · ${l.nota}`).toContain(l.nota);
        }
      }
    });
  }
});

describe("as linhas Meta e Google são os números dos blocos da 42.16 (os mesmos insumos, a mesma tela)", () => {
  const dia = (date: string, spend: string): CampaignDailyInsight => ({
    date_start: date, date_stop: date, impressions: "1000", reach: "900", clicks: "50", spend, ctr: "5", cpc: "1", cpm: "10",
    actions: [{ action_type: "link_click", value: "40" }],
  });
  const linhasDaMeta = [dia("2026-10-01", "333.33"), dia("2026-10-02", "1424.17"), dia("2026-10-03", "0.01")];
  const conta = { tipo: "conta" as const, accountId: "123" };
  const consultas = [
    { campaignId: "g1", isLoading: false, error: null, data: [{ date: "2026-10-01", spend: 123.45, impressions: 10, clicks: 2 }, { date: "2026-10-05", spend: 376.56, impressions: 20, clicks: 3 }] },
  ];
  const hoje = "2026-10-16";
  const vendas = { tipo: "pronto" as const, dados: VENDAS };
  const cambio = { taxa: 5.4321, fonte: "x" };
  const resumo = cardsDoResumo(
    entrada({
      cambio,
      meta: { temCampanhas: true, filtro: sumMetaSpendWithTax([linhasDaMeta]) },
      google: { mostrar: true, filtro: investimentoDoGoogleNaRegua(conta, consultas, 90, hoje) },
      vendas,
    }),
  );
  const bloco = (canal: "meta" | "google") =>
    cardsDoBlocoDoCanal({
      canal,
      ctx: { diasDoFiltro: 90, hoje },
      trafego: canal === "meta" ? trafegoDoBlocoDaMeta(sumMetaInsights([linhasDaMeta]), null) : trafegoDoBlocoDoGoogle(trafegoDoGoogleNaRegua(conta, consultas, 90, hoje)),
      vendas,
      cambio,
    }).principais;
  const doResumo = (id: string, canal: string) => resumo.find((c) => c.id === id)!.secundarias!.find((l) => l.id === canal)!.valor;
  const doBloco = (canal: "meta" | "google", id: string) => bloco(canal).find((c) => c.id === `${id}-${canal}`)!.valor;

  for (const canal of ["meta", "google"] as const) {
    it(`${canal}: Investimento, Vendas, Receita e ROAS da linha = os cards do bloco ${canal === "meta" ? "Meta Ads" : "Google Ads"}`, () => {
      expect(doResumo("investimento", canal)).toBe(doBloco(canal, "investimento"));
      expect(doResumo("vendas", canal)).toBe(doBloco(canal, "vendas"));
      expect(doResumo("receita", canal)).toBe(doBloco(canal, "receita"));
      expect(doResumo("roas", canal)).toBe(doBloco(canal, "roas"));
    });
  }
  it("e o total do Investimento é a soma das duas linhas, ao centavo", () => {
    const inv = resumo.find((c) => c.id === "investimento")!;
    expect(Math.round(reais(inv.valor) * 100)).toBe(Math.round(reais(doResumo("investimento", "meta")) * 100) + Math.round(reais(doResumo("investimento", "google")) * 100));
  });
});
