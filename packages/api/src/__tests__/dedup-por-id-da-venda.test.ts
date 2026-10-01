import { describe, it, expect } from "vitest";
import {
  chaveDeDedupDaVenda,
  deduplicarPorIdDaVenda,
} from "../utils/dedup-por-id-da-venda.js";

/**
 * Story 41.10 — contrato de `deduplicarPorIdDaVenda`, consumido também pela
 * 41.11 (perpétuo) e pela camada 1 da 49.3 (debriefing).
 */

interface L {
  n: number;
  id: string | null;
  produto: string | null;
}
const chave = (l: L) => ({ idDaVenda: l.id, produto: l.produto });
const nums = (ls: L[]) => ls.map((l) => l.n);

describe("deduplicarPorIdDaVenda — a chave é (ID da venda, produto)", () => {
  it("mesmo ID e mesmo produto colapsam; sobrevive a PRIMEIRA", () => {
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: "V1", produto: "Ingresso" },
        { n: 2, id: "V1", produto: "Ingresso" },
        { n: 3, id: "V1", produto: "Ingresso" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1]);
    expect(nums(r.removidas)).toEqual([2, 3]);
  });

  it("mesmo ID com produto DIFERENTE (bump no mesmo pedido) não colapsa", () => {
    // Padrão do DG-PG04 e do BBE-A1: ingresso e order bump compartilham o ID.
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: "PED-9", produto: "Ingresso" },
        { n: 2, id: "PED-9", produto: "Bump" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1, 2]);
    expect(r.removidas).toEqual([]);
  });

  it("linha SEM ID nunca colapsa — nem com outra sem ID idêntica", () => {
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: null, produto: "Ingresso" },
        { n: 2, id: "", produto: "Ingresso" },
        { n: 3, id: "   ", produto: "Ingresso" },
        { n: 4, id: null, produto: "Ingresso" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1, 2, 3, 4]);
    expect(r.removidas).toEqual([]);
    expect(chaveDeDedupDaVenda({ idDaVenda: "  ", produto: "x" })).toBeNull();
  });

  it("normaliza: ID com trim; produto com trim + minúsculas; produto null = \"\"", () => {
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: "V1", produto: "Curso / Gravação" },
        { n: 2, id: " V1 ", produto: "  curso / GRAVAÇÃO " },
        { n: 3, id: "V2", produto: null },
        { n: 4, id: "V2", produto: "" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1, 3]);
    expect(nums(r.removidas)).toEqual([2, 4]);
  });

  it("preserva a ordem das mantidas e das removidas", () => {
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: "A", produto: "p" },
        { n: 2, id: "B", produto: "p" },
        { n: 3, id: "A", produto: "p" },
        { n: 4, id: null, produto: "p" },
        { n: 5, id: "B", produto: "p" },
        { n: 6, id: "C", produto: "p" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1, 2, 4, 6]);
    expect(nums(r.removidas)).toEqual([3, 5]);
  });

  it("o separador da chave não deixa `(\"a|b\",\"c\")` virar `(\"a\",\"b|c\")`", () => {
    const r = deduplicarPorIdDaVenda<L>(
      [
        { n: 1, id: "a|b", produto: "c" },
        { n: 2, id: "a", produto: "b|c" },
      ],
      chave,
    );
    expect(nums(r.mantidas)).toEqual([1, 2]);
  });

  it("não muta a entrada", () => {
    const entrada: readonly L[] = Object.freeze([
      { n: 1, id: "A", produto: "p" },
      { n: 2, id: "A", produto: "p" },
    ]);
    const r = deduplicarPorIdDaVenda(entrada, chave);
    expect(entrada).toHaveLength(2);
    expect(r.mantidas).not.toBe(entrada);
  });
});
