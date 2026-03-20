import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaAdsAccounts,
  metaAdsAccountProjects,
} from "../db/schema.js";
import {
  fetchCampaignInsights,
  fetchAdSetInsights,
  fetchAdInsights,
  fetchAdCreatives,
  fetchCampaignDailyInsights,
  fetchPlacementBreakdown,
  decryptAccountToken,
  type MetaAdSetInsight,
  type MetaAdInsight,
  type MetaAdCreative,
  type MetaDailyInsight,
  type VideoMetrics,
} from "./meta-ads.js";

// ============================================================
// TYPES
// ============================================================

export interface CampaignAnalytics {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number | null;
  cpl: number | null;
  qualifiedLeads: number | null;
  cplQualified: number | null;
  qualificationRate: number | null;
  sales: number | null;
  revenue: number | null;
  costPerSale: number | null;
  roas: number | null;
  conversionRate: number | null;
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalQualifiedLeads: number | null;
  avgCplQualified: number | null;
  totalSales: number | null;
  totalRevenue: number | null;
  totalCampaigns: number;
  hasCrm: boolean;
  hasQualification: boolean;
  hasSales: boolean;
}

// ============================================================
// CACHE
// ============================================================

const CACHE_TTL = 15 * 60 * 1000; // 15 min

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
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

async function getMetaAccountForProject(
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

// ============================================================
// PUBLIC API
// ============================================================

export async function getProjectOverview(
  db: Database,
  projectId: string,
  days: number
): Promise<OverviewAnalytics> {
  const cacheKey = `analytics:${projectId}:overview:${days}`;
  const cached = getCached<OverviewAnalytics>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { totalSpend: 0, totalLeads: null, avgCpl: null, totalQualifiedLeads: null, avgCplQualified: null, totalSales: null, totalRevenue: null, totalCampaigns: 0, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const campaigns = await fetchCampaignInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || "0"), 0);

  const result: OverviewAnalytics = {
    totalSpend,
    totalLeads: null,
    avgCpl: null,
    totalQualifiedLeads: null,
    avgCplQualified: null,
    totalSales: null,
    totalRevenue: null,
    totalCampaigns: campaigns.length,
    hasCrm: false,
    hasQualification: false,
    hasSales: false,
  };

  setCache(cacheKey, result);
  return result;
}

export async function getProjectCampaignAnalytics(
  db: Database,
  projectId: string,
  days: number
): Promise<{ campaigns: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const cacheKey = `analytics:${projectId}:campaigns:${days}`;
  type CampaignResult = { campaigns: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean };
  const cached = getCached<CampaignResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { campaigns: [], unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const campaignInsights = await fetchCampaignInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  const campaigns: CampaignAnalytics[] = campaignInsights.map((c) => {
    const spend = parseFloat(c.spend || "0");
    const impressions = parseFloat(c.impressions || "0");
    const clicks = parseFloat(c.clicks || "0");

    return buildAnalyticsRow(c.campaign_id, c.campaign_name, spend, impressions, clicks, null, null, null);
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

  const adsetInsights = await fetchAdSetInsights(metaAccount.metaAccountId, metaAccount.accessToken, campaignId, days);

  const adsets = adsetInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");

    return buildAnalyticsRow(a.adset_id, a.adset_name, spend, impressions, clicks, null, null, null);
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

  const adInsights = await fetchAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, adsetId, days);

  const ads = adInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");

    return { ...buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, null, null, null), creative: null as MetaAdCreative | null, videoMetrics: a.videoMetrics ?? null };
  });

  // Fetch creatives for all ads in drill-down
  try {
    const adIds = ads.map((a) => a.campaignId);
    const creatives = await fetchAdCreatives(metaAccount.metaAccountId, metaAccount.accessToken, adIds);
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

export type TopPerformerMetric = "roas" | "cpl" | "cplQualified" | "leads" | "sales" | "ctr";

export interface TopPerformerAd extends CampaignAnalytics {
  adsetName: string;
  parentCampaignName: string;
  creative: MetaAdCreative | null;
  videoMetrics: VideoMetrics | null;
}

export async function getTopPerformers(
  db: Database,
  projectId: string,
  metric: TopPerformerMetric,
  limit: number,
  days: number,
  campaignId?: string
): Promise<TopPerformerAd[]> {
  const cacheKey = `analytics:${projectId}:top:${metric}:${limit}:${days}:${campaignId ?? "all"}`;
  const cached = getCached<TopPerformerAd[]>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  // Fetch all campaigns
  const allCampaignInsights = await fetchCampaignInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  // Filter by campaignId if provided
  const campaignInsights = campaignId
    ? allCampaignInsights.filter((c) => c.campaign_id === campaignId)
    : allCampaignInsights;

  if (campaignInsights.length === 0) return [];

  // Fetch all adsets for all campaigns in parallel
  type AdSetWithParent = MetaAdSetInsight & { parentCampaignName: string };
  const adsetPromises = campaignInsights.map((c) =>
    fetchAdSetInsights(metaAccount.metaAccountId, metaAccount.accessToken, c.campaign_id, days)
      .then((adsets): AdSetWithParent[] => adsets.map((a) => ({ ...a, parentCampaignName: c.campaign_name })))
      .catch((): AdSetWithParent[] => [])
  );
  const allAdsets = (await Promise.all(adsetPromises)).flat();

  // Fetch all ads for all adsets in parallel
  type AdWithContext = MetaAdInsight & { adsetName: string; parentCampaignName: string };
  const adPromises = allAdsets.map((a) =>
    fetchAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, a.adset_id, days)
      .then((ads): AdWithContext[] => ads.map((ad) => ({ ...ad, adsetName: a.adset_name, parentCampaignName: a.parentCampaignName })))
      .catch((): AdWithContext[] => [])
  );
  const allAds = (await Promise.all(adPromises)).flat();

  if (allAds.length === 0) return [];

  // Build analytics rows for all ads (Meta Ads data only)
  const ads: TopPerformerAd[] = allAds.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");

    const row = buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, null, null, null);
    return { ...row, adsetName: a.adsetName, parentCampaignName: a.parentCampaignName, creative: null, videoMetrics: a.videoMetrics ?? null };
  });

  // Sort by metric
  const descMetrics: TopPerformerMetric[] = ["roas", "leads", "sales", "ctr"];
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

  // Fetch creatives for top ads only (rate limit friendly)
  try {
    const adIds = topAds.map((a) => a.campaignId); // campaignId is actually the ad_id from buildAnalyticsRow
    const creatives = await fetchAdCreatives(metaAccount.metaAccountId, metaAccount.accessToken, adIds);
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
    default: return null;
  }
}

// ============================================================
// ALL ADSETS (Story 7.8)
// ============================================================

export async function getAllAdSetsForProject(
  db: Database,
  projectId: string,
  days: number
): Promise<{ adsets: (CampaignAnalytics & { parentCampaignName: string })[]; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const cacheKey = `analytics:${projectId}:alladsets:${days}`;
  type AllAdSetsResult = { adsets: (CampaignAnalytics & { parentCampaignName: string })[]; hasCrm: boolean; hasQualification: boolean; hasSales: boolean };
  const cached = getCached<AllAdSetsResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { adsets: [], hasCrm: false, hasQualification: false, hasSales: false };
  }

  const campaignInsights = await fetchCampaignInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  // Fetch adsets for all campaigns in parallel
  type AdSetWithParent = MetaAdSetInsight & { parentCampaignName: string };
  const adsetPromises = campaignInsights.map((c) =>
    fetchAdSetInsights(metaAccount.metaAccountId, metaAccount.accessToken, c.campaign_id, days)
      .then((adsets): AdSetWithParent[] => adsets.map((a) => ({ ...a, parentCampaignName: c.campaign_name })))
      .catch((): AdSetWithParent[] => [])
  );
  const allAdsets = (await Promise.all(adsetPromises)).flat();

  const adsets = allAdsets.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");

    const row = buildAnalyticsRow(a.adset_id, a.adset_name, spend, impressions, clicks, null, null, null);
    return { ...row, parentCampaignName: a.parentCampaignName };
  });

  const result: AllAdSetsResult = { adsets, hasCrm: false, hasQualification: false, hasSales: false };
  setCache(cacheKey, result);
  return result;
}

// Helper to build a consistent analytics row
function buildAnalyticsRow(
  id: string, name: string, spend: number, impressions: number, clicks: number,
  entityLeads: number | null, qualLeads: number | null,
  saleData: { count: number; revenue: number } | null
): CampaignAnalytics {
  return {
    campaignId: id,
    campaignName: name,
    spend, impressions, clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
    leads: entityLeads,
    cpl: entityLeads !== null && entityLeads > 0 ? spend / entityLeads : null,
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
  days: number
): Promise<MetaDailyInsight[]> {
  const cacheKey = `analytics:${projectId}:campaign-daily:${campaignId}:${days}`;
  const cached = getCached<MetaDailyInsight[]>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  const result = await fetchCampaignDailyInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    campaignId,
    days
  );

  setCache(cacheKey, result);
  return result;
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
  ctr: number;
  cpc: number;
  cpm: number;
}

export async function getPlacementBreakdown(
  db: Database,
  projectId: string,
  days: number
): Promise<PlacementInsight[]> {
  const cacheKey = `analytics:${projectId}:placements:${days}`;
  const cached = getCached<PlacementInsight[]>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) return [];

  const raw = await fetchPlacementBreakdown(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  const result: PlacementInsight[] = raw.map((r) => ({
    platform: r.publisher_platform,
    position: r.platform_position,
    spend: parseFloat(r.spend || "0"),
    impressions: parseFloat(r.impressions || "0"),
    clicks: parseFloat(r.clicks || "0"),
    ctr: parseFloat(r.ctr || "0"),
    cpc: parseFloat(r.cpc || "0"),
    cpm: parseFloat(r.cpm || "0"),
  }));

  setCache(cacheKey, result);
  return result;
}
