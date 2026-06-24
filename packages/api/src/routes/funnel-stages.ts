import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  projects,
  projectMembers,
  users,
  metaAdsAccountProjects,
  metaAdsAccounts,
} from "../db/schema.js";
import { decryptAccountToken } from "../services/meta-ads.js";
import { triggerBackgroundSyncForNewCampaigns } from "../services/meta-insights-cache.js";
import {
  resolveStagePhaseSuffix,
  findMatchingCampaignsForStage,
} from "../services/stage-phase.js";

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
  stageType: z.enum(["paid", "free", "sales", "cpl", "event"]).default("free"),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).default([]),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).default([]),
  switchyFolderIds: z.array(switchyFolderSchema).default([]),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).default([]),
});

const updateStageSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  stageType: z.enum(["paid", "free", "sales", "cpl", "event"]).optional(),
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

const leadInputsSchema = z.object({
  projectionEndDate: z.string().date().optional(),
  leadGoal: z.number().int().nonnegative().optional(),
});

// ============================================================
// HELPERS
// ============================================================

function displayUserName(name: string | null | undefined, email: string | null | undefined): string {
  const looksLikeClerkId = typeof name === "string" && /^user_[A-Za-z0-9]+$/.test(name);
  const nameIsEmail = name && email && name === email;
  if (name && !looksLikeClerkId && !nameIsEmail) return name;

  if (email) {
    const local = email.split("@")[0].split("+")[0];
    return local
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "Usuário";
}

function stageShape(
  row: typeof funnelStages.$inferSelect,
  auditUser?: { id: string; name: string | null; email: string | null } | null,
) {
  return {
    id: row.id,
    funnelId: row.funnelId,
    name: row.name,
    stageType: (row.stageType ?? "free") as "paid" | "free" | "sales" | "cpl" | "event",
    metaAccountId: row.metaAccountId,
    campaigns: (row.campaigns ?? []) as { id: string; name: string }[],
    googleAdsAccountId: row.googleAdsAccountId,
    googleAdsCampaigns: (row.googleAdsCampaigns ?? []) as { id: string; name: string }[],
    switchyFolderIds: (row.switchyFolderIds ?? []) as { id: number; name: string }[],
    switchyLinkedLinks: (row.switchyLinkedLinks ?? []) as { uniq: number; id: string; domain: string }[],
    sortOrder: row.sortOrder,
    lastAuditAt: row.lastAuditAt ? row.lastAuditAt.toISOString() : null,
    lastAuditBy: auditUser?.id
      ? { id: auditUser.id, name: displayUserName(auditUser.name, auditUser.email) }
      : null,
    auditStatus: (row.auditStatus ?? "pending") as "pending" | "audited",
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

  // Epic 30 Story 30.2: fire-and-forget background sync histórico Meta (365d)
  // pra campanhas recém-vinculadas a uma stage.
  async function fireBackgroundMetaSync(
    projectId: string,
    metaAccountIdSelected: string,
    newCampaignIds: string[],
  ): Promise<void> {
    if (newCampaignIds.length === 0) return;
    try {
      const [link] = await fastify.db
        .select({ accountId: metaAdsAccountProjects.accountId })
        .from(metaAdsAccountProjects)
        .where(eq(metaAdsAccountProjects.projectId, projectId))
        .limit(1);
      if (!link) return;
      const [account] = await fastify.db
        .select()
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, link.accountId))
        .limit(1);
      if (!account) return;
      const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);
      triggerBackgroundSyncForNewCampaigns(
        fastify.db,
        projectId,
        metaAccountIdSelected,
        token,
        newCampaignIds,
      );
    } catch (err) {
      fastify.log.error({ err, projectId }, "Failed to trigger Meta background sync (stage)");
    }
  }

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({
        id: funnels.id,
        name: funnels.name,
        type: funnels.type,
        matchCode: funnels.matchCode,
      })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  /**
   * Resolve o matchCode efetivo do funil: override do user em `matchCode`,
   * fallback pro próprio nome do funil (lowercased), null se ambos vazios.
   * Mesmo critério usado em `/orphan-campaigns`.
   */
  function effectiveMatchCode(funnel: { name: string | null; matchCode: string | null }): string | null {
    const override = (funnel.matchCode ?? "").trim().toLowerCase();
    if (override.length > 0) return override;
    const fallback = (funnel.name ?? "").trim().toLowerCase();
    return fallback.length > 0 ? fallback : null;
  }

  /**
   * Pega o metaAccountId + token decifrado da conta Meta vinculada ao projeto.
   * Retorna null se não tem conta vinculada (sem erro — auto-popular cai pra
   * lista vazia).
   */
  async function getMetaAccountForProject(projectId: string) {
    const [link] = await fastify.db
      .select({ accountId: metaAdsAccountProjects.accountId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.projectId, projectId))
      .limit(1);
    if (!link) return null;
    const [account] = await fastify.db
      .select()
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, link.accountId))
      .limit(1);
    if (!account) return null;
    try {
      const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);
      return { metaAccountId: account.metaAccountId, accessToken: token };
    } catch {
      return null;
    }
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
      .select({
        stage: funnelStages,
        auditUser: { id: users.id, name: users.name, email: users.email },
      })
      .from(funnelStages)
      .leftJoin(users, eq(funnelStages.lastAuditBy, users.id))
      .where(eq(funnelStages.funnelId, params.data.funnelId))
      .orderBy(funnelStages.sortOrder, funnelStages.createdAt);

    return rows.map((r) => stageShape(r.stage, r.auditUser));
  });

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId", async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [row] = await fastify.db
      .select({
        stage: funnelStages,
        auditUser: { id: users.id, name: users.name, email: users.email },
      })
      .from(funnelStages)
      .leftJoin(users, eq(funnelStages.lastAuditBy, users.id))
      .where(
        and(
          eq(funnelStages.id, params.data.stageId),
          eq(funnelStages.funnelId, params.data.funnelId)
        )
      )
      .limit(1);

    if (!row) return reply.code(404).send({ error: "Etapa não encontrada" });
    return stageShape(row.stage, row.auditUser);
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

    // Auto-popular `campaigns` quando o cliente não passou nenhuma. Só roda
    // quando a heurística de fase é confiante (phaseSuffix != null) E temos
    // conta Meta vinculada no projeto. Falhas silenciam pra []  — criação da
    // stage NÃO deve depender da Meta API.
    let resolvedCampaigns = body.campaigns;
    if (resolvedCampaigns.length === 0) {
      const stageTypeFinal = body.stageType ?? "free";
      const phaseSuffix = resolveStagePhaseSuffix(funnel.type as "launch" | "perpetual", stageTypeFinal, body.name);
      const matchCode = effectiveMatchCode(funnel);
      if (phaseSuffix && matchCode) {
        const meta = await getMetaAccountForProject(params.data.projectId);
        if (meta) {
          try {
            resolvedCampaigns = await findMatchingCampaignsForStage(
              meta.metaAccountId,
              meta.accessToken,
              matchCode,
              phaseSuffix,
            );
          } catch (err) {
            fastify.log.warn({ err }, "[funnel-stages] auto-popular campaigns falhou — seguindo com []");
          }
        }
      }
    }

    const [row] = await fastify.db
      .insert(funnelStages)
      .values({
        funnelId: params.data.funnelId,
        name: body.name,
        stageType: body.stageType ?? "free",
        metaAccountId: body.metaAccountId ?? null,
        campaigns: resolvedCampaigns,
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

    // Epic 30 Story 30.2: detecta campanhas adicionadas e dispara sync histórico.
    if (body.campaigns !== undefined && row.metaAccountId) {
      const oldIds = new Set((existing.campaigns ?? []).map((c) => c.id));
      const newCampaignIds = (row.campaigns ?? [])
        .map((c) => c.id)
        .filter((id) => !oldIds.has(id));
      if (newCampaignIds.length > 0) {
        void fireBackgroundMetaSync(params.data.projectId, row.metaAccountId, newCampaignIds);
      }
    }

    return stageShape(row);
  });

  // POST /api/projects/:projectId/funnels/:funnelId/stages/reorder
  // Body: { stageIds: string[] } — nova ordem das etapas
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/reorder",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const userId = request.userId;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });

      const bodySchema = z.object({
        stageIds: z.array(z.string().uuid()).min(1),
      });
      const body = bodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Body inválido", details: body.error.flatten() });

      const project = await getProjectAccess(params.data.projectId, userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // Verifica que todas as stages pertencem ao funil
      const existing = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, params.data.funnelId));
      const existingIds = new Set(existing.map((r) => r.id));
      for (const id of body.data.stageIds) {
        if (!existingIds.has(id)) {
          return reply.code(400).send({ error: `Stage ${id} não pertence ao funil` });
        }
      }

      // Atualiza sortOrder de cada stage de acordo com a posição na lista
      const now = new Date();
      for (let i = 0; i < body.data.stageIds.length; i++) {
        await fastify.db
          .update(funnelStages)
          .set({ sortOrder: i, updatedAt: now })
          .where(
            and(
              eq(funnelStages.id, body.data.stageIds[i]),
              eq(funnelStages.funnelId, params.data.funnelId)
            )
          );
      }

      return { success: true };
    }
  );

  // POST /api/projects/:projectId/funnels/:funnelId/stages/:stageId/audit
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/audit",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const userId = request.userId;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });

      const project = await getProjectAccess(params.data.projectId, userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [existing] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId)
          )
        )
        .limit(1);

      if (!existing) return reply.code(404).send({ error: "Etapa não encontrada" });

      const now = new Date();
      await fastify.db
        .update(funnelStages)
        .set({
          lastAuditAt: now,
          lastAuditBy: userId,
          auditStatus: "audited",
          updatedAt: now,
        })
        .where(eq(funnelStages.id, params.data.stageId));

      const [user] = await fastify.db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      return reply.send({
        lastAuditAt: now.toISOString(),
        lastAuditBy: {
          id: user?.id ?? userId,
          name: displayUserName(user?.name, user?.email),
        },
        auditStatus: "audited" as const,
      });
    }
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/stages/:stageId/audit
  // Cancela (desfaz) a auditoria da etapa — volta pro estado "pending" e
  // zera lastAuditAt/lastAuditBy. Isolado por stage.
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/audit",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const userId = request.userId;
      if (!userId) return reply.code(401).send({ error: "Unauthorized" });

      const project = await getProjectAccess(params.data.projectId, userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [existing] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId)
          )
        )
        .limit(1);

      if (!existing) return reply.code(404).send({ error: "Etapa não encontrada" });

      await fastify.db
        .update(funnelStages)
        .set({
          lastAuditAt: null,
          lastAuditBy: null,
          auditStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(funnelStages.id, params.data.stageId));

      return reply.send({
        lastAuditAt: null,
        lastAuditBy: null,
        auditStatus: "pending" as const,
      });
    }
  );

  // PATCH /api/funnels/:funnelId/stages/:stageId/lead-inputs
  fastify.patch("/api/funnels/:funnelId/stages/:stageId/lead-inputs", async (request, reply) => {
    const params = z.object({
      funnelId: z.string().uuid(),
      stageId: z.string().uuid(),
    }).safeParse(request.params);

    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const body = leadInputsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.issues });

    // Validação: projectionEndDate >= hoje (em horário local)
    if (body.data.projectionEndDate) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (body.data.projectionEndDate < todayStr) {
        return reply.code(400).send({ error: "Data final não pode ser menor que hoje" });
      }
    }

    const stage = await fastify.db
      .select()
      .from(funnelStages)
      .where(
        and(
          eq(funnelStages.id, params.data.stageId),
          eq(funnelStages.funnelId, params.data.funnelId)
        )
      )
      .then(rows => rows[0]);

    if (!stage) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const updated = await fastify.db
      .update(funnelStages)
      .set({
        projectionEndDate: body.data.projectionEndDate,
        leadGoal: body.data.leadGoal ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(funnelStages.id, params.data.stageId))
      .returning();

    return reply.code(200).send({ success: true, stage: updated[0] });
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
