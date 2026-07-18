/**
 * Leitores DB-first do funil Meta. Devolvem EXATAMENTE as mesmas shapes dos
 * fetchers ao vivo de meta-ads.ts (MetaCampaignInsight, MetaPlacementInsight, …),
 * mas lendo dos caches diários (meta_campaign_insights_daily,
 * meta_ad_insights_daily, meta_placement_insights_daily) que o sync mantém
 * quente. Assim, trocar a fonte nas rotas NÃO muda a matemática de agregação a
 * jusante (ROAS, imposto, CPL): os números continuam batendo com o dashboard.
 *
 * Agregação over-range: somam-se as métricas diárias por entidade e fazem-se
 * merge das arrays de actions/action_values por action_type. date_start do
 * resultado = início do range (espelha o que a Meta devolve agregado).
 *
 * `reach` é somado das linhas diárias — isso pode superestimar (reach é deduped
 * pela Meta no range). Mesma limitação do caminho ao vivo quando agregado em JS;
 * spend/impressions/clicks/leads/purchases (o que dirige ROAS/CPL/CPA) são exatos.
 */
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaCampaignInsightsDaily,
  metaPlacementInsightsDaily,
  metaEntityNamesCache,
} from "../db/schema.js";
import type { MetaCampaignInsight, MetaPlacementInsight } from "./meta-ads.js";

type ActionArr = { action_type: string; value: string }[] | null | undefined;

/** Soma values por action_type entre várias arrays diárias. */
function mergeActions(arrays: ActionArr[]): { action_type: string; value: string }[] {
  const sums = new Map<string, number>();
  for (const arr of arrays) {
    if (!arr) continue;
    for (const a of arr) {
      sums.set(a.action_type, (sums.get(a.action_type) ?? 0) + (parseFloat(a.value) || 0));
    }
  }
  return Array.from(sums.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }));
}

function sumNumeric(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((s, r) => s + (parseFloat(String(r[key] ?? "0")) || 0), 0);
}

/**
 * Insights por campanha agregados no range, lendo de meta_campaign_insights_daily.
 * Mesma shape de fetchCampaignInsights. Retorna [] quando não há cobertura (o
 * caller decide fallback ao vivo coalescido).
 */
export async function getCampaignInsightsFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
  campaignIds?: string[],
): Promise<MetaCampaignInsight[]> {
  const conds = [
    eq(metaCampaignInsightsDaily.projectId, projectId),
    gte(metaCampaignInsightsDaily.dateStart, since),
    lte(metaCampaignInsightsDaily.dateStart, until),
  ];
  if (campaignIds && campaignIds.length > 0) {
    conds.push(inArray(metaCampaignInsightsDaily.campaignId, campaignIds));
  }
  const rows = await db.select().from(metaCampaignInsightsDaily).where(and(...conds));
  if (rows.length === 0) return [];

  const byId = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byId.get(r.campaignId);
    if (list) list.push(r);
    else byId.set(r.campaignId, [r]);
  }

  const ids = Array.from(byId.keys());
  const nameRows = await db
    .select({ entityId: metaEntityNamesCache.entityId, entityName: metaEntityNamesCache.entityName })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "campaign"),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );
  const names = new Map(nameRows.map((n) => [n.entityId, n.entityName]));

  return Array.from(byId.entries()).map(([campaignId, rs]) => ({
    campaign_id: campaignId,
    campaign_name: names.get(campaignId) ?? campaignId,
    date_start: since,
    date_stop: until,
    impressions: String(sumNumeric(rs, "impressions")),
    reach: String(sumNumeric(rs, "reach")),
    clicks: String(sumNumeric(rs, "clicks")),
    spend: String(sumNumeric(rs, "spend")),
    ctr: "",
    cpc: "",
    cpm: "",
    actions: mergeActions(rs.map((r) => r.actions)),
    action_values: mergeActions(rs.map((r) => r.actionValues)),
  }));
}

/**
 * Breakdown de placement agregado no range, lendo de
 * meta_placement_insights_daily. Mesma shape de fetchPlacementBreakdown (nível
 * conta). NÃO suporta filtro por campanha (a tabela é por projeto/dia) → o caller
 * cai pro fetch ao vivo coalescido nesse caso.
 */
export async function getPlacementBreakdownFromDb(
  db: Database,
  projectId: string,
  since: string,
  until: string,
): Promise<MetaPlacementInsight[]> {
  const rows = await db
    .select()
    .from(metaPlacementInsightsDaily)
    .where(
      and(
        eq(metaPlacementInsightsDaily.projectId, projectId),
        gte(metaPlacementInsightsDaily.dateStart, since),
        lte(metaPlacementInsightsDaily.dateStart, until),
      ),
    );
  if (rows.length === 0) return [];

  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.publisherPlatform}|${r.platformPosition}`;
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }

  return Array.from(byKey.entries()).map(([key, rs]) => {
    const [publisher_platform, platform_position] = key.split("|");
    return {
      publisher_platform,
      platform_position,
      spend: String(sumNumeric(rs, "spend")),
      impressions: String(sumNumeric(rs, "impressions")),
      clicks: String(sumNumeric(rs, "clicks")),
      ctr: "",
      cpc: "",
      cpm: "",
      actions: mergeActions(rs.map((r) => r.actions)),
    };
  });
}

/**
 * Story 18.61: estado ATUAL (effective_status) por ad_id, lido do
 * meta_entity_names_cache (entity_type='ad'). Devolve Map<adId, status>.
 *
 * Leitura NOVA e ad-scoped — separada do join campaign-scoped de
 * getCampaignInsightsFromDb (que resolve NOMES de campanha). Só ids com status
 * conhecido entram no Map; ausência = desconhecido (o caller exibe "—", nunca
 * "Pausado"). Sem TTL: o status é sempre o último sincronizado pelo backfill de
 * nomes. NUNCA chama a Meta (regra batch+cache: dashboard lê do banco).
 */
export async function getAdEffectiveStatusFromDb(
  db: Database,
  projectId: string,
  adIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(adIds.filter((x) => x && x.trim().length > 0)));
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      entityId: metaEntityNamesCache.entityId,
      effectiveStatus: metaEntityNamesCache.effectiveStatus,
    })
    .from(metaEntityNamesCache)
    .where(
      and(
        eq(metaEntityNamesCache.projectId, projectId),
        eq(metaEntityNamesCache.entityType, "ad"),
        inArray(metaEntityNamesCache.entityId, ids),
      ),
    );

  for (const r of rows) {
    if (r.effectiveStatus) out.set(r.entityId, r.effectiveStatus);
  }
  return out;
}
