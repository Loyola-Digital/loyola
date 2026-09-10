/**
 * Story 47.6 — o mapa `campaign_id → dimensões` e a cobertura de gasto por
 * funil, olhando o SQL que o Drizzle monta (não um mock que devolve vazio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { campanhasDoFunil, coberturaDeGasto, invalidarMapa, mapaDeDimensoes } from "../services/nomenclatura/mapa-de-campanhas.js";

const dialeto = new PgDialect();
const sqlDe = (x: unknown) => (x ? dialeto.sqlToQuery(x as SQL) : { sql: "", params: [] as unknown[] });

function fakeDb(respostas: unknown[][] = []) {
  const registros: { where?: unknown; join?: unknown; groupBy?: unknown }[] = [];
  const proximo = async () => respostas.shift() ?? [];
  const cadeia = (reg: (typeof registros)[number]): Record<string, unknown> => ({
    from: vi.fn(() => cadeia(reg)),
    innerJoin: vi.fn((_t: unknown, on: unknown) => { reg.join = on; return cadeia(reg); }),
    where: vi.fn((w: unknown) => { reg.where = w; return cadeia(reg); }),
    groupBy: vi.fn((g: unknown) => { reg.groupBy = g; return cadeia(reg); }),
    limit: vi.fn(() => cadeia(reg)),
    then: (ok: (v: unknown) => void, ko: (e: unknown) => void) => proximo().then(ok, ko),
  });
  const db = { select: vi.fn(() => { const reg = {}; registros.push(reg); return cadeia(reg); }) };
  return { db: db as never, registros };
}

const campanha = (over: Record<string, unknown> = {}) => ({
  id: "n1", expertId: "e1", productId: "p1", funnelId: "f1", offerId: "o1", offerValue: "of01", year: "2026", temperature: "hot", auction: "cbo", format: "videos",
  landingPageId: null, lpValue: "na", suffix: null, name: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na", publishedAt: null, metaCampaignId: "111", origin: "legado",
  metaCampaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo", notes: null, createdBy: null, createdAt: new Date(), updatedAt: new Date(), ...over,
});

beforeEach(() => invalidarMapa());

describe("mapaDeDimensoes", () => {
  it("junta pelo expert do PROJETO e só traz campanhas com meta_campaign_id", async () => {
    const { db, registros } = fakeDb([[{ c: campanha() }]]);
    const m = await mapaDeDimensoes(db, "proj-1");
    expect(sqlDe(registros[0].join).sql).toMatch(/"project_id" = /);
    expect(sqlDe(registros[0].join).params).toEqual(["proj-1"]);
    expect(sqlDe(registros[0].where).sql).toMatch(/"meta_campaign_id" is not null/);
    expect(m.get("111")).toMatchObject({ expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", temperature: "hot", lp: "na", origin: "legado", name: "bbe_churrasco_a01_of01_2026_hot_cbo_videos_na" });
  });
  it("cache de 60s: segunda chamada não consulta; invalidar volta a consultar", async () => {
    const { db, registros } = fakeDb([[{ c: campanha() }], [{ c: campanha({ metaCampaignId: "222" }) }]]);
    await mapaDeDimensoes(db, "proj-1");
    await mapaDeDimensoes(db, "proj-1");
    expect(registros).toHaveLength(1);
    invalidarMapa("proj-1");
    const m = await mapaDeDimensoes(db, "proj-1");
    expect(registros).toHaveLength(2);
    expect(m.has("222")).toBe(true);
  });
});

describe("campanhasDoFunil e coberturaDeGasto", () => {
  it("união funil + stages, sem duplicar", async () => {
    const { db } = fakeDb([
      [{ projectId: "proj-1", type: "perpetual", campaigns: [{ id: "111", name: "A" }] }],
      [{ campaigns: [{ id: "111", name: "A" }, { id: "222", name: "B" }] }, { campaigns: [{ id: "333", name: "C" }] }],
    ]);
    const f = await campanhasDoFunil(db, "f-1");
    expect(f?.campanhas.map((c) => c.id)).toEqual(["111", "222", "333"]);
  });
  it("cobertura: janela de N dias que termina hoje, gasto com/sem vínculo, maiores sem vínculo primeiro", async () => {
    const { db, registros } = fakeDb([
      [{ projectId: "proj-1", type: "perpetual", campaigns: [{ id: "111", name: "A" }, { id: "222", name: "B" }, { id: "333", name: "C" }] }],
      [],
      // `mapaDeDimensoes` é chamado ao montar o array do Promise.all e consome a fila ANTES do select de gasto.
      [{ c: campanha() }],
      [{ campaignId: "111", spend: "600" }, { campaignId: "222", spend: "300" }, { campaignId: "333", spend: "100" }],
    ]);
    const c = await coberturaDeGasto(db, "f-1", 30, new Date("2026-09-10T12:00:00Z"));
    expect(c).toMatchObject({ campanhas: { total: 3, comVinculo: 1 }, gasto: { total: 1000, comVinculo: 600, semVinculo: 400, pct: 0.6 } });
    expect(c?.maioresSemVinculo.map((x) => x.campaignId)).toEqual(["222", "333"]);
    const { sql, params } = sqlDe(registros[2].where); // o select de gasto é CONSTRUÍDO antes do do mapa (ordem do array), mesmo consumindo a fila depois
    expect(sql).toMatch(/"date_start" >= /);
    expect(params).toContain("2026-08-12"); // 30 dias terminando em 10/09 começam em 12/08
    expect(params).toContain("proj-1");
  });
  it("funil sem campanhas: cobertura vazia, pct null (não zero)", async () => {
    const { db } = fakeDb([[{ projectId: "proj-1", type: "perpetual", campaigns: [] }], []]);
    const c = await coberturaDeGasto(db, "f-1", 30);
    expect(c).toMatchObject({ campanhas: { total: 0, comVinculo: 0 }, gasto: { total: 0, pct: null } });
  });
});
