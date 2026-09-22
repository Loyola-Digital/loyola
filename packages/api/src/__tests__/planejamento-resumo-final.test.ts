import { describe, it, expect } from "vitest";
import {
  CANAIS_ORGANICOS,
  FONTES_PAGAS,
  INDICES_DAS_COMBINACOES,
  ROTULOS_DO_CENARIO,
  gradeOrganica,
  gradePaga,
  derivarInputsFinanceiros,
  origemDoCanalNaAba1,
  parametrosDoBloco,
  combinacaoOrganica,
  origemDaFonteNaAba1,
  parametrosDoBlocoPago,
  combinacaoPaga,
  resumoFinal,
  rotulosVazios,
  ehRotuloDoCenario,
  type BlocoOrganico,
  type BlocoPago,
  type CanalOrganico,
  type FontePaga,
  type GradeOrganica,
  type GradePaga,
  type InputsFinanceiros,
  type SelecoesPorCanal,
  type SelecoesPorFonte,
} from "@loyola-x/shared";

/**
 * Story 48.5 — Resumo Final (aba 4): Cenário k = Combinação k das abas 2 e 3.
 *
 * Entradas: apêndice A da spec (dados MASCARADOS): aba 1, seis blocos
 * orgânicos, quatro blocos pagos e as cinco seleções de cada aba.
 *
 * ⚠️ AC14 separa o que REPRODUZ §4.4 do que se RECALCULA:
 *   - reproduz: o que só depende de valores não afetados pelas correções —
 *     G11 (orgânicos), F14/F18…F22 (AR-006), G26…G32 (tráfego), G35/F35,
 *     orgânicos brutos (G40/G41/G56/G57/G48), pagos brutos do Meta e do
 *     Google quente (G65/G66/G67/G69);
 *   - recalcula pela fórmula: tudo que passa pelos pagos corrigidos (D4 Meta
 *     frio, D5 Google frio, D9 Google = quente + frio): G12, G10, G14, G16,
 *     G18…G22, G24, G34/F34, G36/F36, G2, G5, G64, G68, G70, G72…G94.
 *
 * Cadeia BRUTA com tolerância; cadeia do PRODUTO com igualdade EXATA nos
 * inteiros e `!== bruto` (PO-01: a conversão total do produto difere da
 * bruta em 1,2e-7 — abaixo da tolerância).
 */

function perto(a: number | null, b: number, casas = 2) {
  expect(a).not.toBeNull();
  const tolerancia = Math.max(1e-6 * Math.max(1, Math.abs(b)), 0.5 * 10 ** -casas);
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tolerancia);
}

const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
  metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgTelegram: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseTelegram: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
};

const BLOCOS_ORG: Record<CanalOrganico, BlocoOrganico> = {
  whatsapp: { conversaoMedia: 0.04, variacaoConversao: 0.2, variacaoReceita: 0.1, taxaCaptacao: 0.12, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 3 },
  email: { conversaoMedia: 0.04, variacaoConversao: 0.3, variacaoReceita: 0.1, taxaCaptacao: 0.05, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 2 },
  instagram: { conversaoMedia: 0.02, variacaoConversao: 0.25, variacaoReceita: 0.1, taxaCaptacao: 0.03, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 4 },
  telegram: { conversaoMedia: 0.04, variacaoConversao: 0.5, variacaoReceita: 0.1, taxaCaptacao: 0.15, faixaVariacao: 0.2, fracaoCenario1: null, nivelAssumido: 1 },
  youtube: { conversaoMedia: 0.03, variacaoConversao: 0.3, variacaoReceita: 0.2, taxaCaptacao: 0.02, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 5 },
  area_membros: { conversaoMedia: 0.04, variacaoConversao: 0.4, variacaoReceita: 0.1, taxaCaptacao: 0.06, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 3 },
};
const BLOCOS_PAG: Record<FontePaga, BlocoPago> = {
  meta_quente: { pctCaptacao: 0.85, conversaoMedia: 0.012, variacaoConversao: 0.05, variacaoReceita: 0.1, cplMedioHistorico: 4.5, faixaVariacao: 0.05, fracaoCenario1: null, nivelAssumido: 4 },
  meta_frio: { pctCaptacao: 0.85, conversaoMedia: 0.006, variacaoConversao: 0.1, variacaoReceita: 0.1, cplMedioHistorico: 2.5, faixaVariacao: 0.05, fracaoCenario1: null, nivelAssumido: 3 },
  google_quente: { pctCaptacao: 0.85, conversaoMedia: 0.01, variacaoConversao: 0.05, variacaoReceita: 0.15, cplMedioHistorico: 3.0, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 5 },
  google_frio: { pctCaptacao: 0.85, conversaoMedia: 0.007, variacaoConversao: 0.1, variacaoReceita: 0.2, cplMedioHistorico: 2.2, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 2 },
};
const SEL_ORG: Record<number, number[]> = { 1: [4, 3, 2, 1, 5, 6], 2: [6, 5, 3, 2, 8, 7], 3: [5, 4, 2, 3, 6, 5], 4: [3, 3, 1, 2, 4, 4], 5: [2, 1, 2, 1, 3, 3] };
const SEL_PAG: Record<number, number[]> = { 1: [5, 4, 4, 2], 2: [4, 4, 5, 3], 3: [6, 5, 3, 2], 4: [3, 3, 4, 4], 5: [2, 6, 2, 1] };

const D = derivarInputsFinanceiros(ABA_1);

function organica(k: number, blocos = BLOCOS_ORG) {
  const grades = {} as Record<CanalOrganico, GradeOrganica>;
  const niveis = {} as Record<CanalOrganico, number | null>;
  const selecoes = {} as SelecoesPorCanal;
  CANAIS_ORGANICOS.forEach((c, i) => {
    grades[c] = gradeOrganica(parametrosDoBloco(blocos[c], origemDoCanalNaAba1(ABA_1, D, c)));
    niveis[c] = blocos[c].nivelAssumido;
    selecoes[c] = SEL_ORG[k][i];
  });
  return combinacaoOrganica({ indice: k, grades, selecoes, niveis, percentuais: ABA_1, metaMargemOrganicos: D.metaMargemOrganicos });
}

function paga(k: number, blocos = BLOCOS_PAG) {
  const grades = {} as Record<FontePaga, GradePaga>;
  const niveis = {} as Record<FontePaga, number | null>;
  const verbas = {} as Record<FontePaga, number>;
  const selecoes = {} as SelecoesPorFonte;
  FONTES_PAGAS.forEach((f, i) => {
    const o = origemDaFonteNaAba1(ABA_1, D, f);
    grades[f] = gradePaga(parametrosDoBlocoPago(blocos[f], o));
    niveis[f] = blocos[f].nivelAssumido;
    verbas[f] = o.verba;
    selecoes[f] = SEL_PAG[k][i];
  });
  return combinacaoPaga({ indice: k, grades, selecoes, niveis, percentuais: ABA_1, verbas, metaMargemPagos: D.metaMargemPagos });
}

function cenario(k: number, blocosOrg = BLOCOS_ORG, blocosPag = BLOCOS_PAG) {
  return resumoFinal({ indice: k, organica: organica(k, blocosOrg), paga: paga(k, blocosPag), metaMargemTotal: ABA_1.metaMargemTotal });
}

describe("rótulos (DV-017 = A)", () => {
  it("lista literal da planilha; rotulosVazios tem cinco cenários 1…5 sem rótulo; ehRotuloDoCenario", () => {
    expect(ROTULOS_DO_CENARIO).toEqual(["META PISO", "META BOA", "META SUPER"]);
    expect(rotulosVazios().cenarios.map((c) => c.indice)).toEqual([...INDICES_DAS_COMBINACOES]);
    expect(rotulosVazios().cenarios.every((c) => c.rotulo === null)).toBe(true);
    expect(ehRotuloDoCenario("META BOA")).toBe(true);
    expect(ehRotuloDoCenario("META ÓTIMA")).toBe(false);
    expect(ehRotuloDoCenario(null)).toBe(false);
  });
});

describe("receitas e cadeia consolidadas — Cenário 1 (RN-017, RN-018, RN-031, AR-006, AC3)", () => {
  const c1 = cenario(1);

  it("REPRODUZ §4.4: G11 = 261 410,73 (orgânicos); RECALCULA G12 = 209 910,42 (pagos com D5) e G10 = soma", () => {
    perto(c1.receitas.organicos, 261410.73);
    perto(c1.receitas.pagos, 209910.42);
    expect(c1.receitas.total).toBe(c1.receitas.organicos + c1.receitas.pagos);
    perto(c1.receitas.total, 471321.15);
  });

  it("cada linha da cadeia = orgânicos + pagos; receita líquida total (G24) = MC orgânica + receita líquida paga (RN-031)", () => {
    const o = organica(1);
    const p = paga(1);
    expect(c1.cadeia.reembolso).toBe(o.cadeia.reembolso + p.cadeia.reembolso);
    expect(c1.cadeia.receitaTributavel).toBe(o.cadeia.receitaTributavel + p.cadeia.receitaTributavel);
    expect(c1.cadeia.deducoes.imposto).toBe(o.cadeia.deducoes.imposto + p.cadeia.deducoes.imposto);
    expect(c1.cadeia.receitaLiquidaTotal).toBe(o.cadeia.mc + p.receitaLiquida);
    perto(c1.cadeia.receitaLiquidaTotal, 312203.13);
  });

  it("AR-006 (invariante): F14 = 0,04 e F18…F22 = 0,09 / 0,12 / 0,06 / 0,03 / 0,01 — os percentuais consolidados reproduzem os inputs", () => {
    perto(c1.cadeia.pctReembolso, 0.04, 6);
    perto(c1.cadeia.pctDeducoes.marketplace, 0.09, 6);
    perto(c1.cadeia.pctDeducoes.imposto, 0.12, 6);
    perto(c1.cadeia.pctDeducoes.custoProduto, 0.06, 6);
    perto(c1.cadeia.pctDeducoes.comissoes, 0.03, 6);
    perto(c1.cadeia.pctDeducoes.outros, 0.01, 6);
  });

  it("receita líquida total NÃO é a MC total (RN-031: a parcela paga é ANTES do tráfego)", () => {
    expect(c1.cadeia.receitaLiquidaTotal).not.toBe(c1.mc.total);
    expect(c1.cadeia.receitaLiquidaTotal - c1.mc.total).toBeCloseTo(c1.trafego.total, 6);
  });
});

describe("tráfego e margens — Cenário 1 (RN-027, RN-031, RN-019, AC4/AC5)", () => {
  const c1 = cenario(1);

  it("REPRODUZ §4.4: G26…G32 = 100 000 / 40 000 / 32 000 / 8 000 / 60 000 / 45 000 / 15 000; F26 recalculada sobre a bruta total", () => {
    expect(c1.trafego.total).toBe(100000);
    expect(c1.trafego.meta).toBe(40000);
    perto(c1.trafego.porFonte.meta_quente, 32000);
    perto(c1.trafego.porFonte.meta_frio, 8000);
    expect(c1.trafego.google).toBe(60000);
    perto(c1.trafego.porFonte.google_quente, 45000);
    perto(c1.trafego.porFonte.google_frio, 15000);
    perto(c1.trafego.pctDaReceitaTotal, 100000 / c1.receitas.total, 6);
    perto(c1.trafego.pctDaReceitaTotal, 0.21217, 6);
  });

  it("o tráfego é o mesmo nos cinco cenários", () => {
    for (const k of INDICES_DAS_COMBINACOES) expect(cenario(k).trafego.total).toBe(100000);
  });

  it("REPRODUZ G35 = 173 158,46 e F35 = 0,6624; RECALCULA G36/F36 (D5) e G34/F34; identidade mc_total = receita_liquida_total − trafego_total", () => {
    perto(c1.mc.organicos, 173158.46);
    expect(c1.mc.pctOrganicos).toBeCloseTo(0.6624, 4);
    perto(c1.mc.pagos, 39044.66);
    perto(c1.mc.pctPagos, 0.186006, 6);
    perto(c1.mc.total, 212203.13);
    perto(c1.mc.pctTotal, 0.45023, 6);
    for (const k of INDICES_DAS_COMBINACOES) {
      const c = cenario(k);
      expect(Math.abs(c.mc.total - (c.cadeia.receitaLiquidaTotal - c.trafego.total))).toBeLessThan(1e-6);
    }
  });
});

describe("meta total, atingimento e gap (RN-020, AC6)", () => {
  it("contra F13 = 250 000: G2 = 0,848813 e G5 = −37 796,87 (recalculados); cenários 2–5", () => {
    const c1 = cenario(1);
    expect(c1.meta.meta).toBe(250000);
    perto(c1.meta.atingimento, 0.848813, 6);
    perto(c1.meta.gap, -37796.87);
    perto(cenario(2).meta.atingimento, 1.042727, 6);
    perto(cenario(3).meta.atingimento, 0.897237, 6);
    perto(cenario(4).meta.atingimento, 0.796289, 6);
    perto(cenario(5).meta.atingimento, 0.625548, 6);
  });

  it("meta zero → atingimento null (era #DIV/0!); margem negativa → número negativo (era #VALUE! na barra)", () => {
    const c = resumoFinal({ indice: 1, organica: organica(1), paga: paga(1), metaMargemTotal: 0 });
    expect(c.meta.atingimento).toBeNull();
    expect(c.meta.gap).toBe(c.mc.total);
    const o = organica(1);
    const vazias = {} as SelecoesPorFonte;
    for (const f of FONTES_PAGAS) vazias[f] = null;
    const p = { ...paga(1) };
    // pagos sem receita → mc_pagos = −tráfego; com orgânicos zerados o total fica negativo
    const pSemReceita = combinacaoPaga({
      indice: 1,
      grades: (() => { const g = {} as Record<FontePaga, GradePaga>; for (const f of FONTES_PAGAS) g[f] = gradePaga(parametrosDoBlocoPago(BLOCOS_PAG[f], origemDaFonteNaAba1(ABA_1, D, f))); return g; })(),
      selecoes: vazias,
      niveis: { meta_quente: 4, meta_frio: 3, google_quente: 5, google_frio: 2 },
      percentuais: ABA_1,
      verbas: p.trafego.porFonte,
      metaMargemPagos: D.metaMargemPagos,
    });
    const oVazia = { ...o, cadeia: { ...o.cadeia, mc: 0, receitaBruta: 0 } };
    const neg = resumoFinal({ indice: 1, organica: oVazia, paga: pSemReceita, metaMargemTotal: 250000 });
    expect(neg.mc.total).toBe(-100000);
    expect(neg.meta.atingimento).toBe(-100000 / 250000);
  });
});

describe("marketing dos orgânicos — Cenário 1 (RN-022, RN-029, AR-007, AC7)", () => {
  const c1 = cenario(1);

  it("REPRODUZ §4.4 no bruto: G40 = 217,842272, G41 = 89,586538, G56 = 7 963,530073, G57 = 2 488,514957, G48 = 0,027355", () => {
    perto(c1.organicos.vendasBruto, 217.842272, 6);
    perto(c1.organicos.canais.whatsapp.vendasBruto, 89.586538, 6);
    perto(c1.organicos.leadsBruto, 7963.530073, 6);
    perto(c1.organicos.canais.whatsapp.leadsBruto, 2488.514957, 6);
    perto(c1.organicos.conversaoBruto, 0.027355, 6);
  });

  it("PO-01: cadeia do PRODUTO com igualdade EXATA — 221 vendas, 8 079 leads, conversão 221 ÷ 8 079 — e !== bruto", () => {
    expect(c1.organicos.vendas).toBe(221);
    expect(c1.organicos.leads).toBe(8079);
    expect(c1.organicos.conversao).toBe(221 / 8079);
    expect(c1.organicos.conversao).not.toBe(c1.organicos.conversaoBruto);
  });

  it("AR-007 (equivalência): os totais lidos são iguais à re-soma por canal", () => {
    const somaV = CANAIS_ORGANICOS.reduce((s, c) => s + (c1.organicos.canais[c].vendas ?? 0), 0);
    const somaL = CANAIS_ORGANICOS.reduce((s, c) => s + (c1.organicos.canais[c].leads ?? 0), 0);
    expect(c1.organicos.vendas).toBe(somaV);
    expect(c1.organicos.leads).toBe(somaL);
  });
});

describe("marketing dos pagos — Cenário 1 (RN-022, RN-029, RN-030, D9, D13, AC8/AC9)", () => {
  const c1 = cenario(1);

  it("REPRODUZ §4.4 no bruto: G65 = 69,8775, G66/G67 = 56,937222 / 12,940278, G69 = 83,172852", () => {
    perto(c1.pagos.meta.vendasBruto, 69.8775, 6);
    perto(c1.pagos.fontes.meta_quente.vendasBruto, 56.937222, 6);
    perto(c1.pagos.fontes.meta_frio.vendasBruto, 12.940278, 6);
    perto(c1.pagos.fontes.google_quente.vendasBruto, 83.172852, 6);
  });

  it("NÃO reproduz DV-015: Google = quente + frio (105,047852 no bruto), não só o quente (83,172852 — o G68 da spec)", () => {
    const q = c1.pagos.fontes.google_quente.vendasBruto!;
    const f = c1.pagos.fontes.google_frio.vendasBruto!;
    perto(c1.pagos.google.vendasBruto, q + f, 6);
    perto(c1.pagos.google.vendasBruto, 105.047852, 6);
    expect(c1.pagos.google.vendasBruto).not.toBeCloseTo(83.172852, 4);
    expect(c1.pagos.google.vendas).toBe(c1.pagos.fontes.google_quente.vendas! + c1.pagos.fontes.google_frio.vendas!);
    // e as conversões do Google e dos pagos seguem a soma certa
    expect(c1.pagos.google.conversao).toBe(c1.pagos.google.vendas! / c1.pagos.google.leads!);
  });

  it("total de pagos = as QUATRO fontes (D13): bruto 174,925352; produto 176 / 22 846 com igualdade exata", () => {
    perto(c1.pagos.vendasBruto, 174.925352, 6);
    expect(c1.pagos.vendas).toBe(176);
    expect(c1.pagos.leads).toBe(22846);
    expect(c1.pagos.conversao).toBe(176 / 22846);
    expect(c1.pagos.conversao).not.toBe(c1.pagos.conversaoBruto);
  });

  it("RN-030 — CPL consolidado: produto 100 000 ÷ 22 846 = 4,377134 EXATO; bruto 4,405267 / Meta 4,620185 / Google 4,272762; Meta e Google pelo tráfego da plataforma", () => {
    expect(c1.pagos.cpl).toBe(100000 / 22846);
    expect(c1.pagos.cpl).not.toBe(c1.pagos.cplBruto);
    perto(c1.pagos.cplBruto, 4.405267, 6);
    perto(c1.pagos.meta.cplBruto, 4.620185, 6);
    perto(c1.pagos.google.cplBruto, 4.272762, 6);
    expect(c1.pagos.meta.cpl).toBe(40000 / c1.pagos.meta.leads!);
    expect(c1.pagos.google.cpl).toBe(60000 / c1.pagos.google.leads!);
  });

  it("os CPL por fonte são os CPL máximos escolhidos na 48.4 — lidos, não recalculados (o mesmo objeto da combinação)", () => {
    const p = paga(1);
    const c = resumoFinal({ indice: 1, organica: organica(1), paga: p, metaMargemTotal: 250000 });
    for (const f of FONTES_PAGAS) {
      expect(c.pagos.fontes[f]).toBe(p.fontes[f]); // identidade: a aba 4 não copia nem refaz
      expect(c1.pagos.fontes[f]).toEqual(p.fontes[f]);
    }
  });
});

describe("null por linha (D3, DV-008, AC15b)", () => {
  it("canal orgânico sem nível → leads/conversão orgânicos null; linhas dos pagos intactas; MC e receitas seguem", () => {
    const blocos = { ...BLOCOS_ORG, email: { ...BLOCOS_ORG.email, nivelAssumido: null } };
    const c = cenario(1, blocos);
    expect(c.organicos.leads).toBeNull();
    expect(c.organicos.conversao).toBeNull();
    expect(c.organicos.vendas).toBe(221);
    expect(c.pagos.leads).toBe(22846);
    expect(c.pagos.cpl).toBe(100000 / 22846);
    perto(c.mc.total, 212203.13);
  });

  it("fonte paga sem nível → leads/CPL/conversão dos pagos e da plataforma null; orgânicos intactos", () => {
    const blocos = { ...BLOCOS_PAG, google_frio: { ...BLOCOS_PAG.google_frio, nivelAssumido: null } };
    const c = cenario(1, BLOCOS_ORG, blocos);
    expect(c.pagos.leads).toBeNull();
    expect(c.pagos.cpl).toBeNull();
    expect(c.pagos.conversao).toBeNull();
    expect(c.pagos.google.cpl).toBeNull();
    expect(c.pagos.meta.cpl).not.toBeNull();
    expect(c.pagos.vendas).toBe(176);
    expect(c.organicos.leads).toBe(8079);
    expect(c.organicos.conversao).toBe(221 / 8079);
  });

  it("receita total zero → percentuais null, não NaN", () => {
    const o = organica(1);
    const p = paga(1);
    const oZ = { ...o, cadeia: { ...o.cadeia, receitaBruta: 0, reembolso: 0, receitaTributavel: 0, mc: 0 } };
    const pZ = { ...p, cadeia: { ...p.cadeia, receitaBruta: 0, reembolso: 0, receitaTributavel: 0 } };
    const c = resumoFinal({ indice: 1, organica: oZ, paga: pZ, metaMargemTotal: 250000 });
    expect(c.cadeia.pctReembolso).toBeNull();
    expect(c.cadeia.pctDeducoes.imposto).toBeNull();
    expect(c.trafego.pctDaReceitaTotal).toBeNull();
    expect(c.mc.pctTotal).toBeNull();
    expect(c.mc.pctOrganicos).toBeNull();
  });
});
