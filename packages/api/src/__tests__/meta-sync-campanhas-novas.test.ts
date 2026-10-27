import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 — o sync histórico das campanhas recém-vinculadas mandava o UUID
 * de `meta_ads_accounts` (coluna `funnels.meta_account_id`) no lugar do número
 * `act_` da conta: `/act_<uuid>/insights` falhava sempre, calado. E usava o
 * token da "primeira" conta do `.limit(1)`.
 *
 * QA 29.83 REL-001: a 1ª correção disparava uma chamada por conta, em paralelo,
 * e as duas colidiam no `singleFlight` (a chave não tinha a conta) — só a 1ª
 * conta era consultada. Por isso este teste usa o cache REAL e simula só a
 * Meta: a colisão mora uma camada abaixo do disparo.
 */

const chamadas: Array<{ act: string; token: string; ids: string[] }> = [];
vi.mock("../services/meta-ads.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/meta-ads.js")>();
  return {
    ...real,
    fetchCampaignDailyInsightsForIds: async (act: string, token: string, ids: string[]) => {
      chamadas.push({ act, token, ids });
      await new Promise((r) => setTimeout(r, 30));
      return [];
    },
  };
});

const mockContas = vi.fn();
vi.mock("../services/traffic-analytics.js", () => ({
  getAllMetaAccountsForProject: (...a: unknown[]) => mockContas(...a),
}));

const { sincronizarHistoricoDasCampanhasNovas } = await import("../services/meta-sync-campanhas-novas.js");

// Cache vazio: toda campanha vai para a rebusca.
const db = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => Promise.resolve() }) }),
} as unknown as Database;

const ANTIGA = { id: "a0000000-0000-4000-8000-00000000000a", accountName: "Danilo Gato", metaAccountId: "111", accessToken: "tok-a" };
const NOVA = { id: "b0000000-0000-4000-8000-00000000000b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", accessToken: "tok-b" };

const esperarOFireAndForget = () => new Promise((r) => setTimeout(r, 200));

beforeEach(() => {
  chamadas.length = 0;
  mockContas.mockReset();
});

describe("sincronizarHistoricoDasCampanhasNovas", () => {
  it("cada conta é consultada na Meta, com o act_ e o token DELA — nunca o UUID", async () => {
    mockContas.mockResolvedValue([ANTIGA, NOVA]);

    const n = await sincronizarHistoricoDasCampanhasNovas(db, "p-sync-1", ["c1", "c2"]);
    await esperarOFireAndForget();

    expect(n).toBe(2);
    expect(chamadas.map((c) => [c.act, c.token]).sort()).toEqual([
      ["111", "tok-a"],
      ["1728118665260386", "tok-b"],
    ]);
    for (const c of chamadas) {
      expect(c.act).toMatch(/^\d+$/);
      expect(c.ids).toEqual(["c1", "c2"]);
    }
  });

  it("sem campanha nova não consulta nada", async () => {
    expect(await sincronizarHistoricoDasCampanhasNovas(db, "p-sync-2", [])).toBe(0);
    await esperarOFireAndForget();
    expect(mockContas).not.toHaveBeenCalled();
    expect(chamadas).toEqual([]);
  });

  it("expert sem conta Meta: nenhum pedido", async () => {
    mockContas.mockResolvedValue([]);
    expect(await sincronizarHistoricoDasCampanhasNovas(db, "p-sync-3", ["c1"])).toBe(0);
    await esperarOFireAndForget();
    expect(chamadas).toEqual([]);
  });
});
