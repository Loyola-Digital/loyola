import { describe, expect, it } from "vitest";
import { organicosVazios, pagosVazios } from "@loyola-x/shared/src/planejamento-combinacoes";
import type { InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import { montarOrganicos, montarPagos } from "@/lib/utils/planejamento-montagem";

/**
 * Story 48.5 (AC12) — a montagem extraída dos componentes das abas 2 e 3.
 * Prova de preservação: com o apêndice A, as combinações que os componentes
 * mostravam (Y28 173 158,46 / Y2 0,923512 na aba 2; tráfego 100 000 e
 * mc_meta 15 544,23 na aba 3) saem iguais da função pura.
 */

const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
  metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgTelegram: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseTelegram: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
};

function organicosDoApendice() {
  const v = organicosVazios();
  const p: Record<string, number[]> = {
    whatsapp: [0.04, 0.2, 0.1, 0.12, 0.1, 3], email: [0.04, 0.3, 0.1, 0.05, 0.1, 2], instagram: [0.02, 0.25, 0.1, 0.03, 0.1, 4],
    telegram: [0.04, 0.5, 0.1, 0.15, 0.2, 1], youtube: [0.03, 0.3, 0.2, 0.02, 0.1, 5], area_membros: [0.04, 0.4, 0.1, 0.06, 0.1, 3],
  };
  for (const c of Object.keys(v.blocos) as (keyof typeof v.blocos)[]) {
    const [conversaoMedia, variacaoConversao, variacaoReceita, taxaCaptacao, faixaVariacao, nivelAssumido] = p[c];
    v.blocos[c] = { conversaoMedia, variacaoConversao, variacaoReceita, taxaCaptacao, faixaVariacao, fracaoCenario1: null, nivelAssumido };
  }
  const sel = [[4, 3, 2, 1, 5, 6], [6, 5, 3, 2, 8, 7], [5, 4, 2, 3, 6, 5], [3, 3, 1, 2, 4, 4], [2, 1, 2, 1, 3, 3]];
  v.combinacoes.forEach((c, k) => {
    (["whatsapp", "email", "instagram", "telegram", "youtube", "area_membros"] as const).forEach((canal, i) => (c.selecoes[canal] = sel[k][i]));
  });
  return v;
}

function pagosDoApendice() {
  const v = pagosVazios();
  const p: Record<string, number[]> = {
    meta_quente: [0.85, 0.012, 0.05, 0.1, 4.5, 0.05, 4], meta_frio: [0.85, 0.006, 0.1, 0.1, 2.5, 0.05, 3],
    google_quente: [0.85, 0.01, 0.05, 0.15, 3, 0.1, 5], google_frio: [0.85, 0.007, 0.1, 0.2, 2.2, 0.1, 2],
  };
  for (const f of Object.keys(v.blocos) as (keyof typeof v.blocos)[]) {
    const [pctCaptacao, conversaoMedia, variacaoConversao, variacaoReceita, cplMedioHistorico, faixaVariacao, nivelAssumido] = p[f];
    v.blocos[f] = { pctCaptacao, conversaoMedia, variacaoConversao, variacaoReceita, cplMedioHistorico, faixaVariacao, fracaoCenario1: null, nivelAssumido };
  }
  const sel = [[5, 4, 4, 2], [4, 4, 5, 3], [6, 5, 3, 2], [3, 3, 4, 4], [2, 6, 2, 1]];
  v.combinacoes.forEach((c, k) => {
    (["meta_quente", "meta_frio", "google_quente", "google_frio"] as const).forEach((f, i) => (c.selecoes[f] = sel[k][i]));
  });
  return v;
}

describe("montarOrganicos", () => {
  it("apêndice A → Combinação 1: Y28 = 173 158,46, Y2 = 0,923512, 221 vendas / 8 079 leads; cinco combinações na ordem", () => {
    const m = montarOrganicos(ABA_1, organicosDoApendice());
    expect(m.combinacoes.map((c) => c.indice)).toEqual([1, 2, 3, 4, 5]);
    const c1 = m.combinacoes[0];
    expect(Math.abs(c1.cadeia.mc - 173158.46)).toBeLessThan(0.01);
    expect(c1.meta.atingimento).toBeCloseTo(0.923512, 6);
    expect(c1.totais.vendas).toBe(221);
    expect(c1.totais.leads).toBe(8079);
    expect(m.origens.area_membros.metaReceita).toBe(m.derivados.canais.areaMembros.receita);
    expect(m.niveis.whatsapp).toBe(3);
  });

  it("TEST-001 (gate): campo inválido (NaN) entra como VAZIO — em `fracaoCenario1` isso é observável: vazio = 70 % (D1), NaN cru zeraria a série", () => {
    const v = organicosDoApendice();
    v.blocos.email.fracaoCenario1 = Number.NaN; // o único campo em que a sanitização muda o número (o motor zera NaN nos outros)
    v.blocos.email.taxaCaptacao = Number.NaN;
    expect(() => montarOrganicos(ABA_1, v)).not.toThrow();
    const m = montarOrganicos(ABA_1, v);
    expect(m.grades.email.receita[0]).toBeCloseTo(0.7 * m.origens.email.metaReceita!, 6);
    expect(m.grades.email.receita[0]).not.toBe(0);
    expect(m.grades.email.leadsEsperados).toBe(0);
    const vazio = montarOrganicos(ABA_1, organicosVazios());
    expect(vazio.combinacoes[0].cadeia.receitaBruta).toBe(0);
    expect(vazio.combinacoes).toHaveLength(5);
  });
});

describe("montarPagos", () => {
  it("apêndice A → Combinação 1: tráfego 100 000, mc_meta 15 544,23, Google frio com D5 (31 250); verbas da 48.1", () => {
    const m = montarPagos(ABA_1, pagosDoApendice());
    expect(m.combinacoes.map((c) => c.indice)).toEqual([1, 2, 3, 4, 5]);
    const c1 = m.combinacoes[0];
    expect(c1.trafego.total).toBe(100000);
    expect(Math.abs(c1.mc.meta.mc - 15544.23)).toBeLessThan(0.01);
    expect(m.origens.google_frio.metaReceita).toBeCloseTo(31250, 2);
    expect(m.verbas.google_quente).toBe(45000);
    expect(m.niveis.meta_quente).toBe(4);
    expect(c1.totais.vendas).toBe(176);
  });

  it("TEST-001 (gate): `fracaoCenario1` = NaN entra como vazio → cenário 1 = 70 % da meta, não zero", () => {
    const v = pagosDoApendice();
    v.blocos.google_frio.fracaoCenario1 = Number.NaN;
    const m = montarPagos(ABA_1, v);
    expect(m.grades.google_frio.receita[0]).toBeCloseTo(0.7 * 31250, 2);
    expect(m.grades.google_frio.receita[0]).not.toBe(0);
  });

  it("payload vazio não quebra: receita 0, MC = −tráfego", () => {
    const vazio = montarPagos(ABA_1, pagosVazios());
    expect(vazio.combinacoes[0].cadeia.receitaBruta).toBe(0);
    expect(vazio.combinacoes[0].mc.pagos).toBe(-100000);
  });
});
