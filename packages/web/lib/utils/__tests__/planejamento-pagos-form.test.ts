import { describe, expect, it } from "vitest";
import { FONTES_PAGAS } from "@loyola-x/shared/src/planejamento-cenarios";
import { pagosVazios, type PagosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";
import { derivarInputsFinanceiros, type InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import {
  CAMPOS_DE_TEXTO_DO_BLOCO_PAGO,
  ROTULO_DA_FONTE,
  TIPO_DO_CAMPO_PAGO,
  blocoPagoComoEntradas,
  classeDaCelulaDeCpl,
  diagnosticoDaAba1Pagos,
  estadoDaTela,
  pagosAlterados,
  paraFormularioPagos,
  paraPayloadPagos,
  temErrosPagos,
  validarPagos,
} from "@/lib/utils/planejamento-pagos-form";

/**
 * Story 48.4 — formulário ↔ payload da aba "Leads Pagos" (AC17), cores do
 * CPL (AC11, DV-012 = B), rótulos (DV-025) e o diagnóstico da aba 1 (AC14).
 */

function salvo(): PagosDoSimulador {
  const v = pagosVazios();
  v.blocos.meta_quente = { pctCaptacao: 0.85, conversaoMedia: 0.012, variacaoConversao: 0.05, variacaoReceita: 0.1, cplMedioHistorico: 4.5, faixaVariacao: 0.05, fracaoCenario1: null, nivelAssumido: 4 };
  v.blocos.google_frio = { pctCaptacao: 0.07, conversaoMedia: 0.007, variacaoConversao: 0.1, variacaoReceita: 0.2, cplMedioHistorico: 2.2, faixaVariacao: 0.1, fracaoCenario1: 0.5, nivelAssumido: null };
  v.combinacoes[0].selecoes.meta_quente = 5;
  v.combinacoes[4].selecoes.google_frio = 10;
  return v;
}

const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
  metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgTelegram: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseTelegram: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
};

describe("paraFormularioPagos / paraPayloadPagos (AC17)", () => {
  it("percentual → pontos com vírgula; CPL médio em REAIS (não ×100); null → vazio; 0,07 não vira 7.000000000000001", () => {
    const f = paraFormularioPagos(salvo());
    expect(f.blocos.meta_quente.campos.pctCaptacao).toBe("85");
    expect(f.blocos.meta_quente.campos.conversaoMedia).toBe("1,2");
    expect(f.blocos.meta_quente.campos.cplMedioHistorico).toBe("4,5");
    expect(f.blocos.meta_quente.campos.fracaoCenario1).toBe("");
    expect(f.blocos.google_frio.campos.pctCaptacao).toBe("7");
    expect(f.blocos.google_frio.campos.cplMedioHistorico).toBe("2,2");
    expect(f.blocos.google_frio.campos.fracaoCenario1).toBe("50");
    expect(f.blocos.meta_quente.nivelAssumido).toBe(4);
    expect(f.blocos.google_frio.nivelAssumido).toBeNull();
    expect(f.combinacoes[0].meta_quente).toBe(5);
    expect(f.combinacoes[4].google_frio).toBe(10);
    expect(f.combinacoes[2].meta_frio).toBeNull();
  });

  it("ida-e-volta preserva o salvo (o CORPO que vai para a API)", () => {
    const s = salvo();
    expect(paraPayloadPagos(paraFormularioPagos(s))).toEqual(s);
  });

  it("pontos → fração, reais → reais: '85' → 0,85; '4,50' → 4,5 (CPL não divide por 100); texto → NaN; vazio → null", () => {
    const f = paraFormularioPagos(pagosVazios());
    f.blocos.meta_frio.campos.pctCaptacao = "85";
    f.blocos.meta_frio.campos.cplMedioHistorico = "4,50";
    f.blocos.meta_frio.campos.variacaoReceita = "abc";
    const p = paraPayloadPagos(f);
    expect(p.blocos.meta_frio.pctCaptacao).toBe(0.85);
    expect(p.blocos.meta_frio.cplMedioHistorico).toBe(4.5);
    expect(p.blocos.meta_frio.variacaoReceita).toBeNaN();
    expect(p.blocos.meta_frio.faixaVariacao).toBeNull();
    expect(p.combinacoes.map((c) => c.indice)).toEqual([1, 2, 3, 4, 5]);
  });

  it("o payload tem SEMPRE as quatro fontes (oito campos) e as cinco combinações (PO-02)", () => {
    const p = paraPayloadPagos(paraFormularioPagos(pagosVazios()));
    expect(Object.keys(p.blocos).sort()).toEqual([...FONTES_PAGAS].sort());
    for (const f of FONTES_PAGAS) expect(Object.keys(p.blocos[f])).toHaveLength(8);
    expect(p.combinacoes).toHaveLength(5);
  });

  it("TIPO_DO_CAMPO_PAGO: só o CPL médio é moeda; os seis restantes são percentuais", () => {
    expect(CAMPOS_DE_TEXTO_DO_BLOCO_PAGO).toHaveLength(7);
    expect(TIPO_DO_CAMPO_PAGO.cplMedioHistorico).toBe("moeda");
    expect(CAMPOS_DE_TEXTO_DO_BLOCO_PAGO.filter((k) => TIPO_DO_CAMPO_PAGO[k] === "pct")).toHaveLength(6);
  });
});

describe("validarPagos — as faixas da API (AC2)", () => {
  it("fração fora de 0…1, CPL negativo, texto e nível fora de 1…10 marcam erro na fonte certa", () => {
    const p = paraPayloadPagos(paraFormularioPagos(salvo()));
    p.blocos.meta_frio.pctCaptacao = 1.5;
    p.blocos.google_quente.cplMedioHistorico = -1;
    p.blocos.google_quente.faixaVariacao = Number.NaN;
    p.blocos.google_frio.nivelAssumido = 11;
    const erros = validarPagos(p);
    expect(erros.meta_frio?.pctCaptacao).toBe("Entre 0 % e 100 %");
    expect(erros.google_quente?.cplMedioHistorico).toBe("Não pode ser negativo");
    expect(erros.google_quente?.faixaVariacao).toBe("Só número");
    expect(erros.google_frio?.nivelAssumido).toMatch(/1…10/);
    expect(erros.meta_quente).toBeUndefined();
    expect(temErrosPagos(erros)).toBe(true);
    expect(temErrosPagos(validarPagos(salvo()))).toBe(false);
  });

  it("nível 10 é válido nos pagos (a escada tem dez níveis), 9 nos orgânicos não é a regra daqui", () => {
    const p = salvo();
    p.blocos.meta_quente.nivelAssumido = 10;
    expect(temErrosPagos(validarPagos(p))).toBe(false);
  });

  it("blocoPagoComoEntradas: NaN vira null para o motor", () => {
    const b = { ...salvo().blocos.meta_quente, cplMedioHistorico: Number.NaN };
    expect(blocoPagoComoEntradas(b).cplMedioHistorico).toBeNull();
    expect(blocoPagoComoEntradas(b).pctCaptacao).toBe(0.85);
  });
});

describe("pagosAlterados", () => {
  it("igual → false; mudar campo, nível ou seleção → true; NaN conta como diferente", () => {
    const s = salvo();
    expect(pagosAlterados(salvo(), s)).toBe(false);
    const a = salvo();
    a.blocos.meta_quente.cplMedioHistorico = 4.6;
    expect(pagosAlterados(a, s)).toBe(true);
    const b = salvo();
    b.blocos.meta_quente.nivelAssumido = null;
    expect(pagosAlterados(b, s)).toBe(true);
    const c = salvo();
    c.combinacoes[1].selecoes.google_quente = 3;
    expect(pagosAlterados(c, s)).toBe(true);
    const d = salvo();
    d.blocos.google_frio.faixaVariacao = Number.NaN;
    expect(pagosAlterados(d, s)).toBe(true);
  });
});

describe("classeDaCelulaDeCpl — DV-012 = B (AC11)", () => {
  it("mesmo sentido dos leads: 1 azul (CPL baixo) … 4 vermelho (CPL alto) — NÃO reproduz a inversão da planilha", () => {
    expect(classeDaCelulaDeCpl(1, 4.5)).toMatch(/sky/);
    expect(classeDaCelulaDeCpl(2, 4.5)).toMatch(/emerald/);
    expect(classeDaCelulaDeCpl(3, 4.5)).toMatch(/amber/);
    expect(classeDaCelulaDeCpl(4, 4.5)).toMatch(/red/);
    expect(classeDaCelulaDeCpl(1, 4.5)).not.toMatch(/red/);
  });

  it("sem referência (CPL médio vazio ou zero) → sem cor, mesmo com faixa 4 do motor (UX-001)", () => {
    expect(classeDaCelulaDeCpl(4, null)).toBe("");
    expect(classeDaCelulaDeCpl(4, 0)).toBe("");
    expect(classeDaCelulaDeCpl(null, 4.5)).toBe("");
  });
});

describe("rótulos (DV-025)", () => {
  it("as linhas do Google dizem 'Google Ads', não 'Meta Ads'", () => {
    expect(ROTULO_DA_FONTE.google_quente).toMatch(/^Google Ads/);
    expect(ROTULO_DA_FONTE.google_frio).toMatch(/^Google Ads/);
    expect(ROTULO_DA_FONTE.google_quente).not.toMatch(/Meta/);
    expect(ROTULO_DA_FONTE.meta_quente).toMatch(/^Meta Ads/);
  });
});

describe("diagnosticoDaAba1Pagos (AC14)", () => {
  it("aba 1 completa → nada falta", () => {
    expect(diagnosticoDaAba1Pagos(ABA_1, derivarInputsFinanceiros(ABA_1))).toEqual([]);
  });

  it("nomeia o input que falta: meta, % dos pagos, ticket, meta de MC dos pagos (receita null), investimento", () => {
    const e: InputsFinanceiros = { ...ABA_1, metaMargemTotal: null, ticketMedio: null, mcAlvoPagos: null, investimentoAnuncios: 0, pctMargemPagos: 0 };
    const d = derivarInputsFinanceiros(e);
    expect(d.receitaMetaQuente).toBeNull();
    const faltas = diagnosticoDaAba1Pagos(e, d);
    expect(faltas).toContain("Meta de Margem de Contribuição Total");
    expect(faltas.some((f) => f.startsWith("Representatividade"))).toBe(true);
    expect(faltas.some((f) => f.startsWith("Ticket Médio"))).toBe(true);
    expect(faltas.some((f) => f.startsWith("Meta de MC dos leads pagos"))).toBe(true);
    expect(faltas.some((f) => f.startsWith("Investimento em Anúncios"))).toBe(true);
  });
});

describe("estadoDaTela reutilizada (AC14)", () => {
  it("erro antes de carregando", () => {
    expect(estadoDaTela({ isLoading: false, isError: true, temForm: false })).toBe("erro");
    expect(estadoDaTela({ isLoading: true, isError: false, temForm: false })).toBe("carregando");
  });
});
