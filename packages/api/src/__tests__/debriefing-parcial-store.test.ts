/**
 * Story 49.12 — a parcial sobre Postgres de verdade (PGlite em memória) com as
 * migrations REAIS (0161, 0162, 0165 e a 0168 desta story) e as rotas REAIS do
 * viewer (`routes/debriefings.ts`):
 *   - AC10: a nova parcial ATUALIZA o mesmo debriefing (HTML, payload, título,
 *     updatedAt/By) e os comentários ficam; o final consome a parcial; um final
 *     nunca é sobrescrito; no máximo uma parcial por etapa (índice único);
 *     a geração que falha não toca a parcial;
 *   - o "último payload salvo" da comparação continua sendo o mais recente de
 *     fato depois da substituição (o AC8 depende disso);
 *   - AC14: `GET /api/debriefings/:id` devolve `parcial` só para a parcial;
 *   - AC11: o store da config lê a parcial da etapa;
 *   - a 0168: idempotente, com o que o information_schema tem de provar e o rollback do topo.
 */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import debriefingsRoutes from "../routes/debriefings.js";
import { gravarDebriefingGerado, lerUltimoPayloadSalvoDoFunil, type RegistroDoDebriefing } from "../services/debriefing-generate.js";
import { criarDebriefingConfigStore } from "../services/debriefing-config.js";
import type { DebriefingPayload } from "../services/debriefing-payload.js";
import { violaUnicidade } from "../utils/db-errors.js";
import { payloadSintetico } from "./fixtures/debriefing-payload-sintetico.js";
import { MIGRACAO_0168, MIGRACOES } from "./fixtures/debriefing-migracoes.js";
import { join } from "node:path";

const U = "40000000-0000-4000-8000-000000000001";
const U2 = "40000000-0000-4000-8000-000000000002";
const S1 = "30000000-0000-4000-8000-000000000001";
const S2 = "30000000-0000-4000-8000-000000000002";

const DDL = `
CREATE TABLE users (id uuid PRIMARY KEY, name text, avatar_url text);
CREATE TABLE funnel_stages (id uuid PRIMARY KEY, name text);
CREATE TABLE debriefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  stage_id uuid REFERENCES funnel_stages(id) ON DELETE SET NULL,
  html text NOT NULL,
  file_name text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE debriefing_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debriefing_id uuid NOT NULL REFERENCES debriefings(id) ON DELETE CASCADE,
  text text NOT NULL
);
`;

let pg: PGlite;
let db: Database;
let app: FastifyInstance;

function payloadParcial(corte: string, dMaisN: number, stageId = S1): DebriefingPayload {
  const p = payloadSintetico();
  p.config.stageId = stageId;
  p.geradoEm = `${corte}T15:00:00.000Z`;
  p.situacao = {
    modo: "parcial",
    corte,
    dMaisN,
    janela: { inicio: "2026-04-17", fim: corte, motivoDoFim: "corte do lançamento em andamento" },
    carrinhoAberto: false,
    aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
  };
  return p;
}

function parcial(corte: string, dMaisN: number, over: Partial<RegistroDoDebriefing> = {}): RegistroDoDebriefing {
  return {
    campaignName: `Debriefing X PG05 — PARCIAL — dados até ${corte.slice(8)}/${corte.slice(5, 7)} · D+${dMaisN}`,
    stageId: S1,
    html: `<html>parcial ${corte}</html>`,
    createdBy: U,
    payload: payloadParcial(corte, dMaisN),
    comparacao: null,
    alertas: [],
    parcial: true,
    ...over,
  };
}

function final(over: Partial<RegistroDoDebriefing> = {}): RegistroDoDebriefing {
  const payload = payloadSintetico();
  payload.config.stageId = S1;
  return { campaignName: "Debriefing X PG05 — 30/09 a 30/10", stageId: S1, html: "<html>final</html>", createdBy: U, payload, comparacao: null, alertas: [], ...over };
}

const um = async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0]!;
const contar = async (sql: string, params: unknown[] = []) => (await um<{ n: number }>(sql, params)).n;

beforeAll(async () => {
  const comoString = (v: string) => v;
  pg = new PGlite({ parsers: { 1082: comoString } });
  await pg.exec(DDL);
  await pg.exec(readFileSync(join(MIGRACOES, "0161_debriefing_configs.sql"), "utf8"));
  await pg.exec(readFileSync(join(MIGRACOES, "0162_debriefing_lancamentos_comparacao.sql"), "utf8"));
  await pg.exec(readFileSync(join(MIGRACOES, "0165_debriefing_payloads.sql"), "utf8"));
  await pg.exec(readFileSync(MIGRACAO_0168, "utf8"));
  db = drizzle(pg, { schema }) as unknown as Database;
  app = Fastify();
  app.decorate("db", db);
  await app.register(multipart);
  await app.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = U;
        request.userRole = "user" as never;
      });
    }),
  );
  await app.register(debriefingsRoutes);
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec("TRUNCATE debriefing_payloads, debriefing_comments, debriefings, funnel_stages, users CASCADE;");
  await pg.exec(
    `INSERT INTO users VALUES ('${U}', 'Fulano', null), ('${U2}', 'Beltrana', null); INSERT INTO funnel_stages VALUES ('${S1}', 'Debriefing'), ('${S2}', 'Outra');`,
  );
});

describe("migration 0168", () => {
  it("colunas NOT NULL com default, CHECK da situação e índice único PARCIAL; idempotente; rollback do topo", async () => {
    const colunas = async () =>
      (
        await pg.query<{ table_name: string; column_name: string; is_nullable: string; column_default: string }>(
          `SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
            WHERE (table_name = 'debriefing_configs' AND column_name IN ('situacao_do_lancamento', 'ainda_nao_aconteceu'))
               OR (table_name = 'debriefing_payloads' AND column_name = 'parcial')
            ORDER BY table_name, column_name`,
        )
      ).rows;
    const esperado = [
      { table_name: "debriefing_configs", column_name: "ainda_nao_aconteceu", is_nullable: "NO", column_default: "'[]'::jsonb" },
      { table_name: "debriefing_configs", column_name: "situacao_do_lancamento", is_nullable: "NO", column_default: "'encerrado'::text" },
      { table_name: "debriefing_payloads", column_name: "parcial", is_nullable: "NO", column_default: "false" },
    ];
    expect(await colunas()).toEqual(esperado);
    const indice = async () => (await pg.query<{ indexdef: string }>("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_debriefing_payloads_parcial_por_etapa'")).rows;
    expect((await indice())[0]!.indexdef).toMatch(/CREATE UNIQUE INDEX .* ON public\.debriefing_payloads USING btree \(stage_id_origem\) WHERE parcial/);
    expect(await contar("SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'ck_debriefing_configs_situacao_do_lancamento'")).toBe(1);

    await pg.exec(readFileSync(MIGRACAO_0168, "utf8")); // idempotente
    expect(await colunas()).toEqual(esperado);

    // rollback documentado no topo (as 5 linhas comentadas, na ordem)
    const sql = readFileSync(MIGRACAO_0168, "utf8");
    const rollback = sql.split("-- ROLLBACK")[1]!.split("\n").filter((l) => /^--\s+(DROP|ALTER)/.test(l)).map((l) => l.replace(/^--\s+/, ""));
    expect(rollback).toHaveLength(5);
    await pg.exec(rollback.join("\n"));
    expect(await colunas()).toEqual([]);
    expect(await indice()).toEqual([]);
    await pg.exec(sql);
    expect(await colunas()).toEqual(esperado);
  });

  it("config gravada antes da 0168 vira 'encerrado' (DEFAULT) e o CHECK recusa outra situação", async () => {
    await pg.exec(`INSERT INTO debriefing_configs (stage_id) VALUES ('${S2}')`);
    expect(await um<{ s: string; a: unknown }>(`SELECT situacao_do_lancamento AS s, ainda_nao_aconteceu AS a FROM debriefing_configs WHERE stage_id = '${S2}'`)).toEqual({ s: "encerrado", a: [] });
    await expect(pg.exec(`UPDATE debriefing_configs SET situacao_do_lancamento = 'pausado' WHERE stage_id = '${S2}'`)).rejects.toThrow(/ck_debriefing_configs_situacao_do_lancamento/);
    await pg.exec(`DELETE FROM debriefing_configs`);
  });
});

describe("AC10 — a nova parcial substitui a anterior (mesmo debriefing; comentários ficam)", () => {
  it("2ª parcial: mesmo id, HTML/título/payload novos, updatedBy = quem gerou; comentários preservados; 1 linha só", async () => {
    const a = await gravarDebriefingGerado(db, parcial("2026-10-05", 5));
    expect(a.substituiuParcial).toBe(false);
    await pg.exec(`INSERT INTO debriefing_comments (debriefing_id, text) VALUES ('${a.id}', 'olha o CPL'), ('${a.id}', 'ok')`);
    const antes = await um<{ created_at: string; updated_at: string }>("SELECT created_at::text, updated_at::text FROM debriefings WHERE id = $1", [a.id]);

    const b = await gravarDebriefingGerado(db, parcial("2026-10-06", 6, { createdBy: U2 }));
    expect(b).toEqual({ id: a.id, substituiuParcial: true });
    const d = await um<{ html: string; campaign_name: string; created_by: string; updated_by: string; created_at: string; updated_at: string }>(
      "SELECT html, campaign_name, created_by, updated_by, created_at::text, updated_at::text FROM debriefings WHERE id = $1",
      [a.id],
    );
    expect(d).toMatchObject({ html: "<html>parcial 2026-10-06</html>", campaign_name: "Debriefing X PG05 — PARCIAL — dados até 06/10 · D+6", created_by: U, updated_by: U2, created_at: antes.created_at });
    expect(d.updated_at > antes.updated_at).toBe(true);
    expect(await contar("SELECT count(*)::int AS n FROM debriefing_comments WHERE debriefing_id = $1", [a.id])).toBe(2);
    const p = await um<{ parcial: boolean; payload: DebriefingPayload }>("SELECT parcial, payload FROM debriefing_payloads WHERE debriefing_id = $1", [a.id]);
    expect(p.parcial).toBe(true);
    expect(p.payload.situacao).toMatchObject({ corte: "2026-10-06", dMaisN: 6 });
    expect(await contar("SELECT count(*)::int AS n FROM debriefings")).toBe(1);
    expect(await contar("SELECT count(*)::int AS n FROM debriefing_payloads WHERE parcial")).toBe(1);
  });

  it("o final consome a parcial (mesmo id, deixa de ser parcial); sem parcial, o final cria um registro novo", async () => {
    const p = await gravarDebriefingGerado(db, parcial("2026-10-06", 6));
    const f = await gravarDebriefingGerado(db, final());
    expect(f).toEqual({ id: p.id, substituiuParcial: true });
    expect(await um<{ parcial: boolean }>("SELECT parcial FROM debriefing_payloads WHERE debriefing_id = $1", [p.id])).toEqual({ parcial: false });
    expect(await um<{ html: string }>("SELECT html FROM debriefings WHERE id = $1", [p.id])).toEqual({ html: "<html>final</html>" });
    const outro = await gravarDebriefingGerado(db, final());
    expect(outro.substituiuParcial).toBe(false);
    expect(outro.id).not.toBe(p.id);
  });

  it("um final NUNCA é sobrescrito — nem por parcial nem por outro final; parcial nova depois de um final cria registro novo", async () => {
    const f1 = await gravarDebriefingGerado(db, final({ html: "<html>F1</html>" }));
    const p2 = await gravarDebriefingGerado(db, parcial("2026-11-02", 3));
    expect(p2.id).not.toBe(f1.id);
    const f2 = await gravarDebriefingGerado(db, final({ html: "<html>F2</html>" }));
    expect(f2.id).toBe(p2.id); // consumiu a parcial, não o F1
    const f3 = await gravarDebriefingGerado(db, final({ html: "<html>F3</html>" }));
    expect([f1.id, f2.id].includes(f3.id)).toBe(false);
    const htmls = (await pg.query<{ id: string; html: string }>("SELECT id, html FROM debriefings")).rows;
    expect(Object.fromEntries(htmls.map((h) => [h.id, h.html]))).toEqual({ [f1.id]: "<html>F1</html>", [p2.id]: "<html>F2</html>", [f3.id]: "<html>F3</html>" });
  });

  it("no máximo UMA parcial por etapa: o índice recusa a segunda (a gravação a atualiza); outra etapa tem a dela", async () => {
    const a = await gravarDebriefingGerado(db, parcial("2026-10-05", 5));
    const outra = await gravarDebriefingGerado(db, parcial("2026-10-05", 5, { payload: payloadParcial("2026-10-05", 5, S2), stageId: S2 }));
    expect(outra.id).not.toBe(a.id);
    const [d] = (await pg.query<{ id: string }>(`INSERT INTO debriefings (campaign_name, html, created_by) VALUES ('x', 'x', '${U}') RETURNING id`)).rows;
    let erro: unknown = null;
    try {
      await db.insert(schema.debriefingPayloads).values({ debriefingId: d!.id, tipo: "lancamento", versao: 1, stageIdOrigem: S1, payload: {}, impostoOrigem: "default", parcial: true });
    } catch (e) {
      erro = e;
    }
    expect(violaUnicidade(erro, "uq_debriefing_payloads_parcial_por_etapa")).toBe(true);
  });

  it("a geração que falha ao gravar não altera a parcial existente (transação)", async () => {
    const a = await gravarDebriefingGerado(db, parcial("2026-10-05", 5));
    const ruim = parcial("2026-10-06", 6);
    (ruim.payload.dinheiroTempo.imposto as { impostoOrigem: string }).impostoOrigem = "inventada"; // viola o CHECK no UPDATE
    await expect(gravarDebriefingGerado(db, ruim)).rejects.toThrow();
    expect(await um<{ html: string; campaign_name: string }>("SELECT html, campaign_name FROM debriefings WHERE id = $1", [a.id])).toEqual({
      html: "<html>parcial 2026-10-05</html>",
      campaign_name: "Debriefing X PG05 — PARCIAL — dados até 05/10 · D+5",
    });
    expect((await um<{ payload: DebriefingPayload }>("SELECT payload FROM debriefing_payloads WHERE debriefing_id = $1", [a.id])).payload.situacao).toMatchObject({ corte: "2026-10-05" });
  });

  it("depois da substituição, o 'último payload salvo' do funil é a parcial substituída (created_at regravado)", async () => {
    const p = await gravarDebriefingGerado(db, parcial("2026-10-05", 5));
    await pg.query("UPDATE debriefing_payloads SET created_at = '2026-10-06T12:00:00Z' WHERE debriefing_id = $1", [p.id]);
    const f = await gravarDebriefingGerado(db, final({ payload: (() => {
      const x = payloadSintetico();
      x.config.stageId = S2; // outro documento final do MESMO funil, salvo depois da 1ª parcial
      return x;
    })(), stageId: S2 }));
    await pg.query("UPDATE debriefing_payloads SET created_at = '2026-10-07T12:00:00Z' WHERE debriefing_id = $1", [f.id]);
    const { projectId, funnelId } = payloadSintetico().config;
    expect((await lerUltimoPayloadSalvoDoFunil(db, projectId, funnelId))!.debriefingId).toBe(f.id);
    await gravarDebriefingGerado(db, parcial("2026-10-08", 8)); // substitui agora (> 07/10)
    const ultimo = await lerUltimoPayloadSalvoDoFunil(db, projectId, funnelId);
    expect(ultimo!.debriefingId).toBe(p.id);
    expect(ultimo!.payload.situacao).toMatchObject({ modo: "parcial", corte: "2026-10-08" });
  });
});

describe("AC14/AC11 — o viewer e o formulário sabem que o documento é parcial", () => {
  it("GET /api/debriefings/:id: `parcial` com corte e D+N na parcial; null no final e no upload manual", async () => {
    const p = await gravarDebriefingGerado(db, parcial("2026-10-06", 6));
    const r1 = await app.inject({ method: "GET", url: `/api/debriefings/${p.id}` });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ id: p.id, parcial: { corte: "2026-10-06", dMaisN: 6 }, html: "<html>parcial 2026-10-06</html>" });
    expect(r1.json()).not.toHaveProperty("ehParcial");
    expect(r1.json()).not.toHaveProperty("situacao");
    const f = await gravarDebriefingGerado(db, final());
    expect(f.id).toBe(p.id);
    expect((await app.inject({ method: "GET", url: `/api/debriefings/${p.id}` })).json().parcial).toBeNull();
    const [m] = (await pg.query<{ id: string }>(`INSERT INTO debriefings (campaign_name, stage_id, html, created_by) VALUES ('Manual', '${S1}', '<html>m</html>', '${U}') RETURNING id`)).rows;
    expect((await app.inject({ method: "GET", url: `/api/debriefings/${m!.id}` })).json().parcial).toBeNull();
  });

  it("a edição inline (PUT html) de uma parcial NÃO a tira de parcial (o payload não muda)", async () => {
    const p = await gravarDebriefingGerado(db, parcial("2026-10-06", 6));
    expect((await app.inject({ method: "PUT", url: `/api/debriefings/${p.id}`, payload: { html: "<html>editado</html>" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/debriefings/${p.id}` })).json().parcial).toEqual({ corte: "2026-10-06", dMaisN: 6 });
  });

  it("store da config: a parcial da etapa (para o botão avisar que vai substituí-la); null sem parcial", async () => {
    const store = criarDebriefingConfigStore(db);
    expect(await store.parcialDaEtapa!(S1)).toBeNull();
    const p = await gravarDebriefingGerado(db, parcial("2026-10-06", 6));
    expect(await store.parcialDaEtapa!(S1)).toMatchObject({ debriefingId: p.id, corte: "2026-10-06", dMaisN: 6, geradaEm: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    await gravarDebriefingGerado(db, final());
    expect(await store.parcialDaEtapa!(S1)).toBeNull();
  });
});
