import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ============================================================
// RATE LIMITER (per-process, same pattern as instagram.ts)
// ============================================================

let requestCount = 0;
let windowStart = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= RATE_LIMIT_MAX) {
    throw new Error("Meta Ads API rate limit exceeded. Try again later.");
  }
  requestCount++;
}

// ============================================================
// TYPES
// ============================================================

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaInsight {
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  date_start: string;
  date_stop: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  bid_amount?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: { id: string };
}

export interface MetaDailyInsight {
  date_start: string;
  date_stop: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
}

export interface MetaCampaignInsight extends MetaDailyInsight {
  campaign_id: string;
  campaign_name: string;
}

export interface MetaAdSetInsight extends MetaDailyInsight {
  adset_id: string;
  adset_name: string;
}

export interface MetaAdInsight extends MetaDailyInsight {
  ad_id: string;
  ad_name: string;
}

// ============================================================
// AD CREATIVE TYPES (Story 8.1)
// ============================================================

export interface MetaAdCreative {
  adId: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  ctaType: string | null;
  objectType: string | null;
  videoId: string | null;
}

// ============================================================
// CORE FETCH
// ============================================================

async function fetchMeta<T>(path: string, token: string): Promise<T> {
  checkRateLimit();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${GRAPH_API_BASE}${path}${separator}access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    const err = data as GraphApiError;
    throw new Error(
      err?.error?.message ?? `Meta API error: ${res.status}`
    );
  }
  return data as T;
}

// ============================================================
// PUBLIC API
// ============================================================

export async function validateMetaAdAccount(
  metaAccountId: string,
  accessToken: string
): Promise<MetaAdAccount> {
  return fetchMeta<MetaAdAccount>(
    `/act_${metaAccountId}?fields=id,name,account_id,account_status,currency,timezone_name`,
    accessToken
  );
}

export async function fetchCampaigns(
  metaAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  const res = await fetchMeta<{ data: MetaCampaign[] }>(
    `/act_${metaAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&limit=100`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaInsight[]> {
  const datePreset = days <= 7 ? "last_7d" : days <= 30 ? "last_30d" : "last_90d";
  const res = await fetchMeta<{ data: MetaInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm&date_preset=${datePreset}&level=account`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAdSets(
  metaAccountId: string,
  accessToken: string,
  campaignId: string
): Promise<MetaAdSet[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "campaign_id", operator: "EQUAL", value: campaignId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdSet[] }>(
    `/act_${metaAccountId}/adsets?fields=id,name,status,daily_budget,bid_amount&filtering=${filtering}&limit=100`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAds(
  metaAccountId: string,
  accessToken: string,
  adsetId: string
): Promise<MetaAd[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "adset_id", operator: "EQUAL", value: adsetId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAd[] }>(
    `/act_${metaAccountId}/ads?fields=id,name,status,creative{id}&filtering=${filtering}&limit=100`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchDailyInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaDailyInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const res = await fetchMeta<{ data: MetaDailyInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm&date_preset=${datePreset}&time_increment=1&level=account`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchCampaignDailyInsights(
  metaAccountId: string,
  accessToken: string,
  campaignId: string,
  days: number = 30
): Promise<MetaDailyInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "campaign_id", operator: "EQUAL", value: campaignId }])
  );
  const res = await fetchMeta<{ data: MetaDailyInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm&date_preset=${datePreset}&time_increment=1&level=campaign&filtering=${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchCampaignInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaCampaignInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const res = await fetchMeta<{ data: MetaCampaignInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,campaign_id,campaign_name&date_preset=${datePreset}&level=campaign`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAdSetInsights(
  metaAccountId: string,
  accessToken: string,
  campaignId: string,
  days: number = 30
): Promise<MetaAdSetInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "campaign_id", operator: "EQUAL", value: campaignId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdSetInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,adset_id,adset_name&date_preset=${datePreset}&level=adset&filtering=${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAdInsights(
  metaAccountId: string,
  accessToken: string,
  adsetId: string,
  days: number = 30
): Promise<MetaAdInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "adset_id", operator: "EQUAL", value: adsetId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,ad_id,ad_name&date_preset=${datePreset}&level=ad&filtering=${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

// ============================================================
// AD CREATIVES (Story 8.1)
// ============================================================

const CREATIVE_CACHE_TTL = 60 * 60 * 1000; // 1h

interface CreativeCacheEntry {
  data: MetaAdCreative;
  timestamp: number;
}

const creativeCache = new Map<string, CreativeCacheEntry>();

function getCachedCreative(adId: string): MetaAdCreative | undefined {
  const entry = creativeCache.get(adId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CREATIVE_CACHE_TTL) {
    creativeCache.delete(adId);
    return undefined;
  }
  return entry.data;
}

function setCachedCreative(creative: MetaAdCreative): void {
  creativeCache.set(creative.adId, { data: creative, timestamp: Date.now() });
}

interface MetaCreativeRaw {
  thumbnail_url?: string;
  image_url?: string;
  title?: string;
  body?: string;
  link_url?: string;
  call_to_action_type?: string;
  object_type?: string;
  video_id?: string;
}

interface MetaAdWithCreative {
  id: string;
  creative?: MetaCreativeRaw;
}

export async function fetchAdCreatives(
  metaAccountId: string,
  accessToken: string,
  adIds: string[]
): Promise<MetaAdCreative[]> {
  if (adIds.length === 0) return [];

  // Check cache first, collect uncached
  const results: MetaAdCreative[] = [];
  const uncachedIds: string[] = [];

  for (const adId of adIds) {
    const cached = getCachedCreative(adId);
    if (cached) {
      results.push(cached);
    } else {
      uncachedIds.push(adId);
    }
  }

  if (uncachedIds.length === 0) return results;

  // Batch in groups of 50 (parallel requests with field expansion)
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    batches.push(uncachedIds.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const promises = batch.map(async (adId) => {
      try {
        const data = await fetchMeta<MetaAdWithCreative>(
          `/${adId}?fields=id,creative{thumbnail_url,image_url,title,body,link_url,call_to_action_type,object_type,video_id}`,
          accessToken
        );
        const c = data.creative;
        const creative: MetaAdCreative = {
          adId,
          thumbnailUrl: c?.thumbnail_url ?? null,
          imageUrl: c?.image_url ?? null,
          title: c?.title ?? null,
          body: c?.body ?? null,
          linkUrl: c?.link_url ?? null,
          ctaType: c?.call_to_action_type ?? null,
          objectType: c?.object_type ?? null,
          videoId: c?.video_id ?? null,
        };
        setCachedCreative(creative);
        return creative;
      } catch {
        // Graceful fallback — return null creative
        const creative: MetaAdCreative = {
          adId,
          thumbnailUrl: null,
          imageUrl: null,
          title: null,
          body: null,
          linkUrl: null,
          ctaType: null,
          objectType: null,
          videoId: null,
        };
        setCachedCreative(creative);
        return creative;
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  return results;
}

export function decryptAccountToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
