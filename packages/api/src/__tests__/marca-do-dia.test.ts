import { describe, expect, it } from "vitest";
import { resolverMarcaDoDia } from "../services/marca-do-dia.js";

describe("resolverMarcaDoDia", () => {
  it("anotar um dia PRESERVA a virada de lote que já estava lá", () => {
    // O erro que isto evita: anotar um dia apagaria a marcação de lote de quem
    // passou antes, e ninguém ligaria uma coisa à outra.
    const r = resolverMarcaDoDia(
      { label: "Lote 2", nota: null },
      { nota: "subiu o CPL" },
    );
    expect(r).toEqual({
      acao: "gravar",
      marca: { label: "Lote 2", nota: "subiu o CPL" },
    });
  });

  it("marcar virada PRESERVA a observação que já estava lá", () => {
    const r = resolverMarcaDoDia(
      { label: "", nota: "criativo novo" },
      { label: "Lote 3" },
    );
    expect(r).toEqual({
      acao: "gravar",
      marca: { label: "Lote 3", nota: "criativo novo" },
    });
  });

  it("dia sem marca nenhuma aceita só observação", () => {
    const r = resolverMarcaDoDia(null, { nota: "feriado" });
    expect(r).toEqual({
      acao: "gravar",
      marca: { label: "", nota: "feriado" },
    });
  });

  it("os dois vazios mandam REMOVER", () => {
    // Sem isso sobra linha sem conteúdo, que a tabela desenha como marco sem
    // texto — e o CHECK do banco recusaria o update de qualquer forma.
    expect(
      resolverMarcaDoDia({ label: "Lote 2", nota: null }, { label: "" }),
    ).toEqual({
      acao: "remover",
    });
    expect(resolverMarcaDoDia({ label: "", nota: "x" }, { nota: "" })).toEqual({
      acao: "remover",
    });
  });

  it("`null` na nota é pedido explícito de remover", () => {
    // `??` trataria null como "não mandou nada" e a nota sobreviveria.
    const r = resolverMarcaDoDia(
      { label: "Lote 2", nota: "velha" },
      { nota: null },
    );
    expect(r).toEqual({
      acao: "gravar",
      marca: { label: "Lote 2", nota: null },
    });
  });

  it("só espaço conta como vazio", () => {
    expect(resolverMarcaDoDia(null, { nota: "   " })).toEqual({
      acao: "remover",
    });
    expect(resolverMarcaDoDia({ label: "  ", nota: null }, {})).toEqual({
      acao: "remover",
    });
  });

  it("apara as pontas do que grava", () => {
    const r = resolverMarcaDoDia(null, {
      label: "  Lote 2  ",
      nota: "  nota  ",
    });
    expect(r).toEqual({
      acao: "gravar",
      marca: { label: "Lote 2", nota: "nota" },
    });
  });

  it("pedido vazio sobre linha existente não muda nada", () => {
    const atual = { label: "Lote 2", nota: "obs" };
    expect(resolverMarcaDoDia(atual, {})).toEqual({
      acao: "gravar",
      marca: atual,
    });
  });
});
