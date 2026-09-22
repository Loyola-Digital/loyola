import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  campanhasDoLancamento,
  consolidarInvestimento,
  type CampanhaVinculada,
  type GastoDaCampanha,
} from "../utils/planejamento-investimento.js";
import { condicaoDoGasto } from "../services/planejamento-repositorio.js";

/**
 * Story 48.11 — o investimento Meta realizado do lançamento.
 *
 * Os números são os de produção, medidos em 2026-09-22. O que cada teste trava
 * está no comentário: sem ele, a mutação correspondente passa.
 */

const c = (id: string, name: string): CampanhaVinculada => ({ id, name });
const g = (campaignId: string, spend: number, de?: string, ate?: string): GastoDaCampanha => ({
  campaignId,
  spend: String(spend), // `numeric` do Postgres chega como STRING
  de,
  ate,
});

describe("campanhasDoLancamento — o vínculo mora no stage", () => {
  it("campanha vinculada só à ETAPA entra (9 dos 11 lançamentos reais são assim)", () => {
    const m = campanhasDoLancamento([], [[c("1", "fz--hot")], [c("2", "fz--cold")]]);
    expect([...m.keys()]).toEqual(["1", "2"]);
  });

  it("campanha nos DOIS lugares conta UMA vez — e o nome que vale é o do funil", () => {
    const m = campanhasDoLancamento([c("1", "nome-novo--hot")], [[c("1", "nome-antigo--cold")]]);
    expect(m.size).toBe(1);
    expect(m.get("1")).toBe("nome-novo--hot");
  });

  it("nenhum vínculo → mapa vazio (não é erro)", () => {
    expect(campanhasDoLancamento(null, [null, undefined]).size).toBe(0);
  });
});

describe("consolidarInvestimento — o % quente", () => {
  // O caso REAL do `bbe-pr2-ago-26`: R$ 19.685,78 no total, 45,1 % quente, com
  // R$ 472,02 numa campanha sem temperatura no nome.
  const campanhas = campanhasDoLancamento(
    [],
    [
      [
        c("q", "bbe-pr2-ago-26--vendas--hot--cbo--videos"),
        c("f", "bbe-pr2-ago-26--vendas--cold--cbo--videos"),
        c("s", "bbe-pr2-ago-26--remarketing--cbo"), // sem hot/cold no nome
      ],
    ],
  );
  const gasto = [g("q", 8672.5, "2026-08-10", "2026-09-22"), g("f", 10541.26, "2026-08-12", "2026-09-20"), g("s", 472.02, "2026-08-15", "2026-08-30")];

  it("o gasto sem temperatura fica FORA do denominador", () => {
    const r = consolidarInvestimento(campanhas, gasto);
    expect(r.total).toBeCloseTo(19685.78, 2);
    expect(r.indefinido).toBeCloseTo(472.02, 2);
    // 8672,50 ÷ (8672,50 + 10541,26) = 45,14 %. Com o `indefinido` no
    // denominador daria 44,06 % — a mutação que este teste derruba.
    expect(r.pctQuente).toBeCloseTo(0.4514, 4);
    expect(r.pctQuente).not.toBeCloseTo(8672.5 / 19685.78, 4);
  });

  it("nenhuma campanha com temperatura → `null`, não zero", () => {
    const semMarca = campanhasDoLancamento([], [[c("s", "campanha-qualquer")]]);
    const r = consolidarInvestimento(semMarca, [g("s", 1000)]);
    expect(r.pctQuente).toBeNull();
    expect(r.indefinido).toBe(1000);
  });

  it("100 % quente quando só há quente — e 0 % quando só há frio", () => {
    expect(consolidarInvestimento(campanhasDoLancamento([], [[c("q", "x--hot")]]), [g("q", 10)]).pctQuente).toBe(1);
    expect(consolidarInvestimento(campanhasDoLancamento([], [[c("f", "x--cold")]]), [g("f", 10)]).pctQuente).toBe(0);
  });

  it("`quente`/`frio` em português contam igual a `hot`/`cold`", () => {
    const m = campanhasDoLancamento([], [[c("a", "x-publico-quente"), c("b", "x-publico-frio")]]);
    const r = consolidarInvestimento(m, [g("a", 30), g("b", 10)]);
    expect(r.pctQuente).toBe(0.75);
  });
});

describe("consolidarInvestimento — contagem, janela e linhas alheias", () => {
  const m = campanhasDoLancamento([], [[c("a", "x--hot"), c("b", "x--cold"), c("z", "x--hot")]]);

  it("campanha vinculada SEM gasto não entra em `campanhasComSpend`", () => {
    const r = consolidarInvestimento(m, [g("a", 100), g("b", 0)]);
    expect(r.campanhasVinculadas).toBe(3);
    expect(r.campanhasComSpend).toBe(1);
  });

  it("linha de gasto de campanha que NÃO é do lançamento é descartada", () => {
    const r = consolidarInvestimento(m, [g("a", 100), g("de-outro-funil", 9999)]);
    expect(r.total).toBe(100);
    expect(r.campanhasComSpend).toBe(1);
  });

  it("a janela é o MENOR início e o MAIOR fim entre as campanhas com gasto", () => {
    const r = consolidarInvestimento(m, [
      g("a", 100, "2026-08-10", "2026-08-20"),
      g("b", 50, "2026-07-29", "2026-08-07"),
      g("z", 0, "2026-01-01", "2026-12-31"), // sem gasto: não estica a janela
    ]);
    expect(r.janela).toEqual({ de: "2026-07-29", ate: "2026-08-20" });
  });

  it("`spend` string e `null` são tratados como número (o `numeric` do pg)", () => {
    const r = consolidarInvestimento(m, [{ campaignId: "a", spend: "1234.56" }, { campaignId: "b", spend: null }]);
    expect(r.total).toBeCloseTo(1234.56, 2);
    expect(r.campanhasComSpend).toBe(1);
  });
});

describe("condicaoDoGasto — o predicado, não a fila (lição do teste com banco mockado)", () => {
  // Um duplo de banco devolve o que o teste mandar devolver: se o filtro de
  // projeto sumir, o teste continua verde. O que prova o recorte é a SQL.
  const predicado = condicaoDoGasto("proj-1", ["c1", "c2"]);
  if (!predicado) throw new Error("condicaoDoGasto devolveu vazio — o filtro sumiu");
  const sql = new PgDialect().sqlToQuery(predicado);

  it("a consulta filtra por project_id — a PK começa nele", () => {
    expect(sql.sql).toContain('"project_id"');
    expect(sql.params).toContain("proj-1");
  });

  it("e restringe as campanhas às do lançamento", () => {
    expect(sql.sql).toContain('"campaign_id"');
    expect(sql.params).toEqual(expect.arrayContaining(["c1", "c2"]));
  });
});
