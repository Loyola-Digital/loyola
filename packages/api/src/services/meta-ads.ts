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

export function decryptAccountToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
