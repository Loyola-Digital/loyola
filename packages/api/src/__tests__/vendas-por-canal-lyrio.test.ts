/**
 * Story 42.12 (AC8) — as vendas do Lyrio por canal.
 *
 * Quatro camadas, cada uma provada onde ela vive:
 *  1. a função pura (regra de canal D2…D7, contagem em centavos, quebra da Meta);
 *  2. a EQUIVALÊNCIA da leitura de atributo no SQL com `readSubscriberAttribute`
 *     (PO-01) — rodada num Postgres de verdade (PGlite em memória; nada toca o
 *     `.env`, que aponta para produção), caso a caso;
 *  3. as consultas inteiras sobre o PGlite com eventos semeados: canal pelo
 *     usuário (D6), janela por `purchased_at` (PO-02), US$ 0 fora (D4), o que
 *     fica fora da quebra fecha com o escopo de `/sales` (PO-03), e a Jornada
 *     com as duas linhas novas (AC4);
 *  4. o FIO: a rota com um banco falso que captura o SQL executado.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import revenuecatRoutes from "../routes/revenuecat.js";
import { businessToday, inicioDaJanela, instanteDoInicioDaJanela } from "../utils/sale-date.js";
import { readSubscriberAttribute } from "../services/revenuecat.js";
import { canalDoUsuario, consultaDaJornada, lerLinhaDaJornada, montarJornada } from "../utils/jornada-lyrio.js";
import {
  CANAIS_DA_VENDA,
  atributo,
  canalDaVenda,
  consultaDeVendasPorCanal,
  consultaDoInicioDosAtributos,
  consultaDoQueFicaForaDaQuebra,
  diaNoFusoDoNegocio,
  lerLinhaDeVendas,
  montarVendasPorCanal,
  type CompradorDoLyrio,
} from "../utils/vendas-por-canal-lyrio.js";

const dialeto = new PgDialect();
const STAGE = "54366a93-ff30-4e2e-9542-c44e55e9bf71";
const OUTRA = "99999999-9999-4999-8999-999999999999";

// ─────────────────────────── 1. função pura ───────────────────────────

const comprador = (p: Partial<CompradorDoLyrio> = {}): CompradorDoLyrio => ({
  meta: false,
  google: false,
  organico: false,
  vendas: 1,
  receitaUsd: 3.01,
  metaCampaignId: null,
  metaCampaignName: null,
  metaAdsetName: null,
  metaAdName: null,
  ...p,
});

describe("canalDaVenda — a regra das decisões D2…D7", () => {
  it("Meta e Google pelos sinais; orgânico só sem sinal pago; o resto é sem atribuição", () => {
    expect(canalDaVenda({ meta: true, google: false, organico: true })).toBe("meta");
    expect(canalDaVenda({ meta: false, google: true, organico: true })).toBe("google");
    expect(canalDaVenda({ meta: false, google: false, organico: true })).toBe("organico");
    expect(canalDaVenda({ meta: false, google: false, organico: false })).toBe("sem_atribuicao");
  });
  it("D7 — Meta E Google no mesmo usuário → conflito, nunca um dos dois", () => {
    expect(canalDaVenda({ meta: true, google: true, organico: false })).toBe("conflito");
  });
});

describe("montarVendasPorCanal — contagem e quebra da Meta", () => {
  it("as 4 linhas saem sempre, na ordem, mesmo zeradas; conflito à parte", () => {
    const r = montarVendasPorCanal([]);
    expect(r.canais.map((c) => c.rotulo)).toEqual(["Meta", "Google", "Orgânico ou cupom", "Sem atribuição"]);
    expect(CANAIS_DA_VENDA).toHaveLength(4);
    expect(r.totalPago).toEqual({ vendas: 0, compradores: 0, receitaUsd: 0 });
    expect(r.conflito).toEqual({ vendas: 0, compradores: 0, receitaUsd: 0 });
  });
  it("vendas × compradores × receita; o total = linhas + conflito, ao centavo", () => {
    const r = montarVendasPorCanal([
      comprador({ meta: true, vendas: 2, receitaUsd: 0.1 }),
      comprador({ meta: true, vendas: 1, receitaUsd: 0.2 }),
      comprador({ google: true, vendas: 1, receitaUsd: 20.052 }),
      comprador({ meta: true, google: true, vendas: 1, receitaUsd: 1 }),
      comprador({ organico: true, vendas: 1, receitaUsd: 2.99 }),
      comprador({ vendas: 1, receitaUsd: 3 }),
    ]);
    const de = (canal: string) => r.canais.find((c) => c.canal === canal)!;
    expect(de("meta")).toMatchObject({ vendas: 3, compradores: 2, receitaUsd: 0.3 });
    expect(de("google")).toMatchObject({ vendas: 1, compradores: 1, receitaUsd: 20.05 });
    expect(de("organico")).toMatchObject({ vendas: 1, receitaUsd: 2.99 });
    expect(de("sem_atribuicao")).toMatchObject({ vendas: 1, receitaUsd: 3 });
    expect(r.conflito).toEqual({ vendas: 1, compradores: 1, receitaUsd: 1 });
    expect(r.totalPago).toEqual({ vendas: 7, compradores: 6, receitaUsd: 27.34 });
    const somaCentavos = r.canais.reduce((a, c) => a + Math.round(c.receitaUsd * 100), 0) + Math.round(r.conflito.receitaUsd * 100);
    expect(somaCentavos).toBe(Math.round(r.totalPago.receitaUsd * 100));
  });
  it("comprador sem venda na janela não entra (a função vale sozinha, sem o HAVING)", () => {
    expect(montarVendasPorCanal([comprador({ meta: true, vendas: 0, receitaUsd: 0 })]).totalPago.compradores).toBe(0);
  });
  it("quebra da Meta: campanha por ID, conjunto e anúncio por NOME; sem atributo = não identificado (D2b); só a Meta entra", () => {
    const r = montarVendasPorCanal([
      comprador({ meta: true, metaCampaignId: "1202A", metaCampaignName: "app_ios_cold", metaAdsetName: "auto_18-64", metaAdName: "ads_roteiro-07", receitaUsd: 3 }),
      comprador({ meta: true, metaCampaignId: "1202A", metaCampaignName: "app_ios_cold", metaAdsetName: "auto_18-64", metaAdName: "ads_roteiro-02", receitaUsd: 5 }),
      comprador({ meta: true, receitaUsd: 11.53 }),
      comprador({ google: true, metaCampaignId: "1202Z", receitaUsd: 99 }),
    ]);
    // ordenada por receita (maior primeiro)
    expect(r.metaPorEntidade.campaign).toEqual([
      { chave: null, nome: null, vendas: 1, compradores: 1, receitaUsd: 11.53 },
      { chave: "1202A", nome: "app_ios_cold", vendas: 2, compradores: 2, receitaUsd: 8 },
    ]);
    expect(r.metaPorEntidade.adset.map((e) => [e.chave, e.vendas])).toEqual([[null, 1], ["auto_18-64", 2]]);
    expect(r.metaPorEntidade.ad.map((e) => e.chave)).toEqual([null, "ads_roteiro-02", "ads_roteiro-07"]);
    // a quebra soma o total da linha Meta em cada nível
    for (const nivel of ["campaign", "adset", "ad"] as const) {
      expect(r.metaPorEntidade[nivel].reduce((a, e) => a + e.vendas, 0)).toBe(r.canais[0].vendas);
    }
  });
  it("lerLinhaDeVendas: float8 em string, booleanos do pg, texto vazio vira null", () => {
    expect(lerLinhaDeVendas({ s_meta: true, s_google: false, s_organico: false, vendas: "2", receita_usd: "6.0200", meta_campaign_id: "1202", meta_campaign_name: "", meta_adset_name: null })).toEqual(
      comprador({ meta: true, vendas: 2, receitaUsd: 6.02, metaCampaignId: "1202" }),
    );
  });
});

// ─────────────────────────── 2–3. PGlite ───────────────────────────

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
  payload jsonb NOT NULL
);`;

let pg: PGlite;
const executar = async (q: SQL) => {
  const { sql: texto, params } = dialeto.sqlToQuery(q);
  return (await pg.query(texto, params as unknown[])).rows as Record<string, unknown>[];
};

type Evento = {
  stage?: string;
  user: string | null;
  tipo: string;
  usd?: number | null;
  compra?: string | null;
  em: string;
  attrs?: unknown;
  gclid?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};
let seq = 0;
async function inserir(e: Evento) {
  seq += 1;
  const payload = e.attrs === undefined ? { event: {} } : { event: { subscriber_attributes: e.attrs } };
  await pg.query(
    `INSERT INTO revenuecat_sales (stage_id, event_id, event_type, app_user_id, revenue_usd, purchased_at, event_at, gclid, utm_source, utm_medium, utm_campaign, utm_content, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [e.stage ?? STAGE, `ev${seq}`, e.tipo, e.user, e.usd ?? null, e.compra === undefined ? (e.usd != null ? e.em : null) : e.compra, e.em, e.gclid ?? null, e.utmSource ?? null, e.utmMedium ?? null, e.utmCampaign ?? null, e.utmContent ?? null, JSON.stringify(payload)],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe("PO-01 — `atributo()` no SQL = `readSubscriberAttribute` no TS, caso a caso (PGlite)", () => {
  const CASOS: { nome: string; attrs: unknown }[] = [
    { nome: "string plana", attrs: { k: "meta" } },
    { nome: "objeto { value }", attrs: { k: { value: "meta", updated_at_ms: 1 } } },
    { nome: "id longo em string", attrs: { k: "120246538826290452" } },
    { nome: "número", attrs: { k: 42 } },
    { nome: "número no value", attrs: { k: { value: 42 } } },
    { nome: "booleano", attrs: { k: true } },
    { nome: "booleano no value", attrs: { k: { value: false } } },
    { nome: "espaços nas pontas", attrs: { k: "  meta  " } },
    { nome: "tab e quebra nas pontas", attrs: { k: "\tmeta\n" } },
    { nome: "vazio", attrs: { k: "" } },
    { nome: "só espaços", attrs: { k: "   " } },
    { nome: "macro {{ad.id}}", attrs: { k: "{{ad.id}}" } },
    { nome: "macro no value", attrs: { k: { value: "{{campaign.id}}" } } },
    { nome: "macro com espaços", attrs: { k: " {{adset.id}} " } },
    { nome: "(not set)", attrs: { k: "(not set)" } },
    { nome: "(not set) com espaços", attrs: { k: " (not set) " } },
    { nome: "chave {{ só abrindo (não é macro)", attrs: { k: "{{meta" } },
    { nome: "chave ausente", attrs: { outra: "x" } },
    { nome: "null", attrs: { k: null } },
    { nome: "array", attrs: { k: ["meta"] } },
    { nome: "value null", attrs: { k: { value: null } } },
    { nome: "value objeto", attrs: { k: { value: { a: 1 } } } },
    { nome: "subscriber_attributes escalar", attrs: "meta" },
    { nome: "subscriber_attributes array", attrs: [{ k: "meta" }] },
    { nome: "sem subscriber_attributes", attrs: undefined },
  ];

  it.each(CASOS)("$nome", async ({ attrs }) => {
    await pg.query("DELETE FROM revenuecat_sales");
    await inserir({ user: "u", tipo: "PAYWALL_IMPRESSION", em: "2026-10-10T12:00:00Z", attrs });
    const [linha] = await executar(sql`SELECT ${atributo("k")} AS v FROM revenuecat_sales`);
    expect(linha.v ?? null).toBe(readSubscriberAttribute(attrs, "k"));
  });
});

/**
 * Eventos semeados — um usuário por regra, com o resultado esperado no nome.
 * Janela: `purchased_at >= DESDE`.
 */
const DESDE = new Date("2026-10-01T00:00:00.000Z");
const DENTRO = "2026-10-10T12:00:00Z";
const FORA = "2026-09-20T12:00:00Z";
const META = { ad_network: "meta", meta_campaign_id: "120246611250170452", meta_campaign_name: "app_ios_lyrio_2026-07_cold", meta_adset_id: "120248264910450452", meta_adset_name: "auto_18-64_base-f-aberto_homens_videos-out", meta_ad_id: "120248264966950452", meta_ad_name: "ads-_h_roteiro-07_vou-testar_lyrio" };

async function semear() {
  await pg.query("DELETE FROM revenuecat_sales");
  // meta-d6: o atributo vem num paywall; a VENDA chega sem atributo — conta como Meta pelo usuário (D6)
  await inserir({ user: "meta-d6", tipo: "PAYWALL_IMPRESSION", em: "2026-10-09T10:00:00Z", attrs: META });
  await inserir({ user: "meta-d6", tipo: "INITIAL_PURCHASE", usd: 3.01, em: DENTRO });
  // meta-sem-ids: ad_network = meta sem os ids → Meta, "não identificado" (D2b)
  await inserir({ user: "meta-sem-ids", tipo: "INITIAL_PURCHASE", usd: 11.53, em: DENTRO, attrs: { ad_network: "meta" } });
  // meta-mais-recente: dois anúncios ao longo do tempo → vale o do evento mais recente (PO-06)
  await inserir({ user: "meta-mais-recente", tipo: "PAYWALL_IMPRESSION", em: "2026-10-02T10:00:00Z", attrs: { ...META, meta_ad_name: "anuncio-velho" } });
  await inserir({ user: "meta-mais-recente", tipo: "RENEWAL", usd: 5, em: DENTRO, attrs: { ...META, meta_ad_name: { value: "anuncio-novo" } } });
  // google-rede: ad_network = google SEM gclid → Google
  await inserir({ user: "google-rede", tipo: "INITIAL_PURCHASE", usd: 6.8, em: DENTRO, attrs: { ad_network: "google" }, utmSource: "Google Ads" });
  // google-gclid: só gclid → Google (D2a). O teste grátis de US$ 0 ANTES da venda (o caso real:
  // teste → pagamento) não conta como segunda venda do comprador (D4) — conta em semValor.
  await inserir({ user: "google-gclid", tipo: "INITIAL_PURCHASE", usd: 0, em: "2026-10-03T12:00:00Z", gclid: "Cj0KCQ" });
  await inserir({ user: "google-gclid", tipo: "RENEWAL", usd: 6.38, em: DENTRO, gclid: "Cj0KCQ" });
  // ig4a: só install referrer → Sem atribuição (D2)
  await inserir({ user: "ig4a", tipo: "INITIAL_PURCHASE", usd: 7.2, em: DENTRO, utmCampaign: "ig4a", utmSource: "apps.instagram.com" });
  // organico
  await inserir({ user: "organico", tipo: "INITIAL_PURCHASE", usd: 6.05, em: DENTRO, utmMedium: "organic" });
  // macro: só a macro {{ad.id}} → NÃO é Meta (PO-01) → sem atribuição
  await inserir({ user: "macro", tipo: "INITIAL_PURCHASE", usd: 2.99, em: DENTRO, attrs: { meta_ad_id: "{{ad.id}}" } });
  // conflito: ids da Meta E gclid (D7)
  await inserir({ user: "conflito", tipo: "INITIAL_PURCHASE", usd: 1, em: DENTRO, attrs: META, gclid: "Cj0" });
  // so-zero: só teste grátis de US$ 0 → fora da quebra (D4), conta em semValor
  await inserir({ user: "so-zero", tipo: "INITIAL_PURCHASE", usd: 0, em: DENTRO, compra: DENTRO, attrs: META });
  // janela por purchased_at (PO-02): event_at dentro e compra fora → fora; o contrário → dentro
  await inserir({ user: "compra-fora", tipo: "RENEWAL", usd: 20, em: DENTRO, compra: FORA, attrs: { ad_network: "google" } });
  await inserir({ user: "compra-dentro", tipo: "RENEWAL", usd: 4, em: FORA, compra: DENTRO, attrs: { ad_network: "google" } });
  // fora do escopo: outra etapa, evento TEST, sem usuário (este conta em semUsuario)
  await inserir({ stage: OUTRA, user: "outra-etapa", tipo: "INITIAL_PURCHASE", usd: 50, em: DENTRO, attrs: META });
  await inserir({ user: "teste", tipo: "TEST", usd: 9, em: DENTRO, attrs: META });
  await inserir({ user: null, tipo: "INITIAL_PURCHASE", usd: 8, em: DENTRO, attrs: META });
  // fora da janela, mas com sinal: não vira venda
  await inserir({ user: "venda-antiga", tipo: "INITIAL_PURCHASE", usd: 30, em: FORA, attrs: { ad_network: "google" } });
}

describe("consultaDeVendasPorCanal sobre Postgres real (PGlite)", () => {
  beforeAll(semear);

  it("cada usuário no canal da regra; vendas pela janela de purchased_at; US$ 0, TEST, outra etapa e sem usuário fora", async () => {
    const linhas = await executar(consultaDeVendasPorCanal(STAGE, DESDE));
    const r = montarVendasPorCanal(linhas.map(lerLinhaDeVendas));
    const de = (canal: string) => r.canais.find((c) => c.canal === canal)!;
    // Meta: meta-d6 (3,01) + meta-sem-ids (11,53) + meta-mais-recente (5)
    expect(de("meta")).toEqual({ canal: "meta", rotulo: "Meta", vendas: 3, compradores: 3, receitaUsd: 19.54 });
    // Google: google-rede (6,80) + google-gclid (6,38) + compra-dentro (4)
    expect(de("google")).toMatchObject({ vendas: 3, compradores: 3, receitaUsd: 17.18 });
    expect(de("organico")).toMatchObject({ vendas: 1, receitaUsd: 6.05 });
    // ig4a (7,20) + macro (2,99)
    expect(de("sem_atribuicao")).toMatchObject({ vendas: 2, compradores: 2, receitaUsd: 10.19 });
    expect(r.conflito).toEqual({ vendas: 1, compradores: 1, receitaUsd: 1 });
    expect(r.totalPago).toEqual({ vendas: 10, compradores: 10, receitaUsd: 53.96 });
  });

  it("quebra da Meta: ids e nomes do evento mais recente (PO-06); sem ids = não identificado", async () => {
    const r = montarVendasPorCanal((await executar(consultaDeVendasPorCanal(STAGE, DESDE))).map(lerLinhaDeVendas));
    expect(r.metaPorEntidade.campaign).toEqual([
      { chave: null, nome: null, vendas: 1, compradores: 1, receitaUsd: 11.53 },
      { chave: META.meta_campaign_id, nome: META.meta_campaign_name, vendas: 2, compradores: 2, receitaUsd: 8.01 },
    ]);
    expect(r.metaPorEntidade.ad.map((e) => [e.chave, e.receitaUsd])).toEqual([
      [null, 11.53],
      ["anuncio-novo", 5],
      [META.meta_ad_name, 3.01],
    ]);
  });

  it("nenhum PII sai da consulta: o id só agrupa", async () => {
    const [linha] = await executar(consultaDeVendasPorCanal(STAGE, DESDE));
    expect(Object.keys(linha).sort()).toEqual(["meta_ad_name", "meta_adset_name", "meta_campaign_id", "meta_campaign_name", "receita_usd", "s_google", "s_meta", "s_organico", "vendas"]);
    expect(JSON.stringify(await executar(consultaDeVendasPorCanal(STAGE, DESDE)))).not.toMatch(/meta-d6|google-gclid|so-zero|meta-sem-ids/);
  });

  it("PO-03 — totalPago + semValor + semUsuario = o que o card de `/sales` conta no mesmo escopo", async () => {
    const r = montarVendasPorCanal((await executar(consultaDeVendasPorCanal(STAGE, DESDE))).map(lerLinhaDeVendas));
    const [fora] = await executar(consultaDoQueFicaForaDaQuebra(STAGE, DESDE));
    expect(fora).toEqual({ sem_valor: 2, sem_usuario: 1 });
    // o escopo de `/sales` (routes/revenuecat.ts): etapa, purchased_at na janela, REVENUE_EVENT_TYPES — sem filtro de valor
    const [card] = await executar(
      sql`SELECT count(*)::int AS n FROM revenuecat_sales WHERE stage_id = ${STAGE} AND purchased_at >= ${DESDE.toISOString()}::timestamptz AND event_type IN ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'UNCANCELLATION')`,
    );
    expect(r.totalPago.vendas + Number(fora.sem_valor) + Number(fora.sem_usuario)).toBe(card.n);
  });

  it("AC6 — atributosDesde: o primeiro evento da etapa com ad_network ou id de campanha VÁLIDO (macro não conta)", async () => {
    await pg.query("DELETE FROM revenuecat_sales");
    await inserir({ user: "a", tipo: "PAYWALL_IMPRESSION", em: "2026-10-01T00:00:00Z", attrs: { meta_campaign_id: "{{campaign.id}}" } });
    await inserir({ stage: OUTRA, user: "b", tipo: "PAYWALL_IMPRESSION", em: "2026-10-02T00:00:00Z", attrs: { ad_network: "meta" } });
    await inserir({ user: "c", tipo: "PAYWALL_IMPRESSION", em: "2026-10-06T03:11:13Z", attrs: { ad_network: "google" } });
    const [r] = await executar(consultaDoInicioDosAtributos(STAGE));
    expect(new Date(String(r.desde instanceof Date ? r.desde.toISOString() : r.desde)).toISOString()).toBe("2026-10-06T03:11:13.000Z");
    await semear();
  });
});

describe("Jornada (AC4) sobre Postgres real — as duas linhas de campanha", () => {
  it("utm 1202 ou atributo Meta → Meta; utm google-ads, 'Google Ads' com ad_network ou campanha Google → Google; as duas → conflito", async () => {
    await pg.query("DELETE FROM revenuecat_sales");
    const em = "2026-10-10T12:00:00Z";
    await inserir({ user: "utm-1202", tipo: "PAYWALL_IMPRESSION", em, utmCampaign: "120246611250170452" });
    await inserir({ user: "attr-meta-ig4a", tipo: "PAYWALL_IMPRESSION", em, attrs: META, utmCampaign: "ig4a", utmSource: "apps.instagram.com" });
    await inserir({ user: "google-ads", tipo: "PAYWALL_IMPRESSION", em, utmSource: "google-ads", gclid: "x" });
    await inserir({ user: "Google Ads", tipo: "PAYWALL_IMPRESSION", em, utmSource: "Google Ads", attrs: { ad_network: "google" }, gclid: "y" });
    await inserir({ user: "as-duas", tipo: "PAYWALL_IMPRESSION", em, utmSource: "google-ads", attrs: META });
    await inserir({ user: "macro", tipo: "PAYWALL_IMPRESSION", em, attrs: { meta_ad_id: "{{ad.id}}" }, utmCampaign: "ig4a" });
    await inserir({ user: "so-gclid", tipo: "PAYWALL_IMPRESSION", em, gclid: "z" });
    const usuarios = (await executar(consultaDaJornada(STAGE, DESDE))).map(lerLinhaDaJornada);
    const j = montarJornada(usuarios, DESDE);
    const de = (canal: string) => j.linhas.find((l) => l.canal === canal)!.novos;
    expect(de("campanha_meta")).toBe(2);
    expect(de("campanha_google")).toBe(2);
    expect(j.conflito.novos).toBe(1);
    expect(de("meta_install")).toBe(1); // a macro não vira Meta
    expect(de("google_gclid")).toBe(1);
    expect(j.total.novos).toBe(7);
    expect(usuarios.map(canalDoUsuario).filter((x) => x === "conflito")).toHaveLength(1);
    await semear();
  });
});

// ─────────────── 4. o fio: a rota com um banco falso que captura o SQL ───────────────

const PROJ = "11111111-1111-4111-8111-111111111111";
const FUN = "22222222-2222-4222-8222-222222222222";
const URL_ = `/api/projects/${PROJ}/funnels/${FUN}/stages/${STAGE}/revenuecat/vendas-por-canal`;

function parametroDe(q: { sql: string; params: unknown[] }, alvo: string): unknown {
  const m = new RegExp(`${alvo.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&")} (?:=|<>|>=) \\$(\\d+)`).exec(q.sql);
  return m ? q.params[Number(m[1]) - 1] : undefined;
}

function bancoFalso(opts: { membro?: boolean; etapa?: boolean; linhas?: Record<string, unknown>[]; falhar?: boolean } = {}) {
  const executados: { sql: string; params: unknown[] }[] = [];
  const consultados: string[] = [];
  const cadeia = () => {
    let tabela = "";
    const c: Record<string, unknown> = {
      from: (t: Parameters<typeof getTableName>[0]) => ((tabela = getTableName(t)), consultados.push(tabela), c),
      innerJoin: () => c,
      where: () => c,
      limit: () => c,
      then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
        const linhas = tabela === "project_members" ? (opts.membro ? [{ projectId: PROJ }] : []) : tabela === "projects" ? [{ id: PROJ }] : tabela === "funnel_stages" ? (opts.etapa === false ? [] : [{ id: STAGE }]) : [];
        return Promise.resolve(linhas).then(ok, erro);
      },
    };
    return c;
  };
  const db = {
    select: () => cadeia(),
    execute: async (q: SQL) => {
      const texto = dialeto.sqlToQuery(q);
      executados.push(texto);
      if (opts.falhar) throw new Error("conexão caiu");
      if (/group by/i.test(texto.sql)) return { rows: opts.linhas ?? [] };
      if (/sem_valor/.test(texto.sql)) return { rows: [{ sem_valor: 432, sem_usuario: 0 }] };
      return { rows: [{ desde: new Date("2026-10-06T03:11:13.705Z") }] };
    },
  };
  return { db, executados, consultados };
}

async function montar(banco: ReturnType<typeof bancoFalso>) {
  const app = Fastify();
  app.decorateRequest("userId", "");
  app.decorateRequest("userRole", "");
  app.addHook("onRequest", async (req) => {
    req.userId = "10000000-0000-4000-8000-000000000001";
    req.userRole = (req.headers["x-papel"] as string) || "strategist";
  });
  app.decorate("db", banco.db as never);
  await app.register(revenuecatRoutes);
  await app.ready();
  return app;
}

describe("GET …/revenuecat/vendas-por-canal — o fio da rota (AC1)", () => {
  const linha = { s_meta: true, s_google: false, s_organico: false, vendas: 2, receita_usd: 6.02, meta_campaign_id: "1202", meta_campaign_name: "app_ios", meta_adset_name: "auto", meta_ad_name: "ads-07" };

  it("as três consultas com o stageId DA ROTA e a janela de `days` sobre purchased_at; só contagens na resposta", async () => {
    const banco = bancoFalso({ linhas: [linha] });
    const app = await montar(banco);
    const antes = Date.now();
    const r = await app.inject({ method: "GET", url: `${URL_}?days=28` });
    expect(r.statusCode).toBe(200);
    expect(banco.executados).toHaveLength(3);
    for (const e of banco.executados) expect(JSON.stringify(e.params)).toContain(STAGE);
    const vendas = banco.executados.find((e) => /group by/i.test(e.sql))!;
    const corte = vendas.params.find((p) => typeof p === "string" && /^\d{4}-\d{2}-\d{2}T/.test(p)) as string;
    // Story 42.13 (AC4): 00:00 de SP do primeiro dia da janela — não `agora − 28 × 24 h`.
    expect(new Date(corte).getTime()).toBe(instanteDoInicioDaJanela(28, new Date(antes)).getTime());
    expect(corte).toMatch(/T03:00:00\.000Z$/);
    expect(vendas.sql).toContain("ev.purchased_at >= ");
    const fora = banco.executados.find((e) => /sem_valor/.test(e.sql))!;
    expect(parametroDe(fora, '"revenuecat_sales"."stage_id"')).toBe(STAGE);
    const corpo = r.json();
    expect(Object.keys(corpo).sort()).toEqual(["atributosDesde", "canais", "conflito", "days", "desde", "foraDaQuebra", "metaPorEntidade", "totalPago"]);
    expect(corpo.desde).toBe(inicioDaJanela(28, businessToday(new Date(antes))));
    expect(corpo).toMatchObject({ days: 28, atributosDesde: "2026-10-06", foraDaQuebra: { semValor: 432, semUsuario: 0 }, totalPago: { vendas: 2, compradores: 1, receitaUsd: 6.02 } });
    expect(corpo.canais[0]).toMatchObject({ canal: "meta", vendas: 2 });
    expect(corpo.metaPorEntidade.ad).toEqual([{ chave: "ads-07", nome: "ads-07", vendas: 2, compradores: 1, receitaUsd: 6.02 }]);
    expect(JSON.stringify(corpo)).not.toMatch(/app_user_id|appUserId|email/i);
    expect(banco.consultados).toEqual(["projects", "funnel_stages"]);
  });

  it("etapa de outro funil/projeto → 404 SEM consultar eventos; guest sem vínculo → 404; com vínculo → 200", async () => {
    const semEtapa = bancoFalso({ etapa: false });
    expect((await (await montar(semEtapa)).inject({ method: "GET", url: URL_ })).statusCode).toBe(404);
    expect(semEtapa.executados).toHaveLength(0);
    const guest = bancoFalso();
    expect((await (await montar(guest)).inject({ method: "GET", url: URL_, headers: { "x-papel": "guest" } })).statusCode).toBe(404);
    expect(guest.executados).toHaveLength(0);
    expect((await (await montar(bancoFalso({ membro: true }))).inject({ method: "GET", url: URL_, headers: { "x-papel": "guest" } })).statusCode).toBe(200);
  });

  it("days fora de 1–365 → 400; default 90", async () => {
    const app = await montar(bancoFalso());
    expect((await app.inject({ method: "GET", url: `${URL_}?days=0` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `${URL_}?days=366` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: URL_ })).json()).toMatchObject({ days: 90, totalPago: { vendas: 0 } });
  });

  it("falha do banco NÃO vira quebra zerada: 500 (o bloco mostra erro — AC7)", async () => {
    expect((await (await montar(bancoFalso({ falhar: true }))).inject({ method: "GET", url: URL_ })).statusCode).toBe(500);
  });
});

describe("Story 42.13 (AC4/AC6d) — a borda da janela em SP, sobre Postgres real", () => {
  it("23:30 de SP do dia anterior fica FORA; 00:30 de SP do primeiro dia fica DENTRO", async () => {
    // 13/10 às 14:17 de SP, days = 5 → a janela abre em 09/10 00:00 de SP (03:00Z).
    const desde = instanteDoInicioDaJanela(5, new Date("2026-10-13T17:17:00Z"));
    expect(desde.toISOString()).toBe("2026-10-09T03:00:00.000Z");
    await pg.query("DELETE FROM revenuecat_sales");
    await inserir({ user: "vespera", tipo: "INITIAL_PURCHASE", usd: 7, em: "2026-10-09T02:30:00Z", attrs: { ad_network: "meta" } }); // 08/10 23:30 SP
    await inserir({ user: "primeiro-dia", tipo: "INITIAL_PURCHASE", usd: 3, em: "2026-10-09T03:30:00Z", attrs: { ad_network: "meta" } }); // 09/10 00:30 SP
    // A régua antiga (agora − 5 × 24 h = 08/10 17:17Z) contava as duas.
    const r = montarVendasPorCanal((await executar(consultaDeVendasPorCanal(STAGE, desde))).map(lerLinhaDeVendas));
    expect(r.canais[0]).toMatchObject({ canal: "meta", vendas: 1, receitaUsd: 3 });
    await semear();
  });
});

describe("Story 42.13 (AC4b) — o diário de `/sales` pelo dia de SP", () => {
  it("23:30 de SP é o dia de SP, não o seguinte em UTC; 00:30 de SP é o próprio dia", async () => {
    const [r] = await executar(
      sql`SELECT ${diaNoFusoDoNegocio(sql`'2026-10-09T02:30:00Z'::timestamptz`)} AS vespera, ${diaNoFusoDoNegocio(sql`'2026-10-09T03:30:00Z'::timestamptz`)} AS primeiro`,
    );
    expect(r).toEqual({ vespera: "2026-10-08", primeiro: "2026-10-09" });
  });
});
