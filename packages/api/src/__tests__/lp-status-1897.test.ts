import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import {
  montarLpPorAnuncio,
  statusDoAnuncio,
  type LinhaDeAnuncio,
} from "../utils/lp-por-anuncio.js";

/**
 * Story 18.97 — cada anúncio de `lpPorAnuncio` leva o status da Meta (AC5–AC7).
 * Cada teste diz a mutação que derruba.
 */

function linha(ad_id: string, campaign_id: string, spend: number): LinhaDeAnuncio {
  return {
    ad_id,
    campaign_id,
    campaign_name: `camp-${campaign_id}`,
    spend: String(spend),
    impressions: String(spend * 10),
    inline_link_clicks: String(spend),
    actions: [],
  } as LinhaDeAnuncio;
}

const vazio = { vendas: new Map(), ingressos: null };

describe("Story 18.97 — status do anúncio (AC5)", () => {
  it("ACTIVE → active; qualquer outro estado conhecido → paused; sem cache → unknown", () => {
    expect(statusDoAnuncio("ACTIVE")).toBe("active");
    expect(statusDoAnuncio("PAUSED")).toBe("paused");
    // A campanha ou o conjunto pausados já vêm no status do anúncio (P2).
    expect(statusDoAnuncio("CAMPAIGN_PAUSED")).toBe("paused");
    expect(statusDoAnuncio("ADSET_PAUSED")).toBe("paused");
    expect(statusDoAnuncio("PENDING_REVIEW")).toBe("paused");
    // Falta de dado nunca vira "Pausado" (18.61).
    expect(statusDoAnuncio(undefined)).toBe("unknown");
  });

  it("montarLpPorAnuncio lê o mapa da rota, inclusive com o ad_id cru '_123' do Sheets", () => {
    const status = new Map([
      ["111", "ACTIVE"],
      ["_222", "CAMPAIGN_PAUSED"],
    ]);
    const r = montarLpPorAnuncio({
      anuncios: [linha("111", "c1", 10), linha("_222", "c2", 5), linha("333", "c2", 1)],
      campanhas: [],
      campanhasPermitidas: [],
      links: new Map(),
      vendas: vazio,
      status,
    });
    const porId = Object.fromEntries(r.anuncios.map((a) => [a.adId, a.status]));
    expect(porId).toEqual({ "111": "active", "222": "paused", "333": "unknown" });
  });

  it("sem o mapa, todos ficam unknown — nunca paused", () => {
    const r = montarLpPorAnuncio({
      anuncios: [linha("111", "c1", 10)],
      campanhas: [],
      campanhasPermitidas: [],
      links: new Map(),
      vendas: vazio,
    });
    expect(r.anuncios[0].status).toBe("unknown");
  });
});

describe("Story 18.97 — o fio, o cache e o contrato (AC5–AC7)", () => {
  const rota = readFileSync(new URL("../routes/stage-creative-performance.ts", import.meta.url), "utf8");

  it("a rota passa o MESMO statusByAdId dos Criativos — sem consulta nova", () => {
    expect(rota).toMatch(/montarLpPorAnuncio\(\{[\s\S]*?status: statusByAdId,[\s\S]*?\}\);/);
    // Uma leitura só do effective_status na rota.
    expect(rota.match(/getAdEffectiveStatusFromDb\(/g)?.length).toBe(1);
  });

  it("o cache da rota subiu para :v6 (sem isso, 2 h de coluna em —)", async () => {
    const { VERSAO_DO_CACHE_CREATIVE_PERFORMANCE } = await import("../routes/stage-creative-performance.js");
    expect(Number(VERSAO_DO_CACHE_CREATIVE_PERFORMANCE.slice(1))).toBeGreaterThanOrEqual(6);
  });

  it("o contrato subiu para 58", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(58);
  });
});
