// Story 36.7: cria a tabela public_metrics_cache em producao de forma SEGURA e
// idempotente (CREATE TABLE IF NOT EXISTS) — sem drizzle-kit push (que tocaria
// outras tabelas por causa do drift do snapshot). Aditivo: nao altera nada existente.
import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SQL = `
CREATE TABLE IF NOT EXISTS public_metrics_cache (
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope       varchar(40) NOT NULL,
  key         varchar(200) NOT NULL,
  payload     jsonb       NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_metrics_cache_pk PRIMARY KEY (project_id, scope, key)
);
`;

async function main() {
  await pool.query(SQL);
  const check = await pool.query("SELECT to_regclass('public_metrics_cache') AS t");
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='public_metrics_cache' ORDER BY ordinal_position`,
  );
  console.log("tabela:", check.rows[0].t);
  console.log("colunas:", cols.rows.map((c) => `${c.column_name}:${c.data_type}`).join(", "));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
