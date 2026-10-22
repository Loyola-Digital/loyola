import { describe, expect, it } from "vitest";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import { metaAdInsightsDaily, metaCampaignInsightsDaily } from "../db/schema.js";
import { getEntityDailySeries } from "../services/meta-entity-daily.js";
import type { Database } from "../db/client.js";

/**
 * Story 18.91 (AC11, AC12) — a série por entidade traz o LP View do dia, das
 * `actions` já gravadas no cache. É o denominador da Tx Conv. Mídia Paga por LP
 * no Perpétuo.
 */

function bancoFalso(tabelas: Map<unknown, unknown[]>): Database {
  const consulta = (tabela: unknown) => ({ where: async () => tabelas.get(tabela) ?? [] });
  return { select: () => ({ from: consulta }) } as unknown as Database;
}

const acoes = (link: number, lpv?: number) => [
  { action_type: "link_click", value: String(link) },
  ...(lpv === undefined ? [] : [{ action_type: "landing_page_view", value: String(lpv) }]),
];

describe("Story 18.91 — landingPageViews na série por entidade", () => {
  it("por anúncio: soma o landing_page_view das linhas do mesmo anúncio e dia", async () => {
    const db = bancoFalso(
      new Map<unknown, unknown[]>([
        [metaCampaignInsightsDaily, [{ campaignId: "c1", dateStart: "2026-10-01", spend: "30" }]],
        [
          metaAdInsightsDaily,
          [
            { adId: "a1", adName: "A1", adsetId: "s1", dateStart: "2026-10-01", spend: "10", impressions: "100", clicks: "9", actions: acoes(5, 4) },
            { adId: "a1", adName: "A1", adsetId: "s1", dateStart: "2026-10-01", spend: "10", impressions: "100", clicks: "9", actions: acoes(5, 3) },
            { adId: "a2", adName: "A2", adsetId: "s1", dateStart: "2026-10-01", spend: "10", impressions: "100", clicks: "9", actions: acoes(5) },
          ],
        ],
      ]),
    );
    const serie = await getEntityDailySeries(db, "p", "ad", "2026-10-01", "2026-10-01");
    const porAnuncio = Object.fromEntries(serie.rows.map((r) => [r.entityId, r.landingPageViews]));
    expect(porAnuncio).toEqual({ a1: 7, a2: 0 });
  });

  it("por campanha: o mesmo campo, da linha da campanha", async () => {
    const db = bancoFalso(
      new Map<unknown, unknown[]>([
        [
          metaCampaignInsightsDaily,
          [{ campaignId: "c1", dateStart: "2026-10-01", spend: "30", impressions: "1", clicks: "1", actions: acoes(8, 6) }],
        ],
      ]),
    );
    const serie = await getEntityDailySeries(db, "p", "campaign", "2026-10-01", "2026-10-01");
    expect(serie.rows[0].landingPageViews).toBe(6);
  });

  it("o contrato sobe para 55 (campo novo na resposta)", () => {
    // ≥, não ===: a 18.95 subiu para 56 e este teste só garante que o campo da
    // 18.91 não ficou sem bump.
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(55);
  });
});
