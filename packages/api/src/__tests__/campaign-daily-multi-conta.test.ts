import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 (item 7 da T1) — o diário por campanha é DB-first, mas o que
 * falta no cache (e "hoje" vence em 1h) é rebuscado na Meta. A rebusca usava
 * UMA conta: perguntava à conta errada pelas campanhas da outra, voltava vazia
 * e o dia corrente dessas campanhas sumia entre um sync e outro.
 *
 * Cache vazio no banco simulado → toda campanha vai para a rebusca.
 */

const mockFetchIds = vi.fn();
vi.mock("../services/meta-ads.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/meta-ads.js")>();
  return { ...real, fetchCampaignDailyInsightsForIds: (...a: unknown[]) => mockFetchIds(...a) };
});

const { fetchCampaignDailyInsightsForIdsWithCacheEmContas } = await import(
  "../services/meta-insights-cache.js"
);

const upserts: unknown[][] = [];
const db = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  insert: () => ({
    values: (v: unknown[]) => {
      upserts.push(v);
      return { onConflictDoUpdate: () => Promise.resolve() };
    },
  }),
} as unknown as Database;

const ANTIGA = { metaAccountId: "111", accessToken: "tok-a", accountName: "Danilo Gato" };
const NOVA = { metaAccountId: "1728118665260386", accessToken: "tok-b", accountName: "DaniloGatoPerpétuo" };
const HOJE = "2026-10-19";

const linha = (campaign_id: string, spend: string) => ({
  campaign_id,
  date_start: HOJE,
  date_stop: HOJE,
  impressions: "100",
  reach: "90",
  clicks: "5",
  spend,
  ctr: "0",
  cpc: "0",
  cpm: "0",
});

beforeEach(() => {
  mockFetchIds.mockReset();
  upserts.length = 0;
});

describe("fetchCampaignDailyInsightsForIdsWithCacheEmContas (Story 29.83)", () => {
  it("rebusca em CADA conta — o dia de hoje das campanhas da conta nova não some", async () => {
    // A Meta só devolve, em cada conta, as campanhas que são dela.
    mockFetchIds.mockImplementation(async (act: string) =>
      act === "111" ? [linha("c-antiga", "100")] : [linha("52577008819383", "40")],
    );

    const rows = await fetchCampaignDailyInsightsForIdsWithCacheEmContas(
      db,
      "projeto-item7-a",
      [ANTIGA, NOVA],
      ["c-antiga", "52577008819383"],
      1,
      HOJE,
      HOJE,
    );

    expect(mockFetchIds).toHaveBeenCalledWith("111", "tok-a", ["c-antiga", "52577008819383"], 1, HOJE, HOJE);
    expect(mockFetchIds).toHaveBeenCalledWith("1728118665260386", "tok-b", ["c-antiga", "52577008819383"], 1, HOJE, HOJE);
    // A saída é por dia, sem campaign_id (o caller agrega por data): as duas
    // linhas de hoje — 100 da conta antiga + 40 da nova.
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + parseFloat(r.spend), 0)).toBe(140);
    // E as duas foram gravadas no cache para o próximo acesso.
    expect(upserts.flat()).toHaveLength(2);
  });

  it("falha numa conta lança, nomeando a conta — como lançava com uma só", async () => {
    mockFetchIds.mockImplementation(async (act: string) => {
      if (act === "1728118665260386") throw new Error("rate limit");
      return [linha("c-antiga", "100")];
    });

    await expect(
      fetchCampaignDailyInsightsForIdsWithCacheEmContas(
        db,
        "projeto-item7-b",
        [ANTIGA, NOVA],
        ["c-antiga", "52577008819383"],
        1,
        HOJE,
        HOJE,
      ),
    ).rejects.toThrow("DaniloGatoPerpétuo (act_1728118665260386): rate limit");
  });
});
