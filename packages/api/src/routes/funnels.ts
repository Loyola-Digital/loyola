import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, projects, projectMembers, metaAdsAccountProjects, metaAdsAccounts, googleAdsAccountProjects, googleAdsAccounts } from "../db/schema.js";
import { fetchCampaigns, decryptAccountToken } from "../services/meta-ads.js";
import { fetchGoogleAdsCampaigns, decryptToken as decryptGoogleToken } from "../services/google-ads.js";

// ============================================================
// SCHEMAS
// ============================================================

const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const createFunnelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["launch", "perpetual"]),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).default([]),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).default([]),
});

const updateFunnelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["launch", "perpetual"]).optional(),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).optional(),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).optional(),
});

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

// ============================================================
// HELPERS
// ============================================================

function funnelShape(f: typeof funnels.$inferSelect) {
  return {
    id: f.id,
    projectId: f.projectId,
    name: f.name,
    type: f.type,
    metaAccountId: f.metaAccountId,
    campaigns: f.campaigns ?? [],
    googleAdsAccountId: f.googleAdsAccountId,
    googleAdsCampaigns: f.googleAdsCampaigns ?? [],
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function funnelRoutes(fastify) {
  // Helper: verify project access (non-guests direct, guests via membership)
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

  // ---- GET /api/projects/:projectId/funnels ----
  fastify.get("/api/projects/:projectId/funnels", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const rows = await fastify.db
      .select()
      .from(funnels)
      .where(eq(funnels.projectId, paramResult.data.projectId));

    return rows.map(funnelShape);
  });

  // ---- GET /api/projects/:projectId/funnels/:funnelId ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId", async (request, reply) => {
    const paramResult = funnelParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [funnel] = await fastify.db
      .select()
      .from(funnels)
      .where(
        and(
          eq(funnels.id, paramResult.data.funnelId),
          eq(funnels.projectId, paramResult.data.projectId),
        ),
      )
      .limit(1);

    if (!funnel) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    return funnelShape(funnel);
  });

  // ---- POST /api/projects/:projectId/funnels ----
  fastify.post("/api/projects/:projectId/funnels", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const parseResult = createFunnelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const { name, type, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns } = parseResult.data;

    const [funnel] = await fastify.db
      .insert(funnels)
      .values({
        projectId: paramResult.data.projectId,
        name,
        type,
        metaAccountId: metaAccountId ?? null,
        campaigns,
        googleAdsAccountId: googleAdsAccountId ?? null,
        googleAdsCampaigns,
      })
      .returning();

    return reply.code(201).send(funnelShape(funnel));
  });

  // ---- PUT /api/projects/:projectId/funnels/:funnelId ----
  fastify.put("/api/projects/:projectId/funnels/:funnelId", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = funnelParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    const parseResult = updateFunnelSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [existing] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(
        and(
          eq(funnels.id, paramResult.data.funnelId),
          eq(funnels.projectId, paramResult.data.projectId),
        ),
      )
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { name, type, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns } = parseResult.data;
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (metaAccountId !== undefined) updates.metaAccountId = metaAccountId;
    if (campaigns !== undefined) updates.campaigns = campaigns;
    if (googleAdsAccountId !== undefined) updates.googleAdsAccountId = googleAdsAccountId;
    if (googleAdsCampaigns !== undefined) updates.googleAdsCampaigns = googleAdsCampaigns;

    const [updated] = await fastify.db
      .update(funnels)
      .set(updates)
      .where(eq(funnels.id, paramResult.data.funnelId))
      .returning();

    return funnelShape(updated);
  });

  // ---- DELETE /api/projects/:projectId/funnels/:funnelId ----
  fastify.delete("/api/projects/:projectId/funnels/:funnelId", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = funnelParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [existing] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(
        and(
          eq(funnels.id, paramResult.data.funnelId),
          eq(funnels.projectId, paramResult.data.projectId),
        ),
      )
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    await fastify.db
      .delete(funnels)
      .where(eq(funnels.id, paramResult.data.funnelId));

    return reply.code(204).send();
  });

  // ---- GET /api/projects/:projectId/meta-campaigns ---- (Story 10.2)
  fastify.get("/api/projects/:projectId/meta-campaigns", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    // Find Meta Ads account linked to this project
    const [link] = await fastify.db
      .select({ accountId: metaAdsAccountProjects.accountId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.projectId, paramResult.data.projectId))
      .limit(1);

    if (!link) {
      return { campaigns: [], accountLinked: false };
    }

    const [account] = await fastify.db
      .select()
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, link.accountId))
      .limit(1);

    if (!account) {
      return { campaigns: [], accountLinked: false };
    }

    try {
      const token = decryptAccountToken(
        account.accessTokenEncrypted,
        account.accessTokenIv,
      );
      const campaigns = await fetchCampaigns(account.metaAccountId, token);
      return {
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
        })),
        accountLinked: true,
      };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar campanhas da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/projects/:projectId/google-ads-campaigns ----
  fastify.get("/api/projects/:projectId/google-ads-campaigns", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const [link] = await fastify.db
      .select({ accountId: googleAdsAccountProjects.accountId })
      .from(googleAdsAccountProjects)
      .where(eq(googleAdsAccountProjects.projectId, paramResult.data.projectId))
      .limit(1);

    if (!link) {
      return { campaigns: [], accountLinked: false, accountId: null };
    }

    const [account] = await fastify.db
      .select()
      .from(googleAdsAccounts)
      .where(eq(googleAdsAccounts.id, link.accountId))
      .limit(1);

    if (!account) {
      return { campaigns: [], accountLinked: false, accountId: null };
    }

    try {
      const developerToken = decryptGoogleToken(account.developerTokenEncrypted, account.developerTokenIv);
      const refreshToken = decryptGoogleToken(account.refreshTokenEncrypted, account.refreshTokenIv);
      const campaigns = await fetchGoogleAdsCampaigns(account.customerId, developerToken, refreshToken, 90);
      return {
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
        })),
        accountLinked: true,
        accountId: account.id,
      };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar campanhas do Google Ads",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
