// Seed do dicionário da nomenclatura de campanhas (Epic 47 / Story 47.1).
//
// Uso:  pnpm --filter @loyola-x/api seed:nomenclatura
// Prod: node dist/scripts/seed-nomenclatura.js
//
// Idempotente: rodar de novo não duplica. O que sai em "pulados" é TODO(P1)
// da spec — preencher em `src/db/seeds/nomenclatura.ts`, não aqui.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as schema from "../db/schema.js";
import { seedNomenclatura } from "../db/seeds/nomenclatura.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    const r = await seedNomenclatura(db);
    console.log("inseridos:", r.inseridos);
    if (r.pulados.length) {
      console.log(`pulados (${r.pulados.length}) — TODO(P1):`);
      for (const p of r.pulados) console.log("  -", p);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
