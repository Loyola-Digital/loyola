// Aplica a migration 0099_funnel_type_mobile.sql (adiciona o valor 'mobile' ao
// enum funnel_type). Mesmo padrão do apply-revenuecat-migration.ts — usa a
// DATABASE_URL do .env. Idempotente (ADD VALUE IF NOT EXISTS).
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../db/migrations/0099_funnel_type_mobile.sql");
// Remove linhas de comentário (--) e separa por ';'.
const statements = readFileSync(sqlPath, "utf-8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  const res = await pool.query(
    `SELECT enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'funnel_type' ORDER BY e.enumsortorder`,
  );
  console.log(
    "funnel_type agora aceita:",
    res.rows.map((r) => r.enumlabel).join(", "),
  );
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
