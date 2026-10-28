import { describe, it, expect, vi } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 18.99 (AC5) — status e campanha de cada anúncio para a coluna Status
 * do "Desempenho por LP" do perpétuo.
 *
 * O banco é falso, mas registra o que cada leitura pediu: `select` =
 * `meta_entity_names_cache`, `selectDistinctOn` = `meta_ad_insights_daily`.
 * `eq`, `inArray` e `desc` viram marcadores, para que tirar o filtro de projeto,
 * o de ad_id ou a ordem por data derrube um teste (QA 18.99 TST-001).
 *
 * Cada teste diz a mutação que derruba.
 */

vi.mock("drizzle-orm", async (importOriginal) => {
  const real = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...real,
    and: (...conds: unknown[]) => ({ __and: conds }),
    eq: (_col: unknown, valor: unknown) => ({ __eq: valor }),
    inArray: (_col: unknown, valores: unknown[]) => ({ __in: valores }),
    desc: (_col: unknown) => ({ __desc: true }),
  };
});

const { statusECampanhaDosAnuncios } = await import("../services/traffic-analytics.js");

interface Pedido {
  where?: { __and: unknown[] };
  orderBy?: unknown[];
}

function bancoFalso(
  status: Array<{ entityId: string; effectiveStatus: string | null }>,
  campanhas: Array<{ adId: string; campaignId: string | null; campaignName: string | null }>,
) {
  const pedidos: { status: Pedido[]; campanhas: Pedido[] } = { status: [], campanhas: [] };
  const db = {
    select: () => {
      const p: Pedido = {};
      pedidos.status.push(p);
      return {
        from: () => ({
          where: (w: Pedido["where"]) => {
            p.where = w;
            return Promise.resolve(status);
          },
        }),
      };
    },
    selectDistinctOn: () => {
      const p: Pedido = {};
      pedidos.campanhas.push(p);
      return {
        from: () => ({
          where: (w: Pedido["where"]) => {
            p.where = w;
            return {
              orderBy: (...o: unknown[]) => {
                p.orderBy = o;
                return Promise.resolve(campanhas);
              },
            };
          },
        }),
      };
    },
  } as unknown as Database;
  return { db, pedidos };
}

describe("Story 18.99 — status por anúncio (AC5)", () => {
  it("ACTIVE vira active e qualquer outro status conhecido vira paused", async () => {
    // Mutação "status não vazio = active" → CAMPAIGN_PAUSED e PAUSED viram active.
    const { db } = bancoFalso(
      [
        { entityId: "1", effectiveStatus: "ACTIVE" },
        { entityId: "2", effectiveStatus: "CAMPAIGN_PAUSED" },
        { entityId: "3", effectiveStatus: "PAUSED" },
        { entityId: "4", effectiveStatus: "DISAPPROVED" },
      ],
      [],
    );
    const r = await statusECampanhaDosAnuncios(db, "p", ["1", "2", "3", "4"]);
    expect(r.statusByAdId).toEqual({ 1: "active", 2: "paused", 3: "paused", 4: "paused" });
  });

  it("anúncio sem status no cache fica FORA do mapa (\"—\"), nunca paused", async () => {
    // Mutação "ausente = paused" → o 9 aparece como paused.
    const { db } = bancoFalso([{ entityId: "1", effectiveStatus: "ACTIVE" }, { entityId: "8", effectiveStatus: null }], []);
    const r = await statusECampanhaDosAnuncios(db, "p", ["1", "8", "9"]);
    expect(r.statusByAdId).toEqual({ 1: "active" });
  });
});

describe("Story 18.99 — campanha por anúncio (AC5, QA REQ-001)", () => {
  it("devolve id e nome; anúncio sem campaign_id fica de fora; nome nulo vira vazio", async () => {
    const { db } = bancoFalso(
      [],
      [
        { adId: "1", campaignId: "c1", campaignName: "camp-A" },
        { adId: "2", campaignId: "c2", campaignName: null },
        { adId: "3", campaignId: null, campaignName: "sem-id" },
      ],
    );
    const r = await statusECampanhaDosAnuncios(db, "p", ["1", "2", "3"]);
    expect(r.campanhaByAdId).toEqual({ 1: { campaignId: "c1", nome: "camp-A" }, 2: { campaignId: "c2", nome: "" } });
  });

  it("uma linha por anúncio, a mais recente: ordena por ad_id e data DESC", async () => {
    // Mutação "sem o orderBy por data" → a escolha volta para o plano do Postgres.
    const { db, pedidos } = bancoFalso([], []);
    await statusECampanhaDosAnuncios(db, "p", ["1"]);
    expect(pedidos.campanhas).toHaveLength(1);
    expect(pedidos.campanhas[0].orderBy).toHaveLength(2);
    expect(pedidos.campanhas[0].orderBy?.[1]).toEqual({ __desc: true });
  });
});

describe("Story 18.99 — as duas leituras filtram por projeto e pelos anúncios (QA TST-001)", () => {
  it("status e campanha pedem só o projeto e os ad_ids recebidos, sem repetidos nem vazios", async () => {
    // Mutação "sem o filtro de projeto" ou "sem o inArray" → o marcador some.
    const { db, pedidos } = bancoFalso([], []);
    await statusECampanhaDosAnuncios(db, "proj-1", ["1", "2", "1", ""]);
    for (const p of [...pedidos.status, ...pedidos.campanhas]) {
      expect(p.where?.__and).toContainEqual({ __eq: "proj-1" });
      expect(p.where?.__and).toContainEqual({ __in: ["1", "2"] });
    }
    expect(pedidos.status).toHaveLength(1);
    expect(pedidos.campanhas).toHaveLength(1);
  });

  it("sem ad_ids, devolve mapas vazios sem nenhuma leitura", async () => {
    const { db, pedidos } = bancoFalso([], []);
    expect(await statusECampanhaDosAnuncios(db, "p", ["", ""])).toEqual({ statusByAdId: {}, campanhaByAdId: {} });
    expect(pedidos.status.length + pedidos.campanhas.length).toBe(0);
  });
});

describe("Story 18.99 — o fio da rota (AC5)", () => {
  it("`/ad-link-urls` lê status e campanha em paralelo com o cache de criativos e devolve os dois campos", async () => {
    const { readFileSync } = await import("node:fs");
    const rota = readFileSync(new URL("../routes/traffic-analytics.ts", import.meta.url), "utf8");
    expect(rota).toMatch(
      /const \[rows, \{ statusByAdId, campanhaByAdId \}\] = await Promise\.all\(\[[\s\S]{0,600}statusECampanhaDosAnuncios\(fastify\.db, paramResult\.data\.projectId, adIds\),\s*\]\);/,
    );
    expect(rota).toMatch(/refreshMotivo: refresh\.motivo,[\s\S]{0,200}statusByAdId,\s*campanhaByAdId,\s*\};/);
  });
});
