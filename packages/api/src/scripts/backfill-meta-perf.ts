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
  /**
   * Story 29.69 — o breakdown horário. Opt-in pelo mesmo motivo do `creatives`:
   * são 24 linhas por dia por campanha, e num backfill de 365 dias isso é
   * ordens de grandeza a mais que o sync comum. Serve para popular o histórico
   * de um funil recém-configurado, que a cadência diária levaria semanas para
   * cobrir sozinha.
   */
  const hourly = hasFlag("hourly");

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
    `\n[backfill-meta-perf] days=${days}${creatives ? " +creatives" : ""}${hourly ? " +hourly" : ""} — chamando a Graph API e populando o cache...\n`,
  );
  const summary = await syncMetaPerformance(db, {
    days,
    projectIds,
    creatives,
    hourly,
    log: (m) => console.log(m),
  });
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  if (hourly) {
    const h = await pool.query(
      "SELECT count(*)::int AS n, min(date_start) AS desde, max(date_start) AS ate FROM meta_hourly_insights_daily",
    );
    console.log(
      `\nbreakdown horário -> ${h.rows[0].n} linhas, de ${h.rows[0].desde ?? "—"} a ${h.rows[0].ate ?? "—"}`,
    );
  }

  const camp = await pool.query("SELECT count(*)::int AS n FROM meta_campaign_insights_daily");
  const ad = await pool.query("SELECT count(*)::int AS n FROM meta_ad_insights_daily");
  console.log(`\ncache agora -> campaign: ${camp.rows[0].n} rows | ad: ${ad.rows[0].n} rows`);

  // Story 29.43: a cobertura de LP é o número que decide se a tabela do perpétuo
  // é utilizável. Imprimir aqui evita ter que ir ao banco conferir se adiantou.
  if (creatives) {
    // Story 29.63 (AC6): o permalink entra na mesma contagem. Um relatório que
    // mede só a LP fica cego justamente no campo recém-adicionado — foi o QA-35
    // da 36.8, que teria reaparecido aqui se ninguém tocasse nesta query.
    const lp = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE creative->>'linkUrl' IS NOT NULL)::int AS com_link,
              count(*) FILTER (WHERE (creative->>'linkUrlResolver')::int IS NOT NULL)::int AS carimbados,
              count(*) FILTER (WHERE creative->>'igPermalinkUrl' IS NOT NULL)::int AS com_ig,
              count(*) FILTER (WHERE (creative->>'igPermalinkResolver')::int IS NOT NULL)::int AS ig_carimbados,
              count(*) FILTER (WHERE creative->>'adPermalinkUrl' IS NOT NULL)::int AS com_fb
         FROM meta_ad_creatives_cache`,
    );
    const { total, com_link, carimbados, com_ig, ig_carimbados, com_fb } = lp.rows[0];
    const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(2) : "0.00");
    console.log(`criativos -> ${total} rows | com LP: ${com_link} (${pct(com_link)}%) | carimbados: ${carimbados}`);
    // `com_ig` mede o dado; `ig_carimbados` mede quantas linhas SABEM responder
    // sobre ele. A diferença entre os dois é o tamanho do "não perguntamos".
    console.log(
      `permalink -> Instagram: ${com_ig} (${pct(com_ig)}%) | carimbados: ${ig_carimbados} | ` +
        `Facebook (fallback): ${com_fb} (${pct(com_fb)}%)`,
    );

    // Story 29.67 (AC5): o que FICOU DE FORA, e por quê.
    //
    // Silêncio sobre o que faltou foi o que deixou 18 anúncios do DG & CPDF
    // passarem despercebidos depois do backfill da 29.63 — o relatório dizia a
    // cobertura e nada sobre os ausentes.
    //
    // As duas causas pedem reações opostas: sem carimbo se resolve rodando de
    // novo; "a Meta não devolveu criativo" não se resolve esperando.
    const faltantes = await pool.query(
      `WITH ativos AS (
         SELECT DISTINCT project_id, ad_id FROM meta_ad_insights_daily
         WHERE date_start >= to_char(now() - interval '${days} days','YYYY-MM-DD')
           AND spend::numeric > 0)
       SELECT
         count(*) FILTER (WHERE cc.ad_id IS NULL)::int AS sem_linha,
         count(*) FILTER (WHERE cc.ad_id IS NOT NULL
                            AND (cc.creative->>'igPermalinkResolver') IS NULL)::int AS sem_carimbo,
         count(*) FILTER (WHERE (cc.creative->>'igPermalinkResolver') IS NOT NULL
                            AND cc.creative->>'igPermalinkUrl' IS NULL
                            AND cc.creative->>'adPermalinkUrl' IS NULL)::int AS meta_nao_tem
       FROM ativos a
       LEFT JOIN meta_ad_creatives_cache cc
              ON cc.project_id = a.project_id AND cc.ad_id = a.ad_id`,
    );
    const { sem_linha, sem_carimbo, meta_nao_tem } = faltantes.rows[0];
    if (sem_linha > 0 || sem_carimbo > 0) {
      console.log(
        `⚠️  ficaram de fora -> ${sem_linha} sem linha no cache | ${sem_carimbo} sem carimbo ` +
          `(rodar de novo resolve)`,
      );
    } else {
      console.log(`ficaram de fora -> nenhum anúncio da janela sem carimbo`);
    }
    console.log(`sem post na Meta -> ${meta_nao_tem} (não se resolve rodando de novo)`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
