import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

/**
 * Story 44.8 — `GET .../stages/:stageId/cadeia-cac`.
 *
 * Molde da Story 44.1 (`public-meta-campaigns-daily.test.ts`): banco mockado,
 * `Fastify()` cru, sem `app.ts`. A fila de `mockReturnValueOnce` acopla à ORDEM
 * das queries do handler — se o handler fizer três queries, a fila tem três.
 *
 * As vendas vêm por `vi.mock` de `sales-daily-sync` porque `getFreshSalesDaily`
 * lê planilha ao vivo quando o cache está velho, e isso não pertence a um teste
 * de rota.
 *
 * ⚠️ **Cada asserção foi verificada por REVERSÃO** — o defeito foi reintroduzido
 * de propósito para confirmar que o teste falha. Teste que não falha com o
 * defeito de volta não protege nada (o decorativo da 44.2, o lead-vira-zero da
 * 44.6, os dois defeitos da 44.7).
 */

const PROJ = "30000000-0000-4000-8000-000000000003";
const STAGE = "50000000-0000-4000-8000-000000000005";
const OUTRO_PROJ = "30000000-0000-4000-8000-000000000099";

const mockGetFreshSalesDaily = vi.fn();
vi.mock("../services/sales-daily-sync.js", () => ({
  getFreshSalesDaily: (...args: unknown[]) => mockGetFreshSalesDaily(...args),
}));

/** QA-448-02: só `resolveLeadSource` é mockado — `LEAD_ORIGIN_SCOPE` é o real. */
const mockResolveLeadSource = vi.fn();
vi.mock("../services/lead-origin-sync.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/lead-origin-sync.js")>();
  return { ...real, resolveLeadSource: (...args: unknown[]) => mockResolveLeadSource(...args) };
});

/**
 * QA-4412-01 — espião PASSTHROUGH de `calcularTetos`, para provar que a
 * cobertura chega ao 3º argumento.
 *
 * ## Por que espiar a chamada, e não o resultado
 *
 * O jeito honesto seria afirmar sobre o teto: janela com cobertura atípica
 * barrada → teto diferente. **Não dá, e a razão importa:** `leadsAtribuidos`
 * fica AUSENTE da série de propósito até a Story 44.3 existir
 * (`cadeia-cac-payload.ts:239-267`), então `convLP` nunca tem valor na família
 * gratuita, `calcularTetos` nunca produz teto de `convLP`, e a guarda nunca tem
 * janela para barrar. Nenhum comportamento observável muda se o fio for
 * cortado — foi assim que o buraco passou pelas 15 reversões.
 *
 * Enquanto isso, o único fato verificável é o CONTRATO DA CHAMADA: a série de
 * cobertura sai do cache e entra em `calcularTetos`. Quando a 44.3 ligar, este
 * teste deve ser promovido a asserção sobre o teto — e aí vira supérfluo.
 *
 * O spy DELEGA para a função real: nenhum outro teste do arquivo muda.
 */
const calcularTetosSpy = vi.fn();
vi.mock("@loyola-x/shared", async (importOriginal) => {
  const real = await importOriginal<typeof import("@loyola-x/shared")>();
  return {
    ...real,
    calcularTetos: (...args: Parameters<typeof real.calcularTetos>) => {
      calcularTetosSpy(...args);
      return real.calcularTetos(...args);
    },
  };
});

const { default: publicCadeiaCacRoutes } = await import("../routes/public-cadeia-cac.js");

const mockSelect = vi.fn();

/**
 * 1ª chamada = vínculo etapa↔funil↔projeto.
 *
 * ⚠️ Guarda o `where` e conta os `innerJoin`. Sem isso o teste de IDOR seria
 * DECORATIVO: com o banco mockado, o handler devolve 404 porque a fila entrega
 * `[]` — devolveria 404 igual mesmo que o filtro por `funnels.projectId` fosse
 * apagado. O que prova a defesa é o predicado ter sido MONTADO com o projectId
 * da URL, e é isso que `vinculoSpy` deixa inspecionar.
 */
const vinculoSpy: { innerJoins: number; where: unknown } = { innerJoins: 0, where: null };

function filaVinculo(vinculo: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: () => ({
      innerJoin: () => {
        vinculoSpy.innerJoins += 1;
        return {
          where: (cond: unknown) => {
            vinculoSpy.where = cond;
            return { limit: () => Promise.resolve(vinculo) };
          },
        };
      },
    }),
  });
}

/** Os valores literais que entraram no predicado montado pelo drizzle. */
function paramsDoWhere(): string[] {
  const out: string[] = [];
  const visitar = (n: unknown, prof = 0) => {
    if (prof > 8 || n === null || typeof n !== "object") return;
    for (const v of Object.values(n as Record<string, unknown>)) {
      if (typeof v === "string") out.push(v);
      else if (typeof v === "object") visitar(v, prof + 1);
    }
  };
  visitar(vinculoSpy.where);
  return out;
}

/** 2ª chamada = insights de `meta_ad_insights_daily`. */
function filaInsights(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(rows) }) });
}

/** 3ª chamada (só família gratuita) = cache de lead-origin. */
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
  // Story 44.9 AC4 — o `numeric` do Postgres chega como STRING.
  lpTemVsl: true,
  ticketMedioManual: "197.00",
  ...over,
});

/** ⚠️ A série só traz as campanhas VINCULADAS à etapa (`funnel_stages.campaigns`). */
const etapaCom = (ids: string[], over: Record<string, unknown> = {}) =>
  etapa({ campaigns: ids.map((id) => ({ id, name: `Campanha ${id}` })), ...over });

/**
 * Uma linha de insight. Os volumes default cruzam os pisos de confiança da
 * §4.1 numa janela de 7 dias: 10.000 impressões (cpm/cpc/ctr), 200 link clicks
 * (connectRate ≥ 100), 160 LP views (convLP ≥ 150).
 */
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

const TAXA_META = 0.1215;

/**
 * ⚠️ O `spend` é arredondado a 2 casas **POR DIA**, dentro de
 * `services/meta-campaign-daily.ts`, antes de somar. Não é detalhe: é o mesmo
 * arredondamento que a rota irmã `campaigns/daily` (Story 44.1) serve, e a
 * cadeia-cac reusa a série exatamente para que a aba e o agente Inácio vejam o
 * MESMO número. Somar bruto e arredondar no fim daria outro total — pequeno
 * (3,3e-6 relativo), mas divergente, que é o que o epic inteiro existe para
 * impedir.
 */
const spendDoDia = (bruto: number) => Math.round((bruto / (1 - TAXA_META)) * 100) / 100;
const spendTotal = (bruto: number, dias: number) => spendDoDia(bruto) * dias;

/** N dias de uma campanha, com o mesmo perfil. */
function diasDe(campaignId: string, n: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) =>
    linha({
      campaignId,
      campaignName: `Campanha ${campaignId}`,
      dateStart: `2026-08-${String(i + 1).padStart(2, "0")}`,
      ...over,
    }),
  );
}

const vendas = (over: Record<string, unknown> = {}) => ({
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
    ...over,
  },
  computedAt: new Date("2026-08-11T00:00:00Z"),
  source: "cache" as const,
});

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", { select: mockSelect } as unknown as Database);
});

/** QA-448-03: a rota lê `SALES_PUBLIC_MAX_AGE_SEC` daqui. */
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

async function buildApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(configStub);
  await app.register(apiKeyStub);
  await app.register(publicCadeiaCacRoutes);
  await app.ready();
  return app;
}

const url = (p = PROJ, s = STAGE, qs = "") =>
  `/api/public/meta/v1/projects/${p}/stages/${s}/cadeia-cac${qs}`;

beforeEach(() => {
  vinculoSpy.innerJoins = 0;
  vinculoSpy.where = null;
  mockSelect.mockReset();
  mockGetFreshSalesDaily.mockReset();
  mockGetFreshSalesDaily.mockResolvedValue(vendas());
  mockResolveLeadSource.mockReset();
  mockResolveLeadSource.mockResolvedValue(null);
  calcularTetosSpy.mockClear();
});

describe("cadeia-cac — vínculo e acesso (AC1)", () => {
  it("404 quando a etapa não pertence ao projeto da URL", async () => {
    // O `innerJoin` filtra por `funnels.projectId`, então o vínculo volta vazio.
    // Sem ele, a rota é IDOR: qualquer chave de API leria a etapa de qualquer
    // projeto — o buraco que a 43.7 abriu.
    filaVinculo([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url(OUTRO_PROJ) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "NOT_FOUND" });
    // 404, nunca 403: 403 confirmaria que a etapa existe.
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });

  it("o predicado do vínculo é montado com o projectId da URL, via innerJoin", async () => {
    // Esta é a asserção que realmente protege contra o IDOR. O 404 acima cai do
    // mock; o filtro só é provado inspecionando o predicado.
    filaVinculo([]);
    const app = await buildApp();
    await app.inject({ method: "GET", url: url(OUTRO_PROJ) });
    expect(vinculoSpy.innerJoins).toBe(1);
    const params = paramsDoWhere();
    expect(params).toContain(OUTRO_PROJ);
    expect(params).toContain(STAGE);
    await app.close();
  });

  it("400 quando o projectId não é uuid", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url("nao-e-uuid") });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("400 quando o range não é YYYY-MM-DD", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url(PROJ, STAGE, "?from=10/08/2026") });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("cadeia-cac — ausência vira motivo, nunca zero (AC8)", () => {
  it("etapa FORA da aba devolve 200 com motivo, não erro", async () => {
    filaVinculo([etapa({ stageType: "comercial" })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.familia).toBeNull();
    expect(body.motivo).toBe("foraDaAba");
    expect(body.message).toContain("comercial");
    await app.close();
  });

  it("etapa SEM campanha vinculada devolve motivo, não `dias: []` mudo", async () => {
    filaVinculo([etapa({ campaigns: [] })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.motivo).toBe("semDados");
    expect(body.semDados).toBe(true);
    expect(body.familia).toBe("paga");
    await app.close();
  });

  it("campanha vinculada SEM linha no cache sai com motivo semDados", async () => {
    filaVinculo([etapa()]);
    filaInsights([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.campanhas).toHaveLength(1);
    expect(body.campanhas[0].motivo).toBe("semDados");
    expect(body.campanhas[0].dias).toBeNull();
    await app.close();
  });

  it("teto sem base suficiente devolve TetoAusente com motivo, nunca um número", async () => {
    filaVinculo([etapa()]);
    // Volume abaixo de todos os pisos: nenhuma janela concorre.
    filaInsights([linha({ impressions: "500", actions: [{ action_type: "link_click", value: "5" }] })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.tetos.cpc.valor).toBeNull();
    expect(body.tetos.cpc.motivo).toBe("baseInsuficiente");
    expect(body.ranking).toEqual([]);
    await app.close();
  });
});

describe("cadeia-cac — o número principal (AC4)", () => {
  it("família PAGA devolve cacReal; a métrica é spend ÷ vendas do Loyola", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.familia).toBe("paga");
    expect(body.principal.metrica).toBe("cacReal");
    expect(body.principal.vendasReais).toBe(40);
    expect(body.principal.valor).toBeCloseTo(spendTotal(100, 10) / 40, 6);
    await app.close();
  });

  it("família GRATUITA devolve cplReal, com o lead único do Loyola", async () => {
    filaVinculo([etapa({ stageType: "free", name: "Captação Gratuita" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([
      { payload: { uniqueLeads: 500, totalLeads: 620, fonte: "planilha_leads" }, computedAt: new Date() },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.familia).toBe("gratuita");
    expect(body.principal.metrica).toBe("cplReal");
    expect(body.principal.leadsUnicos).toBe(500);
    expect(body.principal.valor).toBeCloseTo(spendTotal(100, 10) / 500, 6);
    // A rota de vendas nem é consultada na família gratuita.
    expect(mockGetFreshSalesDaily).not.toHaveBeenCalled();
    await app.close();
  });

  it("cacReal SAI mesmo com cobertura de atribuição 0% — a propriedade da v1.1", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    // A atribuição por campanha é indisponível...
    expect(body.atribuicao.coberturaVendas).toBeNull();
    expect(body.atribuicao.motivo).toBe("naoAtribuivel");
    // ...e o CAC real sai assim mesmo, porque depende do TOTAL da etapa.
    expect(body.principal.valor).not.toBeNull();
    expect(body.principal.valor).toBeGreaterThan(0);
    await app.close();
  });

  it("venda SEM data é declarada em vendasSemDataNoTotal, não some em silêncio", async () => {
    // `byDay` descarta linha sem data parseável (sales-daily-sync.ts:338),
    // `totalVendas` a mantém (:354). Sem declarar, o denominador do CAC vem
    // subcontado com range e o número sai ALTO sem nada avisar.
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    mockGetFreshSalesDaily.mockResolvedValue(vendas({ totalVendas: 47 })); // byDay soma 40
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().vendasSemDataNoTotal).toBe(7);
    await app.close();
  });

  it("com range, o denominador vem do byDay filtrado — e o range é respeitado", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: url(PROJ, STAGE, "?from=2026-08-01&to=2026-08-05"),
    });
    const body = res.json();
    expect(body.range).toEqual({ from: "2026-08-01", to: "2026-08-05" });
    expect(body.principal.vendasReais).toBe(20); // 5 dias × 4
    await app.close();
  });

  it("etapa paga sem fonte de venda devolve motivo, nunca CAC zero", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    mockGetFreshSalesDaily.mockResolvedValue({ payload: null, computedAt: null, source: "live" });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.principal.valor).toBeNull();
    expect(body.principal.motivo).toBe("semDados");
    await app.close();
  });
});

describe("cadeia-cac — unidades e imposto (AC6, AC7)", () => {
  it("o imposto Meta entra UMA única vez, e o payload declara", async () => {
    filaVinculo([etapa()]);
    filaInsights([linha({ spend: "100" })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    const esperado = spendDoDia(100); // 113,83
    expect(body.agregado.spend).toBeCloseTo(esperado, 2);
    // Ao quadrado daria 129,58 — o bug da 29.24, corrigido na 29.27.
    expect(body.agregado.spend).not.toBeCloseTo(esperado / (1 - TAXA_META), 2);
    expect(body.spendIncludesMetaTax).toBe(true);
    await app.close();
  });

  it("as taxas saem em DECIMAL e o payload declara a unidade", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.unidadeDasTaxas).toBe("decimal");
    expect(body.atuais.ctr).toBeCloseTo(0.02, 6); // 200 ÷ 10.000, nunca 2
    expect(body.atuais.connectRate).toBeCloseTo(0.8, 6); // 160 ÷ 200, nunca 80
    expect(body.atuais.convLP).toBeCloseTo(0.125, 6); // 20 ÷ 160
    // Dinheiro segue absoluto e o CPM na escala ÷ 1000 (a exceção da §2.5).
    expect(body.atuais.cpm).toBeCloseTo((spendTotal(100, 10) / 100_000) * 1000, 4);
    await app.close();
  });

  it("connectRate divide por linkClicks, não por clicks — o bug da 44.2", async () => {
    filaVinculo([etapa()]);
    // clicks (300) inclui curtida e clique no perfil; linkClicks (200) é tráfego.
    filaInsights([linha({ clicks: "300" })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.atuais.connectRate).toBeCloseTo(160 / 200, 6);
    expect(body.atuais.connectRate).not.toBeCloseTo(160 / 300, 6);
    await app.close();
  });
});

describe("cadeia-cac — composição e ranking (AC3, AC11)", () => {
  it("o ranking NÃO traz CPM nem CTR (QA-447-02)", async () => {
    filaVinculo([etapaCom(["c1", "c2"])]);
    // Duas campanhas com perfis diferentes para haver teto e gap.
    filaInsights([
      ...diasDe("c1", 10),
      ...diasDe("c2", 10, { spend: "50", actions: [
        { action_type: "link_click", value: "200" },
        { action_type: "landing_page_view", value: "190" },
        { action_type: "initiate_checkout", value: "40" },
      ] }),
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const metricas = res.json().ranking.map((i: { metrica: string }) => i.metrica);
    // ⚠️ QA-448-05: sem esta linha os dois `not.toContain` passariam com o
    // ranking VAZIO, e a asserção seria decorativa.
    expect(metricas.length).toBeGreaterThan(0);
    expect(metricas).not.toContain("cpm");
    expect(metricas).not.toContain("ctr");
    // CPM e CTR seguem com TETO calculado — decomporCPC precisa dos dois.
    expect(res.json().tetos.cpm).toHaveProperty("valor");
    await app.close();
  });

  it("o composto é rotulado cenário teórico", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().composto.rotulo).toBe("cenario-teorico");
    await app.close();
  });

  it("os benchmarks de mediana saem do endpoint, rotulados mediana histórica", async () => {
    filaVinculo([etapaCom(["c1", "c2", "c3"])]);
    filaInsights([
      ...diasDe("c1", 10, { spend: "100" }),
      ...diasDe("c2", 10, { spend: "200" }),
      ...diasDe("c3", 10, { spend: "3000" }),
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const b = res.json().benchmarks;
    expect(b.rotulo).toBe("mediana-historica");
    expect(b.campanhasElegiveis.cpc).toBe(3);
    // CPCs já tributados: 0,5692 (c1) · 1,1383 (c2) · 17,0746 (c3).
    // A mediana é o do meio; a MÉDIA seria 6,26 — puxada pela campanha cara.
    expect(b.medianas.cpc).toBeCloseTo(spendTotal(200, 10) / 2000, 6);
    expect(b.medianas.cpc).not.toBeCloseTo(
      (spendTotal(100, 10) + spendTotal(200, 10) + spendTotal(3000, 10)) / 3 / 2000,
      6,
    );
    expect(b.campanhasComSerie).toBe(3);
    await app.close();
  });
});

describe("cadeia-cac — a guarda de cobertura é declarada (AC5)", () => {
  it("família GRATUITA declara a guarda como indisponível, em vez de calar", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([{ payload: { uniqueLeads: 500, fonte: "planilha_leads" }, computedAt: new Date() }]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const g = res.json().guardaDeCobertura;
    expect(g.estado).toBe("indisponivel");
    expect(g.motivo).toBe("naoAtribuivel");
    expect(g.message).toContain("convLP");
    await app.close();
  });

  it("família PAGA declara que a guarda não se aplica — nem por omissão", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().guardaDeCobertura.estado).toBe("naoSeAplica");
    await app.close();
  });

  it("gratuita sem lead atribuído devolve convLP null, jamais zero (QA-446-01)", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([{ payload: { uniqueLeads: 500, fonte: "planilha_leads" }, computedAt: new Date() }]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.atuais.convLP).toBeNull();
    // Zero daria queda de 100% contra qualquer teto e a etapa sem dado
    // lideraria o ranking prometendo eliminar todo o custo.
    expect(body.ranking.map((i: { metrica: string }) => i.metrica)).not.toContain("convLP");
    await app.close();
  });
});

describe("cadeia-cac — falha de LEITURA não é ausência de FONTE (QA-448-01, QA-448-02)", () => {
  it("planilha inacessível devolve leituraFalhou, não \"não tem fonte conectada\"", async () => {
    // O defeito original: `.catch(() => null)` fundia as duas causas e afirmava
    // a segunda, mandando o operador conectar uma planilha já conectada. É o
    // chamado de 2026-08-14 que a Story 36.9 AC5 resolveu em public-leads.ts.
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    mockGetFreshSalesDaily.mockRejectedValue(new Error("Google Sheets: 403 PERMISSION_DENIED"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const p = res.json().principal;
    expect(p.motivo).toBe("leituraFalhou");
    expect(p.message).toContain("403 PERMISSION_DENIED");
    // A frase falsa não pode voltar por nenhum caminho.
    expect(p.message).not.toContain("não tem nenhuma fonte de vendas conectada");
    await app.close();
  });

  it("a falha de venda NÃO derruba teto, ranking e benchmarks, que estão corretos", async () => {
    // Por isso a rota não copia o 502 da irmã: lá a venda é o payload inteiro,
    // aqui é um campo só.
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    mockGetFreshSalesDaily.mockRejectedValue(new Error("timeout"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.tetos.cpc.valor).not.toBeNull();
    expect(body.benchmarks.medianas.cpc).not.toBeNull();
    expect(body.atuais.connectRate).toBeCloseTo(0.8, 6);
    await app.close();
  });

  it("gratuita SEM cache mas COM fonte diz syncPendente (espere), não semDados (configure)", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([]);
    mockResolveLeadSource.mockResolvedValue({ kind: "pesquisa", sheets: [{}] });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const p = res.json().principal;
    expect(p.motivo).toBe("syncPendente");
    expect(p.message).toContain("backfill-lead-origin");
    await app.close();
  });

  it("gratuita SEM cache e SEM fonte diz que rodar o sync não resolve", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([]);
    mockResolveLeadSource.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const p = res.json().principal;
    expect(p.motivo).toBe("semDados");
    expect(p.message).toContain("Rodar o sync não muda isso");
    await app.close();
  });
});

describe("cadeia-cac — política de frescor igual à da rota irmã (QA-448-03)", () => {
  it("usa SALES_PUBLIC_MAX_AGE_SEC em vez do default fixo de 120s", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    await app.inject({ method: "GET", url: url() });
    expect(mockGetFreshSalesDaily).toHaveBeenCalledWith(
      expect.anything(),
      PROJ,
      STAGE,
      { maxAgeMs: 300_000 },
    );
    await app.close();
  });

  it("`?fresh=1` força o recompute", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    await app.inject({ method: "GET", url: url(PROJ, STAGE, "?fresh=1") });
    expect(mockGetFreshSalesDaily).toHaveBeenCalledWith(expect.anything(), PROJ, STAGE, {
      maxAgeMs: 0,
    });
    await app.close();
  });
});

describe("cadeia-cac — resíduos da 2ª passada (QA-448-06, QA-448-07)", () => {
  it("checagem de fonte falhando devolve indeterminado, não \"não tem fonte conectada\"", async () => {
    // O padrão do QA-448-01 tinha voltado no código escrito para consertá-lo.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([]);
    mockResolveLeadSource.mockRejectedValue(new Error("connection terminated unexpectedly"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const p = res.json().principal;
    expect(p.motivo).toBe("indeterminado");
    expect(p.message).toContain("connection terminated");
    expect(p.message).not.toContain("Rodar o sync não muda isso");
    await app.close();
  });

  it("os três motivos da gratuita são distintos entre si", async () => {
    const cenarios = [
      { fonte: { kind: "pesquisa" }, erro: false, esperado: "syncPendente" },
      { fonte: null, erro: false, esperado: "semDados" },
      { fonte: null, erro: true, esperado: "indeterminado" },
    ];
    for (const c of cenarios) {
      mockSelect.mockReset();
      filaVinculo([etapa({ stageType: "free" })]);
      filaInsights(diasDe("c1", 10));
      filaLeadCache([]);
      mockResolveLeadSource.mockReset();
      if (c.erro) mockResolveLeadSource.mockRejectedValue(new Error("x"));
      else mockResolveLeadSource.mockResolvedValue(c.fonte);
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: url() });
      expect(res.json().principal.motivo).toBe(c.esperado);
      await app.close();
    }
  });

  it("vendasSemDataNoTotal é null quando nada foi lido, nunca 0", async () => {
    // `0` afirmaria "nenhuma venda sem data" sobre dado inexistente.
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    mockGetFreshSalesDaily.mockRejectedValue(new Error("403"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.principal.motivo).toBe("leituraFalhou");
    expect(body.vendasSemDataNoTotal).toBeNull();
    await app.close();
  });

  it("na família gratuita o diagnóstico de venda é null — não há venda para diagnosticar", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([{ payload: { uniqueLeads: 500, fonte: "planilha_leads" }, computedAt: new Date() }]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().vendasSemDataNoTotal).toBeNull();
    await app.close();
  });
});

describe("cadeia-cac — os campos da etapa que decidem o benchmark (QA-449-01)", () => {
  /**
   * ⚠️ Estes dois campos motivaram uma migration em PRODUÇÃO e são o que a aba
   * usa para escolher entre 4% e 7,5% de Conv. LP (spec §5). Sem teste, sumir
   * do payload passava em typecheck e em 522 testes — e na tela virava
   * "ninguém respondeu se a LP tem VSL", que é indistinguível do estado
   * legítimo. A pessoa iria preencher um campo já preenchido.
   */
  it("`lpTemVsl` e `ticketMedioManual` chegam ao payload", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    const body = res.json();
    expect(body.lpTemVsl).toBe(true);
    // `numeric` vem string do Postgres; o payload precisa entregar NÚMERO,
    // senão a comparação com o corte de R$147 vira comparação de string.
    expect(body.ticketMedioManual).toBe(197);
    expect(typeof body.ticketMedioManual).toBe("number");
    await app.close();
  });

  it("`false` e `null` em `lpTemVsl` são preservados como coisas diferentes", async () => {
    // `false` = respondido, não tem VSL (resposta final).
    // `null`  = ninguém respondeu (pede ação).
    // As duas levam a "sem benchmark", por caminhos com ações opostas.
    for (const [valor, esperado] of [[false, false], [null, null]] as const) {
      mockSelect.mockReset();
      filaVinculo([etapa({ lpTemVsl: valor })]);
      filaInsights(diasDe("c1", 10));
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: url() });
      expect(res.json().lpTemVsl).toBe(esperado);
      await app.close();
    }
  });

  it("ticket ausente vira null, nunca 0 — zero seria um ticket de R$0", async () => {
    filaVinculo([etapa({ ticketMedioManual: null })]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().ticketMedioManual).toBeNull();
    await app.close();
  });

  it("os dois campos saem também na etapa FORA da aba e na etapa sem campanha", async () => {
    // São config da etapa, não da série — quem abre a tela precisa deles para
    // saber o que preencher, inclusive quando não há dado de mídia.
    filaVinculo([etapa({ stageType: "comercial" })]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.json().lpTemVsl).toBe(true);
    await app.close();
  });
});

describe("cadeia-cac — os QUATRO estados da guarda de cobertura (Story 44.12)", () => {
  const cache = (payload: Record<string, unknown>) =>
    filaLeadCache([{ payload, computedAt: new Date("2026-08-11T00:00:00Z") }]);

  const serie = (n: number, atrib = 50) =>
    Array.from({ length: n }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      leadsAtribuidos: atrib,
      leadsTotais: 100,
    }));

  it("`aplicada` quando há cobertura com lead — e diz em quantos dias", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads", coberturaDiaria: serie(10) });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("aplicada");
    expect(g.dias).toBe(10);
    expect(g.message).toBeNull();
    await app.close();
  });

  it("`semLeadNoPeriodo` é DIFERENTE de não ter rodado", async () => {
    // Aqui o dado existe e está vazio — a guarda rodou e não teve como julgar.
    // Colapsar com `indisponivel` mandaria o operador rodar um backfill que não
    // muda nada.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 0,
      fonte: "planilha_leads",
      coberturaDiaria: [{ date: "2026-08-01", leadsAtribuidos: 0, leadsTotais: 0 }],
    });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("semLeadNoPeriodo");
    expect(g.dias).toBe(1);
    await app.close();
  });

  it("caso MISTO declara `leadsSemData` no topo — a série truncada não fica muda (QA-4412-03)", async () => {
    // Dias com lead E linhas sem data ao mesmo tempo: a guarda vai para
    // `aplicada`, onde `message` é null. Sem campo de topo, os leads que
    // ficaram de fora da série sumiam do payload — o oposto da regra 7.4, e o
    // padrão que `vendasSemDataNoTotal` já segue.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 500,
      fonte: "planilha_leads",
      coberturaDiaria: serie(10),
      leadsSemData: 213,
    });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    expect(body.guardaDeCobertura.estado).toBe("aplicada");
    expect(body.guardaDeCobertura.message).toBeNull();
    expect(body.leadsSemData).toBe(213);
    await app.close();
  });

  it("etapa SEM cache de lead devolve `leadsSemData: null`, não zero", async () => {
    // `0` afirmaria "nada ficou de fora"; `null` diz "não foi medido".
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    filaLeadCache([]);
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    expect(body.leadsSemData).toBeNull();
    await app.close();
  });

  it("a série de cobertura CHEGA ao `calcularTetos` — o fio da guarda (QA-4412-01)", async () => {
    // ⚠️ Este é o teste que faltava. Trocar o 3º argumento por `{}` deixava a
    // suíte inteira verde em 1267/11, o typecheck limpo, e o payload ainda
    // dizendo `estado: "aplicada"` — a guarda desligada anunciando que rodou.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    const cobertura = serie(10);
    cache({ uniqueLeads: 500, fonte: "planilha_leads", coberturaDiaria: cobertura });
    const app = await buildApp();
    await app.inject({ method: "GET", url: url() });

    expect(calcularTetosSpy).toHaveBeenCalledTimes(1);
    const [, familia, opts] = calcularTetosSpy.mock.calls[0] as [
      unknown,
      string,
      { coberturaDaEtapa?: unknown } | undefined,
    ];
    expect(familia).toBe("gratuita");
    // A MESMA série do cache, não uma vazia nem um `{}`.
    expect(opts?.coberturaDaEtapa).toEqual(cobertura);
    await app.close();
  });

  it("a guarda chega ao TETO, não só à chamada (44.10 AC7 — promove o QA-4412-01)", async () => {
    /**
     * Story 44.10 (AC7). O teste acima espia o ARGUMENTO de `calcularTetos`
     * porque, na 44.12, `leadsAtribuidos` não existia na série e o teto de
     * `convLP` era sempre `null` — não havia teto sobre o qual afirmar. Ficou
     * registrado no gate daquela story que a asserção subiria quando a
     * atribuição ligasse. É agora.
     *
     * Cenário: 14 dias, a primeira semana com rastreio ruim (50%) e conversão
     * APARENTE melhor. Sem guarda o teto vem dela; com guarda, não.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 14));
    const dias = Array.from({ length: 14 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    cache({
      uniqueLeads: 500,
      fonte: "planilha_leads",
      // 1ª semana: 50 de 100 (rastreio ruim). 2ª: 100 de 100.
      coberturaDiaria: dias.map((date, i) => ({ date, leadsAtribuidos: i < 7 ? 50 : 100, leadsTotais: 100 })),
      // A armadilha: a semana de rastreio ruim tem MAIS lead por LP view.
      leadsPorCampanhaDia: dias.map((date, i) => ({ campaignId: "c1", date, leads: i < 7 ? 80 : 16 })),
    });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();

    const teto = body.tetos.convLP;
    expect(teto.valor).not.toBeNull();

    // A janela vencedora carrega a cobertura que a guarda aprovou, e ela NÃO
    // pode ser a da primeira semana (50%, muito abaixo da mediana da etapa).
    expect(teto.coberturaJanela).toBeGreaterThan(0.5);

    // E a guarda reporta que trabalhou.
    expect(typeof teto.janelasBarradas).toBe("number");
    expect(teto.janelasBarradas).toBeGreaterThan(0);
    await app.close();
  });

  it("cache SEM cobertura não inventa opts — `calcularTetos` recebe `{}`", async () => {
    // O outro lado do fio: sem o campo, passar `{coberturaDaEtapa: undefined}`
    // faria `calcularTetos` receber uma chave que não existe.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads" });
    const app = await buildApp();
    await app.inject({ method: "GET", url: url() });

    const [, , opts] = calcularTetosSpy.mock.calls[0] as [unknown, string, object];
    expect(opts).toEqual({});
    await app.close();
  });

  it("série vazia por data ilegível NÃO é anunciada como \"nenhum lead\"", async () => {
    // Story 44.12 (Sessão 2). Medido em produção: `bbe-pr1-mar-26` tem 214 leads
    // e série vazia porque a coluna de data da planilha tem cabeçalho em branco.
    // Dizer "nenhum dia tem lead" ali é verdade sobre a série e mentira sobre a
    // etapa — e esconde a única ação que resolve: apontar a coluna de data.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 214,
      fonte: "planilha_leads",
      coberturaDiaria: [],
      leadsSemData: 213,
    });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("semLeadNoPeriodo");
    expect(g.message).toContain("213");
    expect(g.message).toContain("data não foi legível");
    await app.close();
  });

  it("o Atual da Conv. LP usa o numerador DEDUPLICADO, não a soma por campanha (QA-4410-01)", async () => {
    /**
     * O achado do gate. `agregar` soma `DiaBruto.leadsAtribuidos` de todas as
     * campanhas, e o mesmo lead pode estar em duas — ele preencheu a pesquisa
     * duas vezes no mesmo dia, por anúncios diferentes. Somar as respostas por
     * campanha para derivar uma taxa sobre denominador deduplicado é o que a
     * Story 44.3 proíbe (`campaign-attribution.ts:205-215`).
     *
     * Aqui a soma por campanha (2× o real) está deliberadamente inflada contra
     * a `coberturaDiaria`. Se o Atual vier dela, o número dobra.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 500,
      fonte: "planilha_leads",
      coberturaDiaria: serie(10), // 50 atribuídos/dia = 500 deduplicados
      leadsPorCampanhaDia: Array.from({ length: 10 }, (_, i) => ({
        campaignId: "c1",
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
        leads: 100, // o dobro: a sobreposição entre campanhas
      })),
    });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    // 500 deduplicados ÷ 1.600 LP views = 0,3125. Pela soma por campanha
    // daria 0,625 — o dobro.
    expect(body.atuais.convLP).toBeCloseTo(0.3125, 6);
    expect(body.tetos.convLP.valor).not.toBeNull();
    await app.close();
  });

  it("cache da 44.12 (sem `leadsPorCampanhaDia`) dá Atual sem teto — não zero, não ausente", async () => {
    /**
     * ⚠️ Desvio deliberado do AC2 literal, achado ao corrigir o QA-4410-01.
     *
     * O AC dizia que sem o campo novo a Conv. LP fica ausente inteira. Mas o
     * numerador do **Atual** é `Σ coberturaDiaria.leadsAtribuidos`, que existe
     * desde a 44.12 e **já está em produção**. Só o **teto** precisa da série
     * por campanha, porque ele percorre uma campanha por janela.
     *
     * Resultado: com o cache que já está no ar, a coluna Atual passa a mostrar
     * valor e o Teto continua `—`, em vez de ambos vazios. É mais informação,
     * não menos, e não exige esperar o backfill.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads", coberturaDiaria: serie(10) });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    expect(body.atuais.convLP).toBeCloseTo(0.3125, 6);
    expect(body.tetos.convLP.valor).toBeNull();
    await app.close();
  });

  it("cache anterior à 44.12 (sem `coberturaDiaria`) deixa Conv. LP `null` — ausente não é zero", async () => {
    /**
     * ⚠️ O teste que impede a regressão mais cara desta story. Preencher com
     * `0` onde não há fonte faria `convLP = 0` contra qualquer teto, o que dá
     * queda de 100% no ranking — e a etapa SEM DADO NENHUM lideraria "onde
     * atacar primeiro". É o defeito que o QA-446-01 evitou na 44.6.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads" });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    expect(body.atuais.convLP).toBeNull();
    expect(body.tetos.convLP.valor).toBeNull();
    await app.close();
  });

  it("dia sem lead atribuído conta ZERO, não ausente, quando há fonte (44.10 AC2)", async () => {
    // O outro lado: com o mapa presente, a campanha que rodou e não trouxe
    // lead naquele dia vale zero legítimo — não pode virar ausência.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 500,
      fonte: "planilha_leads",
      coberturaDiaria: serie(10),
      leadsPorCampanhaDia: [{ campaignId: "c1", date: "2026-08-01", leads: 16 }],
    });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    // O TETO é o que depende da série por campanha: os 9 dias sem entrada
    // valem zero legítimo (a campanha rodou e não trouxe lead), não ausência.
    expect(body.tetos.convLP.valor).not.toBeNull();
    await app.close();
  });

  it("`coberturaLeads` é razão de SOMAS, e `coberturaVendas` segue null (44.10 AC6)", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 500,
      fonte: "planilha_leads",
      // 10 dias de 50/100 → 500/1000 = 0,5
      coberturaDiaria: serie(10),
    });
    const app = await buildApp();
    const a = (await app.inject({ method: "GET", url: url() })).json().atribuicao;
    expect(a.coberturaLeads).toBeCloseTo(0.5, 6);
    expect(a.coberturaVendas).toBeNull();
    expect(a.motivo).toBeNull();
    await app.close();
  });

  it("a guarda declara janelas barradas e se o teto existe (44.10 AC4/AC5 — fecha QA-4412-11)", async () => {
    /**
     * O achado da validação visual: a tela dizia "o teto de Conv. LP considerou
     * 26 dia(s)" enquanto a tabela mostrava `sem alvo`. Sem numerador não há
     * teto, e a frase não pode nomeá-lo.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads", coberturaDiaria: serie(10) });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("aplicada");
    expect(g.tetoExiste).toBe(false); // é o que a frase precisa saber
    await app.close();
  });

  it("série vazia por falta de IDENTIFICADOR não é anunciada como \"nenhum lead\" nem como data ilegível (QA-4412-04)", async () => {
    /**
     * A terceira causa de série vazia, e a que a mensagem genérica descrevia
     * errado. No produtor, a linha só entra na cobertura se tiver `key`
     * (`lead-origin-sync.ts:537`) e `leadsSemData` só sobe com `key && !date`
     * (`:538`) — então série vazia COM `leadsSemData: 0` e leads > 0 só pode
     * significar que nenhuma linha tem e-mail nem telefone.
     *
     * Medido: `fz-l2-jun-26 / Captação Paga`, 128 leads, colunas `email` e
     * `telefone` 0 de 128 preenchidas. A frase antiga mandava procurar cadastro
     * que existe; a ação certa é mapear a coluna do identificador.
     */
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 0,
      totalLeads: 128,
      fonte: "planilha_leads",
      coberturaDiaria: [],
      leadsSemData: 0,
      identifiersFilled: { email: 0, phone: 0 },
    });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("semLeadNoPeriodo");
    expect(g.message).toContain("128");
    expect(g.message).toContain("e-mail ou telefone");
    // E NÃO pode culpar a data nem afirmar que ninguém se cadastrou.
    expect(g.message).not.toContain("data não foi legível");
    expect(g.message).not.toContain("nenhum dia do período tem lead");
    await app.close();
  });

  it("com identificador preenchido, série vazia volta a ser a mensagem genérica (QA-4412-04)", async () => {
    // O contrapeso: o ramo novo não pode sequestrar o caso em que os leads
    // TÊM identificador e a série está vazia por outro motivo.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({
      uniqueLeads: 3,
      totalLeads: 3,
      fonte: "planilha_leads",
      coberturaDiaria: [],
      leadsSemData: 0,
      identifiersFilled: { email: 3, phone: 0 },
    });
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("semLeadNoPeriodo");
    expect(g.message).toContain("nenhum dia do período tem lead");
    expect(g.message).not.toContain("e-mail ou telefone");
    await app.close();
  });

  it("`indisponivel` quando o cache é ANTERIOR à 44.12 e não tem o campo", async () => {
    // ⚠️ É o estado real de toda etapa já cacheada no dia do deploy: o código
    // pode estar perfeito e a guarda continua desligada até o sync reprocessar.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads" }); // sem coberturaDiaria
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("indisponivel");
    expect(g.message).toContain("backfill-lead-origin");
    await app.close();
  });

  it("cache velho não quebra — nada de `undefined.length`", async () => {
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 500, fonte: "planilha_leads" });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: url() });
    expect(res.statusCode).toBe(200);
    expect(res.json().principal.valor).not.toBeNull();
    await app.close();
  });

  it("`naoSeAplica` na família paga, sem ler cache de lead", async () => {
    filaVinculo([etapa()]);
    filaInsights(diasDe("c1", 10));
    const app = await buildApp();
    const g = (await app.inject({ method: "GET", url: url() })).json().guardaDeCobertura;
    expect(g.estado).toBe("naoSeAplica");
    await app.close();
  });

  it("o cache de lead é lido UMA vez, e serve à guarda e ao cplReal", async () => {
    // A AC4 exige a reordenação justamente para não duplicar a query. Se
    // alguém voltar a ler no ramo do cplReal, a fila do mock acaba e o teste
    // quebra com `undefined`.
    filaVinculo([etapa({ stageType: "free" })]);
    filaInsights(diasDe("c1", 10));
    cache({ uniqueLeads: 400, fonte: "planilha_leads", coberturaDiaria: serie(10) });
    const app = await buildApp();
    const body = (await app.inject({ method: "GET", url: url() })).json();
    expect(body.guardaDeCobertura.estado).toBe("aplicada");
    expect(body.principal.leadsUnicos).toBe(400);
    expect(mockSelect).toHaveBeenCalledTimes(3); // vínculo, insights, cache
    await app.close();
  });
});
