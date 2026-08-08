// Story 36.4: backfill manual da performance Meta no cache (primeira carga / debug).
//
// Uso:
//   tsx src/scripts/backfill-meta-perf.ts --project=fz --days=30
//   tsx src/scripts/backfill-meta-perf.ts --days=7            (todos os projetos)
//   tsx src/scripts/backfill-meta-perf.ts --project=fz --dry-run
//   tsx src/scripts/backfill-meta-perf.ts --project=fz --creatives   (Story 29.43)
//
// Story 29.43 (AC1) — `--creatives` repopula meta_ad_creatives_cache, que o
// backfill NÃO tocava. Era um dos motivos de a tabela de LPs do perpétuo exibir
// "100% do investimento sem LP identificada": o resolver de URL foi corrigido na
// 29.40, mas nenhum caminho executável reescrevia as linhas antigas — só o
// scheduler das 4h, e só para os anúncios ativos da janela.
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
  // Custa chamadas à Graph API (lotes de 50), então é opt-in — não vira default
  // de um script que hoje roda sem tocar criativo nenhum.
  const creatives = hasFlag("creatives");

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

  console.log(
    `\n[backfill-meta-perf] days=${days}${creatives ? " +creatives" : ""} — chamando a Graph API e populando o cache...\n`,
  );
  const summary = await syncMetaPerformance(db, {
    days,
    projectIds,
    creatives,
    log: (m) => console.log(m),
  });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const camp = await pool.query("SELECT count(*)::int AS n FROM meta_campaign_insights_daily");
  const ad = await pool.query("SELECT count(*)::int AS n FROM meta_ad_insights_daily");
  console.log(`\ncache agora -> campaign: ${camp.rows[0].n} rows | ad: ${ad.rows[0].n} rows`);

  // Story 29.43: a cobertura de LP é o número que decide se a tabela do perpétuo
  // é utilizável. Imprimir aqui evita ter que ir ao banco conferir se adiantou.
  if (creatives) {
    const lp = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE creative->>'linkUrl' IS NOT NULL)::int AS com_link,
              count(*) FILTER (WHERE (creative->>'linkUrlResolver')::int IS NOT NULL)::int AS carimbados
         FROM meta_ad_creatives_cache`,
    );
    const { total, com_link, carimbados } = lp.rows[0];
    const pct = total > 0 ? ((com_link / total) * 100).toFixed(2) : "0.00";
    console.log(`criativos -> ${total} rows | com LP: ${com_link} (${pct}%) | carimbados: ${carimbados}`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
