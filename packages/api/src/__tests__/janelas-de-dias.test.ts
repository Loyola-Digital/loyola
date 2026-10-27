/**
 * As janelas do backfill (`utils/janelas-de-dias.ts`).
 *
 * O caso que motivou o módulo é o `cobre até hoje`: a versão anterior parava em
 * `hoje - 5`, e o backfill de 90 dias deixou intactos justamente os dias que o
 * bug da Meta tinha acabado de zerar.
 */

import { describe, it, expect } from "vitest";
import { janelasDeDias } from "../utils/janelas-de-dias.js";

const AGORA = new Date("2026-10-21T15:00:00Z");

describe("janelasDeDias", () => {
  it("cobre até hoje, sem deixar os dias recentes de fora", () => {
    const janelas = janelasDeDias(90, 7, AGORA);

    expect(janelas.at(-1)!.until).toBe("2026-10-21");
    expect(janelas[0].since).toBe("2026-07-24"); // hoje - 89
  });

  it("não deixa lacuna entre uma janela e a seguinte", () => {
    const janelas = janelasDeDias(90, 7, AGORA);

    for (let i = 1; i < janelas.length; i++) {
      const fimAnterior = new Date(janelas[i - 1].until + "T00:00:00Z").getTime();
      const inicioAtual = new Date(janelas[i].since + "T00:00:00Z").getTime();
      expect(inicioAtual - fimAnterior).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("mantém cada janela dentro do tamanho pedido", () => {
    for (const janela of janelasDeDias(90, 7, AGORA)) {
      const dias =
        (new Date(janela.until + "T00:00:00Z").getTime() -
          new Date(janela.since + "T00:00:00Z").getTime()) /
          (24 * 60 * 60 * 1000) +
        1;
      expect(dias).toBeGreaterThanOrEqual(1);
      expect(dias).toBeLessThanOrEqual(7);
    }
  });

  it("nunca passa de hoje", () => {
    for (const janela of janelasDeDias(30, 7, AGORA)) {
      expect(janela.until <= "2026-10-21").toBe(true);
      expect(janela.since <= janela.until).toBe(true);
    }
  });

  it("um dia é uma janela de hoje a hoje", () => {
    expect(janelasDeDias(1, 7, AGORA)).toEqual([{ since: "2026-10-21", until: "2026-10-21" }]);
  });

  it("devolve vazio para entrada sem sentido, em vez de laço infinito", () => {
    expect(janelasDeDias(0, 7, AGORA)).toEqual([]);
    expect(janelasDeDias(30, 0, AGORA)).toEqual([]);
  });
});
