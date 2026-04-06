import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GOOGLE_ADS_API_VERSION = "v18";
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================
// HELPERS
// ============================================================

/**
 * Strip hyphens from customer ID for API calls (123-456-7890 → 1234567890)
 */
export function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "");
}

/**
 * Format customer ID for display (1234567890 → 123-456-7890)
 */
export function formatCustomerId(customerId: string): string {
  const clean = normalizeCustomerId(customerId);
  if (clean.length !== 10) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
}

// ============================================================
// OAUTH TOKEN REFRESH
// ============================================================

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Simple in-memory token cache (per customer)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(
  refreshToken: string,
  customerId: string
): Promise<string> {
  const cached = tokenCache.get(customerId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  // Google OAuth2 client credentials for token refresh
  // These should come from env in production
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET devem estar configurados no .env");
  }

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Falha ao obter access token do Google: ${error}`);
  }

  const data = (await res.json()) as TokenResponse;
  tokenCache.set(customerId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

// ============================================================
// GOOGLE ADS API FETCH
// ============================================================

interface GoogleAdsSearchResponse {
  results?: Record<string, unknown>[];
  fieldMask?: string;
}

async function queryGoogleAds(
  customerId: string,
  developerToken: string,
  accessToken: string,
  query: string
): Promise<Record<string, unknown>[]> {
  const cid = normalizeCustomerId(customerId);
  const url = `${GOOGLE_ADS_BASE}/customers/${cid}/googleAds:searchStream`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${error}`);
  }

  // searchStream returns array of batches
  const batches = (await res.json()) as { results?: Record<string, unknown>[] }[];
  const results: Record<string, unknown>[] = [];
  for (const batch of batches) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

// ============================================================
// VALIDATION
// ============================================================

export async function validateGoogleAdsAccount(
  customerId: string,
  developerToken: string,
  refreshToken: string
): Promise<string> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const cid = normalizeCustomerId(customerId);

  const results = await queryGoogleAds(
    cid,
    developerToken,
    accessToken,
    `SELECT customer.descriptive_name, customer.id FROM customer LIMIT 1`
  );

  if (!results || results.length === 0) {
    throw new Error("Conta não encontrada ou sem acesso.");
  }

  const customer = results[0].customer as { descriptiveName?: string; id?: string } | undefined;
  return customer?.descriptiveName ?? `Conta ${formatCustomerId(customerId)}`;
}

// ============================================================
// ANALYTICS — OVERVIEW
// ============================================================

export interface GoogleAdsOverview {
  totalSpend: number;
  totalViews: number;
  totalImpressions: number;
  totalClicks: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  costPerConversion: number | null;
  retention: { p25: number; p50: number; p75: number; p100: number };
}

function microsToCurrency(micros: string | number | undefined): number {
  if (!micros) return 0;
  return Number(micros) / 1_000_000;
}

function safeRate(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

export async function fetchGoogleAdsOverview(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  days: number
): Promise<GoogleAdsOverview> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const results = await queryGoogleAds(
    customerId,
    developerToken,
    accessToken,
    `SELECT
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.video_views,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.cost_per_conversion,
      metrics.video_quartile_p25_rate,
      metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate,
      metrics.video_quartile_p100_rate
    FROM customer
    WHERE segments.date BETWEEN '${startStr}' AND '${endStr}'`
  );

  // Aggregate across all rows
  let totalSpend = 0;
  let totalViews = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let p25Sum = 0, p50Sum = 0, p75Sum = 0, p100Sum = 0;
  let rowCount = 0;

  for (const row of results) {
    const m = row.metrics as Record<string, unknown> | undefined;
    if (!m) continue;
    totalSpend += microsToCurrency(m.costMicros as string | number | undefined);
    totalViews += Number(m.videoViews || 0);
    totalImpressions += Number(m.impressions || 0);
    totalClicks += Number(m.clicks || 0);
    totalConversions += Number(m.conversions || 0);
    p25Sum += safeRate(m.videoQuartileP25Rate);
    p50Sum += safeRate(m.videoQuartileP50Rate);
    p75Sum += safeRate(m.videoQuartileP75Rate);
    p100Sum += safeRate(m.videoQuartileP100Rate);
    rowCount++;
  }

  const cpv = totalViews > 0 ? totalSpend / totalViews : null;
  const viewRate = totalImpressions > 0 ? (totalViews / totalImpressions) * 100 : null;
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : null;

  return {
    totalSpend,
    totalViews,
    totalImpressions,
    totalClicks,
    cpv,
    viewRate,
    ctr,
    cpc,
    cpm,
    conversions: totalConversions,
    costPerConversion,
    retention: {
      p25: rowCount > 0 ? p25Sum / rowCount : 0,
      p50: rowCount > 0 ? p50Sum / rowCount : 0,
      p75: rowCount > 0 ? p75Sum / rowCount : 0,
      p100: rowCount > 0 ? p100Sum / rowCount : 0,
    },
  };
}

// ============================================================
// ANALYTICS — DAILY INSIGHTS
// ============================================================

export interface GoogleAdsDailyInsight {
  date: string;
  spend: number;
  views: number;
  impressions: number;
  clicks: number;
}

export async function fetchGoogleAdsDailyInsights(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  days: number,
  campaignId?: string
): Promise<GoogleAdsDailyInsight[]> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const campaignFilter = campaignId
    ? `AND campaign.id = ${campaignId}`
    : "";

  const results = await queryGoogleAds(
    customerId,
    developerToken,
    accessToken,
    `SELECT
      segments.date,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.video_views
    FROM campaign
    WHERE segments.date BETWEEN '${startStr}' AND '${endStr}'
      ${campaignFilter}
    ORDER BY segments.date`
  );

  // Aggregate per date (multiple campaigns may share a date)
  const dateMap = new Map<string, GoogleAdsDailyInsight>();
  for (const row of results) {
    const segments = row.segments as { date?: string } | undefined;
    const m = row.metrics as Record<string, unknown> | undefined;
    const date = segments?.date;
    if (!date || !m) continue;

    const existing = dateMap.get(date) ?? { date, spend: 0, views: 0, impressions: 0, clicks: 0 };
    existing.spend += microsToCurrency(m.costMicros as string | number | undefined);
    existing.views += Number(m.videoViews || 0);
    existing.impressions += Number(m.impressions || 0);
    existing.clicks += Number(m.clicks || 0);
    dateMap.set(date, existing);
  }

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================
// ANALYTICS — CAMPAIGNS LIST
// ============================================================

export interface GoogleAdsCampaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  views: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
}

export async function fetchGoogleAdsCampaigns(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  days: number
): Promise<GoogleAdsCampaign[]> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const results = await queryGoogleAds(
    customerId,
    developerToken,
    accessToken,
    `SELECT
      campaign.id, campaign.name, campaign.status,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.video_views, metrics.ctr, metrics.average_cpc,
      metrics.average_cpm, metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${startStr}' AND '${endStr}'
      AND campaign.status != 'REMOVED'`
  );

  return results.map((row) => {
    const c = row.campaign as { id?: string; name?: string; status?: string } | undefined;
    const m = row.metrics as Record<string, unknown> | undefined;
    const spend = microsToCurrency(m?.costMicros as string | number | undefined);
    const impressions = Number(m?.impressions || 0);
    const clicks = Number(m?.clicks || 0);
    const views = Number(m?.videoViews || 0);

    return {
      id: String(c?.id ?? ""),
      name: String(c?.name ?? ""),
      status: String(c?.status ?? ""),
      spend,
      impressions,
      clicks,
      views,
      cpv: views > 0 ? spend / views : null,
      viewRate: impressions > 0 ? (views / impressions) * 100 : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      conversions: Number(m?.conversions || 0),
    };
  }).sort((a, b) => b.spend - a.spend);
}

// ============================================================
// ANALYTICS — AD GROUPS
// ============================================================

export interface GoogleAdsAdGroup {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  views: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  conversions: number;
}

export async function fetchGoogleAdsAdGroups(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  campaignId: string,
  days: number
): Promise<GoogleAdsAdGroup[]> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const results = await queryGoogleAds(
    customerId, developerToken, accessToken,
    `SELECT
      ad_group.id, ad_group.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.video_views, metrics.conversions
    FROM ad_group
    WHERE campaign.id = ${campaignId}
      AND segments.date BETWEEN '${start.toISOString().slice(0, 10)}' AND '${end.toISOString().slice(0, 10)}'`
  );

  return results.map((row) => {
    const ag = row.adGroup as { id?: string; name?: string } | undefined;
    const m = row.metrics as Record<string, unknown> | undefined;
    const spend = microsToCurrency(m?.costMicros as string | number | undefined);
    const impressions = Number(m?.impressions || 0);
    const clicks = Number(m?.clicks || 0);
    const views = Number(m?.videoViews || 0);
    return {
      id: String(ag?.id ?? ""),
      name: String(ag?.name ?? ""),
      spend, impressions, clicks, views,
      cpv: views > 0 ? spend / views : null,
      viewRate: impressions > 0 ? (views / impressions) * 100 : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      conversions: Number(m?.conversions || 0),
    };
  }).sort((a, b) => b.spend - a.spend);
}

// ============================================================
// ANALYTICS — ADS WITH VIDEO DATA
// ============================================================

export interface GoogleAdsAd {
  id: string;
  name: string;
  type: string;
  spend: number;
  impressions: number;
  clicks: number;
  views: number;
  cpv: number | null;
  viewRate: number | null;
  ctr: number;
  cpc: number;
  conversions: number;
  retention: { p25: number; p50: number; p75: number; p100: number };
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
}

export async function fetchGoogleAdsAds(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  adGroupId: string,
  days: number
): Promise<GoogleAdsAd[]> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const results = await queryGoogleAds(
    customerId, developerToken, accessToken,
    `SELECT
      ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.video_views, metrics.conversions,
      metrics.video_quartile_p25_rate, metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate, metrics.video_quartile_p100_rate
    FROM ad_group_ad
    WHERE ad_group.id = ${adGroupId}
      AND segments.date BETWEEN '${start.toISOString().slice(0, 10)}' AND '${end.toISOString().slice(0, 10)}'`
  );

  // Collect Google Ads video resource names to resolve YouTube IDs
  const ads = results.map((row) => {
    const adData = row.adGroupAd as { ad?: { id?: string; name?: string; type?: string } } | undefined;
    const ad = adData?.ad;
    const m = row.metrics as Record<string, unknown> | undefined;
    const spend = microsToCurrency(m?.costMicros as string | number | undefined);
    const impressions = Number(m?.impressions || 0);
    const clicks = Number(m?.clicks || 0);
    const views = Number(m?.videoViews || 0);
    return {
      id: String(ad?.id ?? ""),
      name: String(ad?.name ?? ""),
      type: String(ad?.type ?? ""),
      spend, impressions, clicks, views,
      cpv: views > 0 ? spend / views : null,
      viewRate: impressions > 0 ? (views / impressions) * 100 : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      conversions: Number(m?.conversions || 0),
      retention: {
        p25: safeRate(m?.videoQuartileP25Rate),
        p50: safeRate(m?.videoQuartileP50Rate),
        p75: safeRate(m?.videoQuartileP75Rate),
        p100: safeRate(m?.videoQuartileP100Rate),
      },
      youtubeVideoId: null as string | null,
      thumbnailUrl: null as string | null,
    };
  }).sort((a, b) => b.spend - a.spend);

  // Try to resolve YouTube video IDs for video ads
  const videoAdIds = ads.filter((a) => a.type.includes("VIDEO")).map((a) => a.id);
  if (videoAdIds.length > 0) {
    try {
      const videoResults = await queryGoogleAds(
        customerId, developerToken, accessToken,
        `SELECT ad_group_ad.ad.id, ad_group_ad.ad.video_ad.video.id
        FROM ad_group_ad
        WHERE ad_group_ad.ad.id IN (${videoAdIds.join(",")})
          AND ad_group_ad.ad.type = 'VIDEO_AD'`
      );
      // Map Google video resource to YouTube video ID
      const googleVideoIds = new Set<string>();
      const adVideoMap = new Map<string, string>();
      for (const row of videoResults) {
        const adData = row.adGroupAd as { ad?: { id?: string; videoAd?: { video?: { id?: string } } } } | undefined;
        const adId = String(adData?.ad?.id ?? "");
        const videoId = String(adData?.ad?.videoAd?.video?.id ?? "");
        if (adId && videoId) {
          adVideoMap.set(adId, videoId);
          googleVideoIds.add(videoId);
        }
      }
      // Resolve Google video IDs to YouTube video IDs
      if (googleVideoIds.size > 0) {
        const ytResults = await queryGoogleAds(
          customerId, developerToken, accessToken,
          `SELECT video.id, video.youtube_video_id
          FROM video
          WHERE video.id IN (${Array.from(googleVideoIds).join(",")})`
        );
        const ytMap = new Map<string, string>();
        for (const row of ytResults) {
          const v = row.video as { id?: string; youtubeVideoId?: string } | undefined;
          if (v?.id && v?.youtubeVideoId) {
            ytMap.set(v.id, v.youtubeVideoId);
          }
        }
        // Assign YouTube IDs and thumbnails to ads
        for (const ad of ads) {
          const googleVideoId = adVideoMap.get(ad.id);
          if (googleVideoId) {
            const ytId = ytMap.get(googleVideoId);
            if (ytId) {
              ad.youtubeVideoId = ytId;
              ad.thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
            }
          }
        }
      }
    } catch {
      // Graceful — ads still returned without video info
    }
  }

  return ads;
}

// ============================================================
// TOP PERFORMERS (for gallery)
// ============================================================

export async function fetchGoogleAdsTopPerformers(
  customerId: string,
  developerToken: string,
  refreshToken: string,
  days: number,
  limit: number = 10
): Promise<GoogleAdsAd[]> {
  const accessToken = await getAccessToken(refreshToken, customerId);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const results = await queryGoogleAds(
    customerId, developerToken, accessToken,
    `SELECT
      ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
      metrics.cost_micros, metrics.impressions, metrics.clicks,
      metrics.video_views, metrics.conversions,
      metrics.video_quartile_p25_rate, metrics.video_quartile_p50_rate,
      metrics.video_quartile_p75_rate, metrics.video_quartile_p100_rate
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${start.toISOString().slice(0, 10)}' AND '${end.toISOString().slice(0, 10)}'
      AND ad_group_ad.ad.type = 'VIDEO_AD'
      AND metrics.impressions > 0
    ORDER BY metrics.video_views DESC
    LIMIT ${limit}`
  );

  const ads: GoogleAdsAd[] = results.map((row) => {
    const adData = row.adGroupAd as { ad?: { id?: string; name?: string; type?: string } } | undefined;
    const ad = adData?.ad;
    const m = row.metrics as Record<string, unknown> | undefined;
    const spend = microsToCurrency(m?.costMicros as string | number | undefined);
    const impressions = Number(m?.impressions || 0);
    const clicks = Number(m?.clicks || 0);
    const views = Number(m?.videoViews || 0);
    return {
      id: String(ad?.id ?? ""),
      name: String(ad?.name ?? ""),
      type: String(ad?.type ?? ""),
      spend, impressions, clicks, views,
      cpv: views > 0 ? spend / views : null,
      viewRate: impressions > 0 ? (views / impressions) * 100 : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      conversions: Number(m?.conversions || 0),
      retention: {
        p25: safeRate(m?.videoQuartileP25Rate),
        p50: safeRate(m?.videoQuartileP50Rate),
        p75: safeRate(m?.videoQuartileP75Rate),
        p100: safeRate(m?.videoQuartileP100Rate),
      },
      youtubeVideoId: null,
      thumbnailUrl: null,
    };
  });

  // Resolve YouTube video IDs in bulk
  const adIds = ads.map((a) => a.id);
  if (adIds.length > 0) {
    try {
      const videoResults = await queryGoogleAds(
        customerId, developerToken, accessToken,
        `SELECT ad_group_ad.ad.id, ad_group_ad.ad.video_ad.video.id
        FROM ad_group_ad
        WHERE ad_group_ad.ad.id IN (${adIds.join(",")})
          AND ad_group_ad.ad.type = 'VIDEO_AD'`
      );
      const googleVideoIds = new Set<string>();
      const adVideoMap = new Map<string, string>();
      for (const row of videoResults) {
        const d = row.adGroupAd as { ad?: { id?: string; videoAd?: { video?: { id?: string } } } } | undefined;
        const aId = String(d?.ad?.id ?? "");
        const vId = String(d?.ad?.videoAd?.video?.id ?? "");
        if (aId && vId) { adVideoMap.set(aId, vId); googleVideoIds.add(vId); }
      }
      if (googleVideoIds.size > 0) {
        const ytResults = await queryGoogleAds(
          customerId, developerToken, accessToken,
          `SELECT video.id, video.youtube_video_id FROM video WHERE video.id IN (${Array.from(googleVideoIds).join(",")})`
        );
        const ytMap = new Map<string, string>();
        for (const row of ytResults) {
          const v = row.video as { id?: string; youtubeVideoId?: string } | undefined;
          if (v?.id && v?.youtubeVideoId) ytMap.set(v.id, v.youtubeVideoId);
        }
        for (const ad of ads) {
          const gvId = adVideoMap.get(ad.id);
          if (gvId) {
            const ytId = ytMap.get(gvId);
            if (ytId) { ad.youtubeVideoId = ytId; ad.thumbnailUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`; }
          }
        }
      }
    } catch { /* graceful */ }
  }

  return ads;
}

// ============================================================
// DECRYPT HELPER
// ============================================================

export function decryptToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
