import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 (item 4 da T1) — `getAllAdSetsForProject` lia a Meta ao vivo
 * com UMA conta (`.limit(1)` sem ordem). Os conjuntos das campanhas da outra
 * conta saíam zerados no Detalhamento por conjunto, no Lançamento e nas etapas
 * de Vendas e Lyrio.
 *
 * O banco simulado responde como o Postgres: `.where()` devolve TODOS os
 * vínculos, e `.limit(1)` devolve só o primeiro. Se a função voltar a pegar
 * "a primeira conta", o conjunto da conta nova some e o teste quebra.
 */

const mockFetchAllAdSetInsights = vi.fn();
vi.mock("../services/meta-ads.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/meta-ads.js")>();
  return {
    ...real,
    fetchAllAdSetInsights: (...a: unknown[]) => mockFetchAllAdSetInsights(...a),
    decryptAccountToken: (enc: string) => `tok:${enc}`,
  };
});

const { getAllAdSetsForProject, getAllMetaAccountsForProject } = await import("../services/traffic-analytics.js");

const PROJ = "30000000-0000-4000-8000-000000000003";
const ANTIGA = { id: "a0000000-0000-4000-8000-00000000000a", accountName: "Danilo Gato", metaAccountId: "111", accessTokenEncrypted: "A", accessTokenIv: "iv" };
const NOVA = { id: "b0000000-0000-4000-8000-00000000000b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", accessTokenEncrypted: "B", accessTokenIv: "iv" };

/** Primeira consulta: vínculos do projeto. Segunda: as contas. */
function dbComDuasContas(ordemDoBanco: Array<typeof ANTIGA> = [ANTIGA, NOVA]): Database {
  const respostas = [
    ordemDoBanco.map((c) => ({ accountId: c.id })),
    ordemDoBanco,
  ];
  let i = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const linhas = respostas[i++] ?? [];
          const p = Promise.resolve(linhas) as Promise<unknown[]> & { limit: (n: number) => Promise<unknown[]> };
          p.limit = (n: number) => Promise.resolve(linhas.slice(0, n));
          return p;
        },
      }),
    }),
  } as unknown as Database;
}

const conjunto = (adset_id: string, adset_name: string, campaign_id: string, spend: string) => ({
  adset_id,
  adset_name,
  campaign_id,
  campaign_name: `camp-${campaign_id}`,
  date_start: "2025-12-01",
  spend,
  impressions: "1000",
  clicks: "10",
  reach: "900",
  actions: [],
  action_values: [],
});

beforeEach(() => mockFetchAllAdSetInsights.mockReset());

describe("getAllAdSetsForProject com 2 contas (Story 29.83)", () => {
  it("traz os conjuntos das campanhas das DUAS contas, cada conta com o seu token", async () => {
    mockFetchAllAdSetInsights.mockImplementation(async (act: string) =>
      act === "111"
        ? [conjunto("s1", "Público Quente", "c-antiga", "100")]
        : [conjunto("s2", "Público Frio", "52577008819383", "50")],
    );

    const r = await getAllAdSetsForProject(dbComDuasContas(), PROJ, 30, ["c-antiga", "52577008819383"]);

    expect(mockFetchAllAdSetInsights).toHaveBeenCalledWith("111", "tok:A", 30, undefined, undefined);
    expect(mockFetchAllAdSetInsights).toHaveBeenCalledWith("1728118665260386", "tok:B", 30, undefined, undefined);
    const porNome = Object.fromEntries(r.adsets.map((a) => [a.campaignName, a.spend]));
    expect(porNome).toEqual({ "Público Quente": 100, "Público Frio": 50 });
  });

  it("falha numa conta derruba a leitura — não devolve o total pela metade", async () => {
    mockFetchAllAdSetInsights.mockImplementation(async (act: string) => {
      if (act === "1728118665260386") throw new Error("rate limit");
      return [conjunto("s1", "Público Quente", "c-antiga", "100")];
    });

    await expect(
      getAllAdSetsForProject(dbComDuasContas(), "outro-projeto", 30, ["c-antiga", "52577008819383"]),
    ).rejects.toThrow("DaniloGatoPerpétuo (act_1728118665260386): rate limit");
  });
});

describe("getAllMetaAccountsForProject (Story 29.83, QA TEST-001)", () => {
  it("ordem estável por nome da conta, qualquer que seja a ordem do banco", async () => {
    const contas = await getAllMetaAccountsForProject(dbComDuasContas([NOVA, ANTIGA]), PROJ);

    expect(contas.map((c) => c.accountName)).toEqual(["Danilo Gato", "DaniloGatoPerpétuo"]);
    expect(contas[0]).toEqual({ id: ANTIGA.id, accountName: "Danilo Gato", metaAccountId: "111", accessToken: "tok:A" });
  });
});
