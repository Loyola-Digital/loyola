import type { Database } from "../db/client.js";
import { metaAdsAccountProjects } from "../db/schema.js";
import { getAllMetaAccountsForProject } from "./traffic-analytics.js";
import {
  fetchAdDailyInsights,
  fetchCampaignDailyInsightsForIds,
  fetchPlacementDailyInsights,
  fetchAdCreatives,
} from "./meta-ads.js";
import {
  upsertAdDailyInsights,
  upsertCampaignInsights,
  upsertPlacementInsights,
  upsertAdCreatives,
} from "./meta-insights-cache.js";
import { recordSyncRun, type MetaSyncKind } from "./meta-sync-state.js";
import { singleFlight } from "../utils/single-flight.js";

/**
 * Story 36.4 + Epic 35+ ("tudo da Meta no banco"): refresh recorrente da
 * performance Meta no cache do banco. É o ÚNICO ponto que chama a Meta ao vivo —
 * as rotas leem do banco. Para cada projeto e CADA conta Meta vinculada, persiste:
 *   - meta_ad_insights_daily (grão universal; campanha/adset/conta agregam dele)
 *   - meta_campaign_insights_daily (reach correto por campanha p/ o comparativo)
 *   - meta_placement_insights_daily (breakdown de placement por dia)
 *   - meta_ad_creatives_cache (metadata de criativo — só na cadência `creatives`)
 *
 * Robustez: cada passo é isolado (try/catch + registro em meta_sync_state). Falha
 * de um passo/conta/projeto não derruba os outros. Concorrência entre runs
 * (intraday × diário × trigger manual) é deduplicada via single-flight por
 * (kind, projeto, conta, range).
 */
export interface PerfSyncSummary {
  projectsProcessed: number;
  projectsSkipped: number;
  accountsProcessed: number;
  adRowsUpserted: number;
  campaignRowsUpserted: number;
  placementRowsUpserted: number;
  creativesUpserted: number;
  campaignsCovered: number;
  errors: { projectId: string; accountId?: string; kind?: string; error: string }[];
}

export interface PerfSyncOptions {
  days?: number;
  projectIds?: string[];
  /** Inclui sync de creatives (mais caro). Usar na cadência diária, não na intraday. */
  creatives?: boolean;
  log?: (msg: string) => void;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

export async function syncMetaPerformance(
  db: Database,
  opts: PerfSyncOptions = {},
): Promise<PerfSyncSummary> {
  const days = opts.days ?? 7;
  const log = opts.log ?? (() => {});
  const summary: PerfSyncSummary = {
    projectsProcessed: 0,
    projectsSkipped: 0,
    accountsProcessed: 0,
    adRowsUpserted: 0,
    campaignRowsUpserted: 0,
    placementRowsUpserted: 0,
    creativesUpserted: 0,
    campaignsCovered: 0,
    errors: [],
  };

  // Não falha o sync inteiro se o registro de estado falhar (é observabilidade).
  async function safeRecord(
    projectId: string,
    accountId: string,
    kind: MetaSyncKind,
    result: Parameters<typeof recordSyncRun>[4],
  ): Promise<void> {
    try {
      await recordSyncRun(db, projectId, accountId, kind, result);
    } catch (err) {
      log(`[meta-perf] aviso: falha ao gravar sync_state (${kind}): ${err instanceof Error ? err.message : err}`);
    }
  }

  const allRows = await db
    .selectDistinct({ projectId: metaAdsAccountProjects.projectId })
    .from(metaAdsAccountProjects);
  const filter = opts.projectIds ? new Set(opts.projectIds) : null;
  const rows = filter ? allRows.filter((r) => filter.has(r.projectId)) : allRows;

  for (const { projectId } of rows) {
    let accounts: Array<{ metaAccountId: string; accessToken: string }>;
    try {
      accounts = await getAllMetaAccountsForProject(db, projectId);
    } catch (err) {
      summary.errors.push({ projectId, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (accounts.length === 0) {
      summary.projectsSkipped++;
      continue;
    }

    let projectTouched = false;

    for (const { metaAccountId, accessToken } of accounts) {
      /**
       * Roda um passo do sync com single-flight + timing + registro de estado.
       * `work` devolve o nº de linhas upsertadas. Erros são capturados (não
       * abortam os demais passos) e registrados em meta_sync_state.
       */
      const step = async (kind: MetaSyncKind, work: () => Promise<number>): Promise<number> => {
        const startedAt = Date.now();
        try {
          const upserted = await singleFlight(`${kind}:${projectId}:${metaAccountId}:${days}`, work);
          await safeRecord(projectId, metaAccountId, kind, {
            success: true,
            rowsUpserted: upserted,
            durationMs: Date.now() - startedAt,
          });
          return upserted;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          summary.errors.push({ projectId, accountId: metaAccountId, kind, error: msg });
          await safeRecord(projectId, metaAccountId, kind, {
            success: false,
            error: msg,
            durationMs: Date.now() - startedAt,
          });
          return 0;
        }
      };

      // 1. Ad-level diário — grão universal. Guardamos as linhas pra derivar
      //    campaignIds (campanha-diária) e adIds ativos (creatives).
      let adRows: Awaited<ReturnType<typeof fetchAdDailyInsights>> = [];
      const adStarted = Date.now();
      try {
        adRows = await singleFlight(`ad-daily:${projectId}:${metaAccountId}:${days}`, () =>
          fetchAdDailyInsights(metaAccountId, accessToken, days),
        );
        const up = await upsertAdDailyInsights(db, projectId, adRows);
        summary.adRowsUpserted += up;
        await safeRecord(projectId, metaAccountId, "ad-daily", {
          success: true,
          rowsUpserted: up,
          durationMs: Date.now() - adStarted,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push({ projectId, accountId: metaAccountId, kind: "ad-daily", error: msg });
        await safeRecord(projectId, metaAccountId, "ad-daily", {
          success: false,
          error: msg,
          durationMs: Date.now() - adStarted,
        });
      }

      // 2. Campanha-diária (reach correto por campanha) — reusa as campanhas
      //    descobertas no passo anterior. 1 chamada cobre o range todo.
      const campaignIds = uniqueStrings(adRows.map((r) => r.campaign_id));
      summary.campaignsCovered += campaignIds.length;
      if (campaignIds.length > 0) {
        summary.campaignRowsUpserted += await step("campaign-daily", async () => {
          const campRows = await fetchCampaignDailyInsightsForIds(
            metaAccountId,
            accessToken,
            campaignIds,
            days,
          );
          await upsertCampaignInsights(db, projectId, campRows);
          return campRows.length;
        });
      }

      // 3. Placement diário.
      summary.placementRowsUpserted += await step("placements", async () => {
        const plRows = await fetchPlacementDailyInsights(metaAccountId, accessToken, days);
        return upsertPlacementInsights(db, projectId, plRows);
      });

      // 4. Creatives (só na cadência diária — `opts.creatives`). Limita aos ads
      //    com gasto no período pra não buscar criativo de anúncio inativo.
      if (opts.creatives) {
        const activeAdIds = uniqueStrings(
          adRows.filter((r) => parseFloat(r.spend ?? "0") > 0).map((r) => r.ad_id),
        );
        if (activeAdIds.length > 0) {
          summary.creativesUpserted += await step("creatives", async () => {
            const creatives = await fetchAdCreatives(metaAccountId, accessToken, activeAdIds);
            return upsertAdCreatives(db, projectId, creatives);
          });
        }
      }

      summary.accountsProcessed++;
      projectTouched = true;
      log(`[meta-perf] projeto ${projectId} conta ${metaAccountId}: ${campaignIds.length} campanhas`);
    }

    if (projectTouched) summary.projectsProcessed++;
    else summary.projectsSkipped++;
  }

  return summary;
}
