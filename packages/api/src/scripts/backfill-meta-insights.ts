// Reconstrói `meta_ad_insights_daily` e `meta_campaign_insights_daily` a partir
// da Meta, em janelas curtas.
//
// Nasceu do bug de 2026-10-21 (ver `services/meta-insights-split.ts`): a Graph
// API devolvia 200 com a entrega zerada quando o insight diário pedia ação, e o
// sync foi gravando esse zero em cima do histórico. Depois do conserto o dado é
// recuperável — a Meta devolve tudo certo —, mas alguém precisa pedir de novo.
//
// ## Por que janelas, e não um `syncMetaPerformance({ days: 90 })`
//
// O fetch de anúncio tem cap de 10.000 linhas por chamada (anti-loop). O DG & CPDF
// faz de 60 a 480 linhas de anúncio por dia: 90 dias numa chamada só passariam do
// teto e truncariam — com aviso, mas truncariam. Janela de 7 dias deixa folga de
// uma ordem de grandeza.
//
// Uso:
//   tsx src/scripts/backfill-meta-insights.ts                  # 90 dias, todos os projetos
//   tsx src/scripts/backfill-meta-insights.ts 30               # 30 dias
//   tsx src/scripts/backfill-meta-insights.ts 90 <projectId>   # um projeto
//
// Prod (após build): node dist/scripts/backfill-meta-insights.js [dias] [projectId]

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import {
  fetchAdDailyInsights,
  fetchCampaignDailyInsightsForIds,
} from "../services/meta-ads.js";
import {
  upsertAdDailyInsights,
  upsertCampaignInsights,
} from "../services/meta-insights-cache.js";
import { getAllMetaAccountsForProject } from "../services/traffic-analytics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DIAS_POR_JANELA = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

/** As janelas [since, until] de `dias` para trás, da mais antiga para a mais nova. */
function janelas(dias: number): Array<{ since: string; until: string }> {
  const hoje = Date.now();
  const saida: Array<{ since: string; until: string }> = [];
  for (let fim = dias - 1; fim >= 0; fim -= DIAS_POR_JANELA) {
    const inicio = Math.min(fim + DIAS_POR_JANELA - 1, dias - 1);
    saida.push({
      since: new Date(hoje - inicio * DIA_MS).toISOString().slice(0, 10),
      until: new Date(hoje - fim * DIA_MS).toISOString().slice(0, 10),
    });
  }
  return saida;
}

async function main(): Promise<void> {
  const dias = Number(process.argv[2] ?? 90);
  const soEsteProjeto = process.argv[3] || undefined;
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    console.error("dias inválido (1–365)");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  try {
    const projetos = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(soEsteProjeto ? sql`${schema.projects.id} = ${soEsteProjeto}` : sql`true`);

    for (const projeto of projetos) {
      const contas = await getAllMetaAccountsForProject(db, projeto.id);
      if (contas.length === 0) continue;

      for (const conta of contas) {
        let linhasAnuncio = 0;
        let linhasCampanha = 0;

        for (const janela of janelas(dias)) {
          try {
            const anuncios = await fetchAdDailyInsights(
              conta.metaAccountId,
              conta.accessToken,
              0,
              janela.since,
              janela.until,
            );
            linhasAnuncio += await upsertAdDailyInsights(db, projeto.id, anuncios);

            // As campanhas que tiveram entrega na janela — a mesma regra do
            // sync, para não gastar chamada com campanha parada.
            const campanhas = [
              ...new Set(anuncios.map((a) => a.campaign_id).filter((x): x is string => Boolean(x))),
            ];
            if (campanhas.length > 0) {
              const linhas = await fetchCampaignDailyInsightsForIds(
                conta.metaAccountId,
                conta.accessToken,
                campanhas,
                0,
                janela.since,
                janela.until,
              );
              await upsertCampaignInsights(db, projeto.id, linhas);
              linhasCampanha += linhas.length;
            }
            console.log(
              `  ${projeto.name} · act_${conta.metaAccountId} · ${janela.since}..${janela.until}` +
                ` → ${anuncios.length} linhas de anúncio, ${campanhas.length} campanhas`,
            );
          } catch (err) {
            // Uma janela que falha não derruba o resto: o backfill é idempotente,
            // basta rodar de novo.
            console.error(
              `  ${projeto.name} · act_${conta.metaAccountId} · ${janela.since}..${janela.until} FALHOU:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        console.log(
          `${projeto.name} · act_${conta.metaAccountId}: ${linhasAnuncio} linhas de anúncio,` +
            ` ${linhasCampanha} de campanha`,
        );
      }
    }
  } catch (err) {
    console.error("backfill falhou:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
