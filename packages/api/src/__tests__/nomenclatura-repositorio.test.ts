/**
 * Story 47.1 — o que as CONSULTAS fazem, olhando o predicado que o Drizzle
 * monta (não o resultado de um mock que devolve `[]`).
 *
 * `feedback_mocked_db_idor_test`: mock que responde vazio prova que a rota
 * lida com vazio, não que o filtro existe. Aqui o `db` falso captura o `where`
 * e o teste renderiza o SQL com o dialeto do Postgres.
 */
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { criarRepositorio } from "../services/nomenclatura/repositorio.js";

const dialeto = new PgDialect();
const sqlDe = (x: unknown) => (x ? dialeto.sqlToQuery(x as SQL) : { sql: "", params: [] as unknown[] });

type Registro = { tipo: "select" | "insert" | "update" | "delete"; where?: unknown; valores?: unknown; groupBy?: unknown; tabela?: unknown };

function fakeDb(respostas: unknown[][] = []) {
  const registros: Registro[] = [];
  const proximo = async () => respostas.shift() ?? [];
  const cadeia = (reg: Registro): Record<string, unknown> => {
    const eu: Record<string, unknown> = {
      from: vi.fn(() => cadeia(reg)),
      where: vi.fn((w: unknown) => {
        reg.where = w;
        return cadeia(reg);
      }),
      groupBy: vi.fn((g: unknown) => {
        reg.groupBy = g;
        return cadeia(reg);
      }),
      orderBy: vi.fn(() => cadeia(reg)),
      limit: vi.fn(() => cadeia(reg)),
      returning: vi.fn(async () => [{ id: "novo", ...(reg.valores as object) }]),
      onConflictDoNothing: vi.fn(() => cadeia(reg)),
      set: vi.fn((v: unknown) => {
        reg.valores = v;
        return cadeia(reg);
      }),
      values: vi.fn((v: unknown) => {
        reg.valores = v;
        return cadeia(reg);
      }),
      then: (ok: (v: unknown) => void, falhou: (e: unknown) => void) => proximo().then(ok, falhou),
    };
    return eu;
  };
  const db = {
    select: vi.fn(() => {
      const reg: Registro = { tipo: "select" };
      registros.push(reg);
      return cadeia(reg);
    }),
    insert: vi.fn((tabela: unknown) => {
      const reg: Registro = { tipo: "insert", tabela };
      registros.push(reg);
      return cadeia(reg);
    }),
    update: vi.fn((tabela: unknown) => {
      const reg: Registro = { tipo: "update", tabela };
      registros.push(reg);
      return cadeia(reg);
    }),
    delete: vi.fn((tabela: unknown) => {
      const reg: Registro = { tipo: "delete", tabela };
      registros.push(reg);
      return cadeia(reg);
    }),
  };
  return { db: db as never, registros };
}

const EXPERT = "10000000-0000-4000-8000-000000000001";

describe("unicidade e sugestão INCLUEM inativos (regra 4)", () => {
  it("ofertas.porCode filtra expert + code e NÃO filtra active", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).ofertas.porCode(EXPERT, "of02");
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"expert_id" = ');
    expect(sql).toContain('"code" = ');
    expect(sql).not.toContain("active");
    expect(params).toEqual([EXPERT, "of02"]);
  });
  it("funis.codigos lê todos os códigos do expert, ativos ou não", async () => {
    const { db, registros } = fakeDb([[{ code: "a01" }, { code: "a02" }]]);
    const codigos = await criarRepositorio(db).funis.codigos(EXPERT);
    expect(codigos).toEqual(["a01", "a02"]);
    expect(sqlDe(registros[0].where).sql).not.toContain("active");
  });
  it("lps.codigos casa os quatro ids da combinação e não filtra active", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).lps.codigos({ expertId: "e", productId: "p", funnelId: "f", offerId: "o" });
    const { sql, params } = sqlDe(registros[0].where);
    for (const c of ["expert_id", "product_id", "funnel_id", "offer_id"]) expect(sql).toContain(`"${c}" = `);
    expect(sql).not.toContain("active");
    expect(params).toEqual(["e", "p", "f", "o"]);
  });
  it("dicionario.porValor casa type + value e não filtra active", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).dicionario.porValor("format", "carrossel");
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"type" = ');
    expect(sql).toContain('"value" = ');
    expect(sql).not.toContain("active");
    expect(params).toEqual(["format", "carrossel"]);
  });
});

describe("listagem: 'Mostrar inativos' é o único lugar que decide o filtro", () => {
  it("inativos=false → where inclui active = true", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).ofertas.listar(EXPERT, false);
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"active" = ');
    expect(params).toEqual([EXPERT, true]);
  });
  it("inativos=true → where sem active", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).ofertas.listar(EXPERT, true);
    expect(sqlDe(registros[0].where).sql).not.toContain("active");
  });
  it("sem expert e com inativos → where vazio (lista tudo)", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).funis.listar(undefined, true);
    expect(registros[0].where).toBeUndefined();
  });
});

describe("'usado em N campanhas'", () => {
  it("por FK: conta naming_campaigns pela coluna certa", async () => {
    const { db, registros } = fakeDb([[{ n: 4 }]]);
    const n = await criarRepositorio(db).campanhasQueUsam("offerId", "o1");
    expect(n).toBe(4);
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"offer_id" = ');
    expect(params).toEqual(["o1"]);
  });
  it("valor fixo: conta pelo TEXTO na coluna do tipo (o nome guarda texto, não FK)", async () => {
    const { db, registros } = fakeDb([[{ n: 2 }]]);
    const n = await criarRepositorio(db).campanhasComValor("format", "videos");
    expect(n).toBe(2);
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"format" = ');
    expect(params).toEqual(["videos"]);
  });
  it("mapa por FK agrupa pela coluna", async () => {
    const { db, registros } = fakeDb([[{ id: "a", n: "3" }, { id: null, n: "9" }]]);
    const mapa = await criarRepositorio(db).usoPorFk("landingPageId");
    expect(mapa.get("a")).toBe(3);
    expect(mapa.has("null")).toBe(false);
    // `groupBy` recebe a COLUNA, não um SQL — o nome dela é o que interessa.
    expect((registros[0].groupBy as { name: string }).name).toBe("landing_page_id");
  });
});

describe("toda escrita deixa changelog (regra 7)", () => {
  it("inserir grava a linha e depois o changelog `create` com author", async () => {
    const { db, registros } = fakeDb();
    const r = criarRepositorio(db);
    await r.inserir("ofertas", { expertId: EXPERT, code: "of03", description: "x" }, "user-1");
    const inserts = registros.filter((x) => x.tipo === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[1].valores).toMatchObject({ entity: "naming_offers", entityId: "novo", action: "create", author: "user-1", before: null });
  });
  it("atualizar guarda before/after e alternarAtivo usa deactivate/reactivate", async () => {
    const { db, registros } = fakeDb();
    const r = criarRepositorio(db);
    const antes = { id: "o1", expertId: EXPERT, code: "of01", description: "velha", startedAt: "2026-01-01", active: true, createdAt: new Date(), updatedAt: new Date() };
    await r.atualizar("ofertas", antes, { description: "nova" }, "user-1");
    await r.alternarAtivo("ofertas", antes, false, "user-1");
    const changelog = registros.filter((x) => x.tipo === "insert").map((x) => x.valores as Record<string, unknown>);
    expect(changelog[0]).toMatchObject({ action: "update", author: "user-1" });
    expect((changelog[0].before as Record<string, unknown>).description).toBe("velha");
    expect((changelog[0].after as Record<string, unknown>).description).toBe("nova");
    expect(changelog[1]).toMatchObject({ action: "deactivate" });
    const updates = registros.filter((x) => x.tipo === "update");
    expect(sqlDe(updates[0].where).params).toEqual(["o1"]);
  });
  it("excluir apaga pela pk e registra `delete` com before", async () => {
    const { db, registros } = fakeDb();
    const r = criarRepositorio(db);
    await r.excluir("funis", { id: "f1", expertId: EXPERT, code: "a01", description: "d", startedAt: "2026-01-01", active: true, createdAt: new Date(), updatedAt: new Date() }, null);
    const del = registros.find((x) => x.tipo === "delete")!;
    expect(sqlDe(del.where).params).toEqual(["f1"]);
    const log = registros.find((x) => x.tipo === "insert")!.valores as Record<string, unknown>;
    expect(log).toMatchObject({ entity: "naming_funnels", action: "delete", after: null });
    expect((log.before as Record<string, unknown>).code).toBe("a01");
  });
});
