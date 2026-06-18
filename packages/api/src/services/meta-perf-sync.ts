import type { Database } from "../db/client.js";
import { metaAdsAccountProjects } from "../db/schema.js";
import { getMetaAccountForProject } from "./traffic-analytics.js";
import { fetchAdDailyInsights } from "./meta-ads.js";
import { upsertAdDailyInsights } from "./meta-insights-cache.js";

/**
 * Story 36.4: refresh recorrente da performance Meta no cache do banco.
 *
 * Para cada projeto com conta Meta vinculada, puxa os insights por (ad, dia) dos
 * últimos `days` (default 7 — janela curta que corrige ajustes retroativos do Meta)
 * e popula meta_ad_insights_daily. Os endpoints da API pública (36.3) agregam
 * campanha a partir dessa mesma tabela — fonte única, sempre consistente.
 *
 * Robustez: falha de um projeto não derruba os outros (try/catch por projeto).
 * Isto é o que faz a API pública (36.3) / MCP (36.6) terem dados sem depender de
 * alguém abrir o dashboard.
 */
export interface PerfSyncSummary {
  projectsProcessed: number;
  projectsSkipped: number;
  adRowsUpserted: number;
  campaignsCovered: number;
  errors: { projectId: string; error: string }[];
}

export async function syncMetaPerformance(
  db: Database,
  opts: { days?: number; projectIds?: string[]; log?: (msg: string) => void } = {},
): Promise<PerfSyncSummary> {
  const days = opts.days ?? 7;
  const log = opts.log ?? (() => {});
  const summary: PerfSyncSummary = {
    projectsProcessed: 0,
    projectsSkipped: 0,
    adRowsUpserted: 0,
    campaignsCovered: 0,
    errors: [],
  };

  // Projetos com ao menos uma conta Meta vinculada (opcionalmente filtrado).
  const allRows = await db
    .selectDistinct({ projectId: metaAdsAccountProjects.projectId })
    .from(metaAdsAccountProjects);
  const filter = opts.projectIds ? new Set(opts.projectIds) : null;
  const rows = filter ? allRows.filter((r) => filter.has(r.projectId)) : allRows;

  for (const { projectId } of rows) {
    try {
      const account = await getMetaAccountForProject(db, projectId);
      if (!account) {
        summary.projectsSkipped++;
        continue;
      }

      // Ad-level diário → popula meta_ad_insights_daily (fonte única; os endpoints
      // de campanha agregam dela). 1 chamada Graph por projeto.
      const adRows = await fetchAdDailyInsights(
        account.metaAccountId,
        account.accessToken,
        days,
      );
      const upserted = await upsertAdDailyInsights(db, projectId, adRows);
      summary.adRowsUpserted += upserted;

      const campaignsCovered = new Set(
        adRows.map((r) => r.campaign_id).filter((x): x is string => Boolean(x)),
      ).size;
      summary.campaignsCovered += campaignsCovered;

      summary.projectsProcessed++;
      log(
        `[meta-perf] projeto ${projectId}: ${upserted} ad-rows, ${campaignsCovered} campanhas`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ projectId, error: msg });
      log(`[meta-perf] ERRO projeto ${projectId}: ${msg}`);
    }
  }

  return summary;
}
