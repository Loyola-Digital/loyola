import { describe, expect, it } from "vitest";
import { organicosVazios, pagosVazios } from "@loyola-x/shared/src/planejamento-combinacoes";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared/src/planejamento-inputs-financeiros";
import type { InputsPersistidos } from "@/lib/utils/planejamento-inputs-form";
import {
  referenciaDaConversaoOrganica,
  referenciaDaConversaoPaga,
  referenciaDoInput,
  rotuloComReferencia,
  textoDeReferencia,
  type BaseDeReferencia,
} from "@/lib/utils/planejamento-referencia";

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

describe("rotuloComReferencia", () => {
  it("sem referência, o rótulo não muda", () => {
    expect(rotuloComReferencia("Reembolso", null)).toBe("Reembolso");
  });

  it("com referência, entra entre parênteses depois do rótulo", () => {
    expect(rotuloComReferencia("Reembolso", "4,00%")).toBe("Reembolso (base: 4,00%)");
    expect(rotuloComReferencia("Ticket Médio", "R$ 1.200,00")).toBe("Ticket Médio (base: R$ 1.200,00)"); // aqui a entrada já é texto comum
  });
});
