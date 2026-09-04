/**
 * Aplica a migration 0136 (base horária do Perpétuo, Story 29.69).
 *
 * Aditiva e idempotente: cria uma tabela nova e vazia. Não toca em nada que já
 * existe. É o mesmo que o `drizzle-kit push` do deploy faria — rodar aqui só
 * antecipa, para que a verificação contra produção possa acontecer antes do
 * merge.
 *
 *     cd packages/api && node scripts/apply-migration-0136.mjs
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const aqui = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(aqui, "../src/db/migrations/0136_meta_hourly_insights.sql"),
  "utf8",
);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
const { rows } = await c.query(
  `select a.attname from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'meta_hourly_insights_daily'::regclass and i.indisprimary`,
);
console.log("meta_hourly_insights_daily criada. PK:", rows.map((r) => r.attname).join(" + "));
await c.end();
