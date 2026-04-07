import { decrypt } from "./encryption.js";

const YOUTUBE_DATA_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// ============================================================
// OAUTH
// ============================================================

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export function getYouTubeOAuthUrl(redirectUri: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_ADS_CLIENT_ID nao configurado");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth nao configurado");

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Falha ao trocar code: ${err}`);
  }

  const data = (await res.json()) as { access_token: string; refresh_token?: string };
  if (!data.refresh_token) {
    throw new Error("Refresh token nao retornado. Revogue o acesso em myaccount.google.com e reconecte.");
  }

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

// ============================================================
// TOKEN REFRESH
// ============================================================

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getYouTubeAccessToken(refreshToken: string, channelId: string): Promise<string> {
  const cached = tokenCache.get(channelId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth nao configurado");

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

  if (!res.ok) throw new Error(`Falha ao renovar token YouTube: ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(channelId, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

// ============================================================
// YOUTUBE DATA API — CHANNELS
// ============================================================

export interface YouTubeChannelInfo {
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
}

export async function listMyChannels(accessToken: string): Promise<YouTubeChannelInfo[]> {
  const res = await fetch(
    `${YOUTUBE_DATA_API}/channels?part=snippet,statistics&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error(`YouTube Data API error: ${await res.text()}`);

  const data = (await res.json()) as {
    items?: {
      id: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string };
    }[];
  };

  return (data.items ?? []).map((ch) => ({
    channelId: ch.id,
    channelName: ch.snippet?.title ?? ch.id,
    thumbnailUrl: ch.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0", 10),
  }));
}

// ============================================================
// YOUTUBE DATA API — VIDEOS
// ============================================================

export interface YouTubeVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export async function listChannelVideos(
  accessToken: string,
  channelId: string,
  maxResults: number = 20
): Promise<YouTubeVideo[]> {
  // Step 1: Search for videos
  const searchRes = await fetch(
    `${YOUTUBE_DATA_API}/search?part=snippet&channelId=${channelId}&order=date&maxResults=${maxResults}&type=video`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) throw new Error(`YouTube search error: ${await searchRes.text()}`);

  const searchData = (await searchRes.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string; publishedAt?: string } }[];
  };

  const videoIds = (searchData.items ?? [])
    .map((i) => i.id?.videoId)
    .filter(Boolean) as string[];

  if (videoIds.length === 0) return [];

  // Step 2: Get statistics
  let statsMap = new Map<string, { viewCount?: string; likeCount?: string; commentCount?: string }>();
  try {
    const statsRes = await fetch(
      `${YOUTUBE_DATA_API}/videos?part=statistics&id=${videoIds.join(",")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (statsRes.ok) {
      const statsData = (await statsRes.json()) as {
        items?: { id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[];
      };
      statsMap = new Map(
        (statsData.items ?? []).map((v) => [v.id, v.statistics ?? {}])
      );
    } else {
      console.error("[youtube] Failed to fetch video stats:", statsRes.status, await statsRes.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[youtube] Stats fetch error:", err);
  }

  return (searchData.items ?? []).map((item) => {
    const vid = item.id?.videoId ?? "";
    const stats = statsMap.get(vid);
    return {
      videoId: vid,
      title: item.snippet?.title ?? "",
      thumbnailUrl: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
      publishedAt: item.snippet?.publishedAt ?? "",
      viewCount: parseInt(stats?.viewCount ?? "0", 10),
      likeCount: parseInt(stats?.likeCount ?? "0", 10),
      commentCount: parseInt(stats?.commentCount ?? "0", 10),
    };
  });
}

// ============================================================
// YOUTUBE ANALYTICS API — CHANNEL OVERVIEW
// ============================================================

export interface YouTubeChannelOverview {
  totalViews: number;
  watchTimeHours: number;
  subscribersGained: number;
  subscribersLost: number;
  netSubscribers: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgRetention: number;
}

export async function fetchChannelOverview(
  accessToken: string,
  days: number
): Promise<YouTubeChannelOverview> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares,averageViewPercentage",
  });

  const url = `${YOUTUBE_ANALYTICS_API}/reports?${params.toString()}`;
  console.log("[youtube-analytics] overview request:", url.replace(/access_token=[^&]+/, "access_token=***"));

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[youtube-analytics] overview error:", res.status, errText);
    throw new Error(`YouTube Analytics error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: number[][] };
  console.log("[youtube-analytics] overview columns:", data.columnHeaders?.map((c) => c.name));
  console.log("[youtube-analytics] overview rows:", data.rows?.length ?? 0);

  const row = data.rows?.[0] ?? [0, 0, 0, 0, 0, 0, 0, 0];

  return {
    totalViews: row[0] ?? 0,
    watchTimeHours: Math.round((row[1] ?? 0) / 60),
    subscribersGained: row[2] ?? 0,
    subscribersLost: row[3] ?? 0,
    netSubscribers: (row[2] ?? 0) - (row[3] ?? 0),
    totalLikes: row[4] ?? 0,
    totalComments: row[5] ?? 0,
    totalShares: row[6] ?? 0,
    avgRetention: row[7] ?? 0,
  };
}

// ============================================================
// YOUTUBE ANALYTICS — DAILY INSIGHTS
// ============================================================

export interface YouTubeDailyInsight {
  date: string;
  views: number;
  watchTimeMinutes: number;
  subscribersGained: number;
}

export async function fetchDailyInsights(
  accessToken: string,
  days: number
): Promise<YouTubeDailyInsight[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    metrics: "views,estimatedMinutesWatched,subscribersGained",
    dimensions: "day",
    sort: "day",
  });

  const res = await fetch(`${YOUTUBE_ANALYTICS_API}/reports?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[youtube-analytics] daily error:", res.status, errText);
    throw new Error(`YouTube Analytics daily error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { rows?: (string | number)[][] };
  return (data.rows ?? []).map((row) => ({
    date: String(row[0]),
    views: Number(row[1] ?? 0),
    watchTimeMinutes: Number(row[2] ?? 0),
    subscribersGained: Number(row[3] ?? 0),
  }));
}

// ============================================================
// DECRYPT
// ============================================================

export function decryptYouTubeToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}
