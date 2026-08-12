// Aplica a migration 0102_revenuecat_event_at_e_backfill.sql (event_at em
// revenuecat_sales + tabelas de assinatura e cursor de backfill).
// Mesmo padrão dos outros apply-* — usa a DATABASE_URL do .env. Idempotente.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, "../db/migrations/0102_revenuecat_event_at_e_backfill.sql"),
  "utf-8",
);

async function main() {
  await pool.query(sql);

  const cobertura = await pool.query(
    `SELECT count(*)::int total,
            count(event_at)::int com_data,
            count(purchased_at)::int com_compra
     FROM revenuecat_sales`,
  );
  const c = cobertura.rows[0];
  console.log(`revenuecat_sales: ${c.total} eventos | com event_at: ${c.com_data} | com purchased_at: ${c.com_compra}`);

  const porTipo = await pool.query(
    `SELECT event_type, count(*)::int n, count(event_at)::int com_data,
            min(event_at)::date AS de, max(event_at)::date AS ate
     FROM revenuecat_sales GROUP BY 1 ORDER BY n DESC LIMIT 12`,
  );
  for (const r of porTipo.rows) {
    console.log(`  ${String(r.n).padStart(4)} ${String(r.event_type).padEnd(28)} com data: ${String(r.com_data).padStart(4)}  ${r.de ?? "—"} → ${r.ate ?? "—"}`);
  }

  const tabelas = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('revenuecat_subscriptions','revenuecat_backfill_state')`,
  );
  console.log("tabelas criadas:", tabelas.rows.map((r) => r.table_name).join(", ") || "(nenhuma)");
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
