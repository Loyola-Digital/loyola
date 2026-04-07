import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { youtubeChannels, youtubeChannelProjects, projects } from "../db/schema.js";
import { encrypt } from "../services/encryption.js";
import {
  getYouTubeOAuthUrl,
  exchangeYouTubeCode,
  listMyChannels,
  decryptYouTubeToken,
  getYouTubeAccessToken,
  fetchChannelOverview,
  fetchDailyInsights,
  listChannelVideos,
} from "../services/youtube.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const linkParamSchema = z.object({ id: z.string().uuid(), projectId: z.string().uuid() });

export default fp(async function youtubeChannelRoutes(fastify) {

  // ---- GET /api/youtube-channels/auth/url ----
  fastify.get("/api/youtube-channels/auth/url", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const origin = (request.query as { origin?: string }).origin ?? fastify.config.CORS_ORIGIN ?? "http://localhost:3000";
    const redirectUri = `${origin}/settings/youtube/callback`;
    try {
      return { url: getYouTubeOAuthUrl(redirectUri), redirectUri };
    } catch (err) {
      return reply.code(500).send({ error: "OAuth nao configurado", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- POST /api/youtube-channels/auth/callback ----
  fastify.post("/api/youtube-channels/auth/callback", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const schema = z.object({ code: z.string().min(1), redirectUri: z.string().url() });
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) return reply.code(400).send({ error: "code e redirectUri obrigatorios" });

    try {
      const { accessToken, refreshToken } = await exchangeYouTubeCode(parseResult.data.code, parseResult.data.redirectUri);
      const channels = await listMyChannels(accessToken);
      return { refreshToken, channels };
    } catch (err) {
      fastify.log.error({ err }, "[youtube-auth] callback failed");
      return reply.code(400).send({ error: "Falha na autenticacao", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- POST /api/youtube-channels/auth/connect ----
  fastify.post("/api/youtube-channels/auth/connect", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const schema = z.object({ channelId: z.string().min(1), channelName: z.string().min(1), thumbnailUrl: z.string().nullable().optional(), subscriberCount: z.number().optional(), refreshToken: z.string().min(1) });
    const parseResult = schema.safeParse(request.body);
    if (!parseResult.success) return reply.code(400).send({ error: "Dados invalidos" });

    const { channelId, channelName, thumbnailUrl, subscriberCount, refreshToken } = parseResult.data;
    const enc = encrypt(refreshToken);

    try {
      const [channel] = await fastify.db.insert(youtubeChannels).values({
        channelId, channelName, thumbnailUrl: thumbnailUrl ?? null, subscriberCount: subscriberCount ?? 0,
        refreshTokenEncrypted: enc.encrypted, refreshTokenIv: enc.iv, createdBy: request.userId!,
      }).returning();
      return reply.code(201).send(channel);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("uq_youtube_channel_id")) {
        return reply.code(409).send({ error: "Canal ja cadastrado" });
      }
      throw err;
    }
  });

  // ---- GET /api/youtube-channels ----
  fastify.get("/api/youtube-channels", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const rows = await fastify.db
      .select({
        id: youtubeChannels.id, channelId: youtubeChannels.channelId, channelName: youtubeChannels.channelName,
        thumbnailUrl: youtubeChannels.thumbnailUrl, subscriberCount: youtubeChannels.subscriberCount,
        isActive: youtubeChannels.isActive, createdAt: youtubeChannels.createdAt, updatedAt: youtubeChannels.updatedAt,
        projectId: youtubeChannelProjects.projectId, projectName: projects.name,
      })
      .from(youtubeChannels)
      .leftJoin(youtubeChannelProjects, eq(youtubeChannels.id, youtubeChannelProjects.channelId))
      .leftJoin(projects, eq(youtubeChannelProjects.projectId, projects.id));

    const map = new Map<string, {
      id: string; channelId: string; channelName: string; thumbnailUrl: string | null;
      subscriberCount: number | null; isActive: boolean; createdAt: Date; updatedAt: Date;
      projects: { projectId: string; projectName: string }[];
    }>();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, { id: row.id, channelId: row.channelId, channelName: row.channelName, thumbnailUrl: row.thumbnailUrl, subscriberCount: row.subscriberCount, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt, projects: [] });
      }
      if (row.projectId && row.projectName) {
        map.get(row.id)!.projects.push({ projectId: row.projectId, projectName: row.projectName });
      }
    }
    return Array.from(map.values());
  });

  // ---- DELETE /api/youtube-channels/:id ----
  fastify.delete("/api/youtube-channels/:id", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });
    const del = await fastify.db.delete(youtubeChannels).where(eq(youtubeChannels.id, p.data.id)).returning({ id: youtubeChannels.id });
    if (del.length === 0) return reply.code(404).send({ error: "Canal nao encontrado" });
    return { success: true };
  });

  // ---- POST /api/youtube-channels/:id/projects/:projectId ----
  fastify.post("/api/youtube-channels/:id/projects/:projectId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = linkParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    try {
      await fastify.db.insert(youtubeChannelProjects).values({ channelId: p.data.id, projectId: p.data.projectId });
      return { success: true };
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("uq_youtube_channel_project")) return reply.code(409).send({ error: "Projeto ja vinculado" });
      throw err;
    }
  });

  // ---- DELETE /api/youtube-channels/:id/projects/:projectId ----
  fastify.delete("/api/youtube-channels/:id/projects/:projectId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = linkParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    await fastify.db.delete(youtubeChannelProjects).where(and(eq(youtubeChannelProjects.channelId, p.data.id), eq(youtubeChannelProjects.projectId, p.data.projectId)));
    return { success: true };
  });

  // ---- GET /api/youtube-channels/:id/overview ----
  fastify.get("/api/youtube-channels/:id/overview", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });
    const days = Number((request.query as { days?: string }).days ?? 30);

    const [ch] = await fastify.db.select().from(youtubeChannels).where(eq(youtubeChannels.id, p.data.id)).limit(1);
    if (!ch) return reply.code(404).send({ error: "Canal nao encontrado" });

    try {
      const token = await getYouTubeAccessToken(decryptYouTubeToken(ch.refreshTokenEncrypted, ch.refreshTokenIv), ch.channelId);
      return await fetchChannelOverview(token, days);
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao buscar overview", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET /api/youtube-channels/:id/daily ----
  fastify.get("/api/youtube-channels/:id/daily", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });
    const days = Number((request.query as { days?: string }).days ?? 30);

    const [ch] = await fastify.db.select().from(youtubeChannels).where(eq(youtubeChannels.id, p.data.id)).limit(1);
    if (!ch) return reply.code(404).send({ error: "Canal nao encontrado" });

    try {
      const token = await getYouTubeAccessToken(decryptYouTubeToken(ch.refreshTokenEncrypted, ch.refreshTokenIv), ch.channelId);
      return await fetchDailyInsights(token, days);
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao buscar daily", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET /api/youtube-channels/:id/videos ----
  fastify.get("/api/youtube-channels/:id/videos", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "ID invalido" });
    const limit = Number((request.query as { limit?: string }).limit ?? 20);

    const [ch] = await fastify.db.select().from(youtubeChannels).where(eq(youtubeChannels.id, p.data.id)).limit(1);
    if (!ch) return reply.code(404).send({ error: "Canal nao encontrado" });

    try {
      const token = await getYouTubeAccessToken(decryptYouTubeToken(ch.refreshTokenEncrypted, ch.refreshTokenIv), ch.channelId);
      const videos = await listChannelVideos(token, ch.channelId, limit);
      return { videos };
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao buscar videos", details: err instanceof Error ? err.message : String(err) });
    }
  });
});
