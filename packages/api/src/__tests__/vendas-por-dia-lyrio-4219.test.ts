/**
 * Story 42.19 (AC3, AC6c) — a venda da Meta por entidade E por dia, para a
 * linha expansível do Detalhamento do Lyrio.
 *
 *  1. PGlite (Postgres de verdade em memória; o `.env` aponta para produção e
 *     não é tocado): a consulta `consultaDeVendasPorCanalComDias` com eventos
 *     semeados — a PARIDADE do AC3b nas três dimensões e na chave `null`, a
 *     venda das 23:30 de SP no dia de SP, a atribuição do comprador (R2) e
 *     nenhum id de usuário;
 *  2. as linhas `grao = 'comprador'` são as de `consultaDeVendasPorCanal`
 *     (a linha do Detalhamento não muda);
 *  3. o fio da rota: `metaPorEntidadeDiario` na resposta, com as mesmas três
 *     consultas de antes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";
import {
  consultaDeVendasPorCanal,
  consultaDeVendasPorCanalComDias,
  lerDiaDeVendas,
  lerLinhaDeVendas,
  montarVendasPorCanal,
  montarVendasPorDiaDaMeta,
  type DiaDoComprador,
  type VendasPorCanal,
  type VendasPorDiaDaMeta,
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

type Evento = { user: string | null; tipo: string; usd?: number | null; em: string; attrs?: unknown; gclid?: string };
let seq = 0;
async function inserir(e: Evento) {
  seq += 1;
  const payload = e.attrs === undefined ? { event: {} } : { event: { subscriber_attributes: e.attrs } };
  await pg.query(
    `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, revenue_usd, purchased_at, event_at, gclid, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [STAGE, `ev${seq}`, e.tipo, e.user, e.usd ?? null, e.usd != null ? e.em : null, e.em, e.gclid ?? null, JSON.stringify(payload), e.em],
  );
}

const DESDE = new Date("2026-10-01T03:00:00.000Z"); // 01/10 00:00 de SP
const anuncio = (campanha: string, conjunto: string, ad: string) => ({
  ad_network: "meta",
  meta_campaign_id: campanha,
  meta_campaign_name: `nome-${campanha}`,
  meta_adset_name: conjunto,
  meta_ad_name: ad,
});

/** Cada usuário semeia uma regra; o esperado está no nome. */
async function semear() {
  await pg.query("DELETE FROM revenuecat_sales");
  // dois-dias: paga em dois dias com 4 casas — 4,9950 + 4,9950 = 9,99 (999 ¢). Cada dia
  // arredondado sozinho daria 500 + 500 = 1000 ¢: a soma dos dias passaria da linha.
  await inserir({ user: "dois-dias", tipo: "INITIAL_PURCHASE", usd: 4.995, em: "2026-10-10T15:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-roteiro-07") });
  await inserir({ user: "dois-dias", tipo: "RENEWAL", usd: 4.995, em: "2026-10-12T15:00:00Z" });
  // mesmo-dia: duas vendas no MESMO dia contam 2 vendas e 1 comprador naquele dia
  await inserir({ user: "mesmo-dia", tipo: "INITIAL_PURCHASE", usd: 3.3333, em: "2026-10-10T12:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-roteiro-07") });
  await inserir({ user: "mesmo-dia", tipo: "NON_RENEWING_PURCHASE", usd: 3.3333, em: "2026-10-10T18:00:00Z" });
  // noite-sp: 23:30 de SP de 11/10 = 02:30Z de 12/10 → o dia é 11/10 (o dia de SP)
  await inserir({ user: "noite-sp", tipo: "INITIAL_PURCHASE", usd: 7, em: "2026-10-12T02:30:00Z", attrs: anuncio("1202B", "Conjunto Quente", "ad-roteiro-02") });
  // depois: R2/PO-03 — vende em 05/10 pelo anúncio velho e toca outro anúncio em 20/10;
  // a venda de 05/10 vai para o anúncio MAIS RECENTE (a regra da linha)
  await inserir({ user: "depois", tipo: "INITIAL_PURCHASE", usd: 5.5, em: "2026-10-05T12:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-velho") });
  await inserir({ user: "depois", tipo: "PAYWALL_IMPRESSION", em: "2026-10-20T12:00:00Z", attrs: anuncio("1202B", "Conjunto Quente", "ad-novo") });
  // sem-ids: Meta sem os ids → chave null nos três níveis (D2b)
  await inserir({ user: "sem-ids", tipo: "INITIAL_PURCHASE", usd: 11.5312, em: "2026-10-08T12:00:00Z", attrs: { ad_network: "meta" } });
  await inserir({ user: "sem-ids", tipo: "RENEWAL", usd: 11.5312, em: "2026-10-09T12:00:00Z" });
  // fora-da-janela: a compra antiga não entra; só a renovação dentro
  await inserir({ user: "fora-da-janela", tipo: "INITIAL_PURCHASE", usd: 30, em: "2026-09-20T12:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-roteiro-07") });
  await inserir({ user: "fora-da-janela", tipo: "RENEWAL", usd: 2.2222, em: "2026-10-15T12:00:00Z" });
  // não-Meta: Google, conflito e teste grátis não entram na quebra da Meta
  await inserir({ user: "google", tipo: "INITIAL_PURCHASE", usd: 6.8, em: "2026-10-10T12:00:00Z", attrs: { ad_network: "google" } });
  await inserir({ user: "conflito", tipo: "INITIAL_PURCHASE", usd: 1, em: "2026-10-10T12:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-roteiro-07"), gclid: "Cj0" });
  await inserir({ user: "gratis", tipo: "INITIAL_PURCHASE", usd: 0, em: "2026-10-10T12:00:00Z", attrs: anuncio("1202A", "Conjunto Frio", "ad-roteiro-07") });
}

let linhas: Record<string, unknown>[];
let linha: VendasPorCanal;
let dias: VendasPorDiaDaMeta;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await semear();
  linhas = await executar(consultaDeVendasPorCanalComDias(STAGE, DESDE));
  linha = montarVendasPorCanal(linhas.filter((r) => r.grao === "comprador").map(lerLinhaDeVendas));
  dias = montarVendasPorDiaDaMeta(linhas.filter((r) => r.grao === "dia").map(lerDiaDeVendas).filter((d): d is DiaDoComprador => d !== null));
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

const NIVEIS = ["campaign", "adset", "ad"] as const;

describe("AC3b — paridade: por entidade, a soma dos dias é a linha (PGlite)", () => {
  it.each(NIVEIS)("%s — vendas e receita (ao centavo) de cada chave, inclusive a null", (nivel) => {
    const somaPorChave = new Map<string | null, { vendas: number; centavos: number }>();
    for (const d of dias[nivel]) {
      const a = somaPorChave.get(d.chave) ?? { vendas: 0, centavos: 0 };
      a.vendas += d.vendas;
      a.centavos += Math.round(d.receitaUsd * 100);
      somaPorChave.set(d.chave, a);
    }
    const daLinha = new Map(linha.metaPorEntidade[nivel].map((e) => [e.chave, { vendas: e.vendas, centavos: Math.round(e.receitaUsd * 100) }]));
    expect(new Map([...somaPorChave].sort())).toEqual(new Map([...daLinha].sort()));
    expect(daLinha.has(null)).toBe(true);
  });

  it("o caso que quebra o arredondamento dia a dia: 4,995 + 4,995 = 9,99 (999 ¢), e os dias somam a linha", () => {
    const ad07 = dias.ad.filter((d) => d.chave === "ad-roteiro-07");
    // dois-dias (10 e 12/10), mesmo-dia (10/10), fora-da-janela (15/10)
    expect(ad07.map((d) => [d.dia, d.vendas, d.compradores])).toEqual([
      ["2026-10-10", 3, 2],
      ["2026-10-12", 1, 1],
      ["2026-10-15", 1, 1],
    ]);
    const centavos = ad07.reduce((s, d) => s + Math.round(d.receitaUsd * 100), 0);
    const daLinha = linha.metaPorEntidade.ad.find((e) => e.chave === "ad-roteiro-07")!;
    // 9,99 + 6,6666 (→ 6,67) + 2,2222 (→ 2,22) = 18,88
    expect(daLinha).toMatchObject({ vendas: 5, compradores: 3, receitaUsd: 18.88 });
    expect(centavos).toBe(1888);
  });

  it("`compradores` é quem pagou NAQUELE dia: quem paga em dois dias conta nos dois (não soma a linha)", () => {
    const frio = dias.adset.filter((d) => d.chave === "Conjunto Frio");
    const somaDosDias = frio.reduce((s, d) => s + d.compradores, 0);
    const daLinha = linha.metaPorEntidade.adset.find((e) => e.chave === "Conjunto Frio")!;
    expect(somaDosDias).toBeGreaterThan(daLinha.compradores);
  });

  it("chave null (sem os ids) nos três níveis, nos dois dias da venda", () => {
    for (const nivel of NIVEIS) {
      expect(dias[nivel].filter((d) => d.chave === null).map((d) => [d.dia, d.vendas, d.receitaUsd])).toEqual([
        ["2026-10-08", 1, 11.53],
        ["2026-10-09", 1, 11.53],
      ]);
    }
    // a linha: 23,0624 → 23,06 ¢ — o segundo dia leva o centavo do acumulado (11,5312 → 11,53; 23,0624 → 23,06)
    expect(linha.metaPorEntidade.ad.find((e) => e.chave === null)).toMatchObject({ vendas: 2, receitaUsd: 23.06 });
  });
});

describe("AC3a — o dia é o de SP da venda; a atribuição é a do comprador (R2)", () => {
  it("23:30 de SP fica no dia de SP (11/10), não no dia seguinte em UTC", () => {
    expect(dias.ad.filter((d) => d.chave === "ad-roteiro-02").map((d) => d.dia)).toEqual(["2026-10-11"]);
  });
  it("a venda de 05/10 vai para o anúncio mais recente do comprador (tocado em 20/10), não para o do dia", () => {
    expect(dias.ad.filter((d) => d.chave === "ad-novo").map((d) => [d.dia, d.vendas])).toEqual([["2026-10-05", 1]]);
    expect(dias.ad.some((d) => d.chave === "ad-velho")).toBe(false);
    expect(dias.campaign.filter((d) => d.chave === "1202B").map((d) => d.dia).sort()).toEqual(["2026-10-05", "2026-10-11"]);
  });
  it("só a Meta: Google, conflito, US$ 0 e a compra fora da janela não aparecem", () => {
    const todos = NIVEIS.flatMap((n) => dias[n]);
    expect(todos.some((d) => d.dia < "2026-10-01")).toBe(false);
    const vendasMeta = linha.canais.find((x) => x.canal === "meta")!.vendas;
    for (const n of NIVEIS) expect(dias[n].reduce((s, d) => s + d.vendas, 0)).toBe(vendasMeta);
  });
});

describe("AC3c — a mesma janela e nenhum id de usuário", () => {
  it("as linhas `comprador` são as de `consultaDeVendasPorCanal`, coluna a coluna (a linha do Detalhamento não muda)", async () => {
    const antes = await executar(consultaDeVendasPorCanal(STAGE, DESDE));
    const chaveDe = (r: Record<string, unknown>) => JSON.stringify(lerLinhaDeVendas(r));
    expect(linhas.filter((r) => r.grao === "comprador").map(chaveDe).sort()).toEqual(antes.map(chaveDe).sort());
  });
  it("nenhuma coluna de id e nenhum id semeado no resultado", () => {
    expect(Object.keys(linhas[0]).sort()).toEqual([
      "dia", "grao", "meta_ad_name", "meta_adset_name", "meta_campaign_id", "meta_campaign_name",
      "receita_ate_a_vespera", "receita_ate_o_dia", "receita_usd", "s_google", "s_meta", "s_organico", "vendas",
    ]);
    expect(JSON.stringify(linhas)).not.toMatch(/dois-dias|mesmo-dia|noite-sp|sem-ids|fora-da-janela/);
    expect(JSON.stringify(dias)).not.toMatch(/dois-dias|mesmo-dia|noite-sp|sem-ids|fora-da-janela|app_user_id/);
  });
});

describe("lerDiaDeVendas / montarVendasPorDiaDaMeta — a função pura", () => {
  it("o centavo do dia é round(até o dia) − round(até a véspera); sem dia válido → null", () => {
    const base = { s_meta: true, s_google: false, s_organico: false, vendas: 1, meta_campaign_id: "1", meta_campaign_name: "c", meta_adset_name: "s", meta_ad_name: "a" };
    expect(lerDiaDeVendas({ ...base, dia: "2026-10-12", receita_ate_o_dia: 9.99, receita_ate_a_vespera: 4.995 })).toMatchObject({ dia: "2026-10-12", centavos: 499 });
    expect(lerDiaDeVendas({ ...base, dia: "2026-10-10", receita_ate_o_dia: "4.9950", receita_ate_a_vespera: 0 })).toMatchObject({ centavos: 500 });
    expect(lerDiaDeVendas({ ...base, dia: null, receita_ate_o_dia: 1, receita_ate_a_vespera: 0 })).toBeNull();
  });
  it("canal pela regra de `canalDaVenda`: Google e conflito ficam fora", () => {
    const d = (p: Partial<DiaDoComprador>): DiaDoComprador => ({ meta: true, google: false, organico: false, vendas: 1, metaCampaignId: "1", metaCampaignName: null, metaAdsetName: "s", metaAdName: "a", dia: "2026-10-10", centavos: 100, ...p });
    const r = montarVendasPorDiaDaMeta([d({}), d({ google: true }), d({ meta: false, google: true }), d({ vendas: 0 })]);
    expect(r.ad).toEqual([{ chave: "a", dia: "2026-10-10", vendas: 1, compradores: 1, receitaUsd: 1 }]);
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
        // o banco de verdade: as linhas do PGlite semeado acima
        if (/group by/i.test(texto)) return { rows: linhas };
        if (/sem_valor/.test(texto)) return { rows: [{ sem_valor: 0, sem_usuario: 0 }] };
        return { rows: [{ desde: new Date("2026-10-06T03:11:13.705Z") }] };
      },
    },
  };
}

describe("GET …/revenuecat/vendas-por-canal — `metaPorEntidadeDiario` (AC3a, AC7a)", () => {
  it("a resposta traz os dias, a linha de sempre e nenhum id; as mesmas três consultas", async () => {
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
    expect(corpo.metaPorEntidadeDiario).toEqual(JSON.parse(JSON.stringify(dias)));
    expect(corpo.metaPorEntidade).toEqual(JSON.parse(JSON.stringify(linha.metaPorEntidade)));
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId|dois-dias|sem-ids|"grao"/);
  });
  it("o contrato sobe para a v62 (campo novo)", () => {
    expect(API_CONTRACT_VERSION).toBeGreaterThanOrEqual(62);
  });
});
