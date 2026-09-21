import { describe, it, expect } from "vitest";
import {
  FONTES_PAGAS,
  NIVEIS_PAGOS,
  serieDeReceita,
  escadaDeConversao,
  dividirVerba,
  limitesDaFaixa,
  faixaDe,
  gradePaga,
  type ParametrosPagos,
} from "@loyola-x/shared";

/**
 * Story 48.2 — aba `[3] Leads Pagos`, parte pura.
 *
 * Entradas: apêndice A da spec, dados MASCARADOS. Saídas: §3.4 "Casos de
 * teste". Metas de receita e verbas vêm da aba 1 (G33/G34/G36/G37 e
 * G25/G26/G28/G29). ⚠️ A meta do Google frio aqui é a DA PLANILHA
 * (14 423,08, afetada por DV-001): este arquivo confere a FÓRMULA do motor;
 * com D5, a 48.1 passará 31 250,00 — a integração é da 48.4.
 */

function perto(a: number | null, b: number) {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(b)));
}

const TICKET = 1200;

const BLOCOS: Record<(typeof FONTES_PAGAS)[number], ParametrosPagos> = {
  meta_quente: { metaReceita: 66666.67, verba: 32000, pctCaptacao: 0.85, ticketMedio: TICKET, conversaoMedia: 0.012, variacaoConversao: 0.05, variacaoReceita: 0.1, cplMedioHistorico: 4.5, faixaVariacao: 0.05 },
  meta_frio: { metaReceita: 16666.67, verba: 8000, pctCaptacao: 0.85, ticketMedio: TICKET, conversaoMedia: 0.006, variacaoConversao: 0.1, variacaoReceita: 0.1, cplMedioHistorico: 2.5, faixaVariacao: 0.05 },
  google_quente: { metaReceita: 93750, verba: 45000, pctCaptacao: 0.85, ticketMedio: TICKET, conversaoMedia: 0.01, variacaoConversao: 0.05, variacaoReceita: 0.15, cplMedioHistorico: 3.0, faixaVariacao: 0.1 },
  google_frio: { metaReceita: 14423.08, verba: 15000, pctCaptacao: 0.85, ticketMedio: TICKET, conversaoMedia: 0.007, variacaoConversao: 0.1, variacaoReceita: 0.2, cplMedioHistorico: 2.2, faixaVariacao: 0.1 },
};

describe("verba, série e escada do bloco Meta quente (§3.4)", () => {
  it("dividirVerba (32 000; 0,85) → captação 27 200 e remarketing 4 800 (AC15)", () => {
    expect(dividirVerba(32000, 0.85)).toEqual({ captacao: 27200, remarketing: 4800 });
  });

  it("série: c1 = 46 666,67; c2 = 51 333,33; c10 = 110 037,56", () => {
    const s = serieDeReceita(66666.67, 0.7, 0.1);
    perto(s[0], 46666.67);
    perto(s[1], 51333.33);
    perto(s[9], 110037.56);
  });

  it("escada (0,012; 0,05), dez níveis: 0,012 · 0,0115 · 0,011 · … · 0,0075", () => {
    const e = escadaDeConversao(0.012, 0.05, NIVEIS_PAGOS);
    expect(e).toHaveLength(10);
    expect(e[0]).toBeCloseTo(0.012, 10);
    expect(e[1]).toBeCloseTo(0.0115, 10);
    expect(e[2]).toBeCloseTo(0.011, 10);
    expect(e[9]).toBeCloseTo(0.0075, 10);
  });
});

describe("CPL máximo e leads — duas cadeias (RN-025, AC16)", () => {
  const g = gradePaga(BLOCOS.meta_quente);

  it("cadeia bruta reproduz §3.4: leads 3 240,740741 / 3 564,814815 / 5 176,111111 e CPL 8,393143 / 7,630130 / 5,254910", () => {
    expect(g.captacao).toBe(27200);
    perto(g.leadsBruto[0][0], 3240.740741);
    perto(g.cplBruto[0][0], 8.393143);
    perto(g.leadsBruto[0][1], 3564.814815);
    perto(g.cplBruto[0][1], 7.63013);
    perto(g.leadsBruto[2][4], 5176.111111); // nível 3 = 0,011, cenário 5
    perto(g.cplBruto[2][4], 5.25491);
  });

  it("cadeia do produto (D10): vendas[1] = 39, leads[1][1] = 3 250, cpl[1][1] = 8,369231", () => {
    expect(g.vendas[0]).toBe(39);
    expect(g.leads[0][0]).toBe(3250);
    perto(g.cpl[0][0], 27200 / 3250);
  });

  it("grade tem 10 níveis × 10 cenários em leads e CPL, nas duas cadeias", () => {
    for (const grade of [g.leadsBruto, g.leads, g.cplBruto, g.cpl]) {
      expect(grade).toHaveLength(10);
      for (const linha of grade) expect(linha).toHaveLength(10);
    }
  });

  it("remarketing é só informativo (D14): mudar a verba de remarketing não muda CPL nem leads", () => {
    // Mesma captação, remarketing diferente: verba maior com pct menor.
    const outro = gradePaga({ ...BLOCOS.meta_quente, verba: 64000, pctCaptacao: 0.425 });
    expect(outro.captacao).toBeCloseTo(27200, 6);
    expect(outro.remarketing).toBeCloseTo(36800, 6);
    expect(outro.cpl).toEqual(g.cpl);
    expect(outro.leads).toEqual(g.leads);
  });
});

describe("faixas de CPL (RN-026, AC13)", () => {
  it("limites: Meta quente (4,50; 0,05) → 3,9375 / 5,0625 / 5,625; Google frio (2,20; 0,10) → 1,65 / 2,75 / 3,30", () => {
    const mq = limitesDaFaixa(4.5, 0.05)!;
    expect(mq.lo).toBeCloseTo(3.9375, 10);
    expect(mq.mid).toBeCloseTo(5.0625, 10);
    expect(mq.hi).toBeCloseTo(5.625, 10);
    const gf = limitesDaFaixa(2.2, 0.1)!;
    expect(gf.lo).toBeCloseTo(1.65, 10);
    expect(gf.mid).toBeCloseTo(2.75, 10);
    expect(gf.hi).toBeCloseTo(3.3, 10);
  });

  it("a grade classifica o CPL da cadeia do produto: 8,37 > 5,625 → faixa 4", () => {
    const g = gradePaga(BLOCOS.meta_quente);
    expect(g.faixas[0][0]).toBe(4);
    expect(faixaDe(5.0625, 4.5, 0.05)).toBe(2); // no limite mid vale a 2
  });
});

describe("não reproduz a planilha (decisões do Danilo, 2026-09-21) — testes diferenciais", () => {
  it("não reproduz DV-010 (escada): Meta frio e Google frio usam a PRÓPRIA variação de conversão", () => {
    // Planilha: I35 = I33 − $F$12% (variação do bloco Meta quente, 0,05) → 0,0055 / 0,005.
    const mf = escadaDeConversao(0.006, BLOCOS.meta_frio.variacaoConversao, NIVEIS_PAGOS);
    expect(mf[1]).toBeCloseTo(0.005, 10);
    expect(mf[2]).toBeCloseTo(0.004, 10);
    // Planilha: I84 = I82 − $F$61% (variação do bloco Google quente, 0,05) → 0,0065 / 0,006.
    const gf = escadaDeConversao(0.007, BLOCOS.google_frio.variacaoConversao, NIVEIS_PAGOS);
    expect(gf[1]).toBeCloseTo(0.006, 10);
    expect(gf[2]).toBeCloseTo(0.005, 10);
    // E a grade inteira do bloco usa essa escada:
    expect(gradePaga(BLOCOS.meta_frio).escada[1]).toBeCloseTo(0.005, 10);
  });

  it("não reproduz DV-010 (série): Google frio usa a PRÓPRIA variação de receita", () => {
    // Planilha: K81 = J81 × (1 + $F$62) (variação do bloco Google quente, 0,15) → 11 610,58 / 13 352,16.
    const g = gradePaga(BLOCOS.google_frio);
    perto(g.receita[0], 10096.15);
    perto(g.receita[1], 12115.38);
    perto(g.receita[2], 14538.46);
  });

  it("não reproduz DV-007 (pagos, escada): a escada trava em zero em vez de ficar negativa", () => {
    // Planilha: I11 = I9 − $F$12% sem IF → com conversão 0,001 e variação 0,5 o 3º nível seria −0,009.
    const e = escadaDeConversao(0.001, 0.5, NIVEIS_PAGOS);
    expect(e[0]).toBeCloseTo(0.001, 10);
    expect(e[1]).toBe(0);
    expect(e[9]).toBe(0);
    expect(e.every((x) => x >= 0)).toBe(true);
  });

  it("não reproduz DV-007 (pagos, erro): conversão zero devolve null, não #DIV/0! (bloco 1) nem 0 (bloco 2) — AC17", () => {
    for (const fonte of ["meta_quente", "meta_frio"] as const) {
      const g = gradePaga({ ...BLOCOS[fonte], conversaoMedia: 0 });
      expect(g.escada[0]).toBe(0);
      expect(g.leadsBruto[0].every((x) => x === null)).toBe(true);
      expect(g.leads[0].every((x) => x === null)).toBe(true);
      expect(g.cplBruto[0].every((x) => x === null)).toBe(true);
      expect(g.cpl[0].every((x) => x === null)).toBe(true);
    }
  });
});

describe("invariantes (AC19): nenhuma entrada válida produz NaN, Infinity ou exceção", () => {
  const casos: Array<Partial<ParametrosPagos>> = [
    {},
    { metaReceita: 0 },
    { verba: 0 },
    { pctCaptacao: 0 },
    { pctCaptacao: 1 },
    { conversaoMedia: 0 },
    { variacaoConversao: 0 },
    { variacaoReceita: 0 },
    { faixaVariacao: 0 },
    { cplMedioHistorico: 0 },
    { metaReceita: null, verba: null, pctCaptacao: null, conversaoMedia: null, variacaoConversao: null, variacaoReceita: null, cplMedioHistorico: null, faixaVariacao: null },
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
    semLixo(gradePaga({ ...BLOCOS.meta_quente, ...c }));
  });

  it("verba zero → CPL 0 (número), não null: os leads existem, a verba é que é zero", () => {
    const g = gradePaga({ ...BLOCOS.meta_quente, verba: 0 });
    expect(g.captacao).toBe(0);
    // leads existem (dependem da receita, não da verba); CPL = 0 ÷ leads = 0, é número, não lixo.
    expect(g.cpl[0][0]).toBe(0);
  });
});
