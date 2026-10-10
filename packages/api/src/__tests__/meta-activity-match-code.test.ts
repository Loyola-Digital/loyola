/**
 * Story 49.23 — o código de casamento do log automático de atividades da Meta
 * segue a regra única do código do funil (`services/funnel-match-code.ts`).
 *
 * O defeito: `(matchCode ?? name ?? "")` só caía no nome do funil quando o
 * `match_code` era nulo. Um `match_code` só com espaços virava `""`, era
 * filtrado, e o funil sumia do casamento por nome do log.
 */

import { describe, expect, it } from "vitest";
import { codigosDosFunis, funilPeloNome } from "../services/meta-activity-log-sync.js";

type Funil = { id: string; name: string | null; matchCode: string | null };

/** A regra antiga, copiada de `codigosDeMatch` antes da 49.23 (AC3). */
function regraAntiga(lista: Funil[]): { funnelId: string; code: string }[] {
  return lista
    .map((f) => ({ funnelId: f.id, code: (f.matchCode ?? f.name ?? "").trim().toLowerCase() }))
    .filter((f) => f.code.length > 0);
}

describe("codigosDosFunis — regra única do código do funil (Story 49.23)", () => {
  it("match_code só com espaços usa o nome do funil, e o funil casa por nome no log", () => {
    const codigos = codigosDosFunis([{ id: "pg05", name: "DG-PG05 Out 26", matchCode: "   " }]);
    expect(codigos).toEqual([{ funnelId: "pg05", code: "dg-pg05 out 26" }]);
    expect(funilPeloNome("[DG-PG05 Out 26] Captação — Hot", codigos)).toBe("pg05");
  });

  it("match_code real é aparado e minúsculo, e vence o nome do funil", () => {
    const codigos = codigosDosFunis([{ id: "fz", name: "Funil FZ Julho", matchCode: "  Fz-L3  " }]);
    expect(codigos).toEqual([{ funnelId: "fz", code: "fz-l3" }]);
  });

  it("sem match_code, o nome do funil, aparado e minúsculo", () => {
    expect(codigosDosFunis([{ id: "a", name: "  BBE-FC1-A1  ", matchCode: null }])).toEqual([
      { funnelId: "a", code: "bbe-fc1-a1" },
    ]);
  });

  it("sem match_code e sem nome (nulos ou em branco), o funil fica de fora", () => {
    expect(
      codigosDosFunis([
        { id: "nulos", name: null, matchCode: null },
        { id: "brancos", name: "   ", matchCode: "  " },
        { id: "nome-branco", name: " ", matchCode: null },
        { id: "codigo-vazio", name: null, matchCode: "" },
      ]),
    ).toEqual([]);
  });

  it("um funil em branco não rouba o casamento do funil com código real", () => {
    // O nome do funil em branco NÃO está no nome do objeto (Dev Note do @po):
    // o caso prova que o código real não perde para um funil que não casa.
    const codigos = codigosDosFunis([
      { id: "branco", name: "Funil Antigo Mar 25", matchCode: "   " },
      { id: "real", name: "FZ L3 Julho", matchCode: "fz-l3" },
    ]);
    expect(funilPeloNome("fz-l3-jul26--vendas", codigos)).toBe("real");
  });

  it("empate entre funis continua descartando, com o funil em branco no empate", () => {
    // O funil em branco tem o nome igual ao código do outro: mesmo comprimento,
    // funis diferentes → ninguém leva.
    const codigos = codigosDosFunis([
      { id: "branco", name: "FZ-L3", matchCode: "  " },
      { id: "real", name: "FZ L3 Julho", matchCode: "fz-l3" },
    ]);
    expect(funilPeloNome("fz-l3-jul26--vendas", codigos)).toBeNull();
  });

  it("para funis sem match_code em branco, o resultado é o mesmo da regra antiga (AC3)", () => {
    const lista: Funil[] = [
      { id: "1", name: "DG-PG05 Out 26", matchCode: "dg-pg05" },
      { id: "2", name: "Funil FZ Julho", matchCode: "  Fz-L3  " },
      { id: "3", name: "  BBE-FC1-A1  ", matchCode: null },
      { id: "4", name: null, matchCode: null },
      { id: "5", name: "   ", matchCode: null },
    ];
    expect(codigosDosFunis(lista)).toEqual(regraAntiga(lista));
  });
});
