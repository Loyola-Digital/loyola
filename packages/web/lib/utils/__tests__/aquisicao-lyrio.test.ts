import { describe, expect, it } from "vitest";
import { avisoDeNaoClassificado, cacEmCentavos, cardsDeAquisicao, ltvEmCentavos, type EntradaDeAquisicao, type LtvDoLyrio, type PagantesPorCanal } from "../aquisicao-lyrio";
import { fmtBRL } from "../resumo-mobile-lyrio";

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
const vazio = { pagamentos: 0, pessoas: 0, receitaCentavos: 0, produtos: [] };
const LTV: LtvDoLyrio = {
  planos: [
    { plano: "mensal", rotulo: "LTV Mensal", receitaCentavos: 0, pessoas: 0, produtos: [] },
    { plano: "trimestral", rotulo: "LTV Trimestral", receitaCentavos: 2499, pessoas: 1, produtos: [{ productId: "premium_quartely_25:base", pagamentos: 1, pessoas: 1, receitaCentavos: 2499 }] },
    { plano: "semestral", rotulo: "LTV Semestral", receitaCentavos: 5969, pessoas: 6, produtos: [{ productId: "premium_halfyearly_50:base", pagamentos: 6, pessoas: 6, receitaCentavos: 5969 }] },
    {
      plano: "anual", rotulo: "LTV Anual", receitaCentavos: 10997, pessoas: 2,
      produtos: [
        { productId: "premium_yearly_150:base", pagamentos: 2, pessoas: 1, receitaCentavos: 7998 },
        { productId: "premium_yearly_partner_100", pagamentos: 1, pessoas: 1, receitaCentavos: 2999 },
      ],
    },
  ],
  naoClassificado: vazio,
  foraPorDecisao: { pagamentos: 1, pessoas: 1, receitaCentavos: 99, produtos: [{ productId: "rc_promo_Lyrio Pro_daily", pagamentos: 1, pessoas: 1, receitaCentavos: 99 }] },
};
const pagantes = (days: number, p: Partial<PagantesPorCanal> = {}): PagantesPorCanal => ({
  days,
  desde: days === 28 ? "2026-09-19" : "2026-07-19",
  assinaturaDesde: "2026-08-10",
  atributosDesde: "2026-10-06",
  novosPagantes: days === 28 ? contagem(2, 1, 1, 0, 0) : contagem(4, 1, 3, 1, 1),
  renovacoes: contagem(9, 8, 7, 6, 0),
  ltv: LTV,
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

  it("QA MNT-001 — com o Google em erro, o memorial do CAC fala do CAC (não do ROAS e da Margem)", () => {
    const { cac } = cardsDeAquisicao(entrada({ google: { mostrar: true, filtro: { tipo: "erro", mensagem: "invalid_grant" }, vinteOito: { tipo: "erro", mensagem: "invalid_grant" } } }));
    const nota = achar(cac, "cac-google-filtro").formula!.note!;
    expect(nota).toContain("o CAC Google e o CAC consolidado ficam");
    expect(nota).not.toContain("ROAS");
  });

  it("QA REL-001 — Meta em erro: CAC Meta e consolidado '—' COM a causa; o CAC Google continua", () => {
    const { cac } = cardsDeAquisicao(entrada({ meta: { temCampanhas: true, filtro: undefined, vinteOito: undefined, erroFiltro: "Erro da Meta", erro28: "Erro da Meta" } }));
    for (const id of ["cac-meta-filtro", "cac-consolidado-filtro", "cac-meta-28d", "cac-consolidado-28d"]) {
      expect(achar(cac, id).valor, id).toBe("—");
      expect(achar(cac, id).formula!.values[0].value, id).toBe("Erro da Meta");
      expect(achar(cac, id).formula!.note, id).toContain("o CAC Meta e o CAC consolidado ficam");
    }
    expect(achar(cac, "cac-google-filtro").valor).toBe(fmtBRL(500));
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
  });
});

describe("LTV Mensal, Trimestral, Semestral e Anual, brutos (AC7)", () => {
  it("API anterior ao Semestral (sem o plano na resposta): o card não aparece, e os outros três continuam", () => {
    const semSemestral = { ...LTV, planos: LTV.planos.filter((p) => p.plano !== "semestral") };
    const { ltv } = cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "pronto", dados: pagantes(90, { ltv: semSemestral }) } }));
    expect(ltv.map((c) => c.rotulo)).toEqual(["LTV Mensal", "LTV Trimestral", "LTV Anual"]);
  });
  it("quatro cards, nesta ordem (D33 + QA loop 3); receita do plano ÷ pessoas: US$ 109,97 ÷ 2 = US$ 54,99 (centavos)", () => {
    const { ltv } = cardsDeAquisicao(entrada());
    expect(ltv.map((c) => c.rotulo)).toEqual(["LTV Mensal", "LTV Trimestral", "LTV Semestral", "LTV Anual"]);
    // o id da sonda de 27/10: US$ 59,69 ÷ 6 pessoas = US$ 9,95 (centavos)
    const semestral = achar(ltv, "ltv-semestral");
    expect(semestral.valor).toBe("US$ 9,95");
    expect(semestral.formula!.values.map((v) => v.label)).toContain("premium_halfyearly_50:base");
    const anual = achar(ltv, "ltv-anual");
    expect(anual.valor).toBe("US$ 54,99");
    expect(anual.formula!.result).toBe("US$ 109,97 ÷ 2 = US$ 54,99");
    expect(anual.formula!.note).toContain("BRUTO");
    expect(anual.declaracao).toMatchObject({ etiqueta: "desde 10/08", destaque: false, segueOFiltro: true });
  });

  it("o memorial lista os product_id que entraram no plano, com pessoas e receita (AC7d)", () => {
    const valores = achar(cardsDeAquisicao(entrada()).ltv, "ltv-anual").formula!.values;
    expect(valores).toContainEqual(expect.objectContaining({ label: "premium_yearly_150:base", value: "1 pessoa · US$ 79,98" }));
    expect(valores).toContainEqual(expect.objectContaining({ label: "premium_yearly_partner_100", value: "1 pessoa · US$ 29,99" }));
  });

  it("os fora por decisão aparecem no memorial (D33) — sem aviso", () => {
    expect(achar(cardsDeAquisicao(entrada()).ltv, "ltv-mensal").formula!.note).toContain("rc_promo_Lyrio Pro_daily (1 pagamento, US$ 0,99)");
    expect(avisoDeNaoClassificado(LTV)).toBeNull();
  });

  it("9. divisão por zero: plano sem pagante → '—' e LTV `null`, nunca 0; o memorial diz a causa", () => {
    expect(ltvEmCentavos(0, 0)).toBeNull();
    expect(ltvEmCentavos(500, 0)).toBeNull();
    expect(ltvEmCentavos(10997, 2)).toBe(5499);
    const m = achar(cardsDeAquisicao(entrada()).ltv, "ltv-mensal");
    expect(m.valor).toBe("—");
    expect(m.formula!.result).toContain("nenhum pagamento deste plano na janela");
  });

  it("aviso de não classificado (AC7d): pagamentos, receita e ids; nulo vira '(sem product_id)'", () => {
    const comNao: LtvDoLyrio = {
      ...LTV,
      naoClassificado: {
        pagamentos: 2, pessoas: 2, receitaCentavos: 800,
        produtos: [{ productId: "premium_weekly_5", pagamentos: 1, pessoas: 1, receitaCentavos: 500 }, { productId: null, pagamentos: 1, pessoas: 1, receitaCentavos: 300 }],
      },
    };
    expect(avisoDeNaoClassificado(comNao)).toBe("2 pagamentos (US$ 8,00) com produto não classificado: premium_weekly_5, (sem product_id). Não entram em nenhum LTV.");
    expect(avisoDeNaoClassificado(undefined)).toBeNull();
  });

  it("resposta sem `ltv` (outra versão): os cards de LTV não aparecem", () => {
    expect(cardsDeAquisicao(entrada({ pagantesFiltro: { tipo: "pronto", dados: pagantes(90, { ltv: undefined }) } })).ltv).toEqual([]);
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
    expect(r.renovacoes).toEqual([]);
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
    expect(r.ltv).toHaveLength(4);
    expect(r.renovacoes).toHaveLength(4);
  });
});
