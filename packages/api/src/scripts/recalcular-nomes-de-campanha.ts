// Story 47.8 (T5) — recalcula o nome das campanhas NÃO publicadas com o
// template vigente (v2: expert_funil_produto_oferta_perpetuo_ano_…).
//
// Uso:  pnpm --filter @loyola-x/api nomenclatura:recalcular-nomes
// Prod: node dist/scripts/recalcular-nomes-de-campanha.js
//
// Idempotente: rodar de novo não muda nada. Publicada nunca é tocada
// (regra 6). Roda em produção UMA vez, depois do deploy da 47.8, com
// autorização do dono do produto — cada renomeação fica no changelog.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import * as schema from "../db/schema.js";
import { criarRepositorio } from "../services/nomenclatura/repositorio.js";
import { recalcularNomesNaoPublicados } from "../services/nomenclatura/campanhas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  try {
    const r = await recalcularNomesNaoPublicados(criarRepositorio(db), null);
    console.log(`examinadas: ${r.examinadas} · renomeadas: ${r.renomeadas.length} · ignoradas: ${r.ignoradas.length}`);
    for (const x of r.renomeadas) console.log(`  ${x.id}\n    ${x.de}\n    → ${x.para}`);
    for (const x of r.ignoradas) console.log(`  ignorada ${x.id}: ${x.motivo}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
