/**
 * Story 42.14 (Fatia B) — as janelas do Lyrio na API.
 *
 *  1. `getRevenuecatRevenue`: o pedido a `/metrics/revenue` (intervalo, moeda,
 *     tipo de receita) e a leitura ESTRITA da resposta (`value` não numérico ou
 *     moeda diferente de USD é erro, nunca zero);
 *  2. a causa de uma falha do RevenueCat (PO-D4 (1)): 429 limite, 403 permissão;
 *  3. o fio das rotas `/receita`, `/overview` e `/metricas-derivadas` com um
 *     banco falso: guarda (`getStage`, AC2e), janela na régua de SP e o ECO da
 *     janela (AC10b).
 *
 * Relógio e fuso fixos: 16/10/2026 às 12:00 de SP (15:00Z), `TZ` do processo em
 * UTC — o fuso do Railway, onde o erro de dia "local" apareceria.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { getTableName } from "drizzle-orm";

vi.mock("../services/revenuecat.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../services/revenuecat.js")>();
  // A chave do banco falso não é cifrada de verdade.
  return { ...orig, decryptRevenuecatKey: () => "sk_teste_nao_real" };
});

import revenuecatRoutes from "../routes/revenuecat.js";
import {
  causaDaFalhaDoRevenuecat,
  getRevenuecatChartTotal,
  getRevenuecatRevenue,
  respostaDeFalhaDoRevenuecat,
} from "../services/revenuecat.js";

const AGORA = new Date("2026-10-16T15:00:00.000Z"); // 12:00 de SP
const TZ_ORIGINAL = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = TZ_ORIGINAL;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Um `fetch` falso do RevenueCat: grava as URLs pedidas e responde o roteiro. */
function rcFalso(resposta: { status: number; corpo: unknown }) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url));
    const texto = typeof resposta.corpo === "string" ? resposta.corpo : JSON.stringify(resposta.corpo);
    return new Response(texto, { status: resposta.status, headers: { "content-type": "application/json" } });
  });
  return urls;
}

// ─────────────────────────── 1. o service ───────────────────────────

describe("getRevenuecatRevenue — o pedido e a leitura estrita", () => {
  it("pede o intervalo de DIAS, currency=USD (PO-12) e revenue_type=revenue (PO-D5); lê `value`", async () => {
    const urls = rcFalso({ status: 200, corpo: { object: "revenue", value: 1234.56, currency: "USD", revenue_type: "revenue", start_date: "2026-07-19", end_date: "2026-10-16" } });
    const r = await getRevenuecatRevenue("sk", "proj_rc", { startDate: "2026-07-19", endDate: "2026-10-16" });
    expect(r).toEqual({ valor: 1234.56, moeda: "USD", tipoDeReceita: "revenue", startDate: "2026-07-19", endDate: "2026-10-16" });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/v2/projects/proj_rc/metrics/revenue");
    expect(Object.fromEntries(u.searchParams)).toEqual({ start_date: "2026-07-19", end_date: "2026-10-16", currency: "USD", revenue_type: "revenue" });
  });

  it("moeda devolvida diferente de USD → erro (o card formata em dólar)", async () => {
    rcFalso({ status: 200, corpo: { value: 10, currency: "BRL" } });
    await expect(getRevenuecatRevenue("sk", "p", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/BRL, não em USD/);
  });

  it("`value` que não é número finito → erro, nunca zero", async () => {
    rcFalso({ status: 200, corpo: { value: "1234.56", currency: "USD" } });
    await expect(getRevenuecatRevenue("sk", "p", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/não é número/);
    rcFalso({ status: 200, corpo: { currency: "USD" } });
    await expect(getRevenuecatRevenue("sk", "p", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/não é número/);
  });

  it("429 do RevenueCat sai com o status na mensagem (o `rcFetch`), sem a chave", async () => {
    rcFalso({ status: 429, corpo: { message: "Too Many Requests" } });
    const err = await getRevenuecatRevenue("sk_segredo", "p", { startDate: "2026-10-01", endDate: "2026-10-16" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^RevenueCat 429:/);
    expect((err as Error).message).not.toContain("sk_segredo");
  });
});

describe("getRevenuecatChartTotal — customers_new pela forma conferida na sonda (2026-10-16)", () => {
  // Forma da sonda: datas em unix s, `values[]` por dia UTC com `incomplete`, `summary.total` pelo display_name.
  const corpo = (p: Record<string, unknown> = {}) => ({
    object: "chart", resolution: "day", start_date: 1789776000, end_date: 1792108800, unsupported_params: null,
    measures: [{ display_name: "New Customers" }],
    values: [
      { cohort: 1792022400, incomplete: false, measure: 0, value: 540 },
      { cohort: 1792108800, incomplete: true, measure: 0, value: 212 },
    ],
    summary: { total: { "New Customers": 15232 } },
    ...p,
  });

  it("pede o intervalo de DIAS e lê o total pelo display_name da medida; conta o dia incompleto", async () => {
    const urls = rcFalso({ status: 200, corpo: corpo() });
    const r = await getRevenuecatChartTotal("sk", "proj_rc", "customers_new", { startDate: "2026-09-19", endDate: "2026-10-16" });
    expect(r).toEqual({ total: 15232, medida: "New Customers", diasIncompletos: 1 });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/v2/projects/proj_rc/charts/customers_new");
    expect(Object.fromEntries(u.searchParams)).toEqual({ start_date: "2026-09-19", end_date: "2026-10-16" });
  });

  it("mais de uma medida, total ausente ou não numérico → erro (nunca zero, nunca o total de outra medida)", async () => {
    rcFalso({ status: 200, corpo: corpo({ measures: [{ display_name: "A" }, { display_name: "B" }] }) });
    await expect(getRevenuecatChartTotal("sk", "p", "customers_new", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/UMA medida/);
    rcFalso({ status: 200, corpo: corpo({ summary: { average: { "New Customers": 544 } } }) });
    await expect(getRevenuecatChartTotal("sk", "p", "customers_new", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/não é número/);
    rcFalso({ status: 200, corpo: corpo({ summary: { total: { Outra: 1 } } }) });
    await expect(getRevenuecatChartTotal("sk", "p", "customers_new", { startDate: "2026-10-01", endDate: "2026-10-16" })).rejects.toThrow(/não é número/);
  });
});

// ─────────────────────────── 2. a causa da falha ───────────────────────────

describe("causa da falha do RevenueCat (PO-D4 (1))", () => {
  it("429 → limite (HTTP 429); 403 → permissão (502); o resto → outro (502)", () => {
    expect(causaDaFalhaDoRevenuecat(new Error("RevenueCat 429: x"))).toBe("limite");
    expect(causaDaFalhaDoRevenuecat(new Error("RevenueCat 403: x"))).toBe("permissao");
    expect(causaDaFalhaDoRevenuecat(new Error("RevenueCat 500: x"))).toBe("outro");
    expect(causaDaFalhaDoRevenuecat(new Error("This operation was aborted"))).toBe("outro");
    expect(respostaDeFalhaDoRevenuecat(new Error("RevenueCat 429: x"), "a receita").status).toBe(429);
    expect(respostaDeFalhaDoRevenuecat(new Error("RevenueCat 403: x"), "a receita").status).toBe(502);
    const limite = respostaDeFalhaDoRevenuecat(new Error("RevenueCat 429: x"), "a receita").corpo;
    expect(limite).toMatchObject({ causa: "limite", details: "RevenueCat 429: x" });
    expect(limite.error).toContain("25 por minuto");
    expect(respostaDeFalhaDoRevenuecat(new Error("RevenueCat 403: x"), "a receita").corpo.error).toContain("permissão");
  });
});

// ─────────────────────────── 3. o fio das rotas ───────────────────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";
const BASE = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat`;

type Evento = { eventType: string; appUserId: string | null; eventAt: Date | null; payload: unknown };
const ev = (eventType: string, appUserId: string, em: string, periodType: string): Evento => ({
  eventType,
  appUserId,
  eventAt: new Date(em),
  payload: { event: { period_type: periodType } },
});

function bancoFalso(opts: { etapa?: boolean; rcProjectId?: string | null; eventos?: Evento[] } = {}) {
  const consultados: string[] = [];
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), consultados.push(tabela), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
        const linhas =
          tabela === "projects" ? [{ id: PROJ }]
          : tabela === "funnel_stages" ? (opts.etapa === false ? [] : [{ id: STAGE }])
          : tabela === "revenuecat_connections" ? [{ apiKeyEncrypted: "x", apiKeyIv: "y" }]
          : tabela === "revenuecat_stage_config" ? (opts.rcProjectId === null ? [] : [{ rcProjectId: opts.rcProjectId ?? "proj_rc" }])
          : tabela === "revenuecat_sales" ? (opts.eventos ?? [])
          : [];
        return Promise.resolve(linhas).then(ok, erro);
      },
    };
    return c;
  };
  return { db: { select: () => cadeia(), execute: async () => ({ rows: [] }) }, consultados };
}

async function montar(banco: ReturnType<typeof bancoFalso>) {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = "10000000-0000-4000-8000-000000000001";
    req.userRole = "strategist";
  });
  app.decorate("db", banco.db as never);
  await app.register(revenuecatRoutes);
  await app.ready();
  return app;
}

describe("GET …/revenuecat/receita (D22) — a receita da janela do filtro", () => {
  it("90 dias em 16/10 → start_date 19/07, end_date 16/10 (dias de SP, hoje incluso); ecoa a janela", async () => {
    const urls = rcFalso({ status: 200, corpo: { value: 5000, currency: "USD", revenue_type: "revenue", start_date: "2026-07-19", end_date: "2026-10-16" } });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=90` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valorUsd: 5000, moeda: "USD", tipoDeReceita: "revenue",
      intervaloDaApi: { inicio: "2026-07-19", fim: "2026-10-16" },
    });
    expect(new URL(urls[0]).searchParams.get("start_date")).toBe("2026-07-19");
    expect(new URL(urls[0]).searchParams.get("end_date")).toBe("2026-10-16");
  });

  it("23:30 de SP de 16/10 (02:30Z de 17/10): o fim da janela continua 16/10 — o dia de SP, não o UTC", async () => {
    vi.setSystemTime(new Date("2026-10-17T02:30:00.000Z"));
    try {
      const urls = rcFalso({ status: 200, corpo: { value: 1, currency: "USD" } });
      const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=7` });
      expect(r.json()).toMatchObject({ desde: "2026-10-10", ate: "2026-10-16" });
      expect(new URL(urls[0]).searchParams.get("end_date")).toBe("2026-10-16");
    } finally {
      vi.setSystemTime(AGORA);
    }
  });

  it("429 do RevenueCat → HTTP 429 com `causa: limite` — nunca 200 com null ou zero", async () => {
    rcFalso({ status: 429, corpo: { message: "rate limited" } });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=90` });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ causa: "limite" });
    expect(r.json().details).toMatch(/^RevenueCat 429/);
  });

  it("403 → 502 com `causa: permissao`; moeda errada → 502 `outro`", async () => {
    rcFalso({ status: 403, corpo: { message: "forbidden" } });
    let r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=90` });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ causa: "permissao" });
    rcFalso({ status: 200, corpo: { value: 1, currency: "EUR" } });
    r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=90` });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ causa: "outro" });
  });

  it("sem app escolhido na etapa: configured false (ausência legítima), sem chamar o RevenueCat", async () => {
    const urls = rcFalso({ status: 200, corpo: {} });
    const r = await (await montar(bancoFalso({ rcProjectId: null }))).inject({ method: "GET", url: `${BASE}/receita?days=28` });
    expect(r.json()).toEqual({ configured: false, days: 28, desde: "2026-09-19", ate: "2026-10-16", valorUsd: null });
    expect(urls).toHaveLength(0);
  });

  it("etapa de outro funil → 404 sem chamar o RevenueCat; days fora de 1–365 → 400", async () => {
    const urls = rcFalso({ status: 200, corpo: { value: 1, currency: "USD" } });
    expect((await (await montar(bancoFalso({ etapa: false }))).inject({ method: "GET", url: `${BASE}/receita?days=90` })).statusCode).toBe(404);
    expect((await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/receita?days=0` })).statusCode).toBe(400);
    expect(urls).toHaveLength(0);
  });
});

describe("GET …/revenuecat/novos-clientes (D22) — novos clientes da janela do filtro", () => {
  it("90 dias → 19/07 a 16/10; ecoa a janela, o total, a medida e o dia incompleto", async () => {
    const urls = rcFalso({ status: 200, corpo: { measures: [{ display_name: "New Customers" }], values: [{ cohort: 1, incomplete: true, measure: 0, value: 1 }], summary: { total: { "New Customers": 15232 } } } });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/novos-clientes?days=90` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ configured: true, days: 90, desde: "2026-07-19", ate: "2026-10-16", valor: 15232, medida: "New Customers", diaIncompleto: true });
    expect(new URL(urls[0]).pathname).toBe("/v2/projects/proj_rc/charts/customers_new");
  });
  it("429 → HTTP 429 `limite`; sem app escolhido → configured false sem chamar o RevenueCat", async () => {
    rcFalso({ status: 429, corpo: {} });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/novos-clientes?days=90` });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ causa: "limite" });
    const urls = rcFalso({ status: 200, corpo: {} });
    const sem = await (await montar(bancoFalso({ rcProjectId: null }))).inject({ method: "GET", url: `${BASE}/novos-clientes?days=28` });
    expect(sem.json()).toEqual({ configured: false, days: 28, desde: "2026-09-19", ate: "2026-10-16", valor: null });
    expect(urls).toHaveLength(0);
  });
  it("etapa de outro funil → 404 sem chamar o RevenueCat", async () => {
    const urls = rcFalso({ status: 200, corpo: {} });
    expect((await (await montar(bancoFalso({ etapa: false }))).inject({ method: "GET", url: `${BASE}/novos-clientes?days=90` })).statusCode).toBe(404);
    expect(urls).toHaveLength(0);
  });
});

describe("GET …/revenuecat/overview — a causa da falha (PO-D4 (1))", () => {
  it("429 não vira mais a frase de permissão: HTTP 429, `causa: limite`", async () => {
    rcFalso({ status: 429, corpo: { message: "rate limited" } });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/overview` });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ causa: "limite" });
    expect(r.json().error).not.toMatch(/permiss/);
  });
  it("403 continua dizendo permissão (502)", async () => {
    rcFalso({ status: 403, corpo: { message: "forbidden" } });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/overview` });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ causa: "permissao" });
  });
});

describe("GET …/revenuecat/metricas-derivadas — janela, eco e guarda (AC2b, AC2e, AC10b)", () => {
  // Janela de 28 dias em 16/10 = desde 19/09 00:00 de SP (03:00Z).
  const EVENTOS: Evento[] = [
    ev("INITIAL_PURCHASE", "antigo", "2026-08-12T12:00:00Z", "TRIAL"), // trial fora da janela
    ev("INITIAL_PURCHASE", "vespera", "2026-09-19T02:30:00Z", "TRIAL"), // 18/09 23:30 de SP: FORA
    ev("INITIAL_PURCHASE", "primeiro-dia", "2026-09-19T03:30:00Z", "TRIAL"), // 19/09 00:30 de SP: DENTRO
    ev("INITIAL_PURCHASE", "recente", "2026-10-10T12:00:00Z", "TRIAL"),
    ev("RENEWAL", "recente", "2026-10-13T12:00:00Z", "NORMAL"), // o trial da janela converteu
    ev("INITIAL_PURCHASE", "pagou", "2026-10-01T12:00:00Z", "NORMAL"),
    ev("EXPIRATION", "x", "2026-08-20T12:00:00Z", "NORMAL"), // churn fora da janela
    ev("PAYWALL_IMPRESSION", "y", "2026-06-11T12:00:00Z", "TRIAL"), // paywall não define a série
  ];

  it("com days=28: só os eventos da janela de SP; a conversão olha a série inteira; ECOA days e desde", async () => {
    const r = await (await montar(bancoFalso({ eventos: EVENTOS }))).inject({ method: "GET", url: `${BASE}/metricas-derivadas?days=28` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      novosTrials: 2, // primeiro-dia + recente; nem "antigo" nem a "vespera" (23:30 de SP do dia anterior)
      conversoesDeTrial: 1,
      novasAssinaturasPagas: 1,
      churnPagante: 0,
      days: 28,
      desde: "2026-09-19",
      serieDesde: "2026-08-12",
    });
  });

  it("sem days: a série inteira, como antes, e o eco diz que não houve janela (days: null)", async () => {
    const r = await (await montar(bancoFalso({ eventos: EVENTOS }))).inject({ method: "GET", url: `${BASE}/metricas-derivadas` });
    expect(r.json()).toMatchObject({ novosTrials: 4, churnPagante: 1, days: null, desde: null });
  });

  it("serieDesde é o dia de SP: um primeiro evento às 01:00Z de 10/08 é 09/08 em SP", async () => {
    const r = await (await montar(bancoFalso({ eventos: [ev("INITIAL_PURCHASE", "a", "2026-08-10T01:00:00Z", "TRIAL")] }))).inject({ method: "GET", url: `${BASE}/metricas-derivadas?days=90` });
    expect(r.json().serieDesde).toBe("2026-08-09");
  });

  it("AC2e — etapa de outro funil/projeto → 404 SEM ler os eventos", async () => {
    const banco = bancoFalso({ etapa: false, eventos: EVENTOS });
    const r = await (await montar(banco)).inject({ method: "GET", url: `${BASE}/metricas-derivadas?days=28` });
    expect(r.statusCode).toBe(404);
    expect(banco.consultados).not.toContain("revenuecat_sales");
  });

  it("days inválido → 400", async () => {
    expect((await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/metricas-derivadas?days=0` })).statusCode).toBe(400);
  });
});
