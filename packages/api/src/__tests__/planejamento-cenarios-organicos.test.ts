import { describe, it, expect } from "vitest";
import {
  CANAIS_ORGANICOS,
  NIVEIS_ORGANICOS,
  CENARIOS,
  serieDeReceita,
  escadaDeConversao,
  leadsEsperados,
  limitesDaFaixa,
  faixaDe,
  gradeOrganica,
  type ParametrosOrganicos,
} from "@loyola-x/shared";

/**
 * Story 48.2 — aba `[2] Leads Orgânicos`, parte pura.
 *
 * Entradas: apêndice A da spec (`docs/specs/epic-48/especificacao_tecnica_painel_planejamento.md`),
 * dados MASCARADOS. Saídas esperadas: §2.4 "Casos de teste". A cadeia BRUTA
 * reproduz a spec com tolerância relativa 1e-6; a cadeia ARREDONDADA (D10) é
 * afirmada com igualdade exata a partir dos inteiros derivados.
 *
 * Os testes `não reproduz DV-xxx` são diferenciais: cada um FALHA com a
 * fórmula da planilha (provado no Dev Agent Record da story, revertendo o
 * módulo e rodando esta suíte).
 */

/** |a − b| ≤ 1e-6 × max(1, |b|) — "tolerância relativa 1e-6" da spec (AC18). */
function perto(a: number | null, b: number) {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(b)));
}

const TICKET = 1200;

/** Apêndice A — aba 2, por bloco. Meta de receita e base vêm da aba 1 (G42:G47, G49:G54). */
const BLOCOS: Record<(typeof CANAIS_ORGANICOS)[number], ParametrosOrganicos> = {
  whatsapp: { metaReceita: 115384.62, base: 25000, ticketMedio: TICKET, conversaoMedia: 0.04, variacaoConversao: 0.2, variacaoReceita: 0.1, taxaCaptacao: 0.12, faixaVariacao: 0.1 },
  email: { metaReceita: 86538.46, base: 50000, ticketMedio: TICKET, conversaoMedia: 0.04, variacaoConversao: 0.3, variacaoReceita: 0.1, taxaCaptacao: 0.05, faixaVariacao: 0.1 },
  instagram: { metaReceita: 43269.23, base: 30000, ticketMedio: TICKET, conversaoMedia: 0.02, variacaoConversao: 0.25, variacaoReceita: 0.1, taxaCaptacao: 0.03, faixaVariacao: 0.1 },
  telegram: { metaReceita: 14423.08, base: 8000, ticketMedio: TICKET, conversaoMedia: 0.04, variacaoConversao: 0.5, variacaoReceita: 0.1, taxaCaptacao: 0.15, faixaVariacao: 0.2 },
  youtube: { metaReceita: 14423.08, base: 120000, ticketMedio: TICKET, conversaoMedia: 0.03, variacaoConversao: 0.3, variacaoReceita: 0.2, taxaCaptacao: 0.02, faixaVariacao: 0.1 },
  area_membros: { metaReceita: 14423.08, base: 6000, ticketMedio: TICKET, conversaoMedia: 0.04, variacaoConversao: 0.4, variacaoReceita: 0.1, taxaCaptacao: 0.06, faixaVariacao: 0.1 },
};

describe("série de receita (RN-011, AC3)", () => {
  it("bloco WhatsApp: c1 = 70 % da meta e cada cenário é o anterior × (1 + variação)", () => {
    const s = serieDeReceita(115384.62, 0.7, 0.1);
    expect(s).toHaveLength(CENARIOS);
    perto(s[0], 80769.23);
    perto(s[1], 88846.15);
    perto(s[2], 97730.77);
    perto(s[9], 190449.62);
  });

  it("fração do cenário 1 é parâmetro do bloco (D1): 0,50 dá c1 = metade da meta", () => {
    perto(serieDeReceita(100000, 0.5, 0)[0], 50000);
  });

  it("fração vazia cai para 0,70 — a mesma regra das grades (MNT-001); zero explícito é zero", () => {
    perto(serieDeReceita(1000, null, 0)[0], 700);
    perto(serieDeReceita(1000, undefined, 0)[0], 700);
    expect(serieDeReceita(1000, 0, 0)[0]).toBe(0);
    perto(gradeOrganica({ ...BLOCOS.whatsapp, metaReceita: 1000, fracaoCenario1: null }).receita[0], 700);
  });

  it("meta vazia → dez zeros; variação vazia → dez iguais", () => {
    expect(serieDeReceita(null, 0.7, 0.1)).toEqual(new Array(CENARIOS).fill(0));
    const iguais = serieDeReceita(1000, 0.7, null);
    expect(new Set(iguais).size).toBe(1);
    perto(iguais[0], 700);
  });
});

describe("escada de conversão (RN-012, AC5/AC7)", () => {
  it("WhatsApp (0,04; 0,20): passo de 0,2 ponto percentual, oito níveis", () => {
    const e = escadaDeConversao(0.04, 0.2, NIVEIS_ORGANICOS);
    expect(e).toHaveLength(8);
    expect(e[0]).toBeCloseTo(0.04, 10);
    expect(e[1]).toBeCloseTo(0.038, 10);
    expect(e[2]).toBeCloseTo(0.036, 10);
    expect(e[7]).toBeCloseTo(0.026, 10);
  });

  it("Email (0,04; 0,30) → 0,037; Instagram (0,02; 0,25) → 0,0175", () => {
    expect(escadaDeConversao(0.04, 0.3, NIVEIS_ORGANICOS)[1]).toBeCloseTo(0.037, 10);
    expect(escadaDeConversao(0.02, 0.25, NIVEIS_ORGANICOS)[1]).toBeCloseTo(0.0175, 10);
  });

  it("conversão negativa → escada toda em zero", () => {
    const e = escadaDeConversao(-0.01, 0.2, NIVEIS_ORGANICOS);
    expect(e[0]).toBe(0);
    expect(e[1]).toBe(0);
  });

  it("reproduz DV-004: o campo '25 %' reduz 0,25 p.p. por nível, não 25 % relativo", () => {
    const e = escadaDeConversao(0.1, 0.25, 3);
    expect(e[1]).toBeCloseTo(0.0975, 10); // 0,10 − 0,0025 — e não 0,075
  });
});

describe("vendas e leads — duas cadeias (RN-013, RN-014, AC8–AC11)", () => {
  const g = gradeOrganica(BLOCOS.whatsapp);

  it("cadeia bruta reproduz §2.4: vendas 67,307692 e 98,545192; leads 1 682,692308 e 2 737,366453", () => {
    perto(g.vendasBruto[0], 67.307692);
    perto(g.vendasBruto[4], 98.545192);
    perto(g.leadsBruto[0][0], 1682.692308);
    perto(g.leadsBruto[2][4], 2737.366453); // nível 3 = 0,036, cenário 5
  });

  it("cadeia do produto (D10): vendas[1] = 68 e leads[1][1] = ⌈68 ÷ 0,04⌉ = 1 700, exatos", () => {
    expect(g.vendas[0]).toBe(68);
    expect(g.leads[0][0]).toBe(1700);
    expect(g.vendas[4]).toBe(99);
    expect(g.leads[2][4]).toBe(2750);
  });

  it("⌈x⌉ imune ao ruído de ponto flutuante (TEST-001): 11 ÷ 0,011 = 1000,0000000000001 → 1 000 leads, não 1 001", () => {
    // meta 18 000 × 0,70 = 12 600 → 12 600 ÷ 1 200 = 10,5 → vendas = 11; nível 0,011 sem variação.
    const g = gradeOrganica({ ...BLOCOS.whatsapp, metaReceita: 18000, conversaoMedia: 0.011, variacaoConversao: 0 });
    expect(g.vendas[0]).toBe(11);
    expect(11 / 0.011).toBeGreaterThan(1000); // o ruído existe neste motor — a mutação `Math.ceil(x)` devolve 1001
    expect(g.leads[0][0]).toBe(1000);
  });

  it("o bruto nunca parte do arredondado (PO-01): leads_bruto ≠ ⌈vendas⌉ ÷ conversão", () => {
    expect(g.leadsBruto[0][0]).not.toBeCloseTo(68 / 0.04, 6);
  });

  it("grade tem 8 níveis × 10 cenários nas duas cadeias", () => {
    expect(g.leadsBruto).toHaveLength(8);
    expect(g.leads).toHaveLength(8);
    for (const linha of g.leads) expect(linha).toHaveLength(10);
  });

  it("ticket zero ou vazio → vendas e leads null, nunca 0 nem Infinity (D3)", () => {
    for (const ticket of [0, null, undefined]) {
      const z = gradeOrganica({ ...BLOCOS.whatsapp, ticketMedio: ticket });
      expect(z.vendasBruto.every((v) => v === null)).toBe(true);
      expect(z.vendas.every((v) => v === null)).toBe(true);
      expect(z.leads.flat().every((v) => v === null)).toBe(true);
    }
  });
});

describe("leads esperados e faixas (RN-010, RN-015, AC12–AC14)", () => {
  it("leadsEsperados = taxa × base: 3 000, 360, 2 500", () => {
    expect(leadsEsperados(0.12, 25000)).toBe(3000);
    expect(leadsEsperados(0.06, 6000)).toBe(360);
    expect(leadsEsperados(0.05, 50000)).toBe(2500);
    expect(leadsEsperados(null, 25000)).toBe(0);
  });

  it("limites do WhatsApp: 2 250 / 3 750 / 4 500", () => {
    expect(limitesDaFaixa(3000, 0.1)).toEqual({ lo: 2250, mid: 3750, hi: 4500 });
  });

  it("faixas: 1 abaixo de lo (estrito), 2 em [lo, mid], 3 em (mid, hi], 4 acima de hi (estrito)", () => {
    expect(faixaDe(2249.99, 3000, 0.1)).toBe(1);
    expect(faixaDe(2250, 3000, 0.1)).toBe(2);
    expect(faixaDe(3750, 3000, 0.1)).toBe(2); // no limite mid vale a faixa 2
    expect(faixaDe(3750.01, 3000, 0.1)).toBe(3);
    expect(faixaDe(4500, 3000, 0.1)).toBe(3);
    expect(faixaDe(4500.01, 3000, 0.1)).toBe(4);
  });

  it("valor ou referência null → null", () => {
    expect(faixaDe(null, 3000, 0.1)).toBeNull();
    expect(faixaDe(100, null, 0.1)).toBeNull();
  });

  it("a grade classifica a cadeia do produto: leads[1][1] = 1 700 fica abaixo de 2 250 → faixa 1", () => {
    const g = gradeOrganica(BLOCOS.whatsapp);
    expect(g.leadsEsperados).toBe(3000);
    expect(g.faixas[0][0]).toBe(1);
    expect(g.faixas[2][4]).toBe(2); // 2 750 ∈ [2 250, 3 750]
  });
});

describe("não reproduz a planilha (decisões do Danilo, 2026-09-21) — testes diferenciais", () => {
  it("não reproduz DV-006: cenário 3 da Área de Membros divide pelo ticket, não por célula vazia", () => {
    const g = gradeOrganica(BLOCOS.area_membros);
    // Planilha: L117 = IFERROR(L115 / '[1]…'!$F$9, 0) → sempre 0 vendas e 0 leads.
    perto(g.receita[2], 12216.35); // L115 da spec §2.4 "Bloco 6, coluna L"
    perto(g.vendasBruto[2], 12216.35 / TICKET); // ≈ 10,18, e não 0
    expect(g.vendas[2]).toBe(11);
    expect(g.leads[0][2]).toBe(275); // e não 0
  });

  it("não reproduz DV-007 (orgânicos): conversão zero devolve null, não 0 silencioso", () => {
    const g = gradeOrganica({ ...BLOCOS.whatsapp, conversaoMedia: 0 });
    // Planilha: J9 = IFERROR(J10 / $I9, 0) → 0.
    expect(g.escada[0]).toBe(0);
    expect(g.leadsBruto[0][0]).toBeNull();
    expect(g.leads[0][0]).toBeNull();
  });
});

describe("invariantes (AC19): nenhuma entrada válida produz NaN, Infinity ou exceção", () => {
  const casos: Array<Partial<ParametrosOrganicos>> = [
    {},
    { metaReceita: 0 },
    { conversaoMedia: 0 },
    { variacaoConversao: 0 },
    { variacaoReceita: 0 },
    { faixaVariacao: 0 },
    { base: 0, taxaCaptacao: 0 },
    { metaReceita: null, base: null, conversaoMedia: null, variacaoConversao: null, variacaoReceita: null, taxaCaptacao: null, faixaVariacao: null },
    { fracaoCenario1: 0 },
    { fracaoCenario1: 1 },
  ];

  function semLixo(v: unknown) {
    if (v === null) return;
    if (typeof v === "number") {
      expect(Number.isFinite(v)).toBe(true);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) semLixo(x);
      return;
    }
    if (typeof v === "object") for (const x of Object.values(v as object)) semLixo(x);
  }

  it.each(casos.map((c, i) => [i, c]))("caso %#", (_i, c) => {
    const g = gradeOrganica({ ...BLOCOS.whatsapp, ...c });
    semLixo(g);
  });
});
