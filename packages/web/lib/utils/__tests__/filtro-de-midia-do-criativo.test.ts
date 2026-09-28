// Story 18.87 — filtro Vídeo / Estático / Todos pelo nome do anúncio (AC2, AC7).
import { describe, expect, it } from "vitest";
import {
  FILTRO_DE_MIDIA_PADRAO,
  passaNoFiltroDeMidia,
  type TipoDeMidia,
} from "../filtro-de-midia-do-criativo";

/** Em quais filtros o nome entra, na ordem Vídeo, Estático, Todos. */
function onde(nome: string | null | undefined): Record<TipoDeMidia, boolean> {
  return {
    video: passaNoFiltroDeMidia(nome, "video"),
    estatico: passaNoFiltroDeMidia(nome, "estatico"),
    todos: passaNoFiltroDeMidia(nome, "todos"),
  };
}

describe("passaNoFiltroDeMidia", () => {
  it("vídeo do padrão novo: só Vídeo (e Todos) — 'adv' contém 'ad' mas não vira Estático", () => {
    expect(onde("adv01_ia_dg_pg05_09-2026")).toEqual({ video: true, estatico: false, todos: true });
  });

  it("estático do padrão novo: só Estático (e Todos)", () => {
    expect(onde("ad01_dg_pg05_09-2026")).toEqual({ video: false, estatico: true, todos: true });
  });

  it("maiúscula conta: 'ADS -VENDAS- VID- 1' é Estático (comportamento pedido pelo gestor)", () => {
    expect(onde("ADS -VENDAS- VID- 1")).toEqual({ video: false, estatico: true, todos: true });
  });

  it("maiúscula conta: 'ADV01_…' é Vídeo", () => {
    expect(onde("ADV01_H_DG_PG05_09-2026")).toEqual({ video: true, estatico: false, todos: true });
  });

  it("substring em qualquer posição: 'adv' no meio do nome é Vídeo", () => {
    expect(onde("adv--h--pp--s1--a1--react")).toEqual({ video: true, estatico: false, todos: true });
  });

  it("nome sem 'ad' aparece só em Todos", () => {
    expect(onde("carrossel-dg-pg02-abr26--uma-nova-ia")).toEqual({
      video: false,
      estatico: false,
      todos: true,
    });
  });

  it("nome vazio, null ou undefined aparece só em Todos", () => {
    for (const nome of ["", null, undefined]) {
      expect(onde(nome)).toEqual({ video: false, estatico: false, todos: true });
    }
  });

  it("padrão da tela é Todos", () => {
    expect(FILTRO_DE_MIDIA_PADRAO).toBe("todos");
  });
});
