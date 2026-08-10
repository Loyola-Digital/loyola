// Aplica a migration 0100_zoom_project_connection.sql (conexão Zoom passa de
// por-etapa para por-projeto, migrando as conexões existentes). Mesmo padrão do
// apply-funnel-mobile-migration.ts — usa a DATABASE_URL do .env.
//
// Executa o arquivo inteiro numa query só (o SQL tem um bloco DO $$ ... $$ que
// não sobrevive a split por ';'). Idempotente.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "../db/migrations/0100_zoom_project_connection.sql");
const sql = readFileSync(sqlPath, "utf-8");

async function main() {
  await pool.query(sql);

  const res = await pool.query(
    `SELECT p.name AS project, c.account_id, c.updated_at
     FROM project_zoom_connections c
     JOIN projects p ON p.id = c.project_id
     ORDER BY p.name`,
  );
  console.log(`project_zoom_connections: ${res.rowCount} conexão(ões) global(is)`);
  for (const row of res.rows) {
    console.log(`  · ${row.project} — account ${row.account_id}`);
  }

  const old = await pool.query(
    `SELECT to_regclass('public.funnel_stage_zoom_connections') AS tbl`,
  );
  console.log(
    old.rows[0]?.tbl
      ? "⚠️  funnel_stage_zoom_connections ainda existe"
      : "funnel_stage_zoom_connections removida ✅",
  );

  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
