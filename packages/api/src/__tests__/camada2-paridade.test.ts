import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  funnelSpreadsheets,
  funnelStages,
  manualSales,
  projects,
  stageSalesSpreadsheets,
} from "../db/schema.js";

/**
 * Story 41.12 AC9 — a camada 2 (a mesma pessoa não compra duas vezes o mesmo
 * produto) nas pontas de LANÇAMENTO (fatia A), sobre o MESMO fixture:
 *
 * - Resumão/Comparativo: `lerVendasDaPlanilha` → `deduplicarCamada2DaEtapa` →
 *   `prepararVendasDoPeriodo` → motor → guardas (W11/W12);
 * - painel Captação Paga e painel Vendas: a ROTA `GET …/sales-data`, de verdade,
 *   com banco e planilha falsos;
 * - gráfico diário: a ROTA `GET …/sales-data-daily`;
 * - réplica `sales-daily-sync` (`computeSalesDailyForStage`);
 * - Debriefing: `deduplicarVendas` (49.3), que já tinha a regra.
 *
 * O fixture é sintético e sem PII (`pNN@x.com`) e reproduz o padrão do PG02
 * (49.3, "Conferência em produção"): 9 recompras do mesmo produto pela mesma
 * pessoa, todas em dia DIFERENTE da sobrevivente — 7 ingressos (R$ 300,30), 1
 * combo (R$ 197) e 1 bump (R$ 99) —, com ID distinto e valor distinto do da
 * primeira compra (senão trocar a sobrevivente não apareceria no número).
 */

const SHEETS = new Map<string, { headers: string[]; rows: string[][] }>();

vi.mock("../services/google-sheets.js", () => ({
  readSheetData: async (spreadsheetId: string) => {
    const s = SHEETS.get(spreadsheetId);
    if (!s) throw new Error(`planilha ${spreadsheetId} não existe no fixture`);
    return { headers: s.headers, rows: s.rows };
  },
}));
vi.mock("../services/kiwify-event-tickets.js", () => ({
  ingressosDoEvento: async () => null,
}));
// O ponto único do escopo (`camada2ValeNaEtapa`) passa pelo mock para o teste de
// fiação poder tirar um tipo de etapa da regra. Com `fora` vazio, delega ao real.
const escopo = vi.hoisted(() => ({ fora: new Set<string>() }));
vi.mock("../services/vendas-camada2-planilha.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../services/vendas-camada2-planilha.js")>();
  return {
    ...real,
    camada2ValeNaEtapa: (t: string | null | undefined) =>
      !escopo.fora.has(t ?? "") && real.camada2ValeNaEtapa(t),
  };
});

const { default: stageSalesDataRoutes } = await import("../routes/stage-sales-data.js");
const { computeSalesDailyForStage } = await import("../services/sales-daily-sync.js");
const { lerVendasDaPlanilha, carregarVendas, prepararVendasDoPeriodo } = await import(
  "../services/launch-report-loader.js"
);
const { computeLaunchReportMetrics } = await import("../services/launch-report-engine.js");
const { validateLaunchReport } = await import("../services/launch-report-guards.js");
const { deduplicarVendas } = await import("../services/debriefing-hygiene.js");
const { ETAPAS_SEM_CAMADA2 } = await import("../services/vendas-camada2-planilha.js");

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const HEADERS = ["ID", "Data", "E-mail", "Produto", "Preço", "Status", "utm_source"];
const MAPPING = {
  transactionId: "ID",
  dataVenda: "Data",
  email: "E-mail",
  productName: "Produto",
  valorBruto: "Preço",
  status: "Status",
  utm_source: "utm_source",
};
const INGRESSO = "Ingresso Imersão";
const COMBO = "Combo Imersão + Gravação";
const BUMP = "Gravação Bump";

const pad = (i: number) => String(i).padStart(2, "0");
const email = (i: number) => `p${pad(i)}@x.com`;
const linha = (
  id: string,
  dia: number,
  e: string,
  produto: string,
  preco: string,
  status = "paid",
  source = "",
): string[] => [id, `${pad(dia)}/05/2026 10:00:00`, e, produto, preco, status, source];

/**
 * 30 compradores do ingresso (R$ 99, 01/05) + 4 produtos distintos (combo e
 * bump de p08/p09/p10) + o caso estorno + recompra (p31) e, no fim, as 9
 * recompras do padrão PG02 em 05/05 e 06/05.
 */
function fixturePg02(): string[][] {
  const rows: string[][] = [];
  for (let i = 1; i <= 30; i++) {
    rows.push(linha(`B${pad(i)}`, 1, email(i), INGRESSO, "99,00", "paid", i % 2 === 0 ? "meta" : ""));
  }
  rows.push(linha("C08", 2, email(8), COMBO, "197,00"));
  rows.push(linha("G09", 2, email(9), BUMP, "99,00"));
  // (c) mesmo e-mail, produtos diferentes: ingresso (B10) + combo + bump contam todos.
  rows.push(linha("C10", 2, email(10), COMBO, "197,00"));
  rows.push(linha("G10", 2, email(10), BUMP, "99,00"));
  // (h) estorno + recompra: a transação reembolsada sai inteira (as duas
  // linhas de X31) e a recompra Y31 é a única paga — conta, não é removida.
  rows.push(linha("X31", 3, email(31), INGRESSO, "99,00"));
  rows.push(linha("X31", 4, email(31), INGRESSO, "99,00", "refunded"));
  rows.push(linha("Y31", 7, email(31), INGRESSO, "99,00"));
  // As 9 recompras (dia diferente da sobrevivente; valor e ID distintos).
  for (let i = 1; i <= 7; i++) rows.push(linha(`R${pad(i)}`, 5, email(i), INGRESSO, "42,90"));
  rows.push(linha("R08", 6, email(8), COMBO, "197,00"));
  rows.push(linha("R09", 6, email(9), BUMP, "99,00"));
  return rows;
}

/** O que a camada 2 tem de tirar: 9 linhas, R$ 596,30. */
const RECOMPRAS = { linhas: 9, valor: 7 * 42.9 + 197 + 99 };
const DEPOIS = { linhas: 35, faturamento: 30 * 99 + 197 + 99 + 197 + 99 + 99 };
const ANTES = { linhas: DEPOIS.linhas + RECOMPRAS.linhas, faturamento: DEPOIS.faturamento + RECOMPRAS.valor };
const COMPRADORES = 31; // e-mails distintos com venda paga

// ---------------------------------------------------------------------------
// Banco falso: `select().from(tabela)…` devolve as linhas daquela tabela.
// ---------------------------------------------------------------------------

const IDS = {
  projeto: "10000000-0000-4000-8000-000000000001",
  funil: "20000000-0000-4000-8000-000000000002",
  etapa: "30000000-0000-4000-8000-000000000003",
  planilha: "40000000-0000-4000-8000-000000000004",
};

interface Mundo {
  stageType: string;
  subtype: string;
  sheets: { id: string; spreadsheetId: string; nome: string; mapping: Record<string, string> }[];
  manuais: {
    id: string;
    value: string;
    saleDate: Date;
    email: string | null;
    product: string | null;
    refundedAt?: Date | null;
  }[];
  /** Planilha `perpetual_sales` do FUNIL (herdada pela réplica nas etapas free/paid). */
  perpetuo?: { id: string; spreadsheetId: string; nome: string; mapping: Record<string, string> } | null;
}
let mundo: Mundo;

/**
 * O banco falso honra os dois predicados que decidem o resultado aqui — o
 * `refunded_at is null` e o `sale_date >= corte` das vendas manuais, e o tipo da
 * planilha do funil —, lendo o SQL que a consulta montou. Ignorá-los fazia o
 * teste aprovar consulta sem o filtro (a manual reembolsada e o recorte de
 * `days` das manuais são exatamente o que se prova abaixo).
 */
const dialeto = new PgDialect();
function lerPredicado(cond: SQL | undefined): { sql: string; params: unknown[] } | null {
  return cond ? dialeto.sqlToQuery(cond) : null;
}

function bancoFalso(): Database {
  const linhasDe = (tabela: unknown, cond: SQL | undefined): unknown[] => {
    const pred = lerPredicado(cond);
    if (tabela === projects) return [{ id: IDS.projeto }];
    if (tabela === funnelStages) {
      return [{ id: IDS.etapa, stageType: mundo.stageType, funnelId: IDS.funil }];
    }
    if (tabela === stageSalesSpreadsheets) {
      return mundo.sheets.map((s) => ({
        id: s.id,
        stageId: IDS.etapa,
        subtype: mundo.subtype,
        spreadsheetId: s.spreadsheetId,
        spreadsheetName: s.nome,
        sheetName: s.nome,
        columnMapping: s.mapping,
        orderBumpProducts: [BUMP],
        productTypes: {},
      }));
    }
    if (tabela === manualSales) {
      let manuais = mundo.manuais;
      if (pred && /"refunded_at" is null/.test(pred.sql)) manuais = manuais.filter((m) => !m.refundedAt);
      const corte = pred?.sql.match(/"sale_date" >= \$(\d+)/);
      if (pred && corte) {
        const desde = new Date(pred.params[Number(corte[1]) - 1] as string | Date);
        manuais = manuais.filter((m) => m.saleDate >= desde);
      }
      return manuais.map((m) => ({
        ...m,
        refundedAt: m.refundedAt ?? null,
        customerEmail: m.email,
        sellerName: null,
        valorRecebido: null,
      }));
    }
    if (tabela === funnelSpreadsheets) {
      if (!mundo.perpetuo || !pred?.params.includes("perpetual_sales")) return [];
      const p = mundo.perpetuo;
      return [{ id: p.id, spreadsheetId: p.spreadsheetId, sheetName: p.nome, columnMapping: p.mapping }];
    }
    return [];
  };
  const consulta = (tabela: unknown) => {
    let cond: SQL | undefined;
    const q = {
      innerJoin: () => q,
      where: (c: SQL | undefined) => {
        cond = c;
        return q;
      },
      limit: () => q,
      orderBy: () => q,
      then: (ok: (v: unknown[]) => unknown, erro?: (e: unknown) => unknown) =>
        Promise.resolve(linhasDe(tabela, cond)).then(ok, erro),
    };
    return q;
  };
  return { select: () => ({ from: consulta }) } as unknown as Database;
}

let app: FastifyInstance;
beforeAll(async () => {
  app = Fastify();
  app.decorate("db", bancoFalso());
  await app.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = "u1";
        request.userRole = "admin";
      });
    }),
  );
  await app.register(stageSalesDataRoutes);
  await app.ready();
}, 60_000); // import a frio da rota (meta-ads, schema) passa dos 10 s do hook
afterAll(async () => {
  await app.close();
  vi.useRealTimers();
});

function preparar(rows: string[][], opts: Partial<Mundo> = {}, mapping: Record<string, string> = MAPPING) {
  SHEETS.clear();
  SHEETS.set("ss-1", { headers: [...HEADERS], rows });
  mundo = {
    stageType: "paid",
    subtype: "capture",
    sheets: [{ id: IDS.planilha, spreadsheetId: "ss-1", nome: "n8n-kiwify-captação", mapping }],
    manuais: [],
    ...opts,
  };
}

/** Etapa com várias planilhas (`ss-1`, `ss-2`, …), na ordem dada. */
function prepararVarias(planilhas: string[][][], opts: Partial<Mundo> = {}) {
  SHEETS.clear();
  const sheets = planilhas.map((rows, i) => {
    const n = i + 1;
    SHEETS.set(`ss-${n}`, { headers: [...HEADERS], rows });
    return {
      id: `40000000-0000-4000-8000-00000000000${n}`,
      spreadsheetId: `ss-${n}`,
      nome: `planilha-${n}`,
      mapping: MAPPING,
    };
  });
  mundo = { stageType: "paid", subtype: "capture", sheets, manuais: [], ...opts };
}

const base = `/api/projects/${IDS.projeto}/funnels/${IDS.funil}/stages/${IDS.etapa}`;
async function card(subtype = "capture", days?: number) {
  const qs = new URLSearchParams({ subtype });
  if (days) qs.set("days", String(days));
  const r = await app.inject({ method: "GET", url: `${base}/sales-data?${qs}` });
  expect(r.statusCode).toBe(200);
  return r.json();
}
async function diario(days?: number) {
  const qs = new URLSearchParams({ subtype: "capture" });
  if (days) qs.set("days", String(days));
  const r = await app.inject({ method: "GET", url: `${base}/sales-data-daily?${qs}` });
  expect(r.statusCode).toBe(200);
  const byDay = r.json().byDay as Record<string, number>;
  return { byDay, soma: Object.values(byDay).reduce((s, v) => s + v, 0) };
}

const bumpsDe = (p: string | null) => (p ?? "").trim().toLowerCase() === BUMP.toLowerCase();

/**
 * Resumão pelo caminho de produção: `carregarVendas` (planilha falsa, banco
 * falso) → `prepararVendasDoPeriodo` → motor → guardas.
 */
async function resumao(
  rows: string[][] | null,
  periodo: { inicio: string; fim: string },
  mapping = MAPPING,
) {
  if (rows) preparar(rows, {}, mapping); // `null` = o mundo já preparado (várias planilhas)
  const c = await carregarVendas(bancoFalso(), IDS.etapa, "pago");
  const p = prepararVendasDoPeriodo(c.linhas, c.removidas, periodo, c.removidasCamada2);
  const m = computeLaunchReportMetrics({
    periodo,
    impostoPct: 0,
    impostoOrigem: "default",
    impostoJaAplicado: true,
    campanhas: [],
    vendas: p.vendas,
  });
  const g = validateLaunchReport(m, {
    dedup: {
      removidasNaJanela: p.removidasNaJanela,
      naoAplicada: c.dedupNaoAplicada,
      camada2: { removidasNaJanela: p.removidasCamada2NaJanela, naoAplicada: c.camada2NaoAplicada },
    },
  });
  return { m, g, p, c };
}

const MAIO = { inicio: "2026-05-01", fim: "2026-05-31" };

// ---------------------------------------------------------------------------

describe("AC9(a)(b) — paridade: as pontas de lançamento chegam ao mesmo número", () => {
  it("Resumão: −9 vendas / −R$ 596,30; ingressos únicos inalterados; W11 com contagem e valor", async () => {
    const r = await resumao(fixturePg02(), MAIO);
    expect(r.m.ingressos.totais).toBe(DEPOIS.linhas);
    expect(r.m.faturamento.total).toBeCloseTo(DEPOIS.faturamento, 6);
    expect(r.m.ingressos.unicos).toBe(COMPRADORES); // todos compraram o ingresso
    expect(r.p.removidasCamada2NaJanela.linhas).toBe(RECOMPRAS.linhas);
    expect(r.p.removidasCamada2NaJanela.valor).toBeCloseTo(RECOMPRAS.valor, 6);
    const w11 = r.g.alertas.find((a) => a.codigo === "W11");
    expect(w11?.mensagem).toContain(
      "9 linhas repetidas (mesmo e-mail e mesmo produto) removidas (R$ 596,30)",
    );
    expect(w11?.mensagem).toContain("vale a primeira linha");
    expect(r.g.alertas.find((a) => a.codigo === "W12")).toBeUndefined();
    expect(r.g.bloqueado).toBe(false);
    // A4 fecha
    expect(r.m.faturamento.captacao + r.m.faturamento.orderBump).toBeCloseTo(r.m.faturamento.total, 6);
  });

  it("painel Captação Paga (rota sales-data): mesmo total e faturamento do Resumão, e o campo de transparência", async () => {
    preparar(fixturePg02());
    const d = await card();
    const r = await resumao(fixturePg02(), MAIO);
    expect(d.totalVendas).toBe(r.m.ingressos.totais);
    expect(d.faturamentoBruto).toBeCloseTo(r.m.faturamento.total, 6);
    expect(d.ingressosTotais).toBe(DEPOIS.linhas);
    expect(d.dedupPessoaProduto).toEqual({
      aplicada: true,
      removidas: { linhas: 9, valor: 596.3 },
    });
    // ingressos únicos (por e-mail) não mudam com a camada 2
    expect(d.ingressosUnicos).toBe(COMPRADORES);
    // por produto: 31 ingressos (30 + Y31), 2 combos, 2 bumps
    const porProduto = Object.fromEntries(
      (d.ingressosPorProduto as { produto: string; count: number }[]).map((p) => [p.produto, p.count]),
    );
    expect(porProduto).toEqual({ [INGRESSO]: 31, [COMBO]: 2, [BUMP]: 2 });
    // AC4(d) — o "único" é por pessoa: a recompra segue disputando "a compra
    // mais recente" do e-mail, então a série única por dia e o faturamento
    // único são os de antes da camada 2 (p01–p07 caem no dia da recompra).
    const unicosPorDia = Object.fromEntries(
      Object.entries(d.ingressosUnicosByDay as Record<string, { pago: number; org: number; semTrack: number }>).map(
        ([dia, v]) => [dia, v.pago + v.org + v.semTrack],
      ),
    );
    expect(unicosPorDia).toEqual({
      "2026-05-01": 21,
      "2026-05-02": 1,
      "2026-05-05": 7,
      "2026-05-06": 1,
      "2026-05-07": 1,
    });
    expect(d.faturamentoUnico).toBeCloseTo(7 * 42.9 + 197 + 99 + 197 + 20 * 99 + 99, 6);
  });

  it("gráfico diário (rota sales-data-daily): Σ dias = faturamento do card, no mesmo fixture", async () => {
    preparar(fixturePg02());
    const d = await card();
    const g = await diario();
    expect(g.soma).toBeCloseTo(d.faturamentoBruto, 6);
    expect(g.byDay["2026-05-05"]).toBeUndefined(); // as 7 recompras de ingresso
    expect(g.byDay["2026-05-06"]).toBeUndefined(); // combo e bump repetidos
    expect(g.byDay["2026-05-07"]).toBeCloseTo(99, 6); // Y31 (estorno + recompra)
  });

  it("painel Vendas (etapa sales): faturamento e linhas iguais; vendas = compradores", async () => {
    preparar(fixturePg02(), { stageType: "sales", subtype: "main_product" });
    const d = await card("main_product");
    expect(d.faturamentoBruto).toBeCloseTo(DEPOIS.faturamento, 6);
    expect(d.breakdown.spreadsheet.linhas).toBe(DEPOIS.linhas);
    expect(d.totalVendas).toBe(COMPRADORES); // 1 por e-mail (juntarPorComprador)
    expect(d.dedupPessoaProduto.removidas.linhas).toBe(9);
  });

  it("réplica sales-daily-sync: mesmo total e faturamento do card", async () => {
    preparar(fixturePg02());
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s).not.toBeNull();
    // A réplica não pareia o estorno (X31 paga segue nela — divergência anterior
    // à 41.12, fora do escopo): o resto bate com o card.
    expect(s!.totalVendas).toBe(DEPOIS.linhas + 1);
    expect(s!.faturamentoBruto).toBeCloseTo(DEPOIS.faturamento + 99, 6);
    const dias = Object.fromEntries(s!.byDay.map((d) => [d.date, d.faturamentoBruto]));
    expect(dias["2026-05-05"]).toBeUndefined();
    expect(dias["2026-05-06"]).toBeUndefined();
  });

  it("Debriefing (deduplicarVendas, 49.3): mesma contagem e mesmo faturamento", () => {
    const lida = lerVendasDaPlanilha(
      { nome: "n8n-kiwify-captação", headers: HEADERS, rows: fixturePg02(), mapping: MAPPING },
      bumpsDe,
    );
    const r = deduplicarVendas(
      lida.linhas,
      {
        planilhaId: () => "a",
        idDaVenda: (l) => l.txId,
        produto: (l) => l.produto,
        emailCru: (l) => l.email,
      },
      new Map([["a", { planilhaId: "a", nome: "A", temColunaId: true, temColunaProduto: true }]]),
    );
    expect(r.mantidas.length).toBe(DEPOIS.linhas);
    expect(r.mantidas.reduce((s, l) => s + l.precoCru, 0)).toBeCloseTo(DEPOIS.faturamento, 6);
    expect(r.camada2.removidas).toBe(9);
  });

  it("sem a camada 2 (antes): os 9 a mais — o número de onde se parte", () => {
    const lida = lerVendasDaPlanilha(
      { nome: "n8n", headers: HEADERS, rows: fixturePg02(), mapping: MAPPING },
      bumpsDe,
    );
    expect(lida.linhas.length).toBe(ANTES.linhas);
    expect(lida.linhas.reduce((s, l) => s + l.precoCru, 0)).toBeCloseTo(ANTES.faturamento, 6);
  });
});

describe("AC9(c)–(e), (i) — os casos de contraste", () => {
  it("(c) mesmo e-mail com ingresso + combo + bump conta os três em todas as pontas", async () => {
    const rows = [
      linha("B1", 1, "a@x.com", INGRESSO, "99,00"),
      linha("C1", 2, "a@x.com", COMBO, "197,00"),
      linha("G1", 3, "a@x.com", BUMP, "99,00"),
    ];
    preparar(rows);
    expect((await card()).totalVendas).toBe(3);
    expect((await diario()).soma).toBeCloseTo(395, 6);
    expect((await resumao(rows, MAIO)).m.ingressos.totais).toBe(3);
  });

  it("(d) linha sem e-mail repetida não colapsa (Resumão; o card já ignora linha sem e-mail)", async () => {
    const rows = [linha("S1", 1, "", INGRESSO, "99,00"), linha("S2", 2, "", INGRESSO, "99,00")];
    const r = await resumao(rows, MAIO);
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.p.removidasCamada2NaJanela.linhas).toBe(0);
  });

  it("(e) a sobrevivente é a primeira na ordem lida e o dia da venda é o dela", async () => {
    const rows = [
      linha("A1", 3, "a@x.com", INGRESSO, "99,00"),
      linha("A2", 1, "a@x.com", INGRESSO, "50,00"), // mais antiga no calendário, mas vem DEPOIS
    ];
    const r = await resumao(rows, MAIO);
    expect(r.c.linhas.map((l) => [l.txId, l.dia])).toEqual([["A1", "2026-05-03"]]);
    expect(r.m.faturamento.total).toBeCloseTo(99, 6);
    preparar(rows);
    const d = await card();
    expect(d.faturamentoTotalByDay).toEqual({ "2026-05-03": 99 });
    expect((await diario()).byDay).toEqual({ "2026-05-03": 99 });
  });

  it("recompra no MESMO dia e a dobra PURCHASE_APPROVED + PURCHASE_COMPLETE (IDs diferentes) também saem", async () => {
    const rows = [
      linha("M1", 2, "m@x.com", INGRESSO, "99,00"),
      linha("M2", 2, "m@x.com", INGRESSO, "99,00"), // mesmo dia, ID distinto
      linha("E1", 3, "e@x.com", INGRESSO, "99,00", "PURCHASE_APPROVED"),
      linha("E2", 3, "e@x.com", INGRESSO, "99,00", "PURCHASE_COMPLETE"),
    ];
    expect((await resumao(rows, MAIO)).m.ingressos.totais).toBe(2);
    preparar(rows);
    const d = await card();
    expect(d.totalVendas).toBe(2);
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 2, valor: 198 });
    expect((await diario()).soma).toBeCloseTo(198, 6);
  });

  it("gêmea por ID de uma recompra sai junto — o diário, que não tem a camada 1, não a soma no lugar", async () => {
    const rows = [
      linha("P1", 1, "a@x.com", INGRESSO, "99,00"),
      linha("R1", 5, "a@x.com", INGRESSO, "42,90"),
      linha("R1", 5, "a@x.com", INGRESSO, "42,90"), // retry do gateway da recompra
    ];
    preparar(rows);
    const d = await card();
    expect(d.faturamentoBruto).toBeCloseTo(99, 6);
    expect((await diario()).soma).toBeCloseTo(99, 6);
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.faturamentoBruto).toBeCloseTo(99, 6);
  });

  it("(i) venda manual do mesmo e-mail + produto de uma linha da planilha não conta — a planilha vence por vir antes", async () => {
    const rows = [linha("B1", 1, "a@x.com", INGRESSO, "99,00"), linha("B2", 1, "b@x.com", INGRESSO, "99,00")];
    preparar(rows, {
      manuais: [
        { id: "m1", value: "120.00", saleDate: new Date(2026, 4, 2), email: "A@x.com", product: INGRESSO },
        { id: "m2", value: "80.00", saleDate: new Date(2026, 4, 2), email: "c@x.com", product: INGRESSO },
      ],
    });
    const d = await card();
    expect(d.totalVendas).toBe(3); // B1, B2 e a manual de c@ — a de a@ é recompra
    expect(d.faturamentoBruto).toBeCloseTo(99 + 99 + 80, 6);
    expect(d.breakdown.manual).toEqual({ vendas: 1, linhas: 1, bruto: 80, liquido: 80 });
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 1, valor: 120 });
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.faturamentoBruto).toBeCloseTo(99 + 99 + 80, 6);
    expect(s!.manualSalesIncluded).toBe(2); // contrato do campo: manuais lidas
  });
});

describe("AC9(f) — janelas adjacentes (lançamento): a venda conta UMA vez em A + B", () => {
  // Primeira compra em 01/05, recompra em 05/05. Janela A termina em 04/05; B começa em 05/05.
  const rows = () => [
    linha("P1", 1, "a@x.com", INGRESSO, "99,00"),
    linha("P2", 5, "a@x.com", INGRESSO, "42,90"),
  ];

  it("Resumão: A conta 1, B conta 0 e reporta a recompra no W11 de B", async () => {
    const a = await resumao(rows(), { inicio: "2026-05-01", fim: "2026-05-04" });
    const b = await resumao(rows(), { inicio: "2026-05-05", fim: "2026-05-31" });
    expect(a.m.ingressos.totais + b.m.ingressos.totais).toBe(1);
    expect(a.g.alertas.find((x) => x.codigo === "W11")).toBeUndefined();
    expect(b.p.removidasCamada2NaJanela).toEqual({ linhas: 1, valor: 42.9 });
    expect(b.g.alertas.find((x) => x.codigo === "W11")?.mensagem).toContain(
      "1 linha repetida (mesmo e-mail e mesmo produto) removida (R$ 42,90)",
    );
  });

  it("painel (card e diário) com `days` cobrindo só B: a recompra não volta a contar", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 10, 12, 0, 0));
    try {
      preparar(rows());
      const b = await card("capture", 6); // corte em 04/05 12h: só a recompra fica no período
      expect(b.totalVendas).toBe(0);
      expect(b.faturamentoBruto).toBe(0);
      expect(b.dedupPessoaProduto.removidas).toEqual({ linhas: 1, valor: 42.9 });
      expect((await diario(6)).soma).toBe(0);
      const tudo = await card();
      expect(tudo.totalVendas).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AC9(g) — planilha sem `productName` mapeado: nada colapsa e o aviso aparece", () => {
  const semProduto = { ...MAPPING, productName: "" };

  it("Resumão: números de antes, W12 (e o W10 da 41.10)", async () => {
    const r = await resumao(fixturePg02(), MAIO, semProduto);
    expect(r.m.ingressos.totais).toBe(ANTES.linhas);
    expect(r.m.faturamento.total).toBeCloseTo(ANTES.faturamento, 6);
    const w12 = r.g.alertas.find((a) => a.codigo === "W12");
    expect(w12?.mensagem).toContain('planilha "n8n-kiwify-captação"');
    expect(w12?.mensagem).toContain("productName");
    expect(r.g.alertas.find((a) => a.codigo === "W11")).toBeUndefined();
  });

  it("painel: números de antes e `naoAplicadaMotivo`", async () => {
    preparar(fixturePg02(), {}, semProduto);
    const d = await card();
    expect(d.totalVendas).toBe(ANTES.linhas);
    expect(d.faturamentoBruto).toBeCloseTo(ANTES.faturamento, 6);
    expect(d.dedupPessoaProduto.aplicada).toBe(false);
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 0, valor: 0 });
    expect(d.dedupPessoaProduto.naoAplicadaMotivo).toContain("coluna de produto não mapeada");
    expect((await diario()).soma).toBeCloseTo(ANTES.faturamento, 6);
  });
});

// ---------------------------------------------------------------------------
// QA fix iteração 1 (gate 41.12 parte A, TEST-001 / REL-001 / ponto do escopo).
// Cada teste abaixo nomeia a mutação do @qa que ele pega (QA-M4/M5/M6/M7/M9).
// ---------------------------------------------------------------------------

describe("TEST-001 — as quatro decisões que nenhum teste segurava", () => {
  it("(a) linha de valor zero não disputa a vaga: a compra paga depois dela conta (QA-M4)", async () => {
    // Cortesia/convite de R$ 0 primeiro; a compra paga do mesmo ingresso, depois.
    const rows = [
      linha("Z1", 1, "a@x.com", INGRESSO, "0,00"),
      linha("A1", 3, "a@x.com", INGRESSO, "99,00"),
      linha("B1", 2, "b@x.com", INGRESSO, "99,00"),
    ];
    const r = await resumao(rows, MAIO);
    expect(r.m.faturamento.total).toBeCloseTo(198, 6);
    expect(r.p.removidasCamada2NaJanela.linhas).toBe(0);
    preparar(rows);
    const d = await card();
    expect(d.faturamentoBruto).toBeCloseTo(198, 6);
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 0, valor: 0 });
    expect((await diario()).soma).toBeCloseTo(198, 6);
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.faturamentoBruto).toBeCloseTo(198, 6);
  });

  it("(b) réplica: a planilha de perpétuo herdada pelo funil fica fora da regra de lançamento (QA-M5)", async () => {
    // Etapa paga com a planilha de captação + a `perpetual_sales` do funil. No
    // perpétuo a camada 2 é por janela (R6-2, fatia B): a recompra dentro da
    // planilha do perpétuo e a compra que repete a da captação seguem contando.
    preparar([linha("B1", 1, "a@x.com", INGRESSO, "99,00")], {
      perpetuo: { id: "50000000-0000-4000-8000-000000000005", spreadsheetId: "ss-perp", nome: "n8n-perpetuo", mapping: MAPPING },
    });
    SHEETS.set("ss-perp", {
      headers: [...HEADERS],
      rows: [
        linha("P1", 2, "b@x.com", INGRESSO, "47,00"),
        linha("P2", 9, "b@x.com", INGRESSO, "47,00"), // recompra no perpétuo
        linha("P3", 4, "a@x.com", INGRESSO, "47,00"), // repete a compra da captação
      ],
    });
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.totalVendas).toBe(4);
    expect(s!.faturamentoBruto).toBeCloseTo(99 + 3 * 47, 6);
  });

  it("(c) duas planilhas na etapa: a recompra na 2ª sai no Resumão, no card, no diário e na réplica (QA-M6/QA-M7)", async () => {
    const planilhas = [
      [linha("A1", 1, "a@x.com", INGRESSO, "99,00")],
      [linha("A2", 5, "a@x.com", INGRESSO, "42,90"), linha("B1", 2, "b@x.com", INGRESSO, "99,00")],
    ];
    prepararVarias(planilhas);
    const r = await resumao(null, MAIO);
    expect(r.m.ingressos.totais).toBe(2);
    expect(r.m.faturamento.total).toBeCloseTo(198, 6);
    expect(r.p.removidasCamada2NaJanela).toEqual({ linhas: 1, valor: 42.9 });

    prepararVarias(planilhas);
    const d = await card();
    expect(d.totalVendas).toBe(2);
    expect(d.faturamentoBruto).toBeCloseTo(198, 6);
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 1, valor: 42.9 });
    const g = await diario();
    expect(g.soma).toBeCloseTo(198, 6);
    expect(g.byDay["2026-05-05"]).toBeUndefined();
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.faturamentoBruto).toBeCloseTo(198, 6);
  });

  it("(d) card com `days`: a manual de antes do corte decide, e a de dentro (mesma pessoa e produto) não conta (QA-M9)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 4, 10, 12, 0, 0));
    try {
      preparar([linha("B1", 9, "b@x.com", INGRESSO, "99,00")], {
        manuais: [
          { id: "m-antes", value: "120.00", saleDate: new Date(2026, 4, 1), email: "a@x.com", product: INGRESSO },
          { id: "m-dentro", value: "80.00", saleDate: new Date(2026, 4, 8), email: "a@x.com", product: INGRESSO },
        ],
      });
      const d = await card("capture", 6); // corte em 04/05 12h: só m-dentro está no período
      expect(d.faturamentoBruto).toBeCloseTo(99, 6);
      expect(d.breakdown.manual).toEqual({ vendas: 0, linhas: 0, bruto: 0, liquido: 0 });
      expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 1, valor: 80 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("REL-001 — venda manual reembolsada: o card filtra como a réplica", () => {
  it("a manual reembolsada não soma nem ocupa a vaga; card = réplica", async () => {
    preparar([linha("B1", 1, "b@x.com", INGRESSO, "99,00")], {
      manuais: [
        {
          id: "m-reemb",
          value: "120.00",
          saleDate: new Date(2026, 4, 1),
          email: "a@x.com",
          product: INGRESSO,
          refundedAt: new Date(2026, 4, 3),
        },
        { id: "m-paga", value: "80.00", saleDate: new Date(2026, 4, 2), email: "a@x.com", product: INGRESSO },
      ],
    });
    const d = await card();
    expect(d.faturamentoBruto).toBeCloseTo(99 + 80, 6);
    expect(d.breakdown.manual).toEqual({ vendas: 1, linhas: 1, bruto: 80, liquido: 80 });
    expect(d.dedupPessoaProduto.removidas).toEqual({ linhas: 0, valor: 0 });
    const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
    expect(s!.faturamentoBruto).toBeCloseTo(d.faturamentoBruto, 6);
  });
});

describe("Escopo da regra por tipo de etapa — ponto único (`camada2ValeNaEtapa`)", () => {
  it("hoje a regra vale em toda etapa de lançamento (OWN-002/OWN-003 com o dono)", () => {
    expect([...ETAPAS_SEM_CAMADA2]).toEqual([]);
  });

  it("um tipo fora da regra: card, diário, réplica e Resumão voltam ao número sem a camada 2", async () => {
    escopo.fora = new Set(["paid"]);
    try {
      preparar(fixturePg02());
      const d = await card();
      expect(d.faturamentoBruto).toBeCloseTo(ANTES.faturamento, 6);
      expect(d.dedupPessoaProduto).toEqual({
        aplicada: false,
        removidas: { linhas: 0, valor: 0 },
        naoAplicadaMotivo: "a regra não vale neste tipo de etapa",
      });
      expect((await diario()).soma).toBeCloseTo(ANTES.faturamento, 6);
      const s = await computeSalesDailyForStage(bancoFalso(), IDS.etapa);
      expect(s!.faturamentoBruto).toBeCloseTo(ANTES.faturamento + 99, 6); // + X31 (ver a réplica acima)
      const r = await resumao(fixturePg02(), MAIO);
      expect(r.m.ingressos.totais).toBe(ANTES.linhas);
      expect(r.g.alertas.find((a) => a.codigo === "W11")).toBeUndefined();
      expect(r.g.alertas.find((a) => a.codigo === "W12")).toBeUndefined();
    } finally {
      escopo.fora = new Set();
    }
  });
});
