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
import { getTableName, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { instanteDoInicioDaJanela } from "../utils/sale-date.js";
import { metricasDerivadasDaEtapa } from "../utils/metricas-revenuecat.js";
import {
  REGRA_DOS_PLANOS,
  canalDaOrigem,
  classeDoProdutoNoSql,
  classificarProduto,
  consultaDePagantesPorCanal,
  consultaDoLtvPorPlano,
  lerLinhaDePagante,
  montarLtv,
  montarPagantes,
  pagantesPorCanalDaEtapa,
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

// ─────────────────────────── AC7 — LTV por plano (D33, PO-D7) ───────────────────────────

const ltvDaJanela = async () => montarLtv(await executar(consultaDoLtvPorPlano(STAGE, DESDE)));
const doPlano = (l: Awaited<ReturnType<typeof ltvDaJanela>>, plano: string) => l.planos.find((p) => p.plano === plano)!;
const PROMO = (s: string) => `rc_promo_Lyrio Pro_${s}`;

describe("AC7c — a classificação: função pura = SQL, caso a caso (PGlite)", () => {
  const CASOS: [string | null, string][] = [
    ["premium_monthly_10", "mensal"],
    ["premium_monthly_15:base", "mensal"],
    ["premium_monthly_15_v2", "mensal"],
    ["premium_quartely_25:base", "trimestral"],
    ["premium_quartely_partner_25", "trimestral"],
    ["premium_yearly_100:base", "anual"],
    ["premium_yearly_150", "anual"],
    ["premium_yearly_150:base", "anual"],
    ["premium_yearly_200", "anual"],
    ["premium_yearly_200:base", "anual"],
    ["premium_yearly_partner_100", "anual"],
    [PROMO("monthly"), "mensal"],
    [PROMO("three_month"), "trimestral"],
    [PROMO("yearly"), "anual"],
    [PROMO("daily"), "fora"],
    [PROMO("weekly"), "fora"],
    ["test_product", "fora"],
    [null, "nao_classificado"],
    ["premium_weekly_5", "nao_classificado"],
    ["premiumXmonthly_1", "nao_classificado"], // o `_` é literal, não curinga
    ["Premium_monthly_15", "nao_classificado"], // maiúscula: texto exato
    ["rc_promo_lyrio pro_monthly", "nao_classificado"], // caixa diferente
    ["rc_promo_LyrioPro_monthly", "nao_classificado"], // sem o espaço
    ["premium_quarterly_25", "nao_classificado"], // a grafia do dado é "quartely"
    [PROMO("monthly") + "_x", "nao_classificado"], // promoção é nome EXATO, não prefixo
  ];
  it.each(CASOS)("%s → %s", async (id, esperado) => {
    expect(classificarProduto(id)).toBe(esperado);
    const [linha] = await executar(sql`SELECT ${classeDoProdutoNoSql(sql`${id}::text`)} AS classe`);
    expect(linha.classe).toBe(esperado);
  });
  it("a regra mora numa constante: os três planos, na ordem Mensal, Trimestral, Anual (D33)", () => {
    expect(REGRA_DOS_PLANOS.map((r) => r.rotulo)).toEqual(["LTV Mensal", "LTV Trimestral", "LTV Anual"]);
  });
});

describe("AC7f — os 10 testes obrigatórios (PGlite, janela e relógio fixos)", () => {
  it("1. os três planos: um pagamento em cada família cai no plano certo, com o LTV certo", async () => {
    await inserir({ user: "m", tipo: "INITIAL_PURCHASE", usd: 9.99, produto: "premium_monthly_15:base", em: DENTRO });
    await inserir({ user: "t", tipo: "INITIAL_PURCHASE", usd: 24.99, produto: "premium_quartely_25:base", em: DENTRO });
    await inserir({ user: "a", tipo: "INITIAL_PURCHASE", usd: 59.99, produto: "premium_yearly_150", em: DENTRO });
    const l = await ltvDaJanela();
    expect(l.planos.map((p) => [p.plano, p.receitaCentavos, p.pessoas])).toEqual([["mensal", 999, 1], ["trimestral", 2499, 1], ["anual", 5999, 1]]);
    expect(doPlano(l, "anual").produtos).toEqual([{ productId: "premium_yearly_150", pagamentos: 1, pessoas: 1, receitaCentavos: 5999 }]);
  });

  it("2. partner no plano certo: premium_yearly_partner_100 → Anual; premium_quartely_partner_25 → Trimestral", async () => {
    await inserir({ user: "pa", tipo: "INITIAL_PURCHASE", usd: 50, produto: "premium_yearly_partner_100", em: DENTRO });
    await inserir({ user: "pt", tipo: "INITIAL_PURCHASE", usd: 20, produto: "premium_quartely_partner_25", em: DENTRO });
    const l = await ltvDaJanela();
    expect(doPlano(l, "anual")).toMatchObject({ pessoas: 1, receitaCentavos: 5000 });
    expect(doPlano(l, "trimestral")).toMatchObject({ pessoas: 1, receitaCentavos: 2000 });
    expect(l.naoClassificado.pagamentos).toBe(0);
  });

  it("3. promoção pela duração: _monthly → Mensal, _three_month → Trimestral, _yearly → Anual", async () => {
    await inserir({ user: "p1", tipo: "NON_RENEWING_PURCHASE", usd: 1, produto: PROMO("monthly"), em: DENTRO });
    await inserir({ user: "p3", tipo: "NON_RENEWING_PURCHASE", usd: 3, produto: PROMO("three_month"), em: DENTRO });
    await inserir({ user: "p12", tipo: "NON_RENEWING_PURCHASE", usd: 12, produto: PROMO("yearly"), em: DENTRO });
    const l = await ltvDaJanela();
    expect(l.planos.map((p) => [p.plano, p.receitaCentavos])).toEqual([["mensal", 100], ["trimestral", 300], ["anual", 1200]]);
  });

  it("4. daily e weekly pagos: fora de todo LTV e SEM aviso de não classificado (D33)", async () => {
    await inserir({ user: "d", tipo: "NON_RENEWING_PURCHASE", usd: 0.99, produto: PROMO("daily"), em: DENTRO });
    await inserir({ user: "w", tipo: "NON_RENEWING_PURCHASE", usd: 2.99, produto: PROMO("weekly"), em: DENTRO });
    const l = await ltvDaJanela();
    expect(l.planos.every((p) => p.pessoas === 0 && p.receitaCentavos === 0)).toBe(true);
    expect(l.naoClassificado.pagamentos).toBe(0);
    expect(l.foraPorDecisao).toMatchObject({ pagamentos: 2, receitaCentavos: 398 });
    expect(l.foraPorDecisao.produtos.map((x) => x.productId)).toEqual([PROMO("weekly"), PROMO("daily")]);
  });

  it("5. a mesma pessoa em dois ids do mesmo plano conta UMA vez; a receita soma", async () => {
    await inserir({ user: "u", tipo: "INITIAL_PURCHASE", usd: 10, produto: "premium_monthly_10", em: DENTRO });
    await inserir({ user: "u", tipo: "INITIAL_PURCHASE", usd: 15, produto: "premium_monthly_15_v2", em: DEPOIS_NA_JANELA });
    const m = doPlano(await ltvDaJanela(), "mensal");
    expect(m).toMatchObject({ pessoas: 1, receitaCentavos: 2500 });
    expect(m.produtos.map((x) => [x.productId, x.pessoas])).toEqual([["premium_monthly_15_v2", 1], ["premium_monthly_10", 1]]);
  });

  it("6. promoção com US$ 0 não soma receita nem conta pessoa; plano só com ela → 0 pessoas (a tela mostra '—')", async () => {
    await inserir({ user: "z", tipo: "NON_RENEWING_PURCHASE", usd: 0, produto: PROMO("monthly"), em: DENTRO });
    const l = await ltvDaJanela();
    expect(doPlano(l, "mensal")).toMatchObject({ pessoas: 0, receitaCentavos: 0, produtos: [] });
    expect(l.naoClassificado.pagamentos).toBe(0);
  });

  it("7. id não classificado (premium_weekly_5, fictício): fora de todo LTV e no aviso, com a receita e o id", async () => {
    await inserir({ user: "x", tipo: "INITIAL_PURCHASE", usd: 5, produto: "premium_weekly_5", em: DENTRO });
    const l = await ltvDaJanela();
    expect(l.planos.every((p) => p.pessoas === 0)).toBe(true);
    expect(l.naoClassificado).toMatchObject({ pagamentos: 1, pessoas: 1, receitaCentavos: 500 });
    expect(l.naoClassificado.produtos.map((x) => x.productId)).toEqual(["premium_weekly_5"]);
  });

  it("8. o escape do prefixo: premiumXmonthly_1 (que só casaria com `_` curinga) NÃO entra no Mensal", async () => {
    await inserir({ user: "esc", tipo: "INITIAL_PURCHASE", usd: 7, produto: "premiumXmonthly_1", em: DENTRO });
    const l = await ltvDaJanela();
    expect(doPlano(l, "mensal").pessoas).toBe(0);
    expect(l.naoClassificado.produtos.map((x) => x.productId)).toEqual(["premiumXmonthly_1"]);
  });

  it("9. divisão por zero: plano sem pagante → 0 pessoas e 0 de receita (o LTV é `null` no web, nunca 0)", async () => {
    await inserir({ user: "a", tipo: "INITIAL_PURCHASE", usd: 59.99, produto: "premium_yearly_150", em: DENTRO });
    const l = await ltvDaJanela();
    expect(doPlano(l, "mensal")).toEqual({ plano: "mensal", rotulo: "LTV Mensal", receitaCentavos: 0, pessoas: 0, produtos: [] });
  });

  it("10. test_product em evento PAGO de fixture: fora, sem aviso", async () => {
    await inserir({ user: "tp", tipo: "INITIAL_PURCHASE", usd: 1, produto: "test_product", em: DENTRO });
    const l = await ltvDaJanela();
    expect(l.naoClassificado.pagamentos).toBe(0);
    expect(l.foraPorDecisao.produtos.map((x) => x.productId)).toEqual(["test_product"]);
  });

  it("pagamento sem product_id e evento fora da janela: o nulo é não classificado; o de fora da janela não entra", async () => {
    await inserir({ user: "n", tipo: "INITIAL_PURCHASE", usd: 3, em: DENTRO });
    await inserir({ user: "f", tipo: "INITIAL_PURCHASE", usd: 59.99, produto: "premium_yearly_150", em: ANTES });
    const l = await ltvDaJanela();
    expect(l.naoClassificado.produtos).toEqual([{ productId: null, pagamentos: 1, pessoas: 1, receitaCentavos: 300 }]);
    expect(doPlano(l, "anual").pessoas).toBe(0);
  });

  it("a mesma pessoa em DOIS planos conta uma vez em cada um; nenhum app_user_id sai", async () => {
    await inserir({ user: "pessoa-secreta", tipo: "INITIAL_PURCHASE", usd: 10, produto: "premium_monthly_10", em: DENTRO });
    await inserir({ user: "pessoa-secreta", tipo: "INITIAL_PURCHASE", usd: 60, produto: "premium_yearly_150", em: DEPOIS_NA_JANELA });
    const linhas = await executar(consultaDoLtvPorPlano(STAGE, DESDE));
    expect(JSON.stringify(linhas)).not.toContain("pessoa-secreta");
    const l = montarLtv(linhas);
    expect([doPlano(l, "mensal").pessoas, doPlano(l, "anual").pessoas]).toEqual([1, 1]);
  });
});

describe("a composição das rotas sobre Postgres real — o mesmo código que a sonda de produção roda", () => {
  const executor = async (q: SQL) => ({ rows: await executar(q) });

  it("pagantesPorCanalDaEtapa: novos pagantes, renovações e LTV numa resposta, com o eco da janela", async () => {
    await inserir({ user: "a", tipo: "INITIAL_PURCHASE", usd: 59.99, produto: "premium_yearly_150", em: DENTRO, attrs: { ad_network: "meta" } });
    await inserir({ user: "b", tipo: "INITIAL_PURCHASE", usd: 9.99, produto: "premium_monthly_15:base", em: ANTES });
    await inserir({ user: "b", tipo: "RENEWAL", usd: 9.99, produto: "premium_monthly_15:base", em: DENTRO });
    await inserir({ user: "c", tipo: "PAYWALL_IMPRESSION", em: "2026-10-06T03:11:13Z", attrs: { ad_network: "google" } });
    const r = await pagantesPorCanalDaEtapa(executor, STAGE, 28, AGORA);
    expect(r).toMatchObject({ days: 28, desde: "2026-09-19", assinaturaDesde: "2026-09-01", atributosDesde: "2026-10-06", novosPagantes: { total: 1 }, renovacoes: { total: 1 } });
    expect(r.novosPagantes.canais[0]).toMatchObject({ canal: "meta", quantidade: 1 });
    expect(r.ltv.planos.map((p) => [p.plano, p.pessoas])).toEqual([["mensal", 1], ["trimestral", 0], ["anual", 1]]);

    // QA TEST-003 — as QUATRO consultas são da etapa: eventos de OUTRA etapa (de outro
    // funil/projeto; o `stage_id` é único entre projetos) — pagantes, renovações, produtos
    // do LTV, atributos de canal e uma série que começa ANTES — não mudam nada.
    const outra = (e: Omit<Evento, "stage">) => inserir({ ...e, stage: OUTRA });
    await outra({ user: "x1", tipo: "INITIAL_PURCHASE", usd: 99, produto: "premium_yearly_150", em: DENTRO, attrs: { ad_network: "meta" } }); // pagante + LTV
    await outra({ user: "x2", tipo: "INITIAL_PURCHASE", usd: 9.99, produto: "premium_quartely_25:base", em: ANTES });
    await outra({ user: "x2", tipo: "RENEWAL", usd: 9.99, produto: "premium_quartely_25:base", em: DENTRO, gclid: "Cj0" }); // renovação
    await outra({ user: "x3", tipo: "INITIAL_PURCHASE", usd: 5, produto: "premium_weekly_5", em: DENTRO }); // não classificado
    await outra({ user: "x4", tipo: "INITIAL_PURCHASE", em: "2026-08-01T12:00:00Z" }); // série da outra etapa começa antes
    await outra({ user: "x5", tipo: "PAYWALL_IMPRESSION", em: "2026-09-02T12:00:00Z", attrs: { ad_network: "meta" } }); // atributos antes
    // o usuário "a" desta etapa com sinal do Google noutra etapa: não vira conflito aqui
    await outra({ user: "a", tipo: "PAYWALL_IMPRESSION", em: ANTES, gclid: "Cj9" });
    expect(await pagantesPorCanalDaEtapa(executor, STAGE, 28, AGORA)).toEqual(r);
  });

  it("metricasDerivadasDaEtapa: o period_type sai do payload no SQL; janela de SP e eco", async () => {
    const ins = (user: string, tipo: string, em: string, periodo: string) =>
      pg.query(
        `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, event_at, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
        [STAGE, `d${(seq += 1)}`, tipo, user, em, JSON.stringify({ event: { period_type: periodo } })],
      );
    await ins("t1", "INITIAL_PURCHASE", DENTRO, "TRIAL");
    await ins("t1", "RENEWAL", DEPOIS_NA_JANELA, "NORMAL");
    await ins("t0", "INITIAL_PURCHASE", ANTES, "TRIAL");
    await ins("p1", "INITIAL_PURCHASE", DENTRO, "NORMAL");
    const r = await metricasDerivadasDaEtapa(executor, STAGE, 28, AGORA);
    expect(r).toMatchObject({ novosTrials: 1, conversoesDeTrial: 1, novasAssinaturasPagas: 1, days: 28, desde: "2026-09-19", serieDesde: "2026-09-01" });
    const serie = await metricasDerivadasDaEtapa(executor, STAGE, undefined, AGORA);
    expect(serie).toMatchObject({ novosTrials: 2, days: null, desde: null });

    // QA TEST-003 — só os eventos DESTA etapa: os de OUTRA etapa (de outro funil/projeto) —
    // trials, pagos, churn, cancelamento e uma série que começa ANTES — não mudam nada.
    const insOutra = (user: string, tipo: string, em: string, periodo: string) =>
      pg.query(
        `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, event_at, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
        [OUTRA, `o${(seq += 1)}`, tipo, user, em, JSON.stringify({ event: { period_type: periodo } })],
      );
    await insOutra("y1", "INITIAL_PURCHASE", DENTRO, "TRIAL");
    await insOutra("y2", "INITIAL_PURCHASE", DENTRO, "NORMAL");
    await insOutra("y3", "EXPIRATION", DENTRO, "NORMAL");
    await insOutra("y4", "CANCELLATION", DENTRO, "NORMAL");
    await insOutra("y5", "INITIAL_PURCHASE", "2026-08-01T12:00:00Z", "TRIAL");
    // o trial "t0" desta etapa pagando noutra etapa não vira conversão aqui
    await insOutra("t0", "RENEWAL", DENTRO, "NORMAL");
    expect(await metricasDerivadasDaEtapa(executor, STAGE, 28, AGORA)).toEqual(r);
    expect(await metricasDerivadasDaEtapa(executor, STAGE, undefined, AGORA)).toEqual(serie);
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
      if (/total_da_classe/.test(t.sql)) {
        return {
          rows: [
            { classe: "anual", product_id: null, total_da_classe: 1, pagamentos: 1, pessoas: 1, receita_centavos: 3999 },
            { classe: "anual", product_id: "premium_yearly_150", total_da_classe: 0, pagamentos: 1, pessoas: 1, receita_centavos: 3999 },
          ],
        };
      }
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

  it("as quatro consultas com o stageId DA ROTA e a régua de SP; ecoa a janela e a cobertura; LTV por plano; só contagens", async () => {
    const banco = bancoFalso();
    const r = await (await montar(banco)).inject({ method: "GET", url: `${URL_}?days=28` });
    expect(r.statusCode).toBe(200);
    expect(banco.executados).toHaveLength(4);
    expect(banco.executados.find((e) => /total_da_classe/.test(e.sql))!.params).toContain(DESDE.toISOString());
    for (const e of banco.executados) expect(JSON.stringify(e.params)).toContain(STAGE);
    const pessoas = banco.executados.find((e) => /novo_na_janela/.test(e.sql))!;
    expect(pessoas.params).toContain(DESDE.toISOString());
    const corpo = r.json();
    expect(Object.keys(corpo).sort()).toEqual(["assinaturaDesde", "atributosDesde", "days", "desde", "ltv", "novosPagantes", "renovacoes"]);
    expect(corpo.ltv.planos.map((p: { plano: string }) => p.plano)).toEqual(["mensal", "trimestral", "anual"]);
    expect(corpo.ltv.planos[2]).toMatchObject({ rotulo: "LTV Anual", pessoas: 1, receitaCentavos: 3999, produtos: [{ productId: "premium_yearly_150", pessoas: 1 }] });
    expect(corpo).toMatchObject({ days: 28, desde: "2026-09-19", assinaturaDesde: "2026-08-10", novosPagantes: { total: 1, conflito: 0 }, renovacoes: { total: 2 } });
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId/i);
  });

  it("etapa de outro funil/projeto → 404 SEM consultar eventos; days inválido → 400", async () => {
    const banco = bancoFalso({ etapa: false });
    expect((await (await montar(banco)).inject({ method: "GET", url: URL_ })).statusCode).toBe(404);
    expect(banco.executados).toHaveLength(0);
    expect((await (await montar(bancoFalso())).inject({ method: "GET", url: `${URL_}?days=0` })).statusCode).toBe(400);
  });
});
