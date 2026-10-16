import { describe, expect, it } from "vitest";
import { cacEmCentavos, cardsDeAquisicao, ltvEmCentavos, type EntradaDeAquisicao, type PagantesPorCanal } from "../aquisicao-lyrio";
import { fmtBRL } from "../resumo-mobile-lyrio";
import { fmtUsd } from "../overview-revenuecat";

/**
 * Story 42.14 (AC4, AC5, AC7, AC8, AC9a) — CAC, LTV e renovações. "Hoje" fixo
 * em 16/10/2026; filtro de 90 dias (19/07 a 16/10), série desde 10/08.
 * Renovações e novos pagantes têm números DIFERENTES de propósito: o CAC divide
 * por novos pagantes (pessoas), nunca por renovações nem vendas (D4).
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
const pagantes = (days: number, p: Partial<PagantesPorCanal> = {}): PagantesPorCanal => ({
  days,
  desde: days === 28 ? "2026-09-19" : "2026-07-19",
  assinaturaDesde: "2026-08-10",
  atributosDesde: "2026-10-06",
  novosPagantes: days === 28 ? contagem(2, 1, 1, 0, 0) : contagem(4, 1, 3, 1, 1),
  renovacoes: contagem(9, 8, 7, 6, 0),
  ltvPorPlano: [
    { plano: "anual", rotulo: "LTV Anual", productId: "premium_yearly", receitaCentavos: 10997, pessoas: 2 },
    { plano: "trimestral", rotulo: "LTV Trimestral", productId: "premium_quartely", receitaCentavos: 0, pessoas: 0 },
  ],
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
const achar = (cards: { id: string }[], id: string) => {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`sem ${id}`);
  return c as ReturnType<typeof cardsDeAquisicao>["cac"][number];
};

describe("CAC por canal e consolidado, nas duas janelas (AC4, AC5, D9)", () => {
  it("filtro: Meta 2.000 ÷ 4 pessoas; Google 500 ÷ 1; consolidado (2.000 + 500) ÷ 10 (todos, inclusive orgânico, sem atribuição e conflito)", () => {
    const { cac } = cardsDeAquisicao(entrada());
    expect(achar(cac, "cac-meta-filtro").valor).toBe(fmtBRL(500));
    expect(achar(cac, "cac-google-filtro").valor).toBe(fmtBRL(500));
    expect(achar(cac, "cac-consolidado-filtro").valor).toBe(fmtBRL(250));
    expect(achar(cac, "cac-consolidado-filtro").formula!.result).toBe(`${fmtBRL(2500)} ÷ 10 = ${fmtBRL(250)}`);
  });

  it("28 dias fixos: os insumos de 28 dias (Meta 1.000 ÷ 2; Google 100 ÷ 1; consolidado 1.100 ÷ 4) — não os do filtro", () => {
    const { cac } = cardsDeAquisicao(entrada());
    expect(achar(cac, "cac-meta-28d").valor).toBe(fmtBRL(500));
    expect(achar(cac, "cac-google-28d").valor).toBe(fmtBRL(100));
    expect(achar(cac, "cac-consolidado-28d").valor).toBe(fmtBRL(275));
    expect(achar(cac, "cac-meta-28d").rotulo).toBe("CAC Meta · 28d fixo");
  });

  it("etiquetas: o do filtro segue (`desde 10/08`, a série começa depois de 19/07); o de 28 dias é `28d fixo` com âmbar (PO-D2)", () => {
    const { cac } = cardsDeAquisicao(entrada());
    expect(achar(cac, "cac-meta-filtro").declaracao).toMatchObject({ etiqueta: "desde 10/08", destaque: false, segueOFiltro: true });
    expect(achar(cac, "cac-meta-28d").declaracao).toMatchObject({ etiqueta: "28d fixo", destaque: true, segueOFiltro: false });
  });

  it("o memorial do CAC por canal diz a fórmula, o investimento, as pessoas, a janela e quantas empataram (AC4d, PO-D3)", () => {
    const f = achar(cardsDeAquisicao(entrada()).cac, "cac-meta-filtro").formula!;
    expect(f.expression).toBe("Investimento ÷ novos pagantes (Meta)");
    expect(f.values).toEqual([
      expect.objectContaining({ label: "Investimento (Meta, com 12,15%)", value: fmtBRL(2000) }),
      expect.objectContaining({ label: "Novos pagantes (Meta)", value: "4 pessoas" }),
    ]);
    expect(f.period).toContain("19/07 a 16/10");
    expect(f.note).toContain("1 pessoa com sinal da Meta e do Google no mesmo instante ficou em \"conflito\"");
    expect(f.note).toContain("só existe desde 10/08"); // AC4e
  });

  it("divide por PESSOAS novas, nunca pelas renovações (9 na Meta): o CAC da Meta não é 2.000 ÷ 9", () => {
    expect(achar(cardsDeAquisicao(entrada()).cac, "cac-meta-filtro").valor).not.toBe(fmtBRL(2000 / 9));
  });

  it("consolidado: as parcelas do memorial somam o total exibido, ao centavo", () => {
    const f = achar(cardsDeAquisicao(entrada({ meta: { temCampanhas: true, filtro: { spendLiquido: 0.1, imposto: 0.004, spendComImposto: 0.104 }, vinteOito: undefined }, google: { mostrar: true, filtro: { tipo: "pronto", spend: 0.205 }, vinteOito: { tipo: "carregando" } } })).cac, "cac-consolidado-filtro").formula!;
    const reais = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
    const [m, g] = f.values.slice(0, 2).map((v) => reais(String(v.value)));
    expect(Math.round((m + g) * 100)).toBe(Math.round(reais(f.result.split(" ÷ ")[0]) * 100));
  });

  it("divisão por zero (nenhum novo pagante do Google): '—', nunca zero, e o memorial diz por quê (AC4c)", () => {
    const c = achar(cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "pronto", dados: pagantes(90, { novosPagantes: contagem(4, 0, 3, 1, 1) }) } })).cac, "cac-google-filtro");
    expect(c.valor).toBe("—");
    expect(c.formula!.result).toContain("sem novo pagante na janela");
  });

  it("Google em erro: CAC Google e consolidado '—' com a causa; o CAC Meta continua", () => {
    const { cac } = cardsDeAquisicao(entrada({ google: { mostrar: true, filtro: { tipo: "erro", mensagem: "invalid_grant" }, vinteOito: { tipo: "erro", mensagem: "invalid_grant" } } }));
    for (const id of ["cac-google-filtro", "cac-consolidado-filtro", "cac-google-28d", "cac-consolidado-28d"]) {
      expect(achar(cac, id).valor, id).toBe("—");
      expect(achar(cac, id).formula!.values[0].value, id).toBe("invalid_grant");
    }
    expect(achar(cac, "cac-meta-filtro").valor).toBe(fmtBRL(500));
  });

  it("sem campanha da Meta: não há CAC Meta; o consolidado conta a Meta como 0 (não fica 'carregando')", () => {
    const { cac } = cardsDeAquisicao(entrada({ meta: { temCampanhas: false, filtro: undefined, vinteOito: undefined } }));
    expect(cac.map((c) => c.id)).not.toContain("cac-meta-filtro");
    expect(achar(cac, "cac-consolidado-filtro").valor).toBe(fmtBRL(50)); // 500 ÷ 10
  });

  it("investimento ainda carregando: '—' sem memorial", () => {
    const c = achar(cardsDeAquisicao(entrada({ meta: { temCampanhas: true, filtro: undefined, vinteOito: undefined } })).cac, "cac-meta-filtro");
    expect(c.valor).toBe("—");
    expect(c.formula).toBeUndefined();
  });

  it("aritmética em centavos", () => {
    expect(cacEmCentavos(100000, 3)).toBe(33333);
    expect(cacEmCentavos(100000, 0)).toBeNull();
    expect(cacEmCentavos(null, 3)).toBeNull();
    expect(ltvEmCentavos(10997, 2)).toBe(5499);
    expect(ltvEmCentavos(1, 0)).toBeNull();
  });
});

describe("LTV Anual e Trimestral, brutos (AC7)", () => {
  it("receita do plano ÷ pessoas: US$ 109,97 ÷ 2 = US$ 54,99; o memorial diz BRUTO e o product_id", () => {
    const anual = achar(cardsDeAquisicao(entrada()).ltv, "ltv-anual");
    expect(anual.rotulo).toBe("LTV Anual");
    expect(anual.valor).toBe(fmtUsd(54.99));
    expect(anual.formula!.result).toBe(`${fmtUsd(109.97)} ÷ 2 = ${fmtUsd(54.99)}`);
    expect(anual.formula!.note).toContain("BRUTO");
    expect(anual.formula!.values[0].source).toContain("premium_yearly");
    expect(anual.declaracao).toMatchObject({ etiqueta: "desde 10/08", destaque: false });
  });
  it("plano sem pagamento: '—' com a causa no memorial (divisão por zero)", () => {
    const t = achar(cardsDeAquisicao(entrada()).ltv, "ltv-trimestral");
    expect(t.rotulo).toBe("LTV Trimestral");
    expect(t.valor).toBe("—");
    expect(t.formula!.result).toContain("ninguém pagou o plano");
  });
  it("não há LTV Mensal nem terceiro LTV (D28)", () => {
    expect(cardsDeAquisicao(entrada()).ltv.map((c) => c.rotulo)).toEqual(["LTV Anual", "LTV Trimestral"]);
  });
});

describe("renovações por canal (AC8)", () => {
  it("uma por canal da 42.12, na ordem; o conflito só aparece quando existe", () => {
    const { renovacoes } = cardsDeAquisicao(entrada());
    expect(renovacoes.map((c) => [c.rotulo, c.valor])).toEqual([
      ["Renovações · Meta", "9"], ["Renovações · Google", "8"], ["Renovações · Orgânico ou cupom", "7"], ["Renovações · Sem atribuição", "6"],
    ]);
    const comConflito = cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "pronto", dados: pagantes(90, { renovacoes: contagem(1, 0, 0, 0, 2) }) } })).renovacoes;
    expect(comConflito.at(-1)).toMatchObject({ rotulo: "Renovações · Conflito Meta × Google", valor: "2" });
  });
  it("o memorial diz a regra (D30): conta eventos; a primeira cobrança depois do trial não entra", () => {
    const f = cardsDeAquisicao(entrada()).renovacoes[0].formula!;
    expect(f.note).toContain("Conta EVENTOS");
    expect(f.note).toContain("primeira cobrança depois do trial não entra");
    expect(f.period).toMatch(/segue o filtro de 90 dias$/);
  });
});

describe("rota da API anterior, eco e erro (AC10b, PO-D4)", () => {
  it("404 da rota (oculto) nas duas janelas: nenhum card — o banner de versão explica", () => {
    expect(cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "oculto" }, pagantes28: { tipo: "oculto" } }))).toEqual({ cac: [], ltv: [], renovacoes: [] });
  });
  it("resposta que ecoa OUTRA janela não vale para esta (o eco decide)", () => {
    const r = cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "pronto", dados: pagantes(28) } }));
    expect(r.ltv).toEqual([]);
    expect(r.cac.map((c) => c.id).every((id) => id.endsWith("-28d"))).toBe(true);
  });
  it("erro: cada card '—' com a causa, nenhum some", () => {
    const erro = { tipo: "erro" as const, causa: "outro" as const, mensagem: "Falhou" };
    const r = cardsDeAquisicao(entrada({ pagantesFiltro: erro, pagantes28: erro }));
    for (const c of [...r.cac, ...r.ltv, ...r.renovacoes]) {
      expect(c.valor, c.id).toBe("—");
      expect(c.formula!.values[0].value, c.id).toBe("Falhou");
    }
    expect(r.cac).toHaveLength(6);
    expect(r.ltv).toHaveLength(2);
    expect(r.renovacoes).toHaveLength(4);
  });
});
