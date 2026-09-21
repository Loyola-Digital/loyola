import { describe, expect, it } from "vitest";
import {
  comoEntradas,
  estadoDaTela,
  formularioAlterado,
  lerNumero,
  paraEntradas,
  paraFormulario,
  validarEntradas,
  type FormularioDosInputs,
  type InputsPersistidos,
} from "@/lib/utils/planejamento-inputs-form";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared/src/planejamento-inputs-financeiros";

/**
 * Story 48.1 — o CORPO que a tela manda para a API (AC11, AC13, AC15).
 *
 * O que estes testes travam: percentual digitado em pontos vira fração no
 * payload (4 → 0.04) e volta (0.04 → "4"); vazio é `null`, não 0; vírgula
 * decimal funciona; texto vira erro, não zero silencioso; as faixas da tela
 * são as mesmas da API.
 */

function formulario(over: Partial<FormularioDosInputs> = {}): FormularioDosInputs {
  const f = Object.fromEntries(CAMPOS_DOS_INPUTS_FINANCEIROS.map((k) => [k, ""])) as FormularioDosInputs;
  return { ...f, ...over };
}

function persistido(over: Partial<InputsPersistidos> = {}): InputsPersistidos {
  const p = Object.fromEntries(CAMPOS_DOS_INPUTS_FINANCEIROS.map((k) => [k, null])) as InputsPersistidos;
  return { ...p, ...over };
}

describe("lerNumero", () => {
  it("vazio → null; número → número; vírgula decimal aceita; texto → NaN", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("   ")).toBeNull();
    expect(lerNumero("4")).toBe(4);
    expect(lerNumero("4,5")).toBe(4.5);
    expect(lerNumero("1200.50")).toBe(1200.5);
    expect(Number.isNaN(lerNumero("4%") as number)).toBe(true);
    expect(Number.isNaN(lerNumero("abc") as number)).toBe(true);
  });
});

describe("paraEntradas — o payload da API", () => {
  it("percentual em pontos vira fração; moeda e contagem passam como estão; vazio vira null", () => {
    const e = paraEntradas(formulario({ pctReembolso: "4", pctImposto: "12,5", metaMargemTotal: "250000", ticketMedio: "1200", baseWhatsapp: "25000" }));
    expect(e.pctReembolso).toBe(0.04);
    expect(e.pctImposto).toBe(0.125);
    expect(e.metaMargemTotal).toBe(250000);
    expect(e.ticketMedio).toBe(1200);
    expect(e.baseWhatsapp).toBe(25000);
    expect(e.pctMarketplace).toBeNull();
    expect(e.baseEmail).toBeNull();
  });

  it("fração sai exata: '7' → 0.07, '33,333333' → 0.33333333 (sem cauda de ponto flutuante)", () => {
    const e = paraEntradas(formulario({ pctOrgWhatsapp: "7", pctOrgEmail: "33,333333" }));
    expect(e.pctOrgWhatsapp).toBe(0.07);
    expect(e.pctOrgEmail).toBe(0.33333333);
  });

  it("texto em campo numérico vira NaN no payload — e a validação barra", () => {
    const e = paraEntradas(formulario({ pctReembolso: "quatro" }));
    expect(Number.isNaN(e.pctReembolso as number)).toBe(true);
    expect(validarEntradas(e).pctReembolso).toBe("Só número");
  });

  it("todas as 26 chaves estão no payload, mesmo vazias (o PUT grava o conjunto inteiro)", () => {
    const e = paraEntradas(formulario());
    expect(Object.keys(e).sort()).toEqual([...CAMPOS_DOS_INPUTS_FINANCEIROS].sort());
    expect(Object.values(e).every((v) => v === null)).toBe(true);
  });
});

describe("paraFormulario — ida e volta", () => {
  it("fração vira pontos como texto curto com VÍRGULA: 0.04 → '4'; 0.07 → '7' (não '7.000000000000001'); 0.125 → '12,5'; 1200.5 → '1200,5'; null → ''", () => {
    const f = paraFormulario(persistido({ pctReembolso: 0.04, pctImposto: 0.07, pctOrgEmail: 0.125, metaMargemTotal: 250000, ticketMedio: 1200.5 }));
    expect(f.pctReembolso).toBe("4");
    expect(f.pctImposto).toBe("7");
    expect(f.pctOrgEmail).toBe("12,5");
    expect(f.metaMargemTotal).toBe("250000");
    expect(f.ticketMedio).toBe("1200,5");
    expect(f.baseEmail).toBe("");
  });

  it("API → formulário → API devolve o mesmo payload (apêndice A)", () => {
    const original = persistido({
      pctReembolso: 0.04, pctMarketplace: 0.09, pctImposto: 0.12, pctCustoProduto: 0.06, pctComissoes: 0.03, pctOutrosCustos: 0.01,
      metaMargemTotal: 250000, pctMargemPagos: 0.25, ticketMedio: 1200, mcAlvoPagos: 0.3,
      investimentoAnuncios: 100000, pctInvestMeta: 0.4, pctMetaQuente: 0.8, pctGoogleQuente: 0.75,
      pctOrgWhatsapp: 0.4, pctOrgEmail: 0.3, pctOrgInstagram: 0.15, pctOrgTelegram: 0.05, pctOrgYoutube: 0.05, pctOrgAreaMembros: 0.05,
      baseWhatsapp: 25000, baseEmail: 50000, baseInstagram: 30000, baseTelegram: 8000, baseYoutube: 120000, baseAreaMembros: 6000,
    });
    expect(paraEntradas(paraFormulario(original))).toEqual(original);
    expect(formularioAlterado(paraEntradas(paraFormulario(original)), original)).toBe(false);
  });
});

describe("validarEntradas — as mesmas faixas da API (AC11)", () => {
  it("aceita o apêndice A sem erro e o formulário vazio sem erro", () => {
    expect(validarEntradas(paraEntradas(formulario({ pctReembolso: "4", ticketMedio: "1200", mcAlvoPagos: "30", baseEmail: "50000" })))).toEqual({});
    expect(validarEntradas(paraEntradas(formulario()))).toEqual({});
  });

  it("barra: percentual > 100 ou < 0, moeda negativa, base negativa ou fracionária, ticket 0, margem-alvo 0", () => {
    const erros = validarEntradas(
      paraEntradas(formulario({ pctImposto: "150", pctOrgEmail: "-1", metaMargemTotal: "-5", baseWhatsapp: "-3", baseEmail: "10,5", ticketMedio: "0", mcAlvoPagos: "0" })),
    );
    expect(erros.pctImposto).toBe("Entre 0 % e 100 %");
    expect(erros.pctOrgEmail).toBe("Entre 0 % e 100 %");
    expect(erros.metaMargemTotal).toBe("Não pode ser negativo");
    expect(erros.baseWhatsapp).toBe("Inteiro ≥ 0");
    expect(erros.baseEmail).toBe("Inteiro ≥ 0");
    expect(erros.ticketMedio).toBe("Maior que zero");
    expect(erros.mcAlvoPagos).toBe("Maior que zero");
  });

  it("100 % exato é válido; 100,0001 % não", () => {
    expect(validarEntradas(paraEntradas(formulario({ pctMetaQuente: "100" })))).toEqual({});
    expect(validarEntradas(paraEntradas(formulario({ pctMetaQuente: "100,0001" }))).pctMetaQuente).toBe("Entre 0 % e 100 %");
  });
});

describe("comoEntradas e formularioAlterado", () => {
  it("NaN entra na derivação como vazio (o erro fica ao lado do campo, não na conta)", () => {
    const e = paraEntradas(formulario({ pctReembolso: "x", pctImposto: "12" }));
    const c = comoEntradas(e);
    expect(c.pctReembolso).toBeNull();
    expect(c.pctImposto).toBe(0.12);
  });

  it("alterado compara campo a campo; NaN conta como diferente de qualquer coisa salva", () => {
    const salvo = persistido({ pctImposto: 0.12 });
    expect(formularioAlterado(persistido({ pctImposto: 0.12 }), salvo)).toBe(false);
    expect(formularioAlterado(persistido({ pctImposto: 0.13 }), salvo)).toBe(true);
    expect(formularioAlterado(persistido({ pctImposto: Number.NaN }), salvo)).toBe(true);
    expect(formularioAlterado(persistido({ pctImposto: 0.12, baseEmail: 1 }), salvo)).toBe(true);
  });
});

describe("estadoDaTela — erro vem ANTES de carregando (gate REL-001)", () => {
  it("falha da API sem formulário → 'erro', nunca 'carregando' eterno", () => {
    // O cenário do defeito: `isError` true, `isLoading` false, formulário nunca preenchido.
    expect(estadoDaTela({ isLoading: false, isError: true, temForm: false })).toBe("erro");
    // Erro também vence quando um formulário antigo ainda existe (refetch que falhou).
    expect(estadoDaTela({ isLoading: false, isError: true, temForm: true })).toBe("erro");
  });

  it("carregando enquanto a query roda ou o formulário ainda não foi montado; pronto quando tem formulário", () => {
    expect(estadoDaTela({ isLoading: true, isError: false, temForm: false })).toBe("carregando");
    expect(estadoDaTela({ isLoading: false, isError: false, temForm: false })).toBe("carregando");
    expect(estadoDaTela({ isLoading: false, isError: false, temForm: true })).toBe("pronto");
  });
});
