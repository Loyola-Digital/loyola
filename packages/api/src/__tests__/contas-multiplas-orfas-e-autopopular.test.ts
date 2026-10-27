import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

/**
 * Story 29.83 — QA TEST-001: as campanhas órfãs do funil e o auto-popular de
 * etapa liam UMA conta (`.limit(1)`). Com a 2ª conta do expert, a campanha
 * dela nunca era órfã nem era puxada pelo código da etapa.
 *
 * As contas vêm do mock de `getAllMetaAccountsForProject`; o banco simulado só
 * responde às consultas de projeto, funil e etapas, na ordem em que a rota as
 * faz. Se a rota voltar a buscar a conta no banco por conta própria, a fila
 * desanda e o teste quebra.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const FUNIL = "40000000-0000-4000-8000-000000000004";

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
const { default: funnelStageRoutes } = await import("../routes/funnel-stages.js");

const ANTIGA = { id: "a0000000-0000-4000-8000-00000000000a", accountName: "Danilo Gato", metaAccountId: "111", accessToken: "tok-a" };
const NOVA = { id: "b0000000-0000-4000-8000-00000000000b", accountName: "DaniloGatoPerpétuo", metaAccountId: "1728118665260386", accessToken: "tok-b" };

const NA_ANTIGA = { id: "c-antiga", name: "dg_a02_claude-negocios_of03_perpetuo_2026_hot_abo_estaticos_lpa", status: "ACTIVE", objective: "OUTCOME_SALES" };
const NA_NOVA = { id: "52577008819383", name: "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa", status: "ACTIVE", objective: "OUTCOME_SALES" };

// ---- banco simulado: uma fila de respostas, na ordem das consultas ----
let fila: unknown[][] = [];
let inseridas: Record<string, unknown>[] = [];
function consulta() {
  const linhas = fila.shift() ?? [];
  const p = Promise.resolve(linhas) as Promise<unknown[]> & { limit: () => Promise<unknown[]> };
  p.limit = () => Promise.resolve(linhas);
  return p;
}
const db = {
  select: () => ({ from: () => ({ where: () => consulta() }) }),
  insert: () => ({
    values: (v: Record<string, unknown>) => {
      inseridas.push(v);
      return {
        returning: () =>
          Promise.resolve([{ id: "s1", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...v }]),
      };
    },
  }),
} as unknown as Database;

const plugins = fp(async (fastify) => {
  fastify.decorate("db", db);
  fastify.addHook("onRequest", async (request) => {
    (request as { userRole?: string; userId?: string }).userRole = "admin";
    (request as { userRole?: string; userId?: string }).userId = "u1";
  });
});

async function buildApp() {
  const app = Fastify();
  await app.register(plugins);
  await app.register(funnelRoutes);
  await app.register(funnelStageRoutes);
  return app;
}

const funil = {
  id: FUNIL,
  projectId: PROJ,
  name: "Perpétuo Claude Negócios",
  type: "perpetual",
  matchCode: "claude-negocios",
  campaigns: [],
  dismissedOrphanCampaigns: [],
};

beforeEach(() => {
  fila = [];
  inseridas = [];
  mockContas.mockReset().mockResolvedValue([ANTIGA, NOVA]);
  mockFetchCampaigns.mockReset().mockImplementation(async (act: string) =>
    act === "111" ? [NA_ANTIGA] : [NA_NOVA],
  );
});

describe("campanhas órfãs com 2 contas (Story 29.83)", () => {
  it("a campanha da conta nova também é órfã", async () => {
    fila = [[{ id: PROJ }], [funil], []]; // projeto, funil, etapas
    const app = await buildApp();

    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJ}/funnels/${FUNIL}/orphan-campaigns` });

    expect(res.statusCode).toBe(200);
    expect(res.json().orphans.map((c: { id: string }) => c.id).sort()).toEqual(["52577008819383", "c-antiga"]);
  });

  it("falha numa conta vira 502 — 'nenhuma órfã' por não ter lido uma conta seria falso negativo", async () => {
    mockFetchCampaigns.mockImplementation(async (act: string) => {
      if (act === "1728118665260386") throw new Error("rate limit");
      return [NA_ANTIGA];
    });
    fila = [[{ id: PROJ }], [funil], []];
    const app = await buildApp();

    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJ}/funnels/${FUNIL}/orphan-campaigns` });

    expect(res.statusCode).toBe(502);
    expect(res.json().details).toContain("DaniloGatoPerpétuo (act_1728118665260386): rate limit");
  });
});

describe("auto-popular de etapa com 2 contas (Story 29.83)", () => {
  const criar = async () => {
    fila = [[{ id: PROJ }], [funil], []]; // projeto, funil, etapas existentes
    const app = await buildApp();
    const r = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJ}/funnels/${FUNIL}/stages`,
      payload: { name: "Vendas", stageType: "sales", matchCode: "claude-negocios" },
    });
    return r;
  };

  it("puxa as campanhas que casam com o código nas DUAS contas", async () => {
    const res = await criar();

    expect(res.statusCode).toBe(201);
    expect(mockFetchCampaigns).toHaveBeenCalledWith("111", "tok-a");
    expect(mockFetchCampaigns).toHaveBeenCalledWith("1728118665260386", "tok-b");
    expect((inseridas[0].campaigns as { id: string }[]).map((c) => c.id)).toEqual(["c-antiga", "52577008819383"]);
  });

  it("conta que falha fica de fora; a etapa é criada com a outra", async () => {
    mockFetchCampaigns.mockImplementation(async (act: string) => {
      if (act === "111") throw new Error("token expirado");
      return [NA_NOVA];
    });

    const res = await criar();

    expect(res.statusCode).toBe(201);
    expect((inseridas[0].campaigns as { id: string }[]).map((c) => c.id)).toEqual(["52577008819383"]);
  });
});
