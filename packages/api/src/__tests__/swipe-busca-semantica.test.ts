/**
 * A busca por contexto.
 *
 * O que protege: o catálogo não quebra quando o texto da referência tem `|` ou
 * quebra de linha (o formato é separado por `|`), e a resposta do modelo nunca
 * vira um id inventado — índice fora da lista é descartado, não vira erro.
 */

import { describe, expect, it } from "vitest";
import {
  interpretarResposta,
  montarCatalogo,
  type ReferenciaDoCatalogo,
} from "../services/swipe-busca-semantica.js";

const ref = (id: string, extra: Partial<ReferenciaDoCatalogo> = {}): ReferenciaDoCatalogo => ({
  id,
  title: `Peça ${id}`,
  notes: null,
  brand: null,
  niche: null,
  platform: null,
  format: null,
  tags: null,
  ...extra,
});

describe("montarCatalogo", () => {
  it("numera as linhas a partir de zero — é o índice que o modelo devolve", () => {
    const linhas = montarCatalogo([ref("a"), ref("b")]).split("\n");
    expect(linhas[0].startsWith("0|")).toBe(true);
    expect(linhas[1].startsWith("1|")).toBe(true);
  });

  it("um `|` dentro do texto não pode virar coluna nova", () => {
    const linha = montarCatalogo([ref("a", { title: "VSL | versão B" })]);
    expect(linha.split("\n")).toHaveLength(1);
    expect(linha.split("|")).toHaveLength(7); // índice + os 6 campos
  });

  it("quebra de linha na anotação não vira referência nova", () => {
    const linha = montarCatalogo([ref("a", { notes: "gancho\nprova\nCTA" })]);
    expect(linha.split("\n")).toHaveLength(1);
  });

  it("corta a anotação — a peça inteira estouraria o prompt", () => {
    const longa = "x".repeat(900);
    expect(montarCatalogo([ref("a", { notes: longa })]).length).toBeLessThan(500);
  });
});

describe("interpretarResposta", () => {
  const refs = [ref("id-zero"), ref("id-um"), ref("id-dois")];

  it("lê `indice: motivo` e devolve os ids na ordem dada", () => {
    const r = interpretarResposta("2: ancora o preço no cafezinho\n0: mostra prova em números", refs);
    expect(r).toEqual([
      { id: "id-dois", motivo: "ancora o preço no cafezinho" },
      { id: "id-zero", motivo: "mostra prova em números" },
    ]);
  });

  it("índice inventado é descartado em silêncio, não vira erro", () => {
    expect(interpretarResposta("99: peça que não existe\n1: essa existe", refs)).toEqual([
      { id: "id-um", motivo: "essa existe" },
    ]);
  });

  it("NADA devolve lista vazia", () => {
    expect(interpretarResposta("NADA", refs)).toEqual([]);
    expect(interpretarResposta("  nada  ", refs)).toEqual([]);
  });

  it("não repete a mesma referência", () => {
    expect(interpretarResposta("1: um motivo\n1: outro motivo", refs)).toHaveLength(1);
  });

  it("ignora a conversa que vier junto do formato", () => {
    const r = interpretarResposta("Encontrei duas peças:\n\n0: a primeira\n\nEspero ter ajudado!", refs);
    expect(r).toEqual([{ id: "id-zero", motivo: "a primeira" }]);
  });

  it("aceita traço e ponto como separador — o modelo varia", () => {
    expect(interpretarResposta("0 - com traço", refs)[0].motivo).toBe("com traço");
    expect(interpretarResposta("0. com ponto", refs)[0].motivo).toBe("com ponto");
  });
});
