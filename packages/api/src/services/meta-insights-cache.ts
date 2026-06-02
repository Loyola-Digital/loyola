/**
 * Story 18.26 Fase 3: cache persistente de insights diários Meta.
 *
 * Insights de dias passados há mais de 7 dias NÃO mudam mais pela Meta —
 * servem do DB indefinidamente. Dias 1-7 atrás: TTL 24h (Meta ainda pode
 * ajustar atribuição). Dia atual: TTL 30min (Meta processa em tempo real).
 *
 * Pattern:
 * 1. Construir lista (id, date) esperada do range solicitado
 * 2. Carregar do DB as linhas fresh (TTL específico por idade do dia)
 * 3. Identificar (id, date) faltantes → coleta os ids únicos
 * 4. Chamar Meta com IN filter pros ids faltantes (cobre todas as datas do range)
 * 5. Upsert no DB
 * 6. Retornar union (cache + fresh)
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { metaCampaignInsightsDaily } from "../db/schema.js";
import {
  fetchCampaignDailyInsightsForIds,
  type MetaDailyInsight,
} from "./meta-ads.js";

const TTL_INSIGHTS_TODAY_MS = 30 * 60 * 1000; // 30min
const TTL_INSIGHTS_RECENT_MS = 24 * 60 * 60 * 1000; // 24h (1-7 dias atrás)
// > 7 dias atrás: sem TTL (Meta nao muda atribuicao mais)

/**
 * Retorna timestamp de corte aplicável pra uma data específica.
 * Caller usa: `lastSyncedAt >= cutoff` pra considerar fresh.
 *
 * - dateStart = hoje: cutoff = now - 30min
 * - dateStart entre 1-7 dias atrás: cutoff = now - 24h
 * - dateStart > 7 dias atrás: cutoff = 1970 (qualquer linha cacheada vale)
 */
export function ttlCutoffForDate(dateStart: string, now: Date = new Date()): Date {
  const today = now.toISOString().slice(0, 10);
  if (dateStart === today) return new Date(now.getTime() - TTL_INSIGHTS_TODAY_MS);
  const dateMs = new Date(dateStart + "T00:00:00Z").getTime();
  const todayMs = new Date(today + "T00:00:00Z").getTime();
  const daysDiff = Math.floor((todayMs - dateMs) / (24 * 60 * 60 * 1000));
  if (daysDiff <= 7) return new Date(now.getTime() - TTL_INSIGHTS_RECENT_MS);
  return new Date(0); // historic — qualquer linha vale
}

/**
 * Enumera as datas (YYYY-MM-DD) num range [since, until] inclusive.
 */
function enumerateDates(since: string, until: string): string[] {
  const dates: string[] = [];
  const start = new Date(since + "T00:00:00Z");
  const end = new Date(until + "T00:00:00Z");
  for (let d = start.getTime(); d <= end.getTime(); d += 24 * 60 * 60 * 1000) {
    dates.push(new Date(d).toISOString().slice(0, 10));
  }
  return dates;
}

function dateRangeFromDays(days: number): { since: string; until: string } {
  const today = new Date();
  const until = today.toISOString().slice(0, 10);
  const sinceDate = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString().slice(0, 10);
  return { since, until };
}

/**
 * Carrega do DB todas as linhas (campaign_id, date_start) ainda válidas
 * conforme TTL date-aware. Retorna no formato MetaDailyInsight + campaign_id.
 */
async function loadCachedCampaignInsights(
  db: Database,
  projectId: string,
  campaignIds: string[],
  dates: string[],
): Promise<Array<MetaDailyInsight & { campaign_id: string }>> {
  if (campaignIds.length === 0 || dates.length === 0) return [];

  // Mais permissivo: pega TUDO no range e filtra TTL por linha em memoria.
  // Postgres nao tem condicional fácil "TTL different per row" sem CASE WHEN
  // pesado — buscar todas e filtrar em JS é mais simples e barato pra ranges
  // típicos (90 dias * N campanhas = poucos milhares de rows).
  const rows = await db
    .select()
    .from(metaCampaignInsightsDaily)
    .where(
      and(
        eq(metaCampaignInsightsDaily.projectId, projectId),
        inArray(metaCampaignInsightsDaily.campaignId, campaignIds),
        inArray(metaCampaignInsightsDaily.dateStart, dates),
      ),
    );

  const now = new Date();
  return rows
    .filter((r) => r.lastSyncedAt.getTime() >= ttlCutoffForDate(r.dateStart, now).getTime())
    .map((r) => ({
      campaign_id: r.campaignId,
      date_start: r.dateStart,
      date_stop: r.dateStart,
      impressions: String(r.impressions),
      reach: String(r.reach),
      clicks: String(r.clicks),
      spend: String(r.spend),
      ctr: "",
      cpc: "",
      cpm: "",
      actions: r.actions ?? undefined,
      action_values: r.actionValues ?? undefined,
    }));
}

/**
 * Identifica quais campanhas precisam refetch da Meta (alguma data do range
 * está stale ou ausente).
 *
 * Estratégia simplificada: se QUALQUER (campaign, date) do range está
 * faltando/stale, refaz fetch da campanha INTEIRA no range. Compensa porque
 * 1 chamada Meta cobre o range todo pra essa campanha.
 */
function identifyCampaignsToRefetch(
  campaignIds: string[],
  dates: string[],
  cached: Array<{ campaign_id: string; date_start: string }>,
): string[] {
  const have = new Set<string>();
  for (const row of cached) have.add(`${row.campaign_id}|${row.date_start}`);

  const toRefetch = new Set<string>();
  for (const cid of campaignIds) {
    for (const d of dates) {
      if (!have.has(`${cid}|${d}`)) {
        toRefetch.add(cid);
        break;
      }
    }
  }
  return Array.from(toRefetch);
}

/**
 * Upsert das insights recém-buscados no DB.
 * Meta retorna 1 linha por (campaign, dia) — chave composta da tabela.
 */
async function upsertCampaignInsights(
  db: Database,
  projectId: string,
  rows: Array<MetaDailyInsight & { campaign_id?: string }>,
  defaultCampaignId?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date();
  const values = rows
    .map((r) => ({
      projectId,
      campaignId: r.campaign_id ?? defaultCampaignId ?? "",
      dateStart: r.date_start.slice(0, 10),
      spend: r.spend ?? "0",
      impressions: r.impressions ?? "0",
      reach: r.reach ?? "0",
      clicks: r.clicks ?? "0",
      actions: r.actions ?? null,
      actionValues: r.action_values ?? null,
      lastSyncedAt: now,
    }))
    .filter((r) => r.campaignId);
  if (values.length === 0) return;
  await db
    .insert(metaCampaignInsightsDaily)
    .values(values)
    .onConflictDoUpdate({
      target: [
        metaCampaignInsightsDaily.projectId,
        metaCampaignInsightsDaily.campaignId,
        metaCampaignInsightsDaily.dateStart,
      ],
      set: {
        spend: sql`EXCLUDED.spend`,
        impressions: sql`EXCLUDED.impressions`,
        reach: sql`EXCLUDED.reach`,
        clicks: sql`EXCLUDED.clicks`,
        actions: sql`EXCLUDED.actions`,
        actionValues: sql`EXCLUDED.action_values`,
        lastSyncedAt: sql`EXCLUDED.last_synced_at`,
      },
    });
}

/**
 * Wrapper DB-first do fetchCampaignDailyInsightsForIds.
 *
 * Retorna no shape de MetaDailyInsight (sem campaign_id) — mesma assinatura
 * da função original — porque o caller (`getCampaignDailyInsightsBulk`)
 * agrega por dia somando todas as campanhas. Se algum dia precisar do
 * campaign_id, usar a variante interna que preserva.
 */
export async function fetchCampaignDailyInsightsForIdsWithCache(
  db: Database,
  projectId: string,
  metaAccountId: string,
  accessToken: string,
  campaignIds: string[],
  days: number,
  startDate?: string,
  endDate?: string,
): Promise<MetaDailyInsight[]> {
  if (campaignIds.length === 0) return [];

  const since = startDate && endDate ? startDate : dateRangeFromDays(days).since;
  const until = startDate && endDate ? endDate : dateRangeFromDays(days).until;
  const dates = enumerateDates(since, until);

  // 1. Carrega do cache (TTL date-aware aplicado em JS)
  const cached = await loadCachedCampaignInsights(db, projectId, campaignIds, dates);

  // 2. Identifica campanhas com alguma data faltante/stale
  const toRefetch = identifyCampaignsToRefetch(campaignIds, dates, cached);

  // 3. Fetch Meta pros faltantes (filter IN + paginação interna)
  let fresh: MetaDailyInsight[] = [];
  if (toRefetch.length > 0) {
    const rawFresh = await fetchCampaignDailyInsightsForIds(
      metaAccountId,
      accessToken,
      toRefetch,
      days,
      startDate,
      endDate,
    );
    fresh = rawFresh;

    // Meta retorna campaign_id em cada row quando level=campaign — preservado
    // pela paginação. Upsert no DB.
    const rowsWithId = rawFresh as Array<MetaDailyInsight & { campaign_id?: string }>;
    await upsertCampaignInsights(db, projectId, rowsWithId);
  }

  // 4. Retorna cache (sem campaign_id) + fresh. Caller agrega por dia.
  // Pra cache: removo campaign_id antes de devolver (assinatura compativel)
  const cachedClean: MetaDailyInsight[] = cached.map(({ campaign_id: _unused, ...rest }) => rest);
  return [...cachedClean, ...fresh];
}

/**
 * Epic 30 Story 30.2: Background sync histórico de uma ou mais campanhas.
 *
 * Disparada fire-and-forget quando user vincula campanha nova a um funnel.
 * Popula meta_campaign_insights_daily com 365 dias retroativos pra que
 * dashboards subsequentes carreguem instantâneos.
 *
 * Idempotente: chama `fetchCampaignDailyInsightsForIdsWithCache` que pula
 * dias já fresh no cache. Re-chamar não desperdiça API.
 *
 * SEM PROPAGAÇÃO de erros: captura tudo internamente, loga e segue.
 */
export async function syncCampaignHistoryInBackground(
  db: Database,
  projectId: string,
  metaAccountId: string,
  accessToken: string,
  campaignIds: string[],
  days: number = 365,
): Promise<void> {
  if (campaignIds.length === 0) return;
  try {
    await fetchCampaignDailyInsightsForIdsWithCache(
      db,
      projectId,
      metaAccountId,
      accessToken,
      campaignIds,
      days,
    );
    console.log(
      `[meta-sync] backfilled ${campaignIds.length} campaign(s) × ${days}d for project ${projectId}`,
    );
  } catch (err) {
    console.error(
      `[meta-sync] failed for project ${projectId} campaigns ${campaignIds.join(",")}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Helper fire-and-forget: dispara sync sem bloquear a request.
 * Erros são swallowed (já tratados internamente em syncCampaignHistoryInBackground).
 */
export function triggerBackgroundSyncForNewCampaigns(
  db: Database,
  projectId: string,
  metaAccountId: string,
  accessToken: string,
  newCampaignIds: string[],
  days: number = 365,
): void {
  if (newCampaignIds.length === 0) return;
  // void = explicit fire-and-forget; promise resolve não é aguardado
  void syncCampaignHistoryInBackground(
    db,
    projectId,
    metaAccountId,
    accessToken,
    newCampaignIds,
    days,
  );
}
