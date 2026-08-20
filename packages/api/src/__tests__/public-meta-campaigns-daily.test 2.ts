import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import publicMetaRoutes from "../routes/public-meta.js";

/**
 * Story 44.1 — `GET .../stages/:stageId/campaigns/daily`.
 *
 * Não havia teste de rota em `public-meta.ts`. Esta é a infra: um `db` mockado
 * que responde às duas formas de query que o handler faz — a de vínculo
 * (`select().from().innerJoin().where().limit()`) e a de insights
 * (`select().from().where()`).
 *
 * O que os testes travam é o que a spec da aba não pode perder: o vínculo
 * etapa↔funil↔projeto, a distinção entre "não rodou" e "rodou e deu zero", a
 * ausência de taxa derivada no payload e o gross-up aplicado uma única vez.
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const STAGE = "50000000-0000-4000-8000-000000000005";
const OUTRO_PROJ = "30000000-0000-4000-8000-000000000099";

const mockSelect = vi.fn();

/** Fila de respostas: 1ª chamada = vínculo, 2ª = insights. */
function filaDeQueries(vinculo: unknown[], insights: unknown[]) {
  mockSelect
    .mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(vinculo) }) }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve(insights) }),
    });
}

const linha = (over: Record<string, unknown> = {}) => ({
  campaignId: "c1",
  campaignName: "Campanha 1",
  dateStart: "2026-08-10",
  spend: "100",
  impressions: "1000",
  reach: "900",
  clicks: "50",
  actions: [
    { action_type: "link_click", value: "40" },
    { action_type: "landing_page_view", value: "30" },
    { action_type: "initiate_checkout", value: "5" },
    { action_type: "lead", value: "8" },
  ],
  actionValues: null,
  lastSyncedAt: new Date("2026-08-11T00:00:00Z"),
  ...over,
});

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect } as unknown as Database);
});

/** Injeta uma apiKey válida para o `requireScope` deixar passar. */
const apiKeyStub = fp(async (fastify) => {
  // Sem `decorateRequest`: o plugin real (`api-key-auth`) é quem decora, e aqui
  // ele não é registrado. Atribuir no hook basta para o `requireScope` enxergar.
  fastify.addHook("onRequest", async (request) => {
    (request as { apiKey?: unknown }).apiKey = {
      id: "k1",
      projectId: null,
      scopes: ["meta:read", "public:read", "*"],
    };
  });
});

async function buildApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(apiKeyStub);
  await app.register(publicMetaRoutes);
  await app.ready();
  return app;
}

const url = (p = PROJ, s = STAGE) =>
  `/api/public/meta/v1/projects/${p}/stages/${s}/campaigns/daily`;

describe("campaigns/daily — vínculo e acesso", () => {
  beforeEach(() => mockSelect.mockReset());

  it("404 quando a etapa não pertence ao projeto da URL", async () => {
    const app = await buildApp();
    filaDeQueries([], []); // o innerJoin não encontra a cadeia
    const res = await app.inject({ method: "GET", url: url(OUTRO_PROJ) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("400 para uuid inválido", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url("nao-e-uuid") });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("campaigns/daily — payload", () => {
  beforeEach(() => mockSelect.mockReset());

  it("etapa sem campanha vinculada devolve lista vazia, não erro", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "Captação", campaigns: [] }], []);
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.campanhas).toEqual([]);
    expect(b.fonte).toBe("ad-level");
    await app.close();
  });

  it("agrega por campanha e por dia, somando as linhas de anúncio", async () => {
    const app = await buildApp();
    filaDeQueries(
      [{ id: STAGE, name: "Captação", campaigns: [{ id: "c1" }] }],
      [linha(), linha(), linha({ dateStart: "2026-08-11", spend: "50", impressions: "500" })],
    );
    const res = await app.inject({ method: "GET", url: url() });
    const c = res.json().campanhas[0];
    expect(c.campaignId).toBe("c1");
    expect(c.days).toHaveLength(2);
    // dia 10 tem duas linhas de ad somadas
    expect(c.days[0].date).toBe("2026-08-10");
    expect(c.days[0].impressions).toBe(2000);
    expect(c.days[0].linkClicks).toBe(80);
    expect(c.days[0].landingPageViews).toBe(60);
    expect(c.days[0].checkouts).toBe(10);
    // ordenado por data
    expect(c.days[1].date).toBe("2026-08-11");
    await app.close();
  });

  /**
   * A distinção que a regra 4 do prompt mestre exige: campanha vinculada sem
   * NENHUMA linha no cache não "rodou e deu zero" — não se sabe se rodou.
   */
  it("campanha vinculada sem dado vem com days:null e motivo, nunca days:[]", async () => {
    const app = await buildApp();
    filaDeQueries(
      [{ id: STAGE, name: "Captação", campaigns: [{ id: "c1" }, { id: "c-sem-dado" }] }],
      [linha()],
    );
    const b = (await app.inject({ method: "GET", url: url() })).json();
    const sem = b.campanhas.find((c: { campaignId: string }) => c.campaignId === "c-sem-dado");
    expect(sem.days).toBeNull();
    expect(sem.motivo).toBe("semDados");
    expect(sem.days).not.toEqual([]);
    await app.close();
  });

  /**
   * Toda taxa é razão de somas sobre o período que o consumidor escolher.
   * Devolver `cpm`/`ctr` por dia convidaria a tirar média de médias diárias.
   */
  it("NÃO devolve taxa derivada — só brutos somáveis", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }], [linha()]);
    const dia = (await app.inject({ method: "GET", url: url() })).json().campanhas[0].days[0];
    for (const proibido of ["cpm", "ctr", "cpc", "ctrLink", "cpcLink", "connectRate", "lpRate", "checkoutRate"]) {
      expect(dia).not.toHaveProperty(proibido);
    }
    expect(Object.keys(dia).sort()).toEqual(
      ["checkouts", "date", "impressions", "landingPageViews", "leadsProxyPixel", "linkClicks", "purchasesProxyPixel", "revenueProxyPixel", "spend"].sort(),
    );
    await app.close();
  });

  it("campos de pixel saem com o sufixo que os denuncia", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }], [linha()]);
    const dia = (await app.inject({ method: "GET", url: url() })).json().campanhas[0].days[0];
    expect(dia.leadsProxyPixel).toBe(8);
    // sem sufixo não pode existir — seria confundido com o número do Loyola
    expect(dia).not.toHaveProperty("leads");
    expect(dia).not.toHaveProperty("purchases");
    expect(dia).not.toHaveProperty("revenue");
    await app.close();
  });

  /**
   * `applyMetaTax` faz gross-up de 12,15% para datas ≥ 2026-01-01. Aplicar duas
   * vezes já aconteceu (Story 29.27) e o erro passa despercebido porque o número
   * continua plausível.
   */
  it("aplica o imposto Meta uma única vez", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }], [linha({ spend: "100" })]);
    const b = (await app.inject({ method: "GET", url: url() })).json();
    // 100 / (1 - 0.1215) = 113.8304…
    expect(b.campanhas[0].days[0].spend).toBeCloseTo(113.83, 2);
    // E o ponto do teste: aplicar duas vezes daria 129.56. Asserção explícita
    // porque 129 continua sendo um número plausível de spend — foi assim que o
    // bug da Story 29.27 passou despercebido.
    expect(b.campanhas[0].days[0].spend).toBeLessThan(120);
    expect(b.spendIncludesMetaTax).toBe(true);
    await app.close();
  });

  it("não aplica imposto em data anterior à vigência", async () => {
    const app = await buildApp();
    filaDeQueries(
      [{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }],
      [linha({ dateStart: "2025-12-31", spend: "100" })],
    );
    const b = (await app.inject({ method: "GET", url: url() })).json();
    expect(b.campanhas[0].days[0].spend).toBe(100);
    await app.close();
  });

  it("preserva a ordem das campanhas vinculadas à etapa", async () => {
    const app = await buildApp();
    filaDeQueries(
      [{ id: STAGE, name: "S", campaigns: [{ id: "c2" }, { id: "c1" }] }],
      [linha(), linha({ campaignId: "c2", campaignName: "Campanha 2" })],
    );
    const b = (await app.inject({ method: "GET", url: url() })).json();
    expect(b.campanhas.map((c: { campaignId: string }) => c.campaignId)).toEqual(["c2", "c1"]);
    await app.close();
  });
});

/**
 * Story 44.2 — o denominador do `connectRate`.
 *
 * O bug: dividia por `clicks` (cliques TOTAIS — curtida, comentário, clique no
 * perfil) em vez de `linkClicks`. Medido em produção, o número público saía 18 a
 * 35 pontos percentuais abaixo do interno: 25,7% contra 60,5% numa mesma etapa.
 *
 * O fixture usa `clicks` ≠ `linkClicks` de propósito. Com os dois iguais, o
 * teste passaria com a implementação errada e não provaria nada.
 */
describe("connectRate — denominador (Story 44.2)", () => {
  beforeEach(() => mockSelect.mockReset());

  it("divide por linkClicks, não por clicks", async () => {
    const app = await buildApp();
    // clicks=200 (totais) · link_click=100 · landing_page_view=80
    //   certo : 80/100 = 80%
    //   errado: 80/200 = 40%
    filaDeQueries(
      [{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }],
      [
        linha({
          clicks: "200",
          actions: [
            { action_type: "link_click", value: "100" },
            { action_type: "landing_page_view", value: "80" },
          ],
        }),
      ],
    );
    // O endpoint de série por campanha não devolve taxa (Story 44.1), então o
    // que se verifica aqui são os brutos que alimentam a conta — e que eles
    // saem distintos, que é o que torna o denominador observável.
    const dia = (await app.inject({ method: "GET", url: url() })).json().campanhas[0].days[0];
    expect(dia.linkClicks).toBe(100);
    expect(dia.landingPageViews).toBe(80);
    // `clicks` não é exposto: quem consumir não tem como dividir pelo errado.
    expect(dia).not.toHaveProperty("clicks");
    await app.close();
  });
});

/**
 * QA-44-02 — a correção da 44.2 mora em `deriveMetrics`, e o teste acima NÃO
 * passa por lá: o endpoint de série por campanha não devolve taxa nenhuma, de
 * propósito. Verificado no gate revertendo a linha para `a.clicks` — a suíte
 * inteira continuava verde.
 *
 * Estes testes exercitam o caminho real. `/stages/:stageId/daily` chama
 * `deriveMetrics` e tem a mesma forma de query (vínculo → insights), então
 * reutiliza o mesmo harness.
 *
 * O fixture usa `clicks` (200) ≠ `linkClicks` (100) de propósito: com os dois
 * iguais o teste passaria com o denominador errado e não provaria nada.
 */
const urlStageDaily = (p = PROJ, s = STAGE) =>
  `/api/public/meta/v1/projects/${p}/stages/${s}/daily`;

describe("deriveMetrics — connectRate divide por linkClicks (Story 44.2)", () => {
  beforeEach(() => mockSelect.mockReset());

  /** clicks=200 · link_click=100 · landing_page_view=80 → 80% (errado seria 40%). */
  const linhaComClicksDistintos = () =>
    linha({
      clicks: "200",
      actions: [
        { action_type: "link_click", value: "100" },
        { action_type: "landing_page_view", value: "80" },
      ],
    });

  it("connectRate = lpViews ÷ linkClicks, NÃO ÷ clicks", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }], [linhaComClicksDistintos()]);
    const dia = (await app.inject({ method: "GET", url: urlStageDaily() })).json().days[0];
    expect(dia.connectRate).toBe(80);
    // O valor do denominador antigo, explicitado para que a intenção do teste
    // sobreviva a quem só lê o assert.
    expect(dia.connectRate).not.toBe(40);
    await app.close();
  });

  it("lpRate acompanha connectRate — mesmo valor, mesmo denominador", async () => {
    const app = await buildApp();
    filaDeQueries([{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }], [linhaComClicksDistintos()]);
    const dia = (await app.inject({ method: "GET", url: urlStageDaily() })).json().days[0];
    expect(dia.lpRate).toBe(80);
    expect(dia.lpRate).toBe(dia.connectRate);
    await app.close();
  });

  /** Denominador zero devolve `null`, não `0` — "não dá para saber" ≠ "0%". */
  it("sem link click, connectRate é null e não 0", async () => {
    const app = await buildApp();
    filaDeQueries(
      [{ id: STAGE, name: "S", campaigns: [{ id: "c1" }] }],
      [
        linha({
          clicks: "200", // cliques totais existem...
          actions: [{ action_type: "landing_page_view", value: "80" }], // ...mas nenhum no link
        }),
      ],
    );
    const dia = (await app.inject({ method: "GET", url: urlStageDaily() })).json().days[0];
    expect(dia.connectRate).toBeNull();
    expect(dia.lpRate).toBeNull();
    await app.close();
  });
});
