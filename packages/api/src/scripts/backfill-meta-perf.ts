// Story 36.4: backfill manual da performance Meta no cache (primeira carga / debug).
//
// Uso:
//   tsx src/scripts/backfill-meta-perf.ts --project=fz --days=30
//   tsx src/scripts/backfill-meta-perf.ts --days=7            (todos os projetos)
//   tsx src/scripts/backfill-meta-perf.ts --project=fz --dry-run
//
// --project aceita UUID ou trecho do nome (ILIKE). Sem --project = todos.
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.js";
import { syncMetaPerformance } from "../services/meta-perf-sync.js";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split("=").slice(1).join("=") : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const days = Math.min(Math.max(Number(arg("days")) || 7, 1), 365);
  const projectArg = arg("project");
  const dryRun = hasFlag("dry-run");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  let projectIds: string[] | undefined;
  if (projectArg) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(projectArg);
    const res = isUuid
      ? await pool.query("SELECT id, name FROM projects WHERE id = $1", [projectArg])
      : await pool.query("SELECT id, name FROM projects WHERE name ILIKE $1 ORDER BY name", [`%${projectArg}%`]);
    if (res.rows.length === 0) {
      console.error(`Nenhum projeto casa "${projectArg}".`);
      await pool.end();
      process.exit(1);
    }
    console.log("Projetos alvo:");
    for (const r of res.rows) console.log(`  - ${r.name}  (${r.id})`);
    projectIds = res.rows.map((r) => r.id as string);
  } else {
    console.log("Alvo: TODOS os projetos com conta Meta.");
  }

  if (dryRun) {
    console.log("\n[dry-run] nada foi sincronizado.");
    await pool.end();
    return;
  }

  console.log(`\n[backfill-meta-perf] days=${days} — chamando a Graph API e populando o cache...\n`);
  const summary = await syncMetaPerformance(db, { days, projectIds, log: (m) => console.log(m) });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const camp = await pool.query("SELECT count(*)::int AS n FROM meta_campaign_insights_daily");
  const ad = await pool.query("SELECT count(*)::int AS n FROM meta_ad_insights_daily");
  console.log(`\ncache agora -> campaign: ${camp.rows[0].n} rows | ad: ${ad.rows[0].n} rows`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
