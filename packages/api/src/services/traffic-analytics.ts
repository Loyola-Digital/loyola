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
}

export interface OverviewAnalytics {
  totalSpend: number;
  totalLeads: number | null;
  avgCpl: number | null;
  totalQualifiedLeads: number | null;
  avgCplQualified: number | null;
  totalCampaigns: number;
  hasCrm: boolean;
  hasQualification: boolean;
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
    return { totalSpend: 0, totalLeads: null, avgCpl: null, totalQualifiedLeads: null, avgCplQualified: null, totalCampaigns: 0, hasCrm: false, hasQualification: false };
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

  const result: OverviewAnalytics = {
    totalSpend,
    totalLeads,
    avgCpl,
    totalQualifiedLeads,
    avgCplQualified,
    totalCampaigns: campaigns.length,
    hasCrm,
    hasQualification,
  };

  setCache(cacheKey, result);
  return result;
}

export async function getProjectCampaignAnalytics(
  db: Database,
  projectId: string,
  days: number
): Promise<{ campaigns: CampaignAnalytics[]; unattributedLeads: number; hasCrm: boolean; hasQualification: boolean }> {
  const cacheKey = `analytics:${projectId}:campaigns:${days}`;
  const cached = getCached<{ campaigns: CampaignAnalytics[]; unattributedLeads: number; hasCrm: boolean; hasQualification: boolean }>(cacheKey);
  if (cached) return cached;

  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { campaigns: [], unattributedLeads: 0, hasCrm: false, hasQualification: false };
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

  const campaigns: CampaignAnalytics[] = campaignInsights.map((c) => {
    const spend = parseFloat(c.spend || "0");
    const impressions = parseFloat(c.impressions || "0");
    const clicks = parseFloat(c.clicks || "0");
    const campaignLeads = hasCrm ? (leadCounts.matched.get(c.campaign_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(c.campaign_id) ?? 0) : null;

    return {
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      spend,
      impressions,
      clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
      leads: campaignLeads,
      cpl: campaignLeads !== null && campaignLeads > 0 ? spend / campaignLeads : null,
      qualifiedLeads: qualLeads,
      cplQualified: qualLeads !== null && qualLeads > 0 ? spend / qualLeads : null,
      qualificationRate: qualLeads !== null && campaignLeads !== null && campaignLeads > 0
        ? (qualLeads / campaignLeads) * 100
        : null,
    };
  });

  const result = { campaigns, unattributedLeads: leadCounts.unattributed, hasCrm, hasQualification };
  setCache(cacheKey, result);
  return result;
}

export async function getProjectAdSetAnalytics(
  db: Database,
  projectId: string,
  campaignId: string,
  days: number
): Promise<{ adsets: CampaignAnalytics[]; unattributedLeads: number; hasCrm: boolean; hasQualification: boolean }> {
  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { adsets: [], unattributedLeads: 0, hasCrm: false, hasQualification: false };
  }

  const adsetInsights = await fetchAdSetInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    campaignId,
    days
  );

  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = adsetInsights.map((a) => ({ id: a.adset_id, name: a.adset_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) {
    leadCounts = countLeadsByUtm(leads!, "utmMedium", entities);
  }

  const qualResult = hasCrm && leads!.length > 0
    ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmMedium", entities)
    : null;
  const hasQualification = qualResult !== null;

  const adsets = adsetInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const adsetLeads = hasCrm ? (leadCounts.matched.get(a.adset_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(a.adset_id) ?? 0) : null;

    return {
      campaignId: a.adset_id,
      campaignName: a.adset_name,
      spend, impressions, clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
      leads: adsetLeads,
      cpl: adsetLeads !== null && adsetLeads > 0 ? spend / adsetLeads : null,
      qualifiedLeads: qualLeads,
      cplQualified: qualLeads !== null && qualLeads > 0 ? spend / qualLeads : null,
      qualificationRate: qualLeads !== null && adsetLeads !== null && adsetLeads > 0 ? (qualLeads / adsetLeads) * 100 : null,
    };
  });

  return { adsets, unattributedLeads: leadCounts.unattributed, hasCrm, hasQualification };
}

export async function getProjectAdAnalytics(
  db: Database,
  projectId: string,
  adsetId: string,
  days: number
): Promise<{ ads: CampaignAnalytics[]; unattributedLeads: number; hasCrm: boolean; hasQualification: boolean }> {
  const metaAccount = await getMetaAccountForProject(db, projectId);
  if (!metaAccount) {
    return { ads: [], unattributedLeads: 0, hasCrm: false, hasQualification: false };
  }

  const adInsights = await fetchAdInsights(
    metaAccount.metaAccountId,
    metaAccount.accessToken,
    adsetId,
    days
  );

  const leads = await getLeadsForProject(db, projectId);
  const hasCrm = leads !== null;
  const entities = adInsights.map((a) => ({ id: a.ad_id, name: a.ad_name }));

  let leadCounts: LeadsByEntity = { matched: new Map(), unattributed: 0 };
  if (hasCrm && leads!.length > 0) {
    leadCounts = countLeadsByUtm(leads!, "utmContent", entities);
  }

  const qualResult = hasCrm && leads!.length > 0
    ? await getQualifiedLeadsByEntity(db, projectId, leads!, "utmContent", entities)
    : null;
  const hasQualification = qualResult !== null;

  const ads = adInsights.map((a) => {
    const spend = parseFloat(a.spend || "0");
    const impressions = parseFloat(a.impressions || "0");
    const clicks = parseFloat(a.clicks || "0");
    const adLeads = hasCrm ? (leadCounts.matched.get(a.ad_id) ?? 0) : null;
    const qualLeads = hasQualification ? (qualResult.matched.get(a.ad_id) ?? 0) : null;

    return {
      campaignId: a.ad_id,
      campaignName: a.ad_name,
      spend, impressions, clicks,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend * 1000) / impressions : 0,
      leads: adLeads,
      cpl: adLeads !== null && adLeads > 0 ? spend / adLeads : null,
      qualifiedLeads: qualLeads,
      cplQualified: qualLeads !== null && qualLeads > 0 ? spend / qualLeads : null,
      qualificationRate: qualLeads !== null && adLeads !== null && adLeads > 0 ? (qualLeads / adLeads) * 100 : null,
    };
  });

  return { ads, unattributedLeads: leadCounts.unattributed, hasCrm, hasQualification };
}
