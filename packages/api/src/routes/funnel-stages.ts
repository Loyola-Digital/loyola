import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelStages, funnels, projects, projectMembers } from "../db/schema.js";

// ============================================================
// SCHEMAS
// ============================================================

const campaignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const switchyFolderSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
});

const switchyLinkRefSchema = z.object({
  uniq: z.number().int().positive(),
  id: z.string().min(1),
  domain: z.string().min(1),
});

const createStageSchema = z.object({
  name: z.string().min(1).max(255),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).default([]),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).default([]),
  switchyFolderIds: z.array(switchyFolderSchema).default([]),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).default([]),
});

const updateStageSchema = createStageSchema.partial();

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const stageParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

// ============================================================
// HELPERS
// ============================================================

function stageShape(s: typeof funnelStages.$inferSelect) {
  return {
    id: s.id,
    funnelId: s.funnelId,
    name: s.name,
    metaAccountId: s.metaAccountId,
    campaigns: s.campaigns ?? [],
    googleAdsAccountId: s.googleAdsAccountId,
    googleAdsCampaigns: s.googleAdsCampaigns ?? [],
    switchyFolderIds: s.switchyFolderIds ?? [],
    switchyLinkedLinks: s.switchyLinkedLinks ?? [],
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function funnelStageRoutes(fastify) {
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

  async function getFunnelAccess(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---- GET /api/projects/:projectId/funnels/:funnelId/stages ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages", async (request, reply) => {
    const params = funnelParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnelAccess(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const rows = await fastify.db
      .select()
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, params.data.funnelId))
      .orderBy(funnelStages.sortOrder, funnelStages.createdAt);

    return rows.map(stageShape);
  });

  // ---- POST /api/projects/:projectId/funnels/:funnelId/stages ----
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const params = funnelParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const body = createStageSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten().fieldErrors });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnelAccess(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const { name, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns, switchyFolderIds, switchyLinkedLinks } = body.data;

    const [stage] = await fastify.db
      .insert(funnelStages)
      .values({
        funnelId: params.data.funnelId,
        name,
        metaAccountId: metaAccountId ?? null,
        campaigns,
        googleAdsAccountId: googleAdsAccountId ?? null,
        googleAdsCampaigns,
        switchyFolderIds,
        switchyLinkedLinks,
      })
      .returning();

    return reply.code(201).send(stageShape(stage));
  });

  // ---- GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    const params = stageParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnelAccess(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const [stage] = await fastify.db
      .select()
      .from(funnelStages)
      .where(and(eq(funnelStages.id, params.data.stageId), eq(funnelStages.funnelId, params.data.funnelId)))
      .limit(1);

    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    return stageShape(stage);
  });

  // ---- PUT /api/projects/:projectId/funnels/:funnelId/stages/:stageId ----
  fastify.put("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const params = stageParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const body = updateStageSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten().fieldErrors });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnelAccess(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const [existing] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(and(eq(funnelStages.id, params.data.stageId), eq(funnelStages.funnelId, params.data.funnelId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: "Etapa não encontrada" });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { name, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns, switchyFolderIds, switchyLinkedLinks } = body.data;
    if (name !== undefined) updates.name = name;
    if (metaAccountId !== undefined) updates.metaAccountId = metaAccountId;
    if (campaigns !== undefined) updates.campaigns = campaigns;
    if (googleAdsAccountId !== undefined) updates.googleAdsAccountId = googleAdsAccountId;
    if (googleAdsCampaigns !== undefined) updates.googleAdsCampaigns = googleAdsCampaigns;
    if (switchyFolderIds !== undefined) updates.switchyFolderIds = switchyFolderIds;
    if (switchyLinkedLinks !== undefined) updates.switchyLinkedLinks = switchyLinkedLinks;

    const [updated] = await fastify.db
      .update(funnelStages)
      .set(updates)
      .where(eq(funnelStages.id, params.data.stageId))
      .returning();

    return stageShape(updated);
  });

  // ---- DELETE /api/projects/:projectId/funnels/:funnelId/stages/:stageId ----
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const params = stageParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnelAccess(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const [existing] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(and(eq(funnelStages.id, params.data.stageId), eq(funnelStages.funnelId, params.data.funnelId)))
      .limit(1);

    if (!existing) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Impede remover a última etapa do funil
    const [{ value: stageCount }] = await fastify.db
      .select({ value: count() })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, params.data.funnelId));

    if (Number(stageCount) <= 1) {
      return reply.code(409).send({ error: "Não é possível remover a única etapa do funil" });
    }

    await fastify.db.delete(funnelStages).where(eq(funnelStages.id, params.data.stageId));

    return reply.code(204).send();
  });
});
