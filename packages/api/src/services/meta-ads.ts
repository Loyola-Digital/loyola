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

export function decryptAccountToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
