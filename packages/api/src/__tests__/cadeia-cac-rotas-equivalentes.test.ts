import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

/**
 * Story 44.9 (AC1) — **a prova de que a extração não é promessa.**
 *
 * A aba não consegue chamar a rota pública (o gate de `/api/public/` exige
 * `x-api-key` e o web autentica com Clerk), então existe uma rota interna. Duas
 * rotas servindo o mesmo payload é exatamente a forma como o `connectRate`
 * divergiu do painel por mais de um ano (Story 44.2) — não por bug, por duas
 * implementações.
 *
 * A defesa é estrutural: a composição inteira mora em
 * `services/cadeia-cac-payload.ts` e as duas rotas são invólucros. Este teste é
 * o que impede alguém de, no futuro, "ajustar só um lado".
 *
 * ⚠️ Ele compara o payload **inteiro**, campo a campo, não uma amostra. Uma
 * asserção parcial deixaria passar exatamente a divergência que ele existe para
 * pegar.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const STAGE = "50000000-0000-4000-8000-000000000005";

const mockGetFreshSalesDaily = vi.fn();
vi.mock("../services/sales-daily-sync.js", () => ({
  getFreshSalesDaily: (...args: unknown[]) => mockGetFreshSalesDaily(...args),
}));

const mockResolveLeadSource = vi.fn();
vi.mock("../services/lead-origin-sync.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/lead-origin-sync.js")>();
  return { ...real, resolveLeadSource: (...args: unknown[]) => mockResolveLeadSource(...args) };
});

const { default: publicCadeiaCacRoutes } = await import("../routes/public-cadeia-cac.js");
const { default: stageCadeiaCacRoutes } = await import("../routes/stage-cadeia-cac.js");

const mockSelect = vi.fn();

function filaVinculo(vinculo: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(vinculo) }) }),
    }),
  });
}
function filaInsights(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(rows) }) });
}
function filaLeadCache(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  });
}

const etapa = (over: Record<string, unknown> = {}) => ({
  id: STAGE,
  name: "Captação Paga",
  stageType: "paid",
  campaigns: [{ id: "c1", name: "Campanha 1" }],
  ...over,
});

const linha = (over: Record<string, unknown> = {}) => ({
  campaignId: "c1",
  campaignName: "Campanha 1",
  dateStart: "2026-08-10",
  spend: "100",
  impressions: "10000",
  reach: "9000",
  clicks: "300",
  actions: [
    { action_type: "link_click", value: "200" },
    { action_type: "landing_page_view", value: "160" },
    { action_type: "initiate_checkout", value: "20" },
  ],
  actionValues: null,
  lastSyncedAt: new Date("2026-08-11T00:00:00Z"),
  ...over,
});

const diasDe = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    linha({ dateStart: `2026-08-${String(i + 1).padStart(2, "0")}`, ...over }),
  );

const vendas = () => ({
  payload: {
    range: { from: "2026-08-01", to: "2026-08-10" },
    totalVendas: 40,
    faturamentoBruto: 40000,
    faturamentoLiquido: 36000,
    byDay: Array.from({ length: 10 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      faturamentoBruto: 4000,
      faturamentoLiquido: 3600,
      ingressos: { pago: 3, org: 1, semTrack: 0, total: 4 },
    })),
  },
  computedAt: new Date("2026-08-11T00:00:00Z"),
  source: "cache" as const,
});

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect } as unknown as Database);
});
const configStub = fp(async (fastify) => {
  fastify.decorate("config", { SALES_PUBLIC_MAX_AGE_SEC: 300 } as never);
});
const apiKeyStub = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    (request as { apiKey?: unknown }).apiKey = {
      id: "k1",
      projectId: null,
      scopes: ["meta:read", "public:read", "*"],
    };
  });
});

/** As DUAS rotas no mesmo app — é o que torna a comparação honesta. */
async function buildApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(configStub);
  await app.register(apiKeyStub);
  await app.register(publicCadeiaCacRoutes);
  await app.register(stageCadeiaCacRoutes);
  await app.ready();
  return app;
}

const urlPublica = (qs = "") =>
  `/api/public/meta/v1/projects/${PROJ}/stages/${STAGE}/cadeia-cac${qs}`;
const urlInterna = (qs = "") => `/api/projects/${PROJ}/stages/${STAGE}/cadeia-cac${qs}`;

beforeEach(() => {
  mockSelect.mockReset();
  /**
   * Story 44.11 — default para as chamadas além das 3 enfileiradas. O bloco de
   * criativos é a 4ª query; sem isto ela devolve `undefined` e derruba a rota,
   * o que aparece como falha nos testes de EQUIVALÊNCIA — que não têm nada a
   * ver com criativos e continuam provando o que sempre provaram.
   */
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve([]),
      innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }),
  });
  mockGetFreshSalesDaily.mockReset();
  mockGetFreshSalesDaily.mockResolvedValue(vendas());
  mockResolveLeadSource.mockReset();
  mockResolveLeadSource.mockResolvedValue(null);
});

/** Roda o mesmo cenário nas duas rotas e devolve os dois corpos. */
async function ambas(
  montarFila: () => void,
  qs = "",
): Promise<{ publica: unknown; interna: unknown; statusPublica: number; statusInterna: number }> {
  const app = await buildApp();

  montarFila();
  const rp = await app.inject({ method: "GET", url: urlPublica(qs) });

  montarFila();
  const ri = await app.inject({ method: "GET", url: urlInterna(qs) });

  await app.close();
  return {
    publica: rp.statusCode === 200 ? rp.json() : null,
    interna: ri.statusCode === 200 ? ri.json() : null,
    statusPublica: rp.statusCode,
    statusInterna: ri.statusCode,
  };
}

describe("cadeia-cac — as duas rotas servem o MESMO payload (AC1)", () => {
  it("família paga: payload idêntico campo a campo", async () => {
    const r = await ambas(() => {
      filaVinculo([etapa()]);
      filaInsights(diasDe(10));
    });
    expect(r.statusPublica).toBe(200);
    expect(r.statusInterna).toBe(200);
    expect(r.interna).toEqual(r.publica);
    // Guarda contra a comparação vácua: se as duas fossem `null`, o `toEqual`
    // passaria sem comparar nada.
    expect((r.publica as { principal?: { valor?: number } }).principal?.valor).toBeGreaterThan(0);
  });

  it("família gratuita: payload idêntico, inclusive a guarda de cobertura", async () => {
    const r = await ambas(() => {
      filaVinculo([etapa({ stageType: "free" })]);
      filaInsights(diasDe(10));
      // ⚠️ Data FIXA: `new Date()` aqui roda uma vez por requisição e as duas
      // divergiriam por 1 ms — falha de fixture disfarçada de divergência real.
      filaLeadCache([
        {
          payload: { uniqueLeads: 500, fonte: "planilha_leads" },
          computedAt: new Date("2026-08-11T00:00:00Z"),
        },
      ]);
    });
    expect(r.interna).toEqual(r.publica);
    expect(
      (r.publica as { guardaDeCobertura?: { estado?: string } }).guardaDeCobertura?.estado,
    ).toBe("indisponivel");
  });

  it("etapa fora da aba: mesmo motivo nas duas", async () => {
    const r = await ambas(() => filaVinculo([etapa({ stageType: "comercial" })]));
    expect(r.interna).toEqual(r.publica);
    expect((r.publica as { motivo?: string }).motivo).toBe("foraDaAba");
  });

  it("etapa sem campanha: mesmo motivo nas duas", async () => {
    const r = await ambas(() => filaVinculo([etapa({ campaigns: [] })]));
    expect(r.interna).toEqual(r.publica);
    expect((r.publica as { motivo?: string }).motivo).toBe("semDados");
  });

  it("com range: mesmo recorte nas duas", async () => {
    const r = await ambas(
      () => {
        filaVinculo([etapa()]);
        filaInsights(diasDe(10));
      },
      "?from=2026-08-01&to=2026-08-05",
    );
    expect(r.interna).toEqual(r.publica);
    expect((r.publica as { principal?: { vendasReais?: number } }).principal?.vendasReais).toBe(20);
  });

  it("falha de leitura: mesmo motivo `leituraFalhou` nas duas", async () => {
    mockGetFreshSalesDaily.mockRejectedValue(new Error("Google Sheets: 403"));
    const r = await ambas(() => {
      filaVinculo([etapa()]);
      filaInsights(diasDe(10));
    });
    expect(r.interna).toEqual(r.publica);
    expect((r.publica as { principal?: { motivo?: string } }).principal?.motivo).toBe(
      "leituraFalhou",
    );
  });
});

describe("cadeia-cac — a rota interna tem a MESMA defesa de vínculo", () => {
  it("404 quando a etapa não pertence ao projeto da URL", async () => {
    const app = await buildApp();
    filaVinculo([]); // o innerJoin do serviço não encontra a etapa
    const res = await app.inject({ method: "GET", url: urlInterna() });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    await app.close();
  });

  it("400 em uuid inválido, como a pública", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/nao-e-uuid/stages/${STAGE}/cadeia-cac`,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("a rota interna NÃO exige escopo de API key", async () => {
    // É o ponto da story: o web autentica com Clerk e nunca manda x-api-key.
    // Um app sem o stub de apiKey precisa continuar servindo a rota interna.
    const app = Fastify();
    await app.register(mockDbPlugin);
    await app.register(configStub);
    await app.register(publicCadeiaCacRoutes);
    await app.register(stageCadeiaCacRoutes);
    await app.ready();

    filaVinculo([etapa()]);
    filaInsights(diasDe(10));
    const interna = await app.inject({ method: "GET", url: urlInterna() });
    expect(interna.statusCode).toBe(200);

    // E a pública, sem apiKey, recusa — provando que os dois gates são distintos.
    const publica = await app.inject({ method: "GET", url: urlPublica() });
    expect(publica.statusCode).toBe(403);
    await app.close();
  });
});
