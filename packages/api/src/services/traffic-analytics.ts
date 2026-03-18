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
  decryptAccountToken,
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

function matchUtm(
  utmValue: string,
  entityName: string,
  entityId: string
): boolean {
  const normalized = normalizeUtm(utmValue);
  if (!normalized) return false;
  return (
    normalized === normalizeUtm(entityName) ||
    normalized === normalizeUtm(entityId)
  );
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
): Promise<{ ads: CampaignAnalytics[]; unattributedLeads: number; unattributedSales: { count: number; revenue: number }; hasCrm: boolean; hasQualification: boolean; hasSales: boolean }> {
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

    return buildAnalyticsRow(a.ad_id, a.ad_name, spend, impressions, clicks, entityLeads, qualLeads, saleData);
  });

  return { ads, unattributedLeads: leadCounts.unattributed, unattributedSales: salesCounts.unattributed, hasCrm, hasQualification, hasSales };
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
