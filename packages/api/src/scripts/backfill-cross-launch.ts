// Backfill do cross-launch (Story 39.I4): computa a matriz de recompra entre
// funis de cada projeto e grava no public_metrics_cache. Uso:
//   npx tsx src/scripts/backfill-cross-launch.ts [projectId...]
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { syncCrossLaunch } from "../services/cross-launch-sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const projectIds = process.argv.slice(2);
  const summary = await syncCrossLaunch(db, {
    projectIds: projectIds.length > 0 ? projectIds : undefined,
    log: (m) => console.log(m),
  });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
