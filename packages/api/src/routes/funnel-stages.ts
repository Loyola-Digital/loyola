import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";

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
  stageType: z.enum(["paid", "free"]).default("free"),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).default([]),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).default([]),
  switchyFolderIds: z.array(switchyFolderSchema).default([]),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).default([]),
});

const updateStageSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  stageType: z.enum(["paid", "free"]).optional(),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).optional(),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).optional(),
  switchyFolderIds: z.array(switchyFolderSchema).optional(),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).optional(),
});

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const stageParamsSchema = paramsSchema.extend({
  stageId: z.string().uuid(),
});

// ============================================================
// HELPERS
// ============================================================

function stageShape(row: typeof funnelStages.$inferSelect) {
  return {
    id: row.id,
    funnelId: row.funnelId,
    name: row.name,
    stageType: (row.stageType ?? "free") as "paid" | "free",
    metaAccountId: row.metaAccountId,
    campaigns: (row.campaigns ?? []) as { id: string; name: string }[],
    googleAdsAccountId: row.googleAdsAccountId,
    googleAdsCampaigns: (row.googleAdsCampaigns ?? []) as { id: string; name: string }[],
    switchyFolderIds: (row.switchyFolderIds ?? []) as { id: number; name: string }[],
    switchyLinkedLinks: (row.switchyLinkedLinks ?? []) as { uniq: number; id: string; domain: string }[],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/stages
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const rows = await fastify.db
      .select()
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, params.data.funnelId))
      .orderBy(funnelStages.sortOrder, funnelStages.createdAt);

    return rows.map(stageShape);
  });

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [row] = await fastify.db
      .select()
      .from(funnelStages)
      .where(
        and(
          eq(funnelStages.id, params.data.stageId),
          eq(funnelStages.funnelId, params.data.funnelId)
        )
      )
      .limit(1);

    if (!row) return reply.code(404).send({ error: "Etapa não encontrada" });
    return stageShape(row);
  });

  // POST /api/projects/:projectId/funnels/:funnelId/stages
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    const bodyResult = createStageSchema.safeParse(request.body);
    if (!bodyResult.success) return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.flatten() });

    const body = bodyResult.data;

    const existing = await fastify.db
      .select({ sortOrder: funnelStages.sortOrder })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, params.data.funnelId));

    const nextOrder = existing.length > 0
      ? Math.max(...existing.map((r) => r.sortOrder)) + 1
      : 0;

    const [row] = await fastify.db
      .insert(funnelStages)
      .values({
        funnelId: params.data.funnelId,
        name: body.name,
        stageType: body.stageType ?? "free",
        metaAccountId: body.metaAccountId ?? null,
        campaigns: body.campaigns,
        googleAdsAccountId: body.googleAdsAccountId ?? null,
        googleAdsCampaigns: body.googleAdsCampaigns,
        switchyFolderIds: body.switchyFolderIds,
        switchyLinkedLinks: body.switchyLinkedLinks,
        sortOrder: nextOrder,
      })
      .returning();

    return reply.code(201).send(stageShape(row));
  });

  // PUT /api/projects/:projectId/funnels/:funnelId/stages/:stageId
  fastify.put("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [existing] = await fastify.db
      .select()
      .from(funnelStages)
      .where(
        and(
          eq(funnelStages.id, params.data.stageId),
          eq(funnelStages.funnelId, params.data.funnelId)
        )
      )
      .limit(1);

    if (!existing) return reply.code(404).send({ error: "Etapa não encontrada" });

    const bodyResult = updateStageSchema.safeParse(request.body);
    if (!bodyResult.success) return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.flatten() });

    const body = bodyResult.data;
    const updates: Partial<typeof funnelStages.$inferInsert> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name;
    if (body.stageType !== undefined) updates.stageType = body.stageType;
    if (body.metaAccountId !== undefined) updates.metaAccountId = body.metaAccountId;
    if (body.campaigns !== undefined) updates.campaigns = body.campaigns;
    if (body.googleAdsAccountId !== undefined) updates.googleAdsAccountId = body.googleAdsAccountId;
    if (body.googleAdsCampaigns !== undefined) updates.googleAdsCampaigns = body.googleAdsCampaigns;
    if (body.switchyFolderIds !== undefined) updates.switchyFolderIds = body.switchyFolderIds;
    if (body.switchyLinkedLinks !== undefined) updates.switchyLinkedLinks = body.switchyLinkedLinks;

    const [row] = await fastify.db
      .update(funnelStages)
      .set(updates)
      .where(eq(funnelStages.id, params.data.stageId))
      .returning();

    return stageShape(row);
  });

  // DELETE /api/projects/:projectId/funnels/:funnelId/stages/:stageId
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const allStages = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, params.data.funnelId));

    if (allStages.length <= 1) {
      return reply.code(409).send({ error: "Não é possível remover a última etapa do funil" });
    }

    await fastify.db
      .delete(funnelStages)
      .where(
        and(
          eq(funnelStages.id, params.data.stageId),
          eq(funnelStages.funnelId, params.data.funnelId)
        )
      );

    return reply.code(204).send();
  });
});
