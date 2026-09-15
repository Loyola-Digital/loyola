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
      offset: vi.fn(() => cadeia(reg)),
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

// ─────────────── Story 47.4: lacunas da matriz (predicados que faltavam) ───────────────

describe("AC 1 (servidor): as listas filtram pelo expert pedido", () => {
  it("produtos.listar(expertId, false) → expert_id = $1 AND active = true", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).produtos.listar(EXPERT, false);
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"expert_id" = ');
    expect(sql).toContain('"active" = ');
    expect(params).toEqual([EXPERT, true]);
  });
  it("funis.listar(expertId, false) idem", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).funis.listar(EXPERT, false);
    expect(sqlDe(registros[0].where).params).toEqual([EXPERT, true]);
  });
  it("lps.listar pela combinação inteira (AC 7/9 da spec: LP é da combinação)", async () => {
    const { db, registros } = fakeDb();
    await criarRepositorio(db).lps.listar({ expertId: "e", productId: "p", funnelId: "f", offerId: "o" }, false);
    const { sql, params } = sqlDe(registros[0].where);
    for (const c of ["expert_id", "product_id", "funnel_id", "offer_id", "active"]) expect(sql).toContain(`"${c}" = `);
    expect(params).toEqual(["e", "p", "f", "o", true]);
  });
});

describe("Story 47.3: campanhas.listar — filtros vão para o SQL, não para a memória", () => {
  it("busca no nome é ILIKE com %q%; ano e expert entram como igualdade", async () => {
    const { db, registros } = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(db).campanhas.listar({ expertId: EXPERT, year: "2026", q: "churrasco", limit: 50, offset: 0 });
    const { sql, params } = sqlDe(registros[0].where);
    expect(sql).toContain('"expert_id" = ');
    expect(sql).toContain('"year" = ');
    expect(sql).toMatch(/"name" ilike /);
    expect(params).toEqual([EXPERT, "2026", "%churrasco%"]);
    // a contagem usa o MESMO predicado
    expect(sqlDe(registros[1].where).params).toEqual([EXPERT, "2026", "%churrasco%"]);
  });
  it("publicada=true → published_at IS NOT NULL; publicada=false → IS NULL; sem filtro → sem where", async () => {
    const a = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(a.db).campanhas.listar({ publicada: true, limit: 10, offset: 0 });
    expect(sqlDe(a.registros[0].where).sql).toMatch(/"published_at" is not null/);
    const b = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(b.db).campanhas.listar({ publicada: false, limit: 10, offset: 0 });
    expect(sqlDe(b.registros[0].where).sql).toMatch(/"published_at" is null/);
    const c = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(c.db).campanhas.listar({ limit: 10, offset: 0 });
    expect(c.registros[0].where).toBeUndefined();
  });
  it("47.8: metaIdsDoGerador filtra meta_campaign_id IS NOT NULL E origin = gerador (a legada classificada fica fora)", async () => {
    const a = fakeDb([[{ metaCampaignId: "111" }, { metaCampaignId: "222" }]]);
    const ids = await criarRepositorio(a.db).campanhas.metaIdsDoGerador();
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"meta_campaign_id" is not null/);
    expect(q.sql).toMatch(/"origin" = /);
    expect(q.params).toEqual(["gerador"]);
    expect([...ids]).toEqual(["111", "222"]);
  });
  it("47.9: vslVariaveis.porCode filtra expert + type + code SEM active (unicidade inclui inativos); listar filtra active só sem inativos", async () => {
    const a = fakeDb([[]]);
    await criarRepositorio(a.db).vslVariaveis.porCode(EXPERT, "lead", "demissao");
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"expert_id" = /);
    expect(q.sql).toMatch(/"type" = /);
    expect(q.sql).toMatch(/"code" = /);
    expect(q.sql).not.toMatch(/"active"/);
    expect(q.params).toEqual([EXPERT, "lead", "demissao"]);
    const b = fakeDb([[]]);
    await criarRepositorio(b.db).vslVariaveis.listar({ expertId: EXPERT, type: "solution" }, false);
    expect(sqlDe(b.registros[0].where).sql).toMatch(/"active" = /);
    const c = fakeDb([[]]);
    await criarRepositorio(c.db).vslVariaveis.listar({ expertId: EXPERT }, true);
    expect(sqlDe(c.registros[0].where).sql).not.toMatch(/"active"/);
  });
  it("47.9: vslVariaveis.codigos filtra expert + type SEM active (sugestão conta inativos, regra 4)", async () => {
    const a = fakeDb([[{ code: "lead01" }, { code: "lead02" }]]);
    const codes = await criarRepositorio(a.db).vslVariaveis.codigos(EXPERT, "lead");
    expect(codes).toEqual(["lead01", "lead02"]);
    const q = sqlDe(a.registros[0].where);
    expect(q.params).toEqual([EXPERT, "lead"]);
    expect(q.sql).not.toMatch(/"active"/);
  });
  it("47.9: vsls.listar por expert/produto/oferta e ILIKE no nome; porNome é igualdade exata", async () => {
    const a = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(a.db).vsls.listar({ expertId: EXPERT, offerId: "00000000-0000-4000-8000-00000000000f", q: "demissao", limit: 10, offset: 0 });
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"expert_id" = /);
    expect(q.sql).toMatch(/"offer_id" = /);
    expect(q.sql).toMatch(/"name" ilike /);
    expect(q.params).toEqual([EXPERT, "00000000-0000-4000-8000-00000000000f", "%demissao%"]);
    const b = fakeDb([[]]);
    await criarRepositorio(b.db).vsls.porNome("vsl_x");
    expect(sqlDe(b.registros[0].where).params).toEqual(["vsl_x"]);
  });
  it("47.9: usoEmVsls agrupa pela coluna pedida e vslsQueUsam conta pela FK", async () => {
    const a = fakeDb([[{ id: "o1", n: 2 }]]);
    const m = await criarRepositorio(a.db).usoEmVsls("offerId");
    expect(m.get("o1")).toBe(2);
    // groupBy recebe a COLUNA (não um SQL): o nome dela é o que se prova
    expect((a.registros[0].groupBy as { name: string }).name).toBe("offer_id");
    const b = fakeDb([[{ n: 3 }]]);
    expect(await criarRepositorio(b.db).vslsQueUsam("leadId", "l1")).toBe(3);
    expect(sqlDe(b.registros[0].where).sql).toMatch(/"lead_id" = /);
  });
  it("47.10: anuncios.seqsDoExpert lê TODOS os NN do expert (sem filtro de tipo — sequência única); porSeq é expert + seq", async () => {
    const a = fakeDb([[{ id: "a1", creativeSeq: 1 }]]);
    await criarRepositorio(a.db).anuncios.seqsDoExpert(EXPERT);
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"expert_id" = /);
    expect(q.sql).not.toMatch(/creative_type/);
    expect(q.params).toEqual([EXPERT]);
    const b = fakeDb([[]]);
    await criarRepositorio(b.db).anuncios.porSeq(EXPERT, 7);
    expect(sqlDe(b.registros[0].where).params).toEqual([EXPERT, 7]);
  });
  it("47.10: anuncios.listar filtra expert/tipo/sigla/período (ad_date >= e <=) e ILIKE no nome", async () => {
    const a = fakeDb([[], [{ n: 0 }]]);
    await criarRepositorio(a.db).anuncios.listar({ expertId: EXPERT, creativeType: "adv", launchType: "pg", de: "2026-09-01", ate: "2026-12-01", q: "gancho", limit: 10, offset: 0 });
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"ad_date" >= /);
    expect(q.sql).toMatch(/"ad_date" <= /);
    expect(q.sql).toMatch(/"name" ilike /);
    expect(q.params).toEqual([EXPERT, "adv", "pg", "2026-09-01", "2026-12-01", "%gancho%"]);
  });
  it("47.10: usoPorValor/campanhasComValor de creative_type e launch_type contam em naming_ads, não em naming_campaigns", async () => {
    const a = fakeDb([[{ valor: "adv", n: 2 }]]);
    const m = await criarRepositorio(a.db).usoPorValor("creative_type");
    expect(m.get("adv")).toBe(2);
    expect((a.registros[0].groupBy as { name: string }).name).toBe("creative_type");
    const b = fakeDb([[{ n: 1 }]]);
    expect(await criarRepositorio(b.db).campanhasComValor("launch_type", "pg")).toBe(1);
    expect(sqlDe(b.registros[0].where).sql).toMatch(/"launch_type" = /);
  });
  it("47.13: creative_origin conta em naming_ads.origin (nunca em naming_campaigns); o grupo null (ad/carr/padrão antigo) não vira valor", async () => {
    const a = fakeDb([[{ valor: "h", n: 2 }, { valor: null, n: 5 }]]);
    const m = await criarRepositorio(a.db).usoPorValor("creative_origin");
    expect(m.get("h")).toBe(2);
    expect(m.size).toBe(1);
    expect((a.registros[0].groupBy as { name: string }).name).toBe("origin");
    const b = fakeDb([[{ n: 1 }]]);
    expect(await criarRepositorio(b.db).campanhasComValor("creative_origin", "ia")).toBe(1);
    expect(sqlDe(b.registros[0].where).sql).toMatch(/"origin" = /);
    expect(sqlDe(b.registros[0].where).sql).not.toMatch(/naming_campaigns/);
  });
  it("47.13: hook/body em uso — usoEmAnuncios agrupa por hook_id/body_id; anunciosQueUsamParte conta hook_id OU body_id; referências listam os anúncios", async () => {
    const a = fakeDb([[{ id: "H1", n: 3 }, { id: null, n: 9 }]]);
    const r = criarRepositorio(a.db);
    const m = await r.usoEmAnuncios("hook");
    expect(m.get("H1")).toBe(3);
    expect(m.size).toBe(1);
    expect((a.registros[0].groupBy as { name: string }).name).toBe("hook_id");
    const b = fakeDb([[{ n: 2 }]]);
    expect(await criarRepositorio(b.db).anunciosQueUsamParte("H1")).toBe(2);
    const w = sqlDe(b.registros[0].where).sql;
    expect(w).toMatch(/"hook_id" = /);
    expect(w).toMatch(/"body_id" = /);
    expect(w).toMatch(/ or /);
    const c = fakeDb([[{ id: "A1", name: "adv01_h_dg_pg04_h01_b01_09-2026--" }]]);
    expect(await criarRepositorio(c.db).referenciasDe("adPartes", { id: "H1" })).toEqual([{ tipo: "anuncio", id: "A1", rotulo: "adv01_h_dg_pg04_h01_b01_09-2026--" }]);
  });
  it("47.12/47.13: adPartes.codigos lê todos os códigos do (expert, tipo), ativos ou não", async () => {
    const a = fakeDb([[{ code: "h01" }, { code: "h02" }]]);
    expect(await criarRepositorio(a.db).adPartes.codigos(EXPERT, "hook")).toEqual(["h01", "h02"]);
    const q = sqlDe(a.registros[0].where);
    expect(q.sql).toMatch(/"expert_id" = /);
    expect(q.sql).toMatch(/"type" = /);
    expect(q.sql).not.toMatch(/"active"/);
  });
  it("47.8: naoPublicadas é published_at IS NULL — publicada nunca entra no recálculo (regra 6)", async () => {
    const a = fakeDb([[]]);
    await criarRepositorio(a.db).campanhas.naoPublicadas();
    expect(sqlDe(a.registros[0].where).sql).toMatch(/"published_at" is null/);
  });
});

describe("Story 47.3: snapshot — por código, com os pais resolvidos", () => {
  const linhas = {
    experts: [{ id: "e1", code: "bbe", active: true }, { id: "e2", code: "fz", active: false }],
    produtos: [{ id: "p1", expertId: "e1", slug: "churrasco", active: true }],
    funis: [{ id: "f1", expertId: "e1", code: "a01", active: true }],
    ofertas: [{ id: "o1", expertId: "e1", code: "of01", active: true }, { id: "o2", expertId: "e1", code: "of02", active: false }],
    lps: [{ id: "l1", expertId: "e1", productId: "p1", funnelId: "f1", offerId: "o2", code: "lpa", active: true }],
    valores: [{ type: "format", value: "videos", active: true }, { type: "format", value: "estaticos", active: false }],
  };
  const fila = () => [linhas.experts, linhas.produtos, linhas.funis, linhas.ofertas, linhas.lps, linhas.valores];
  it("inativos=false: só ativos, mas a LP de oferta inativa ainda resolve o CÓDIGO da oferta (o pai é lido inteiro)", async () => {
    const { db } = fakeDb(fila());
    const s = await criarRepositorio(db).snapshot(false);
    expect(s.experts).toEqual([{ code: "bbe", active: true }]);
    expect(s.ofertas.map((o) => o.code)).toEqual(["of01"]);
    expect(s.lps).toEqual([{ expert: "bbe", product: "churrasco", funnel: "a01", offer: "of02", code: "lpa", active: true }]);
    expect(s.valores).toEqual([{ type: "format", value: "videos", active: true }]);
  });
  it("inativos=true: tudo, com o flag", async () => {
    const { db } = fakeDb(fila());
    const s = await criarRepositorio(db).snapshot(true);
    expect(s.experts.map((e) => [e.code, e.active])).toEqual([["bbe", true], ["fz", false]]);
    expect(s.ofertas.map((o) => o.code)).toEqual(["of01", "of02"]);
    expect(s.valores).toHaveLength(2);
  });
  it("as seis leituras do snapshot NÃO filtram active no SQL (o filtro é em memória, depois de resolver os pais)", async () => {
    const { db, registros } = fakeDb(fila());
    await criarRepositorio(db).snapshot(false);
    const selects = registros.filter((r) => r.tipo === "select");
    expect(selects).toHaveLength(6);
    for (const r of selects) expect(r.where).toBeUndefined();
  });
});

