/**
 * Story 29.79 — a fixture das rotas de vendas do perpétuo com e sem o filtro de
 * funil/oferta. Compartilhada pelo diferencial do AC6 (`perpetual-funil-oferta-
 * todos.test.ts`) e pelos testes do filtro (`perpetual-funil-oferta-filtro.test.ts`).
 *
 * ## O banco falso é endereçado por TABELA — e lê o predicado de verdade
 *
 * Mesmo molde de `perpetual-metrics-parity.test.ts` (as rotas consultam em
 * ordens diferentes, uma fila por ordem obrigaria a fixtures diferentes), com um
 * acréscimo que é o ponto desta story: o recorte por campanha **não é ignorado**.
 *
 * Um banco falso que devolve a tabela inteira para qualquer `where` torna
 * decorativo o teste do filtro — o gasto do projeto todo e o gasto das
 * campanhas filtradas sairiam iguais (lição das 44.x). Aqui o `where` de cada
 * consulta é RENDERIZADO pelo `PgDialect` (o mesmo SQL que iria ao Postgres), e
 * a cláusula `"campaign_id" in (...)`/`"entity_id" in (...)` é aplicada às
 * linhas. Sem a cláusula, volta tudo — que é exatamente o que o Postgres faria
 * com `campaignIds = []` (R1): o projeto inteiro.
 *
 * Toda consulta fica registrada (`CONSULTAS`), para o teste olhar o SQL.
 */
import Fastify from "fastify";
import { vi, type Mock } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  funnels,
  funnelStages,
  funnelSpreadsheets,
  projects,
  metaAdInsightsDaily,
  metaCampaignInsightsDaily,
  metaHourlyInsightsDaily,
  metaEntityNamesCache,
  namingExperts,
  namingFunnels,
  namingOffers,
  namingCampaigns,
} from "../../db/schema.js";

export const dialeto = new PgDialect();
export const sqlDe = (x: unknown) =>
  x ? dialeto.sqlToQuery(x as SQL) : { sql: "", params: [] as unknown[] };

export const PROJ = "30000000-0000-4000-8000-000000000001";
export const FUNIL = "40000000-0000-4000-8000-000000000002";

/** Os ids das campanhas. O nome ATUAL de cada uma está em `NOMES_ATUAIS`. */
export const C = {
  /** bbe_a01_hamburguer_of01 — funil e oferta no nome. */
  hamb: "111",
  /** Legada estruturada: funil `a1` no nome, SEM oferta. */
  legada: "222",
  /** DG: vinculada à etapa como a01/of01, RENOMEADA na Meta para a02/of03. */
  dg: "333",
  /** `[FZA1]…`: funil colado entre colchetes, sem oferta. */
  fza1: "444",
  /** Campanha de OUTRO funil do mesmo projeto: nunca entra aqui. */
  outroFunil: "999",
} as const;

export const NOMES_ATUAIS: Record<string, string> = {
  [C.hamb]: "bbe_a01_hamburguer_of01_perpetuo_2026_hot_cbo_videos_lpa",
  [C.legada]: "bbe-a1-jul-26--venda--perpetuo--hot_cbo_estaticos",
  [C.dg]: "dg_a02_claude-negocios_of03_perpetuo_2026_cold_abo_videos_lpa",
  [C.fza1]: "[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]",
  [C.outroFunil]: "bbe_a01_churrasco_of02_perpetuo_2026_hot_cbo_videos_lpa",
};

/**
 * `funnel_stages.campaigns` — o nome gravado aqui é o do MOMENTO do vínculo.
 * O do DG é o de antes da renomeação (a01/of01): quem o lesse cairia no funil
 * errado (R2/PO-04).
 */
export const CAMPANHAS_DA_ETAPA = [
  { id: C.hamb, name: NOMES_ATUAIS[C.hamb] },
  { id: C.legada, name: NOMES_ATUAIS[C.legada] },
  { id: C.dg, name: "dg_a01_claude-negocios_of01_perpetuo_2026_cold_abo_videos_lpa" },
  { id: C.fza1, name: NOMES_ATUAIS[C.fza1] },
];

export const CABECALHO = [
  "email", "id", "produto", "bruto", "liquido", "forma",
  "data", "status", "utm_source", "utm_medium", "utm_content", "utm_campaign", "utm_term",
];

/**
 * A planilha. Cada linha existe por um motivo:
 *
 * - `ana@` compra no hambúrguer (a01/of01) E no DG (a02/of03): "tudo separado"
 *   — ela conta nos dois filtros, cada um com o faturamento da sua compra;
 * - `ana@` também leva um bump no hambúrguer (mesmo checkout);
 * - `carl@` é recusada (não é receita);
 * - `dan@` não tem `utm_campaign`; `eve@` tem a macro crua;
 * - `fay@` veio de uma campanha de OUTRO funil (fora da etapa);
 * - `gus@` comprou no hambúrguer e ESTORNOU numa linha SEM `utm_campaign` (PO-07);
 * - `hal@` veio do `[FZA1]` (a01, sem oferta);
 * - `ivy@` veio do DG com `utm_term` a01/of01 — o nome de HOJE é a02/of03;
 * - `joe@` veio da legada (a01, sem oferta).
 */
export const LINHAS = [
  ["ana@x.com", "t1", "Curso", "100,00", "80,00", "pix", "01/09/2026 10:00:00", "paid", "fb", "as1", "ad1", C.hamb, "fb_bbe_a01_hamburguer_of01|as|ad"],
  ["ana@x.com", "t2", "Bump", "50,00", "40,00", "pix", "01/09/2026 10:01:00", "paid", "fb", "as1", "ad1", C.hamb, "fb_bbe_a01_hamburguer_of01|as|ad"],
  ["ana@x.com", "t3", "Curso", "200,00", "160,00", "pix", "03/09/2026 11:00:00", "paid", "fb", "as2", "ad2", C.dg, "fb_dg_a01_claude-negocios_of01|as|ad"],
  ["bob@x.com", "t4", "Curso", "300,00", "240,00", "cartao", "02/09/2026 15:00:00", "paid", "fb", "as3", "ad3", C.legada, "fb_bbe-a1-jul-26|hot|ad"],
  ["carl@x.com", "t5", "Curso", "400,00", "320,00", "pix", "02/09/2026 16:00:00", "recusada", "fb", "as1", "ad1", C.hamb, "fb_x|y|z"],
  ["dan@x.com", "t6", "Curso", "150,00", "120,00", "pix", "04/09/2026 09:00:00", "paid", "ig", "", "", "", ""],
  ["eve@x.com", "t7", "Curso", "120,00", "96,00", "pix", "04/09/2026", "paid", "fb", "as1", "ad1", "{{campaign.id}}", "{{placement}}_{{campaign.name}}"],
  ["fay@x.com", "t8", "Curso", "90,00", "72,00", "pix", "05/09/2026 20:00:00", "paid", "fb", "as9", "ad9", C.outroFunil, "fb_bbe_a01_churrasco_of02|as|ad"],
  ["gus@x.com", "t9", "Curso", "250,00", "200,00", "pix", "05/09/2026 21:00:00", "paid", "fb", "as1", "ad1", C.hamb, "fb_bbe_a01_hamburguer_of01|as|ad"],
  ["gus@x.com", "t9", "Curso", "250,00", "200,00", "pix", "06/09/2026 09:30:00", "refunded", "", "", "", "", ""],
  ["hal@x.com", "t10", "Curso", "80,00", "64,00", "pix", "06/09/2026 08:00:00", "paid", "fb", "as4", "ad4", C.fza1, "fb_[FZA1]|x|y"],
  ["ivy@x.com", "t11", "Curso", "60,00", "48,00", "boleto", "07/09/2026", "paid", "fb", "as5", "ad5", C.dg, "fb_dg_a01_claude-negocios_of01|as|ad"],
  ["joe@x.com", "t12", "Curso", "70,00", "56,00", "pix", "07/09/2026 12:00:00", "paid", "fb", "as3", "ad3", C.legada, "fb_bbe-a1-jul-26|hot|ad"],
];

/**
 * Story 29.79 (TEST-001 do gate) — `bob@` RECOMPRA na legada: duas linhas
 * pagas fora do filtro `a01 + of01`, um comprador só. Sem ela, contar o
 * `foraDoFiltro` por LINHA daria o mesmo número que por comprador (Q8).
 *
 * Fica fora de `LINHAS` de propósito: `perpetuo-todos-antes-29-79.json`
 * congela a saída de "Todos" sobre `LINHAS` com o código de antes da story.
 */
export const RECOMPRA_DO_BOB = ["bob@x.com", "t13", "Curso", "40,00", "32,00", "pix", "03/09/2026 10:00:00", "paid", "fb", "as3", "ad3", C.legada, "fb_bbe-a1-jul-26|hot|ad"];
export const LINHAS_COM_RECOMPRA = [...LINHAS, RECOMPRA_DO_BOB];

export const PLANILHA = {
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

/** Gasto por dia de cada campanha — ordens de grandeza distintas, para a soma dizer QUAIS entraram. */
export const GASTO_DIARIO: Record<string, number> = {
  [C.hamb]: 100,
  [C.legada]: 10,
  [C.dg]: 1,
  [C.fza1]: 1000,
  [C.outroFunil]: 10000,
};
export const CLIQUES_DIARIOS: Record<string, number> = {
  [C.hamb]: 20,
  [C.legada]: 2,
  [C.dg]: 1,
  [C.fza1]: 200,
  [C.outroFunil]: 2000,
};
export const DIAS = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];

const insightsDeCampanha = () =>
  Object.keys(GASTO_DIARIO).flatMap((campaignId) =>
    DIAS.map((dateStart) => ({
      projectId: PROJ,
      campaignId,
      dateStart,
      spend: String(GASTO_DIARIO[campaignId]),
      impressions: "1000",
      reach: "800",
      clicks: String(CLIQUES_DIARIOS[campaignId] * 2),
      actions: [
        { action_type: "link_click", value: String(CLIQUES_DIARIOS[campaignId]) },
        { action_type: "landing_page_view", value: String(CLIQUES_DIARIOS[campaignId] / 2) },
        { action_type: "initiate_checkout", value: "1" },
      ],
      actionValues: [],
      lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
    })),
  );

const insightsDeAnuncio = () =>
  Object.keys(GASTO_DIARIO).flatMap((campaignId) =>
    DIAS.map((dateStart) => ({
      projectId: PROJ,
      adId: `ad-${campaignId}`,
      adName: `anuncio ${campaignId}`,
      adsetId: `as-${campaignId}`,
      adsetName: `conjunto ${campaignId}`,
      campaignId,
      campaignName: NOMES_ATUAIS[campaignId],
      dateStart,
      spend: String(GASTO_DIARIO[campaignId]),
      impressions: "1000",
      reach: "800",
      clicks: String(CLIQUES_DIARIOS[campaignId] * 2),
      actions: [
        { action_type: "link_click", value: String(CLIQUES_DIARIOS[campaignId]) },
        { action_type: "landing_page_view", value: String(CLIQUES_DIARIOS[campaignId] / 2) },
        { action_type: "initiate_checkout", value: "1" },
      ],
      actionValues: [],
      videoMetrics: null,
      lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
    })),
  );

const insightsHorarios = () =>
  Object.keys(GASTO_DIARIO).flatMap((campaignId) =>
    DIAS.flatMap((dateStart) =>
      [10, 15].map((hour) => ({
        projectId: PROJ,
        dateStart,
        campaignId,
        hour,
        spend: String(GASTO_DIARIO[campaignId] / 2),
        impressions: "500",
        clicks: "10",
        accountTimezone: "America/Sao_Paulo",
        lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
      })),
    ),
  );

// ── o banco falso ───────────────────────────────────────────────

/** O que cada tabela devolve. */
export const TABELAS = new Map<unknown, unknown[]>();
/** Toda consulta feita, com a tabela e o `where` — o teste lê o SQL daqui. */
export const CONSULTAS: { tabela: unknown; where?: unknown }[] = [];

/** Os valores de `"<coluna>" in ($n, …)` no SQL renderizado, ou `null` sem a cláusula. */
export function valoresDoIn(where: unknown, coluna: string): string[] | null {
  if (!where) return null;
  const { sql, params } = sqlDe(where);
  const m = sql.match(new RegExp(`"${coluna}" in \\(([^)]*)\\)`));
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ph) => String(params[Number(ph.replace("$", "")) - 1]));
}

const COLUNA_DE_CAMPANHA = new Map<unknown, { coluna: string; campo: string }>([
  [metaCampaignInsightsDaily, { coluna: "campaign_id", campo: "campaignId" }],
  [metaHourlyInsightsDaily, { coluna: "campaign_id", campo: "campaignId" }],
  [metaAdInsightsDaily, { coluna: "campaign_id", campo: "campaignId" }],
  [metaEntityNamesCache, { coluna: "entity_id", campo: "entityId" }],
]);

/** Aplica o `in (...)` do predicado — como o Postgres faria. */
function recortar(tabela: unknown, linhas: unknown[], where: unknown): unknown[] {
  const c = COLUNA_DE_CAMPANHA.get(tabela);
  if (!c) return linhas;
  const ids = valoresDoIn(where, c.coluna);
  if (ids === null) return linhas; // sem cláusula = sem recorte = o projeto inteiro
  return linhas.filter((l) => ids.includes(String((l as Record<string, unknown>)[c.campo])));
}

function encadeamento(tabela: unknown) {
  const reg: { tabela: unknown; where?: unknown } = { tabela };
  CONSULTAS.push(reg);
  const resolver = () => Promise.resolve(recortar(tabela, TABELAS.get(tabela) ?? [], reg.where));
  const no: Record<string, unknown> = {
    then: (...a: Parameters<Promise<unknown>["then"]>) => resolver().then(...a),
    catch: (...a: Parameters<Promise<unknown>["catch"]>) => resolver().catch(...a),
    finally: (...a: Parameters<Promise<unknown>["finally"]>) => resolver().finally(...a),
  };
  no.where = (w: unknown) => {
    reg.where = w;
    return no;
  };
  for (const m of ["limit", "orderBy", "innerJoin", "leftJoin", "groupBy"]) no[m] = () => no;
  return no;
}

export const db = {
  select: () => ({ from: (t: unknown) => encadeamento(t) }),
} as unknown as Database;

/** As consultas feitas a uma tabela. */
export const consultasA = (tabela: unknown) => CONSULTAS.filter((c) => c.tabela === tabela);

export function popularTabelas() {
  TABELAS.clear();
  CONSULTAS.length = 0;
  TABELAS.set(projects, [{ id: PROJ }]);
  TABELAS.set(funnels, [{ id: FUNIL, projectId: PROJ, name: "Perpétuo", type: "perpetual" }]);
  TABELAS.set(funnelStages, [{ campaigns: CAMPANHAS_DA_ETAPA }]);
  TABELAS.set(funnelSpreadsheets, [PLANILHA]);
  TABELAS.set(metaCampaignInsightsDaily, insightsDeCampanha());
  TABELAS.set(metaAdInsightsDaily, insightsDeAnuncio());
  TABELAS.set(metaHourlyInsightsDaily, insightsHorarios());
  TABELAS.set(
    metaEntityNamesCache,
    Object.entries(NOMES_ATUAIS).map(([entityId, entityName]) => ({
      projectId: PROJ,
      entityType: "campaign",
      entityId,
      entityName,
      effectiveStatus: "ACTIVE",
      lastSyncedAt: new Date("2026-09-08T00:00:00Z"),
    })),
  );
  // Nomenclatura: vazia por padrão — como em produção em 23/09 (4 `project_id` NULL).
  TABELAS.set(namingExperts, []);
  TABELAS.set(namingFunnels, []);
  TABELAS.set(namingOffers, []);
  TABELAS.set(namingCampaigns, []);
}

export const mockReadSheetData: Mock<(...a: unknown[]) => Promise<unknown>> = vi.fn();

/**
 * Monta o app com as duas rotas. O `vi.mock` de `google-sheets.js` precisa
 * estar NO arquivo de teste (é içado lá); este módulo só entrega o `vi.fn`.
 */
export async function montarApp(rotas: { default: unknown }[], papel: "admin" | "guest" = "admin") {
  const app = Fastify({ logger: false });
  app.decorate("db", db);
  app.decorate("config", {} as never);
  app.addHook("onRequest", async (req) => {
    req.apiKey = { id: "k1", scopes: ["meta:read"] };
    req.userId = "u1";
    req.userRole = papel;
  });
  for (const r of rotas) await app.register(r.default as never);
  return app;
}

export const DE = "2026-09-01";
export const ATE = "2026-09-07";
