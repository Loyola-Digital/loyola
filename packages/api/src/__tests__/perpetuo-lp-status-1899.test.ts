import { describe, it, expect } from "vitest";
import type { Database } from "../db/client.js";
import { statusECampanhaDosAnuncios } from "../services/traffic-analytics.js";

/**
 * Story 18.99 (AC5) — status e campanha de cada anúncio para a coluna Status
 * do "Desempenho por LP" do perpétuo. O banco é falso, mas devolve só o que as
 * duas leituras pediriam: `select` = `meta_entity_names_cache`, `selectDistinct`
 * = `meta_ad_insights_daily`.
 *
 * Cada teste diz a mutação que derruba.
 */

function bancoFalso(
  status: Array<{ entityId: string; effectiveStatus: string | null }>,
  campanhas: Array<{ adId: string; campaignName: string | null }>,
) {
  const chamadas = { select: 0, selectDistinct: 0 };
  const db = {
    select: () => {
      chamadas.select++;
      return { from: () => ({ where: () => Promise.resolve(status) }) };
    },
    selectDistinct: () => {
      chamadas.selectDistinct++;
      return { from: () => ({ where: () => Promise.resolve(campanhas) }) };
    },
  } as unknown as Database;
  return { db, chamadas };
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

describe("Story 18.99 — campanha por anúncio (AC5)", () => {
  it("um nome por anúncio; renomeada fica com o primeiro; sem nome fica de fora", async () => {
    const { db } = bancoFalso(
      [],
      [
        { adId: "1", campaignName: "camp-A" },
        { adId: "1", campaignName: "camp-A-renomeada" },
        { adId: "2", campaignName: "camp-B" },
        { adId: "3", campaignName: null },
      ],
    );
    const r = await statusECampanhaDosAnuncios(db, "p", ["1", "2", "3"]);
    expect(r.campanhaByAdId).toEqual({ 1: "camp-A", 2: "camp-B" });
  });
});

describe("Story 18.99 — lista vazia não consulta o banco", () => {
  it("sem ad_ids, devolve mapas vazios sem nenhuma leitura", async () => {
    const { db, chamadas } = bancoFalso([], []);
    expect(await statusECampanhaDosAnuncios(db, "p", ["", ""])).toEqual({ statusByAdId: {}, campanhaByAdId: {} });
    expect(chamadas).toEqual({ select: 0, selectDistinct: 0 });
  });
});

describe("Story 18.99 — o fio da rota (AC5)", () => {
  it("`/ad-link-urls` devolve os dois campos, lidos pela função de serviço", async () => {
    const { readFileSync } = await import("node:fs");
    const rota = readFileSync(new URL("../routes/traffic-analytics.ts", import.meta.url), "utf8");
    expect(rota).toMatch(
      /const \{ statusByAdId, campanhaByAdId \} = await statusECampanhaDosAnuncios\(\s*fastify\.db,\s*paramResult\.data\.projectId,\s*adIds,\s*\);/,
    );
    expect(rota).toMatch(/refreshMotivo: refresh\.motivo,[\s\S]{0,200}statusByAdId,\s*campanhaByAdId,\s*\};/);
  });
});
