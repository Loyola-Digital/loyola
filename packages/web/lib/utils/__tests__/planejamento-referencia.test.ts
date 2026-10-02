import { describe, expect, it } from "vitest";
import { organicosVazios, pagosVazios } from "@loyola-x/shared/src/planejamento-combinacoes";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import type { InputsPersistidos } from "@/lib/utils/planejamento-inputs-form";
import {
  baseTemSimulador,
  fraseSemBase,
  montarReferencia,
  referenciaDaConversaoOrganica,
  referenciaDaConversaoPaga,
  referenciaDoInput,
  rotuloDaOpcaoDeBase,
  textoDeReferencia,
  textoDoCabecalhoDasBases,
  type BaseDeReferencia,
} from "@/lib/utils/planejamento-referencia";
import { rotuloComBases } from "@/lib/utils/planejamento-bases";

/**
 * Story 48.9 — a referência do lançamento anterior ao lado do rótulo.
 *
 * ⚠️ `toLocaleString("pt-BR", { style: "currency" })` separa `R$` do número
 * com ESPAÇO NÃO SEPARÁVEL (U+00A0). Comparar com um espaço comum falha com
 * duas strings que parecem idênticas no relatório do vitest — por isso as
 * asserções de moeda normalizam o NBSP em vez de copiar o caractere invisível
 * para dentro do teste.
 */
const semNbsp = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;

function base(): BaseDeReferencia {
  const inputs = Object.fromEntries(CAMPOS_DOS_INPUTS_FINANCEIROS.map((k) => [k, null])) as unknown as InputsPersistidos;
  inputs.pctReembolso = 0.04;
  inputs.pctMarketplace = 0.0499;
  inputs.ticketMedio = 1200;
  inputs.baseWhatsapp = 25000;
  const organicos = organicosVazios();
  organicos.blocos.whatsapp.conversaoMedia = 0.04;
  const pagos = pagosVazios();
  pagos.blocos.meta_quente.conversaoMedia = 0.012;
  return { nome: "fz-m2-jul26", inputs, organicos, pagos };
}

describe("textoDeReferencia", () => {
  it("fração vira percentual, moeda vira reais, contagem vira inteiro", () => {
    expect(textoDeReferencia(0.0499, "pct")).toBe("4,99%");
    expect(semNbsp(textoDeReferencia(1200, "moeda"))).toBe("R$ 1.200,00");
    expect(textoDeReferencia(25000, "contagem")).toBe("25.000");
  });

  it("vazio, NaN e Infinity não viram referência (a tela não mostra parênteses)", () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(textoDeReferencia(v, "pct")).toBeNull();
    }
  });

  it("zero É uma referência — zero salvo na base é informação", () => {
    expect(textoDeReferencia(0, "pct")).toBe("0,00%");
    expect(semNbsp(textoDeReferencia(0, "moeda"))).toBe("R$ 0,00");
  });
});

describe("referenciaDoInput / conversões", () => {
  it("lê o campo da base, com a unidade do campo", () => {
    const b = base();
    expect(referenciaDoInput(b, "pctReembolso")).toBe("4,00%");
    expect(semNbsp(referenciaDoInput(b, "ticketMedio"))).toBe("R$ 1.200,00");
    expect(referenciaDoInput(b, "baseWhatsapp")).toBe("25.000");
  });

  it("campo vazio na base → sem referência", () => {
    expect(referenciaDoInput(base(), "pctImposto")).toBeNull();
  });

  it("sem base escolhida → nunca há referência", () => {
    expect(referenciaDoInput(null, "pctReembolso")).toBeNull();
    expect(referenciaDaConversaoOrganica(null, "whatsapp")).toBeNull();
    expect(referenciaDaConversaoPaga(null, "meta_quente")).toBeNull();
  });

  it("conversão média por canal e por fonte", () => {
    const b = base();
    expect(referenciaDaConversaoOrganica(b, "whatsapp")).toBe("4,00%");
    expect(referenciaDaConversaoOrganica(b, "email")).toBeNull();
    expect(referenciaDaConversaoPaga(b, "meta_quente")).toBe("1,20%");
    expect(referenciaDaConversaoPaga(b, "google_frio")).toBeNull();
  });
});

/**
 * ⚠️ INVERTIDOS DE PROPÓSITO na Story 48.14 (AC2/AC8). Até a 48.13 o rótulo era
 * `Reembolso (base: 4,00%)` — uma base só, sem o nome dela. Com várias bases
 * lado a lado, cada grupo leva o nome do funil, inclusive quando só uma está
 * marcada (um formato só). `rotuloComReferencia` deu lugar a `rotuloComBases`.
 */
describe("rotuloComBases (era rotuloComReferencia — formato invertido na 48.14)", () => {
  it("sem referência, o rótulo não muda", () => {
    expect(rotuloComBases("Reembolso", [])).toBe("Reembolso");
    expect(rotuloComBases("Reembolso", [{ nome: "fz-m2-jul26", base: null, real: null }])).toBe("Reembolso");
  });

  it("[48.14 inverte: era `(base: 4,00%)`] com referência, entra entre parênteses COM o nome da base", () => {
    expect(rotuloComBases("Reembolso", [{ nome: "fz-m2-jul26", base: "4,00%", real: null }])).toBe("Reembolso (fz-m2-jul26 base: 4,00%)");
    expect(rotuloComBases("Ticket Médio", [{ nome: "fz-m2-jul26", base: "R$ 1.200,00", real: null }])).toBe(
      "Ticket Médio (fz-m2-jul26 base: R$ 1.200,00)",
    ); // aqui a entrada já é texto comum
  });
});

/**
 * Story 48.13 — lançamento anterior SEM Planejamento serve de base, mostrando
 * só o realizado (decisão 2.3 = B do Danilo).
 *
 * ⚠️ As leituras da base vêm COM VALORES de propósito (PO-07): hoje, uma base
 * sem simulador já devolve tudo `null` nas três rotas — uma fixture vazia
 * passaria com ou sem a regra. Só valores discriminam.
 */
describe("montarReferencia — base sem simulador não vira `base:` (AC5/AC6)", () => {
  const leituras = () => {
    const b = base();
    return { inputs: b.inputs, organicos: b.organicos, pagos: b.pagos };
  };

  it("base SEM simulador → nenhuma referência `base:`, mesmo recebendo inputs com valores", () => {
    const r = montarReferencia({ nome: "fz-m2-jul26", temSimulador: false }, leituras());
    expect(referenciaDoInput(r, "pctReembolso")).toBeNull();
    expect(referenciaDoInput(r, "ticketMedio")).toBeNull();
    expect(referenciaDaConversaoOrganica(r, "whatsapp")).toBeNull();
    expect(referenciaDaConversaoPaga(r, "meta_quente")).toBeNull();
  });

  // [48.14 inverte: o cabeçalho dizia "não tem Planejamento salvo"] — a frase
  // da base sem simulador foi para a linha DELA na declaração (AC4); o
  // cabeçalho fala de várias bases. Ver `planejamento-bases.test.ts`.
  it("…mas a referência EXISTE (PO-06): com `null` a tela voltaria a pedir 'Escolha…' [48.14: cabeçalho no plural]", () => {
    const r = montarReferencia({ nome: "fz-m2-jul26", temSimulador: false }, leituras());
    expect(r).not.toBeNull();
    expect(r?.nome).toBe("fz-m2-jul26");
    expect(r?.semSimulador).toBe(true);
    expect(textoDoCabecalhoDasBases([r!])).toContain("cada um com o nome dele");
    expect(textoDoCabecalhoDasBases([r!])).not.toContain("Escolha");
  });

  it("base COM simulador → referência como hoje", () => {
    const r = montarReferencia({ nome: "fz-m2-jul26", temSimulador: true }, leituras());
    expect(referenciaDoInput(r, "pctReembolso")).toBe("4,00%");
    expect(referenciaDaConversaoOrganica(r, "whatsapp")).toBe("4,00%");
    expect(referenciaDaConversaoPaga(r, "meta_quente")).toBe("1,20%");
    expect(r?.semSimulador).toBeFalsy();
    expect(textoDoCabecalhoDasBases([r!])).toContain("aparecem entre parênteses");
  });

  it("API antiga (sem `temSimulador`) → toda base é 'com simulador', exatamente como hoje (AC7)", () => {
    const r = montarReferencia({ nome: "fz-m2-jul26" }, leituras());
    expect(referenciaDoInput(r, "pctReembolso")).toBe("4,00%");
    expect(baseTemSimulador({})).toBe(true);
  });

  it("sem base escolhida → sem referência, e o cabeçalho pede a escolha [48.14: 'um ou mais']", () => {
    expect(montarReferencia(null, leituras())).toBeNull();
    expect(textoDoCabecalhoDasBases([])).toContain("Escolha um ou mais lançamentos anteriores");
  });
});

describe("rotuloDaOpcaoDeBase — o seletor diz qual é 'só realizado' (AC4)", () => {
  it("sem simulador → `nome · tipo · só realizado`; com simulador ou API antiga → como hoje", () => {
    expect(rotuloDaOpcaoDeBase({ nome: "fz-m2-jul26", rotuloDoTipo: "meteórico", temSimulador: false })).toBe(
      "fz-m2-jul26 · meteórico · só realizado",
    );
    expect(rotuloDaOpcaoDeBase({ nome: "fz-m2-jul26", rotuloDoTipo: "meteórico", temSimulador: true })).toBe("fz-m2-jul26 · meteórico");
    expect(rotuloDaOpcaoDeBase({ nome: "fz-m2-jul26", rotuloDoTipo: "meteórico" })).toBe("fz-m2-jul26 · meteórico");
  });
});

describe("fraseSemBase — o motivo de não haver base (AC3/AC7)", () => {
  it("nome sem tipo identificado → a frase de hoje sobre o nome", () => {
    expect(fraseSemBase({ tipo: null, incluiSemSimulador: true })).toBe(
      "Sem histórico anterior — o nome deste funil não identifica o tipo de lançamento (pago, gratuito, meteórico ou presencial).",
    );
  });

  it("API nova + nenhum anterior → 'primeiro {rótulo} deste expert', sem 'lançamento lançamento' (PO-02)", () => {
    expect(fraseSemBase({ tipo: "l", incluiSemSimulador: true })).toBe("Sem histórico anterior — este é o primeiro lançamento gratuito deste expert.");
    expect(fraseSemBase({ tipo: "m", incluiSemSimulador: true })).toBe("Sem histórico anterior — este é o primeiro meteórico deste expert.");
    expect(fraseSemBase({ tipo: "pg", incluiSemSimulador: true })).toBe("Sem histórico anterior — este é o primeiro lançamento pago deste expert.");
    expect(fraseSemBase({ tipo: "pr", incluiSemSimulador: true })).toBe("Sem histórico anterior — este é o primeiro evento presencial deste expert.");
  });

  it("API ANTIGA (PO-03): `bases: []` + tipo + sem o sinal → a frase de hoje, NUNCA 'primeiro…'", () => {
    // É o fz-m3-set-26 com a API antiga: ela filtra fz-m1/fz-m2 (sem simulador)
    // e devolve lista vazia — afirmar "primeiro meteórico" seria falso.
    const f = fraseSemBase({ tipo: "m" });
    expect(f).toBe("Sem histórico anterior — nenhum lançamento anterior do mesmo tipo tem o Planejamento preenchido.");
    expect(f).not.toContain("primeiro");
  });
});
