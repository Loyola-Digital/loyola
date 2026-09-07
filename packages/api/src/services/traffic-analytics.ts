import { eq, and, inArray, gte, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaAdsAccounts,
  metaAdsAccountProjects,
  metaAdCreativesCache,
} from "../db/schema.js";
import {
  fetchCampaignInsights,
  fetchAdSetInsights,
  fetchAllAdSetInsights,
  fetchAdInsights,
  fetchAllAdInsights,
  fetchAdCreativesWithCache,
  fetchPlacementBreakdown,
  decryptAccountToken,
  todayInTimezone,
  dateRangeFromDays,
  LINK_URL_RESOLVER_VERSION,
  AD_PERMALINK_RESOLVER_VERSION,
  IG_PERMALINK_RESOLVER_VERSION,
  type AdCreativeCacheAdapter,
  type MetaAdCreative,
  type MetaDailyInsight,
  type VideoMetrics,
  type MetaCampaignInsight,
} from "./meta-ads.js";
import { fetchCampaignDailyInsightsForIdsWithCache } from "./meta-insights-cache.js";
import {
  getCampaignInsightsFromDb,
  getPlacementBreakdownFromDb,
  // Story 43.9 — insights por anúncio também saem do banco.
  getAdInsightsFromDb,
} from "./meta-db-source.js";
import { singleFlight } from "../utils/single-flight.js";
import { classificarPelaCascata, type TemperaturaDePublico } from "../utils/temperatura-de-publico.js";
import { applyMetaTax } from "../utils/meta-tax.js";
// Story 18.78: a API importa o shared por bare specifier (subpath derruba o
// boot — ver 19.14). O web importa o mesmo módulo por subpath.
import { ctrDeLink, cpcDeLink } from "@loyola-x/shared";

// Story 18.26 Fase 2: TTL alinhado com meta_entity_names_cache (24h)
const META_AD_CREATIVES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function makeAdCreativeCacheAdapter(
  db: Database,
  projectId: string,
): AdCreativeCacheAdapter {
  return {
    async loadCached(adIds) {
      if (adIds.length === 0) return [];
      const cutoff = new Date(Date.now() - META_AD_CREATIVES_CACHE_TTL_MS);
      const rows = await db
        .select({
          adId: metaAdCreativesCache.adId,
          creative: metaAdCreativesCache.creative,
        })
        .from(metaAdCreativesCache)
        .where(
          and(
            eq(metaAdCreativesCache.projectId, projectId),
            inArray(metaAdCreativesCache.adId, adIds),
            gte(metaAdCreativesCache.lastSyncedAt, cutoff),
          ),
        );
      // Reconstitui MetaAdCreative do jsonb persistido
      return rows.map((r) => ({
        adId: r.adId,
        thumbnailUrl: r.creative?.thumbnailUrl ?? null,
        imageUrl: r.creative?.imageUrl ?? null,
        title: r.creative?.title ?? null,
        body: r.creative?.body ?? null,
        linkUrl: r.creative?.linkUrl ?? null,
        ctaType: r.creative?.ctaType ?? null,
        objectType: r.creative?.objectType ?? null,
        videoId: r.creative?.videoId ?? null,
        // Story 36.8: sem esta linha o cache-hit devolveria o criativo SEM o
        // permalink do Facebook.
        adPermalinkUrl: r.creative?.adPermalinkUrl ?? null,
        // Story 29.63: idem para o permalink do Instagram.
        igPermalinkUrl: r.creative?.igPermalinkUrl ?? null,
      }));
      // Story 29.63 (QA-34 da 36.8, resolvido): o `as MetaAdCreative[]` que
      // fechava este map foi REMOVIDO. Ele aceitava objeto sem campo novo com o
      // `tsc` limpo — ou seja, adicionar um campo ao criativo e esquecer desta
      // função devolvia cache-hit incompleto em silêncio, que é o modo de falha
      // mais caro que existe: correto na Meta, errado na tela, verde no CI.
      // Sem o cast, esquecer vira erro de compilação.
    },
    async saveToCache(creatives) {
      if (creatives.length === 0) return;
      await db
        .insert(metaAdCreativesCache)
        .values(
          creatives.map((c) => ({
            projectId,
            adId: c.adId,
            creative: {
              thumbnailUrl: c.thumbnailUrl,
              imageUrl: c.imageUrl,
              videoId: c.videoId,
              title: c.title,
              body: c.body,
              linkUrl: c.linkUrl,
              ctaType: c.ctaType,
              objectType: c.objectType,
              // Story 29.43 (AC2): mesmo carimbo do sync diário — os dois
              // caminhos gravam a mesma tabela e precisam ser indistinguíveis
              // na leitura.
              linkUrlResolver: LINK_URL_RESOLVER_VERSION,
              // Story 36.8: mesmo par valor+carimbo do linkUrl, pelo mesmo
              // motivo — `null` sem carimbo é "não perguntamos", não "não tem".
              adPermalinkUrl: c.adPermalinkUrl,
              adPermalinkResolver: AD_PERMALINK_RESOLVER_VERSION,
              // Story 29.63: o permalink do Instagram segue o mesmo par
              // valor+carimbo. Escrever num só dos dois caminhos deixaria
              // metade do cache sem carimbo — foi o que aconteceu com a 36.8.
              igPermalinkUrl: c.igPermalinkUrl,
              igPermalinkResolver: IG_PERMALINK_RESOLVER_VERSION,
            },
            lastSyncedAt: new Date(),
          })),
        )
        .onConflictDoUpdate({
          target: [metaAdCreativesCache.projectId, metaAdCreativesCache.adId],
          set: {
            creative: sql`EXCLUDED.creative`,
            lastSyncedAt: sql`EXCLUDED.last_synced_at`,
          },
        });
    },
  };
}

// ============================================================
// TYPES
// ============================================================

export interface CampaignAnalytics {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number;
  /**
   * Story 18.78: CTR e CPC de clique no LINK. `null` quando a Meta não devolveu
   * `link_click` — não é zero, é ausência de medição, e a tela mostra `—`.
   */
  ctr: number | null;
  cpc: number | null;
  cpm: number;
  leads: number | null;
  cpl: number | null;
  linkClicks: number | null;
  landingPageViews: number | null;
  connectRate: number | null;
  qualifiedLeads: number | null;
  cplQualified: number | null;
  qualificationRate: number | null;
  sales: number | null;
  revenue: number | null;
  costPerSale: number | null;
  roas: number | null;
  conversionRate: number | null;
  /**
   * Story 29.29: métricas de vídeo por anúncio, base de Hook/Hold/Body
   * Conversion no Detalhamento do Perpétuo.
   *
   * Opcionais de propósito — só `getAllAdsForProject` (nível ad) as preenche.
   * Campanha e adset seguem sem elas, e nenhuma tela que consome este tipo
   * precisa mudar.
   */
  videoViews3s?: number;
  videoViews75?: number;
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach: number | null;
  avgFrequency: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalLinkClicks: number | null;
  totalLandingPageViews: number | null;
  connectRate: number | null;
  totalQualifiedLeads: number | null;
  avgCplQualified: number | null;
  totalSales: number | null;
  totalRevenue: number | null;
  totalCheckouts: number | null;
  checkoutRate: number | null;
  checkoutConversionRate: number | null;
  roas: number | null;
  cac: number | null;
  margin: number | null;
  marginPercent: number | null;
  totalCampaigns: number;
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

// ============================================================
// CACHE
// ============================================================

const CACHE_TTL_DEFAULT = 30 * 60 * 1000; // 30 min — dados estáveis
const CACHE_TTL_TODAY = 5 * 60 * 1000;    // 5 min — range inclui hoje

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, ttl: number = CACHE_TTL_DEFAULT): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Decide se o range solicitado inclui o dia atual (no fuso da conta Meta).
 * Quando inclui, queremos TTL curto — dados de "hoje" mudam o tempo todo
 * conforme Meta processa eventos.
 */
function rangeIncludesToday(
  days: number,
  startDate?: string,
  endDate?: string,
): boolean {
  const today = todayInTimezone();
  if (startDate && endDate) {
    return endDate >= today;
  }
  // Quando só usa `days`, dateRangeFromDays sempre define until=today.
  return days >= 1;
}

function parseActionCount(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === type);
  return action ? parseInt(action.value, 10) || 0 : 0;
}

function parseActionFloat(actionValues: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actionValues) return 0;
  const action = actionValues.find((a) => a.action_type === type);
  return action ? parseFloat(action.value) || 0 : 0;
}

// Use only "lead" — other types (leadgen_grouped, onsite_conversion.lead_grouped) are duplicates
function parseLeads(campaign: MetaCampaignInsight): number {
  return parseActionCount(campaign.actions, "lead");
}

function parseLeadsFromActions(actions?: { action_type: string; value: string }[]): number {
  return parseActionCount(actions, "lead");
}

/**
 * Story 29.29: "Reproduções de vídeo de 3 segundos" — base do Hook Rate.
 *
 * A Meta expõe isso como `actions[].video_view`; é o mesmo número que o
 * Gerenciador de Anúncios mostra como 3-second video plays. Já vem no `actions`
 * que `fetchAllAdInsights` busca — nenhum field novo, nenhuma chamada extra.
 *
 * Precedente: Story 18.65 (`routes/stage-creative-performance.ts`), onde o Hook
 * Rate da Captação foi validado contra o Gerenciador com este mesmo campo.
 * Espelhado aqui em vez de importado porque aquele helper vive numa rota — um
 * service não deve depender de uma.
 */
function parseVideo3sViews(actions?: { action_type: string; value: string }[]): number {
  return parseActionCount(actions, "video_view");
}

/** Parse purchase count from actions — checks multiple Meta action types */
function parsePurchases(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  // Try standard purchase first, then pixel-specific, then omni
  for (const type of ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]) {
    const v = parseActionCount(actions, type);
    if (v > 0) return v;
  }
  return 0;
}

/** Parse purchase revenue from action_values */
function parsePurchaseRevenue(actionValues?: { action_type: string; value: string }[]): number {
  if (!actionValues) return 0;
  for (const type of ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]) {
    const v = parseActionFloat(actionValues, type);
    if (v > 0) return v;
  }
  return 0;
}

/** Parse checkout initiations from actions */
function parseCheckouts(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  for (const type of ["initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout", "omni_initiate_checkout"]) {
    const v = parseActionCount(actions, type);
    if (v > 0) return v;
  }
  return 0;
}

export function invalidateProjectCache(projectId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`analytics:${projectId}`)) {
      cache.delete(key);
    }
  }
}

// ============================================================
// CORE ANALYTICS
// ============================================================

export async function getMetaAccountForProject(
  db: Database,
  projectId: string
): Promise<{ metaAccountId: string; accessToken: string } | null> {
  // Find Meta Ads account linked to this project
  const [link] = await db
    .select({
      accountId: metaAdsAccountProjects.accountId,
    })
    .from(metaAdsAccountProjects)
    .where(eq(metaAdsAccountProjects.projectId, projectId))
    .limit(1);

  if (!link) return null;

  const [account] = await db
    .select()
    .from(metaAdsAccounts)
    .where(eq(metaAdsAccounts.id, link.accountId))
    .limit(1);

  if (!account) return null;

  const accessToken = decryptAccountToken(
    account.accessTokenEncrypted,
    account.accessTokenIv
  );

  return { metaAccountId: account.metaAccountId, accessToken };
}

/**
 * Retorna TODAS as contas Meta vinculadas a um projeto (não só a primeira).
 * O sync usa isto para persistir a performance de cada conta — antes o
 * `.limit(1)` do getMetaAccountForProject deixava contas extras sem cobertura no
 * banco, forçando chamadas ao vivo.
 */
export async function getAllMetaAccountsForProject(
  db: Database,
  projectId: string
): Promise<Array<{ metaAccountId: string; accessToken: string }>> {
  const links = await db
    .select({ accountId: metaAdsAccountProjects.accountId })
    .from(metaAdsAccountProjects)
    .where(eq(metaAdsAccountProjects.projectId, projectId));

  if (links.length === 0) return [];

  const accountIds = links.map((l) => l.accountId);
  const accounts = await db
    .select()
    .from(metaAdsAccounts)
    .where(inArray(metaAdsAccounts.id, accountIds));

  return accounts.map((account) => ({
    metaAccountId: account.metaAccountId,
    accessToken: decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv),
  }));
}

// ============================================================
// PUBLIC API
// ============================================================

export async function getProjectOverview(
  db: Database,
  projectId: string,
  days: number,
  campaignIds?: string[],
  startDate?: string,
  endDate?: string,
): Promise<OverviewAnalytics> {
  const rangeKey = startDate && endDate ? `${startDate}_${endDate}` : `d${days}`;
  const cacheKey = `analytics:${projectId}:overview:${rangeKey}:${campaignIds?.sort().join(",") ?? "all"}`;
  const cached = getCached<OverviewAnalytics>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalReach: null, avgFrequency: null, ctr: 0, cpc: 0, cpm: 0, totalLeads: null, avgCpl: null, totalLinkClicks: null, totalLandingPageViews: null, connectRate: null, totalQualifiedLeads: null, avgCplQualified: null, totalSales: null, totalRevenue: null, totalCheckouts: null, checkoutRate: null, checkoutConversionRate: null, roas: null, cac: null, margin: null, marginPercent: null, totalCampaigns: 0, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const { since, until } =
    startDate && endDate ? { since: startDate, until: endDate } : dateRangeFromDays(days);

  // DB-first: lê do cache diário (meta_campaign_insights_daily) que o sync mantém
  // quente. Só cai no fetch ao vivo — e mesmo assim coalescido por single-flight —
  // quando o banco ainda não tem cobertura para o range. Nunca há "consulta em dobro".
  let allCampaigns = await getCampaignInsightsFromDb(db, projectId, since, until);
  if (allCampaigns.length === 0) {
    allCampaigns = await singleFlight(
      `live:campaign-insights:${projectId}:${since}:${until}`,
      () =>
        fetchCampaignInsights(
          metaAccount.metaAccountId,
          metaAccount.accessToken,
          days,
          startDate,
          endDate,
        ),
    );
  }

  const idSet = campaignIds ? new Set(campaignIds) : null;
  const campaigns = idSet
    ? allCampaigns.filter((c) => idSet.has(c.campaign_id))
    : allCampaigns;

  const totalSpend = campaigns.reduce((s, c) => s + applyMetaTax(parseFloat(c.spend || "0"), c.date_start), 0); // imposto Meta 12,15% (2026+)
  const totalImpressions = campaigns.reduce((s, c) => s + parseFloat(c.impressions || "0"), 0);
  const totalClicks = campaigns.reduce((s, c) => s + parseFloat(c.clicks || "0"), 0);
  const totalReach = campaigns.reduce((s, c) => s + parseFloat(c.reach || "0"), 0);
  const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : null;

  const totalLeads = campaigns.reduce((s, c) => s + parseLeads(c), 0);
  const totalLinkClicks = campaigns.reduce((s, c) => s + parseActionCount(c.actions, "link_click"), 0);
  const totalLandingPageViews = campaigns.reduce((s, c) => s + parseActionCount(c.actions, "landing_page_view"), 0);
  const totalPurchases = campaigns.reduce((s, c) => s + parsePurchases(c.actions), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + parsePurchaseRevenue(c.action_values), 0);
  const totalCheckouts = campaigns.reduce((s, c) => s + parseCheckouts(c.actions), 0);

  const result: OverviewAnalytics = {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalReach: totalReach > 0 ? totalReach : null,
    avgFrequency,
    ctr: totalLinkClicks > 0 && totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0,
    cpc: totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0,
    cpm: totalImpressions > 0 ? (totalSpend * 1000) / totalImpressions : 0,
    totalLeads: totalLeads > 0 ? totalLeads : null,
    avgCpl: totalLeads > 0 ? totalSpend / totalLeads : null,
    totalLinkClicks: totalLinkClicks > 0 ? totalLinkClicks : null,
    totalLandingPageViews: totalLandingPageViews > 0 ? totalLandingPageViews : null,
    connectRate: totalLinkClicks > 0 && totalLandingPageViews > 0 ? (totalLandingPageViews / totalLinkClicks) * 100 : null,
    totalQualifiedLeads: null,
    avgCplQualified: null,
    totalSales: totalPurchases > 0 ? totalPurchases : null,
    totalRevenue: totalRevenue > 0 ? totalRevenue : null,
    totalCheckouts: totalCheckouts > 0 ? totalCheckouts : null,
    checkoutRate: totalLinkClicks > 0 && totalCheckouts > 0 ? (totalCheckouts / totalLinkClicks) * 100 : null,
    checkoutConversionRate: totalCheckouts > 0 && totalPurchases > 0 ? (totalPurchases / totalCheckouts) * 100 : null,
    roas: totalSpend > 0 && totalRevenue > 0 ? totalRevenue / totalSpend : null,
    cac: totalPurchases > 0 ? totalSpend / totalPurchases : null,
    margin: totalRevenue > 0 ? totalRevenue - totalSpend : null,
    marginPercent: totalRevenue > 0 ? ((totalRevenue - totalSpend) / totalRevenue) * 100 : null,
    totalCampaigns: campaigns.length,
    hasCrm: false,
    hasQualification: false,
    hasSales: totalPurchases > 0,
  };

  setCache(cacheKey, result);
  return result;
}

export async function getProjectCampaignAnalytics(
  db: Database,
  projectId: string,
  days: number,
  startDate?: string,
  endDate?: string,
): Promise<{ campaigns: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const rangeKey = startDate && endDate ? `${startDate}_${endDate}` : `d${days}`;
  const cacheKey = `analytics:${projectId}:campaigns:${rangeKey}`;
  type CampaignResult = { campaigns: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean };
  const cached = getCached<CampaignResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { campaigns: [], unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const { since, until } =
    startDate && endDate ? { since: startDate, until: endDate } : dateRangeFromDays(days);
  let campaignInsights = await getCampaignInsightsFromDb(db, projectId, since, until);
  if (campaignInsights.length === 0) {
    campaignInsights = await singleFlight(
      `live:campaign-insights:${projectId}:${since}:${until}`,
      () => fetchCampaignInsights(metaAccount.metaAccountId, metaAccount.accessToken, days, startDate, endDate),
    );
  }

  const campaigns: CampaignAnalytics[] = campaignInsights.map((c) => {
    const spend = applyMetaTax(parseFloat(c.spend || "0"), c.date_start); // imposto Meta 12,15% (2026+)
    const impressions = parseFloat(c.impressions || "0");
    const clicks = parseFloat(c.clicks || "0");
    const reach = parseFloat(c.reach || "0");
    const leads = parseLeads(c);
    const lc = parseActionCount(c.actions, "link_click");
    const lpv = parseActionCount(c.actions, "landing_page_view");
    const purchases = parsePurchases(c.actions);
    const revenue = parsePurchaseRevenue(c.action_values);
    const saleData = purchases > 0 ? { count: purchases, revenue } : null;

    return buildAnalyticsRow(c.campaign_id, c.campaign_name, spend, impressions, clicks, leads > 0 ? leads : null, null, saleData, reach, lc > 0 ? lc : null, lpv > 0 ? lpv : null);
  });

  const result: CampaignResult = { campaigns, unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  setCache(cacheKey, result);
  return result;
}

export async function getProjectAdSetAnalytics(
  db: Database,
  projectId: string,
  campaignId: string,
  days: number
): Promise<{ adsets: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { adsets: [], unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  // Story 9.1: Try hierarchical first, fallback to flat query for ASC campaigns
  const adsetInsights = await fetchAdSetInsights(metaAccount.metaAccountId, metaAccount.accessToken, campaignId, days);

  // ASC fallback: if no adsets found, aggregate from flat ad query
  if (adsetInsights.length === 0) {
    const allAds = await fetchAllAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, days, campaignId);
    const adsetAgg = new Map<string, { name: string; spend: number; impressions: number; clicks: number; reach: number; leads: number }>();
    for (const a of allAds) {
      const leads = parseLeadsFromActions(a.actions);
      const existing = adsetAgg.get(a.adset_id);
      if (existing) {
        existing.spend += applyMetaTax(parseFloat(a.spend || "0"), a.date_start);
        existing.impressions += parseFloat(a.impressions || "0");
        existing.clicks += parseFloat(a.clicks || "0");
        existing.reach += parseFloat(a.reach || "0");
        existing.leads += leads;
      } else {
        adsetAgg.set(a.adset_id, { name: a.adset_name, spend: applyMetaTax(parseFloat(a.spend || "0"), a.date_start), impressions: parseFloat(a.impressions || "0"), clicks: parseFloat(a.clicks || "0"), reach: parseFloat(a.reach || "0"), leads });
      }
    }
    const adsets = Array.from(adsetAgg.entries()).map(([id, a]) =>
      buildAnalyticsRow(id, a.name, a.spend, a.impressions, a.clicks, a.leads > 0 ? a.leads : null, null, null, a.reach)
    );
    return { adsets, unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const adsets = adsetInsights.map((a) => {
    const spend = applyMetaTax(parseFloat(a.spend || "0"), a.date_start); // imposto Meta 12,15% (2026+)
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const reach = parseFloat(a.reach || "0");
    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    return buildAnalyticsRow(a.adset_id, a.adset_name, spend, impressions, clicks, leads > 0 ? leads : null, null, null, reach, lc > 0 ? lc : null, lpv > 0 ? lpv : null);
  });

  return { adsets, unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
}

export async function getProjectAdAnalytics(
  db: Database,
  projectId: string,
  adsetId: string,
  days: number
): Promise<{ ads: (CampaignAnalytics & { creative: MetaAdCreative | null; videoMetrics: VideoMetrics | null })[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { ads: [], unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  // Story 9.1: Try hierarchical first, fallback to flat query for ASC campaigns
  let adInsights = await fetchAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, adsetId, days);

  // ASC fallback: if no ads found via adset filter, try flat query filtered by adset
  if (adInsights.length === 0) {
    const allAds = await fetchAllAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, days);
    const filtered = allAds.filter((a) => a.adset_id === adsetId);
    adInsights = filtered.map((a) => ({ ...a, ad_id: a.ad_id, ad_name: a.ad_name }));
  }

  const ads = adInsights.map((a) => {
    const spend = applyMetaTax(parseFloat(a.spend || "0"), a.date_start); // imposto Meta 12,15% (2026+)
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const reach = parseFloat(a.reach || "0");

    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    return { ...buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, leads > 0 ? leads : null, null, null, reach, lc > 0 ? lc : null, lpv > 0 ? lpv : null), creative: null as MetaAdCreative | null, videoMetrics: a.videoMetrics ?? null };
  });

  // Fetch creatives for all ads in drill-down (Story 18.26 Fase 2: DB cache 24h)
  try {
    const adIds = ads.map((a) => a.campaignId);
    const creatives = await fetchAdCreativesWithCache(
      makeAdCreativeCacheAdapter(db, projectId),
      metaAccount.metaAccountId,
      metaAccount.accessToken,
      adIds,
    );
    const creativeMap = new Map(creatives.map((c) => [c.adId, c]));
    for (const ad of ads) {
      ad.creative = creativeMap.get(ad.campaignId) ?? null;
    }
  } catch {
    // Graceful: ads still returned with creative: null
  }

  return { ads, unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
}

// ============================================================
// TOP PERFORMERS (Story 7.8)
// ============================================================

export type TopPerformerMetric = "roas" | "cpl" | "cplQualified" | "leads" | "sales" | "ctr" | "spend";

export interface TopPerformerAd extends CampaignAnalytics {
  adsetName: string;
  parentCampaignName: string;
  creative: MetaAdCreative | null;
  videoMetrics: VideoMetrics | null;
}

/**
 * Story 18.78 (AC2) — quantos anúncios têm o criativo buscado na Meta.
 *
 * Era o mesmo número que cortava os dados (`limit`), e por isso o corte de
 * rate limit virava corte de cálculo. Agora são duas coisas: `limit` diz
 * quantos anúncios o cliente recebe, esta constante diz de quantos vale a pena
 * pagar a miniatura. Os primeiros da ordenação — os de maior gasto quando
 * `metric=spend`, que é como a galeria pede.
 */
export const CREATIVE_FETCH_LIMIT = 100;

/**
 * Story 18.78 (AC2) — de quais anúncios vale a pena pagar a miniatura.
 *
 * Exportada para teste: o que precisa ficar provado é que este corte NÃO
 * encolhe a lista devolvida ao cliente. Era o mesmo `slice` para as duas
 * coisas, e por isso o teto de rate limit virava teto de cálculo.
 *
 * A ordem importa. A galeria agrupa por Ad Name e mostra a imagem do anúncio
 * de MAIOR GASTO do grupo, então um `slice` puro deixaria sem imagem todo
 * grupo cujo líder caísse além do teto (medido no bbe-pr2: 2 dos 30 cards).
 * Por isso o primeiro anúncio de cada nome entra antes — mesmo número de
 * chamadas à Meta, nenhum card agrupado sem miniatura.
 *
 * `topAds` já chega ordenado pela métrica, então "o primeiro de cada nome" é
 * o líder do grupo quando a ordenação é por gasto, que é como a galeria pede.
 */
export function idsParaBuscarCriativo(
  topAds: readonly { campaignId: string; campaignName: string }[],
): string[] {
  const escolhidos: string[] = [];
  const jaTem = new Set<string>();
  const nomeVisto = new Set<string>();

  for (const ad of topAds) {
    if (escolhidos.length >= CREATIVE_FETCH_LIMIT) break;
    const nome = ad.campaignName?.trim() ?? "";
    if (nomeVisto.has(nome)) continue;
    nomeVisto.add(nome);
    jaTem.add(ad.campaignId);
    escolhidos.push(ad.campaignId);
  }
  for (const ad of topAds) {
    if (escolhidos.length >= CREATIVE_FETCH_LIMIT) break;
    if (jaTem.has(ad.campaignId)) continue;
    jaTem.add(ad.campaignId);
    escolhidos.push(ad.campaignId);
  }
  return escolhidos;
}

export async function getTopPerformers(
  db: Database,
  projectId: string,
  metric: TopPerformerMetric,
  limit: number,
  days: number,
  campaignIds?: string | string[],
  startDate?: string,
  endDate?: string,
): Promise<TopPerformerAd[]> {
  // Normaliza em array pra cache key e delegação
  const idList = Array.isArray(campaignIds)
    ? campaignIds.filter((x): x is string => !!x)
    : campaignIds
      ? [campaignIds]
      : [];
  const rangeKey = startDate && endDate ? `${startDate}_${endDate}` : `d${days}`;
  const cacheKey = `analytics:${projectId}:top:${metric}:${limit}:${rangeKey}:${
    idList.length > 0 ? [...idList].sort().join(",") : "all"
  }`;
  const cached = getCached<TopPerformerAd[]>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  // Story 9.1: Single flat query for ALL ads (works for ASC/Advantage+ campaigns)
  //
  // Story 43.9 — DB-first, mesmo padrão do overview logo acima: lê de
  // `meta_ad_insights_daily`, que o sync mantém quente, e só vai à Meta quando
  // o banco não cobre o range. `level=ad` é a consulta mais cara do arquivo —
  // varre a conta inteira, página por página — e o limite da Meta é
  // compartilhado entre todos os dashboards.
  const { since: adSince, until: adUntil } =
    startDate && endDate ? { since: startDate, until: endDate } : dateRangeFromDays(days);
  let allAds = await getAdInsightsFromDb(
    db,
    projectId,
    adSince,
    adUntil,
    idList.length > 0 ? idList : undefined,
  );
  if (allAds.length === 0) {
    allAds = await fetchAllAdInsights(
      metaAccount.metaAccountId,
      metaAccount.accessToken,
      days,
      idList.length > 0 ? idList : undefined,
      startDate,
      endDate,
    );
  }

  if (allAds.length === 0) return [];

  // Build analytics rows
  const ads: TopPerformerAd[] = allAds.map((a) => {
    const spend = applyMetaTax(parseFloat(a.spend || "0"), a.date_start); // imposto Meta 12,15% (2026+)
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const reach = parseFloat(a.reach || "0");

    /**
     * Cliques NO LINK (`link_click` das `actions`) — decisão do gestor em
     * 2026-09-03: CTR e CPC do produto são sempre sobre clique no link, como no
     * Gerenciador da Meta.
     *
     * ⚠️ Esta linha estava **omitida**. `buildAnalyticsRow` já dizia, num
     * comentário, que usava link clicks — mas recebia `linkClicks` ausente e
     * caía no fallback de cliques totais, sem avisar. O resultado: a galeria de
     * criativos mostrava CTR de clique em qualquer lugar do anúncio enquanto a
     * tabela de Desempenho de Criativos mostrava CTR de link, e os dois números
     * discordavam com o mesmo rótulo na mesma tela.
     *
     * `null` quando a métrica não veio; `0` quando veio e foi zero — a
     * diferença entre "não medimos" e "ninguém clicou" sobrevive até a tela.
     */
    const linkClicks = a.actions ? parseActionCount(a.actions, "link_click") : null;

    const row = buildAnalyticsRow(
      a.ad_id, a.ad_name, spend, impressions, clicks, null, null, null, reach,
      linkClicks,
    );
    return { ...row, adsetName: a.adset_name, parentCampaignName: a.campaign_name, creative: null, videoMetrics: a.videoMetrics ?? null };
  });

  // Sort by metric
  const descMetrics: TopPerformerMetric[] = ["roas", "leads", "sales", "ctr", "spend"];
  const isDesc = descMetrics.includes(metric);

  const filtered = ads.filter((a) => {
    const val = getMetricValue(a, metric);
    return val !== null && val !== 0;
  });

  filtered.sort((a, b) => {
    const va = getMetricValue(a, metric) ?? 0;
    const vb = getMetricValue(b, metric) ?? 0;
    return isDesc ? vb - va : va - vb;
  });

  const topAds = filtered.slice(0, limit);

  // Fetch creatives for top ads only — Story 18.26 Fase 2: DB cache 24h
  //
  // Story 18.78 (AC2): a busca de criativo é o que custa rate limit (lotes de
  // 50 + passos de hi-res/IG), não o cálculo. Então o teto vive AQUI, e não no
  // `limit` que corta os dados: os anúncios além de `CREATIVE_FETCH_LIMIT`
  // voltam com `creative: null` e entram nos somatórios do grupo do mesmo
  // jeito. `aggregateCreativesByName` inclui ads sem creative de propósito, e
  // a galeria renderiza placeholder — some a miniatura, nunca o número.
  try {
    // campaignId is actually the ad_id from buildAnalyticsRow
    const adIds = idsParaBuscarCriativo(topAds);
    const creatives = await fetchAdCreativesWithCache(
      makeAdCreativeCacheAdapter(db, projectId),
      metaAccount.metaAccountId,
      metaAccount.accessToken,
      adIds,
    );
    const creativeMap = new Map(creatives.map((c) => [c.adId, c]));
    for (const ad of topAds) {
      ad.creative = creativeMap.get(ad.campaignId) ?? null;
    }
  } catch {
    // Graceful: if creative fetch fails, ads still have creative: null
  }

  setCache(cacheKey, topAds);
  return topAds;
}

function getMetricValue(a: CampaignAnalytics, metric: TopPerformerMetric): number | null {
  switch (metric) {
    case "roas": return a.roas;
    case "cpl": return a.cpl;
    case "cplQualified": return a.cplQualified;
    case "leads": return a.leads;
    case "sales": return a.sales;
    case "ctr": return a.ctr;
    case "spend": return a.spend;
    default: return null;
  }
}

// ============================================================
// ALL ADSETS (Story 7.8)
// ============================================================

export async function getAllAdSetsForProject(
  db: Database,
  projectId: string,
  days: number,
  campaignIds?: string[],
  startDate?: string,
  endDate?: string,
): Promise<{ adsets: (CampaignAnalytics & { parentCampaignName: string })[]; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const rangeKey = startDate && endDate ? `${startDate}_${endDate}` : `d${days}`;
  const cacheKey = `analytics:${projectId}:alladsets:v2:${rangeKey}:${campaignIds?.sort().join(",") ?? "all"}`;
  type AllAdSetsResult = { adsets: (CampaignAnalytics & { parentCampaignName: string })[]; hasCrm: boolean; hasQualification: boolean; hasSales: boolean };
  const cached = getCached<AllAdSetsResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { adsets: [], hasCrm: false, hasQualification: false, hasSales: false };
  }

  // Fetch at adset level (not ad level) — gets actions/leads correctly
  const adsetInsights = await fetchAllAdSetInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days,
    startDate,
    endDate,
  );

  const idSet = campaignIds ? new Set(campaignIds) : null;
  const filtered = idSet
    ? adsetInsights.filter((a) => a.campaign_id && idSet.has(a.campaign_id))
    : adsetInsights;

  // Aggregate by adset NAME (same audience across campaigns)
  const adsetMap = new Map<string, { id: string; campaignName: string; spend: number; impressions: number; clicks: number; reach: number; leads: number; linkClicks: number; lpViews: number; purchases: number; revenue: number }>();
  for (const a of filtered) {
    const key = a.adset_name.trim();
    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    const purchases = parsePurchases(a.actions);
    const revenue = parsePurchaseRevenue(a.action_values);
    const existing = adsetMap.get(key);
    if (existing) {
      existing.spend += applyMetaTax(parseFloat(a.spend || "0"), a.date_start); // imposto Meta 12,15% (2026+)
      existing.impressions += parseFloat(a.impressions || "0");
      existing.clicks += parseFloat(a.clicks || "0");
      existing.reach += parseFloat(a.reach || "0");
      existing.leads += leads;
      existing.linkClicks += lc;
      existing.lpViews += lpv;
      existing.purchases += purchases;
      existing.revenue += revenue;
    } else {
      adsetMap.set(key, {
        id: a.adset_id,
        campaignName: a.campaign_name ?? "",
        spend: applyMetaTax(parseFloat(a.spend || "0"), a.date_start), // imposto Meta 12,15% (2026+)
        impressions: parseFloat(a.impressions || "0"),
        clicks: parseFloat(a.clicks || "0"),
        reach: parseFloat(a.reach || "0"),
        leads, linkClicks: lc, lpViews: lpv, purchases, revenue,
      });
    }
  }

  const adsets = Array.from(adsetMap.entries()).map(([name, a]) => {
    const saleData = a.purchases > 0 ? { count: a.purchases, revenue: a.revenue } : null;
    const row = buildAnalyticsRow(a.id, name, a.spend, a.impressions, a.clicks, a.leads > 0 ? a.leads : null, null, saleData, a.reach, a.linkClicks > 0 ? a.linkClicks : null, a.lpViews > 0 ? a.lpViews : null);
    return { ...row, parentCampaignName: a.campaignName };
  });

  const result: AllAdSetsResult = { adsets, hasCrm: false, hasQualification: false, hasSales: false };
  setCache(cacheKey, result);
  return result;
}

/**
 * Story 29.76 — a linha de um criativo, com a quebra por público quando ela
 * existe. `porPublico` é OPCIONAL de propósito: o front tem de funcionar contra
 * uma API que ainda não a devolve (deploys em ciclos diferentes).
 */
export type LinhaDeAd = CampaignAnalytics & {
  parentCampaignName: string;
  videoViews3s?: number;
  videoViews75?: number;
  porPublico?: {
    quente?: CampaignAnalytics & { parentCampaignName: string };
    frio?: CampaignAnalytics & { parentCampaignName: string };
  };
};

export async function getAllAdsForProject(
  db: Database,
  projectId: string,
  days: number,
  campaignIds?: string[],
  startDate?: string,
  endDate?: string,
): Promise<{ ads: LinhaDeAd[] }> {
  const rangeKey = startDate && endDate ? `${startDate}_${endDate}` : `d${days}`;
  const cacheKey = `analytics:${projectId}:allads:${rangeKey}:${campaignIds?.sort().join(",") ?? "all"}`;
  type AllAdsResult = { ads: LinhaDeAd[] };
  const cached = getCached<AllAdsResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { ads: [] };
  }

  // Story 43.9 — DB-first (ver `getTopPerformers` acima). Esta é a rota
  // `/all-ads`, que a 29.76 acabou de tornar mais pesada ao devolver a quebra
  // por público: mais um motivo para ela não varrer a Meta a cada request.
  const { since: adSince, until: adUntil } =
    startDate && endDate ? { since: startDate, until: endDate } : dateRangeFromDays(days);
  let allAds = await getAdInsightsFromDb(db, projectId, adSince, adUntil, campaignIds);
  if (allAds.length === 0) {
    allAds = await fetchAllAdInsights(
      metaAccount.metaAccountId,
      metaAccount.accessToken,
      days,
      campaignIds,
      startDate,
      endDate,
    );
  }

  const idSet = campaignIds ? new Set(campaignIds) : null;
  const filtered = idSet ? allAds.filter((a) => idSet.has(a.campaign_id)) : allAds;

  // Aggregate by ad NAME (same creative across adsets/campaigns)
  // Story 29.29: `videoViews3s`/`videoViews75` acumulam junto — um Ad Name pode
  // ter N ad_ids, e as métricas de vídeo dos N somam sob o mesmo nome, igual ao
  // resto. As TAXAS (Hook/Hold/Body) são derivadas depois, no frontend, a partir
  // destes somatórios — nunca média das taxas por id.
  type AcumuladorDeAd = { id: string; campaignName: string; spend: number; impressions: number; clicks: number; reach: number; leads: number; linkClicks: number; lpViews: number; purchases: number; revenue: number; videoViews3s: number; videoViews75: number };
  const adMap = new Map<string, AcumuladorDeAd>();

  /**
   * Story 29.76 — o MESMO acúmulo, quebrado por público (quente/frio).
   *
   * Um Ad Name atravessa campanhas: no `pps1`, `ad11-pp-s1-ago26--noticia` tem
   * 4 ad_ids — 3 em campanha fria, 1 em quente. Como o `adMap` guarda um único
   * `id` por nome, o front classificava o criativo INTEIRO pela temperatura
   * desse representante. Onde o frio domina em quantidade de ad_ids, o filtro
   * "quente" devolvia **zero** criativos de 4 que existiam.
   *
   * Somar aqui, e não classificar lá, é o que faz a métrica seguir o filtro: um
   * criativo com R$ 100 em quente e R$ 900 em frio precisa aparecer com R$ 100
   * quando o filtro é quente. Devolver a linha inteira trocaria "o criativo
   * sumiu" por "número errado que parece certo" — o pior dos dois.
   */
  const adMapPorPublico = new Map<string, AcumuladorDeAd>();
  const chaveDePublico = (nome: string, t: TemperaturaDePublico) => `${nome}\u0000${t}`;

  for (const a of filtered) {
    const key = a.ad_name.trim();
    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    const purchases = parsePurchases(a.actions);
    const revenue = parsePurchaseRevenue(a.action_values);
    const v3s = parseVideo3sViews(a.actions);
    // `extractVideoMetrics` devolve null quando todos os percentis são 0
    // (anúncio de imagem) — o `?? 0` evita NaN vazando para a UI.
    const v75 = a.videoMetrics?.p75 ?? 0;
    const existing = adMap.get(key);
    if (existing) {
      existing.spend += applyMetaTax(parseFloat(a.spend || "0"), a.date_start); // imposto Meta 12,15% (2026+)
      existing.impressions += parseFloat(a.impressions || "0");
      existing.clicks += parseFloat(a.clicks || "0");
      existing.reach += parseFloat(a.reach || "0");
      existing.leads += leads;
      existing.linkClicks += lc;
      existing.lpViews += lpv;
      existing.purchases += purchases;
      existing.revenue += revenue;
      existing.videoViews3s += v3s;
      existing.videoViews75 += v75;
    } else {
      adMap.set(key, {
        id: a.ad_id,
        campaignName: a.campaign_name,
        spend: applyMetaTax(parseFloat(a.spend || "0"), a.date_start), // imposto Meta 12,15% (2026+)
        impressions: parseFloat(a.impressions || "0"),
        clicks: parseFloat(a.clicks || "0"),
        reach: parseFloat(a.reach || "0"),
        leads, linkClicks: lc, lpViews: lpv, purchases, revenue,
        videoViews3s: v3s, videoViews75: v75,
      });
    }

    // Story 29.76 — a mesma linha, somada no balde do seu público.
    // A cascata é a de `temperatura-de-publico.ts` (anúncio → conjunto →
    // campanha), a MESMA que monta o mapa consumido pelo front: duas regras
    // diferentes para a mesma pergunta é exatamente como as duas pontas
    // divergem sem ninguém perceber.
    const classe = classificarPelaCascata({
      adId: a.ad_id, adName: a.ad_name, adsetId: a.adset_id,
      adsetName: a.adset_name, campaignId: a.campaign_id, campaignName: a.campaign_name,
    });
    if (classe) {
      const kp = chaveDePublico(key, classe.temperatura);
      const ex = adMapPorPublico.get(kp);
      if (ex) {
        ex.spend += applyMetaTax(parseFloat(a.spend || "0"), a.date_start);
        ex.impressions += parseFloat(a.impressions || "0");
        ex.clicks += parseFloat(a.clicks || "0");
        ex.reach += parseFloat(a.reach || "0");
        ex.leads += leads; ex.linkClicks += lc; ex.lpViews += lpv;
        ex.purchases += purchases; ex.revenue += revenue;
        ex.videoViews3s += v3s; ex.videoViews75 += v75;
      } else {
        adMapPorPublico.set(kp, {
          id: a.ad_id, campaignName: a.campaign_name,
          spend: applyMetaTax(parseFloat(a.spend || "0"), a.date_start),
          impressions: parseFloat(a.impressions || "0"),
          clicks: parseFloat(a.clicks || "0"),
          reach: parseFloat(a.reach || "0"),
          leads, linkClicks: lc, lpViews: lpv, purchases, revenue,
          videoViews3s: v3s, videoViews75: v75,
        });
      }
    }
  }

  /** Story 29.76 — a linha de um acumulador, seja o total ou o de um público. */
  const linhaDoAcumulador = (id: string, name: string, a: AcumuladorDeAd) => {
    const saleData = a.purchases > 0 ? { count: a.purchases, revenue: a.revenue } : null;
    const row = buildAnalyticsRow(id, name, a.spend, a.impressions, a.clicks, a.leads > 0 ? a.leads : null, null, saleData, a.reach, a.linkClicks > 0 ? a.linkClicks : null, a.lpViews > 0 ? a.lpViews : null);
    return {
      ...row,
      parentCampaignName: a.campaignName,
      videoViews3s: a.videoViews3s,
      videoViews75: a.videoViews75,
    };
  };

  const ads = Array.from(adMap.entries()).map(([name, a]) => {
    const linha = linhaDoAcumulador(a.id, name, a);
    // `porPublico` só traz o que EXISTE. Um criativo que só rodou em campanha
    // quente vem com `frio` ausente — e o front distingue "não rodou neste
    // público" de "rodou e gastou zero".
    const quente = adMapPorPublico.get(chaveDePublico(name, "quente"));
    const frio = adMapPorPublico.get(chaveDePublico(name, "frio"));
    if (!quente && !frio) return linha;
    return {
      ...linha,
      porPublico: {
        ...(quente ? { quente: linhaDoAcumulador(quente.id, name, quente) } : {}),
        ...(frio ? { frio: linhaDoAcumulador(frio.id, name, frio) } : {}),
      },
    };
  });

  const result: AllAdsResult = { ads };
  setCache(cacheKey, result);
  return result;
}

// Helper to build a consistent analytics row
/**
 * Story 18.78: exportada para teste. O que precisa ficar provado não é a
 * fórmula (essa vive no shared, testada lá), e sim que esta função REPASSA
 * `linkClicks` — a 18.76 documentou num comentário que usava cliques no link
 * enquanto recebia o parâmetro ausente e caía no fallback, sem avisar ninguém.
 */
export function buildAnalyticsRow(
  id: string, name: string, spend: number, impressions: number, clicks: number,
  entityLeads: number | null, qualLeads: number | null,
  saleData: { count: number; revenue: number } | null,
  reach: number = 0,
  linkClicks: number | null = null,
  landingPageViews: number | null = null
): CampaignAnalytics {
  return {
    campaignId: id,
    campaignName: name,
    spend, impressions, clicks,
    reach,
    frequency: reach > 0 ? impressions / reach : 0,
    /**
     * CTR e CPC são de CLIQUE NO LINK, sem fallback — a regra vive em
     * `@loyola-x/shared/src/clique-no-link` desde a Story 18.78, porque as três
     * cópias que existiam divergiram: esta e a do Detalhamento do Perpétuo
     * caíam em cliques totais enquanto o card do Top Criativos mostrava `—`.
     */
    ctr: ctrDeLink(linkClicks, impressions),
    cpc: cpcDeLink(linkClicks, spend),
    cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
    leads: entityLeads,
    cpl: entityLeads !== null && entityLeads > 0 ? spend / entityLeads : null,
    linkClicks,
    landingPageViews,
    connectRate: linkClicks && linkClicks > 0 && landingPageViews !== null ? (landingPageViews / linkClicks) * 100 : null,
    qualifiedLeads: qualLeads,
    cplQualified: qualLeads !== null && qualLeads > 0 ? spend / qualLeads : null,
    qualificationRate: qualLeads !== null && entityLeads !== null && entityLeads > 0 ? (qualLeads / entityLeads) * 100 : null,
    sales: saleData ? saleData.count : null,
    revenue: saleData ? saleData.revenue : null,
    costPerSale: saleData && saleData.count > 0 ? spend / saleData.count : null,
    roas: saleData && spend > 0 ? saleData.revenue / spend : null,
    conversionRate: saleData && entityLeads !== null && entityLeads > 0 ? (saleData.count / entityLeads) * 100 : null,
  };
}

// ============================================================
// CAMPAIGN DAILY INSIGHTS (Story 8.3)
// ============================================================

export async function getCampaignDailyInsights(
  db: Database,
  projectId: string,
  campaignId: string,
  days: number,
  startDate?: string,
  endDate?: string
): Promise<MetaDailyInsight[]> {
  const cacheKey = `analytics:${projectId}:campaign-daily:${campaignId}:${days}:${startDate ?? ""}:${endDate ?? ""}`;
  const ttl = rangeIncludesToday(days, startDate, endDate) ? CACHE_TTL_TODAY : CACHE_TTL_DEFAULT;
  const cached = getCached<MetaDailyInsight[]>(cacheKey, ttl);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  // DB-first: reutiliza o wrapper bulk com 1 campanha. Persiste em
  // meta_campaign_insights_daily com TTL date-aware (dias > 7 = infinito).
  const result = await fetchCampaignDailyInsightsForIdsWithCache(
    db,
    projectId,
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    [campaignId],
    days,
    startDate,
    endDate
  );

  setCache(cacheKey, result);
  return result;
}

// Agrega daily insights de N campanhas em uma série única por dia.
// Soma spend/impressions/clicks/reach + actions + action_values; CTR/CPM/CPC
// são derivados (não somáveis).
export async function getCampaignDailyInsightsBulk(
  db: Database,
  projectId: string,
  campaignIds: string[],
  days: number,
  startDate?: string,
  endDate?: string
): Promise<MetaDailyInsight[]> {
  if (campaignIds.length === 0) return [];

  const sortedIds = [...campaignIds].sort();
  const cacheKey = `analytics:${projectId}:campaign-daily-bulk:${sortedIds.join(",")}:${days}:${startDate ?? ""}:${endDate ?? ""}`;
  const ttl = rangeIncludesToday(days, startDate, endDate) ? CACHE_TTL_TODAY : CACHE_TTL_DEFAULT;
  const cached = getCached<MetaDailyInsight[]>(cacheKey, ttl);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  // Story 18.26 Fase 3: DB-first cache. Dias > 7 dias atras vem do Postgres
  // (TTL infinito), dias 1-7 (TTL 24h), dia atual (TTL 30min). Reduz
  // chamadas Meta a 0 quando todo o range esta cacheado.
  const raw = await fetchCampaignDailyInsightsForIdsWithCache(
    db,
    projectId,
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    campaignIds,
    days,
    startDate,
    endDate
  );

  // Agrega por date_start
  type Bucket = {
    date_start: string;
    date_stop: string;
    impressions: number;
    reach: number;
    clicks: number;
    spend: number;
    actions: Map<string, number>;
    actionValues: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();
  for (const row of raw) {
    let b = buckets.get(row.date_start);
    if (!b) {
      b = {
        date_start: row.date_start,
        date_stop: row.date_stop,
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        actions: new Map(),
        actionValues: new Map(),
      };
      buckets.set(row.date_start, b);
    }
    b.impressions += parseFloat(row.impressions || "0");
    b.reach += parseFloat(row.reach || "0");
    b.clicks += parseFloat(row.clicks || "0");
    b.spend += parseFloat(row.spend || "0");
    for (const a of row.actions ?? []) {
      b.actions.set(a.action_type, (b.actions.get(a.action_type) ?? 0) + parseFloat(a.value || "0"));
    }
    for (const a of row.action_values ?? []) {
      b.actionValues.set(a.action_type, (b.actionValues.get(a.action_type) ?? 0) + parseFloat(a.value || "0"));
    }
  }

  const aggregated: MetaDailyInsight[] = Array.from(buckets.values())
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
    .map((b) => {
      const ctr = b.impressions > 0 ? (b.clicks / b.impressions) * 100 : 0;
      const cpc = b.clicks > 0 ? b.spend / b.clicks : 0;
      const cpm = b.impressions > 0 ? (b.spend / b.impressions) * 1000 : 0;
      return {
        date_start: b.date_start,
        date_stop: b.date_stop,
        impressions: String(b.impressions),
        reach: String(b.reach),
        clicks: String(b.clicks),
        spend: b.spend.toFixed(2),
        ctr: ctr.toFixed(4),
        cpc: cpc.toFixed(4),
        cpm: cpm.toFixed(4),
        actions: Array.from(b.actions.entries()).map(([action_type, value]) => ({
          action_type,
          value: String(value),
        })),
        action_values: Array.from(b.actionValues.entries()).map(([action_type, value]) => ({
          action_type,
          value: value.toFixed(2),
        })),
      };
    });

  setCache(cacheKey, aggregated);
  return aggregated;
}

// ============================================================
// PLACEMENT BREAKDOWN (Story 8.7)
// ============================================================

export interface PlacementInsight {
  platform: string;
  position: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  leads: number | null;
  cpl: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
}

export async function getPlacementBreakdown(
  db: Database,
  projectId: string,
  days: number,
  campaignIds?: string[]
): Promise<PlacementInsight[]> {
  const cacheKey = `analytics:${projectId}:placements:${days}:${campaignIds?.sort().join(",") ?? "all"}`;
  const cached = getCached<PlacementInsight[]>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  let rawAll: import("./meta-ads.js").MetaPlacementInsight[] = [];
  if (campaignIds && campaignIds.length > 0) {
    // Filtro por campanha não é coberto pelo cache diário (a tabela é por
    // projeto/dia); fetch ao vivo, mas coalescido para não duplicar entre acessos
    // simultâneos.
    rawAll = await singleFlight(
      `live:placements:${projectId}:${days}:${campaignIds.slice().sort().join(",")}`,
      async () => {
        const results = await Promise.all(
          campaignIds.map((cid) =>
            fetchPlacementBreakdown(metaAccount.metaAccountId, metaAccount.accessToken, days, cid),
          ),
        );
        return results.flat();
      },
    );
  } else {
    // DB-first: agrega de meta_placement_insights_daily; fallback coalescido.
    const { since, until } = dateRangeFromDays(days);
    rawAll = await getPlacementBreakdownFromDb(db, projectId, since, until);
    if (rawAll.length === 0) {
      rawAll = await singleFlight(
        `live:placements:${projectId}:${days}:all`,
        () => fetchPlacementBreakdown(metaAccount.metaAccountId, metaAccount.accessToken, days),
      );
    }
  }

  // Aggregate by platform+position. Placement insights não trazem date_start
  // (agregado por posicionamento); usa a data atual para decidir o imposto (2026+).
  const placementTaxDate = new Date().toISOString().slice(0, 10);
  const agg = new Map<string, { spend: number; impressions: number; clicks: number; linkClicks: number; leads: number }>();
  for (const r of rawAll) {
    const key = `${r.publisher_platform}|${r.platform_position}`;
    const spend = applyMetaTax(parseFloat(r.spend || "0"), placementTaxDate); // imposto Meta 12,15% (2026+)
    const impressions = parseFloat(r.impressions || "0");
    const clicks = parseFloat(r.clicks || "0");
    const linkClicks = parseActionCount(r.actions, "link_click");
    const leads = parseActionCount(r.actions, "lead");
    const existing = agg.get(key);
    if (existing) {
      existing.spend += spend;
      existing.impressions += impressions;
      existing.clicks += clicks;
      existing.linkClicks += linkClicks;
      existing.leads += leads;
    } else {
      agg.set(key, { spend, impressions, clicks, linkClicks, leads });
    }
  }

  const result: PlacementInsight[] = Array.from(agg.entries()).map(([key, v]) => {
    const [platform, position] = key.split("|");
    const lc = v.linkClicks > 0 ? v.linkClicks : v.clicks;
    return {
      platform,
      position,
      spend: v.spend,
      impressions: v.impressions,
      clicks: v.clicks,
      linkClicks: v.linkClicks,
      leads: v.leads > 0 ? v.leads : null,
      cpl: v.leads > 0 ? v.spend / v.leads : null,
      ctr: v.impressions > 0 ? (lc / v.impressions) * 100 : 0,
      cpc: lc > 0 ? v.spend / lc : 0,
      cpm: v.impressions > 0 ? (v.spend * 1000) / v.impressions : 0,
    };
  });

  setCache(cacheKey, result);
  return result;
}
