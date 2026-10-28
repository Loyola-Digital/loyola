/**
 * Story 42.18 (AC5) — Novos → Trial e Novos → Iniciou por plano, dentro dos 8
 * canais da Jornada.
 *
 *  (a) a função pura do produto do usuário: o primeiro evento, o empate, sem
 *      produto e as classes;
 *  (b) a montagem: a paridade com a Jornada (AC4c), com um canal sem novos e um
 *      usuário em conflito;
 *  (c) o SQL e a rota sobre Postgres de verdade (PGlite em memória; nada toca o
 *      `.env`, que aponta para produção): a regra TS = a regra SQL, caso a caso,
 *      e `porProduto` com dois canais, três planos e um sem produto, sem id.
 *
 * Janela fixa: 28 dias em 16/10/2026 às 12:00 de SP → desde 19/09 00:00 de SP
 * (03:00Z). `TZ` do processo em UTC (o do Railway) e relógio fixo no fio.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { instanteDoInicioDaJanela } from "../utils/sale-date.js";
import { CANAIS_DA_JORNADA, consultaDaJornada, lerLinhaDaJornada, montarJornada, type SinaisDoUsuario } from "../utils/jornada-lyrio.js";
import { classificarProduto } from "../utils/pagantes-lyrio.js";
import {
  LINHAS_DO_POR_PRODUTO,
  consultaDaJornadaPorProduto,
  lerProdutoDaJornada,
  linhaDoProduto,
  montarPorProduto,
  produtoDoUsuario,
  type EventoDoUsuario,
  type ProdutoDoUsuario,
} from "../utils/jornada-por-produto-lyrio.js";

const dialeto = new PgDialect();
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const AGORA = new Date("2026-10-16T15:00:00.000Z"); // 12:00 de SP
const DESDE = instanteDoInicioDaJanela(28, AGORA);
const TZ_ORIGINAL = process.env.TZ;

// ─────────────────────────── (a) a regra do produto (pura) ───────────────────────────

const ev = (tipo: string, em: string, productId: string | null, periodType: string | null = null): EventoDoUsuario => ({
  eventType: tipo,
  periodType,
  eventAt: new Date(em),
  productId,
});

describe("AC2a / AC5a — produtoDoUsuario: o primeiro evento que conta como início", () => {
  it("o PRIMEIRO no tempo: trial anual e, depois, compra mensal → Anual nas duas medidas", () => {
    const eventos = [ev("NON_RENEWING_PURCHASE", "2026-10-05T10:00:00Z", "premium_monthly_15:base"), ev("INITIAL_PURCHASE", "2026-10-02T10:00:00Z", "premium_yearly_150", "TRIAL")];
    expect(produtoDoUsuario(eventos, "iniciou")).toBe("premium_yearly_150");
    expect(produtoDoUsuario(eventos, "teste")).toBe("premium_yearly_150");
  });
  it("cada medida tem o seu primeiro: a promoção mensal (NON_RENEWING) inicia; o trial anual depois é o produto do Trial", () => {
    const eventos = [ev("NON_RENEWING_PURCHASE", "2026-10-01T10:00:00Z", "rc_promo_Lyrio Pro_monthly"), ev("INITIAL_PURCHASE", "2026-10-03T10:00:00Z", "premium_yearly_100:base", "TRIAL")];
    expect(produtoDoUsuario(eventos, "iniciou")).toBe("rc_promo_Lyrio Pro_monthly");
    expect(produtoDoUsuario(eventos, "teste")).toBe("premium_yearly_100:base");
  });
  it("o teste é só INITIAL_PURCHASE com period_type TRIAL: compra NORMAL inicia, mas não é Trial", () => {
    const eventos = [ev("INITIAL_PURCHASE", "2026-10-01T10:00:00Z", "premium_monthly_20:base", "NORMAL")];
    expect(produtoDoUsuario(eventos, "iniciou")).toBe("premium_monthly_20:base");
    expect(produtoDoUsuario(eventos, "teste")).toBeUndefined();
  });
  it("evento que não é início (RENEWAL, paywall) não conta, mesmo antes; quem não iniciou → undefined", () => {
    const eventos = [ev("RENEWAL", "2026-09-30T10:00:00Z", "premium_yearly_150"), ev("PAYWALL_IMPRESSION", "2026-09-29T10:00:00Z", null), ev("INITIAL_PURCHASE", "2026-10-01T10:00:00Z", "premium_quartely_25:base")];
    expect(produtoDoUsuario(eventos, "iniciou")).toBe("premium_quartely_25:base");
    expect(produtoDoUsuario([ev("PAYWALL_IMPRESSION", "2026-10-01T10:00:00Z", null)], "iniciou")).toBeUndefined();
  });
  it("sem produto: o primeiro início veio sem product_id → null, mesmo com um id num início POSTERIOR", () => {
    const eventos = [ev("INITIAL_PURCHASE", "2026-10-01T10:00:00Z", null), ev("NON_RENEWING_PURCHASE", "2026-10-02T10:00:00Z", "premium_monthly_15:base")];
    expect(produtoDoUsuario(eventos, "iniciou")).toBeNull();
  });
  it("empate no mesmo instante: o evento COM produto vence o sem (nos dois sentidos da lista)", () => {
    const t = "2026-10-01T10:00:00Z";
    expect(produtoDoUsuario([ev("INITIAL_PURCHASE", t, null), ev("NON_RENEWING_PURCHASE", t, "premium_yearly_150")], "iniciou")).toBe("premium_yearly_150");
    expect(produtoDoUsuario([ev("NON_RENEWING_PURCHASE", t, "premium_yearly_150"), ev("INITIAL_PURCHASE", t, null)], "iniciou")).toBe("premium_yearly_150");
  });
  it("empate entre dois produtos: a ordem de bytes do id (COLLATE \"C\"), não a ordem da lista nem a alfabética sem caixa", () => {
    const t = "2026-10-01T10:00:00Z";
    expect(produtoDoUsuario([ev("INITIAL_PURCHASE", t, "premium_yearly_150"), ev("INITIAL_PURCHASE", t, "premium_monthly_15:base")], "iniciou")).toBe("premium_monthly_15:base");
    // "Z" (0x5A) vem antes de "a" (0x61) em bytes; numa ordem que ignora caixa seria o contrário
    expect(produtoDoUsuario([ev("INITIAL_PURCHASE", t, "alpha"), ev("INITIAL_PURCHASE", t, "Zeta")], "iniciou")).toBe("Zeta");
  });
});

describe("AC2b / AC5a — linhaDoProduto: a classe da 42.14 vira linha (D18, PO-01)", () => {
  it("as classes de plano ficam no plano; fora e não classificado juntos em Outros; sem id = Sem produto", () => {
    expect(linhaDoProduto("premium_monthly_15:base", classificarProduto("premium_monthly_15:base"))).toBe("mensal");
    expect(linhaDoProduto("rc_promo_Lyrio Pro_three_month", classificarProduto("rc_promo_Lyrio Pro_three_month"))).toBe("trimestral");
    expect(linhaDoProduto("premium_halfyearly_50:base", classificarProduto("premium_halfyearly_50:base"))).toBe("semestral");
    expect(linhaDoProduto("premium_yearly_partner_100", classificarProduto("premium_yearly_partner_100"))).toBe("anual");
    expect(classificarProduto("rc_promo_Lyrio Pro_daily")).toBe("fora");
    expect(linhaDoProduto("rc_promo_Lyrio Pro_daily", "fora")).toBe("outros");
    expect(classificarProduto("premium_weekly_5")).toBe("nao_classificado");
    expect(linhaDoProduto("premium_weekly_5", "nao_classificado")).toBe("outros");
    expect(linhaDoProduto(null, null)).toBe("sem_produto");
    // o nulo NÃO é "Outros", embora `classificarProduto(null)` dê não classificado
    expect(linhaDoProduto(null, classificarProduto(null))).toBe("sem_produto");
  });
  it("as 6 linhas, na ordem da classificação da 42.14 + Outros + Sem produto", () => {
    expect(LINHAS_DO_POR_PRODUTO.map((l) => [l.linha, l.rotulo])).toEqual([
      ["mensal", "Mensal"],
      ["trimestral", "Trimestral"],
      ["semestral", "Semestral"],
      ["anual", "Anual"],
      ["outros", "Outros"],
      ["sem_produto", "Sem produto"],
    ]);
  });
});

// ─────────────────────────── (b) a montagem e a paridade ───────────────────────────

const semCanal = { campanhaMeta: false, campanhaGoogle: false, gclid: false, fbclid: false, installReferrer: false, organico: false, ios: false };
const semProduto: ProdutoDoUsuario = { produtoIniciou: null, classeIniciou: null, produtoTeste: null, classeTeste: null };
type Usuario = SinaisDoUsuario & ProdutoDoUsuario;
const usuario = (p: Partial<Usuario> = {}): Usuario => ({
  primeiroEvento: new Date("2026-10-01T10:00:00.000Z"),
  viuPaywall: true,
  interagiu: false,
  iniciou: false,
  iniciouTeste: false,
  pagou: false,
  receitaUsd: 0,
  ...semCanal,
  ...semProduto,
  ...p,
});
const iniciou = (id: string | null, teste = false): Partial<Usuario> => ({
  iniciou: true,
  produtoIniciou: id,
  classeIniciou: id == null ? null : classificarProduto(id),
  ...(teste ? { iniciouTeste: true, produtoTeste: id, classeTeste: id == null ? null : classificarProduto(id) } : {}),
});

describe("AC3a / AC4c / AC5b — montarPorProduto: a paridade com a Jornada", () => {
  const usuarios: Usuario[] = [
    usuario({ gclid: true, ...iniciou("premium_yearly_150", true) }),
    usuario({ gclid: true, ...iniciou("premium_monthly_15:base") }),
    usuario({ gclid: true, ...iniciou(null) }),
    usuario({ gclid: true }),
    usuario({ organico: true, ...iniciou("premium_yearly_100:base", true) }),
    usuario({ organico: true, ...iniciou("rc_promo_Lyrio Pro_daily") }),
    usuario({ organico: true, ...iniciou("premium_weekly_5") }),
    usuario({ ios: true }),
    // conflito (D7 da 42.12): Meta E Google — fora dos canais, dentro do Total
    usuario({ campanhaMeta: true, campanhaGoogle: true, ...iniciou("premium_yearly_150", true) }),
    // antes da janela: não é da coorte
    usuario({ primeiroEvento: new Date("2026-09-01T10:00:00Z"), gclid: true, ...iniciou("premium_yearly_150", true) }),
  ];
  const j = montarJornada(usuarios, DESDE);
  const p = montarPorProduto(usuarios, DESDE);
  const linha = (l: string) => p.linhas.find((x) => x.linha === l)!;
  const doCanal = (l: string, canal: string) => linha(l).canais.find((x) => x.canal === canal)!;

  it("para CADA canal, a soma das linhas é o iniciou e o iniciou teste da Jornada; os novos são os mesmos", () => {
    for (const { canal } of CANAIS_DA_JORNADA) {
      const daJornada = j.linhas.find((l) => l.canal === canal)!;
      expect(p.canais.find((x) => x.canal === canal)!.novos).toBe(daJornada.novos);
      expect(p.linhas.reduce((a, l) => a + l.canais.find((x) => x.canal === canal)!.iniciou, 0)).toBe(daJornada.iniciou);
      expect(p.linhas.reduce((a, l) => a + l.canais.find((x) => x.canal === canal)!.iniciouTeste, 0)).toBe(daJornada.iniciouTeste);
    }
    expect(p.total.novos).toBe(j.total.novos);
    expect(p.linhas.reduce((a, l) => a + l.total.iniciou, 0)).toBe(j.total.iniciou);
    expect(p.linhas.reduce((a, l) => a + l.total.iniciouTeste, 0)).toBe(j.total.iniciouTeste);
  });
  it("o conflito: o mesmo balde da Jornada — fora dos 8 canais, dentro do Total", () => {
    expect(p.conflito.novos).toBe(j.conflito.novos);
    expect(p.conflito.novos).toBe(1);
    expect(linha("anual").conflito).toEqual({ iniciou: 1, iniciouTeste: 1 });
    expect(linha("anual").total).toEqual({ iniciou: 3, iniciouTeste: 3 });
    expect(p.linhas.reduce((a, l) => a + l.conflito.iniciou, 0)).toBe(j.conflito.iniciou);
  });
  it("canal sem novos: 0 novos e 0 em todas as linhas (a tela mostra '—')", () => {
    expect(p.canais.find((x) => x.canal === "meta_fbclid")!.novos).toBe(0);
    for (const l of p.linhas) expect(l.canais.find((x) => x.canal === "meta_fbclid")).toEqual({ canal: "meta_fbclid", iniciou: 0, iniciouTeste: 0 });
  });
  it("cada usuário cai na linha do SEU produto; Outros junta fora e não classificado, com os ids na linha", () => {
    expect(doCanal("anual", "google_gclid")).toMatchObject({ iniciou: 1, iniciouTeste: 1 });
    expect(doCanal("mensal", "google_gclid")).toMatchObject({ iniciou: 1, iniciouTeste: 0 });
    expect(doCanal("sem_produto", "google_gclid")).toMatchObject({ iniciou: 1, iniciouTeste: 0 });
    expect(doCanal("outros", "organico")).toMatchObject({ iniciou: 2, iniciouTeste: 0 });
    expect(linha("outros").produtos.map((x) => x.productId).sort()).toEqual(["premium_weekly_5", "rc_promo_Lyrio Pro_daily"]);
    expect(linha("sem_produto").produtos).toEqual([]);
    expect(linha("anual").produtos).toEqual([
      { productId: "premium_yearly_150", iniciou: 2, iniciouTeste: 2 },
      { productId: "premium_yearly_100:base", iniciou: 1, iniciouTeste: 1 },
    ]);
  });
  it("QA TEST-001 — cada medida conta na linha do SEU produto: promoção mensal no Iniciou, trial anual no Trial", () => {
    const u = usuario({
      organico: true,
      iniciou: true,
      produtoIniciou: "rc_promo_Lyrio Pro_monthly",
      classeIniciou: classificarProduto("rc_promo_Lyrio Pro_monthly"),
      iniciouTeste: true,
      produtoTeste: "premium_yearly_100:base",
      classeTeste: classificarProduto("premium_yearly_100:base"),
    });
    const r = montarPorProduto([u], DESDE);
    const cel = (l: string) => r.linhas.find((x) => x.linha === l)!.canais.find((x) => x.canal === "organico")!;
    expect(cel("mensal")).toEqual({ canal: "organico", iniciou: 1, iniciouTeste: 0 });
    expect(cel("anual")).toEqual({ canal: "organico", iniciou: 0, iniciouTeste: 1 });
    expect(r.linhas.find((x) => x.linha === "mensal")!.produtos).toEqual([{ productId: "rc_promo_Lyrio Pro_monthly", iniciou: 1, iniciouTeste: 0 }]);
    expect(r.linhas.find((x) => x.linha === "anual")!.produtos).toEqual([{ productId: "premium_yearly_100:base", iniciou: 0, iniciouTeste: 1 }]);
  });
  it("as 6 linhas e os 8 canais saem sempre, na ordem, mesmo sem ninguém", () => {
    const vazio = montarPorProduto([], DESDE);
    expect(vazio.linhas.map((l) => l.linha)).toEqual(LINHAS_DO_POR_PRODUTO.map((l) => l.linha));
    expect(vazio.canais.map((x) => x.canal)).toEqual(CANAIS_DA_JORNADA.map((x) => x.canal));
    for (const l of vazio.linhas) expect(l.canais.map((x) => x.canal)).toEqual(CANAIS_DA_JORNADA.map((x) => x.canal));
    expect(vazio.total.novos).toBe(0);
  });
});

// ─────────────────────────── (c) PGlite ───────────────────────────

const DDL = `
CREATE TABLE revenuecat_sales (
  id serial PRIMARY KEY,
  stage_id uuid NOT NULL,
  event_id varchar(255) NOT NULL,
  event_type varchar(40),
  store varchar(30),
  app_user_id varchar(255),
  product_id varchar(255),
  revenue_usd numeric(14,4),
  purchased_at timestamptz,
  event_at timestamptz,
  utm_source varchar(255), utm_medium varchar(255), utm_campaign varchar(255), utm_term varchar(255), utm_content varchar(255),
  gclid text, fbclid text,
  payload jsonb NOT NULL,
  created_at timestamptz
);`;

let pg: PGlite;
const executar = async (q: SQL) => {
  const { sql: texto, params } = dialeto.sqlToQuery(q);
  return (await pg.query(texto, params as unknown[])).rows as Record<string, unknown>[];
};

type Evento = { stage?: string; user: string | null; tipo: string; em: string; produto?: string | null; periodo?: string; usd?: number; gclid?: string; utmSource?: string };
let seq = 0;
async function inserir(e: Evento) {
  seq += 1;
  const payload = { event: e.periodo ? { period_type: e.periodo } : {} };
  await pg.query(
    `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, product_id, revenue_usd, purchased_at, event_at, gclid, utm_source, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $8)`,
    [e.stage ?? STAGE, `ev${seq}`, e.tipo, e.user, e.produto ?? null, e.usd ?? null, e.usd != null ? e.em : null, e.em, e.gclid ?? null, e.utmSource ?? null, JSON.stringify(payload)],
  );
}

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

describe("AC2a/AC2c — a regra TS = a regra SQL, caso a caso (PGlite)", () => {
  const T = "2026-10-01T10:00:00Z";
  const casos: { nome: string; eventos: EventoDoUsuario[] }[] = [
    { nome: "trial anual antes da compra mensal", eventos: [ev("INITIAL_PURCHASE", "2026-10-02T10:00:00Z", "premium_yearly_150", "TRIAL"), ev("NON_RENEWING_PURCHASE", "2026-10-05T10:00:00Z", "premium_monthly_15:base")] },
    { nome: "promoção mensal inicia; trial anual depois", eventos: [ev("NON_RENEWING_PURCHASE", "2026-10-01T10:00:00Z", "rc_promo_Lyrio Pro_monthly"), ev("INITIAL_PURCHASE", "2026-10-03T10:00:00Z", "premium_yearly_100:base", "TRIAL")] },
    { nome: "compra NORMAL: inicia, não é trial", eventos: [ev("INITIAL_PURCHASE", T, "premium_quartely_25:base", "NORMAL")] },
    { nome: "RENEWAL antes não conta", eventos: [ev("RENEWAL", "2026-09-30T10:00:00Z", "premium_yearly_150"), ev("INITIAL_PURCHASE", T, "premium_halfyearly_50:base")] },
    { nome: "sem produto no primeiro início", eventos: [ev("INITIAL_PURCHASE", T, null, "TRIAL"), ev("NON_RENEWING_PURCHASE", "2026-10-02T10:00:00Z", "premium_monthly_15:base")] },
    { nome: "empate: com produto vence sem", eventos: [ev("INITIAL_PURCHASE", T, null, "TRIAL"), ev("INITIAL_PURCHASE", T, "premium_yearly_150", "TRIAL")] },
    { nome: "empate: ordem de bytes", eventos: [ev("INITIAL_PURCHASE", T, "premium_yearly_150", "TRIAL"), ev("INITIAL_PURCHASE", T, "premium_monthly_15:base", "TRIAL")] },
    { nome: "empate: caixa (Z antes de a)", eventos: [ev("INITIAL_PURCHASE", T, "alpha"), ev("INITIAL_PURCHASE", T, "Zeta")] },
    { nome: "fora por decisão", eventos: [ev("NON_RENEWING_PURCHASE", T, "rc_promo_Lyrio Pro_weekly")] },
    { nome: "não classificado (o _ não é curinga)", eventos: [ev("INITIAL_PURCHASE", T, "premiumXmonthly_1")] },
    { nome: "não iniciou", eventos: [ev("PAYWALL_IMPRESSION", T, null)] },
  ];
  it("o empate é decidido em bytes (COLLATE \"C\") no SQL — o PGlite já ordena em C, então a prova é o texto", async () => {
    // Em produção a ordem padrão do banco pode não ser a de bytes ("alpha" antes de "Zeta");
    // o PGlite usa C por padrão e não distinguiria — por isso o SQL tem de trazer o COLLATE.
    expect((await pg.query<{ bytes: boolean }>("SELECT ('Zeta' < 'alpha') AS bytes")).rows[0]!.bytes).toBe(true);
    const texto = dialeto.sqlToQuery(consultaDaJornadaPorProduto(STAGE, DESDE)).sql;
    const ordem = /min\(\(lpad\(coalesce\(\(extract\(epoch from "revenuecat_sales"\."event_at"\) \* 1000000\)::bigint::text, '99999999999999999999'\), 20, '0'\) \|\| CASE WHEN "revenuecat_sales"\."product_id" IS NULL THEN '1' ELSE '0' \|\| "revenuecat_sales"\."product_id" END\) COLLATE "C"\) FILTER \(WHERE /g;
    expect(texto.match(ordem)).toHaveLength(2);
    // AC3d: sem agregado ordenado (ele impede a agregação parcial nos workers)
    expect(texto).not.toMatch(/array_agg|ORDER BY/i);
    // AC3c: o id do usuário só agrupa — nunca é selecionado
    expect(texto.slice(0, texto.search(/ FROM "revenuecat_sales"/))).not.toMatch(/app_user_id/);
    expect(texto.match(/GROUP BY "revenuecat_sales"\."app_user_id"/g)).toHaveLength(1);
  });
  it("QA TEST-002 — coluna extra com o nome de uma da Jornada é recusada (não sobrescreve a regra)", () => {
    expect(() => consultaDaJornada(STAGE, DESDE, { iniciou: sql`true` })).toThrow(/repete um nome: iniciou/);
    expect(() => consultaDaJornada(STAGE, DESDE, { c_gclid: sql`true` })).toThrow(/c_gclid/);
    expect(() => consultaDaJornada(STAGE, DESDE, { chave_nova: sql`true` })).not.toThrow();
  });
  it.each(casos)("$nome", async ({ eventos }) => {
    for (const e of eventos) {
      await inserir({ user: "u", tipo: e.eventType!, em: e.eventAt!.toISOString(), produto: e.productId, periodo: e.periodType ?? undefined });
    }
    const linhas = await executar(consultaDaJornadaPorProduto(STAGE, DESDE));
    expect(linhas).toHaveLength(1);
    const sinais = lerLinhaDaJornada(linhas[0]!);
    const doBanco = lerProdutoDaJornada(linhas[0]!);
    for (const [medida, iniciou, produto, classe] of [
      ["iniciou", sinais.iniciou, doBanco.produtoIniciou, doBanco.classeIniciou],
      ["teste", sinais.iniciouTeste, doBanco.produtoTeste, doBanco.classeTeste],
    ] as const) {
      const esperado = produtoDoUsuario(eventos, medida);
      expect(iniciou, medida).toBe(esperado !== undefined);
      expect(produto, medida).toBe(esperado ?? null);
      // AC2c: a classe vem de `classeDoProdutoNoSql` — e casa com `classificarProduto`
      expect(classe, medida).toBe(esperado == null ? null : classificarProduto(esperado));
    }
  });
});

// ─────────────── a rota sobre o PGlite: a resposta inteira, sem id ───────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const URL_ = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat/jornada`;

/** A guarda (`getProjectAccess`, `getStage`) respondida em memória; os eventos, no PGlite. */
function bancoNoPglite() {
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
  return { select: () => cadeia(), execute: async (q: SQL) => ({ rows: await executar(q) }) };
}

async function montar() {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = "10000000-0000-4000-8000-000000000001";
    req.userRole = "strategist";
  });
  app.decorate("db", bancoNoPglite() as never);
  await app.register(revenuecatRoutes);
  await app.ready();
  return app;
}

describe("AC3 / AC5c — GET …/revenuecat/jornada traz porProduto (PGlite, janela e relógio fixos)", () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
  });
  afterAll(() => vi.useRealTimers());

  it("dois canais, três planos e um sem produto: as contagens por canal × plano, a paridade e nenhum id", async () => {
    const em = "2026-10-10T12:00:00Z";
    // Google (gclid): Anual por trial, Mensal, sem produto, e um que só viu o paywall
    await inserir({ user: "user-g1@exemplo.com", tipo: "PAYWALL_IMPRESSION", em, gclid: "g" });
    await inserir({ user: "user-g1@exemplo.com", tipo: "INITIAL_PURCHASE", em: "2026-10-10T12:05:00Z", produto: "premium_yearly_150", periodo: "TRIAL" });
    await inserir({ user: "user-g2", tipo: "PAYWALL_IMPRESSION", em, gclid: "g" });
    await inserir({ user: "user-g2", tipo: "INITIAL_PURCHASE", em: "2026-10-10T12:05:00Z", produto: "premium_monthly_15:base", periodo: "NORMAL", usd: 9.99 });
    await inserir({ user: "user-g3", tipo: "PAYWALL_IMPRESSION", em, gclid: "g" });
    await inserir({ user: "user-g3", tipo: "INITIAL_PURCHASE", em: "2026-10-10T12:05:00Z", produto: null, periodo: "TRIAL" });
    await inserir({ user: "user-g4", tipo: "PAYWALL_IMPRESSION", em, gclid: "g" });
    // Orgânico (utm_source 'ig'): Trimestral e Anual por trial
    await inserir({ user: "user-o1", tipo: "PAYWALL_IMPRESSION", em, utmSource: "ig" });
    await inserir({ user: "user-o1", tipo: "INITIAL_PURCHASE", em: "2026-10-10T12:05:00Z", produto: "premium_quartely_25:base", periodo: "NORMAL", usd: 24.99 });
    await inserir({ user: "user-o2", tipo: "PAYWALL_IMPRESSION", em, utmSource: "ig" });
    await inserir({ user: "user-o2", tipo: "INITIAL_PURCHASE", em: "2026-10-10T12:05:00Z", produto: "premium_yearly_100:base", periodo: "TRIAL" });
    // QA TEST-001: promoção mensal em 01/10 (é o Iniciou dele) e trial anual em 03/10 (é o Trial dele)
    await inserir({ user: "user-o3", tipo: "PAYWALL_IMPRESSION", em: "2026-10-01T11:00:00Z", utmSource: "ig" });
    await inserir({ user: "user-o3", tipo: "NON_RENEWING_PURCHASE", em: "2026-10-01T12:00:00Z", produto: "rc_promo_Lyrio Pro_monthly", usd: 4.99 });
    await inserir({ user: "user-o3", tipo: "INITIAL_PURCHASE", em: "2026-10-03T12:00:00Z", produto: "premium_yearly_100:base", periodo: "TRIAL" });
    // fora: usuário antigo (primeiro evento antes da janela), outra etapa, TEST
    await inserir({ user: "user-velho", tipo: "PAYWALL_IMPRESSION", em: "2026-09-01T12:00:00Z", gclid: "g" });
    await inserir({ user: "user-velho", tipo: "INITIAL_PURCHASE", em, produto: "premium_yearly_150", periodo: "TRIAL" });
    await inserir({ stage: OUTRA, user: "user-outra", tipo: "INITIAL_PURCHASE", em, produto: "premium_yearly_150", periodo: "TRIAL", gclid: "g" });
    await inserir({ user: "user-teste", tipo: "TEST", em, produto: "test_product" });

    const r = await (await montar()).inject({ method: "GET", url: `${URL_}?days=28` });
    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    const p = corpo.porProduto;
    const novos = (canal: string) => p.canais.find((x: { canal: string }) => x.canal === canal).novos;
    const cel = (linha: string, canal: string) => p.linhas.find((l: { linha: string }) => l.linha === linha).canais.find((x: { canal: string }) => x.canal === canal);
    expect(novos("google_gclid")).toBe(4);
    expect(novos("organico")).toBe(3);
    expect(p.total.novos).toBe(7);
    expect(cel("anual", "google_gclid")).toEqual({ canal: "google_gclid", iniciou: 1, iniciouTeste: 1 });
    expect(cel("mensal", "google_gclid")).toEqual({ canal: "google_gclid", iniciou: 1, iniciouTeste: 0 });
    expect(cel("sem_produto", "google_gclid")).toEqual({ canal: "google_gclid", iniciou: 1, iniciouTeste: 1 });
    expect(cel("trimestral", "organico")).toEqual({ canal: "organico", iniciou: 1, iniciouTeste: 0 });
    // o user-o3 conta no Anual SÓ pelo Trial, e no Mensal SÓ pelo Iniciou
    expect(cel("anual", "organico")).toEqual({ canal: "organico", iniciou: 1, iniciouTeste: 2 });
    expect(cel("mensal", "organico")).toEqual({ canal: "organico", iniciou: 1, iniciouTeste: 0 });
    expect(cel("outros", "google_gclid")).toEqual({ canal: "google_gclid", iniciou: 0, iniciouTeste: 0 });
    // AC4c sobre a resposta: por canal, Σ linhas = a linha da Jornada
    for (const l of corpo.linhas as { canal: string; iniciou: number; iniciouTeste: number }[]) {
      const soma = (campo: "iniciou" | "iniciouTeste") => p.linhas.reduce((a: number, x: { canais: { canal: string; iniciou: number; iniciouTeste: number }[] }) => a + x.canais.find((y) => y.canal === l.canal)![campo], 0);
      expect(soma("iniciou")).toBe(l.iniciou);
      expect(soma("iniciouTeste")).toBe(l.iniciouTeste);
      expect(novos(l.canal)).toBe((l as unknown as { novos: number }).novos);
    }
    expect(p.linhas.find((l: { linha: string }) => l.linha === "anual").produtos.map((x: { productId: string }) => x.productId).sort()).toEqual(["premium_yearly_100:base", "premium_yearly_150"]);
    // AC3c: nenhum app_user_id — nem os valores, nem a chave
    const texto = JSON.stringify(corpo);
    expect(texto).not.toMatch(/user-|exemplo\.com|app_user_id|appUserId/i);
  });
});
