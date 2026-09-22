import { describe, it, expect } from "vitest";
import {
  FONTES_PAGAS,
  CENARIOS,
  NIVEIS_PAGOS,
  CAMPOS_DO_BLOCO_PAGO,
  INDICES_DAS_COMBINACOES,
  gradePaga,
  derivarInputsFinanceiros,
  origemDaFonteNaAba1,
  parametrosDoBlocoPago,
  pagosVazios,
  trafegoDaCombinacao,
  mcDaPlataforma,
  mcPorPlataforma,
  resumoDaFonte,
  totaisPagos,
  combinacaoPaga,
  cadeiaDeDeducoes,
  type BlocoPago,
  type FontePaga,
  type GradePaga,
  type InputsFinanceiros,
  type SelecoesPorFonte,
} from "@loyola-x/shared";

/**
 * Story 48.4 — combinações das fontes pagas (região U:AG da aba 3).
 *
 * Entradas: apêndice A da spec (dados MASCARADOS): aba 1 completa, os quatro
 * blocos e as cinco seleções (`X = 5, 4, 4, 2`; `Z = 4, 4, 5, 3`; …).
 *
 * ⚠️ AC15 separa o que REPRODUZ §3.4 do que se RECALCULA:
 *   - reproduz: blocos que D4/D5 não mudam — Meta quente (Y12, resumo bruto),
 *     Google quente (Y15, resumo bruto), o tráfego (Y30/Y31/Y34), a receita do
 *     Meta frio (Y13 — a série do bloco 2 não dependia de outro bloco) e, por
 *     consequência, `Y11`, `Y40`, `X40`, `Y47`;
 *   - recalcula pela fórmula do AC: Meta frio (escada com a PRÓPRIA variação,
 *     D4 — não reproduz DV-010), Google frio (meta de receita 31 250,00 por
 *     D5 — não reproduz DV-001 — e série com a própria variação 0,20) e tudo
 *     que passa por eles (Y16, Y10, cadeia, Y39, Y2, Y5). Esses são derivados
 *     do motor da 48.2 (já validado) e a FÓRMULA é afirmada, não o número da
 *     spec.
 *
 * Os diferenciais de AC16 afirmam a regra certa E que a regra da planilha
 * daria outro número — sobre o mesmo motor (PO-04).
 */

/** |a − b| ≤ max(1e-6 × max(1, |b|), meia unidade da última casa da spec) — como na 48.3. */
function perto(a: number | null, b: number, casas = 2) {
  expect(a).not.toBeNull();
  const tolerancia = Math.max(1e-6 * Math.max(1, Math.abs(b)), 0.5 * 10 ** -casas);
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tolerancia);
}

/** Apêndice A — aba 1. */
const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
  metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgManychat: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseManychat: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
};

/** Apêndice A — aba 3, por bloco; nível assumido = posição da caixa (H15 → 4, H37 → 3, H66 → 5, H84 → 2). */
const BLOCOS: Record<FontePaga, BlocoPago> = {
  meta_quente: { pctCaptacao: 0.85, conversaoMedia: 0.012, variacaoConversao: 0.05, variacaoReceita: 0.1, cplMedioHistorico: 4.5, faixaVariacao: 0.05, fracaoCenario1: null, nivelAssumido: 4 },
  meta_frio: { pctCaptacao: 0.85, conversaoMedia: 0.006, variacaoConversao: 0.1, variacaoReceita: 0.1, cplMedioHistorico: 2.5, faixaVariacao: 0.05, fracaoCenario1: null, nivelAssumido: 3 },
  google_quente: { pctCaptacao: 0.85, conversaoMedia: 0.01, variacaoConversao: 0.05, variacaoReceita: 0.15, cplMedioHistorico: 3.0, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 5 },
  google_frio: { pctCaptacao: 0.85, conversaoMedia: 0.007, variacaoConversao: 0.1, variacaoReceita: 0.2, cplMedioHistorico: 2.2, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 2 },
};

/** Apêndice A — seleções X, Z, AB, AD, AF (linhas 12, 13, 15, 16). */
const SELECOES: Record<number, number[]> = {
  1: [5, 4, 4, 2],
  2: [4, 4, 5, 3],
  3: [6, 5, 3, 2],
  4: [3, 3, 4, 4],
  5: [2, 6, 2, 1],
};

function selecoes(k: number): SelecoesPorFonte {
  const s = {} as SelecoesPorFonte;
  FONTES_PAGAS.forEach((f, i) => (s[f] = SELECOES[k][i]));
  return s;
}

const DERIVADOS = derivarInputsFinanceiros(ABA_1);

function grades(blocos: Record<FontePaga, BlocoPago> = BLOCOS): Record<FontePaga, GradePaga> {
  const g = {} as Record<FontePaga, GradePaga>;
  for (const f of FONTES_PAGAS) g[f] = gradePaga(parametrosDoBlocoPago(blocos[f], origemDaFonteNaAba1(ABA_1, DERIVADOS, f)));
  return g;
}

function niveis(blocos: Record<FontePaga, BlocoPago> = BLOCOS): Record<FontePaga, number | null> {
  const n = {} as Record<FontePaga, number | null>;
  for (const f of FONTES_PAGAS) n[f] = blocos[f].nivelAssumido;
  return n;
}

function verbas(): Record<FontePaga, number> {
  const v = {} as Record<FontePaga, number>;
  for (const f of FONTES_PAGAS) v[f] = origemDaFonteNaAba1(ABA_1, DERIVADOS, f).verba;
  return v;
}

function combinacao(k: number, blocos: Record<FontePaga, BlocoPago> = BLOCOS, sel: SelecoesPorFonte = selecoes(k)) {
  return combinacaoPaga({
    indice: k,
    grades: grades(blocos),
    selecoes: sel,
    niveis: niveis(blocos),
    percentuais: ABA_1,
    verbas: verbas(),
    metaMargemPagos: DERIVADOS.metaMargemPagos,
  });
}

describe("ponte de chaves 48.1 ↔ 48.2 (PO-01, AC3)", () => {
  it("origemDaFonteNaAba1 lê receita (D5: as quatro ÷ mc_alvo_pagos) e verba certas para as QUATRO fontes", () => {
    const esperado: Record<FontePaga, [number, number]> = {
      meta_quente: [66666.67, 32000],
      meta_frio: [16666.67, 8000],
      google_quente: [93750, 45000],
      google_frio: [31250, 15000], // NÃO 14 423,08 da planilha (DV-001)
    };
    for (const f of FONTES_PAGAS) {
      const o = origemDaFonteNaAba1(ABA_1, DERIVADOS, f);
      perto(o.metaReceita, esperado[f][0]);
      perto(o.verba, esperado[f][1]);
      expect(o.ticketMedio, f).toBe(1200);
    }
  });

  it("parametrosDoBlocoPago passa os oito campos do bloco e a origem, sem recalcular nada (E4)", () => {
    expect(parametrosDoBlocoPago(BLOCOS.meta_quente, { metaReceita: 100, verba: 50, ticketMedio: 5 })).toEqual({
      metaReceita: 100, verba: 50, ticketMedio: 5,
      pctCaptacao: 0.85, conversaoMedia: 0.012, variacaoConversao: 0.05, variacaoReceita: 0.1, fracaoCenario1: null, cplMedioHistorico: 4.5, faixaVariacao: 0.05,
    });
  });

  it("D4: cada bloco usa a própria variação — Meta frio escada 0,006 · 0,005 · 0,004 (a planilha dava 0,0055 · 0,005 por DV-010)", () => {
    const e = grades().meta_frio.escada;
    expect(e[0]).toBeCloseTo(0.006, 10);
    expect(e[1]).toBeCloseTo(0.005, 10);
    expect(e[2]).toBeCloseTo(0.004, 10);
    expect(e[1]).not.toBeCloseTo(0.0055, 10);
  });

  it("D5 + D4: Google frio com meta 31 250,00 e a própria variação 0,20 — c1 = 21 875,00, c2 = 26 250,00", () => {
    const s = grades().google_frio.receita;
    perto(s[0], 21875);
    perto(s[1], 26250);
  });
});

describe("forma persistida (AC1/AC2)", () => {
  it("pagosVazios: quatro fontes com os oito campos em null e cinco combinações 1…5", () => {
    const v = pagosVazios();
    expect(Object.keys(v.blocos).sort()).toEqual([...FONTES_PAGAS].sort());
    for (const f of FONTES_PAGAS) {
      expect(Object.keys(v.blocos[f]).sort()).toEqual([...CAMPOS_DO_BLOCO_PAGO].sort());
      expect(Object.values(v.blocos[f]).every((x) => x === null)).toBe(true);
    }
    expect(v.combinacoes.map((c) => c.indice)).toEqual([...INDICES_DAS_COMBINACOES]);
    for (const c of v.combinacoes) expect(Object.keys(c.selecoes).sort()).toEqual([...FONTES_PAGAS].sort());
  });
});

describe("receita, cadeia e tráfego — Combinação 1 (RN-016…018, RN-027, AC6/AC7)", () => {
  const c1 = combinacao(1);

  it("REPRODUZ §3.4: Y12 = 68 324,67 (Meta quente c5), Y15 = 99 807,42 (Google quente c4), Y13 = 15 528,33 (Meta frio c4)", () => {
    perto(c1.receitas.meta_quente, 68324.67);
    perto(c1.receitas.google_quente, 99807.42);
    perto(c1.receitas.meta_frio, 15528.33);
    perto(c1.receitaMeta, 83853.0); // Y11
  });

  it("RECALCULA por D5/D4: Y16 = Google frio c2 = 26 250,00 (a planilha tinha 11 610,58), Y14 e Y10 pela fórmula", () => {
    perto(c1.receitas.google_frio, 26250);
    expect(c1.receitas.google_frio).toBe(grades().google_frio.receita[1]);
    perto(c1.receitaGoogle, 99807.42 + 26250);
    perto(c1.cadeia.receitaBruta, c1.receitaMeta + c1.receitaGoogle);
  });

  it("cadeia de deduções igual à 48.3 até a receita líquida (Y28): reembolso, tributável, cinco deduções", () => {
    const b = c1.cadeia.receitaBruta;
    perto(c1.cadeia.reembolso, 0.04 * b);
    perto(c1.cadeia.receitaTributavel, 0.96 * b);
    perto(c1.cadeia.totalDeducoes, 0.31 * 0.96 * b);
    perto(c1.receitaLiquida, 0.96 * b - 0.31 * 0.96 * b);
    expect(c1.receitaLiquida).toBe(c1.cadeia.mc);
  });

  it("REPRODUZ §3.4: tráfego Y31 = 40 000, Y34 = 60 000, Y30 = 100 000; por fonte = verbas da 48.1; % = total ÷ receita bruta", () => {
    expect(c1.trafego.meta).toBe(40000);
    expect(c1.trafego.google).toBe(60000);
    expect(c1.trafego.total).toBe(100000);
    perto(c1.trafego.porFonte.meta_quente, 32000);
    perto(c1.trafego.porFonte.meta_frio, 8000);
    perto(c1.trafego.porFonte.google_quente, 45000);
    perto(c1.trafego.porFonte.google_frio, 15000);
    perto(c1.trafego.pctDaReceita, 100000 / c1.cadeia.receitaBruta, 6);
  });

  it("o tráfego é o mesmo nas cinco combinações", () => {
    for (const k of [2, 3, 4, 5]) {
      const c = combinacao(k);
      expect(c.trafego.total).toBe(100000);
      expect(c.trafego.porFonte).toEqual(c1.trafego.porFonte);
    }
  });

  it("trafegoDaCombinacao: verba vazia vale zero; receita bruta zero → % null", () => {
    const t = trafegoDaCombinacao({ meta_quente: null, meta_frio: 8000, google_quente: undefined, google_frio: 15000 }, 0);
    expect(t.meta).toBe(8000);
    expect(t.google).toBe(15000);
    expect(t.total).toBe(23000);
    expect(t.pctDaReceita).toBeNull();
  });
});

describe("margem por plataforma e dos pagos (RN-028, RN-019, AC8)", () => {
  const c1 = combinacao(1);

  it("REPRODUZ §3.4: Y40 = 15 544,23 e X40 = 0,185375 (o Meta só depende de Y12/Y13, que reproduzem)", () => {
    perto(c1.mc.meta.mc, 15544.23);
    perto(c1.mc.meta.pct, 0.185375, 6);
  });

  it("mc_fonte da spec: tributável − Σ custos × tributável − tráfego, por plataforma", () => {
    const m = mcDaPlataforma(83853, 40000, ABA_1);
    const tributavel = 83853 * 0.96;
    perto(m.mc, tributavel - 0.31 * tributavel - 40000);
    perto(m.pct, m.mc / 83853, 6);
    expect(mcDaPlataforma(0, 1000, ABA_1).pct).toBeNull();
    perto(mcDaPlataforma(0, 1000, ABA_1).mc, -1000);
  });

  it("RECALCULA: Google com D5 — mc_google pela fórmula sobre Y14 recalculado; mc_pagos = soma; % sobre a bruta", () => {
    const g = mcDaPlataforma(c1.receitaGoogle, 60000, ABA_1);
    expect(c1.mc.google.mc).toBe(g.mc);
    perto(c1.mc.pagos, c1.mc.meta.mc + c1.mc.google.mc);
    perto(c1.mc.pagosPct, c1.mc.pagos / c1.cadeia.receitaBruta, 6);
  });

  it("identidade mc_pagos = receita_liquida − trafego_total vale nas cinco combinações (AC8)", () => {
    for (const k of INDICES_DAS_COMBINACOES) {
      const c = combinacao(k);
      expect(Math.abs(c.mc.pagos - (c.receitaLiquida - c.trafego.total))).toBeLessThan(1e-6);
    }
  });

  it("todas as seleções vazias → receita 0, MC = −tráfego (o tráfego não some), % null", () => {
    const vazias = {} as SelecoesPorFonte;
    for (const f of FONTES_PAGAS) vazias[f] = null;
    const c = combinacao(1, BLOCOS, vazias);
    expect(c.cadeia.receitaBruta).toBe(0);
    expect(c.mc.pagos).toBe(-100000);
    expect(c.mc.pagosPct).toBeNull();
    expect(c.mc.meta.pct).toBeNull();
    expect(c.trafego.pctDaReceita).toBeNull();
  });
});

describe("meta, atingimento e gap (RN-020, AC9)", () => {
  it("contra meta_margem_pagos = 62 500 (F14): atingimento e gap pela fórmula (Y39 recalculado por D5)", () => {
    const c1 = combinacao(1);
    expect(c1.meta.meta).toBe(62500);
    perto(c1.meta.atingimento, c1.mc.pagos / 62500, 6);
    perto(c1.meta.gap, c1.mc.pagos - 62500);
  });

  it("margem negativa dá atingimento NEGATIVO (número), não 0 como o IFERROR da barra", () => {
    const vazias = {} as SelecoesPorFonte;
    for (const f of FONTES_PAGAS) vazias[f] = null;
    const c = combinacao(1, BLOCOS, vazias);
    expect(c.meta.atingimento).toBe(-100000 / 62500);
    expect(c.meta.atingimento).toBeLessThan(0);
  });
});

describe("resumo de marketing — Combinação 1 (RN-013, RN-021, RN-022, RN-025, RN-029, D10, AC10/AC15)", () => {
  const c1 = combinacao(1);

  it("REPRODUZ §3.4 no bruto — Meta quente (nível 4, c5): 56,937222 / 5,016051 / 5 422,592593 / 0,0105", () => {
    const m = c1.fontes.meta_quente;
    perto(m.vendasBruto, 56.937222, 6);
    perto(m.cplBruto, 5.016051, 6);
    perto(m.leadsBruto, 5422.592593, 6);
    perto(m.conversaoBruto, 0.0105, 6);
  });

  it("REPRODUZ §3.4 no bruto — Google quente (nível 5, c4): 83,172852 / 3,679085 / 10 396,606445 / 0,008", () => {
    const g = c1.fontes.google_quente;
    perto(g.vendasBruto, 83.172852, 6);
    perto(g.cplBruto, 3.679085, 6);
    perto(g.leadsBruto, 10396.606445, 6);
    perto(g.conversaoBruto, 0.008, 6);
  });

  it("REPRODUZ Y53 (vendas do Meta frio, 12,940278) e RECALCULA leads/CPL por D4 (nível 3 = 0,004, não 0,005)", () => {
    const f = c1.fontes.meta_frio;
    perto(f.vendasBruto, 12.940278, 6);
    perto(f.leadsBruto, 12.940278 / 0.004, 6);
    expect(f.leadsBruto).not.toBeCloseTo(2588.055556, 2); // o número da spec, com a escada errada
    perto(f.cplBruto, 8000 * 0.85 / (12.940278 / 0.004), 6);
  });

  it("cadeia do PRODUTO (D10): Meta quente vendas = 57, leads = ⌈57 ÷ 0,0105⌉ = 5 429, CPL = 27 200 ÷ 5 429, conversão = 57 ÷ 5 429", () => {
    const m = c1.fontes.meta_quente;
    expect(m.vendas).toBe(57);
    expect(m.leads).toBe(5429);
    expect(m.cpl).toBe(27200 / 5429);
    expect(m.conversao).toBe(57 / 5429);
    expect(m.conversao).not.toBe(m.conversaoBruto);
    expect(m.cpl).not.toBe(m.cplBruto);
  });

  it("por plataforma (RN-029): Meta = quente + frio — Y47 = 69,877500 reproduz; produto = 57 + 13 = 70", () => {
    perto(c1.totais.meta.vendasBruto, 69.8775, 6);
    expect(c1.totais.meta.vendas).toBe(70);
    expect(c1.totais.meta.leads).toBe(5429 + 3250);
    expect(c1.totais.meta.conversao).toBe(70 / (5429 + 3250));
  });

  it("NÃO reproduz DV-013: total de vendas pagas = as QUATRO fontes, e é MAIOR que quente + quente (o SUM(Y48, Y59) da planilha = 140,110074)", () => {
    const f = c1.fontes;
    const quatro = f.meta_quente.vendasBruto! + f.meta_frio.vendasBruto! + f.google_quente.vendasBruto! + f.google_frio.vendasBruto!;
    const soQuentes = f.meta_quente.vendasBruto! + f.google_quente.vendasBruto!;
    perto(c1.totais.vendasBruto, quatro, 6);
    perto(soQuentes, 140.110074, 6); // a spec confirma o que a planilha somava
    expect(c1.totais.vendasBruto).toBeGreaterThan(soQuentes);
    expect(c1.totais.vendas).toBe(f.meta_quente.vendas! + f.meta_frio.vendas! + f.google_quente.vendas! + f.google_frio.vendas!);
  });

  it("NÃO reproduz DV-014: na Combinação 2, CPL e leads do Meta frio vêm do bloco Meta frio com Z13 = 4 — não do Meta quente com Z16 = 3", () => {
    const c2 = combinacao(2);
    const g = grades();
    const nf = BLOCOS.meta_frio.nivelAssumido! - 1;
    const nq = BLOCOS.meta_quente.nivelAssumido! - 1;
    expect(c2.fontes.meta_frio.cpl).toBe(g.meta_frio.cpl[nf][4 - 1]);
    expect(c2.fontes.meta_frio.leads).toBe(g.meta_frio.leads[nf][4 - 1]);
    expect(c2.fontes.meta_frio.cpl).not.toBe(g.meta_quente.cpl[nq][3 - 1]); // o que a planilha lia (AA54)
    expect(c2.fontes.meta_frio.leads).not.toBe(g.meta_quente.leads[nq][3 - 1]);
    // e nas cinco combinações a regra é a mesma
    for (const k of INDICES_DAS_COMBINACOES) {
      const c = combinacao(k);
      const sel = selecoes(k).meta_frio!;
      expect(c.fontes.meta_frio.cplBruto).toBe(g.meta_frio.cplBruto[nf][sel - 1]);
    }
  });

  it("NÃO reproduz DV-008: fonte sem nível → CPL, leads e conversão null; leads da plataforma e totais null; vendas seguem", () => {
    const blocos = { ...BLOCOS, google_frio: { ...BLOCOS.google_frio, nivelAssumido: null } };
    const c = combinacao(1, blocos);
    expect(c.fontes.google_frio.vendas).toBe(22);
    expect(c.fontes.google_frio.cpl).toBeNull();
    expect(c.fontes.google_frio.leads).toBeNull();
    expect(c.fontes.google_frio.conversao).toBeNull();
    expect(c.totais.google.leads).toBeNull();
    expect(c.totais.google.conversao).toBeNull();
    expect(c.totais.google.vendas).toBe(84 + 22);
    expect(c.totais.leads).toBeNull();
    expect(c.totais.vendas).toBe(176);
    expect(c.totais.meta.leads).not.toBeNull(); // a outra plataforma não é contaminada
  });

  it("fonte com seleção vazia contribui 0 em vendas e leads, sem derrubar os totais; CPL e conversão são null (razões sem base — REQ-001)", () => {
    const sel = selecoes(1);
    sel.meta_frio = null;
    const c = combinacao(1, BLOCOS, sel);
    expect(c.fontes.meta_frio).toMatchObject({ receita: 0, vendas: 0, leads: 0, cpl: null, cplBruto: null, conversao: null });
    expect(c.fontes.meta_frio.cpl).not.toBe(0);
    expect(c.totais.meta.vendas).toBe(57);
    expect(c.totais.vendas).toBe(176 - 13);
  });

  it("resumoDaFonte: nível fora de 1…10 é exceção; totaisPagos agrupa por plataforma", () => {
    expect(() => resumoDaFonte(grades().meta_quente, 5, NIVEIS_PAGOS + 1)).toThrow(RangeError);
    expect(() => resumoDaFonte(grades().meta_quente, CENARIOS + 1, 1)).toThrow(RangeError);
    const t = totaisPagos({
      meta_quente: resumoDaFonte(grades().meta_quente, 5, 4),
      meta_frio: resumoDaFonte(grades().meta_frio, 4, 3),
      google_quente: resumoDaFonte(grades().google_quente, 4, 5),
      google_frio: resumoDaFonte(grades().google_frio, 2, 2),
    });
    expect(t.meta.vendas).toBe(70);
    expect(t.google.vendas).toBe(84 + 22);
    expect(t.vendas).toBe(176);
  });

  it("mcPorPlataforma + cadeiaDeDeducoes são consistentes: MC dos pagos = cadeia.mc das quatro receitas − tráfego", () => {
    const receitas = c1.receitas;
    const t = trafegoDaCombinacao(verbas(), c1.cadeia.receitaBruta);
    const mc = mcPorPlataforma(receitas, t, ABA_1, c1.cadeia.receitaBruta);
    const liquida = cadeiaDeDeducoes(FONTES_PAGAS.map((f) => receitas[f]), ABA_1).mc;
    expect(Math.abs(mc.pagos - (liquida - t.total))).toBeLessThan(1e-6);
  });
});
