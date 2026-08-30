/**
 * O executor de querySpec.
 *
 * Os testes que importam aqui são os de RECUSA: provar que o spec inválido para
 * antes de virar SQL. Um executor testado só no caminho feliz é um executor que
 * aceita qualquer coisa.
 */

import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  ErroDeQuery,
  OPERADORES,
  executarQuery,
  planejar,
  querySpecSchema,
  FUSO,
  razao,
  TETO_DE_LINHAS,
  validarSpec,
  type QuerySpec,
} from "../services/bi/query.js";

const dialeto = new PgDialect();
const texto = (s: SQL) => dialeto.sqlToQuery(s);

/** O spec mínimo válido — data sempre presente, porque é obrigatório. */
function spec(over: Record<string, unknown> = {}): QuerySpec {
  return querySpecSchema.parse({
    entity: "trafego",
    metrics: ["trafego.spend"],
    filters: {
      "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
    },
    ...over,
  });
}

/** Um `db` de mentira que guarda o que recebeu, sem tocar em banco. */
function dbFalso(linhas: Record<string, unknown>[] = []) {
  const visto: Record<string, unknown> = {};
  const limit = vi.fn(async () => linhas);
  const cadeia = {
    groupBy: vi.fn((...g: unknown[]) => {
      visto.groupBy = g;
      return {
        orderBy: vi.fn((...o: unknown[]) => {
          visto.orderBy = o;
          return { limit };
        }),
      };
    }),
    limit,
  };
  const db = {
    select: vi.fn((f: Record<string, unknown>) => {
      visto.selecao = f;
      return {
        from: vi.fn(() => ({
          where: vi.fn((c: unknown) => {
            visto.where = c;
            return cadeia;
          }),
        })),
      };
    }),
  };
  return { db: db as never, visto, limit };
}

const PROJETO = "11111111-2222-3333-4444-555555555555";

describe("T1 · filtro de data é obrigatório", () => {
  it("recusa a consulta sem filtro de data", () => {
    const s = querySpecSchema.parse({ entity: "trafego", metrics: ["trafego.spend"] });
    expect(() => validarSpec(s)).toThrow(ErroDeQuery);
    expect(() => validarSpec(s)).toThrow(/filtro de data/i);
  });

  it("o erro aponta o campo que faltou, para a tela destacar", () => {
    const s = querySpecSchema.parse({ entity: "trafego", metrics: ["trafego.spend"] });
    try {
      validarSpec(s);
      throw new Error("devia ter recusado");
    } catch (e) {
      expect(e).toBeInstanceOf(ErroDeQuery);
      expect((e as ErroDeQuery).campo).toBe("trafego.date");
    }
  });

  it("um filtro qualquer NÃO substitui o de data", () => {
    const s = querySpecSchema.parse({
      entity: "trafego",
      metrics: ["trafego.spend"],
      filters: { "trafego.campaign": { operator: "$eq", value: "x" } },
    });
    expect(() => validarSpec(s)).toThrow(/filtro de data/i);
  });
});

describe("T2 · os operadores traduzem", () => {
  const valorDe: Record<string, unknown> = {
    $in: ["a", "b"],
    $nin: ["a", "b"],
    $between: ["2026-08-01", "2026-08-31"],
  };

  it.each(OPERADORES)("%s vira condição SQL", async (op) => {
    const { db, visto } = dbFalso();
    await executarQuery(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
          "trafego.campaign": { operator: op, value: valorDe[op] ?? "bbe" },
        },
      }),
      { db, projectIds: [PROJETO] },
    );
    expect(texto(visto.where as SQL).sql).toContain("campaign_name");
  });

  it("$in com lista vazia é erro, não filtro que aceita tudo", async () => {
    const { db } = dbFalso();
    await expect(
      executarQuery(
        spec({
          filters: {
            "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
            "trafego.campaign": { operator: "$in", value: [] },
          },
        }),
        { db, projectIds: [PROJETO] },
      ),
    ).rejects.toThrow(/lista vazia/i);
  });

  it("$between com um valor só é erro", async () => {
    const { db } = dbFalso();
    await expect(
      executarQuery(
        spec({ filters: { "trafego.date": { operator: "$between", value: ["2026-08-01"] } } }),
        { db, projectIds: [PROJETO] },
      ),
    ).rejects.toThrow(/dois valores/i);
  });
});

describe("T3 · campo desconhecido para antes do SQL", () => {
  it("métrica fora do catálogo é recusada sem tocar no db", async () => {
    const { db, visto } = dbFalso();
    await expect(
      executarQuery(spec({ metrics: ["trafego.senha_do_admin"] }), { db, projectIds: [PROJETO] }),
    ).rejects.toThrow(/desconhecido/i);
    expect(visto.selecao).toBeUndefined();
  });

  it("dimensão fora do catálogo é recusada", () => {
    expect(() => planejar(spec({ dimensions: ["users.password"] }))).toThrow(ErroDeQuery);
  });

  it("filtro sobre campo fora do catálogo é recusado", () => {
    expect(() =>
      validarSpec(
        spec({
          filters: {
            "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
            "pg_user.usename": { operator: "$eq", value: "postgres" },
          },
        }),
      ),
    ).toThrow(/desconhecido/i);
  });

  it("métrica usada como dimensão é recusada, e vice-versa", () => {
    expect(() => validarSpec(spec({ dimensions: ["trafego.spend"] }))).toThrow(/é métrica/i);
    expect(() => validarSpec(spec({ metrics: ["trafego.campaign"] }))).toThrow(/é dimensão/i);
  });

  it("campo de outra entidade é recusado com explicação", () => {
    expect(() => validarSpec(spec({ metrics: ["vendas.revenue"] }))).toThrow(/vendas/i);
  });

  it("ordenar por campo fora do resultado é recusado", () => {
    expect(() =>
      validarSpec(spec({ order_by: [{ field: "trafego.reach", direction: "desc" }] })),
    ).toThrow(/sem ele estar no resultado/i);
  });

  it("entidade sem fonte no banco recusa com mensagem, não com resultado vazio", () => {
    const s = querySpecSchema.parse({
      entity: "aplicacoes",
      metrics: ["aplicacoes.count"],
      filters: { "aplicacoes.date": { operator: "$eq", value: "2026-08-01" } },
    });
    expect(() => planejar(s)).toThrow(/planilha/i);
  });

  it("filtrar por métrica é recusado com explicação, não vira HAVING silencioso", () => {
    expect(() =>
      validarSpec(
        spec({
          filters: {
            "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
            "trafego.spend": { operator: "$gt", value: 100 },
          },
        }),
      ),
    ).toThrow(/filtrar por métrica/i);
  });
});

describe("T4 · valor de filtro nunca vira SQL", () => {
  it("aspas e ponto-e-vírgula saem como parâmetro, não como texto na query", async () => {
    const ataque = "'; DROP TABLE meta_ad_insights_daily; --";
    const { db, visto } = dbFalso();
    await executarQuery(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
          "trafego.campaign": { operator: "$eq", value: ataque },
        },
      }),
      { db, projectIds: [PROJETO] },
    );
    const q = texto(visto.where as SQL);
    expect(q.sql).not.toContain("DROP TABLE");
    expect(q.params).toContain(ataque);
  });

  it("o `%` do $ncontains é montado em JS e entra como parâmetro", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(
      spec({
        filters: {
          "trafego.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] },
          "trafego.campaign": { operator: "$ncontains", value: "teste" },
        },
      }),
      { db, projectIds: [PROJETO] },
    );
    const q = texto(visto.where as SQL);
    expect(q.params).toContain("%teste%");
    expect(q.sql).not.toContain("teste");
  });

  it("o projeto entra sempre, mesmo sem filtro pedido", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(spec(), { db, projectIds: [PROJETO] });
    expect(texto(visto.where as SQL).params).toContain(PROJETO);
  });
});

describe("T5 · sem denominador o resultado é null", () => {
  it("razão sem denominador devolve null, não 0", () => {
    expect(razao(10, 0)).toBeNull();
    expect(razao(0, 0)).toBeNull();
    expect(razao(10, 5)).toBe(2);
    expect(razao(2, 1000, 1000)).toBe(2);
  });

  it("CPM de linha sem impressão vem null", async () => {
    const { db } = dbFalso([
      { "trafego.campaign": "sem entrega", "trafego.spend": "12.5", "trafego.impressions": "0" },
      { "trafego.campaign": "rodando", "trafego.spend": "20", "trafego.impressions": "10000" },
    ]);
    const r = await executarQuery(
      spec({ metrics: ["trafego.cpm"], dimensions: ["trafego.campaign"] }),
      { db, projectIds: [PROJETO] },
    );
    expect(r.rows[0]!["trafego.cpm"]).toBeNull();
    expect(r.rows[1]!["trafego.cpm"]).toBe(2);
  });

  it("a derivada é calculada sobre os totais, não sobre média de razões", async () => {
    // Dois dias — 10/1000 (CPM 10) e 10/9000 (CPM ~1,1) — somam 20/10000, e o
    // CPM do período é 2. A média das razões daria ~5,6, que é um número que não
    // existe em lugar nenhum.
    const { db } = dbFalso([{ "trafego.spend": "20", "trafego.impressions": "10000" }]);
    const r = await executarQuery(spec({ metrics: ["trafego.cpm"] }), { db, projectIds: [PROJETO] });
    expect(r.rows[0]!["trafego.cpm"]).toBe(2);
  });

  it("a métrica base ausente vira 0, não null — zero gasto é zero mesmo", async () => {
    const { db } = dbFalso([{ "trafego.spend": null }]);
    const r = await executarQuery(spec(), { db, projectIds: [PROJETO] });
    expect(r.rows[0]!["trafego.spend"]).toBe(0);
  });
});

describe("T6 · limite", () => {
  it("limite acima do teto é CAPADO com aviso, não recusado", async () => {
    const { db, limit } = dbFalso([{ "trafego.campaign": "x", "trafego.spend": "1" }]);
    const r = await executarQuery(spec({ dimensions: ["trafego.campaign"], limit: 99_999 }), {
      db,
      projectIds: [PROJETO],
    });
    expect(limit).toHaveBeenCalledWith(TETO_DE_LINHAS);
    expect(r.avisos.join(" ")).toMatch(/passa do teto/i);
  });

  it("o limite chega ao db e o corte é avisado", async () => {
    const linhas = Array.from({ length: 3 }, (_, i) => ({
      "trafego.campaign": `c${i}`,
      "trafego.spend": "1",
    }));
    const { db, limit } = dbFalso(linhas);
    const r = await executarQuery(spec({ dimensions: ["trafego.campaign"], limit: 3 }), {
      db,
      projectIds: [PROJETO],
    });
    expect(limit).toHaveBeenCalledWith(3);
    expect(r.avisos.join(" ")).toMatch(/cortado/i);
  });

  it("sem dimensão não há group by — é uma linha só", async () => {
    const { db, visto, limit } = dbFalso([{ "trafego.spend": "10" }]);
    await executarQuery(spec(), { db, projectIds: [PROJETO] });
    expect(visto.groupBy).toBeUndefined();
    expect(limit).toHaveBeenCalledWith(1);
  });
});

describe("T7 · granularidade de data", () => {
  it("day não trunca", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(spec({ dimensions: ["trafego.date"] }), { db, projectIds: [PROJETO] });
    expect(texto((visto.groupBy as SQL[])[0]!).sql).not.toContain("date_trunc");
  });

  it.each(["week", "month"] as const)("%s trunca a data, sem conversão de fuso", async (g) => {
    const { db, visto } = dbFalso();
    await executarQuery(spec({ dimensions: ["trafego.date"], date_granularity: g }), {
      db,
      projectIds: [PROJETO],
    });
    const q = texto((visto.groupBy as SQL[])[0]!);
    expect(q.sql).toContain("date_trunc");
    // A coluna é `date`, não `timestamp`: não existe `AT TIME ZONE` aqui, e é de
    // propósito — o dia do relatório é o dia da conta de anúncio, e não tem hora
    // de virada para o horário de verão deslocar.
    expect(q.sql).not.toContain("TIME ZONE");
    expect(q.params).toContain(g);
  });

  it("a granularidade não trunca dimensão que não é data", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(spec({ dimensions: ["trafego.campaign"], date_granularity: "month" }), {
      db,
      projectIds: [PROJETO],
    });
    expect(texto((visto.groupBy as SQL[])[0]!).sql).not.toContain("date_trunc");
  });
});

describe("ordenação", () => {
  it("ordenar por derivada usa a razão no banco, para o top-N cortar certo", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(
      spec({
        metrics: ["trafego.cpm"],
        dimensions: ["trafego.campaign"],
        order_by: [{ field: "trafego.cpm", direction: "desc" }],
      }),
      { db, projectIds: [PROJETO] },
    );
    const q = texto((visto.orderBy as SQL[])[0]!);
    expect(q.sql).toContain("NULLIF");
    expect(q.sql).toContain("NULLS LAST");
  });

  it("sem order_by, ordena pela primeira métrica", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(spec({ metrics: ["trafego.spend"], dimensions: ["trafego.campaign"] }), {
      db,
      projectIds: [PROJETO],
    });
    expect(texto((visto.orderBy as SQL[])[0]!).sql).toContain("spend");
  });
});

describe("resultado", () => {
  it("as colunas vêm com rótulo e tipo, na ordem dimensões → métricas", async () => {
    const { db } = dbFalso([{ "trafego.campaign": "x", "trafego.spend": "1" }]);
    const r = await executarQuery(spec({ dimensions: ["trafego.campaign"] }), {
      db,
      projectIds: [PROJETO],
    });
    expect(r.columns.map((c) => c.key)).toEqual(["trafego.campaign", "trafego.spend"]);
    expect(r.columns[0]!.label).toBeTruthy();
    expect(r.columns[1]!.semanticType).toBe("currency");
  });

  it("a métrica só declarada no catálogo, sem tradução, recusa com o rótulo dela", () => {
    expect(() => planejar(spec({ metrics: ["trafego.cpl_atribuido"] }))).toThrow(
      /ainda não sei calcular/i,
    );
  });
});

describe("as outras entidades do banco", () => {
  it("vendas prende a consulta ao projeto pelo caminho etapa → funil → projeto", async () => {
    const { db, visto } = dbFalso([{ "vendas.revenue": "1500", "vendas.count": "3" }]);
    const r = await executarQuery(
      querySpecSchema.parse({
        entity: "vendas",
        metrics: ["vendas.revenue", "vendas.ticket_por_venda"],
        filters: { "vendas.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] } },
      }),
      { db, projectIds: [PROJETO] },
    );
    const q = texto(visto.where as SQL);
    expect(q.sql).toContain("funnel_stages");
    expect(q.params).toContain(PROJETO);
    expect(r.rows[0]!["vendas.ticket_por_venda"]).toBe(500);
  });

  it("a data da venda é convertida para o fuso de São Paulo pelo nome IANA", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(
      querySpecSchema.parse({
        entity: "vendas",
        metrics: ["vendas.count"],
        dimensions: ["vendas.date"],
        filters: { "vendas.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] } },
      }),
      { db, projectIds: [PROJETO] },
    );
    const q = texto((visto.groupBy as SQL[])[0]!);
    expect(q.sql).toContain("AT TIME ZONE");
    // O nome IANA entra como parâmetro. Offset fixo (`-03:00`) erraria o dia na
    // virada do horário de verão, e o erro apareceria como venda no dia anterior.
    expect(q.params).toContain(FUSO);
    expect(q.sql).not.toContain("-03:00");
  });

  it("o filtro de data da venda usa a MESMA expressão local do agrupamento", async () => {
    // Se o filtro usasse a coluna crua e o agrupamento a data local, o recorte e
    // o eixo discordariam na virada do dia — e o total não bateria com a soma.
    const { db, visto } = dbFalso();
    await executarQuery(
      querySpecSchema.parse({
        entity: "vendas",
        metrics: ["vendas.count"],
        filters: { "vendas.date": { operator: "$between", value: ["2026-08-01", "2026-08-26"] } },
      }),
      { db, projectIds: [PROJETO] },
    );
    expect(texto(visto.where as SQL).sql).toContain("AT TIME ZONE");
  });

  it("grupos consulta os snapshots do funil do projeto", async () => {
    const { db, visto } = dbFalso([{ "grupos.participantes": "820" }]);
    const r = await executarQuery(
      querySpecSchema.parse({
        entity: "grupos",
        metrics: ["grupos.participantes"],
        filters: { "grupos.date": { operator: "$gte", value: "2026-08-01" } },
      }),
      { db, projectIds: [PROJETO] },
    );
    expect(texto(visto.where as SQL).sql).toContain("funnels");
    expect(r.rows[0]!["grupos.participantes"]).toBe(820);
  });
});

describe("escopo consolidado", () => {
  const OUTRO = "22222222-3333-4444-5555-666666666666";

  it("mais de um projeto entra na MESMA condição de escopo", async () => {
    const { db, visto } = dbFalso();
    await executarQuery(spec(), { db, projectIds: [PROJETO, OUTRO] });
    const q = texto(visto.where as SQL);
    expect(q.params).toContain(PROJETO);
    expect(q.params).toContain(OUTRO);
  });

  it("a lista de projetos entra parametrizada, nunca colada no SQL", async () => {
    // O escopo é a única coisa que separa um projeto do outro: se ela virasse
    // texto concatenado, seria o pior lugar possível para uma injeção.
    const { db, visto } = dbFalso();
    await executarQuery(spec(), { db, projectIds: [PROJETO, OUTRO] });
    expect(texto(visto.where as SQL).sql).not.toContain(PROJETO);
  });

  it("vendas e grupos também aceitam a lista, pelo caminho do funil", async () => {
    for (const entity of ["vendas", "grupos"] as const) {
      const { db, visto } = dbFalso();
      await executarQuery(
        querySpecSchema.parse({
          entity,
          metrics: [entity === "vendas" ? "vendas.count" : "grupos.participantes"],
          filters: { [`${entity}.date`]: { operator: "$gte", value: "2026-08-01" } },
        }),
        { db, projectIds: [PROJETO, OUTRO] },
      );
      const q = texto(visto.where as SQL);
      expect(q.params).toContain(OUTRO);
      expect(q.sql).toMatch(/IN \(/);
    }
  });

  it("a dimensão Projeto existe nas entidades de banco e sai como nome", async () => {
    for (const [entity, metrica] of [
      ["trafego", "trafego.spend"],
      ["vendas", "vendas.count"],
      ["grupos", "grupos.participantes"],
    ] as const) {
      const { db, visto } = dbFalso();
      await executarQuery(
        querySpecSchema.parse({
          entity,
          metrics: [metrica],
          dimensions: [`${entity}.projeto`],
          filters: { [`${entity}.date`]: { operator: "$gte", value: "2026-08-01" } },
        }),
        { db, projectIds: [PROJETO] },
      );
      const q = texto((visto.groupBy as SQL[])[0]!);
      // Subconsulta escalar, não join: o executor monta consulta de uma tabela.
      expect(q.sql.toLowerCase()).toContain("select");
      expect(q.sql.toLowerCase()).toContain("name");
    }
  });

  it("agrupar por projeto num escopo de um projeto só não é erro — é uma linha", async () => {
    const { db } = dbFalso([{ "trafego.projeto": "BBE", "trafego.spend": "10" }]);
    const r = await executarQuery(
      spec({ dimensions: ["trafego.projeto"] }),
      { db, projectIds: [PROJETO] },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.columns[0]!.label).toBe("Projeto");
  });
});
