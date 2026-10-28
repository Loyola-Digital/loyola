/**
 * Story 42.15 (AC10c, AC9c) — o denominador do churn mensal: as assinaturas
 * PAGAS ativas no primeiro dia da janela, pelo chart `actives` do RevenueCat.
 *
 *  1. `getRevenuecatChartNoDia`: o pedido (um dia só) e a leitura ESTRITA da
 *     forma conferida na sonda de 2026-10-28 (resolução diária, uma medida,
 *     um valor por dia de UTC) — nunca zero nem o número de outro dia;
 *  2. a rota `/ativas-no-inicio`: guarda, janela na régua de SP, eco do dia
 *     lido e a causa da falha;
 *  3. o contrato subiu (rota nova, AC9c).
 *
 * Relógio e fuso fixos: 28/10/2026 às 12:00 de SP (15:00Z), `TZ` em UTC.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { getTableName } from "drizzle-orm";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";

vi.mock("../services/revenuecat.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../services/revenuecat.js")>();
  return { ...orig, decryptRevenuecatKey: () => "sk_teste_nao_real" };
});

import revenuecatRoutes from "../routes/revenuecat.js";
import { getRevenuecatChartNoDia } from "../services/revenuecat.js";
import { metricasDerivadasDaEtapa } from "../utils/metricas-revenuecat.js";

const AGORA = new Date("2026-10-28T15:00:00.000Z");
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

function rcFalso(resposta: { status: number; corpo: unknown }) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: { "content-type": "application/json" } });
  });
  return urls;
}

/** 29/09/2026 00:00Z, em segundos — o `cohort` do dia na forma da sonda. */
const COHORT_2909 = Date.UTC(2026, 8, 29) / 1000;
const corpo = (p: Record<string, unknown> = {}) => ({
  object: "chart",
  resolution: "day",
  start_date: COHORT_2909,
  end_date: COHORT_2909,
  measures: [{ display_name: "Actives", unit: "#" }],
  values: [{ cohort: COHORT_2909, incomplete: false, measure: 0, value: 520 }],
  summary: { average: { Actives: 520 } },
  ...p,
});

describe("getRevenuecatChartNoDia — o chart `actives` num dia (forma da sonda de 2026-10-28)", () => {
  it("pede start_date = end_date = o dia e lê o valor desse dia pelo cohort de 00:00Z", async () => {
    const urls = rcFalso({ status: 200, corpo: corpo() });
    const r = await getRevenuecatChartNoDia("sk", "proj_rc", "actives", "2026-09-29");
    expect(r).toEqual({ valor: 520, medida: "Actives", incompleto: false });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/v2/projects/proj_rc/charts/actives");
    expect(Object.fromEntries(u.searchParams)).toEqual({ start_date: "2026-09-29", end_date: "2026-09-29" });
  });

  it("o valor de OUTRO dia não serve: sem o cohort do dia pedido é erro, nunca o número vizinho", async () => {
    rcFalso({ status: 200, corpo: corpo({ values: [{ cohort: COHORT_2909 + 86400, incomplete: false, measure: 0, value: 527 }] }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/UM valor para 2026-09-29 \(veio 0\)/);
    rcFalso({ status: 200, corpo: corpo({ values: [] }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/veio 0/);
  });

  it("dois valores para o dia, resolução que não é diária, duas medidas ou valor não numérico → erro", async () => {
    rcFalso({ status: 200, corpo: corpo({ values: [{ cohort: COHORT_2909, measure: 0, value: 1 }, { cohort: COHORT_2909, measure: 0, value: 2 }] }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/veio 2/);
    rcFalso({ status: 200, corpo: corpo({ resolution: "week" }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/resolução "week"/);
    rcFalso({ status: 200, corpo: corpo({ measures: [{ display_name: "A" }, { display_name: "B" }] }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/UMA medida/);
    rcFalso({ status: 200, corpo: corpo({ values: [{ cohort: COHORT_2909, measure: 0, value: "520" }] }) });
    await expect(getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).rejects.toThrow(/não é número/);
  });

  it("o dia em andamento sai marcado (incomplete), sem mudar o valor", async () => {
    rcFalso({ status: 200, corpo: corpo({ values: [{ cohort: COHORT_2909, incomplete: true, measure: 0, value: 863 }] }) });
    expect(await getRevenuecatChartNoDia("sk", "p", "actives", "2026-09-29")).toEqual({ valor: 863, medida: "Actives", incompleto: true });
  });
});

// ─────────────────────────── a rota ───────────────────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";
const BASE = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat`;

function bancoFalso(opts: { etapa?: boolean; rcProjectId?: string | null; conexao?: boolean } = {}) {
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
        const linhas =
          tabela === "projects" ? [{ id: PROJ }]
          : tabela === "funnel_stages" ? (opts.etapa === false ? [] : [{ id: STAGE }])
          : tabela === "revenuecat_connections" ? (opts.conexao === false ? [] : [{ apiKeyEncrypted: "x", apiKeyIv: "y" }])
          : tabela === "revenuecat_stage_config" ? (opts.rcProjectId === null ? [] : [{ rcProjectId: opts.rcProjectId ?? "proj_rc" }])
          : [];
        return Promise.resolve(linhas).then(ok, erro);
      },
    };
    return c;
  };
  return { select: () => cadeia(), execute: async () => ({ rows: [] }) };
}

async function montar(db: ReturnType<typeof bancoFalso>) {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = "10000000-0000-4000-8000-000000000001";
    req.userRole = "strategist";
  });
  app.decorate("db", db as never);
  await app.register(revenuecatRoutes);
  await app.ready();
  return app;
}

describe("GET …/revenuecat/ativas-no-inicio (AC10c) — o denominador do churn", () => {
  it("30 dias em 28/10 → lê o chart no dia 29/09 (o primeiro da janela de SP) e ecoa a janela e o dia", async () => {
    const urls = rcFalso({ status: 200, corpo: corpo() });
    const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ configured: true, days: 30, desde: "2026-09-29", ate: "2026-10-28", diaDoChart: "2026-09-29", valor: 520, medida: "Actives", diaIncompleto: false });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/v2/projects/proj_rc/charts/actives");
    expect(u.searchParams.get("start_date")).toBe("2026-09-29");
    expect(u.searchParams.get("end_date")).toBe("2026-09-29");
  });

  it("23:30 de SP de 28/10 (02:30Z de 29/10): o primeiro dia continua 29/09 — a régua de SP, não o dia UTC", async () => {
    vi.setSystemTime(new Date("2026-10-29T02:30:00.000Z"));
    try {
      const urls = rcFalso({ status: 200, corpo: corpo() });
      const r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` });
      expect(r.json()).toMatchObject({ desde: "2026-09-29", ate: "2026-10-28", diaDoChart: "2026-09-29" });
      expect(new URL(urls[0]).searchParams.get("start_date")).toBe("2026-09-29");
    } finally {
      vi.setSystemTime(AGORA);
    }
  });

  it("429 → HTTP 429 `limite`; chart com forma inesperada → 502 `outro` — nunca 200 com zero", async () => {
    rcFalso({ status: 429, corpo: { message: "rate limited" } });
    let r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` });
    expect(r.statusCode).toBe(429);
    expect(r.json()).toMatchObject({ causa: "limite" });
    rcFalso({ status: 200, corpo: corpo({ values: [] }) });
    r = await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` });
    expect(r.statusCode).toBe(502);
    expect(r.json()).toMatchObject({ causa: "outro" });
  });

  it("sem app escolhido: configured false e valor null, sem chamar o RevenueCat; sem conexão: 409", async () => {
    const urls = rcFalso({ status: 200, corpo: corpo() });
    const sem = await (await montar(bancoFalso({ rcProjectId: null }))).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` });
    expect(sem.json()).toEqual({ configured: false, days: 30, desde: "2026-09-29", ate: "2026-10-28", diaDoChart: "2026-09-29", valor: null });
    expect((await (await montar(bancoFalso({ conexao: false }))).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` })).statusCode).toBe(409);
    expect(urls).toHaveLength(0);
  });

  it("etapa de outro funil → 404 sem chamar o RevenueCat; days fora de 1–365 → 400", async () => {
    const urls = rcFalso({ status: 200, corpo: corpo() });
    expect((await (await montar(bancoFalso({ etapa: false }))).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=30` })).statusCode).toBe(404);
    expect((await (await montar(bancoFalso())).inject({ method: "GET", url: `${BASE}/ativas-no-inicio?days=0` })).statusCode).toBe(400);
    expect(urls).toHaveLength(0);
  });
});

describe("AC10c/AC10k — o numerador do churn: `churnPagante` de 30 dias (REUSE, PO-03)", () => {
  // 30 dias em 28/10 (SP) começam em 29/09 00:00 de SP = 03:00Z.
  const ev = (event_type: string, em: string, period_type: string, u = "u") => ({ event_type, app_user_id: u, event_at: em, period_type });
  const executar = (linhas: unknown[]) => async () => ({ rows: linhas });
  it("expiração PAGA dentro da janela conta; a de TRIAL fica fora (abandono, não churn); a borda é a meia-noite de SP", async () => {
    const r = await metricasDerivadasDaEtapa(
      executar([
        ev("INITIAL_PURCHASE", "2026-08-10T12:00:00Z", "NORMAL", "a"),
        ev("EXPIRATION", "2026-09-29T02:59:59Z", "NORMAL", "b"), // 28/09 23:59 de SP: fora
        ev("EXPIRATION", "2026-09-29T03:00:00Z", "NORMAL", "c"), // 29/09 00:00 de SP: dentro
        ev("EXPIRATION", "2026-10-20T12:00:00Z", "INTRO", "d"), // pago (INTRO): dentro
        ev("EXPIRATION", "2026-10-20T12:00:00Z", "PROMOTIONAL", "e"), // pago (PROMOTIONAL): dentro
        ev("EXPIRATION", "2026-10-20T12:00:00Z", "TRIAL", "f"), // trial: fora do churn
      ]),
      "stage",
      30,
    );
    expect(r).toMatchObject({ churnPagante: 3, abandonoDeTrial: 1, days: 30, desde: "2026-09-29", serieDesde: "2026-08-10" });
  });
  it("às 23:30 de SP de 28/10 (02:30Z de 29/10) a janela ainda começa em 29/09 — o relógio de SP, não o UTC", async () => {
    vi.setSystemTime(new Date("2026-10-29T02:30:00.000Z"));
    try {
      const r = await metricasDerivadasDaEtapa(executar([ev("EXPIRATION", "2026-09-29T03:00:00Z", "NORMAL")]), "stage", 30);
      expect(r).toMatchObject({ churnPagante: 1, desde: "2026-09-29" });
    } finally {
      vi.setSystemTime(AGORA);
    }
  });
});

describe("AC9c — rota nova, contrato novo", () => {
  it("API_CONTRACT_VERSION subiu para 63 (a v62 é da 42.19)", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(63);
  });
});
