import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageOrganicPosts,
  funnelStages,
  funnels,
  projects,
  projectMembers,
  youtubeChannels,
  youtubeChannelProjects,
  instagramAccounts,
  instagramAccountProjects,
} from "../db/schema.js";
import { decryptYouTubeToken, getYouTubeAccessToken } from "../services/youtube.js";
import { decrypt } from "../services/encryption.js";
import type {
  OrganicPostSource,
  OrganicPostHydration,
  YouTubeOrganicMetrics,
  InstagramOrganicMetrics,
} from "@loyola-x/shared";

// ============================================================
// SCHEMAS
// ============================================================

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const linkParamsSchema = stageParamsSchema.extend({
  linkId: z.string().uuid(),
});

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const linksQuerySchema = z.object({
  source: z.enum(["youtube", "instagram"]),
});

const createBodySchema = z.object({
  source: z.enum(["youtube", "instagram"]),
  externalId: z.string().min(1).max(100),
});

// ============================================================
// HYDRATION CACHE (5min TTL, in-memory)
// ============================================================

type CacheEntry = { hydration: OrganicPostHydration | null; expiresAt: number };
const HYDRATION_CACHE_TTL_MS = 5 * 60 * 1000;
const hydrationCache = new Map<string, CacheEntry>();

function cacheKey(source: OrganicPostSource, externalId: string): string {
  return `${source}:${externalId}`;
}

function readCache(source: OrganicPostSource, externalId: string): CacheEntry | null {
  const entry = hydrationCache.get(cacheKey(source, externalId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    hydrationCache.delete(cacheKey(source, externalId));
    return null;
  }
  return entry;
}

function writeCache(
  source: OrganicPostSource,
  externalId: string,
  hydration: OrganicPostHydration | null,
): void {
  hydrationCache.set(cacheKey(source, externalId), {
    hydration,
    expiresAt: Date.now() + HYDRATION_CACHE_TTL_MS,
  });
}

// ============================================================
// HYDRATION — YOUTUBE
// ============================================================

interface YouTubeVideoStat {
  id: string;
  snippet?: { title?: string; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

async function fetchYouTubeVideosByIds(
  accessToken: string,
  videoIds: string[],
): Promise<Map<string, YouTubeVideoStat>> {
  if (videoIds.length === 0) return new Map();
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    return new Map();
  }
  const data = (await res.json()) as { items?: YouTubeVideoStat[] };
  const map = new Map<string, YouTubeVideoStat>();
  for (const v of data.items ?? []) {
    map.set(v.id, v);
  }
  return map;
}

function buildYouTubeMetricsZero(): YouTubeOrganicMetrics {
  return {
    viewCount: null,
    likeCount: null,
    commentCount: null,
    watchTimeMinutes: null,
    avgRetention: null,
  };
}

function buildYouTubeHydration(
  externalId: string,
  v: YouTubeVideoStat | undefined,
): OrganicPostHydration {
  if (!v) {
    return {
      isStale: true,
      title: null,
      thumbnailUrl: null,
      externalUrl: `https://www.youtube.com/watch?v=${externalId}`,
      metrics: buildYouTubeMetricsZero(),
    };
  }
  const title = v.snippet?.title ?? null;
  const thumb =
    v.snippet?.thumbnails?.medium?.url ??
    v.snippet?.thumbnails?.high?.url ??
    `https://img.youtube.com/vi/${externalId}/hqdefault.jpg`;
  const stats = v.statistics ?? {};
  return {
    isStale: false,
    title,
    thumbnailUrl: thumb,
    externalUrl: `https://www.youtube.com/watch?v=${externalId}`,
    metrics: {
      viewCount: stats.viewCount != null ? Number(stats.viewCount) : null,
      likeCount: stats.likeCount != null ? Number(stats.likeCount) : null,
      commentCount: stats.commentCount != null ? Number(stats.commentCount) : null,
      watchTimeMinutes: null,
      avgRetention: null,
    },
  };
}

// ============================================================
// HYDRATION — INSTAGRAM
// ============================================================

interface InstagramMediaFields {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
}

async function fetchInstagramMedia(
  accessToken: string,
  mediaId: string,
): Promise<InstagramMediaFields | null> {
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,like_count,comments_count";
  const res = await fetch(
    `https://graph.instagram.com/v25.0/${mediaId}?fields=${fields}&access_token=${accessToken}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as InstagramMediaFields | { error?: unknown };
  if ("error" in data && data.error) return null;
  return data as InstagramMediaFields;
}

interface InstagramInsightsValue { value?: number }
interface InstagramInsightsEntry { name: string; values?: InstagramInsightsValue[] }

async function fetchInstagramMediaInsights(
  accessToken: string,
  mediaId: string,
  mediaType: string | undefined,
): Promise<{ reach: number | null; impressions: number | null; saved: number | null }> {
  // Insights metrics differ by media type.
  // Use a conservative set that works for IMAGE/CAROUSEL/VIDEO/REELS.
  const metrics = mediaType === "VIDEO" || mediaType === "REELS" ? "reach,saved" : "reach,impressions,saved";
  try {
    const res = await fetch(
      `https://graph.instagram.com/v25.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`,
    );
    if (!res.ok) return { reach: null, impressions: null, saved: null };
    const data = (await res.json()) as { data?: InstagramInsightsEntry[]; error?: unknown };
    if (!data.data) return { reach: null, impressions: null, saved: null };
    const out: { reach: number | null; impressions: number | null; saved: number | null } = {
      reach: null,
      impressions: null,
      saved: null,
    };
    for (const e of data.data) {
      const v = e.values?.[0]?.value ?? null;
      if (e.name === "reach") out.reach = typeof v === "number" ? v : null;
      else if (e.name === "impressions") out.impressions = typeof v === "number" ? v : null;
      else if (e.name === "saved") out.saved = typeof v === "number" ? v : null;
    }
    return out;
  } catch {
    return { reach: null, impressions: null, saved: null };
  }
}

function buildInstagramMetricsZero(): InstagramOrganicMetrics {
  return {
    reach: null,
    impressions: null,
    likeCount: null,
    commentCount: null,
    saved: null,
  };
}

function buildInstagramHydration(
  externalId: string,
  media: InstagramMediaFields | null,
  insights: { reach: number | null; impressions: number | null; saved: number | null } | null,
): OrganicPostHydration {
  if (!media) {
    return {
      isStale: true,
      title: null,
      thumbnailUrl: null,
      externalUrl: `https://www.instagram.com/`,
      metrics: buildInstagramMetricsZero(),
    };
  }
  const caption = media.caption ?? "";
  const title = caption.length > 80 ? `${caption.slice(0, 77)}...` : caption || null;
  const thumb = media.thumbnail_url ?? media.media_url ?? null;
  const externalUrl = media.permalink ?? `https://www.instagram.com/p/${externalId}/`;
  return {
    isStale: false,
    title,
    thumbnailUrl: thumb,
    externalUrl,
    metrics: {
      reach: insights?.reach ?? null,
      impressions: insights?.impressions ?? null,
      likeCount: media.like_count ?? null,
      commentCount: media.comments_count ?? null,
      saved: insights?.saved ?? null,
    },
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function organicPostsRoutes(fastify) {
  // ----- helpers -----

  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async function getStage(stageId: string, funnelId: string, projectId: string) {
    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return stage ?? null;
  }

  async function getProjectYouTubeChannel(projectId: string) {
    const [row] = await fastify.db
      .select({
        id: youtubeChannels.id,
        channelId: youtubeChannels.channelId,
        refreshTokenEncrypted: youtubeChannels.refreshTokenEncrypted,
        refreshTokenIv: youtubeChannels.refreshTokenIv,
      })
      .from(youtubeChannels)
      .innerJoin(
        youtubeChannelProjects,
        eq(youtubeChannelProjects.channelId, youtubeChannels.id),
      )
      .where(eq(youtubeChannelProjects.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  async function getProjectInstagramAccount(projectId: string) {
    const [row] = await fastify.db
      .select({
        id: instagramAccounts.id,
        accessTokenEncrypted: instagramAccounts.accessTokenEncrypted,
        accessTokenIv: instagramAccounts.accessTokenIv,
      })
      .from(instagramAccounts)
      .innerJoin(
        instagramAccountProjects,
        eq(instagramAccountProjects.accountId, instagramAccounts.id),
      )
      .where(eq(instagramAccountProjects.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  async function hydrateYouTubeBatch(
    projectId: string,
    externalIds: string[],
  ): Promise<Map<string, OrganicPostHydration | null>> {
    const result = new Map<string, OrganicPostHydration | null>();
    if (externalIds.length === 0) return result;

    // Cache lookup
    const missing: string[] = [];
    for (const id of externalIds) {
      const cached = readCache("youtube", id);
      if (cached) {
        result.set(id, cached.hydration);
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) return result;

    const channel = await getProjectYouTubeChannel(projectId);
    if (!channel) {
      // No YouTube channel linked: mark all missing as null hydration (not stale per se, but un-hydratable).
      for (const id of missing) {
        result.set(id, null);
      }
      return result;
    }

    let token: string;
    try {
      token = await getYouTubeAccessToken(
        decryptYouTubeToken(channel.refreshTokenEncrypted, channel.refreshTokenIv),
        channel.channelId,
      );
    } catch (err) {
      fastify.log.warn({ err }, "[organic-posts] failed to refresh YouTube token");
      for (const id of missing) result.set(id, null);
      return result;
    }

    const fetched = await fetchYouTubeVideosByIds(token, missing);
    for (const id of missing) {
      const hydration = buildYouTubeHydration(id, fetched.get(id));
      writeCache("youtube", id, hydration);
      result.set(id, hydration);
    }
    return result;
  }

  async function hydrateInstagramBatch(
    projectId: string,
    externalIds: string[],
  ): Promise<Map<string, OrganicPostHydration | null>> {
    const result = new Map<string, OrganicPostHydration | null>();
    if (externalIds.length === 0) return result;

    const missing: string[] = [];
    for (const id of externalIds) {
      const cached = readCache("instagram", id);
      if (cached) {
        result.set(id, cached.hydration);
      } else {
        missing.push(id);
      }
    }
    if (missing.length === 0) return result;

    const account = await getProjectInstagramAccount(projectId);
    if (!account) {
      for (const id of missing) result.set(id, null);
      return result;
    }

    let token: string;
    try {
      token = decrypt(account.accessTokenEncrypted, account.accessTokenIv);
    } catch (err) {
      fastify.log.warn({ err }, "[organic-posts] failed to decrypt IG token");
      for (const id of missing) result.set(id, null);
      return result;
    }

    // Sequential to respect rate limits; per-post fetch + insights.
    for (const id of missing) {
      const media = await fetchInstagramMedia(token, id);
      const insights = media
        ? await fetchInstagramMediaInsights(token, id, media.media_type)
        : null;
      const hydration = buildInstagramHydration(id, media, insights);
      writeCache("instagram", id, hydration);
      result.set(id, hydration);
    }
    return result;
  }

  // ============================================================
  // POST — link organic post to stage
  // ============================================================

  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/organic-posts",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const body = createBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Body invalido" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto nao encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa nao encontrada" });

      try {
        const [row] = await fastify.db
          .insert(stageOrganicPosts)
          .values({
            stageId: params.data.stageId,
            projectId: params.data.projectId,
            source: body.data.source,
            externalId: body.data.externalId,
            createdBy: request.userId,
          })
          .returning();
        return reply.code(201).send(row);
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes("uq_stage_organic_post")) {
          return reply.code(409).send({ error: "already_linked" });
        }
        throw err;
      }
    },
  );

  // ============================================================
  // DELETE — unlink
  // ============================================================

  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/organic-posts/:linkId",
    async (request, reply) => {
      const params = linkParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto nao encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa nao encontrada" });

      const deleted = await fastify.db
        .delete(stageOrganicPosts)
        .where(
          and(
            eq(stageOrganicPosts.id, params.data.linkId),
            eq(stageOrganicPosts.stageId, params.data.stageId),
          ),
        )
        .returning({ id: stageOrganicPosts.id });

      if (deleted.length === 0) return reply.code(404).send({ error: "Vinculo nao encontrado" });
      return reply.code(204).send();
    },
  );

  // ============================================================
  // GET — list links of a stage WITH hydration
  // ============================================================

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/organic-posts",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto nao encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa nao encontrada" });

      const rows = await fastify.db
        .select()
        .from(stageOrganicPosts)
        .where(eq(stageOrganicPosts.stageId, params.data.stageId));

      // Group external_ids by source for batched hydration.
      const ytIds: string[] = [];
      const igIds: string[] = [];
      for (const r of rows) {
        if (r.source === "youtube") ytIds.push(r.externalId);
        else if (r.source === "instagram") igIds.push(r.externalId);
      }

      const [ytMap, igMap] = await Promise.all([
        hydrateYouTubeBatch(params.data.projectId, ytIds),
        hydrateInstagramBatch(params.data.projectId, igIds),
      ]);

      return rows
        .map((r) => ({
          id: r.id,
          stageId: r.stageId,
          projectId: r.projectId,
          source: r.source,
          externalId: r.externalId,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          hydration:
            r.source === "youtube"
              ? (ytMap.get(r.externalId) ?? null)
              : (igMap.get(r.externalId) ?? null),
        }))
        .sort((a, b) => {
          // Most recent first
          const ad = a.createdAt instanceof Date ? a.createdAt.getTime() : Date.parse(String(a.createdAt));
          const bd = b.createdAt instanceof Date ? b.createdAt.getTime() : Date.parse(String(b.createdAt));
          return bd - ad;
        });
    },
  );

  // ============================================================
  // GET (auxiliary) — all links of a project grouped by externalId
  // Used by the Dash Orgânico to mark "already linked to N stages".
  // ============================================================

  fastify.get(
    "/api/projects/:projectId/organic-posts/links",
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const query = linksQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query invalida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto nao encontrado" });

      const rows = await fastify.db
        .select({
          stageId: stageOrganicPosts.stageId,
          externalId: stageOrganicPosts.externalId,
        })
        .from(stageOrganicPosts)
        .where(
          and(
            eq(stageOrganicPosts.projectId, params.data.projectId),
            eq(stageOrganicPosts.source, query.data.source),
          ),
        );

      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        const set = map.get(r.externalId) ?? new Set<string>();
        set.add(r.stageId);
        map.set(r.externalId, set);
      }

      return Array.from(map.entries()).map(([externalId, stageIds]) => ({
        externalId,
        stageIds: Array.from(stageIds),
      }));
    },
  );

});
