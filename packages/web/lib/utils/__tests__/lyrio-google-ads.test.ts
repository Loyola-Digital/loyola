/**
 * Story 42.13 (AC1/AC6a) — o estado do Google Ads na etapa Lyrio: erro é erro,
 * não "sem entrega" nem R$ 0.
 */
import { describe, expect, it } from "vitest";
import { estadoDoGoogle, investimentoDoGoogle, mensagemDoErroDoGoogle } from "../lyrio-google-ads";

const ids = new Set(["23978232455", "23982770287"]);
const camp = (id: string, spend: number) => ({ id, spend, impressions: 10, clicks: 1, conversions: 0 });

/** O erro como `lib/api-client.ts` monta: `message` = `error` do corpo, e o corpo inteiro em `body`. */
const erro502 = Object.assign(new Error("Erro ao buscar campanhas do Google Ads"), {
  status: 502,
  body: {
    error: "Erro ao buscar campanhas do Google Ads",
    details: 'Falha ao obter access token do Google: {\n  "error": "invalid_grant",\n  "error_description": "Bad Request"\n}',
  },
});

describe("estadoDoGoogle", () => {
  it("consulta em erro → erro com a mensagem e o details da API (o caso real: invalid_grant)", () => {
    const e = estadoDoGoogle({ isLoading: false, error: erro502, data: undefined }, ids);
    expect(e.tipo).toBe("erro");
    expect(e.tipo === "erro" && e.mensagem).toMatch(/^Erro ao buscar campanhas do Google Ads: Falha ao obter access token.*invalid_grant/s);
  });
  it("erro vale mesmo com dado antigo em cache", () => {
    expect(estadoDoGoogle({ isLoading: false, error: erro502, data: { campaigns: [camp("23978232455", 9)] } }, ids).tipo).toBe("erro");
  });
  it("respondeu sem nenhuma vinculada → sem_entrega (a frase antiga continua só aqui)", () => {
    expect(estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [camp("999", 50)] } }, ids)).toEqual({ tipo: "sem_entrega" });
    expect(estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [] } }, ids)).toEqual({ tipo: "sem_entrega" });
  });
  it("pronto → só as vinculadas", () => {
    const e = estadoDoGoogle({ isLoading: false, error: null, data: { campaigns: [camp("999", 50), camp("23982770287", 12.5)] } }, ids);
    expect(e).toEqual({ tipo: "pronto", vinculadas: [camp("23982770287", 12.5)] });
  });
  it("carregando, ou sem dado ainda → carregando", () => {
    expect(estadoDoGoogle({ isLoading: true, error: null, data: undefined }, ids)).toEqual({ tipo: "carregando" });
    expect(estadoDoGoogle({ isLoading: false, error: null, data: undefined }, ids)).toEqual({ tipo: "carregando" });
  });
});

describe("investimentoDoGoogle — o que o Resumo usa no ROAS e na Margem", () => {
  it("erro e carregando → null (desconhecido), nunca 0", () => {
    expect(investimentoDoGoogle({ tipo: "erro", mensagem: "x" })).toBeNull();
    expect(investimentoDoGoogle({ tipo: "carregando" })).toBeNull();
  });
  it("sem entrega → 0; pronto → soma das vinculadas", () => {
    expect(investimentoDoGoogle({ tipo: "sem_entrega" })).toBe(0);
    expect(investimentoDoGoogle({ tipo: "pronto", vinculadas: [camp("a", 10.25), camp("b", 4.75)] })).toBe(15);
  });
});

describe("mensagemDoErroDoGoogle", () => {
  it("sem body: a message; sem nada: genérica; details já contido não repete", () => {
    expect(mensagemDoErroDoGoogle(new Error("API error: 500"))).toBe("API error: 500");
    expect(mensagemDoErroDoGoogle(null)).toBe("Erro desconhecido");
    expect(mensagemDoErroDoGoogle({ message: "Conta nao encontrada", body: { error: "Conta nao encontrada", details: "Conta nao encontrada" } })).toBe("Conta nao encontrada");
  });
});
