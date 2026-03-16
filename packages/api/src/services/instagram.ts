import fp from "fastify-plugin";
import { eq, and, gt } from "drizzle-orm";
import { instagramAccounts, instagramMetricsCache } from "../db/schema.js";
import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Cache TTL in minutes per metric type */
const CACHE_TTL: Record<string, number> = {
  profile: 5,
  post_insights: 15,
  account_insights: 30,
  demographics: 60,
  stories: 5,
  reels: 15,
};

// ============================================================
// TYPES
// ============================================================

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface MediaListResponse {
  data: InstagramMedia[];
  paging?: { cursors?: { after?: string }; next?: string };
}

interface InsightValue {
  value: number | Record<string, unknown>;
  end_time?: string;
}

interface InsightEntry {
  name: string;
  period: string;
  values: InsightValue[];
  title: string;
  description: string;
  id: string;
}

interface InsightsResponse {
  data: InsightEntry[];
}

interface StoryMedia {
  id: string;
  media_type: string;
  media_url?: string;
  timestamp: string;
}

interface StoriesResponse {
  data: StoryMedia[];
}

interface InstagramService {
  validateToken(accessToken: string): Promise<{ id: string; name: string; username: string }>;
  getProfile(accountId: string): Promise<InstagramProfile>;
  getMediaList(accountId: string, limit?: number, after?: string): Promise<{ data: InstagramMedia[]; nextCursor?: string }>;
  getMediaInsights(mediaId: string, accountId: string): Promise<InsightEntry[]>;
  getAccountInsights(accountId: string, period: string, since: number, until: number): Promise<InsightEntry[]>;
  getAudienceDemographics(accountId: string): Promise<InsightEntry[]>;
  getStories(accountId: string): Promise<Array<StoryMedia & { insights?: InsightEntry[] }>>;
  getReels(accountId: string): Promise<{ data: InstagramMedia[]; nextCursor?: string }>;
  invalidateCache(accountId: string, metricType?: string): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    instagramService: InstagramService;
  }
}

// ============================================================
// RATE LIMITER (in-memory)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(tokenHash: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(tokenHash);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(tokenHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    throw new InstagramApiError(
      `Rate limit atingido, tente novamente em ${minutesLeft} minutos`,
      429,
    );
  }

  entry.count++;
  if (entry.count > 180) {
    // Warning zone — logged by caller
  }
}

function hashToken(token: string): string {
  return token.slice(0, 8) + "..." + token.slice(-4);
}

// ============================================================
// ERROR HANDLING
// ============================================================

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public graphCode?: number,
    public graphSubcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

function mapGraphError(err: GraphApiError["error"]): InstagramApiError {
  // Token expired or invalid
  if (err.code === 190) {
    return new InstagramApiError(
      "Token de acesso expirado ou inválido. Renove o token no Meta Business Manager.",
      401,
      err.code,
      err.error_subcode,
    );
  }

  // Permission error
  if (err.code === 10 || err.type === "OAuthException") {
    return new InstagramApiError(
      `Erro de permissão: ${err.message}`,
      403,
      err.code,
      err.error_subcode,
    );
  }

  // Rate limit from Meta side
  if (err.code === 4 || err.code === 32) {
    return new InstagramApiError(
      "Rate limit da Meta atingido. Aguarde alguns minutos.",
      429,
      err.code,
    );
  }

  // Generic
  return new InstagramApiError(
    `Instagram API error: ${err.message}`,
    500,
    err.code,
    err.error_subcode,
  );
}

// ============================================================
// GRAPH FETCH HELPER
// ============================================================

async function graphFetch<T>(path: string, token: string): Promise<T> {
  const tokenHash = hashToken(token);
  checkRateLimit(tokenHash);

  const separator = path.includes("?") ? "&" : "?";
  const url = `${GRAPH_API_BASE}${path}${separator}access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const apiError = data as GraphApiError;
    if (apiError.error) {
      throw mapGraphError(apiError.error);
    }
    throw new InstagramApiError(
      `Instagram API error (${response.status})`,
      response.status,
    );
  }

  return data as T;
}

// ============================================================
// PLUGIN
// ============================================================

export default fp(async function instagramServicePlugin(fastify) {
  // ---- Cache helpers ----

  async function getCachedMetric(
    accountId: string,
    metricType: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<unknown | null> {
    const now = new Date();
    const conditions = [
      eq(instagramMetricsCache.accountId, accountId),
      eq(instagramMetricsCache.metricType, metricType),
      gt(instagramMetricsCache.expiresAt, now),
    ];

    if (periodStart) {
      conditions.push(eq(instagramMetricsCache.periodStart, periodStart));
    }
    if (periodEnd) {
      conditions.push(eq(instagramMetricsCache.periodEnd, periodEnd));
    }

    const rows = await fastify.db
      .select({ metricData: instagramMetricsCache.metricData })
      .from(instagramMetricsCache)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0 ? rows[0].metricData : null;
  }

  async function setCachedMetric(
    accountId: string,
    metricType: string,
    data: unknown,
    ttlMinutes: number,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000);

    await fastify.db
      .insert(instagramMetricsCache)
      .values({
        accountId,
        metricType,
        metricData: data,
        periodStart: periodStart ?? null,
        periodEnd: periodEnd ?? null,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          instagramMetricsCache.accountId,
          instagramMetricsCache.metricType,
          instagramMetricsCache.periodStart,
          instagramMetricsCache.periodEnd,
        ],
        set: {
          metricData: data,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }

  async function invalidateCache(
    accountId: string,
    metricType?: string,
  ): Promise<void> {
    const conditions = [eq(instagramMetricsCache.accountId, accountId)];
    if (metricType) {
      conditions.push(eq(instagramMetricsCache.metricType, metricType));
    }
    await fastify.db
      .delete(instagramMetricsCache)
      .where(and(...conditions));
  }

  // ---- Token decryption helper ----

  async function getDecryptedToken(accountId: string): Promise<{ token: string; igUserId: string }> {
    const rows = await fastify.db
      .select({
        accessTokenEncrypted: instagramAccounts.accessTokenEncrypted,
        accessTokenIv: instagramAccounts.accessTokenIv,
        instagramUserId: instagramAccounts.instagramUserId,
      })
      .from(instagramAccounts)
      .where(eq(instagramAccounts.id, accountId))
      .limit(1);

    if (rows.length === 0) {
      throw new InstagramApiError("Conta Instagram não encontrada", 404);
    }

    const { accessTokenEncrypted, accessTokenIv, instagramUserId } = rows[0];
    const token = decrypt(accessTokenEncrypted, accessTokenIv);
    return { token, igUserId: instagramUserId };
  }

  // ---- API Methods ----

  async function validateToken(
    accessToken: string,
  ): Promise<{ id: string; name: string; username: string }> {
    return graphFetch<{ id: string; name: string; username: string }>(
      "/me?fields=id,name,username",
      accessToken,
    );
  }

  async function getProfile(accountId: string): Promise<InstagramProfile> {
    const cached = await getCachedMetric(accountId, "profile");
    if (cached) return cached as InstagramProfile;

    const { token, igUserId } = await getDecryptedToken(accountId);
    const profile = await graphFetch<InstagramProfile>(
      `/${igUserId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url`,
      token,
    );

    await setCachedMetric(accountId, "profile", profile, CACHE_TTL.profile);
    return profile;
  }

  async function getMediaList(
    accountId: string,
    limit = 25,
    after?: string,
  ): Promise<{ data: InstagramMedia[]; nextCursor?: string }> {
    const { token, igUserId } = await getDecryptedToken(accountId);
    let path = `/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count&limit=${limit}`;
    if (after) path += `&after=${after}`;

    const result = await graphFetch<MediaListResponse>(path, token);
    return {
      data: result.data,
      nextCursor: result.paging?.cursors?.after,
    };
  }

  async function getMediaInsights(
    mediaId: string,
    accountId: string,
  ): Promise<InsightEntry[]> {
    const cacheKey = `post_insights_${mediaId}`;
    const cached = await getCachedMetric(accountId, cacheKey);
    if (cached) return cached as InsightEntry[];

    const { token } = await getDecryptedToken(accountId);
    const result = await graphFetch<InsightsResponse>(
      `/${mediaId}/insights?metric=impressions,reach,likes,comments,saved,shares,plays`,
      token,
    );

    await setCachedMetric(accountId, cacheKey, result.data, CACHE_TTL.post_insights);
    return result.data;
  }

  async function getAccountInsights(
    accountId: string,
    period: string,
    since: number,
    until: number,
  ): Promise<InsightEntry[]> {
    const periodStart = new Date(since * 1000).toISOString().split("T")[0];
    const periodEnd = new Date(until * 1000).toISOString().split("T")[0];

    const cached = await getCachedMetric(accountId, "account_insights", periodStart, periodEnd);
    if (cached) return cached as InsightEntry[];

    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<InsightsResponse>(
      `/${igUserId}/insights?metric=impressions,reach,follower_count,profile_views&period=${period}&since=${since}&until=${until}`,
      token,
    );

    await setCachedMetric(
      accountId,
      "account_insights",
      result.data,
      CACHE_TTL.account_insights,
      periodStart,
      periodEnd,
    );
    return result.data;
  }

  async function getAudienceDemographics(accountId: string): Promise<InsightEntry[]> {
    const cached = await getCachedMetric(accountId, "demographics");
    if (cached) return cached as InsightEntry[];

    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<InsightsResponse>(
      `/${igUserId}/insights?metric=audience_city,audience_country,audience_gender_age&period=lifetime`,
      token,
    );

    await setCachedMetric(accountId, "demographics", result.data, CACHE_TTL.demographics);
    return result.data;
  }

  async function getStories(
    accountId: string,
  ): Promise<Array<StoryMedia & { insights?: InsightEntry[] }>> {
    const cached = await getCachedMetric(accountId, "stories");
    if (cached) return cached as Array<StoryMedia & { insights?: InsightEntry[] }>;

    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<StoriesResponse>(
      `/${igUserId}/stories?fields=id,media_type,media_url,timestamp`,
      token,
    );

    const storiesWithInsights = await Promise.all(
      result.data.map(async (story) => {
        try {
          const insights = await graphFetch<InsightsResponse>(
            `/${story.id}/insights?metric=impressions,reach,replies,exits`,
            token,
          );
          return { ...story, insights: insights.data };
        } catch {
          return { ...story, insights: undefined };
        }
      }),
    );

    await setCachedMetric(accountId, "stories", storiesWithInsights, CACHE_TTL.stories);
    return storiesWithInsights;
  }

  async function getReels(
    accountId: string,
  ): Promise<{ data: InstagramMedia[]; nextCursor?: string }> {
    const cached = await getCachedMetric(accountId, "reels");
    if (cached) return cached as { data: InstagramMedia[]; nextCursor?: string };

    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<MediaListResponse>(
      `/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count&limit=25`,
      token,
    );

    // Filter to only VIDEO/REEL types
    const reels = {
      data: result.data.filter(
        (m) => m.media_type === "VIDEO" || m.media_type === "REEL",
      ),
      nextCursor: result.paging?.cursors?.after,
    };

    await setCachedMetric(accountId, "reels", reels, CACHE_TTL.reels);
    return reels;
  }

  // ---- Decorate Fastify ----

  fastify.decorate("instagramService", {
    validateToken,
    getProfile,
    getMediaList,
    getMediaInsights,
    getAccountInsights,
    getAudienceDemographics,
    getStories,
    getReels,
    invalidateCache,
  });
});
