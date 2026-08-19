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
