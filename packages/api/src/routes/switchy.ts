import { z } from "zod";
import { eq, and, asc, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  projects,
  projectMembers,
  projectSwitchySettings,
  switchyChannelPresets,
  switchyShortenedLinks,
} from "../db/schema.js";
import {
  fetchSwitchyFolders,
  fetchSwitchyLinks,
  fetchSwitchyPixels,
  createSwitchyLink,
  buildTrackedCheckoutUrl,
} from "../services/switchy.js";
import { seedSwitchyPresetsIfEmpty } from "../db/seeds/switchy-presets.js";

// ============================================================
// SCHEMAS
// ============================================================

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const linksQuerySchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
});

const presetIdParamSchema = z.object({
  projectId: z.string().uuid(),
  presetId: z.string().uuid(),
});

const pixelSchema = z.object({
  platform: z.enum(["facebook", "gtm"]),
  value: z.string().min(1),
  title: z.string().optional(),
  // id/workspaceId do pixel já cadastrado no Switchy — para anexar o existente
  // no create (evita o Switchy criar um pixel duplicado).
  id: z.string().optional(),
  workspaceId: z.union([z.number(), z.string()]).nullable().optional(),
});

const settingsBodySchema = z.object({
  pixels: z.array(pixelSchema).default([]),
  showGdpr: z.boolean().default(false),
  defaultUtmTerm: z.string().max(120).nullable().optional(),
  defaultUtmContent: z.string().max(120).nullable().optional(),
});

const presetCreateSchema = z.object({
  label: z.string().min(1).max(120),
  utmMedium: z.string().min(1).max(120),
  utmSource: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

const presetUpdateSchema = presetCreateSchema.partial();

const channelSchema = z.object({
  label: z.string().min(1).max(120),
  medium: z.string().min(1).max(120),
  source: z.string().min(1).max(120),
});

const generateBodySchema = z.object({
  checkoutUrl: z.string().url(),
  folderId: z.union([z.string(), z.number()]),
  folderName: z.string().optional(),
  funnelId: z.string().uuid().optional(),
  campaign: z.string().min(1).max(120),
  term: z.string().max(120).optional(),
  content: z.string().max(120).optional(),
  channels: z.array(channelSchema).min(1),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  funnelId: z.string().uuid().optional(),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function switchyRoutes(fastify) {
  function getSwitchyToken(): string {
    const token = fastify.config.SWITCHY_API_TOKEN;
    if (!token) {
      throw new Error("SWITCHY_API_TOKEN not configured");
    }
    return token;
  }

  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId),
          ),
        )
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

  // ---- GET /api/projects/:projectId/switchy/folders ----
  fastify.get("/api/projects/:projectId/switchy/folders", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      const folders = await fetchSwitchyFolders(getSwitchyToken());
      return { folders };
    } catch (error) {
      fastify.log.error(error, "Failed to fetch Switchy folders");
      return reply.code(502).send({ error: "Falha ao buscar folders do Switchy" });
    }
  });

  // ---- GET /api/projects/:projectId/switchy/links ----
  fastify.get("/api/projects/:projectId/switchy/links", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const queryResult = linksQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Query inválida" });
    }

    try {
      const links = await fetchSwitchyLinks(getSwitchyToken(), queryResult.data.folderId);
      return { links };
    } catch (error) {
      fastify.log.error(error, "Failed to fetch Switchy links");
      return reply.code(502).send({ error: "Falha ao buscar links do Switchy" });
    }
  });

  // ---- GET /api/projects/:projectId/switchy/pixels ----
  // Pixels cadastrados na conta Switchy (conta GLOBAL). Usado pelo gerador
  // para o usuário selecionar quais pixels anexar no create (Story 33.6).
  fastify.get("/api/projects/:projectId/switchy/pixels", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      const pixels = await fetchSwitchyPixels(getSwitchyToken());
      return { pixels };
    } catch (error) {
      fastify.log.error(error, "Failed to fetch Switchy pixels");
      return reply.code(502).send({ error: "Falha ao buscar pixels do Switchy" });
    }
  });

  // ============================================================
  // Story 33.3 — settings, presets, generate (lote), history
  // ============================================================

  // ---- GET /api/projects/:projectId/switchy/settings ----
  fastify.get("/api/projects/:projectId/switchy/settings", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [settings] = await fastify.db
      .select()
      .from(projectSwitchySettings)
      .where(eq(projectSwitchySettings.projectId, paramResult.data.projectId))
      .limit(1);

    if (!settings) {
      return { pixels: [], showGdpr: false, defaultUtmTerm: null, defaultUtmContent: null };
    }

    return {
      pixels: settings.pixels,
      showGdpr: settings.showGdpr,
      defaultUtmTerm: settings.defaultUtmTerm,
      defaultUtmContent: settings.defaultUtmContent,
    };
  });

  // ---- PUT /api/projects/:projectId/switchy/settings ----
  fastify.put("/api/projects/:projectId/switchy/settings", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const bodyResult = settingsBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.issues });
    }

    const { pixels, showGdpr } = bodyResult.data;
    const defaultUtmTerm = bodyResult.data.defaultUtmTerm ?? null;
    const defaultUtmContent = bodyResult.data.defaultUtmContent ?? null;
    const projectId = paramResult.data.projectId;

    try {
      await fastify.db
        .insert(projectSwitchySettings)
        .values({ projectId, pixels, showGdpr, defaultUtmTerm, defaultUtmContent })
        .onConflictDoUpdate({
          target: projectSwitchySettings.projectId,
          set: { pixels, showGdpr, defaultUtmTerm, defaultUtmContent, updatedAt: new Date() },
        });
    } catch (error) {
      fastify.log.error(error, "Failed to upsert Switchy settings");
      return reply.code(500).send({ error: "Falha ao salvar configurações" });
    }

    return { pixels, showGdpr, defaultUtmTerm, defaultUtmContent };
  });

  // ---- GET /api/projects/:projectId/switchy/presets ----
  fastify.get("/api/projects/:projectId/switchy/presets", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      // Seed lazy dos 7 defaults quando o projeto ainda não tem presets.
      await seedSwitchyPresetsIfEmpty(fastify.db, paramResult.data.projectId);
    } catch (error) {
      fastify.log.error(error, "Failed to seed Switchy presets");
      return reply.code(500).send({ error: "Falha ao carregar presets" });
    }

    const presets = await fastify.db
      .select()
      .from(switchyChannelPresets)
      .where(eq(switchyChannelPresets.projectId, paramResult.data.projectId))
      .orderBy(asc(switchyChannelPresets.sortOrder), asc(switchyChannelPresets.createdAt));

    return { presets };
  });

  // ---- POST /api/projects/:projectId/switchy/presets ----
  fastify.post("/api/projects/:projectId/switchy/presets", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const bodyResult = presetCreateSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.issues });
    }

    try {
      const [preset] = await fastify.db
        .insert(switchyChannelPresets)
        .values({
          projectId: paramResult.data.projectId,
          label: bodyResult.data.label,
          utmMedium: bodyResult.data.utmMedium,
          utmSource: bodyResult.data.utmSource,
          ...(bodyResult.data.sortOrder !== undefined ? { sortOrder: bodyResult.data.sortOrder } : {}),
          ...(bodyResult.data.enabled !== undefined ? { enabled: bodyResult.data.enabled } : {}),
        })
        .returning();
      return reply.code(201).send({ preset });
    } catch (error) {
      fastify.log.error(error, "Failed to create Switchy preset");
      return reply.code(500).send({ error: "Falha ao criar preset" });
    }
  });

  // ---- PUT /api/projects/:projectId/switchy/presets/:presetId ----
  fastify.put("/api/projects/:projectId/switchy/presets/:presetId", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = presetIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const bodyResult = presetUpdateSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.issues });
    }

    try {
      const [updated] = await fastify.db
        .update(switchyChannelPresets)
        .set({ ...bodyResult.data, updatedAt: new Date() })
        .where(
          and(
            eq(switchyChannelPresets.id, paramResult.data.presetId),
            eq(switchyChannelPresets.projectId, paramResult.data.projectId),
          ),
        )
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: "Preset não encontrado" });
      }

      return { preset: updated };
    } catch (error) {
      fastify.log.error(error, "Failed to update Switchy preset");
      return reply.code(500).send({ error: "Falha ao atualizar preset" });
    }
  });

  // ---- DELETE /api/projects/:projectId/switchy/presets/:presetId ----
  fastify.delete("/api/projects/:projectId/switchy/presets/:presetId", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = presetIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      const [deleted] = await fastify.db
        .delete(switchyChannelPresets)
        .where(
          and(
            eq(switchyChannelPresets.id, paramResult.data.presetId),
            eq(switchyChannelPresets.projectId, paramResult.data.projectId),
          ),
        )
        .returning({ id: switchyChannelPresets.id });

      if (!deleted) {
        return reply.code(404).send({ error: "Preset não encontrado" });
      }

      return { success: true };
    } catch (error) {
      fastify.log.error(error, "Failed to delete Switchy preset");
      return reply.code(500).send({ error: "Falha ao remover preset" });
    }
  });

  // ---- POST /api/projects/:projectId/switchy/generate ----
  fastify.post("/api/projects/:projectId/switchy/generate", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const bodyResult = generateBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.issues });
    }

    const body = bodyResult.data;
    const projectId = paramResult.data.projectId;

    let token: string;
    try {
      token = getSwitchyToken();
    } catch (error) {
      fastify.log.error(error, "Switchy token not configured");
      return reply.code(500).send({ error: "Switchy não configurado" });
    }

    // Carrega pixels/showGdpr do projeto (default vazio se não houver settings).
    const [settings] = await fastify.db
      .select()
      .from(projectSwitchySettings)
      .where(eq(projectSwitchySettings.projectId, projectId))
      .limit(1);

    const pixels = settings?.pixels ?? [];
    const showGdpr = settings?.showGdpr ?? false;

    const results: Array<{
      label: string;
      medium: string;
      source: string;
      fullUrl: string;
      shortUrl: string | null;
      switchyLinkId: string | null;
      error?: string;
    }> = [];

    for (const ch of body.channels) {
      const fullUrl = buildTrackedCheckoutUrl({
        baseUrl: body.checkoutUrl,
        campaign: body.campaign,
        medium: ch.medium,
        source: ch.source,
        term: body.term,
        content: body.content,
      });

      // sck derivado do mesmo filtro do builder (term/content omitidos se vazios).
      const term = (body.term ?? "").trim();
      const content = (body.content ?? "").trim();
      const sck = [body.campaign, ch.medium, ch.source, term, content]
        .filter((v) => v && v.length > 0)
        .join("_");

      let shortUrl: string | null = null;
      let switchyLinkId: string | null = null;
      let switchyUniq: number | null = null;
      let error: string | undefined;

      try {
        const created = await createSwitchyLink(token, {
          url: fullUrl,
          folderId: Number(body.folderId),
          pixels: pixels.map((p) => ({
            platform: p.platform,
            value: p.value,
            title: p.title ?? "",
            ...(p.id ? { id: p.id } : {}),
            ...(p.workspaceId != null ? { workspaceId: p.workspaceId } : {}),
          })),
          showGDPR: showGdpr,
        });
        shortUrl = created.shortUrl;
        switchyLinkId = created.switchyLinkId;
        switchyUniq = created.switchyUniq;
      } catch (e) {
        fastify.log.error(e, `Switchy generate failed for channel ${ch.label}`);
        error = e instanceof Error ? e.message : "Falha ao gerar link";
      }

      // full_url SEMPRE é gravado (montado localmente). short_url/id/uniq ficam
      // null quando o canal falha — o histórico registra a tentativa.
      try {
        await fastify.db.insert(switchyShortenedLinks).values({
          projectId,
          funnelId: body.funnelId ?? null,
          folderId: String(body.folderId),
          folderName: body.folderName ?? null,
          checkoutBaseUrl: body.checkoutUrl,
          channelLabel: ch.label,
          utmCampaign: body.campaign,
          utmMedium: ch.medium,
          utmSource: ch.source,
          utmTerm: term || null,
          utmContent: content || null,
          sck,
          vkSource: "",
          fullUrl,
          shortUrl,
          switchyLinkId,
          switchyUniq,
        });
      } catch (e) {
        fastify.log.error(e, `Failed to persist Switchy link for channel ${ch.label}`);
      }

      results.push({
        label: ch.label,
        medium: ch.medium,
        source: ch.source,
        fullUrl,
        shortUrl,
        switchyLinkId,
        ...(error ? { error } : {}),
      });
    }

    return { results };
  });

  // ---- GET /api/projects/:projectId/switchy/links/history ----
  fastify.get("/api/projects/:projectId/switchy/links/history", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const queryResult = historyQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Query inválida" });
    }

    const limit = queryResult.data.limit ?? 50;
    const { funnelId } = queryResult.data;

    // Filtra por funil quando presente (links vivem dentro da página do funil).
    const where = funnelId
      ? and(
          eq(switchyShortenedLinks.projectId, paramResult.data.projectId),
          eq(switchyShortenedLinks.funnelId, funnelId),
        )
      : eq(switchyShortenedLinks.projectId, paramResult.data.projectId);

    const links = await fastify.db
      .select()
      .from(switchyShortenedLinks)
      .where(where)
      .orderBy(desc(switchyShortenedLinks.createdAt))
      .limit(limit);

    return { links };
  });
});
