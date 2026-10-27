import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 — GET /api/projects/:projectId/meta-campaigns (o seletor das 7
 * telas). Antes: `.limit(1)` sem ordem → só as campanhas de UMA conta.
 *
 * O banco é um stub que EXPLODE se for consultado: a rota tem de resolver as
 * contas por `getAllMetaAccountsForProject`, e não por uma consulta própria com
 * `.limit(1)` — que é exatamente o que este teste quebra se voltar.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";

const mockContas = vi.fn();
vi.mock("../services/traffic-analytics.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/traffic-analytics.js")>();
  return { ...real, getAllMetaAccountsForProject: (...a: unknown[]) => mockContas(...a) };
});

const mockFetchCampaigns = vi.fn();
vi.mock("../services/meta-ads.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/meta-ads.js")>();
  return { ...real, fetchCampaigns: (...a: unknown[]) => mockFetchCampaigns(...a) };
});

const { default: funnelRoutes } = await import("../routes/funnels.js");

const ANTIGA = { id: "a0000000-0000-4000-8000-00000000000a", accountName: "Danilo Gato", metaAccountId: "111", accessToken: "tok-a" };
const NOVA = { id: "b0000000-0000-4000-8000-00000000000b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", accessToken: "tok-b" };
const NOME = "dg_a02_claude-negocios_of03_perpetuo_2026_hot_abo_videos_lpa";

const dbQueExplode = fp(async (fastify) => {
  fastify.decorate("db", {
    select: () => {
      throw new Error("a rota do seletor não deve consultar meta_ads_account_projects por conta própria");
    },
  } as unknown as Database);
});
const usuario = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    (request as { userRole?: string; userId?: string }).userRole = "admin";
    (request as { userRole?: string; userId?: string }).userId = "u1";
  });
});

async function buildApp() {
  const app = Fastify();
  await app.register(dbQueExplode);
  await app.register(usuario);
  await app.register(funnelRoutes);
  return app;
}

const pedir = async () => {
  const app = await buildApp();
  return app.inject({ method: "GET", url: `/api/projects/${PROJ}/meta-campaigns` });
};

beforeEach(() => {
  mockContas.mockReset();
  mockFetchCampaigns.mockReset();
});

describe("seletor de campanhas com N contas (Story 29.83)", () => {
  it("lista as campanhas das DUAS contas, cada uma com a conta de origem (AC1, AC2)", async () => {
    mockContas.mockResolvedValue([ANTIGA, NOVA]);
    mockFetchCampaigns.mockImplementation(async (act: string) =>
      act === "111"
        ? [{ id: "c-antiga", name: NOME, status: "ACTIVE", objective: "OUTCOME_SALES" }]
        : [{ id: "52577467872783", name: NOME, status: "PAUSED", objective: "OUTCOME_SALES" }],
    );

    const res = await pedir();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(mockFetchCampaigns).toHaveBeenCalledWith("111", "tok-a");
    expect(mockFetchCampaigns).toHaveBeenCalledWith("1728118665260386", "tok-b");
    expect(body.accountLinked).toBe(true);
    expect(body.campaigns).toEqual([
      { id: "c-antiga", name: NOME, status: "ACTIVE", objective: "OUTCOME_SALES", accountId: ANTIGA.id, accountName: "Danilo Gato", metaAccountId: "111" },
      { id: "52577467872783", name: NOME, status: "PAUSED", objective: "OUTCOME_SALES", accountId: NOVA.id, accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386" },
    ]);
    expect(body.accountErrors).toEqual([]);
    expect(res.body).not.toContain("tok-");
  });

  it("uma conta falhando: 200 com a outra + aviso nomeando a que falhou (AC3)", async () => {
    mockContas.mockResolvedValue([ANTIGA, NOVA]);
    mockFetchCampaigns.mockImplementation(async (act: string) => {
      if (act === "1728118665260386") throw new Error("Error validating access token");
      return [{ id: "c-antiga", name: NOME, status: "ACTIVE", objective: "OUTCOME_SALES" }];
    });

    const res = await pedir();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaigns.map((c: { id: string }) => c.id)).toEqual(["c-antiga"]);
    expect(body.accountErrors).toEqual([
      { accountId: NOVA.id, accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", error: "Error validating access token" },
    ]);
  });

  it("todas as contas falhando: 502 com o motivo de cada uma", async () => {
    mockContas.mockResolvedValue([ANTIGA, NOVA]);
    mockFetchCampaigns.mockRejectedValue(new Error("rate limit"));

    const res = await pedir();

    expect(res.statusCode).toBe(502);
    expect(res.json().details).toContain("Danilo Gato (act_111): rate limit");
    expect(res.json().details).toContain("DaniloGatoPerpétuo (act_1728118665260386): rate limit");
  });

  it("expert sem conta: accountLinked false e listas vazias", async () => {
    mockContas.mockResolvedValue([]);
    const res = await pedir();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ campaigns: [], accountLinked: false, accounts: [], accountErrors: [] });
    expect(mockFetchCampaigns).not.toHaveBeenCalled();
  });

  it("uma conta só: mesma lista de antes, agora com a conta (AC6)", async () => {
    mockContas.mockResolvedValue([ANTIGA]);
    mockFetchCampaigns.mockResolvedValue([{ id: "c1", name: "x", status: "ACTIVE", objective: "OUTCOME_LEADS" }]);

    const body = (await pedir()).json();

    expect(body.campaigns.map(({ id, name, status, objective }: Record<string, string>) => ({ id, name, status, objective }))).toEqual([
      { id: "c1", name: "x", status: "ACTIVE", objective: "OUTCOME_LEADS" },
    ]);
    expect(body.accountLinked).toBe(true);
  });
});
