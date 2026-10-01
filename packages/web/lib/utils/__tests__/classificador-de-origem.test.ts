/**
 * Story 49.2 — o classificador único de origem é importável pelo web por
 * subpath (módulo folha), o mesmo caminho que uma tela usaria.
 *
 * A regra é testada a fundo em `packages/api/src/__tests__/classificador-de-origem.test.ts`
 * (lá estão o diferencial contra `lead-origin.ts` e as provas por regra). Aqui
 * fica o que só o web prova: o subpath resolve sem a cadeia NodeNext do índice
 * e a superfície exportada é exatamente a combinada com 49.3/49.4 — nenhum
 * helper que some os dois eixos.
 */
import { describe, expect, it } from "vitest";
import * as classificador from "@loyola-x/shared/src/classificador-de-origem";

describe("classificador-de-origem pelo subpath do web", () => {
  it("a superfície exportada é a do contrato (sem agrupamento que misture os eixos)", () => {
    expect(Object.keys(classificador).sort()).toEqual(
      [
        "CANAIS",
        "CLASSIFICADOR_VERSAO",
        "FECHAMENTOS",
        "SEGMENTOS_DE_QUALIFICACAO",
        "SEGMENTO_DE_QUALIFICACAO",
        "agruparPorCanal",
        "agruparPorFechamento",
        "classificarOrigem",
      ].sort(),
    );
  });

  it("decisão 3: lead Meta × venda x1 = Pago e Closer, nos dois eixos", () => {
    const r = classificador.classificarOrigem(
      { lead: { source: "meta" }, venda: { medium: "x1" } },
      { closerMediums: ["x1"], closerNomes: [], closerPorSellerName: false },
    );
    expect(r.canal).toBe("Pago N/D");
    expect(r.fechamento).toBe("closer");
  });
});
