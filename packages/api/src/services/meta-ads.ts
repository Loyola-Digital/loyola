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
  actions?: { action_type: string; value: string }[];
}

export interface MetaAdSetInsight extends MetaDailyInsight {
  adset_id: string;
  adset_name: string;
  campaign_id?: string;
  campaign_name?: string;
  actions?: { action_type: string; value: string }[];
}

export interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplay: number;
}

export interface MetaAdInsight extends MetaDailyInsight {
  ad_id: string;
  ad_name: string;
  videoMetrics?: VideoMetrics | null;
  actions?: { action_type: string; value: string }[];
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
      { field: "campaign.id", operator: "EQUAL", value: campaignId },
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
      { field: "adset.id", operator: "EQUAL", value: adsetId },
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
    JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }])
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
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,campaign_id,campaign_name,actions&date_preset=${datePreset}&level=campaign`,
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
      { field: "campaign.id", operator: "EQUAL", value: campaignId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdSetInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,adset_id,adset_name,actions&date_preset=${datePreset}&level=adset&filtering=${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAllAdSetInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaAdSetInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const fields = "impressions,reach,clicks,spend,ctr,cpc,cpm,adset_id,adset_name,campaign_id,campaign_name,actions";

  type PageResponse = { data: MetaAdSetInsight[]; paging?: { next?: string } };
  const allResults: MetaAdSetInsight[] = [];
  let nextPath: string | null = `/act_${metaAccountId}/insights?fields=${fields}&date_preset=${datePreset}&level=adset&limit=200`;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      checkRateLimit();
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }
    allResults.push(...(res.data ?? []));
    const nextUrl = res.paging?.next;
    if (nextUrl && allResults.length < 500) {
      nextPath = nextUrl;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }
  return allResults;
}

interface RawAdInsight extends MetaDailyInsight {
  ad_id: string;
  ad_name: string;
  actions?: { action_type: string; value: string }[];
  video_p25_watched_actions?: { action_type: string; value: string }[];
  video_p50_watched_actions?: { action_type: string; value: string }[];
  video_p75_watched_actions?: { action_type: string; value: string }[];
  video_p100_watched_actions?: { action_type: string; value: string }[];
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
}

function parseVideoAction(actions?: { action_type: string; value: string }[]): number {
  if (!actions || actions.length === 0) return 0;
  return parseInt(actions[0].value, 10) || 0;
}

function extractVideoMetrics(raw: RawAdInsight): VideoMetrics | null {
  const p25 = parseVideoAction(raw.video_p25_watched_actions);
  const p50 = parseVideoAction(raw.video_p50_watched_actions);
  const p75 = parseVideoAction(raw.video_p75_watched_actions);
  const p100 = parseVideoAction(raw.video_p100_watched_actions);
  const thruplay = parseVideoAction(raw.video_thruplay_watched_actions);
  if (p25 === 0 && p50 === 0 && p75 === 0 && p100 === 0) return null;
  return { p25, p50, p75, p100, thruplay };
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
      { field: "adset.id", operator: "EQUAL", value: adsetId },
    ])
  );
  const res = await fetchMeta<{ data: RawAdInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,ad_id,ad_name,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions&date_preset=${datePreset}&level=ad&filtering=${filtering}`,
    accessToken
  );
  return (res.data ?? []).map((raw) => ({
    ...raw,
    videoMetrics: extractVideoMetrics(raw),
  }));
}

// ============================================================
// ALL ADS — FLAT QUERY (Story 9.1)
// ============================================================
// Fetches ALL ads at account level in a single paginated call.
// This works for Advantage+ (ASC) campaigns that don't have
// traditional campaign→adset→ad hierarchy.

interface RawAllAdInsight extends RawAdInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  actions?: { action_type: string; value: string }[];
}

export interface AllAdInsight extends MetaAdInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  actions?: { action_type: string; value: string }[];
}

export async function fetchAllAdInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30,
  campaignId?: string
): Promise<AllAdInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";

  const filterPart = campaignId
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]))}`
    : "";

  const fields = "impressions,reach,clicks,spend,ctr,cpc,cpm,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions";

  // Paginate — Meta defaults to 25 results per page
  type PageResponse = { data: RawAllAdInsight[]; paging?: { next?: string } };
  const allResults: AllAdInsight[] = [];
  let nextPath: string | null = `/act_${metaAccountId}/insights?fields=${fields}&date_preset=${datePreset}&level=ad&limit=200${filterPart}`;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      // Subsequent pages: Meta returns full absolute URL with token already included
      checkRateLimit();
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }

    for (const raw of res.data ?? []) {
      allResults.push({
        ...raw,
        videoMetrics: extractVideoMetrics(raw),
      });
    }

    // Meta returns full absolute URL for next page (may use different API version)
    const nextUrl: string | undefined = res.paging?.next;
    if (nextUrl && allResults.length < 500) {
      nextPath = nextUrl;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }

  return allResults;
}

// ============================================================
// PLACEMENT BREAKDOWN (Story 8.7)
// ============================================================

export interface MetaPlacementInsight {
  publisher_platform: string;
  platform_position: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
}

export async function fetchPlacementBreakdown(
  metaAccountId: string,
  accessToken: string,
  days: number = 30,
  campaignId?: string
): Promise<MetaPlacementInsight[]> {
  const datePreset =
    days <= 7 ? "last_7d" : days <= 14 ? "last_14d" : days <= 30 ? "last_30d" : "last_90d";
  const filtering = campaignId
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]))}`
    : "";
  const level = campaignId ? "campaign" : "account";
  const res = await fetchMeta<{ data: MetaPlacementInsight[] }>(
    `/act_${metaAccountId}/insights?fields=spend,impressions,clicks,ctr,cpc,cpm,actions&breakdowns=publisher_platform,platform_position&date_preset=${datePreset}&level=${level}${filtering}`,
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
  creative?: MetaCreativeRaw & {
    effective_image_url?: string;
    object_story_spec?: { link_data?: { picture?: string } };
  };
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

  // Batch via Meta ?ids= endpoint: 1 request per 50 ads instead of 50 requests
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    batches.push(uncachedIds.slice(i, i + BATCH_SIZE));
  }

  // Run all batches in parallel
  const batchPromises = batches.map(async (batch) => {
    const batchResults: MetaAdCreative[] = [];
    try {
      const idsParam = batch.join(",");
      const data = await fetchMeta<Record<string, MetaAdWithCreative>>(
        `/?ids=${idsParam}&fields=id,creative{thumbnail_url,image_url,effective_image_url,object_story_spec{link_data{picture}},title,body,link_url,call_to_action_type,object_type,video_id}`,
        accessToken
      );
      for (const adId of batch) {
        const ad = data[adId];
        const c = ad?.creative;
        const hiResImage = c?.effective_image_url
          ?? c?.object_story_spec?.link_data?.picture
          ?? c?.image_url
          ?? null;
        const creative: MetaAdCreative = {
          adId,
          thumbnailUrl: c?.thumbnail_url ?? null,
          imageUrl: hiResImage,
          title: c?.title ?? null,
          body: c?.body ?? null,
          linkUrl: c?.link_url ?? null,
          ctaType: c?.call_to_action_type ?? null,
          objectType: c?.object_type ?? null,
          videoId: c?.video_id ?? null,
        };
        setCachedCreative(creative);
        batchResults.push(creative);
      }
    } catch {
      // Graceful fallback — return null creatives for all ads in batch
      for (const adId of batch) {
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
        batchResults.push(creative);
      }
    }
    return batchResults;
  });

  const allBatchResults = await Promise.all(batchPromises);
  for (const batch of allBatchResults) {
    results.push(...batch);
  }

  return results;
}

// ============================================================
// VIDEO SOURCE (Story 9.5)
// ============================================================

interface VideoSourceResult {
  sourceUrl: string | null;
  embedHtml: string | null;
  permalinkUrl: string | null;
  picture: string | null;
}

const videoSourceCache = new Map<string, { data: VideoSourceResult; timestamp: number }>();
const VIDEO_SOURCE_TTL = 60 * 60 * 1000; // 1h (embed URLs are stable)

export async function fetchVideoSource(
  videoId: string,
  accessToken: string
): Promise<VideoSourceResult> {
  const cached = videoSourceCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < VIDEO_SOURCE_TTL) {
    return cached.data;
  }

  const empty: VideoSourceResult = { sourceUrl: null, embedHtml: null, permalinkUrl: null, picture: null };

  try {
    const data = await fetchMeta<{
      source?: string;
      embed_html?: string;
      permalink_url?: string;
      picture?: string;
    }>(
      `/${videoId}?fields=source,embed_html,permalink_url,picture`,
      accessToken
    );

    const result: VideoSourceResult = {
      sourceUrl: data.source ?? null,
      embedHtml: data.embed_html ?? null,
      permalinkUrl: data.permalink_url ? `https://www.facebook.com${data.permalink_url}` : null,
      picture: data.picture ?? null,
    };

    videoSourceCache.set(videoId, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return empty;
  }
}

export function decryptAccountToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
