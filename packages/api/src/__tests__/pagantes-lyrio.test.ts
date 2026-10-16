/**
 * Story 42.14 (AC6, AC7, AC8, AC9b/c) — novos pagantes por pessoa, renovações
 * e LTV por plano, sobre um Postgres de verdade (PGlite em memória; nada toca
 * o `.env`, que aponta para produção).
 *
 * Janela fixa: 28 dias em 16/10/2026 às 12:00 de SP → desde 19/09 00:00 de SP
 * (03:00Z). `TZ` do processo em UTC (o do Railway) e relógio fixo no fio.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { instanteDoInicioDaJanela } from "../utils/sale-date.js";
import {
  PLANOS_DO_LTV,
  canalDaOrigem,
  consultaDePagantesPorCanal,
  consultaDoLtvPorPlano,
  lerLinhaDePagante,
  montarLtv,
  montarPagantes,
  type PessoaPagante,
} from "../utils/pagantes-lyrio.js";

const dialeto = new PgDialect();
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const AGORA = new Date("2026-10-16T15:00:00.000Z"); // 12:00 de SP
const DESDE = instanteDoInicioDaJanela(28, AGORA);
const TZ_ORIGINAL = process.env.TZ;

// ─────────────────────────── 1. a regra de canal (pura) ───────────────────────────

const pessoa = (p: Partial<PessoaPagante> = {}): PessoaPagante => ({
  meta: false, google: false, organico: false, metaDesde: null, googleDesde: null, novoNaJanela: true, renovacoes: 0, ...p,
});

describe("canalDaOrigem — D16/D25 e o empate do PO-D3", () => {
  it("sem os dois sinais, a regra da 42.12 sem mudança", () => {
    expect(canalDaOrigem(pessoa({ meta: true }))).toBe("meta");
    expect(canalDaOrigem(pessoa({ google: true, organico: true }))).toBe("google");
    expect(canalDaOrigem(pessoa({ organico: true }))).toBe("organico");
    expect(canalDaOrigem(pessoa())).toBe("sem_atribuicao");
  });
  it("Meta e Google: vence o sinal que aparece PRIMEIRO no tempo", () => {
    expect(canalDaOrigem(pessoa({ meta: true, google: true, metaDesde: new Date("2026-10-01T10:00:00Z"), googleDesde: new Date("2026-10-02T10:00:00Z") }))).toBe("meta");
    expect(canalDaOrigem(pessoa({ meta: true, google: true, metaDesde: new Date("2026-10-03T10:00:00Z"), googleDesde: new Date("2026-10-02T10:00:00Z") }))).toBe("google");
  });
  it("empate no mesmo instante → conflito (PO-D3); sem instante para comparar → conflito", () => {
    const t = new Date("2026-10-01T10:00:00Z");
    expect(canalDaOrigem(pessoa({ meta: true, google: true, metaDesde: t, googleDesde: new Date(t) }))).toBe("conflito");
    expect(canalDaOrigem(pessoa({ meta: true, google: true, metaDesde: t, googleDesde: null }))).toBe("conflito");
  });
  it("montarPagantes: as 4 linhas sempre, na ordem; total = linhas + conflito", () => {
    const r = montarPagantes([
      pessoa({ meta: true }),
      pessoa({ meta: true, renovacoes: 2 }),
      pessoa({ meta: true, google: true, metaDesde: new Date(1), googleDesde: new Date(1), renovacoes: 1 }),
      pessoa({ organico: true, novoNaJanela: false, renovacoes: 3 }),
    ]);
    expect(r.novosPagantes.canais.map((x) => [x.canal, x.quantidade])).toEqual([["meta", 2], ["google", 0], ["organico", 0], ["sem_atribuicao", 0]]);
    expect(r.novosPagantes).toMatchObject({ conflito: 1, total: 3 });
    expect(r.renovacoes.canais.map((x) => x.quantidade)).toEqual([2, 0, 3, 0]);
    expect(r.renovacoes).toMatchObject({ conflito: 1, total: 6 });
  });
});

// ─────────────────────────── 2. PGlite ───────────────────────────

const DDL = `
CREATE TABLE revenuecat_sales (
  id serial PRIMARY KEY,
  stage_id uuid NOT NULL,
  event_id varchar(255) NOT NULL,
  event_type varchar(40),
  app_user_id varchar(255),
  product_id varchar(255),
  revenue_usd numeric(14,4),
  purchased_at timestamptz,
  event_at timestamptz,
  utm_source varchar(255), utm_medium varchar(255), utm_campaign varchar(255), utm_term varchar(255), utm_content varchar(255),
  gclid text,
  payload jsonb NOT NULL
);`;

let pg: PGlite;
const executar = async (q: SQL) => {
  const { sql: texto, params } = dialeto.sqlToQuery(q);
  return (await pg.query(texto, params as unknown[])).rows as Record<string, unknown>[];
};

type Evento = { stage?: string; user: string | null; tipo: string; usd?: number | null; produto?: string; em: string; attrs?: unknown; gclid?: string; utmMedium?: string };
let seq = 0;
async function inserir(e: Evento) {
  seq += 1;
  const payload = e.attrs === undefined ? { event: {} } : { event: { subscriber_attributes: e.attrs } };
  await pg.query(
    `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, product_id, revenue_usd, purchased_at, event_at, gclid, utm_medium, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [e.stage ?? STAGE, `ev${seq}`, e.tipo, e.user, e.produto ?? null, e.usd ?? null, e.usd != null ? e.em : null, e.em, e.gclid ?? null, e.utmMedium ?? null, JSON.stringify(payload)],
  );
}

const ANTES = "2026-09-01T12:00:00Z"; // antes da janela
const DENTRO = "2026-10-10T12:00:00Z";
const DEPOIS_NA_JANELA = "2026-10-12T12:00:00Z";

async function pagantes() {
  return montarPagantes((await executar(consultaDePagantesPorCanal(STAGE, DESDE))).map(lerLinhaDePagante));
}
const deCanal = (r: Awaited<ReturnType<typeof pagantes>>["novosPagantes"], canal: string) => r.canais.find((x) => x.canal === canal)!.quantidade;

beforeAll(async () => {
  process.env.TZ = "UTC";
  pg = new PGlite();
  await pg.exec(DDL);
}, 60_000);
afterAll(async () => {
  process.env.TZ = TZ_ORIGINAL;
  await pg?.close();
});
beforeEach(async () => {
  await pg.query("DELETE FROM revenuecat_sales");
});

describe("a janela de 28 dias é a régua de SP", () => {
  it("16/10 12:00 de SP, 28 dias → desde 19/09 00:00 de SP (03:00Z)", () => {
    expect(DESDE.toISOString()).toBe("2026-09-19T03:00:00.000Z");
  });
});

describe("AC8c — renovação = RENEWAL pago que não é o primeiro pagamento (D30)", () => {
  it("(1) trial → RENEWAL pago na janela: 0 renovações e 1 novo pagante (a conversão de trial é novo pagante)", async () => {
    await inserir({ user: "u1", tipo: "INITIAL_PURCHASE", usd: 0, em: "2026-10-03T12:00:00Z" }); // trial de US$ 0
    await inserir({ user: "u1", tipo: "RENEWAL", usd: 4.99, em: DENTRO });
    const r = await pagantes();
    expect(r.renovacoes.total).toBe(0);
    expect(r.novosPagantes.total).toBe(1);
  });

  it("(2) INITIAL_PURCHASE pago ANTES da janela + RENEWAL pago na janela: 1 renovação e 0 novo pagante", async () => {
    await inserir({ user: "u2", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "u2", tipo: "RENEWAL", usd: 4.99, em: DENTRO });
    const r = await pagantes();
    expect(r.renovacoes.total).toBe(1);
    expect(r.novosPagantes.total).toBe(0);
  });

  it("(3) pagou, deixou vencer (EXPIRATION) e reassinou com RENEWAL na janela: 1 renovação", async () => {
    await inserir({ user: "u3", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "u3", tipo: "EXPIRATION", em: "2026-09-10T12:00:00Z" });
    await inserir({ user: "u3", tipo: "RENEWAL", usd: 4.99, em: DENTRO });
    expect((await pagantes()).renovacoes.total).toBe(1);
  });

  it("(4) RENEWAL com revenue_usd = 0: não conta", async () => {
    await inserir({ user: "u4", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "u4", tipo: "RENEWAL", usd: 0, em: DENTRO });
    await inserir({ user: "u4", tipo: "RENEWAL", usd: 4.99, em: DEPOIS_NA_JANELA }); // para a pessoa entrar na consulta
    expect((await pagantes()).renovacoes.total).toBe(1);
  });

  it("(5) dois RENEWAL pagos na janela depois do primeiro pagamento: 2 renovações (conta eventos, D11)", async () => {
    await inserir({ user: "u5", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "u5", tipo: "RENEWAL", usd: 4.99, em: DENTRO });
    await inserir({ user: "u5", tipo: "RENEWAL", usd: 4.99, em: DEPOIS_NA_JANELA });
    expect((await pagantes()).renovacoes.total).toBe(2);
  });

  it("(6) empate Meta × Google no mesmo instante → conflito, fora das linhas da Meta e do Google (PO-D3)", async () => {
    await inserir({ user: "u6", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES, attrs: { ad_network: "meta" }, gclid: "Cj0" });
    await inserir({ user: "u6", tipo: "RENEWAL", usd: 4.99, em: DENTRO });
    const r = await pagantes();
    expect(r.renovacoes.conflito).toBe(1);
    expect(deCanal(r.renovacoes, "meta")).toBe(0);
    expect(deCanal(r.renovacoes, "google")).toBe(0);
  });

  it("INITIAL_PURCHASE, NON_RENEWING_PURCHASE e UNCANCELLATION pagos depois do primeiro pagamento NÃO são renovação", async () => {
    await inserir({ user: "u7", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "u7", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    await inserir({ user: "u7", tipo: "NON_RENEWING_PURCHASE", usd: 2, em: DENTRO });
    await inserir({ user: "u7", tipo: "UNCANCELLATION", usd: 1, em: DEPOIS_NA_JANELA });
    expect((await pagantes()).renovacoes.total).toBe(0);
  });
});

describe("AC6 / AC9b — novos pagantes por PESSOA, pela data do primeiro pagamento (D15)", () => {
  it("pessoa com DOIS INITIAL_PURCHASE pagos na janela conta UMA vez", async () => {
    await inserir({ user: "dois", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    await inserir({ user: "dois", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DEPOIS_NA_JANELA });
    expect((await pagantes()).novosPagantes.total).toBe(1);
  });

  it("quem pagou pela primeira vez ANTES da janela não é novo, mesmo pagando de novo dentro dela", async () => {
    await inserir({ user: "velho", tipo: "INITIAL_PURCHASE", usd: 4.99, em: ANTES });
    await inserir({ user: "velho", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    expect((await pagantes()).novosPagantes.total).toBe(0);
  });

  it("a borda em SP: primeiro pagamento às 23:30 de SP da véspera fica FORA; 00:30 do primeiro dia, DENTRO", async () => {
    await inserir({ user: "vespera", tipo: "INITIAL_PURCHASE", usd: 4.99, em: "2026-09-19T02:30:00Z" }); // 18/09 23:30 SP
    await inserir({ user: "vespera", tipo: "RENEWAL", usd: 4.99, em: DENTRO }); // entra na consulta
    await inserir({ user: "primeiro-dia", tipo: "INITIAL_PURCHASE", usd: 4.99, em: "2026-09-19T03:30:00Z" }); // 19/09 00:30 SP
    const r = await pagantes();
    expect(r.novosPagantes.total).toBe(1);
    expect(r.renovacoes.total).toBe(1); // o RENEWAL da "vespera" é renovação, não novo
  });

  it("trial (US$ 0) na janela que ainda não pagou não é novo pagante; US$ 0 não é pagamento (PO-08)", async () => {
    await inserir({ user: "so-trial", tipo: "INITIAL_PURCHASE", usd: 0, em: DENTRO });
    expect((await pagantes()).novosPagantes.total).toBe(0);
  });

  it("canal: Meta antes do Google → Meta; Google antes → Google; orgânico; sem atribuição", async () => {
    await inserir({ user: "meta-primeiro", tipo: "PAYWALL_IMPRESSION", em: "2026-09-01T10:00:00Z", attrs: { ad_network: "meta" } });
    await inserir({ user: "meta-primeiro", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO, gclid: "Cj0" });
    // a Meta aparece de novo DEPOIS do Google: vale a PRIMEIRA aparição (min), não a última
    await inserir({ user: "meta-primeiro", tipo: "PAYWALL_IMPRESSION", em: DEPOIS_NA_JANELA, attrs: { ad_network: "meta" } });
    await inserir({ user: "google-primeiro", tipo: "PAYWALL_IMPRESSION", em: "2026-09-01T10:00:00Z", gclid: "Cj1" });
    await inserir({ user: "google-primeiro", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO, attrs: { ad_network: "meta" } });
    await inserir({ user: "organico", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO, utmMedium: "organic" });
    await inserir({ user: "nada", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    const r = (await pagantes()).novosPagantes;
    expect(r.canais.map((x) => [x.canal, x.quantidade])).toEqual([["meta", 1], ["google", 1], ["organico", 1], ["sem_atribuicao", 1]]);
    expect(r).toMatchObject({ conflito: 0, total: 4 });
  });

  it("fora do escopo: outra etapa, TEST e sem usuário não contam", async () => {
    await inserir({ stage: OUTRA, user: "outra", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    await inserir({ user: "teste", tipo: "TEST", usd: 4.99, em: DENTRO });
    await inserir({ user: null, tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    expect((await pagantes()).novosPagantes.total).toBe(0);
  });

  it("nenhum PII sai da consulta: o id só agrupa", async () => {
    await inserir({ user: "pessoa-secreta", tipo: "INITIAL_PURCHASE", usd: 4.99, em: DENTRO });
    const linhas = await executar(consultaDePagantesPorCanal(STAGE, DESDE));
    expect(Object.keys(linhas[0]).sort()).toEqual(["google_desde", "meta_desde", "novo_na_janela", "renovacoes", "s_google", "s_meta", "s_organico"]);
    expect(JSON.stringify(linhas)).not.toContain("pessoa-secreta");
  });
});

describe("AC7 — LTV por plano: receita bruta ÷ pessoas distintas que pagaram o plano (D13, D24)", () => {
  it("pessoa com mais de um pagamento conta UMA vez no denominador; produto fora dos dois ids não entra; US$ 0 não entra", async () => {
    await inserir({ user: "a", tipo: "INITIAL_PURCHASE", usd: 39.99, produto: "premium_yearly", em: DENTRO });
    await inserir({ user: "a", tipo: "RENEWAL", usd: 39.99, produto: "premium_yearly", em: DEPOIS_NA_JANELA });
    await inserir({ user: "b", tipo: "INITIAL_PURCHASE", usd: 29.99, produto: "premium_yearly", em: DENTRO });
    await inserir({ user: "c", tipo: "INITIAL_PURCHASE", usd: 14.99, produto: "premium_quartely", em: DENTRO });
    await inserir({ user: "d", tipo: "INITIAL_PURCHASE", usd: 4.99, produto: "lyrio_pro_mensal", em: DENTRO }); // fora dos dois ids
    await inserir({ user: "e", tipo: "INITIAL_PURCHASE", usd: 0, produto: "premium_quartely", em: DENTRO }); // trial
    await inserir({ user: "f", tipo: "INITIAL_PURCHASE", usd: 39.99, produto: "premium_yearly", em: ANTES }); // fora da janela
    const ltv = montarLtv(await executar(consultaDoLtvPorPlano(STAGE, DESDE)));
    expect(ltv).toEqual([
      { plano: "anual", rotulo: "LTV Anual", productId: "premium_yearly", receitaCentavos: 10997, pessoas: 2 },
      { plano: "trimestral", rotulo: "LTV Trimestral", productId: "premium_quartely", receitaCentavos: 1499, pessoas: 1 },
    ]);
  });

  it("plano sem pagamento na janela: 0 e 0 (a tela mostra '—', não divide por zero)", async () => {
    expect(montarLtv(await executar(consultaDoLtvPorPlano(STAGE, DESDE)))).toEqual(PLANOS_DO_LTV.map((p) => ({ ...p, receitaCentavos: 0, pessoas: 0 })));
  });

  it("os ids são os de D23/D28, exatamente como o Danilo escreveu (conferência no dado pendente, AC7c)", () => {
    expect(PLANOS_DO_LTV.map((p) => p.productId)).toEqual(["premium_yearly", "premium_quartely"]);
  });
});

// ─────────────────────────── 3. o fio da rota ───────────────────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const URL_ = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat/pagantes-por-canal`;

function bancoFalso(opts: { etapa?: boolean } = {}) {
  const executados: { sql: string; params: unknown[] }[] = [];
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve(tabela === "projects" ? [{ id: PROJ }] : tabela === "funnel_stages" ? (opts.etapa === false ? [] : [{ id: STAGE }]) : []).then(ok, erro),
    };
    return c;
  };
  const db = {
    select: () => cadeia(),
    execute: async (q: SQL) => {
      const t = dialeto.sqlToQuery(q);
      executados.push(t);
      if (/novo_na_janela/.test(t.sql)) return { rows: [{ s_meta: true, s_google: false, s_organico: false, meta_desde: null, google_desde: null, novo_na_janela: true, renovacoes: 2 }] };
      if (/receita_centavos/.test(t.sql)) return { rows: [{ product_id: "premium_yearly", receita_centavos: 3999, pessoas: 1 }] };
      return { rows: [{ desde: new Date("2026-08-10T15:00:00Z") }] };
    },
  };
  return { db, executados };
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

describe("GET …/revenuecat/pagantes-por-canal — o fio", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
  });
  afterAll(() => vi.useRealTimers());

  it("as quatro consultas com o stageId DA ROTA e a régua de SP; ecoa a janela e a cobertura; só contagens", async () => {
    const banco = bancoFalso();
    const r = await (await montar(banco)).inject({ method: "GET", url: `${URL_}?days=28` });
    expect(r.statusCode).toBe(200);
    expect(banco.executados).toHaveLength(4);
    for (const e of banco.executados) expect(JSON.stringify(e.params)).toContain(STAGE);
    const pessoas = banco.executados.find((e) => /novo_na_janela/.test(e.sql))!;
    expect(pessoas.params).toContain(DESDE.toISOString());
    const corpo = r.json();
    expect(Object.keys(corpo).sort()).toEqual(["assinaturaDesde", "atributosDesde", "days", "desde", "ltvPorPlano", "novosPagantes", "renovacoes"]);
    expect(corpo).toMatchObject({ days: 28, desde: "2026-09-19", assinaturaDesde: "2026-08-10", novosPagantes: { total: 1, conflito: 0 }, renovacoes: { total: 2 } });
    expect(corpo.ltvPorPlano[0]).toEqual({ plano: "anual", rotulo: "LTV Anual", productId: "premium_yearly", receitaCentavos: 3999, pessoas: 1 });
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId/i);
  });

  it("etapa de outro funil/projeto → 404 SEM consultar eventos; days inválido → 400", async () => {
    const banco = bancoFalso({ etapa: false });
    expect((await (await montar(banco)).inject({ method: "GET", url: URL_ })).statusCode).toBe(404);
    expect(banco.executados).toHaveLength(0);
    expect((await (await montar(bancoFalso())).inject({ method: "GET", url: `${URL_}?days=0` })).statusCode).toBe(400);
  });
});
