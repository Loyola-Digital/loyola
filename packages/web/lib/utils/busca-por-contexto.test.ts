/**
 * O que protege: a IA não é chamada quando a busca por texto já respondeu.
 *
 * Cada chamada custa segundos e uma ida ao modelo; disparar em cima de uma
 * busca que já trouxe trinta peças é pagar por nada.
 */

import { describe, expect, it } from "vitest";
import { deveBuscarPorContexto } from "./busca-por-contexto";

const caso = (over: Partial<Parameters<typeof deveBuscarPorContexto>[0]> = {}) =>
  deveBuscarPorContexto({
    termo: "quebra objeção de preço",
    achadosPorTexto: 0,
    carregandoTexto: false,
    ...over,
  });

describe("deveBuscarPorContexto", () => {
  it("entra quando a busca por texto não achou nada", () => {
    expect(caso({ achadosPorTexto: 0 })).toBe(true);
  });

  it("entra quando achou pouco — três resultados não é uma resposta", () => {
    expect(caso({ achadosPorTexto: 3 })).toBe(true);
  });

  it("NÃO entra quando a busca por texto já respondeu", () => {
    expect(caso({ achadosPorTexto: 4 })).toBe(false);
    expect(caso({ achadosPorTexto: 30 })).toBe(false);
  });

  it("não entra com termo curto — é alguém começando a digitar", () => {
    expect(caso({ termo: "vs" })).toBe(false);
    expect(caso({ termo: "  a  " })).toBe(false);
  });

  it("espera a busca literal voltar antes de decidir", () => {
    // Com ela em voo, `achadosPorTexto` é o resultado ANTERIOR — decidir por
    // ele dispararia a IA em cima de uma busca que ainda vai responder.
    expect(caso({ carregandoTexto: true, achadosPorTexto: 0 })).toBe(false);
  });

  it("termo vazio nunca chama", () => {
    expect(caso({ termo: "" })).toBe(false);
  });
});
