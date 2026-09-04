/**
 * Validação visual das Stories 18.74/18.75/18.76 — coleta de produção.
 *
 * Roda as MESMAS funções que as duas telas usam e despeja o payload cru:
 *
 *   - `getTopPerformers(spend, 100)` → o que a galeria de Top Criativos recebe
 *   - `getAllAdsForProject`          → o que o Detalhamento do Perpétuo recebe
 *
 * O JSON resultante é lido pelo comparador do pacote `web`, que aplica as
 * funções REAIS dos dois lados (`aggregateCreativesByName` e
 * `deriveDetailMetrics`). Existe porque suíte verde não prova a forma do dado.
 *
 * Uso (precisa do `.env` da API com DATABASE_URL):
 *
 *     cd packages/api && ./node_modules/.bin/tsx \
 *       scripts/dump-top-criativos-vs-detalhamento.ts <funnelId> <dias> <saida.json>
 */
import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { writeFileSync } from "node:fs";
import * as schema from "../src/db/schema.js";
import {
  getTopPerformers,
  getAllAdsForProject,
} from "../src/services/traffic-analytics.js";

const FUNNEL_ID = process.argv[2] ?? "052437fa-7b4e-4b4a-954a-0b695ce99736";
const DIAS = Number(process.argv[3] ?? 30);
const SAIDA = process.argv[4] ?? "/tmp/top-criativos-prod.json";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const meta = await pool.query(
    `select f.project_id, f.name as funil, fs.id as stage_id, fs.name as etapa,
            fs.stage_type, fs.campaigns
       from funnels f join funnel_stages fs on fs.funnel_id = f.id
      where f.id = $1 order by fs.sort_order limit 1`,
    [FUNNEL_ID],
  );
  const row = meta.rows[0];
  if (!row) throw new Error(`funil ${FUNNEL_ID} sem etapas`);
  // `funnel_stages.campaigns` guarda `{ id, name }` — a rota extrai só o id.
  const campaignIds: string[] = (Array.isArray(row.campaigns) ? row.campaigns : [])
    .map((c: unknown) =>
      typeof c === "string" ? c : ((c as { id?: string })?.id ?? ""),
    )
    .filter(Boolean);
  console.log(
    `funil=${row.funil} etapa=${row.etapa} [${row.stage_type}] campanhas=${campaignIds.length} dias=${DIAS}`,
  );

  const [topPerformers, allAds] = await Promise.all([
    getTopPerformers(db, row.project_id, "spend", 100, DIAS, campaignIds),
    getAllAdsForProject(db, row.project_id, DIAS, campaignIds),
  ]);

  console.log(`topPerformers=${topPerformers.length}  allAds=${allAds.ads.length}`);

  writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        funil: row.funil,
        etapa: row.etapa,
        stageType: row.stage_type,
        dias: DIAS,
        campanhas: campaignIds.length,
        topPerformers,
        allAds: allAds.ads,
      },
      null,
      2,
    ),
  );
  console.log(`escrito em ${SAIDA}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
