// Story 36.7: backfill manual do cache de leads-por-origem (primeira carga / debug).
//   tsx src/scripts/backfill-lead-origin.ts --project=fz
//   tsx src/scripts/backfill-lead-origin.ts            (todos)
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";
import { syncLeadOrigin } from "../services/lead-origin-sync.js";

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
    if (res.rows.length === 0) {
      console.error(`Nenhum projeto casa "${projectArg}".`);
      await pool.end();
      process.exit(1);
    }
    console.log("Projetos alvo:", res.rows.map((r) => `${r.name} (${r.id})`).join(", "));
    projectIds = res.rows.map((r) => r.id as string);
  }

  const summary = await syncLeadOrigin(db, { projectIds, log: (m) => console.log(m) });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const cached = await pool.query(
    "SELECT key, payload FROM public_metrics_cache WHERE scope='leads-origin' ORDER BY computed_at DESC LIMIT 3",
  );
  for (const r of cached.rows) {
    const p = r.payload;
    console.log(`\nstage ${r.key}: ${p.totalLeads} leads, ${p.uniqueLeads} únicos | colunas:`, p.columnsResolved);
    console.log("  byOriginTemp:", JSON.stringify(p.byOriginTemp));
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
