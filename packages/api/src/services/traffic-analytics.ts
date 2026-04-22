import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaAdsAccounts,
  metaAdsAccountProjects,
} from "../db/schema.js";
import {
  fetchCampaignInsights,
  fetchAdSetInsights,
  fetchAllAdSetInsights,
  fetchAdInsights,
  fetchAllAdInsights,
  fetchAdCreatives,
  fetchCampaignDailyInsights,
  fetchPlacementBreakdown,
  decryptAccountToken,
  type MetaAdSetInsight,
  type MetaAdInsight,
  type MetaAdCreative,
  type MetaDailyInsight,
  type VideoMetrics,
  type AllAdInsight,
  type MetaCampaignInsight,
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
  reach: number;
  frequency: number;
  ctr: number;
  cpc: number;
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
  days: number,
  campaignIds?: string[]
): Promise<OverviewAnalytics> {
  const cacheKey = `analytics:${projectId}:overview:${days}:${campaignIds?.sort().join(",") ?? "all"}`;
  const cached = getCached<OverviewAnalytics>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalReach: null, avgFrequency: null, ctr: 0, cpc: 0, cpm: 0, totalLeads: null, avgCpl: null, totalLinkClicks: null, totalLandingPageViews: null, connectRate: null, totalQualifiedLeads: null, avgCplQualified: null, totalSales: null, totalRevenue: null, totalCheckouts: null, checkoutRate: null, checkoutConversionRate: null, roas: null, cac: null, margin: null, marginPercent: null, totalCampaigns: 0, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const allCampaigns = await fetchCampaignInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  const idSet = campaignIds ? new Set(campaignIds) : null;
  const campaigns = idSet
    ? allCampaigns.filter((c) => idSet.has(c.campaign_id))
    : allCampaigns;

  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || "0"), 0);
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
    connectRate: totalLandingPageViews > 0 && totalLeads > 0 ? (totalLeads / totalLandingPageViews) * 100 : null,
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
  let adsetInsights = await fetchAdSetInsights(metaAccount.metaAccountId, metaAccount.accessToken, campaignId, days);

  // ASC fallback: if no adsets found, aggregate from flat ad query
  if (adsetInsights.length === 0) {
    const allAds = await fetchAllAdInsights(metaAccount.metaAccountId, metaAccount.accessToken, days, campaignId);
    const adsetAgg = new Map<string, { name: string; spend: number; impressions: number; clicks: number; reach: number; leads: number }>();
    for (const a of allAds) {
      const leads = parseLeadsFromActions(a.actions);
      const existing = adsetAgg.get(a.adset_id);
      if (existing) {
        existing.spend += parseFloat(a.spend || "0");
        existing.impressions += parseFloat(a.impressions || "0");
        existing.clicks += parseFloat(a.clicks || "0");
        existing.reach += parseFloat(a.reach || "0");
        existing.leads += leads;
      } else {
        adsetAgg.set(a.adset_id, { name: a.adset_name, spend: parseFloat(a.spend || "0"), impressions: parseFloat(a.impressions || "0"), clicks: parseFloat(a.clicks || "0"), reach: parseFloat(a.reach || "0"), leads });
      }
    }
    const adsets = Array.from(adsetAgg.entries()).map(([id, a]) =>
      buildAnalyticsRow(id, a.name, a.spend, a.impressions, a.clicks, a.leads > 0 ? a.leads : null, null, null, a.reach)
    );
    return { adsets, unattributedLeads: 0, unattributedSales: { count: 0, revenue: 0 }, hasCrm: false, hasQualification: false, hasSales: false };
  }

  const adsets = adsetInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
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
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const reach = parseFloat(a.reach || "0");

    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    return { ...buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, leads > 0 ? leads : null, null, null, reach, lc > 0 ? lc : null, lpv > 0 ? lpv : null), creative: null as MetaAdCreative | null, videoMetrics: a.videoMetrics ?? null };
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

  // Story 9.1: Single flat query for ALL ads (works for ASC/Advantage+ campaigns)
  const allAds = await fetchAllAdInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days,
    campaignId
  );

  if (allAds.length === 0) return [];

  // Build analytics rows
  const ads: TopPerformerAd[] = allAds.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const reach = parseFloat(a.reach || "0");

    const row = buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, null, null, null, reach);
    return { ...row, adsetName: a.adset_name, parentCampaignName: a.campaign_name, creative: null, videoMetrics: a.videoMetrics ?? null };
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
  days: number,
  campaignIds?: string[]
): Promise<{ adsets: (CampaignAnalytics & { parentCampaignName: string })[]; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
  const cacheKey = `analytics:${projectId}:alladsets:v2:${days}:${campaignIds?.sort().join(",") ?? "all"}`;
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
    days
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
      existing.spend += parseFloat(a.spend || "0");
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
        spend: parseFloat(a.spend || "0"),
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

export async function getAllAdsForProject(
  db: Database,
  projectId: string,
  days: number,
  campaignIds?: string[]
): Promise<{ ads: (CampaignAnalytics & { parentCampaignName: string })[]; }> {
  const cacheKey = `analytics:${projectId}:allads:${days}:${campaignIds?.sort().join(",") ?? "all"}`;
  type AllAdsResult = { ads: (CampaignAnalytics & { parentCampaignName: string })[] };
  const cached = getCached<AllAdsResult>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { ads: [] };
  }

  const allAds = await fetchAllAdInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    days
  );

  const idSet = campaignIds ? new Set(campaignIds) : null;
  const filtered = idSet ? allAds.filter((a) => idSet.has(a.campaign_id)) : allAds;

  // Aggregate by ad NAME (same creative across adsets/campaigns)
  const adMap = new Map<string, { id: string; campaignName: string; spend: number; impressions: number; clicks: number; reach: number; leads: number; linkClicks: number; lpViews: number; purchases: number; revenue: number }>();
  for (const a of filtered) {
    const key = a.ad_name.trim();
    const leads = parseLeadsFromActions(a.actions);
    const lc = parseActionCount(a.actions, "link_click");
    const lpv = parseActionCount(a.actions, "landing_page_view");
    const purchases = parsePurchases(a.actions);
    const revenue = parsePurchaseRevenue(a.action_values);
    const existing = adMap.get(key);
    if (existing) {
      existing.spend += parseFloat(a.spend || "0");
      existing.impressions += parseFloat(a.impressions || "0");
      existing.clicks += parseFloat(a.clicks || "0");
      existing.reach += parseFloat(a.reach || "0");
      existing.leads += leads;
      existing.linkClicks += lc;
      existing.lpViews += lpv;
      existing.purchases += purchases;
      existing.revenue += revenue;
    } else {
      adMap.set(key, {
        id: a.ad_id,
        campaignName: a.campaign_name,
        spend: parseFloat(a.spend || "0"),
        impressions: parseFloat(a.impressions || "0"),
        clicks: parseFloat(a.clicks || "0"),
        reach: parseFloat(a.reach || "0"),
        leads, linkClicks: lc, lpViews: lpv, purchases, revenue,
      });
    }
  }

  const ads = Array.from(adMap.entries()).map(([name, a]) => {
    const saleData = a.purchases > 0 ? { count: a.purchases, revenue: a.revenue } : null;
    const row = buildAnalyticsRow(a.id, name, a.spend, a.impressions, a.clicks, a.leads > 0 ? a.leads : null, null, saleData, a.reach, a.linkClicks > 0 ? a.linkClicks : null, a.lpViews > 0 ? a.lpViews : null);
    return { ...row, parentCampaignName: a.campaignName };
  });

  const result: AllAdsResult = { ads };
  setCache(cacheKey, result);
  return result;
}

// Helper to build a consistent analytics row
function buildAnalyticsRow(
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
    // CTR and CPC use link clicks (not total clicks) — matches Meta Ads Manager
    ctr: linkClicks && linkClicks > 0 && impressions > 0 ? (linkClicks / impressions) * 100 : (impressions > 0 ? (clicks / impressions) * 100 : 0),
    cpc: linkClicks && linkClicks > 0 ? spend / linkClicks : (clicks > 0 ? spend / clicks : 0),
    cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
    leads: entityLeads,
    cpl: entityLeads !== null && entityLeads > 0 ? spend / entityLeads : null,
    linkClicks,
    landingPageViews,
    connectRate: landingPageViews !== null && landingPageViews > 0 && entityLeads !== null && entityLeads > 0 ? (entityLeads / landingPageViews) * 100 : null,
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

  // For multiple campaigns, fetch each and merge placement data
  let rawAll: import("./meta-ads.js").MetaPlacementInsight[] = [];
  if (campaignIds && campaignIds.length > 0) {
    const results = await Promise.all(
      campaignIds.map((cid) =>
        fetchPlacementBreakdown(metaAccount.metaAccountId, metaAccount.accessToken, days, cid)
      )
    );
    rawAll = results.flat();
  } else {
    rawAll = await fetchPlacementBreakdown(metaAccount.metaAccountId, metaAccount.accessToken, days);
  }

  // Aggregate by platform+position
  const agg = new Map<string, { spend: number; impressions: number; clicks: number; linkClicks: number; leads: number }>();
  for (const r of rawAll) {
    const key = `${r.publisher_platform}|${r.platform_position}`;
    const spend = parseFloat(r.spend || "0");
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
