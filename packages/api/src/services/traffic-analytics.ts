import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  googleSheetsConnections,
  googleSheetsTabMappings,
  metaAdsAccounts,
  metaAdsAccountProjects,
} from "../db/schema.js";
import {
  fetchCampaignInsights,
  fetchAdSetInsights,
  fetchAdInsights,
  fetchAdCreatives,
  fetchCampaignDailyInsights,
  decryptAccountToken,
  type MetaAdSetInsight,
  type MetaAdInsight,
  type MetaAdCreative,
  type MetaDailyInsight,
  type VideoMetrics,
} from "./meta-ads.js";
import { getTabData } from "./google-sheets.js";
import { getQualifiedLeadsByEntity, getProfileForProject } from "./lead-qualification.js";

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
// UTM MATCHING
// ============================================================

function normalizeUtm(value: string | undefined | null): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip all separators for fuzzy comparison: "fz-l1" → "fzl1", "lista-de-espera" → "listadeespera" */
function stripSeparators(value: string): string {
  return value.replace(/[-_.\s[\]()]/g, "");
}

function matchUtm(
  utmValue: string,
  entityName: string,
  entityId: string
): boolean {
  const normalized = normalizeUtm(utmValue);
  if (!normalized) return false;

  const normName = normalizeUtm(entityName);
  const normId = normalizeUtm(entityId);

  // 1. Exact match
  if (normalized === normName || normalized === normId) return true;

  // 2. Fuzzy: strip separators and check contains (min 3 chars to avoid false positives)
  const strippedUtm = stripSeparators(normalized);
  if (strippedUtm.length < 3) return false;

  const strippedName = stripSeparators(normName);
  const strippedId = stripSeparators(normId);

  // UTM value found inside campaign/adset/ad name (e.g., "fzl1" inside "fzl1fev26leads...")
  if (strippedName.includes(strippedUtm) || strippedId.includes(strippedUtm)) return true;

  // Campaign name tag found inside UTM (e.g., compound UTM "fzl1_grupo_whatsapp_cpl_lista-de-espera")
  // Split compound UTMs and check each part
  const utmParts = normalized.split(/[-_]/g).filter((p) => p.length >= 3);
  for (const part of utmParts) {
    const strippedPart = stripSeparators(part);
    if (strippedName.includes(strippedPart) && strippedPart.length >= 4) return true;
  }

  return false;
}

// ============================================================
// LEAD COUNTING
// ============================================================

interface LeadsByEntity {
  matched: Map<string, number>; // entityId → count
  unattributed: number;
}

function countLeadsByUtm(
  leads: Record<string, string>[],
  utmField: string,
  entities: { id: string; name: string }[]
): LeadsByEntity {
  const matched = new Map<string, number>();
  let unattributed = 0;

  for (const lead of leads) {
    const utmValue = lead[utmField];
    if (!utmValue) {
      unattributed++;
      continue;
    }

    let found = false;
    for (const entity of entities) {
      if (matchUtm(utmValue, entity.name, entity.id)) {
        matched.set(entity.id, (matched.get(entity.id) ?? 0) + 1);
        found = true;
        break;
      }
    }
    if (!found) {
      unattributed++;
    }
  }

  return { matched, unattributed };
}

// ============================================================
// CORE ANALYTICS
// ============================================================

async function getLeadsForProject(
  db: Database,
  projectId: string
): Promise<Record<string, string>[] | null> {
  // Find Google Sheets connection for this project
  const [connection] = await db
    .select()
    .from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.projectId, projectId))
    .limit(1);

  if (!connection) return null;

  // Find "leads" tab mapping
  const [leadsMapping] = await db
    .select()
    .from(googleSheetsTabMappings)
    .where(eq(googleSheetsTabMappings.connectionId, connection.id))
    .then((rows) => rows.filter((r) => r.tabType === "leads"));

  if (!leadsMapping) return null;

  // Fetch data from Sheets
  const tabData = await getTabData(
    connection.spreadsheetId,
    leadsMapping.tabName,
    leadsMapping.columnMapping as Record<string, string>
  );

  return tabData.rows;
}

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
// SALES DATA (Story 7.6)
// ============================================================

interface SalesByEntity {
  matched: Map<string, { count: number; revenue: number }>;
  unattributed: { count: number; revenue: number };
}

function parseValor(raw: string): number {
  if (!raw) return 0;
  // Handle BR format: "1.297,50" → 1297.50 or "297" → 297
  const cleaned = raw
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

async function getSalesForProject(
  db: Database,
  projectId: string
): Promise<Record<string, string>[] | null> {
  const [connection] = await db
    .select()
    .from(googleSheetsConnections)
    .where(eq(googleSheetsConnections.projectId, projectId))
    .limit(1);

  if (!connection) return null;

  const salesMappings = await db
    .select()
    .from(googleSheetsTabMappings)
    .where(eq(googleSheetsTabMappings.connectionId, connection.id))
    .then((rows) => rows.filter((r) => r.tabType === "sales"));

  if (salesMappings.length === 0) return null;

  const mapping = salesMappings[0];
  const tabData = await getTabData(
    connection.spreadsheetId,
    mapping.tabName,
    mapping.columnMapping as Record<string, string>
  );

  return tabData.rows;
}

function countSalesByUtm(
  sales: Record<string, string>[],
  utmField: string,
  entities: { id: string; name: string }[]
): SalesByEntity {
  const matched = new Map<string, { count: number; revenue: number }>();
  const unattributed = { count: 0, revenue: 0 };

  for (const sale of sales) {
    const utmValue = sale[utmField];
    const valor = parseValor(sale.valor ?? "");

    if (!utmValue) {
      unattributed.count++;
      unattributed.revenue += valor;
      continue;
    }

    let found = false;
    for (const entity of entities) {
      if (matchUtm(utmValue, entity.name, entity.id)) {
        const current = matched.get(entity.id) ?? { count: 0, revenue: 0 };
        current.count++;
        current.revenue += valor;
        matched.set(entity.id, current);
        found = true;
        break;
      }
    }
    if (!found) {
      unattributed.count++;
      unattributed.revenue += valor;
    }
  }

  return { matched, unattributed };
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

  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;

  const totalSpend = campaigns.reduce((s, c) => s + parseFloat(c.spend || "0"), 0);
  const totalLeads = hasCrm ? leads!.length : null;
  const avgCpl = hasCrm && totalLeads! > 0 ? totalSpend / totalLeads! : null;

  // Qualification
  const profile = await getProfileForProject(db, projectId);
  const hasQualification = profile !== null;
  let totalQualifiedLeads: number | null = null;
  let avgCplQualified: number | null = null;

  if (hasQualification && hasCrm && leads!.length > 0) {
    const entities = campaigns.map((c) => ({ id: c.campaign_id, name: c.campaign_name }));
    const qualResult = await getQualifiedLeadsByEntity(db, projectId, leads!, "utmCampaign", entities);
    if (qualResult) {
      totalQualifiedLeads = qualResult.totalQualified;
      avgCplQualified = totalQualifiedLeads > 0 ? totalSpend / totalQualifiedLeads : null;
    }
  }

  // Sales
  const salesData = await getSalesForProject(db, projectId);
  const hasSales = salesData !== null;
  let totalSales: number | null = null;
  let totalRevenue: number | null = null;

  if (hasSales) {
    totalSales = salesData!.length;
    totalRevenue = salesData!.reduce((s, r) => s + parseValor(r.valor ?? ""), 0);
  }

  const result: OverviewAnalytics = {
    totalSpend,
    totalLeads,
    avgCpl,
    totalQualifiedLeads,
    avgCplQualified,
    totalSales,
    totalRevenue,
    totalCampaigns: campaigns.length,
    hasCrm,
    hasQualification,
    hasSales,
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

  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = campaignInsights.map((c) => ({
    id: c.campaign_id,
    name: c.campaign_name,
  }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) {
    leadCounts = countLeadsByUtm(leads!, "utmCampaign", entities);
  }

  // Qualification
  const qualResult = hasCrm && leads!.length > 0
    ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmCampaign", entities)
    : null;
  const hasQualification = qualResult !== null;

  // Sales
  const salesData = await getSalesForProject(db, projectId);
  const hasSales = salesData !== null;
  let salesCounts: SalesByEntity = { matched: new Map(), unattributed: { count: 0, revenue: 0 } };
  if (hasSales && salesData!.length > 0) {
    salesCounts = countSalesByUtm(salesData!, "utmCampaign", entities);
  }

  const campaigns: CampaignAnalytics[] = campaignInsights.map((c) => {
    const spend = parseFloat(c.spend || "0");
    const impressions = parseFloat(c.impressions || "0");
    const clicks = parseFloat(c.clicks || "0");
    const campaignLeads = hasCrm ? (leadCounts.matched.get(c.campaign_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(c.campaign_id) ?? 0) : null;
    const saleData = hasSales ? (salesCounts.matched.get(c.campaign_id) ?? { count: 0, revenue: 0 }) : null;

    return {
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      spend, impressions, clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
      leads: campaignLeads,
      cpl: campaignLeads !== null && campaignLeads > 0 ? spend / campaignLeads : null,
      qualifiedLeads: qualLeads,
      cplQualified: qualLeads !== null && qualLeads > 0 ? spend / qualLeads : null,
      qualificationRate: qualLeads !== null && campaignLeads !== null && campaignLeads > 0 ? (qualLeads / campaignLeads) * 100 : null,
      sales: saleData ? saleData.count : null,
      revenue: saleData ? saleData.revenue : null,
      costPerSale: saleData && saleData.count > 0 ? spend / saleData.count : null,
      roas: saleData && spend > 0 ? saleData.revenue / spend : null,
      conversionRate: saleData && campaignLeads !== null && campaignLeads > 0 ? (saleData.count / campaignLeads) * 100 : null,
    };
  });

  const result: CampaignResult = { campaigns, unattributedLeads: leadCounts.unattributed, unattributedSales: salesCounts.unattributed, hasCrm, hasQualification, hasSales };
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
  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = adsetInsights.map((a) => ({ id: a.adset_id, name: a.adset_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) leadCounts = countLeadsByUtm(leads!, "utmMedium", entities);

  const qualResult = hasCrm && leads!.length > 0 ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmMedium", entities) : null;
  const hasQualification = qualResult !== null;

  const salesData = await getSalesForProject(db, projectId);
  const hasSales = salesData !== null;
  let salesCounts: SalesByEntity = { matched: new Map(), unattributed: { count: 0, revenue: 0 } };
  if (hasSales && salesData!.length > 0) salesCounts = countSalesByUtm(salesData!, "utmMedium", entities);

  const adsets = adsetInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const entityLeads = hasCrm ? (leadCounts.matched.get(a.adset_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(a.adset_id) ?? 0) : null;
    const saleData = hasSales ? (salesCounts.matched.get(a.adset_id) ?? { count: 0, revenue: 0 }) : null;

    return buildAnalyticsRow(a.adset_id, a.adset_name, spend, impressions, clicks, entityLeads, qualLeads, saleData);
  });

  return { adsets, unattributedLeads: leadCounts.unattributed, unattributedSales: salesCounts.unattributed, hasCrm, hasQualification, hasSales };
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
  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = adInsights.map((a) => ({ id: a.ad_id, name: a.ad_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) leadCounts = countLeadsByUtm(leads!, "utmContent", entities);

  const qualResult = hasCrm && leads!.length > 0 ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmContent", entities) : null;
  const hasQualification = qualResult !== null;

  const salesData = await getSalesForProject(db, projectId);
  const hasSales = salesData !== null;
  let salesCounts: SalesByEntity = { matched: new Map(), unattributed: { count: 0, revenue: 0 } };
  if (hasSales && salesData!.length > 0) salesCounts = countSalesByUtm(salesData!, "utmContent", entities);

  const ads = adInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const entityLeads = hasCrm ? (leadCounts.matched.get(a.ad_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(a.ad_id) ?? 0) : null;
    const saleData = hasSales ? (salesCounts.matched.get(a.ad_id) ?? { count: 0, revenue: 0 }) : null;

    return { ...buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, entityLeads, qualLeads, saleData), creative: null as MetaAdCreative | null, videoMetrics: a.videoMetrics ?? null };
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

  return { ads, unattributedLeads: leadCounts.unattributed, unattributedSales: salesCounts.unattributed, hasCrm, hasQualification, hasSales };
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

  // Get leads/qualification/sales data
  const leads = await getLeadsForProject(db, projectId);
  const entities = allAds.map((a) => ({ id: a.ad_id, name: a.ad_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (leads && leads.length > 0) leadCounts = countLeadsByUtm(leads, "utmContent", entities);

  const qualResult = leads && leads.length > 0
    ? await getQualifiedLeadsByEntity(db, projectId, leads, "utmContent", entities)
    : null;

  const salesData = await getSalesForProject(db, projectId);
  let salesCounts: SalesByEntity = { matched: new Map(), unattributed: { count: 0, revenue: 0 } };
  if (salesData && salesData.length > 0) salesCounts = countSalesByUtm(salesData, "utmContent", entities);

  // Build analytics rows for all ads
  const ads: TopPerformerAd[] = allAds.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const entityLeads = leads ? (leadCounts.matched.get(a.ad_id) ?? 0) : null;
    const qualLeads = qualResult ? (qualResult.matched.get(a.ad_id) ?? 0) : null;
    const saleData = salesData ? (salesCounts.matched.get(a.ad_id) ?? { count: 0, revenue: 0 }) : null;

    const row = buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, entityLeads, qualLeads, saleData);
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

  // Get leads/qualification/sales
  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = allAdsets.map((a) => ({ id: a.adset_id, name: a.adset_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) leadCounts = countLeadsByUtm(leads!, "utmMedium", entities);

  const qualResult = hasCrm && leads!.length > 0 ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmMedium", entities) : null;
  const hasQualification = qualResult !== null;

  const salesData = await getSalesForProject(db, projectId);
  const hasSales = salesData !== null;
  let salesCounts: SalesByEntity = { matched: new Map(), unattributed: { count: 0, revenue: 0 } };
  if (hasSales && salesData!.length > 0) salesCounts = countSalesByUtm(salesData!, "utmMedium", entities);

  const adsets = allAdsets.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const entityLeads = hasCrm ? (leadCounts.matched.get(a.adset_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(a.adset_id) ?? 0) : null;
    const saleData = hasSales ? (salesCounts.matched.get(a.adset_id) ?? { count: 0, revenue: 0 }) : null;

    const row = buildAnalyticsRow(a.adset_id, a.adset_name, spend, impressions, clicks, entityLeads, qualLeads, saleData);
    return { ...row, parentCampaignName: a.parentCampaignName };
  });

  const result: AllAdSetsResult = { adsets, hasCrm, hasQualification, hasSales };
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
