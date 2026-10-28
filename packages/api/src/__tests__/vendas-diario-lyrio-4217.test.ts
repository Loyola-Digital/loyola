/**
 * Story 42.17 (AC3, AC7c) — `diario`: o `totalPago` da `vendas-por-canal` por
 * dia de SP, para a tabela "Dados diários" do Lyrio.
 *
 *  1. PGlite (Postgres de verdade em memória; o `.env` aponta para produção e
 *     não é tocado): `consultaDeVendasPorCanalComDias` com eventos semeados —
 *     a regra do `totalPago` (venda sem valor e venda sem usuário ficam fora;
 *     Google, orgânico e conflito ficam DENTRO), a venda das 23:30 de SP no
 *     dia de SP e a soma dos dias = `totalPago`, ao centavo;
 *  2. a função pura `montarDiarioDoTotalPago`;
 *  3. o fio da rota: `diario` na resposta, as mesmas três consultas, nenhum id.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import {
  consultaDeVendasPorCanalComDias,
  lerDiaDeVendas,
  lerLinhaDeVendas,
  montarDiarioDoTotalPago,
  montarVendasPorCanal,
  type DiaDoComprador,
  type DiaDoTotalPago,
  type VendasPorCanal,
} from "../utils/vendas-por-canal-lyrio.js";

const dialeto = new PgDialect();
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";

const DDL = `
CREATE TABLE revenuecat_sales (
  id serial PRIMARY KEY,
  stage_id uuid NOT NULL,
  event_id varchar(255) NOT NULL,
  event_type varchar(40),
  store varchar(30),
  app_user_id varchar(255),
  revenue_usd numeric(14,4),
  purchased_at timestamptz,
  event_at timestamptz,
  utm_source varchar(255), utm_medium varchar(255), utm_campaign varchar(255), utm_term varchar(255), utm_content varchar(255),
  gclid text, fbclid text, acquisition_source varchar(64),
  payload jsonb NOT NULL,
  created_at timestamptz
);`;

let pg: PGlite;
const executar = async (q: SQL) => {
  const { sql: texto, params } = dialeto.sqlToQuery(q);
  return (await pg.query(texto, params as unknown[])).rows as Record<string, unknown>[];
};

type Evento = { user: string | null; tipo: string; usd?: number | null; em: string; attrs?: unknown; gclid?: string; utmMedium?: string };
let seq = 0;
async function inserir(e: Evento) {
  seq += 1;
  const payload = e.attrs === undefined ? { event: {} } : { event: { subscriber_attributes: e.attrs } };
  await pg.query(
    `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, revenue_usd, purchased_at, event_at, gclid, utm_medium, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [STAGE, `ev${seq}`, e.tipo, e.user, e.usd ?? null, e.em, e.em, e.gclid ?? null, e.utmMedium ?? null, JSON.stringify(payload), e.em],
  );
}

const DESDE = new Date("2026-10-01T03:00:00.000Z"); // 01/10 00:00 de SP

/** Cada usuário semeia uma regra; o esperado está no nome. */
async function semear() {
  await pg.query("DELETE FROM revenuecat_sales");
  // meta-dois-dias: 4,995 + 4,995 = 9,99 (999 ¢). Arredondar cada dia sozinho daria 1000 ¢.
  await inserir({ user: "meta-dois-dias", tipo: "INITIAL_PURCHASE", usd: 4.995, em: "2026-10-10T15:00:00Z", attrs: { ad_network: "meta", meta_campaign_id: "1202A" } });
  await inserir({ user: "meta-dois-dias", tipo: "RENEWAL", usd: 4.995, em: "2026-10-12T15:00:00Z" });
  // noite-sp: 23:30 de SP de 11/10 = 02:30Z de 12/10 → o dia é 11/10 (o de SP), não 12/10 (o de UTC)
  await inserir({ user: "noite-sp", tipo: "INITIAL_PURCHASE", usd: 7, em: "2026-10-12T02:30:00Z", attrs: { ad_network: "meta" } });
  // Google, orgânico, sem atribuição e conflito: TODOS entram no total (o total é dos 4 canais + conflito)
  await inserir({ user: "google", tipo: "INITIAL_PURCHASE", usd: 6.8, em: "2026-10-10T12:00:00Z", attrs: { ad_network: "google" } });
  await inserir({ user: "organico", tipo: "INITIAL_PURCHASE", usd: 2.5, em: "2026-10-12T12:00:00Z", utmMedium: "organic" });
  await inserir({ user: "sem-atribuicao", tipo: "NON_RENEWING_PURCHASE", usd: 1.1111, em: "2026-10-12T13:00:00Z" });
  await inserir({ user: "conflito", tipo: "INITIAL_PURCHASE", usd: 1, em: "2026-10-10T12:00:00Z", attrs: { ad_network: "meta" }, gclid: "Cj0" });
  // FICAM FORA (a regra do totalPago): venda sem valor (US$ 0, teste grátis), sem usuário e evento que não é venda
  await inserir({ user: "gratis", tipo: "INITIAL_PURCHASE", usd: 0, em: "2026-10-10T12:00:00Z", attrs: { ad_network: "meta" } });
  await inserir({ user: null, tipo: "INITIAL_PURCHASE", usd: 50, em: "2026-10-10T12:00:00Z" });
  await inserir({ user: "paywall", tipo: "PAYWALL_IMPRESSION", usd: 9, em: "2026-10-10T12:00:00Z" });
  // fora da janela: a compra de 20/09 não entra; a renovação de 15/10, sim
  await inserir({ user: "fora-da-janela", tipo: "INITIAL_PURCHASE", usd: 30, em: "2026-09-20T12:00:00Z" });
  await inserir({ user: "fora-da-janela", tipo: "RENEWAL", usd: 2.2222, em: "2026-10-15T12:00:00Z" });
  // borda: 30/09 23:59 de SP (02:59Z de 01/10) fica FORA — a janela começa às 00:00 de SP de 01/10
  await inserir({ user: "borda", tipo: "INITIAL_PURCHASE", usd: 40, em: "2026-10-01T02:59:00Z" });
}

let linhas: Record<string, unknown>[];
let total: VendasPorCanal;
let diario: DiaDoTotalPago[];
const dias = () => linhas.filter((r) => r.grao === "dia").map(lerDiaDeVendas).filter((d): d is DiaDoComprador => d !== null);

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await semear();
  linhas = await executar(consultaDeVendasPorCanalComDias(STAGE, DESDE));
  total = montarVendasPorCanal(linhas.filter((r) => r.grao === "comprador").map(lerLinhaDeVendas));
  diario = montarDiarioDoTotalPago(dias());
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("AC3a — o diário com a regra do totalPago (PGlite)", () => {
  it("um item por dia de SP com venda, em ordem crescente", () => {
    expect(diario).toEqual([
      // meta-dois-dias 4,995 (→ 5,00 do acumulado) + google 6,80 + conflito 1,00
      { dia: "2026-10-10", vendas: 3, receitaUsd: 12.8 },
      // noite-sp: 23:30 de SP fica em 11/10
      { dia: "2026-10-11", vendas: 1, receitaUsd: 7 },
      // meta-dois-dias 9,99 − 5,00 = 4,99 + orgânico 2,50 + sem atribuição 1,1111 (→ 1,11)
      { dia: "2026-10-12", vendas: 3, receitaUsd: 8.6 },
      { dia: "2026-10-15", vendas: 1, receitaUsd: 2.22 },
    ]);
  });

  it("a soma dos dias é o totalPago: vendas e receita ao centavo", () => {
    const vendas = diario.reduce((s, d) => s + d.vendas, 0);
    const centavos = diario.reduce((s, d) => s + Math.round(d.receitaUsd * 100), 0);
    expect(vendas).toBe(total.totalPago.vendas);
    expect(centavos).toBe(Math.round(total.totalPago.receitaUsd * 100));
    expect(total.totalPago).toMatchObject({ vendas: 8, receitaUsd: 30.62 });
  });

  it("a venda sem valor, a sem usuário, o evento que não é venda e o que está fora da janela ficam fora", () => {
    // 50 (sem usuário), 9 (paywall), 30 (fora), 40 (borda) e 0 (grátis) apareceriam no total
    expect(diario.some((d) => d.dia < "2026-10-01")).toBe(false);
    expect(diario.reduce((s, d) => s + d.receitaUsd, 0)).toBeLessThan(31);
  });

  it("23:30 de SP fica no dia de SP: não há venda em 12/10 que seja de 11/10 (o dia de UTC)", () => {
    expect(diario.find((d) => d.dia === "2026-10-11")).toEqual({ dia: "2026-10-11", vendas: 1, receitaUsd: 7 });
  });
});

describe("AC3c — nenhum id de usuário", () => {
  it("o diário não traz nenhum id semeado nem a coluna", () => {
    expect(JSON.stringify(diario)).not.toMatch(/meta-dois-dias|noite-sp|google"|organico|sem-atribuicao|conflito|fora-da-janela|app_user_id/);
    for (const d of diario) expect(Object.keys(d).sort()).toEqual(["dia", "receitaUsd", "vendas"]);
  });
});

describe("montarDiarioDoTotalPago — a função pura", () => {
  const d = (p: Partial<DiaDoComprador>): DiaDoComprador => ({ meta: false, google: false, organico: false, vendas: 1, metaCampaignId: null, metaCampaignName: null, metaAdsetName: null, metaAdName: null, dia: "2026-10-10", centavos: 100, ...p });
  it("soma vendas e centavos por dia, sem filtro de canal, e corta dia sem venda", () => {
    const r = montarDiarioDoTotalPago([
      d({ dia: "2026-10-11", centavos: 250 }),
      d({ meta: true, google: true, centavos: 1 }),
      d({ google: true, vendas: 2, centavos: 499 }),
      d({ vendas: 0, centavos: 9999 }),
    ]);
    expect(r).toEqual([
      { dia: "2026-10-10", vendas: 3, receitaUsd: 5 },
      { dia: "2026-10-11", vendas: 1, receitaUsd: 2.5 },
    ]);
  });
  it("lista vazia → []", () => {
    expect(montarDiarioDoTotalPago([])).toEqual([]);
  });
});

// ─────────────── o fio: a rota com um banco falso ───────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const URL_ = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat/vendas-por-canal`;

function bancoFalso() {
  const executados: string[] = [];
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve(tabela === "projects" ? [{ id: PROJ }] : tabela === "funnel_stages" ? [{ id: STAGE }] : []).then(ok, erro),
    };
    return c;
  };
  return {
    executados,
    db: {
      select: () => cadeia(),
      execute: async (q: SQL) => {
        const texto = dialeto.sqlToQuery(q).sql;
        executados.push(texto);
        if (/group by/i.test(texto)) return { rows: linhas };
        if (/sem_valor/.test(texto)) return { rows: [{ sem_valor: 1, sem_usuario: 1 }] };
        return { rows: [{ desde: new Date("2026-10-06T03:11:13.705Z") }] };
      },
    },
  };
}

describe("GET …/revenuecat/vendas-por-canal — `diario` (AC3a, AC3b, AC3c)", () => {
  it("a resposta traz o diário das MESMAS linhas, com as mesmas três consultas e nenhum id", async () => {
    const banco = bancoFalso();
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
    const r = await app.inject({ method: "GET", url: `${URL_}?days=28` });
    expect(r.statusCode).toBe(200);
    expect(banco.executados).toHaveLength(3);
    expect(banco.executados.filter((s) => /UNION ALL/.test(s))).toHaveLength(1);
    const corpo = r.json();
    expect(corpo.diario).toEqual(JSON.parse(JSON.stringify(diario)));
    expect(corpo.totalPago).toEqual(JSON.parse(JSON.stringify(total.totalPago)));
    expect(corpo.diario.reduce((s: number, x: { vendas: number }) => s + x.vendas, 0)).toBe(corpo.totalPago.vendas);
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId|meta-dois-dias|sem-atribuicao|"grao"/);
  });
  it("o contrato sobe para a v64 (campo novo `diario`)", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(64);
  });
});
