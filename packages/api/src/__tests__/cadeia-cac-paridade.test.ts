import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import { agregar, calcularMetricas, calcularTetos, type DiaBruto, type SerieDeCampanha } from "@loyola-x/shared";

/**
 * Story 44.13 — **paridade entre a rota e o núcleo.**
 *
 * O `connectRate` divergiu do painel por mais de um ano (Story 44.2, 18 a 35
 * p.p.), e não por bug: por **duas implementações**. O Epic 44 respondeu
 * pondo o cálculo num lugar só, o `@loyola-x/shared`, na regra 7.6 da spec.
 *
 * Este arquivo não testa fórmula — `shared` já tem testes dourados (44.6). Ele
 * testa que o número **servido pela rota** é o mesmo que o núcleo produz para a
 * mesma entrada. É o teste que falha no dia em que alguém escrever uma divisão
 * dentro do endpoint porque "era só uma continha".
 *
 * ⚠️ Igualdade EXATA, não tolerância. É a mesma função sobre a mesma entrada;
 * se divergir num float, é porque passou por outro caminho — que é exatamente o
 * que se quer detectar. Tolerância aqui deixaria passar o defeito.
 */

const mockSelect = vi.fn();
const mockGetFreshSalesDaily = vi.fn();
const mockResolveLeadSource = vi.fn();

vi.mock("../services/stage-sales-data.js", () => ({
  getFreshSalesDaily: (...a: unknown[]) => mockGetFreshSalesDaily(...a),
}));
vi.mock("../services/lead-origin-sync.js", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, resolveLeadSource: (...a: unknown[]) => mockResolveLeadSource(...a) };
});

const { default: publicCadeiaCacRoutes } = await import("../routes/public-cadeia-cac.js");

const PROJ = "30000000-0000-4000-8000-000000000003";
const STAGE = "50000000-0000-4000-8000-000000000005";

/**
 * O cenario, escrito UMA vez e usado dos dois lados. Se a fixture divergisse
 * entre a rota e o nucleo, o teste compararia coisas diferentes e passaria
 * dizendo nada.
 */
const DIAS = 12;
const linhaCrua = (i: number) => ({
  campaignId: "c1",
  campaignName: "Campanha 1",
  dateStart: `2026-08-${String(i + 1).padStart(2, "0")}`,
  // Numeros deliberadamente irregulares: valores redondos escondem divergencia
  // de arredondamento, que e metade do que este teste existe para pegar.
  spend: String(97.37 + i * 3.11),
  impressions: String(9_137 + i * 271),
  reach: String(8_000 + i * 100),
  clicks: String(311 + i * 7),
  actions: [
    { action_type: "link_click", value: String(203 + i * 5) },
    { action_type: "landing_page_view", value: String(161 + i * 3) },
    { action_type: "initiate_checkout", value: String(19 + i) },
  ],
  actionValues: null,
  lastSyncedAt: new Date("2026-08-20T00:00:00Z"),
});

/** O gross-up do imposto Meta, que `accumulate` aplica na rota. */
const TAXA_META = 0.1215;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** A MESMA serie, montada a mao para alimentar o nucleo diretamente. */
function serieParaONucleo(): SerieDeCampanha[] {
  const dias: DiaBruto[] = Array.from({ length: DIAS }, (_, i) => {
    const c = linhaCrua(i);
    return {
      date: c.dateStart,
      // Tributado e arredondado POR DIA — o que `accumulate` + `round` fazem.
      spend: round2(Number(c.spend) / (1 - TAXA_META)),
      impressions: Number(c.impressions),
      linkClicks: Number(c.actions[0].value),
      landingPageViews: Number(c.actions[1].value),
      checkouts: Number(c.actions[2].value),
    };
  });
  return [{ campaignId: "c1", fonte: "ad-level", dias }];
}

const mockDbPlugin = fp(async (f) => {
  f.decorate("db", { select: mockSelect } as unknown as Database);
});
const configStub = fp(async (f) => {
  f.decorate("config", { SALES_PUBLIC_MAX_AGE_SEC: 300 } as never);
});
const apiKeyStub = fp(async (f) => {
  f.addHook("onRequest", async (request) => {
    (request as { apiKey?: unknown }).apiKey = { id: "k1", projectId: null, scopes: ["meta:read", "public:read", "*"] };
  });
});

async function buildApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(configStub);
  await app.register(apiKeyStub);
  await app.register(publicCadeiaCacRoutes);
  await app.ready();
  return app;
}

const URL_ABA = `/api/public/meta/v1/projects/${PROJ}/stages/${STAGE}/cadeia-cac?from=2026-08-01&to=2026-08-12`;

beforeEach(() => {
  mockSelect.mockReset();
  // Default para as chamadas alem das enfileiradas (bloco de criativos, 44.11).
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve([]),
      innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    }),
  });
  // 1a: vinculo da etapa.
  mockSelect.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: STAGE,
                name: "Etapa",
                stageType: "paid",
                campaigns: [{ id: "c1", name: "Campanha 1" }],
                lpTemVsl: null,
                ticketMedioManual: null,
                projectId: PROJ,
              },
            ]),
        }),
      }),
    }),
  });
  // 2a: insights.
  mockSelect.mockReturnValueOnce({
    from: () => ({ where: () => Promise.resolve(Array.from({ length: DIAS }, (_, i) => linhaCrua(i))) }),
  });
  mockGetFreshSalesDaily.mockReset();
  mockGetFreshSalesDaily.mockResolvedValue(null);
  mockResolveLeadSource.mockReset();
  mockResolveLeadSource.mockResolvedValue(null);
});

describe("paridade rota x núcleo — a regra 7.6 não depende de memória", () => {
  it("as CINCO métricas atuais da rota são idênticas às do núcleo", async () => {
    const app = await buildApp();
    const body = (
      await app.inject({ method: "GET", url: URL_ABA })
    ).json();
    await app.close();

    const doNucleo = calcularMetricas(agregar(serieParaONucleo()[0].dias), "paga");

    // Uma asserção só, com as cinco: se alguma divergir, o diff mostra qual.
    expect({
      cpm: body.atuais.cpm,
      cpc: body.atuais.cpc,
      ctr: body.atuais.ctr,
      connectRate: body.atuais.connectRate,
      convLP: body.atuais.convLP,
    }).toEqual({
      cpm: doNucleo.cpm,
      cpc: doNucleo.cpc,
      ctr: doNucleo.ctr,
      connectRate: doNucleo.connectRate,
      convLP: doNucleo.convLP,
    });
  });

  it("o AGREGADO da rota é idêntico ao do núcleo — inclusive o spend tributado", async () => {
    const app = await buildApp();
    const body = (
      await app.inject({ method: "GET", url: URL_ABA })
    ).json();
    await app.close();

    const doNucleo = agregar(serieParaONucleo()[0].dias);
    expect(body.agregado.spend).toBe(doNucleo.spend);
    expect(body.agregado.impressions).toBe(doNucleo.impressions);
    expect(body.agregado.linkClicks).toBe(doNucleo.linkClicks);
    expect(body.agregado.landingPageViews).toBe(doNucleo.landingPageViews);
  });

  it("os TETOS da rota são idênticos aos do núcleo", async () => {
    const app = await buildApp();
    const body = (
      await app.inject({ method: "GET", url: URL_ABA })
    ).json();
    await app.close();

    const doNucleo = calcularTetos(serieParaONucleo(), "paga");
    for (const m of ["cpm", "cpc", "ctr", "connectRate", "convLP"] as const) {
      expect({ metrica: m, valor: body.tetos[m].valor }).toEqual({ metrica: m, valor: doNucleo[m].valor });
    }
  });

  it("a janela vencedora também bate — não só o valor", async () => {
    // Duas implementações podem chegar ao mesmo número por janelas diferentes,
    // e aí o teto está certo por acidente. A janela é parte do contrato: a
    // spec §4 exige que o teto carregue origem, base e data.
    const app = await buildApp();
    const body = (
      await app.inject({ method: "GET", url: URL_ABA })
    ).json();
    await app.close();

    const doNucleo = calcularTetos(serieParaONucleo(), "paga");
    const t = doNucleo.cpc;
    if (t.valor !== null) {
      expect({ de: body.tetos.cpc.de, ate: body.tetos.cpc.ate, base: body.tetos.cpc.base }).toEqual({
        de: t.de,
        ate: t.ate,
        base: t.base,
      });
    }
  });
});
