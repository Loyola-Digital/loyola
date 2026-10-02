/**
 * Story 49.6 AC2 — persistência do debriefing gerado sobre Postgres de verdade
 * (PGlite, em memória) com a migration 0164 REAL e as rotas REAIS de
 * `routes/debriefings.ts` (PUT/DELETE do viewer):
 *   - HTML e payload na MESMA transação (falha no 2º insert ⇒ nenhum dos dois);
 *   - o PUT (edição inline, renomear, mover de etapa) não toca o payload;
 *   - o DELETE leva o payload junto (cascade);
 *   - a migration é idempotente, tem 9 colunas e o rollback do topo a remove.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { payloadSintetico } from "./fixtures/debriefing-payload-sintetico.js";

const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations", "0164_debriefing_payloads.sql");
const U = "40000000-0000-4000-8000-000000000001";
const S1 = "30000000-0000-4000-8000-000000000001";
const S2 = "30000000-0000-4000-8000-000000000002";

/** DDL mínima de `users`, `funnel_stages` e `debriefings` (colunas de `schema.ts`). */
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
CREATE TABLE debriefing_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), debriefing_id uuid REFERENCES debriefings(id) ON DELETE CASCADE);
`;

let pg: PGlite;
let db: Database;
let app: FastifyInstance;

function registro(over: Partial<RegistroDoDebriefing> = {}): RegistroDoDebriefing {
  const payload = payloadSintetico();
  payload.config.stageId = S1;
  return { campaignName: "Debriefing X PG02 — 17/04 a 30/06", stageId: S1, html: "<html>gerado</html>", createdBy: U, payload, comparacao: null, alertas: [], ...over };
}

async function linhaPayload(id: string) {
  return (
    await pg.query<{ tipo: string; versao: number; stage_id_origem: string; payload: { geradoEm: string }; imposto_origem: string }>(
      "SELECT tipo, versao, stage_id_origem, payload, imposto_origem FROM debriefing_payloads WHERE debriefing_id = $1",
      [id],
    )
  ).rows[0];
}

beforeAll(async () => {
  const comoString = (v: string) => v;
  pg = new PGlite({ parsers: { 1082: comoString, 1114: comoString, 1184: comoString, 1700: comoString } });
  await pg.exec(DDL);
  await pg.exec(readFileSync(MIGRATION, "utf8"));
  // Driver PGlite do drizzle (não o pg-proxy): a gravação usa `db.transaction`.
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
}, 180_000); // PGlite (WASM) demora a subir com a suíte inteira em paralelo

afterAll(async () => {
  await app?.close();
  await pg?.close();
});

beforeEach(async () => {
  await pg.exec("TRUNCATE debriefing_payloads, debriefing_comments, debriefings, funnel_stages, users CASCADE;");
  await pg.exec(`INSERT INTO users VALUES ('${U}', 'Fulano', null); INSERT INTO funnel_stages VALUES ('${S1}', 'Debriefing'), ('${S2}', 'Outra');`);
});

describe("migration 0164", () => {
  it("9 colunas, idempotente (reaplicada continua 9) e o rollback do topo remove a tabela", async () => {
    const colunas = async () =>
      (await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'debriefing_payloads'")).rows[0]!.n;
    expect(await colunas()).toBe(9);
    await pg.exec(readFileSync(MIGRATION, "utf8"));
    expect(await colunas()).toBe(9);
    const constraints = (
      await pg.query<{ contype: string }>(
        "SELECT contype FROM pg_constraint WHERE conrelid = 'debriefing_payloads'::regclass AND contype IN ('p','f','c') ORDER BY contype",
      )
    ).rows.map((r) => r.contype);
    expect(constraints).toEqual(["c", "c", "f", "p"]);
    // o rollback documentado no topo da migration
    const rollback = /--\s+(DROP TABLE IF EXISTS debriefing_payloads;)/.exec(readFileSync(MIGRATION, "utf8"))![1]!;
    await pg.exec(rollback);
    expect(await colunas()).toBe(0);
    await pg.exec(readFileSync(MIGRATION, "utf8"));
    expect(await colunas()).toBe(9);
  });
});

describe("AC2 — HTML + payload na mesma transação", () => {
  it("grava os dois; o payload é recuperável por debriefings.id com tipo, versão, etapa de origem e procedência do imposto", async () => {
    const { id } = await gravarDebriefingGerado(db, registro());
    const d = (await pg.query<{ file_name: string | null; html: string; stage_id: string }>("SELECT file_name, html, stage_id FROM debriefings WHERE id = $1", [id])).rows[0]!;
    expect(d).toEqual({ file_name: null, html: "<html>gerado</html>", stage_id: S1 });
    const p = await linhaPayload(id);
    expect(p).toMatchObject({ tipo: "lancamento", versao: 1, stage_id_origem: S1, imposto_origem: "default" });
    expect(p!.payload.geradoEm).toBe(payloadSintetico().geradoEm);
  });

  it("falha no insert do payload ⇒ o debriefing também não fica (rollback da transação)", async () => {
    const r = registro();
    (r.payload.dinheiroTempo.imposto as { impostoOrigem: string }).impostoOrigem = "inventada"; // viola o CHECK
    await expect(gravarDebriefingGerado(db, r)).rejects.toThrow();
    expect((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM debriefings")).rows[0]!.n).toBe(0);
    expect((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM debriefing_payloads")).rows[0]!.n).toBe(0);
  });
});

describe("AC2 — rotas do viewer não tocam o payload", () => {
  it("PUT html / campaignName / stageId (edição inline, renomear, mover) mantém o payload byte a byte", async () => {
    const { id } = await gravarDebriefingGerado(db, registro());
    const antes = JSON.stringify(await linhaPayload(id));
    for (const corpo of [{ html: "<html>editado</html>" }, { campaignName: "Renomeado" }, { stageId: S2 }, { stageId: null }]) {
      const r = await app.inject({ method: "PUT", url: `/api/debriefings/${id}`, payload: corpo });
      expect(r.statusCode, JSON.stringify(corpo)).toBe(200);
    }
    const d = (await pg.query<{ html: string; campaign_name: string; stage_id: string | null }>("SELECT html, campaign_name, stage_id FROM debriefings WHERE id = $1", [id])).rows[0]!;
    expect(d).toEqual({ html: "<html>editado</html>", campaign_name: "Renomeado", stage_id: null });
    expect(JSON.stringify(await linhaPayload(id))).toBe(antes); // inclusive stage_id_origem
  });

  it("DELETE do debriefing remove o payload junto", async () => {
    const { id } = await gravarDebriefingGerado(db, registro());
    const r = await app.inject({ method: "DELETE", url: `/api/debriefings/${id}` });
    expect(r.statusCode).toBe(200);
    expect(await linhaPayload(id)).toBeUndefined();
  });

  it("upload manual continua existindo SEM payload (GET da lista e do detalhe inalterados)", async () => {
    await pg.exec(`INSERT INTO debriefings (campaign_name, stage_id, html, created_by) VALUES ('Manual', '${S1}', '<html>m</html>', '${U}')`);
    const r = await app.inject({ method: "GET", url: `/api/debriefings?stageId=${S1}` });
    expect(r.statusCode).toBe(200);
    expect((await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM debriefing_payloads")).rows[0]!.n).toBe(0);
  });
});

describe("R7-7 — último payload salvo do lançamento de comparação (Postgres real)", () => {
  it("o MAIS RECENTE do funil, só do projeto e da versão atual; outro funil/projeto/versão não entra", async () => {
    const base = payloadSintetico();
    const { projectId, funnelId } = base.config;
    const grava = async (over: { funnelId?: string; projectId?: string; versao?: number }, quando: string) => {
      const r = registro();
      r.payload.config.funnelId = over.funnelId ?? funnelId;
      r.payload.config.projectId = over.projectId ?? projectId;
      if (over.versao) (r.payload as { versao: number }).versao = over.versao;
      const { id } = await gravarDebriefingGerado(db, r);
      await pg.query("UPDATE debriefing_payloads SET created_at = $1 WHERE debriefing_id = $2", [quando, id]);
      return id;
    };
    await grava({}, "2026-06-01T12:00:00Z");
    const maisRecente = await grava({}, "2026-06-20T12:00:00Z");
    await grava({ funnelId: "20000000-0000-4000-8000-0000000000ff" }, "2026-07-01T12:00:00Z");
    await grava({ projectId: "10000000-0000-4000-8000-0000000000ff" }, "2026-07-02T12:00:00Z");
    await grava({ versao: 2 }, "2026-07-03T12:00:00Z");
    const r = await lerUltimoPayloadSalvoDoFunil(db, projectId, funnelId);
    expect(r).toMatchObject({ debriefingId: maisRecente, salvoEm: "2026-06-20T12:00:00.000Z" });
    expect(r!.payload.config.funnelId).toBe(funnelId);
    expect(await lerUltimoPayloadSalvoDoFunil(db, projectId, "20000000-0000-4000-8000-0000000000ee")).toBeNull();
  });
});
