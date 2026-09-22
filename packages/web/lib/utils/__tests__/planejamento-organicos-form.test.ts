import { describe, expect, it } from "vitest";
import { CANAIS_ORGANICOS } from "@loyola-x/shared/src/planejamento-cenarios";
import { organicosVazios, type OrganicosDoSimulador } from "@loyola-x/shared/src/planejamento-combinacoes";
import { derivarInputsFinanceiros, type InputsFinanceiros } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import {
  CAMPOS_DE_FRACAO_DO_BLOCO,
  LIMIAR_VERDE,
  LIMIAR_VERMELHO,
  blocoComoEntradas,
  classeDaCelulaDeLeads,
  classeDaFaixa,
  diagnosticoDaAba1,
  estadoDaTela,
  estadoDoAtingimento,
  larguraDaBarra,
  lerSelecao,
  organicosAlterados,
  paraFormularioOrganicos,
  paraPayloadOrganicos,
  temErros,
  temReferenciaDeFaixa,
  validarOrganicos,
  valorDaGrade,
} from "@/lib/utils/planejamento-organicos-form";

/**
 * Story 48.3 — formulário ↔ payload da aba "Leads Orgânicos" (AC17), cores do
 * atingimento (AC7, DV-016 = A), faixas (AC9) e o diagnóstico da aba 1 (AC13).
 */

function salvo(): OrganicosDoSimulador {
  const v = organicosVazios();
  v.blocos.whatsapp = { conversaoMedia: 0.04, variacaoConversao: 0.2, variacaoReceita: 0.1, taxaCaptacao: 0.12, faixaVariacao: 0.1, fracaoCenario1: null, nivelAssumido: 3 };
  v.blocos.area_membros = { conversaoMedia: 0.07, variacaoConversao: 0.4, variacaoReceita: 0.1, taxaCaptacao: 0.06, faixaVariacao: 0.1, fracaoCenario1: 0.5, nivelAssumido: null };
  v.combinacoes[0].selecoes.whatsapp = 4;
  v.combinacoes[4].selecoes.area_membros = 10;
  return v;
}

const ABA_1: InputsFinanceiros = {
  pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
  metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
  investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
  pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgTelegram: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
  baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseTelegram: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
};

describe("paraFormularioOrganicos / paraPayloadOrganicos (AC17)", () => {
  it("fração → pontos com vírgula; null → vazio; 0,07 não vira 7.000000000000001; nível e seleções passam como número", () => {
    const f = paraFormularioOrganicos(salvo());
    expect(f.blocos.whatsapp.fracoes.conversaoMedia).toBe("4");
    expect(f.blocos.whatsapp.fracoes.variacaoConversao).toBe("20");
    expect(f.blocos.whatsapp.fracoes.fracaoCenario1).toBe("");
    expect(f.blocos.area_membros.fracoes.conversaoMedia).toBe("7");
    expect(f.blocos.area_membros.fracoes.fracaoCenario1).toBe("50");
    expect(f.blocos.whatsapp.nivelAssumido).toBe(3);
    expect(f.blocos.area_membros.nivelAssumido).toBeNull();
    expect(f.blocos.email.nivelAssumido).toBeNull();
    expect(f.combinacoes).toHaveLength(5);
    expect(f.combinacoes[0].whatsapp).toBe(4);
    expect(f.combinacoes[4].area_membros).toBe(10);
    expect(f.combinacoes[2].email).toBeNull();
  });

  it("ida-e-volta preserva o salvo (o CORPO que vai para a API, não o tipo)", () => {
    const s = salvo();
    expect(paraPayloadOrganicos(paraFormularioOrganicos(s))).toEqual(s);
  });

  it("pontos → fração: '4' → 0,04 exato, '33,333333' com vírgula, texto → NaN, vazio → null", () => {
    const f = paraFormularioOrganicos(organicosVazios());
    f.blocos.email.fracoes.conversaoMedia = "4";
    f.blocos.email.fracoes.variacaoReceita = "33,333333";
    f.blocos.email.fracoes.taxaCaptacao = "abc";
    const p = paraPayloadOrganicos(f);
    expect(p.blocos.email.conversaoMedia).toBe(0.04);
    expect(p.blocos.email.variacaoReceita).toBe(0.33333333);
    expect(p.blocos.email.taxaCaptacao).toBeNaN();
    expect(p.blocos.email.faixaVariacao).toBeNull();
    expect(p.combinacoes.map((c) => c.indice)).toEqual([1, 2, 3, 4, 5]);
  });

  it("o payload tem SEMPRE os seis canais (sete campos) e as cinco combinações — a forma da API (PO-02)", () => {
    const p = paraPayloadOrganicos(paraFormularioOrganicos(organicosVazios()));
    expect(Object.keys(p.blocos).sort()).toEqual([...CANAIS_ORGANICOS].sort());
    for (const c of CANAIS_ORGANICOS) expect(Object.keys(p.blocos[c])).toHaveLength(7);
    expect(p.combinacoes).toHaveLength(5);
    for (const c of p.combinacoes) expect(Object.keys(c.selecoes).sort()).toEqual([...CANAIS_ORGANICOS].sort());
  });
});

describe("validarOrganicos — as faixas da API (AC2)", () => {
  it("fração fora de 0…1, texto (NaN) e nível fora de 1…8 marcam erro no campo certo do canal certo", () => {
    const p = paraPayloadOrganicos(paraFormularioOrganicos(salvo()));
    p.blocos.email.conversaoMedia = 1.5;
    p.blocos.telegram.faixaVariacao = Number.NaN;
    p.blocos.youtube.nivelAssumido = 9;
    const erros = validarOrganicos(p);
    expect(erros.email?.conversaoMedia).toBe("Entre 0 % e 100 %");
    expect(erros.telegram?.faixaVariacao).toBe("Só número");
    expect(erros.youtube?.nivelAssumido).toMatch(/1…8/);
    expect(erros.whatsapp).toBeUndefined();
    expect(temErros(erros)).toBe(true);
  });

  it("payload vazio e payload válido não têm erro", () => {
    expect(temErros(validarOrganicos(organicosVazios()))).toBe(false);
    expect(temErros(validarOrganicos(salvo()))).toBe(false);
  });

  it("blocoComoEntradas: NaN vira null para o motor (o erro fica na tela, não na grade)", () => {
    const b = { ...salvo().blocos.whatsapp, taxaCaptacao: Number.NaN };
    expect(blocoComoEntradas(b).taxaCaptacao).toBeNull();
    expect(blocoComoEntradas(b).conversaoMedia).toBe(0.04);
  });
});

describe("organicosAlterados", () => {
  it("igual → false; mudar uma fração, um nível ou uma seleção → true; NaN conta como diferente", () => {
    const s = salvo();
    expect(organicosAlterados(salvo(), s)).toBe(false);
    const a = salvo();
    a.blocos.instagram.conversaoMedia = 0.02;
    expect(organicosAlterados(a, s)).toBe(true);
    const b = salvo();
    b.blocos.whatsapp.nivelAssumido = null;
    expect(organicosAlterados(b, s)).toBe(true);
    const c = salvo();
    c.combinacoes[2].selecoes.youtube = 1;
    expect(organicosAlterados(c, s)).toBe(true);
    const d = salvo();
    d.blocos.whatsapp.faixaVariacao = Number.NaN;
    expect(organicosAlterados(d, s)).toBe(true);
  });
});

describe("lerSelecao", () => {
  it("'' → null; '1'…'10' → número; fora da faixa → null (seletor fechado; cinto)", () => {
    expect(lerSelecao("")).toBeNull();
    expect(lerSelecao("1")).toBe(1);
    expect(lerSelecao("10")).toBe(10);
    expect(lerSelecao("11")).toBeNull();
    expect(lerSelecao("1.5")).toBeNull();
    expect(lerSelecao("x")).toBeNull();
  });
});

describe("estadoDoAtingimento — DV-016 = A (AC7)", () => {
  it("verde ≥ 100 %, vermelho ≤ 70 %, neutro entre; null sem atingimento", () => {
    expect(LIMIAR_VERDE).toBe(1);
    expect(LIMIAR_VERMELHO).toBe(0.7);
    expect(estadoDoAtingimento(1)).toBe("verde");
    expect(estadoDoAtingimento(1.132571)).toBe("verde");
    expect(estadoDoAtingimento(0.999999)).toBe("neutro");
    expect(estadoDoAtingimento(0.923512)).toBe("neutro");
    expect(estadoDoAtingimento(0.7)).toBe("vermelho");
    expect(estadoDoAtingimento(0.700001)).toBe("neutro");
    expect(estadoDoAtingimento(0.1)).toBe("vermelho");
    expect(estadoDoAtingimento(-0.5)).toBe("vermelho");
    expect(estadoDoAtingimento(null)).toBeNull();
  });

  it("larguraDaBarra: min(atingimento, 1) em 0…100; negativo → 0; null → 0", () => {
    expect(larguraDaBarra(0.923512)).toBe(92);
    expect(larguraDaBarra(1.13)).toBe(100);
    expect(larguraDaBarra(-0.2)).toBe(0);
    expect(larguraDaBarra(null)).toBe(0);
  });
});

describe("classeDaFaixa — 1 azul … 4 vermelho (AC9)", () => {
  it("cada faixa tem uma cor, no sentido azul → verde → amarelo → vermelho; null sem classe", () => {
    expect(classeDaFaixa(1)).toMatch(/sky/);
    expect(classeDaFaixa(2)).toMatch(/emerald/);
    expect(classeDaFaixa(3)).toMatch(/amber/);
    expect(classeDaFaixa(4)).toMatch(/red/);
    expect(classeDaFaixa(null)).toBe("");
  });
});

describe("UX-001 — faixa só com referência", () => {
  it("leads esperados 0 (base ou taxa vazias) → sem referência: célula sem cor, mesmo com faixa 4 do motor", () => {
    expect(temReferenciaDeFaixa(3000)).toBe(true);
    expect(temReferenciaDeFaixa(0)).toBe(false);
    expect(temReferenciaDeFaixa(Number.NaN)).toBe(false);
    expect(classeDaCelulaDeLeads(4, 0)).toBe(""); // o motor classifica tudo > 0 como 4 quando a referência é zero
    expect(classeDaCelulaDeLeads(4, 3000)).toMatch(/red/);
    expect(classeDaCelulaDeLeads(2, 3000)).toMatch(/emerald/);
    expect(classeDaCelulaDeLeads(null, 3000)).toBe("");
  });
});

describe("REQ-001 — meta de receita null → '—' na grade", () => {
  it("meta null anula o valor (a grade mostra —); meta zero ou positiva mantém o valor, inclusive zero", () => {
    expect(valorDaGrade(0, null)).toBeNull();
    expect(valorDaGrade(1700, null)).toBeNull();
    expect(valorDaGrade(0, 0)).toBe(0);
    expect(valorDaGrade(1700, 115384.62)).toBe(1700);
    expect(valorDaGrade(null, 115384.62)).toBeNull();
  });
});

describe("diagnosticoDaAba1 (AC13)", () => {
  it("aba 1 completa → nada falta", () => {
    expect(diagnosticoDaAba1(ABA_1, derivarInputsFinanceiros(ABA_1))).toEqual([]);
  });

  it("nomeia o input que falta: meta, ticket, % do canal e base do canal — inclusive Área de Membros (PO-01)", () => {
    const e: InputsFinanceiros = { ...ABA_1, metaMargemTotal: null, ticketMedio: null, pctOrgAreaMembros: null, baseTelegram: null };
    const faltas = diagnosticoDaAba1(e, derivarInputsFinanceiros(e));
    expect(faltas).toContain("Meta de Margem de Contribuição Total");
    expect(faltas.some((f) => f.startsWith("Ticket Médio"))).toBe(true);
    expect(faltas).toContain("% da meta — Área de Membros");
    expect(faltas).toContain("Base Telegram");
    expect(faltas).not.toContain("Base WhatsApp");
  });

  it("custos somando 100 % ou mais → margem-alvo sem base (meta de receita null na 48.1)", () => {
    const e: InputsFinanceiros = { ...ABA_1, pctImposto: 0.77 };
    const d = derivarInputsFinanceiros(e);
    expect(d.canais.whatsapp.receita).toBeNull();
    expect(diagnosticoDaAba1(e, d).some((f) => f.includes("100 %"))).toBe(true);
  });
});

describe("estadoDaTela reutilizada (AC12): erro antes de carregando", () => {
  it("erro com formulário vazio é 'erro', não skeleton eterno", () => {
    expect(estadoDaTela({ isLoading: false, isError: true, temForm: false })).toBe("erro");
    expect(estadoDaTela({ isLoading: true, isError: false, temForm: false })).toBe("carregando");
    expect(estadoDaTela({ isLoading: false, isError: false, temForm: true })).toBe("pronto");
  });
});

describe("CAMPOS_DE_FRACAO_DO_BLOCO", () => {
  it("são os seis campos de fração — o sétimo (nivelAssumido) é o radio", () => {
    expect(CAMPOS_DE_FRACAO_DO_BLOCO).toEqual(["conversaoMedia", "variacaoConversao", "variacaoReceita", "taxaCaptacao", "faixaVariacao", "fracaoCenario1"]);
  });
});
