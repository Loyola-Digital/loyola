import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  funnelStages,
  metaAdInsightsDaily,
  metaEntityNamesCache,
  projects,
  publicMetricsCache,
} from "../db/schema.js";

/**
 * Story 44.20 — o panorama do projeto.
 *
 * ## Por que o fake de banco despacha por TABELA, e não por ordem de chamada
 *
 * O harness da 44.9 enfileira respostas na ordem em que `select()` é chamado.
 * Funciona para uma rota que faz três leituras; aqui o serviço faz uma leitura
 * de projeto, uma de etapas, uma de mídia, uma de status — e depois **N
 * chamadas ao payload da cadeia**, cada uma com a própria sequência interna. Uma
 * fila por ordem viraria uma lista de posições mágicas que quebra a cada
 * reordenação legítima do serviço, sem que nada de errado tenha acontecido.
 *
 * Este fake responde pela tabela que o `.from()` recebe. Onde a MESMA tabela é
 * lida mais de uma vez com filtros diferentes (`meta_ad_insights_daily`: uma vez
 * para o projeto inteiro, depois uma por etapa), a fixture passa uma FILA — a
 * última entrada se repete.
 *
 * ⚠️ **O que este fake NÃO prova:** os predicados do `where` são ignorados.
 * Logo, nenhum teste aqui prova o vínculo etapa↔projeto (IDOR) nem o filtro de
 * `archivedAt` — isso exige inspecionar o predicado do drizzle ou banco real, e
 * afirmar o contrário seria teste decorativo. O que ele prova é a COMPOSIÇÃO: o
 * que o serviço faz com as linhas que recebe.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const STAGE = "50000000-0000-4000-8000-000000000005";
const FUNNEL = "40000000-0000-4000-8000-000000000004";

const mockGetFreshSalesDaily = vi.fn();
vi.mock("../services/sales-daily-sync.js", () => ({
  getFreshSalesDaily: (...args: unknown[]) => mockGetFreshSalesDaily(...args),
}));

const mockResolveLeadSource = vi.fn();
vi.mock("../services/lead-origin-sync.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/lead-origin-sync.js")>();
  return { ...real, resolveLeadSource: (...args: unknown[]) => mockResolveLeadSource(...args) };
});

const { montarPanoramaDoProjeto } = await import("../services/panorama-do-projeto.js");
const { default: publicPanoramaRoutes } = await import("../routes/public-panorama.js");
const { default: projectPanoramaRoutes } = await import("../routes/project-panorama.js");

// ─────────────────────────────────────────────────────────────
// Fake de banco por tabela
// ─────────────────────────────────────────────────────────────

type Fixture = Map<unknown, unknown[][]>;

function construtor(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  const encadeia = () => b;
  b.innerJoin = encadeia;
  b.leftJoin = encadeia;
  b.where = encadeia;
  b.limit = encadeia;
  b.orderBy = encadeia;
  b.groupBy = encadeia;
  b.then = (ok: (v: unknown[]) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(ok, falha);
  return b;
}

function fakeDb(fixture: Fixture): Database {
  const consumidas = new Map<unknown, number>();
  return {
    select: () => ({
      from: (tabela: unknown) => {
        const fila = fixture.get(tabela) ?? [[]];
        const i = consumidas.get(tabela) ?? 0;
        consumidas.set(tabela, i + 1);
        // A última entrada da fila se repete: leitura por etapa em projeto de
        // uma etapa só não precisa declarar N vezes a mesma coisa.
        return construtor(fila[Math.min(i, fila.length - 1)] ?? []);
      },
    }),
  } as unknown as Database;
}

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const projeto = () => [{ id: PROJ, name: "BBE", clientName: "Bruno" }];

const etapa = (over: Record<string, unknown> = {}) => ({
  id: STAGE,
  name: "Captação Paga",
  stageType: "paid",
  campaigns: [{ id: "c1", name: "Campanha 1" }],
  lpTemVsl: null,
  ticketMedioManual: null,
  funnelId: FUNNEL,
  funnelName: "bbe-pr2-ago-26",
  funnelType: "launch",
  ...over,
});

const linha = (over: Record<string, unknown> = {}) => ({
  campaignId: "c1",
  campaignName: "Campanha 1",
  dateStart: "2026-08-25",
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
  adId: "a1",
  adName: "Anúncio 1",
  lastSyncedAt: new Date("2026-08-27T00:00:00Z"),
  ...over,
});

/** N dias terminando em 27/08 — dentro da janela curta de 7 dias. */
const diasNaCurta = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) =>
    linha({ dateStart: `2026-08-${String(21 + i).padStart(2, "0")}`, ...over }),
  );

const vendas = () => ({
  payload: {
    range: { from: "2026-07-29", to: "2026-08-27" },
    totalVendas: 15,
    faturamentoBruto: 15000,
    faturamentoLiquido: 13500,
    byDay: [],
  },
  computedAt: new Date("2026-08-27T00:00:00Z"),
  source: "cache" as const,
});

function fixture(over: Partial<Record<string, unknown[][]>> = {}): Fixture {
  const f: Fixture = new Map();
  f.set(projects, [projeto()]);
  f.set(funnelStages, [[etapa()]]);
  f.set(metaAdInsightsDaily, [diasNaCurta(3)]);
  f.set(metaEntityNamesCache, [[]]);
  f.set(publicMetricsCache, [[]]);
  for (const [k, v] of Object.entries(over)) {
    const tabela = { projects, funnelStages, metaAdInsightsDaily, metaEntityNamesCache, publicMetricsCache }[
      k as "projects"
    ];
    if (tabela && v) f.set(tabela, v);
  }
  return f;
}

const config = { SALES_PUBLIC_MAX_AGE_SEC: 300 };
const OPTS = { to: "2026-08-27", janelaCurtaDias: 7, janelaLongaDias: 30 };

beforeEach(() => {
  mockGetFreshSalesDaily.mockReset();
  mockGetFreshSalesDaily.mockResolvedValue(vendas());
  mockResolveLeadSource.mockReset();
  mockResolveLeadSource.mockResolvedValue(null);
});

// ─────────────────────────────────────────────────────────────
// T1 — as duas rotas, um payload
// ─────────────────────────────────────────────────────────────

const mockDbPlugin = (f: Fixture) =>
  fp(async (fastify) => {
    fastify.decorate("db", fakeDb(f));
  });
const configStub = fp(async (fastify) => {
  fastify.decorate("config", config as never);
});
const apiKeyStub = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    (request as { apiKey?: unknown }).apiKey = { id: "k1", projectId: null, scopes: ["meta:read"] };
  });
});

async function buildApp(f: Fixture) {
  const app = Fastify();
  await app.register(mockDbPlugin(f));
  await app.register(configStub);
  await app.register(apiKeyStub);
  await app.register(publicPanoramaRoutes);
  await app.register(projectPanoramaRoutes);
  await app.ready();
  return app;
}

const QS = "?to=2026-08-27&curta=7&longa=30";

describe("Story 44.20 (T1) — rota pública e rota interna servem o MESMO panorama", () => {
  it("payload idêntico campo a campo", async () => {
    // Cada rota recebe uma fixture NOVA: o fake consome a fila, e reusar a
    // mesma instância faria a segunda chamada ler as sobras da primeira.
    const appA = await buildApp(fixture());
    const publica = await appA.inject({
      method: "GET",
      url: `/api/public/meta/v1/projects/${PROJ}/panorama-cac${QS}`,
    });
    await appA.close();

    const appB = await buildApp(fixture());
    const interna = await appB.inject({
      method: "GET",
      url: `/api/projects/${PROJ}/panorama-cac${QS}`,
    });
    await appB.close();

    expect(publica.statusCode).toBe(200);
    expect(interna.statusCode).toBe(200);
    expect(publica.json()).toEqual(interna.json());
  });

  it("a rota pública exige escopo de API key e a interna não", async () => {
    const app = Fastify();
    await app.register(mockDbPlugin(fixture()));
    await app.register(configStub);
    await app.register(publicPanoramaRoutes);
    await app.register(projectPanoramaRoutes);
    await app.ready();

    const interna = await app.inject({ method: "GET", url: `/api/projects/${PROJ}/panorama-cac${QS}` });
    expect(interna.statusCode).toBe(200);

    const publica = await app.inject({
      method: "GET",
      url: `/api/public/meta/v1/projects/${PROJ}/panorama-cac${QS}`,
    });
    expect(publica.statusCode).toBe(403);
    await app.close();
  });

  it("projeto inexistente devolve 404, não 403", async () => {
    const f = fixture();
    f.set(projects, [[]]);
    const app = await buildApp(f);
    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJ}/panorama-cac${QS}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────
// T2 — etapa fora da aba
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T2) — etapa fora da aba entra no panorama e sai da conta", () => {
  it("`lyrio` vem com familia null, gargalo null, e NÃO conta em etapasNoAr", async () => {
    const f = fixture();
    f.set(funnelStages, [[etapa({ id: STAGE, name: "Lyrio - APP", stageType: "lyrio" })]]);

    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const e = p.etapas[0];

    expect(e.familia).toBeNull();
    expect(e.gargalo).toBeNull();
    // Gastou: continua no panorama e no spend.
    expect(e.spendCurta).toBeGreaterThan(0);
    expect(e.noAr).toBe(true);
    expect(p.totais.spendCurta).toBe(e.spendCurta);
    // Mas fora da aba não tem cadeia a ler — some da CONTA, não do panorama.
    expect(p.totais.etapasNoAr).toBe(0);
    expect(p.pendencias).toContainEqual(
      expect.objectContaining({ stageId: STAGE, codigo: "foraDaAba", origem: "cadeia" }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// T3 — campanhas órfãs
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T3) — campanha com gasto e sem vínculo é órfã", () => {
  it("cai em campanhasOrfas e NUNCA dentro de uma etapa", async () => {
    const f = fixture();
    f.set(metaAdInsightsDaily, [
      // 1ª leitura: o projeto inteiro — a vinculada e a órfã.
      [
        ...diasNaCurta(2),
        linha({ campaignId: "orfa", campaignName: "netao_bbe-pr2-out-26_post", spend: "0.59" }),
      ],
      // Leituras seguintes (por etapa): só a vinculada, como o filtro real faria.
      diasNaCurta(2),
    ]);

    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;

    expect(p.campanhasOrfas).toHaveLength(1);
    expect(p.campanhasOrfas[0].campaignId).toBe("orfa");
    // Gross-up: 0,59 ÷ (1 − 0,1215) = 0,67. É o número medido em produção.
    expect(p.campanhasOrfas[0].spendCurta).toBe(0.67);

    const idsNasEtapas = p.etapas.flatMap((e) => e.campanhas.map((c) => c.campaignId));
    expect(idsNasEtapas).not.toContain("orfa");
    expect(p.totais.spendCurta).toBe(p.etapas[0].spendCurta);
  });

  it("campanha SEM gasto na janela curta não vira órfã", async () => {
    const f = fixture();
    f.set(metaAdInsightsDaily, [
      [...diasNaCurta(2), linha({ campaignId: "antiga", dateStart: "2026-08-01", spend: "500" })],
      diasNaCurta(2),
    ]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    expect(p.campanhasOrfas).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// T4 — `noAr` é medido, não declarado
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T4) — noAr sai do GASTO, não do effectiveStatus", () => {
  it("campanha PAUSED com gasto na janela mantém a etapa no ar — e a régua errada mudaria a conta", async () => {
    const f = fixture();
    f.set(metaEntityNamesCache, [[{ entityId: "c1", effectiveStatus: "PAUSED" }]]);

    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const e = p.etapas[0];

    expect(e.campanhas[0].effectiveStatus).toBe("PAUSED");
    expect(e.spendCurta).toBeGreaterThan(0);
    expect(e.noAr).toBe(true);
    expect(p.totais.etapasNoAr).toBe(1);

    /**
     * A REVERSÃO exigida pela story: aplicar a régua errada — `noAr` vindo do
     * status — sobre EXATAMENTE o mesmo payload. Se a contagem não mudasse, o
     * teste acima seria decorativo: passaria com o bug de volta.
     *
     * Em 27/08, das 13 campanhas do BBE com gasto nos 7 dias, 5 estavam
     * `PAUSED` — pausadas no meio da janela. A régua errada perderia 6 das 13.
     */
    const comRéguaErrada = p.etapas.filter(
      (x) => x.campanhas.some((c) => c.effectiveStatus === "ACTIVE") && x.familia !== null,
    ).length;
    expect(comRéguaErrada).toBe(0);
    expect(comRéguaErrada).not.toBe(p.totais.etapasNoAr);
  });
});

// ─────────────────────────────────────────────────────────────
// T5 — `null` de status continua `null`
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T5) — effectiveStatus null é ausência de dado, não pausa", () => {
  it("campanha sem entrada no cache de nomes chega com null, nunca PAUSED", async () => {
    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    expect(p.etapas[0].campanhas[0].effectiveStatus).toBeNull();
  });

  it("entrada no cache COM effective_status null também chega null", async () => {
    const f = fixture();
    f.set(metaEntityNamesCache, [[{ entityId: "c1", effectiveStatus: null }]]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    expect(p.etapas[0].campanhas[0].effectiveStatus).toBeNull();
  });

  it("campanha vinculada SEM gasto na janela ainda recebe o status", async () => {
    // O status vem de uma leitura que precisa cobrir as vinculadas, não só as
    // que gastaram — senão toda campanha parada apareceria como "sem dado".
    const f = fixture();
    f.set(funnelStages, [[etapa({ campaigns: [{ id: "c1", name: "C1" }, { id: "c9", name: "C9" }] })]]);
    f.set(metaEntityNamesCache, [[{ entityId: "c9", effectiveStatus: "PAUSED" }]]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const c9 = p.etapas[0].campanhas.find((c) => c.campaignId === "c9")!;
    expect(c9.spendCurta).toBe(0);
    expect(c9.effectiveStatus).toBe("PAUSED");
  });
});

// ─────────────────────────────────────────────────────────────
// T6 — pendências: repasse literal × derivado
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T6) — pendências repassam a mensagem original", () => {
  it("etapa sem fonte de vendas vira `semDados` com a mensagem do payload da cadeia", async () => {
    mockGetFreshSalesDaily.mockResolvedValue({ payload: null, computedAt: null, source: "cache" });

    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    const pend = p.pendencias.find((x) => x.codigo === "semDados")!;

    expect(pend).toBeDefined();
    expect(pend.origem).toBe("cadeia");
    // Literal, do payload — reescrever aqui recriaria a ambiguidade
    // "sync pendente" × "sem fonte" que a 36.9 AC5 removeu.
    expect(pend.mensagem).toBe(
      "A etapa não tem nenhuma fonte de vendas conectada (nem planilha, nem venda manual).",
    );
    expect(pend.mensagem).toBe((p.etapas[0].principal as { message: string }).message);
  });

  it("`leituraFalhou` não colapsa em `semDados` — as ações são opostas", async () => {
    mockGetFreshSalesDaily.mockRejectedValue(new Error("permissão negada na planilha"));
    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    const codigos = p.pendencias.map((x) => x.codigo);
    expect(codigos).toContain("leituraFalhou");
    expect(codigos).not.toContain("semDados");
  });

  it("derivado carrega origem `panorama`, para não ser citado como fato do backend", async () => {
    // Série curta o bastante para o teto sair com confiança BAIXA.
    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    const derivados = p.pendencias.filter((x) => x.origem === "panorama");
    for (const d of derivados) {
      expect(["semTetoConfiavel", "coberturaIndisponivel"]).toContain(d.codigo);
      expect(d.mensagem.length).toBeGreaterThan(0);
    }
    // E nenhum repassado se disfarça de derivado.
    for (const r of p.pendencias.filter((x) => x.origem === "cadeia")) {
      expect(["semDados", "syncPendente", "leituraFalhou", "indeterminado", "foraDaAba"]).toContain(
        r.codigo,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────
// T7 — o imposto não é aplicado duas vezes
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (T7) — o spend do panorama é o mesmo do payload da cadeia", () => {
  it("spendLonga bate ao centavo com agregado.spend da mesma etapa e janela", async () => {
    const { montarPayloadCadeiaCac } = await import("../services/cadeia-cac-payload.js");

    const linhas = diasNaCurta(5);
    const f = fixture();
    f.set(metaAdInsightsDaily, [linhas]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;

    const g = fixture();
    g.set(metaAdInsightsDaily, [linhas]);
    const payload = await montarPayloadCadeiaCac(fakeDb(g), config, etapa(), {
      projectId: PROJ,
      stageId: STAGE,
      from: p.janelas.longa.from,
      to: p.janelas.longa.to,
    });
    const agregado = payload.agregado as { spend: number };

    expect(p.etapas[0].spendLonga).toBeCloseTo(agregado.spend, 2);

    // E o gross-up é ×1,1382, não ×1,1215: 5 dias × R$100 cru = R$500 →
    // 500 ÷ (1 − 0,1215) = 569,15. Conferir com ×1,1215 daria 560,75 e mandaria
    // procurar bug de imposto onde não há.
    expect(p.etapas[0].spendLonga).toBeCloseTo(500 / (1 - 0.1215), 1);
    expect(p.etapas[0].spendLonga).not.toBeCloseTo(500 * 1.1215, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// Janelas
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 — as janelas", () => {
  it("default é 7 e 30 dias terminando no `to`", async () => {
    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, { to: "2026-08-27" }))!;
    expect(p.janelas.curta).toEqual({ from: "2026-08-21", to: "2026-08-27", dias: 7 });
    expect(p.janelas.longa).toEqual({ from: "2026-07-29", to: "2026-08-27", dias: 30 });
  });

  it("gasto fora da janela curta entra na longa e não na curta", async () => {
    const f = fixture();
    f.set(metaAdInsightsDaily, [
      [linha({ dateStart: "2026-08-01", spend: "200" }), linha({ dateStart: "2026-08-25", spend: "100" })],
    ]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const c = p.etapas[0].campanhas[0];
    expect(c.spendCurta).toBeCloseTo(100 / (1 - 0.1215), 1);
    expect(c.spendLonga).toBeCloseTo(300 / (1 - 0.1215), 1);
    expect(c.ultimoDiaComSpend).toBe("2026-08-25");
  });
});

// ─────────────────────────────────────────────────────────────
// Gargalo e pendências derivadas — com série que produz teto de verdade
// ─────────────────────────────────────────────────────────────

/**
 * Série calibrada para os PISOS da Story 44.5 (`shared/cadeia-cac.ts:410`):
 * a base de cada janela de 7 dias cai entre o piso baixo e o alto, então todo
 * teto sai com `confianca: "baixa"`. É o que faz `semTetoConfiavel` disparar —
 * e o que torna o teste da pendência derivada não-vacuoso.
 *
 *   cpc/ctr/cpm  piso 10.000 / 30.000 → 2.000 impressões/dia × 7 = 14.000
 *   connectRate  piso    100 /    300 →    30 link clicks/dia × 7 =    210
 *   convLP       piso    150 /    300 →    28 LP views/dia    × 7 =    196
 */
const diaFraco = (i: number, over: Record<string, unknown> = {}) =>
  linha({
    dateStart: `2026-08-${String(10 + i).padStart(2, "0")}`,
    impressions: "2000",
    clicks: "40",
    actions: [
      { action_type: "link_click", value: "30" },
      { action_type: "landing_page_view", value: "28" },
      { action_type: "initiate_checkout", value: "1" },
    ],
    ...over,
  });

/**
 * ⚠️ A série precisa VARIAR. Numa série uniforme a melhor janela de 7 dias é
 * igual ao período inteiro, a queda contra o teto é zero e `montarRanking`
 * descarta o item (`quedaReal` devolve `null`) — o `gargalo` sairia `null` sem
 * que nada estivesse errado. Aqui a primeira semana é boa e a segunda é ruim,
 * que é como uma etapa real se comporta e o que dá teto acima do atual.
 */
const serieComTeto = (n = 14) =>
  Array.from({ length: n }, (_, i) =>
    i < 7
      ? diaFraco(i, {
          spend: "50",
          actions: [
            { action_type: "link_click", value: "30" },
            { action_type: "landing_page_view", value: "28" },
            { action_type: "initiate_checkout", value: "4" },
          ],
        })
      : diaFraco(i, {
          spend: "200",
          actions: [
            { action_type: "link_click", value: "30" },
            { action_type: "landing_page_view", value: "28" },
            { action_type: "initiate_checkout", value: "1" },
          ],
        }),
  );

describe("Story 44.20 — gargalo e pendências derivadas", () => {
  it("gargalo é o ranking[0] da cadeia, sem a `posicao`", async () => {
    const f = fixture();
    f.set(metaAdInsightsDaily, [serieComTeto()]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const g = p.etapas[0].gargalo!;

    expect(g).not.toBeNull();
    expect(["cpc", "connectRate", "convLP"]).toContain(g.metrica);
    expect(typeof g.queda).toBe("number");
    /**
     * ⚠️ `posicao` fica de fora de propósito: no payload ela é a posição do elo
     * NA CADEIA (1=cpc, 2=connectRate, 3=convLP), não a prioridade. Dentro de um
     * objeto chamado `gargalo` ela seria lida como ranking.
     */
    expect(g).not.toHaveProperty("posicao");
  });

  it("todos os tetos com confiança baixa geram `semTetoConfiavel`, com origem panorama", async () => {
    const f = fixture();
    f.set(metaAdInsightsDaily, [serieComTeto()]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;

    const d = p.pendencias.find((x) => x.codigo === "semTetoConfiavel")!;
    expect(d, "a série calibrada precisa produzir tetos de confiança baixa").toBeDefined();
    expect(d.origem).toBe("panorama");
    expect(d.mensagem).toContain("confiança BAIXA");
  });

  it("teto de confiança ALTA não gera a pendência", async () => {
    // Mesma série, base 10× maior: os tetos passam do piso alto.
    const f = fixture();
    f.set(metaAdInsightsDaily, [
      Array.from({ length: 14 }, (_, i) =>
        diaFraco(i, {
          impressions: "20000",
          actions: [
            { action_type: "link_click", value: "300" },
            { action_type: "landing_page_view", value: "280" },
            { action_type: "initiate_checkout", value: "10" },
          ],
        }),
      ),
    ]);
    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    expect(p.pendencias.map((x) => x.codigo)).not.toContain("semTetoConfiavel");
  });

  it("etapa gratuita com cache de lead SEM cobertura diária gera `coberturaIndisponivel`", async () => {
    const f = fixture();
    f.set(funnelStages, [[etapa({ stageType: "free" })]]);
    f.set(metaAdInsightsDaily, [serieComTeto()]);
    // Cache gravado ANTES da Story 44.12: tem lead, não tem `coberturaDiaria`.
    f.set(publicMetricsCache, [
      [{ payload: { uniqueLeads: 40, fonte: "planilha_leads" }, computedAt: new Date("2026-08-27T00:00:00Z") }],
    ]);

    const p = (await montarPanoramaDoProjeto(fakeDb(f), config, PROJ, OPTS))!;
    const d = p.pendencias.find((x) => x.codigo === "coberturaIndisponivel")!;
    expect(d).toBeDefined();
    expect(d.origem).toBe("panorama");
    // E o principal da gratuita é CPL, nunca CAC.
    expect((p.etapas[0].principal as { metrica: string }).metrica).toBe("cplReal");
  });
});

// ─────────────────────────────────────────────────────────────
// O `semDados` que NÃO é pendência (QA-4414-02)
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 — `semDados` de fonte ausente × de denominador zero", () => {
  it("fonte conectada com ZERO venda na janela não vira pendência de configuração", async () => {
    /**
     * O payload da cadeia acrescenta `motivo: "semDados"` ao ramo de SUCESSO
     * quando o denominador é zero (`cadeia-cac-payload.ts:585`) — ao lado de
     * `vendasReais: 0` e `dataSource`, e **sem `message`**. É o achado
     * QA-4414-02 do gate da 44.14.
     *
     * Repassar isso como pendência mandaria conectar uma fonte que já está
     * conectada — o chamado de 2026-08-14 que a Story 36.9 AC5 fechou.
     */
    mockGetFreshSalesDaily.mockResolvedValue({
      payload: { range: { from: "2026-07-29", to: "2026-08-27" }, totalVendas: 0, byDay: [] },
      computedAt: new Date("2026-08-27T00:00:00Z"),
      source: "cache" as const,
    });

    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    const principal = p.etapas[0].principal as Record<string, unknown>;

    // O fato continua VISÍVEL — ele só não é lacuna de configuração.
    expect(principal.motivo).toBe("semDados");
    expect(principal.vendasReais).toBe(0);
    expect(principal.message).toBeUndefined();
    expect(p.pendencias.map((x) => x.codigo)).not.toContain("semDados");
  });

  it("fonte AUSENTE continua virando pendência, com a mensagem literal", async () => {
    mockGetFreshSalesDaily.mockResolvedValue({ payload: null, computedAt: null, source: "cache" });
    const p = (await montarPanoramaDoProjeto(fakeDb(fixture()), config, PROJ, OPTS))!;
    expect(p.pendencias.map((x) => x.codigo)).toContain("semDados");
  });
});

// ─────────────────────────────────────────────────────────────
// QA-4420-01 — o panorama não força recompute de venda
// ─────────────────────────────────────────────────────────────

describe("Story 44.20 (QA-4420-01) — o panorama não força recompute em N etapas", () => {
  it("`?fresh=1` na URL NÃO chega ao getFreshSalesDaily como maxAge zero", async () => {
    /**
     * `maxAgeFrom("1", cfg)` devolve **0**, e `0` no `getFreshSalesDaily`
     * significa "recompute sempre" (`utils/cache-freshness.ts:24`). Repassar
     * isso às N etapas levava DG & CPDF de 676 ms para 15.137 ms — 3× o teto de
     * 5 s da AC7, medido contra produção em 27/08.
     *
     * Este teste é o que impede o parâmetro de voltar por conveniência: ele
     * afirma sobre o `maxAgeMs` que chega ao serviço de vendas, não sobre o
     * tempo — tempo em teste é ruído, e a causa é o argumento.
     */
    const app = await buildApp(fixture());
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${PROJ}/panorama-cac${QS}&fresh=1`,
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockGetFreshSalesDaily).toHaveBeenCalled();
    for (const chamada of mockGetFreshSalesDaily.mock.calls) {
      const opts = chamada[3] as { maxAgeMs?: number } | undefined;
      expect(
        opts?.maxAgeMs,
        "o panorama repassou maxAgeMs: 0 — é o recompute por etapa que a QA-4420-01 removeu",
      ).not.toBe(0);
    }
  });

  it("a leitura profunda com dado fresco continua existindo na ETAPA", async () => {
    // O caminho não sumiu, mudou de lugar: `/stages/{id}/cadeia-cac?fresh=1`
    // custa o recompute de UMA etapa, e é o que a doc manda usar.
    const { default: publicCadeiaCacRoutes } = await import("../routes/public-cadeia-cac.js");
    const rota = readFileSync(
      resolve(import.meta.dirname, "../routes/public-cadeia-cac.ts"),
      "utf8",
    );
    expect(publicCadeiaCacRoutes).toBeDefined();
    expect(rota).toContain("fresh");
  });
});
