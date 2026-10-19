import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 — o sync histórico das campanhas recém-vinculadas mandava o UUID
 * de `meta_ads_accounts` (coluna `funnels.meta_account_id`) no lugar do número
 * `act_` da conta: `/act_<uuid>/insights` falhava sempre, calado. E usava o
 * token da "primeira" conta do `.limit(1)`.
 */

const mockContas = vi.fn();
vi.mock("../services/traffic-analytics.js", () => ({
  getAllMetaAccountsForProject: (...a: unknown[]) => mockContas(...a),
}));

const mockTrigger = vi.fn();
vi.mock("../services/meta-insights-cache.js", () => ({
  triggerBackgroundSyncForNewCampaigns: (...a: unknown[]) => mockTrigger(...a),
}));

const { sincronizarHistoricoDasCampanhasNovas } = await import("../services/meta-sync-campanhas-novas.js");

const db = {} as Database;
const PROJ = "p1";
const ANTIGA = { id: "a0000000-0000-4000-8000-00000000000a", accountName: "Danilo Gato", metaAccountId: "111", accessToken: "tok-a" };
const NOVA = { id: "b0000000-0000-4000-8000-00000000000b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", accessToken: "tok-b" };

beforeEach(() => {
  mockContas.mockReset();
  mockTrigger.mockReset();
});

describe("sincronizarHistoricoDasCampanhasNovas", () => {
  it("pede a cada conta com o act_ e o token DELA — nunca o UUID", async () => {
    mockContas.mockResolvedValue([ANTIGA, NOVA]);

    const n = await sincronizarHistoricoDasCampanhasNovas(db, PROJ, ["c1", "c2"]);

    expect(n).toBe(2);
    expect(mockTrigger.mock.calls).toEqual([
      [db, PROJ, "111", "tok-a", ["c1", "c2"]],
      [db, PROJ, "1728118665260386", "tok-b", ["c1", "c2"]],
    ]);
    for (const call of mockTrigger.mock.calls) {
      expect(call[2]).toMatch(/^\d+$/);
    }
  });

  it("sem campanha nova não consulta nada", async () => {
    expect(await sincronizarHistoricoDasCampanhasNovas(db, PROJ, [])).toBe(0);
    expect(mockContas).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("expert sem conta Meta: nenhum pedido", async () => {
    mockContas.mockResolvedValue([]);
    expect(await sincronizarHistoricoDasCampanhasNovas(db, PROJ, ["c1"])).toBe(0);
    expect(mockTrigger).not.toHaveBeenCalled();
  });
});
