// Story 36.7 (Buraco 3): backfill manual do cache de vendas diárias por origem.
//   tsx src/scripts/backfill-sales-daily.ts --project=fz
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";
import { syncSalesDaily } from "../services/sales-daily-sync.js";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const projectArg = arg("project");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  let projectIds: string[] | undefined;
  if (projectArg) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(projectArg);
    const res = isUuid
      ? await pool.query("SELECT id, name FROM projects WHERE id = $1", [projectArg])
      : await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1", [`%${projectArg}%`]);
    if (res.rows.length === 0) { console.error(`Nenhum projeto casa "${projectArg}".`); await pool.end(); process.exit(1); }
    console.log("Projetos alvo:", res.rows.map((r) => `${r.name} (${r.id})`).join(", "));
    projectIds = res.rows.map((r) => r.id as string);
  }

  const summary = await syncSalesDaily(db, { projectIds, log: (m) => console.log(m) });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const cached = await pool.query(
    "SELECT key, payload FROM public_metrics_cache WHERE scope='sales-daily' ORDER BY computed_at DESC LIMIT 2",
  );
  for (const r of cached.rows) {
    const p = r.payload;
    console.log(`\nstage ${r.key}: ${p.totalVendas} vendas · R$ ${p.faturamentoBruto} bruto · ${p.byDay.length} dias`);
    console.log("  porOrigem:", JSON.stringify(p.porOrigem));
    for (const d of p.byDay.slice(-3)) console.log(`   ${d.date}: R$ ${d.faturamentoBruto} · ingressos ${d.ingressos.total} (Pg ${d.ingressos.pago}/Org ${d.ingressos.org}/st ${d.ingressos.semTrack})`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
