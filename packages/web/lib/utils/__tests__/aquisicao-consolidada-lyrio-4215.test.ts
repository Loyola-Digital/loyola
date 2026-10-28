import { describe, expect, it } from "vitest";
import { ALERTA_DO_CAC_SO_MIDIA, FRASE_DO_LTV_BRUTO, cardsDeAquisicao, cardsDeAquisicaoPorCanal, type EntradaDeAquisicao, type PagantesPorCanal } from "../aquisicao-lyrio";
import { fmtBRL } from "../resumo-mobile-lyrio";

/**
 * Story 42.15 (AC5) — CAC, LTV bruto e Renovações no formato total + canal.
 * As contas são as da 42.14 (`aquisicao-lyrio.test.ts`, AC5d); aqui, a dobra:
 * o consolidado no valor, Meta e Google em segundo plano.
 */
const contagem = (meta: number, google: number, organico: number, sem: number, conflito: number) => ({
  canais: [
    { canal: "meta" as const, rotulo: "Meta", quantidade: meta },
    { canal: "google" as const, rotulo: "Google", quantidade: google },
    { canal: "organico" as const, rotulo: "Orgânico ou cupom", quantidade: organico },
    { canal: "sem_atribuicao" as const, rotulo: "Sem atribuição", quantidade: sem },
  ],
  conflito,
  total: meta + google + organico + sem + conflito,
});
const vazio = { pagamentos: 0, pessoas: 0, receitaCentavos: 0, produtos: [] };
const pagantes = (days: number, p: Partial<PagantesPorCanal> = {}): PagantesPorCanal => ({
  days,
  desde: days === 28 ? "2026-09-19" : "2026-07-19",
  assinaturaDesde: "2026-08-10",
  atributosDesde: "2026-10-06",
  novosPagantes: days === 28 ? contagem(2, 1, 1, 0, 0) : contagem(4, 1, 3, 1, 1),
  renovacoes: contagem(9, 8, 7, 6, 2),
  ltv: {
    planos: [
      { plano: "mensal", rotulo: "LTV Mensal", receitaCentavos: 999, pessoas: 1, produtos: [] },
      { plano: "trimestral", rotulo: "LTV Trimestral", receitaCentavos: 2499, pessoas: 1, produtos: [] },
      { plano: "semestral", rotulo: "LTV Semestral", receitaCentavos: 5969, pessoas: 6, produtos: [] },
      { plano: "anual", rotulo: "LTV Anual", receitaCentavos: 10997, pessoas: 2, produtos: [] },
    ],
    naoClassificado: vazio,
    foraPorDecisao: vazio,
  },
  ...p,
});
const entrada = (p: Partial<EntradaDeAquisicao> = {}): EntradaDeAquisicao => ({
  ctx: { diasDoFiltro: 90, hoje: "2026-10-16" },
  pagantesFiltro: { tipo: "pronto", dados: pagantes(90) },
  pagantes28: { tipo: "pronto", dados: pagantes(28) },
  meta: { temCampanhas: true, filtro: { spendLiquido: 1757.5, imposto: 242.5, spendComImposto: 2000 }, vinteOito: { spendLiquido: 878.75, imposto: 121.25, spendComImposto: 1000 } },
  google: { mostrar: true, filtro: { tipo: "pronto", spend: 500 }, vinteOito: { tipo: "pronto", spend: 100 } },
  ...p,
});

describe("AC5a — CAC: o consolidado no valor; CAC Meta e CAC Google em segundo plano; as duas janelas", () => {
  it("dois cards (o filtro e o de 28d fixo), cada um com a sua etiqueta", () => {
    const { cac } = cardsDeAquisicao(entrada());
    expect(cac.map((c) => [c.id, c.rotulo, c.declaracao.etiqueta])).toEqual([
      ["cac-filtro", "CAC", "desde 10/08"],
      ["cac-28d", "CAC · 28d fixo", "28d fixo"],
    ]);
  });
  it("filtro: consolidado (2.000 + 500) ÷ 10 = 250; Meta 2.000 ÷ 4 = 500; Google 500 ÷ 1 = 500 — os mesmos da 42.14", () => {
    const [filtro] = cardsDeAquisicao(entrada()).cac;
    const base = cardsDeAquisicaoPorCanal(entrada()).cac;
    expect(filtro.valor).toBe(fmtBRL(250));
    expect(filtro.valor).toBe(base.find((c) => c.id === "cac-consolidado-filtro")!.valor);
    expect(filtro.secundarias).toEqual([
      { id: "meta", rotulo: "CAC Meta", valor: base.find((c) => c.id === "cac-meta-filtro")!.valor },
      { id: "google", rotulo: "CAC Google", valor: base.find((c) => c.id === "cac-google-filtro")!.valor },
    ]);
  });
  it("28d fixo: os insumos de 28 dias (1.100 ÷ 4 = 275; Meta 500; Google 100), não os do filtro", () => {
    const vinte = cardsDeAquisicao(entrada()).cac[1];
    expect(vinte.valor).toBe(fmtBRL(275));
    expect(vinte.secundarias!.map((l) => l.valor)).toEqual([fmtBRL(500), fmtBRL(100)]);
  });
  it("o memorial do consolidado ganha as contas das linhas e o alerta D10 (só mídia)", () => {
    const f = cardsDeAquisicao(entrada()).cac[0].formula!;
    expect(f.values).toContainEqual(expect.objectContaining({ label: "CAC Meta (em segundo plano)", value: `${fmtBRL(2000)} ÷ 4 = ${fmtBRL(500)}` }));
    expect(f.values).toContainEqual(expect.objectContaining({ label: "CAC Google (em segundo plano)", value: `${fmtBRL(500)} ÷ 1 = ${fmtBRL(500)}` }));
    expect(f.note).toContain(ALERTA_DO_CAC_SO_MIDIA);
  });
  it("sem campanha Google: sem a linha do Google; Google em erro: consolidado e linha '—', a Meta continua", () => {
    const sem = cardsDeAquisicao(entrada({ google: { mostrar: false, filtro: { tipo: "sem_campanha" }, vinteOito: { tipo: "sem_campanha" } } })).cac[0];
    expect(sem.secundarias!.map((l) => l.id)).toEqual(["meta"]);
    const erro = cardsDeAquisicao(entrada({ google: { mostrar: true, filtro: { tipo: "erro", mensagem: "invalid_grant" }, vinteOito: { tipo: "erro", mensagem: "invalid_grant" } } })).cac[0];
    expect(erro.valor).toBe("—");
    expect(erro.secundarias).toEqual([{ id: "meta", rotulo: "CAC Meta", valor: fmtBRL(500) }, { id: "google", rotulo: "CAC Google", valor: "—" }]);
    expect(JSON.stringify(erro.formula)).toContain("invalid_grant");
  });
  it("Meta em erro: consolidado e linha da Meta '—'; o Google continua", () => {
    const c = cardsDeAquisicao(entrada({ meta: { temCampanhas: true, filtro: undefined, vinteOito: undefined, erroFiltro: "falhou", erro28: "falhou" } })).cac[0];
    expect(c.valor).toBe("—");
    expect(c.secundarias!.map((l) => l.valor)).toEqual(["—", fmtBRL(500)]);
  });
  it("investimento carregando: skeleton, sem memorial", () => {
    const c = cardsDeAquisicao(entrada({ google: { mostrar: true, filtro: { tipo: "carregando" }, vinteOito: { tipo: "carregando" } } })).cac[0];
    expect(c).toMatchObject({ valor: "—", carregando: true });
    expect(c.formula).toBeUndefined();
  });
  it("AC10e — o CAC consolidado do FILTRO sai em número, o mesmo do card", () => {
    expect(cardsDeAquisicao(entrada()).cacConsolidadoDoFiltro).toEqual({ tipo: "pronto", centavos: 25000, investimentoCentavos: 250000, pessoas: 10 });
    expect(cardsDeAquisicao(entrada({ google: { mostrar: true, filtro: { tipo: "erro", mensagem: "x" }, vinteOito: { tipo: "erro", mensagem: "x" } } })).cacConsolidadoDoFiltro.tipo).toBe("indisponivel");
    expect(cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "carregando" } })).cacConsolidadoDoFiltro.tipo).toBe("carregando");
  });
});

describe("AC5b — Renovações: o total no valor; Meta e Google em segundo plano; o memorial fecha a conta", () => {
  it("total 9 + 8 + 7 + 6 + 2 (conflito) = 32; linhas Meta 9 e Google 8", () => {
    const [r] = cardsDeAquisicao(entrada()).renovacoes;
    expect(cardsDeAquisicao(entrada()).renovacoes).toHaveLength(1);
    expect(r).toMatchObject({ id: "renovacoes", rotulo: "Renovações", valor: "32" });
    expect(r.secundarias).toEqual([{ id: "meta", rotulo: "Meta", valor: "9" }, { id: "google", rotulo: "Google", valor: "8" }]);
    expect(r.formula!.values.map((v) => Number(v.value))).toEqual([9, 8, 7, 6, 2]);
    expect(r.formula!.result).toBe("9 + 8 + 7 + 6 + 2 = 32");
  });
  it("sem campanha Google: sem a linha do Google (o canal continua no memorial)", () => {
    const [r] = cardsDeAquisicao(entrada({ google: { mostrar: false, filtro: { tipo: "sem_campanha" }, vinteOito: { tipo: "sem_campanha" } } })).renovacoes;
    expect(r.secundarias!.map((l) => l.id)).toEqual(["meta"]);
    expect(r.formula!.values.map((v) => v.label)).toContain("Renovações · Google");
  });
  it("erro: '—' com a causa; carregando: skeleton", () => {
    const erro = cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "erro", causa: "outro", mensagem: "Falhou" } })).renovacoes[0];
    expect(erro.valor).toBe("—");
    expect(erro.formula!.values[0].value).toBe("Falhou");
    expect(cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "carregando" } })).renovacoes[0]).toMatchObject({ valor: "—", carregando: true });
  });
});

describe("AC5c — LTV bruto: só o rótulo e a frase mudam", () => {
  it("rótulos `LTV bruto · Mensal/Trimestral/Semestral/Anual`; valores iguais aos da 42.14; o memorial ganha a frase", () => {
    const ltv = cardsDeAquisicao(entrada()).ltv;
    const base = cardsDeAquisicaoPorCanal(entrada()).ltv;
    expect(ltv.map((c) => c.rotulo)).toEqual(["LTV bruto · Mensal", "LTV bruto · Trimestral", "LTV bruto · Semestral", "LTV bruto · Anual"]);
    expect(ltv.map((c) => c.valor)).toEqual(base.map((c) => c.valor));
    for (const c of ltv) {
      expect(c.formula!.note, c.rotulo).toContain(FRASE_DO_LTV_BRUTO);
      expect(c.formula!.expression).toBe(base.find((b) => b.id === c.id)!.formula!.expression);
    }
  });
});
