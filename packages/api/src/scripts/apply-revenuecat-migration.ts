// Etapa Lyrio: aplica a migration 0098_lyrio_revenuecat.sql de forma SEGURA e
// idempotente — sem drizzle-kit push (que tocaria outras tabelas por causa do
// drift do snapshot). Aditivo: só CREATE TABLE/INDEX IF NOT EXISTS + FK guards.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../db/migrations/0098_lyrio_revenuecat.sql");
const statements = readFileSync(sqlPath, "utf-8")
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  for (const table of ["revenuecat_connections", "revenuecat_stage_config", "revenuecat_sales"]) {
    const check = await pool.query(`SELECT to_regclass('${table}') AS t`);
    const cols = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name=$1 ORDER BY ordinal_position`,
      [table],
    );
    console.log("tabela:", check.rows[0].t);
    console.log(
      "colunas:",
      cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(", "),
    );
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
