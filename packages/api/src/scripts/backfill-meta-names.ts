// CLI manual do backfill de nomes Meta (mesma lógica do scheduler diário).
//
// Uso:
//   tsx src/scripts/backfill-meta-names.ts                 # todas as contas
//   tsx src/scripts/backfill-meta-names.ts 2863980937018503   # só uma conta
//
// Prod (após build): node dist/scripts/backfill-meta-names.js [meta_account_id]

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as schema from "../db/schema.js";
import { backfillMetaNames } from "../services/meta-names-backfill.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const onlyMetaAccountId = process.argv[2] || undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    const summary = await backfillMetaNames(db, {
      onlyMetaAccountId,
      log: (m) => console.log(m),
    });
    console.log("\n=== Resumo ===");
    console.log(`Contas processadas: ${summary.accountsProcessed} | puladas: ${summary.accountsSkipped} | upserts: ${summary.totalUpserts}`);
    for (const a of summary.perAccount) {
      if (a.error) console.log(`  act_${a.metaAccountId}: ERRO — ${a.error}`);
      else console.log(`  act_${a.metaAccountId}: ${a.ads} ads, ${a.adsets} adsets, ${a.campaigns} campaigns → ${a.projects} projeto(s)`);
    }
  } catch (err) {
    console.error("💥 Backfill falhou:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
