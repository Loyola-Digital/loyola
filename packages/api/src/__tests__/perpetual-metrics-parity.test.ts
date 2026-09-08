import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { Database } from "../db/client.js";
import {
  funnels,
  funnelStages,
  funnelSpreadsheets,
  projects,
  metaAdInsightsDaily,
} from "../db/schema.js";

/**
 * Story 44.28 (AC5) — **paridade entre a rota autenticada e a pública.**
 *
 * ## Por que este teste existe
 *
 * A T3 desta story tirou 700 linhas de dentro de dois handlers e as pôs num
 * service, para que o painel (autenticado, Clerk) e o agente Inácio (público,
 * API key) leiam a MESMA função. Enquanto ninguém mexer, os dois batem por
 * construção.
 *
 * O risco não é hoje — é a refatoração de daqui a seis meses que acrescenta um
 * filtro, um arredondamento ou uma janela **em um lado só**. A divergência
 * apareceria em produção como *"o CAC do Resumão não bate com o do painel"*, que
 * é exatamente a queixa que abriu o Epic 44 e custou um ano no `connectRate`.
 *
 * ## Por que o banco falso é endereçado por TABELA, e não por ordem de query
 *
 * O molde da 44.1/44.8 enfileira respostas na ORDEM das queries do handler.
 * Aqui isso não serve: as duas rotas consultam em ordens diferentes (a pública
 * resolve o funil e as campanhas antes das vendas; a autenticada checa o
 * projeto primeiro), e uma fila obrigaria a duas fixtures — que é justamente o
 * jeito de um teste de paridade comparar coisas diferentes e passar.
 *
 * Endereçando por tabela, **os dois lados leem os mesmos bytes**, e o que sobra
 * de diferente entre as respostas é diferença de código, que é o que se quer
 * medir.
 *
 * ## ⚠️ Verificado por REVERSÃO
 *
 * Cada asserção foi confirmada reintroduzindo o defeito que ela deveria pegar —
 * ver o bloco no fim do arquivo. Teste que não falha com o defeito de volta não
 * protege nada.
 */

// ── a planilha falsa ────────────────────────────────────────────
//
// `ana@` compra em DOIS dias. É o caso que separa as duas réguas: ela é UM
// comprador no total do período e DUAS vendas-dia na série. Sem ela, as duas
// contagens coincidiriam e o teste passaria sem testar a distinção.
const LINHAS = [
  ["ana@x.com", "t1", "Curso", "100,00", "80,00", "pix", "01/09/2026", "paid", "fb", "cpc", "ad1", "camp1", "quente"],
  ["bob@x.com", "t2", "Curso", "200,00", "160,00", "pix", "01/09/2026", "paid", "fb", "cpc", "ad1", "camp1", "frio"],
  ["ana@x.com", "t3", "Bump", "50,00", "40,00", "pix", "03/09/2026", "paid", "fb", "cpc", "ad2", "camp1", "quente"],
  ["carl@x.com", "t4", "Curso", "300,00", "240,00", "pix", "03/09/2026", "recusada", "fb", "cpc", "ad2", "camp1", "frio"],
];
const CABECALHO = [
  "email", "id", "produto", "bruto", "liquido", "forma",
  "data", "status", "utm_source", "utm_medium", "utm_content", "utm_campaign", "utm_term",
];

const mockReadSheetData = vi.fn();
vi.mock("../services/google-sheets.js", () => ({
  readSheetData: (...a: unknown[]) => mockReadSheetData(...a),
}));

const { default: rotasPublicas } = await import("../routes/public-perpetual-metrics.js");
const { default: rotasInternas } = await import("../routes/perpetual-sales-data.js");

const PROJ = "30000000-0000-4000-8000-000000000001";
const FUNIL = "40000000-0000-4000-8000-000000000002";

const PLANILHA = {
  id: "s1",
  funnelId: FUNIL,
  type: "perpetual_sales",
  spreadsheetId: "sheet-1",
  sheetName: "Vendas",
  platform: "kiwify",
  productTypes: { Curso: "principal", Bump: "order_bump" },
  columnMapping: {
    email: "email",
    transactionId: "id",
    productName: "produto",
    valorBruto: "bruto",
    valorLiquido: "liquido",
    formaPagamento: "forma",
    dataVenda: "data",
    status: "status",
    utm_source: "utm_source",
    utm_medium: "utm_medium",
    utm_content: "utm_content",
    utm_campaign: "utm_campaign",
    utm_term: "utm_term",
  },
};

const INSIGHTS = [
  {
    campaignId: "camp1", campaignName: "Camp 1", dateStart: "2026-09-01",
    spend: "100", impressions: 10_000, reach: 8_000, clicks: 300,
    actions: [
      { action_type: "link_click", value: "200" },
      { action_type: "landing_page_view", value: "150" },
      { action_type: "initiate_checkout", value: "20" },
    ],
    actionValues: [], lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
  },
  {
    campaignId: "camp1", campaignName: "Camp 1", dateStart: "2026-09-03",
    spend: "150", impressions: 12_000, reach: 9_000, clicks: 400,
    actions: [
      { action_type: "link_click", value: "250" },
      { action_type: "landing_page_view", value: "180" },
      { action_type: "initiate_checkout", value: "25" },
    ],
    actionValues: [], lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
  },
];

/** O que cada tabela devolve. Sem ordem — as duas rotas leem os mesmos bytes. */
const TABELAS = new Map<unknown, unknown[]>();

/**
 * Um encadeamento que aceita as formas que as duas rotas usam:
 * `.where().limit()`, `.where()` direto (await), `.orderBy()`, `.innerJoin()`.
 * Todas resolvem para as MESMAS linhas da tabela pedida.
 */
function encadeamento(linhas: unknown[]) {
  const alvo = Promise.resolve(linhas);
  const no: Record<string, unknown> = {
    then: (...a: Parameters<Promise<unknown>["then"]>) => alvo.then(...a),
    catch: (...a: Parameters<Promise<unknown>["catch"]>) => alvo.catch(...a),
    finally: (...a: Parameters<Promise<unknown>["finally"]>) => alvo.finally(...a),
  };
  for (const m of ["where", "limit", "orderBy", "innerJoin", "groupBy"]) no[m] = () => no;
  return no;
}

const db = {
  select: () => ({ from: (t: unknown) => encadeamento(TABELAS.get(t) ?? []) }),
} as unknown as Database;

async function montarApp() {
  const app = Fastify({ logger: false });
  app.decorate("db", db);
  app.decorate("config", {} as never);
  // Sem `decorateRequest`: `apiKey` já é opcional na augmentação de
  // `FastifyRequest` (`types/index.ts:10`), e decorar com `null` não tipa.
  // O que as duas rotas leem é o objeto abaixo — a autenticação de verdade
  // (hash da chave, revogação, rate limit) é assunto do `api-key-auth.test.ts`.
  app.addHook("onRequest", async (req) => {
    req.apiKey = { id: "k1", scopes: ["meta:read"] };
    req.userId = "u1";
    req.userRole = "admin";
  });
  await app.register(rotasPublicas);
  await app.register(rotasInternas);
  return app;
}

const DE = "2026-09-01";
const ATE = "2026-09-07";

beforeEach(() => {
  mockReadSheetData.mockReset();
  mockReadSheetData.mockResolvedValue({ headers: CABECALHO, rows: LINHAS });
  TABELAS.clear();
  TABELAS.set(projects, [{ id: PROJ }]);
  TABELAS.set(funnels, [{ id: FUNIL, projectId: PROJ, name: "Perpétuo", type: "perpetual" }]);
  TABELAS.set(funnelStages, [{ campaigns: ["camp1"] }]);
  TABELAS.set(funnelSpreadsheets, [PLANILHA]);
  TABELAS.set(metaAdInsightsDaily, INSIGHTS);
});

async function respostas() {
  const app = await montarApp();
  const pub = await app.inject({
    method: "GET",
    url: `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?from=${DE}&to=${ATE}`,
  });
  const aut = await app.inject({
    method: "GET",
    url: `/api/projects/${PROJ}/funnels/${FUNIL}/perpetual/sales-data?startDate=${DE}&endDate=${ATE}`,
  });
  const diaria = await app.inject({
    method: "GET",
    url: `/api/projects/${PROJ}/funnels/${FUNIL}/perpetual/sales-data-daily?startDate=${DE}&endDate=${ATE}`,
  });
  await app.close();
  expect(pub.statusCode).toBe(200);
  expect(aut.statusCode).toBe(200);
  expect(diaria.statusCode).toBe(200);
  return { pub: pub.json(), aut: aut.json(), diaria: diaria.json() };
}

describe("Story 44.28 AC5 — a rota pública e a autenticada dão o mesmo número", () => {
  it("a fixture produz vendas de verdade (senão tudo abaixo compararia zeros)", async () => {
    const { aut } = await respostas();
    // 2 compradores: ana (100 + 50, duas linhas) e bob (200). `carl` é
    // "recusada" e não é receita (Story 29.26).
    expect(aut.totalVendas).toBe(2);
    expect(aut.faturamentoBruto).toBe(350);
  });

  it("`vendas` da pública é `totalVendas` da autenticada", async () => {
    const { pub, aut } = await respostas();
    expect(pub.vendas).toBe(aut.totalVendas);
  });

  it("faturamento bruto e líquido calculado batem nos dois lados", async () => {
    const { pub, aut } = await respostas();
    expect(pub.faturamentoBruto).toBe(aut.faturamentoBruto);
    expect(pub.faturamentoLiquidoCalculado).toBe(aut.faturamentoLiquidoCalculado);
  });

  it("ticket médio bate", async () => {
    const { pub, aut } = await respostas();
    expect(pub.ticketMedioBruto).toBe(aut.ticketMedioBruto);
  });

  it("os reembolsos vêm da mesma leitura", async () => {
    const { pub, aut } = await respostas();
    expect(pub.reembolsos.quantidade).toBe(aut.vendasReembolsadas);
    expect(pub.reembolsos.medido).toBe(aut.reembolsoReal);
  });

  it("a série diária da pública é a mesma do endpoint diário", async () => {
    const { pub, diaria } = await respostas();
    for (const dia of pub.serieDiaria) {
      expect(dia.vendasNoDia).toBe(diaria.salesByDay[dia.date] ?? 0);
      expect(dia.faturamentoBruto).toBe(diaria.byDay[dia.date] ?? 0);
    }
  });

  it("o CAC é o investimento sobre COMPRADORES, não sobre vendas-dia", async () => {
    const { pub } = await respostas();
    // spend tributado: (100 + 150) ÷ (1 − 0,1215) = 284,58
    expect(pub.investimento).toBeCloseTo(250 / (1 - 0.1215), 2);
    expect(pub.cac).toBeCloseTo(pub.investimento / pub.vendas, 6);
    // ⚠️ E NÃO sobre a soma da série — que é 3, não 2.
    const somaDaSerie = pub.serieDiaria.reduce(
      (s: number, d: { vendasNoDia: number }) => s + d.vendasNoDia,
      0,
    );
    expect(pub.cac).not.toBeCloseTo(pub.investimento / somaDaSerie, 6);
  });
});

describe("as duas contagens são diferentes DE PROPÓSITO", () => {
  it("Σ vendasNoDia > vendas quando alguém compra em dois dias", async () => {
    const { pub } = await respostas();
    const soma = pub.serieDiaria.reduce(
      (s: number, d: { vendasNoDia: number }) => s + d.vendasNoDia,
      0,
    );
    // `ana@` comprou em 01/09 e 03/09: UM comprador, DUAS vendas-dia.
    expect(pub.vendas).toBe(2);
    expect(soma).toBe(3);
    expect(soma).toBeGreaterThan(pub.vendas);
  });

  it("o campo que carrega a régua do dia se chama `vendasNoDia`, nunca `vendas`", async () => {
    const { pub } = await respostas();
    // AC1: expor as duas com o mesmo nome é o defeito que esta story evita.
    expect(pub.serieDiaria[0]).toHaveProperty("vendasNoDia");
    expect(pub.serieDiaria[0]).not.toHaveProperty("vendas");
    expect(pub.unidadeDeVendas).toBe("compradores únicos no período");
  });
});

describe("ausência é ausência, e zero medido é zero", () => {
  it("planilha COM linhas, nenhuma na janela → vendas 0 (medimos e deu zero)", async () => {
    // Linhas de julho, janela de setembro: a planilha existe, foi lida, e não
    // há venda no período. `semDados: false` — o ramo `dedupMap.size === 0` em
    // `perpetual-sales.ts:484`.
    mockReadSheetData.mockResolvedValue({
      headers: CABECALHO,
      rows: LINHAS.map((l) => l.map((c, i) => (i === 6 ? "01/07/2026" : c))),
    });
    const { pub, aut } = await respostas();
    // ⚠️ A regressão real desta sessão: um guard de `platform !== null`
    // transformava este caso em `vendas: null`, porque o payload vazio traz
    // `platform: null`. "Nenhuma venda no período" é informação de gestão;
    // "sem dado" manda o leitor caçar um defeito que não existe.
    expect(aut.semDados).toBe(false);
    expect(pub.vendas).toBe(0);
    expect(pub.faturamentoBruto).toBe(0);
    // Sem comprador não há custo por comprador — `null`, não `0`.
    expect(pub.cac).toBeNull();
  });

  it("planilha VAZIA é outra coisa: `vendas` fica `null`", async () => {
    // A distinção que a de cima protege só existe se este caso for diferente.
    // Zero linha lida = não há o que medir (`semDados: true`), e aí `null` é a
    // resposta certa. Misturar os dois foi o erro da primeira versão deste teste.
    mockReadSheetData.mockResolvedValue({ headers: CABECALHO, rows: [] });
    const { pub, aut } = await respostas();
    expect(aut.semDados).toBe(true);
    expect(pub.vendas).toBeNull();
  });

  it("sem campanha vinculada, investimento e ROAS são `null` e as vendas continuam", async () => {
    TABELAS.set(funnelStages, [{ campaigns: [] }]);
    const { pub } = await respostas();
    expect(pub.investimento).toBeNull();
    expect(pub.roas).toBeNull();
    expect(pub.cac).toBeNull();
    expect(pub.cadeia).toBeNull();
    // Story 29.10: a margem sem mídia é a receita líquida inteira.
    expect(pub.vendas).toBe(2);
    expect(pub.margem).toBe(pub.faturamentoLiquidoCalculado);
  });

  it("funil inexistente é 404, não um payload de zeros", async () => {
    TABELAS.set(funnels, []);
    const app = await montarApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?days=7`,
    });
    await app.close();
    expect(r.statusCode).toBe(404);
  });
});

describe("a janela é a mesma nos dois lados (Story 44.27)", () => {
  it("`days=7` inclui hoje — sete dias, não oito", async () => {
    const app = await montarApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?days=7`,
    });
    await app.close();
    const p = r.json();
    const dias =
      Math.round(
        (Date.parse(`${p.periodo.to}T00:00:00Z`) - Date.parse(`${p.periodo.from}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    expect(dias).toBe(7);
    expect(p.periodo.dias).toBe(7);
  });

  it("`from`/`to` explícitos vencem `days`", async () => {
    const app = await montarApp();
    const r = await app.inject({
      method: "GET",
      url: `/api/public/v1/funnels/${FUNIL}/perpetual-metrics?from=${DE}&to=${ATE}&days=90`,
    });
    await app.close();
    const p = r.json();
    expect(p.periodo.from).toBe(DE);
    expect(p.periodo.to).toBe(ATE);
    expect(p.periodo.origem).toBe("explicita");
  });
});

/**
 * ## Reversões que confirmam que este arquivo não é decorativo
 *
 * Cada defeito abaixo foi REINTRODUZIDO no código e a suíte, rodada. Os números
 * são os medidos, não os esperados — a linha do `vendasNoDia` derruba 3, e eu
 * tinha escrito 2 antes de rodar.
 *
 * | defeito reintroduzido | testes que caem |
 * |---|---|
 * | `temPlanilha = !semDados && platform !== null` (o bug real desta sessão) | 1 |
 * | `vendas` vira a soma da série (as duas réguas colapsam numa) | 4 |
 * | `serieDiaria[].vendas` no lugar de `vendasNoDia` | 3 |
 * | `inicioDaJanela(dias)` → `shiftDayKey(hoje, -dias)` (o bug da 44.27) | 1 |
 * | reaplicar `applyMetaTax` num spend já tributado (o bug da 29.24) | 1 |
 */
