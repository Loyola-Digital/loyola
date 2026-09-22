import { describe, it, expect } from "vitest";
import {
  CANAIS_ORGANICOS,
  CENARIOS,
  COMBINACOES,
  INDICES_DAS_COMBINACOES,
  CAMPOS_DO_BLOCO_ORGANICO,
  gradeOrganica,
  derivarInputsFinanceiros,
  origemDoCanalNaAba1,
  parametrosDoBloco,
  organicosVazios,
  selecionarReceita,
  cadeiaDeDeducoes,
  atingimentoDaMeta,
  resumoDoCanal,
  totaisDaCombinacao,
  combinacaoOrganica,
  type BlocoOrganico,
  type CanalOrganico,
  type GradeOrganica,
  type InputsFinanceiros,
  type SelecoesPorCanal,
} from "@loyola-x/shared";

/**
 * Story 48.3 — combinações dos canais orgânicos (região U:AG da aba 2).
 *
 * Entradas: apêndice A da spec (dados MASCARADOS): aba 1 completa, os seis
 * blocos e as cinco seleções. Saídas: §2.4 "Seleção de cenário e cadeia de
 * margem" e "Vendas, leads e conversão". A cadeia BRUTA reproduz a spec com
 * tolerância relativa 1e-6 (PO-04: a spec está em 2 casas; onde ela tem menos
 * casas — Y29 em 4 — a comparação usa a precisão dela). A cadeia do PRODUTO
 * (D10) é afirmada com igualdade exata a partir dos inteiros.
 *
 * Os testes "não reproduz DV-008" são diferenciais: cada um FALHA com a regra
 * da planilha (provado no Dev Agent Record da story).
 */

/**
 * |a − b| ≤ max(1e-6 × max(1, |b|), meia unidade da última casa da spec).
 * A tolerância relativa é a da 48.2; a absoluta existe porque a spec
 * arredonda a 2 casas (moeda) e, em valores pequenos como Y26 = 2 509,54,
 * o arredondamento dela (até 0,005) é maior que 1e-6 × 2 509 (0,0025).
 * `casas` = casas decimais com que a spec escreveu `b` (2 para moeda,
 * 6 para frações e para as células de vendas/leads brutos).
 */
function perto(a: number | null, b: number, casas = 2) {
  expect(a).not.toBeNull();
  const tolerancia = Math.max(1e-6 * Math.max(1, Math.abs(b)), 0.5 * 10 ** -casas);
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tolerancia);
}

/** Apêndice A — aba 1. */
const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04,
  pctMarketplace: 0.09,
  pctImposto: 0.12,
  pctCustoProduto: 0.06,
  pctComissoes: 0.03,
  pctOutrosCustos: 0.01,
  metaMargemTotal: 250000,
  pctMargemPagos: 0.25,
  ticketMedio: 1200,
  mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000,
  pctInvestMeta: 0.4,
  pctMetaQuente: 0.8,
  pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4,
  pctOrgEmail: 0.3,
  pctOrgInstagram: 0.15,
  pctOrgManychat: 0.05,
  pctOrgYoutube: 0.05,
  pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000,
  baseEmail: 50000,
  baseInstagram: 30000,
  baseManychat: 8000,
  baseYoutube: 120000,
  baseAreaMembros: 6000,
};

/** Apêndice A — aba 2, por bloco; nível assumido = posição da caixa (H13 → 3, H32 → 2, H57 → 4, H72 → 1, H102 → 5, H120 → 3). */
const BLOCOS: Record<CanalOrganico, BlocoOrganico> = {
  whatsapp: { conversaoMedia: 0.04, variacaoConversao: 0.2, variacaoReceita: 0.1, taxaCaptacao: 0.12, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 3 },
  email: { conversaoMedia: 0.04, variacaoConversao: 0.3, variacaoReceita: 0.1, taxaCaptacao: 0.05, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 2 },
  instagram: { conversaoMedia: 0.02, variacaoConversao: 0.25, variacaoReceita: 0.1, taxaCaptacao: 0.03, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 4 },
  manychat: { conversaoMedia: 0.04, variacaoConversao: 0.5, variacaoReceita: 0.1, taxaCaptacao: 0.15, faixaVariacao: 0.2, fracaoCenario1: null, nivelAssumido: 1 },
  youtube: { conversaoMedia: 0.03, variacaoConversao: 0.3, variacaoReceita: 0.2, taxaCaptacao: 0.02, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 5 },
  area_membros: { conversaoMedia: 0.04, variacaoConversao: 0.4, variacaoReceita: 0.1, taxaCaptacao: 0.06, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 3 },
};

/** Apêndice A — seleções X, Z, AB, AD, AF (linhas 11..16, na ordem dos canais). */
const SELECOES: Record<number, number[]> = {
  1: [4, 3, 2, 1, 5, 6],
  2: [6, 5, 3, 2, 8, 7],
  3: [5, 4, 2, 3, 6, 5],
  4: [3, 3, 1, 2, 4, 4],
  5: [2, 1, 2, 1, 3, 3],
};

function selecoes(k: number): SelecoesPorCanal {
  const s = {} as SelecoesPorCanal;
  CANAIS_ORGANICOS.forEach((c, i) => (s[c] = SELECOES[k][i]));
  return s;
}

const DERIVADOS = derivarInputsFinanceiros(ABA_1);

function grades(blocos: Record<CanalOrganico, BlocoOrganico> = BLOCOS): Record<CanalOrganico, GradeOrganica> {
  const g = {} as Record<CanalOrganico, GradeOrganica>;
  for (const c of CANAIS_ORGANICOS) g[c] = gradeOrganica(parametrosDoBloco(blocos[c], origemDoCanalNaAba1(ABA_1, DERIVADOS, c)));
  return g;
}

function niveis(blocos: Record<CanalOrganico, BlocoOrganico> = BLOCOS): Record<CanalOrganico, number | null> {
  const n = {} as Record<CanalOrganico, number | null>;
  for (const c of CANAIS_ORGANICOS) n[c] = blocos[c].nivelAssumido;
  return n;
}

function combinacao(k: number, blocos: Record<CanalOrganico, BlocoOrganico> = BLOCOS) {
  return combinacaoOrganica({
    indice: k,
    grades: grades(blocos),
    selecoes: selecoes(k),
    niveis: niveis(blocos),
    percentuais: ABA_1,
    metaMargemOrganicos: DERIVADOS.metaMargemOrganicos,
  });
}

describe("ponte de chaves 48.1 ↔ 48.2 (PO-01, AC3)", () => {
  it("origemDoCanalNaAba1 lê meta de receita, base e ticket certos para os SEIS canais — inclusive area_membros ↔ areaMembros", () => {
    const esperado: Record<CanalOrganico, [number, number]> = {
      whatsapp: [115384.62, 25000],
      email: [86538.46, 50000],
      instagram: [43269.23, 30000],
      manychat: [14423.08, 8000],
      youtube: [14423.08, 120000],
      area_membros: [14423.08, 6000],
    };
    for (const c of CANAIS_ORGANICOS) {
      const o = origemDoCanalNaAba1(ABA_1, DERIVADOS, c);
      perto(o.metaReceita, esperado[c][0]);
      expect(o.base, c).toBe(esperado[c][1]);
      expect(o.ticketMedio, c).toBe(1200);
    }
  });

  it("um `undefined` silencioso na Área de Membros viraria meta zero — a ponte devolve a receita da 48.1, não zero", () => {
    const o = origemDoCanalNaAba1(ABA_1, DERIVADOS, "area_membros");
    expect(o.metaReceita).not.toBe(0);
    expect(o.metaReceita).not.toBeNull();
    expect(o.metaReceita).toBe(DERIVADOS.canais.areaMembros.receita);
  });

  it("parametrosDoBloco passa os sete campos do bloco e a origem, sem recalcular nada (E4)", () => {
    const p = parametrosDoBloco(BLOCOS.whatsapp, { metaReceita: 100, base: 10, ticketMedio: 5 });
    expect(p).toEqual({
      metaReceita: 100,
      base: 10,
      ticketMedio: 5,
      conversaoMedia: 0.04,
      variacaoConversao: 0.2,
      variacaoReceita: 0.1,
      fracaoCenario1: null,
      taxaCaptacao: 0.12,
      faixaVariacao: 0.1,
    });
  });

  it("meta de receita null (margem-alvo sem base) → série toda zero, sem erro", () => {
    const g = gradeOrganica(parametrosDoBloco(BLOCOS.whatsapp, { metaReceita: null, base: 25000, ticketMedio: 1200 }));
    expect(g.receita).toEqual(new Array(CENARIOS).fill(0));
    expect(() => resumoDoCanal(g, 4, 3)).not.toThrow();
    expect(resumoDoCanal(g, 4, 3).receita).toBe(0);
  });
});

describe("forma persistida (AC1/AC2)", () => {
  it("organicosVazios: seis canais com os sete campos em null e cinco combinações 1…5 com seis seleções em null", () => {
    const v = organicosVazios();
    expect(Object.keys(v.blocos).sort()).toEqual([...CANAIS_ORGANICOS].sort());
    for (const c of CANAIS_ORGANICOS) {
      expect(Object.keys(v.blocos[c]).sort()).toEqual([...CAMPOS_DO_BLOCO_ORGANICO].sort());
      expect(Object.values(v.blocos[c]).every((x) => x === null)).toBe(true);
    }
    expect(v.combinacoes.map((c) => c.indice)).toEqual([...INDICES_DAS_COMBINACOES]);
    expect(v.combinacoes).toHaveLength(COMBINACOES);
    for (const c of v.combinacoes) expect(Object.values(c.selecoes).every((x) => x === null)).toBe(true);
  });
});

describe("seleção de cenário (RN-016, RN-038, AC5)", () => {
  const serie = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("devolve receita[sel] para 1…10; vazio → 0 (reproduz a planilha)", () => {
    expect(selecionarReceita(serie, 1)).toBe(10);
    expect(selecionarReceita(serie, 10)).toBe(100);
    expect(selecionarReceita(serie, null)).toBe(0);
  });

  it("fora de 1…10 ou não inteiro é exceção explícita — na planilha era #N/A em cascata", () => {
    expect(() => selecionarReceita(serie, 11)).toThrow(RangeError);
    expect(() => selecionarReceita(serie, 0)).toThrow(RangeError);
    expect(() => selecionarReceita(serie, 1.5)).toThrow(RangeError);
  });
});

describe("cadeia de margem da Combinação 1 (RN-017…RN-020, AC14)", () => {
  const c1 = combinacao(1);

  it("Y11…Y16: receita do cenário escolhido em cada canal", () => {
    const esperado = [107503.85, 73298.08, 33317.31, 10096.15, 20935.38, 16259.96];
    CANAIS_ORGANICOS.forEach((c, i) => perto(c1.receitas[c], esperado[i]));
  });

  it("Y10 = 261 410,73; Y18 = 10 456,43; Y20 = 250 954,30", () => {
    perto(c1.cadeia.receitaBruta, 261410.73);
    perto(c1.cadeia.reembolso, 10456.43);
    perto(c1.cadeia.receitaTributavel, 250954.3);
  });

  it("Y22…Y26: cinco deduções sobre a receita tributável, com os percentuais da 48.1 (não cópias)", () => {
    perto(c1.cadeia.deducoes.marketplace, 22585.89);
    perto(c1.cadeia.deducoes.imposto, 30114.52);
    perto(c1.cadeia.deducoes.custoProduto, 15057.26);
    perto(c1.cadeia.deducoes.comissoes, 7528.63);
    perto(c1.cadeia.deducoes.outros, 2509.54);
  });

  it("Y28 = 173 158,46 e Y29 = 0,6624 (a spec tem 4 casas aqui)", () => {
    perto(c1.cadeia.mc, 173158.46);
    expect(c1.cadeia.mcPct).toBeCloseTo(0.6624, 4);
  });

  it("Y2 = 0,923512 e Y5 = −14 341,54 contra a meta de 187 500 (F15 da 48.1)", () => {
    expect(c1.meta.meta).toBe(187500);
    perto(c1.meta.atingimento, 0.923512, 6);
    perto(c1.meta.gap, -14341.54);
  });

  it("outras combinações do apêndice A: AA28 = 212 357,11, AA2 = 1,132571, AC2, AE2, AG2 e AG5 = −42 042,69", () => {
    const c2 = combinacao(2);
    perto(c2.cadeia.mc, 212357.11);
    perto(c2.meta.atingimento, 1.132571, 6);
    perto(c2.meta.gap, 24857.11);
    perto(combinacao(3).meta.atingimento, 1.004446, 6);
    perto(combinacao(4).meta.atingimento, 0.859556, 6);
    const c5 = combinacao(5);
    perto(c5.meta.atingimento, 0.775772, 6);
    perto(c5.meta.gap, -42042.69);
  });

  it("as cinco combinações são independentes: mudar a seleção da 2 não move a 1", () => {
    const antes = combinacao(1).cadeia.mc;
    const s2 = selecoes(2);
    s2.whatsapp = 10;
    combinacaoOrganica({ indice: 2, grades: grades(), selecoes: s2, niveis: niveis(), percentuais: ABA_1, metaMargemOrganicos: 187500 });
    expect(combinacao(1).cadeia.mc).toBe(antes);
  });

  it("seleção vazia num canal → receita 0 nesse canal e a bruta cai exatamente essa parcela", () => {
    const s = selecoes(1);
    s.whatsapp = null;
    const c = combinacaoOrganica({ indice: 1, grades: grades(), selecoes: s, niveis: niveis(), percentuais: ABA_1, metaMargemOrganicos: 187500 });
    expect(c.receitas.whatsapp).toBe(0);
    perto(c.cadeia.receitaBruta, 261410.73 - 107503.85);
  });

  it("todas as seleções vazias → receita bruta 0, MC 0, MC % null (Y29 era #DIV/0!), atingimento 0 e gap = −meta", () => {
    const vazias = {} as SelecoesPorCanal;
    for (const c of CANAIS_ORGANICOS) vazias[c] = null;
    const c = combinacaoOrganica({ indice: 1, grades: grades(), selecoes: vazias, niveis: niveis(), percentuais: ABA_1, metaMargemOrganicos: 187500 });
    expect(c.cadeia.receitaBruta).toBe(0);
    expect(c.cadeia.mc).toBe(0);
    expect(c.cadeia.mcPct).toBeNull();
    expect(c.meta.atingimento).toBe(0);
    expect(c.meta.gap).toBe(-187500);
  });

  it("meta de margem zero → atingimento null (Y2 era #DIV/0!), gap = MC", () => {
    const a = atingimentoDaMeta(1000, 0);
    expect(a.atingimento).toBeNull();
    expect(a.gap).toBe(1000);
    expect(atingimentoDaMeta(1000, null).atingimento).toBeNull();
  });

  it("cadeiaDeDeducoes: percentuais vazios valem zero (V0) — MC = receita bruta", () => {
    const c = cadeiaDeDeducoes([100, 200], { pctReembolso: null, pctMarketplace: null, pctImposto: null, pctCustoProduto: null, pctComissoes: null, pctOutrosCustos: null });
    expect(c.receitaBruta).toBe(300);
    expect(c.mc).toBe(300);
    expect(c.mcPct).toBe(1);
  });
});

describe("vendas, leads e conversão por canal — Combinação 1 (RN-013, RN-021…023, D10, AC15)", () => {
  const c1 = combinacao(1);

  it("cadeia BRUTA reproduz §2.4 no WhatsApp: 89,586538 / 2 488,514957 / 0,036", () => {
    const w = c1.canais.whatsapp;
    perto(w.vendasBruto, 89.586538, 6);
    perto(w.leadsBruto, 2488.514957, 6);
    perto(w.conversaoBruto, 0.036, 6);
  });

  it("cadeia BRUTA dos outros cinco canais reproduz §2.4", () => {
    const esperado: Record<CanalOrganico, [number, number, number]> = {
      whatsapp: [89.586538, 2488.514957, 0.036],
      email: [61.081731, 1650.857588, 0.037],
      instagram: [27.764423, 2221.153846, 0.0125],
      manychat: [8.413462, 210.336538, 0.04],
      youtube: [17.446154, 969.230769, 0.018],
      area_membros: [13.549964, 423.436373, 0.032],
    };
    for (const c of CANAIS_ORGANICOS) {
      perto(c1.canais[c].vendasBruto, esperado[c][0], 6);
      perto(c1.canais[c].leadsBruto, esperado[c][1], 6);
      perto(c1.canais[c].conversaoBruto, esperado[c][2], 6);
    }
  });

  it("totais BRUTOS reproduzem §2.4: 217,842272 vendas e 7 963,530073 leads", () => {
    perto(c1.totais.vendasBruto, 217.842272, 6);
    perto(c1.totais.leadsBruto, 7963.530073, 6);
  });

  it("cadeia do PRODUTO (D10): vendas = 90, leads = ⌈90 ÷ 0,036⌉ = 2 500, conversão = 90 ÷ 2 500 = 0,036 — exatos", () => {
    const w = c1.canais.whatsapp;
    expect(w.vendas).toBe(90);
    expect(w.leads).toBe(2500);
    expect(w.conversao).toBe(90 / 2500);
    // o inteiro vem da grade, não de um arredondamento próprio deste módulo
    expect(w.vendas).toBe(grades().whatsapp.vendas[3]);
    expect(w.leads).toBe(grades().whatsapp.leads[2][3]);
  });

  it("TEST-001 (gate): a conversão do produto é a dos INTEIROS, não a bruta — Email 62 ÷ 1 676 = 0,036993 (bruto 0,037), Área 14 ÷ 438 = 0,031963 (bruto 0,032)", () => {
    // No WhatsApp as duas cadeias coincidem (0,036); aqui elas divergem, e é
    // isso que impede a mutação `conversao = div(vendasBruto, leadsBruto)`
    // (mistura de cadeias, proibida por D10) de passar.
    const email = c1.canais.email;
    expect(email.vendas).toBe(62);
    expect(email.leads).toBe(1676);
    expect(email.conversao).toBe(62 / 1676);
    perto(email.conversaoBruto, 0.037, 6);
    expect(email.conversao).not.toBe(email.conversaoBruto);
    const area = c1.canais.area_membros;
    expect(area.vendas).toBe(14);
    expect(area.leads).toBe(438);
    expect(area.conversao).toBe(14 / 438);
    perto(area.conversaoBruto, 0.032, 6);
    expect(area.conversao).not.toBe(area.conversaoBruto);
  });

  it("totais do PRODUTO são a soma dos inteiros: 221 vendas e 8 079 leads", () => {
    expect(c1.totais.vendas).toBe(221);
    expect(c1.totais.leads).toBe(8079);
  });

  it("WhatsApp na Combinação 2 (Z11 = 6): bruto 108,399712 / 3 011,103098 / 0,036", () => {
    const w = combinacao(2).canais.whatsapp;
    perto(w.vendasBruto, 108.399712, 6);
    perto(w.leadsBruto, 3011.103098, 6);
    perto(w.conversaoBruto, 0.036, 6);
  });

  it("canal com seleção vazia contribui 0 em vendas e leads e não derruba os totais", () => {
    const s = selecoes(1);
    s.manychat = null;
    const c = combinacaoOrganica({ indice: 1, grades: grades(), selecoes: s, niveis: niveis(), percentuais: ABA_1, metaMargemOrganicos: 187500 });
    expect(c.canais.manychat).toEqual({ receita: 0, vendas: 0, leads: 0, conversao: null, vendasBruto: 0, leadsBruto: 0, conversaoBruto: null });
    expect(c.totais.vendas).toBe(221 - 9);
    expect(c.totais.leads).toBe(8079 - 225);
  });

  it("NÃO reproduz DV-008: bloco sem nível assumido → leads e conversão do canal null, e o total de leads null (não 0, não erro)", () => {
    const blocos = { ...BLOCOS, whatsapp: { ...BLOCOS.whatsapp, nivelAssumido: null } };
    const c = combinacao(1, blocos);
    expect(c.canais.whatsapp.vendas).toBe(90); // vendas não dependem do nível
    expect(c.canais.whatsapp.leads).toBeNull();
    expect(c.canais.whatsapp.conversao).toBeNull(); // a planilha dava 0 por IFERROR
    expect(c.totais.leads).toBeNull(); // a planilha dava #N/A
    expect(c.totais.vendas).toBe(221); // vendas seguem somando
    expect(c.canais.whatsapp.leadsBruto).toBeNull();
  });

  it("sem ticket (vendas sem base) → vendas, leads, conversão e totais null", () => {
    const g = gradeOrganica(parametrosDoBloco(BLOCOS.whatsapp, { metaReceita: 115384.62, base: 25000, ticketMedio: null }));
    const r = resumoDoCanal(g, 4, 3);
    expect(r.vendas).toBeNull();
    expect(r.leads).toBeNull();
    expect(r.conversao).toBeNull();
    expect(totaisDaCombinacao([r, resumoDoCanal(grades().email, 3, 2)]).vendas).toBeNull();
  });

  it("nível fora de 1…8 é exceção (o banco tem CHECK; a API, zod)", () => {
    expect(() => resumoDoCanal(grades().whatsapp, 4, 9)).toThrow(RangeError);
    expect(() => resumoDoCanal(grades().whatsapp, 4, 0)).toThrow(RangeError);
  });

  it("totaisDaCombinacao: soma; um null contamina só o total que o contém", () => {
    const t = totaisDaCombinacao([
      { receita: 0, vendas: 1, leads: null, conversao: null, vendasBruto: 1, leadsBruto: null, conversaoBruto: null },
      { receita: 0, vendas: 2, leads: 5, conversao: 0.4, vendasBruto: 2, leadsBruto: 5, conversaoBruto: 0.4 },
    ]);
    expect(t).toEqual({ vendas: 3, leads: null, vendasBruto: 3, leadsBruto: null });
  });
});
