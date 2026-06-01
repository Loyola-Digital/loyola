import { z } from "zod";
import { eq, and, desc, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages, projects, projectMembers, metaAdsAccountProjects, metaAdsAccounts, googleAdsAccountProjects, googleAdsAccounts, users } from "../db/schema.js";
import { fetchCampaigns, decryptAccountToken } from "../services/meta-ads.js";
import { triggerBackgroundSyncForNewCampaigns } from "../services/meta-insights-cache.js";
import { resolveStagePhaseSuffix } from "../services/stage-phase.js";
import { fetchGoogleAdsCampaigns, decryptToken as decryptGoogleToken } from "../services/google-ads.js";

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

const createFunnelSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["launch", "perpetual"]),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).default([]),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).default([]),
  switchyFolderIds: z.array(switchyFolderSchema).default([]),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).default([]),
});

const updateFunnelSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["launch", "perpetual"]).optional(),
  metaAccountId: z.string().uuid().nullable().optional(),
  campaigns: z.array(campaignSchema).optional(),
  googleAdsAccountId: z.string().uuid().nullable().optional(),
  googleAdsCampaigns: z.array(campaignSchema).optional(),
  switchyFolderIds: z.array(switchyFolderSchema).optional(),
  switchyLinkedLinks: z.array(switchyLinkRefSchema).optional(),
  compareFunnelId: z.string().uuid().nullable().optional(),
  matchCode: z.string().max(50).nullable().optional(),
  // Story 18.19 fix: Meta Total + Data Final do gráfico de tendência
  leadsGoalMeta: z.number().int().nonnegative().nullable().optional(),
  leadsGoalDataFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const auditFunnelParamSchema = z.object({
  funnelId: z.string().uuid(),
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
    switchyFolderIds: f.switchyFolderIds ?? [],
    switchyLinkedLinks: f.switchyLinkedLinks ?? [],
    compareFunnelId: f.compareFunnelId ?? null,
    matchCode: f.matchCode ?? null,
    leadsGoalMeta: f.leadsGoalMeta ?? null,
    leadsGoalDataFinal: f.leadsGoalDataFinal ?? null,
    lastAuditAt: f.lastAuditAt ?? null,
    lastAuditBy: null as { id: string; name: string } | null,
    auditStatus: f.auditStatus ?? "pending",
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

  // Epic 30 Story 30.2: helper pra disparar background sync histórico Meta.
  // Resolve token a partir do metaAccountId (link projeto → account) e dispara
  // fire-and-forget. Erro de resolução é logado e não bloqueia.
  async function fireBackgroundMetaSync(
    projectId: string,
    metaAccountIdSelected: string,
    newCampaignIds: string[],
  ): Promise<void> {
    if (newCampaignIds.length === 0) return;
    try {
      // Resolver account vinculada ao project (mesma pattern de outras routes)
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
      fastify.log.error({ err, projectId }, "Failed to trigger Meta background sync");
    }
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
      .select({
        funnel: funnels,
        auditUser: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(funnels)
      .leftJoin(users, eq(funnels.lastAuditBy, users.id))
      .where(eq(funnels.projectId, paramResult.data.projectId))
      // Story 10.8: perpétuos primeiro (DESC ordena "perpetual" > "launch"
      // alfabeticamente), depois sort_order manual, com created_at de tiebreak.
      .orderBy(desc(funnels.type), asc(funnels.sortOrder), asc(funnels.createdAt));

    return rows.map((row) => {
      const result = funnelShape(row.funnel);
      if (row.auditUser?.id) {
        result.lastAuditBy = {
          id: row.auditUser.id,
          name: displayUserName(row.auditUser.name, row.auditUser.email),
        };
      }
      return result;
    });
  });

  // ---- PUT /api/projects/:projectId/funnels/reorder ---- (Story 10.8)
  fastify.put("/api/projects/:projectId/funnels/reorder", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

    const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1) });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const project = await getProjectAccess(
      paramResult.data.projectId,
      request.userId,
      request.userRole,
    );
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Carrega todos os funis do projeto pra validar a lista
    const allFunnels = await fastify.db
      .select({ id: funnels.id, type: funnels.type })
      .from(funnels)
      .where(eq(funnels.projectId, paramResult.data.projectId));

    if (allFunnels.length !== body.data.ids.length) {
      return reply
        .code(400)
        .send({ error: "Lista incompleta ou com duplicatas" });
    }

    const idSet = new Set(body.data.ids);
    if (idSet.size !== body.data.ids.length) {
      return reply.code(400).send({ error: "Lista incompleta ou com duplicatas" });
    }

    const typeById = new Map(allFunnels.map((f) => [f.id, f.type] as const));
    for (const id of body.data.ids) {
      if (!typeById.has(id)) {
        return reply.code(400).send({ error: "ID desconhecido" });
      }
    }

    // Hard rule: perpétuos contíguos no início. Assim que ver um launch,
    // nenhum perpetual pode aparecer depois.
    let sawLaunch = false;
    for (const id of body.data.ids) {
      const t = typeById.get(id);
      if (t === "launch") sawLaunch = true;
      else if (t === "perpetual" && sawLaunch) {
        return reply
          .code(400)
          .send({ error: "Perpétuos devem vir antes de lançamentos" });
      }
    }

    // Persistência em transação: N updates triviais pra N funis. Pra Loyola
    // (N tipicamente <20 por projeto) é insignificante e mais robusto que
    // um CASE WHEN dinâmico.
    try {
      await fastify.db.transaction(async (tx) => {
        for (let idx = 0; idx < body.data.ids.length; idx++) {
          await tx
            .update(funnels)
            .set({ sortOrder: idx })
            .where(
              and(
                eq(funnels.id, body.data.ids[idx]),
                eq(funnels.projectId, paramResult.data.projectId),
              ),
            );
        }
      });
    } catch (err) {
      fastify.log.error({ err }, "[funnels-reorder] transaction failed");
      return reply.code(500).send({ error: "Erro ao salvar ordem" });
    }

    return { success: true };
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

    const [funnelRow] = await fastify.db
      .select({
        funnel: funnels,
        auditUser: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(funnels)
      .leftJoin(users, eq(funnels.lastAuditBy, users.id))
      .where(
        and(
          eq(funnels.id, paramResult.data.funnelId),
          eq(funnels.projectId, paramResult.data.projectId),
        ),
      )
      .limit(1);

    if (!funnelRow) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    const result = funnelShape(funnelRow.funnel);
    if (funnelRow.auditUser?.id) {
      result.lastAuditBy = {
        id: funnelRow.auditUser.id,
        name: displayUserName(funnelRow.auditUser.name, funnelRow.auditUser.email),
      };
    }

    return result;
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

    const { name, type, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns, switchyFolderIds, switchyLinkedLinks } = parseResult.data;

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
        switchyFolderIds,
        switchyLinkedLinks,
      })
      .returning();

    // Epic 29 Story 29.6: perpetual não tem conceito de stages — auto-cria 1
    // stage default invisível pra reusar toda a infra de tabs/dashboards sem
    // expor essa noção pro usuário. Launch segue comportamento normal (sem
    // stage até o user criar).
    if (type === "perpetual") {
      await fastify.db.insert(funnelStages).values({
        funnelId: funnel.id,
        name: funnel.name,
        stageType: "paid",
        metaAccountId: funnel.metaAccountId,
        campaigns: funnel.campaigns,
        googleAdsAccountId: funnel.googleAdsAccountId,
        googleAdsCampaigns: funnel.googleAdsCampaigns,
        switchyFolderIds: funnel.switchyFolderIds,
        switchyLinkedLinks: funnel.switchyLinkedLinks,
        sortOrder: 0,
      });
    }

    // Epic 30 Story 30.2: dispara background sync histórico (365d) das campanhas
    // recém-vinculadas. Fire-and-forget — não bloqueia a resposta.
    if (funnel.metaAccountId && funnel.campaigns.length > 0) {
      const campaignIds = funnel.campaigns.map((c) => c.id);
      void fireBackgroundMetaSync(funnel.projectId, funnel.metaAccountId, campaignIds);
    }

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
      .select()
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
    const { name, type, metaAccountId, campaigns, googleAdsAccountId, googleAdsCampaigns, switchyFolderIds, switchyLinkedLinks, compareFunnelId, matchCode, leadsGoalMeta, leadsGoalDataFinal } = parseResult.data;
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (metaAccountId !== undefined) updates.metaAccountId = metaAccountId;
    if (campaigns !== undefined) updates.campaigns = campaigns;
    if (googleAdsAccountId !== undefined) updates.googleAdsAccountId = googleAdsAccountId;
    if (googleAdsCampaigns !== undefined) updates.googleAdsCampaigns = googleAdsCampaigns;
    if (switchyFolderIds !== undefined) updates.switchyFolderIds = switchyFolderIds;
    if (switchyLinkedLinks !== undefined) updates.switchyLinkedLinks = switchyLinkedLinks;
    if (compareFunnelId !== undefined) updates.compareFunnelId = compareFunnelId;
    if (matchCode !== undefined) {
      // Normaliza pra lowercase e trim. String vazia vira null pra desativar alerta.
      const normalized = (matchCode ?? "").trim().toLowerCase();
      updates.matchCode = normalized.length > 0 ? normalized : null;
    }
    if (leadsGoalMeta !== undefined) updates.leadsGoalMeta = leadsGoalMeta;
    if (leadsGoalDataFinal !== undefined) updates.leadsGoalDataFinal = leadsGoalDataFinal;

    const [updated] = await fastify.db
      .update(funnels)
      .set(updates)
      .where(eq(funnels.id, paramResult.data.funnelId))
      .returning();

    // Epic 30 Story 30.2: detecta campanhas adicionadas e dispara sync histórico.
    // metaAccountId pode mudar tb — se mudou, sincroniza todas as novas. Senão,
    // sincroniza só os IDs adicionados em relação ao estado anterior.
    if (campaigns !== undefined) {
      const effectiveMetaAccountId = updated.metaAccountId;
      if (effectiveMetaAccountId) {
        const oldIds = new Set((existing.campaigns ?? []).map((c) => c.id));
        const newCampaignIds = (updated.campaigns ?? [])
          .map((c) => c.id)
          .filter((id) => !oldIds.has(id));
        if (newCampaignIds.length > 0) {
          void fireBackgroundMetaSync(updated.projectId, effectiveMetaAccountId, newCampaignIds);
        }
      }
    }

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

  // ---- GET /api/projects/:projectId/funnels/:funnelId/orphan-campaigns (Epic 25) ----
  // Detecta campanhas Meta Ads cujo nome contém o `match_code` do funil mas NÃO
  // estão selecionadas em nenhuma etapa (e nem no funil legacy). Retorna ainda
  // o breakdown por stage pra UI da etapa diferenciar "órfãs no funil inteiro"
  // de "órfãs nesta etapa específica".
  fastify.get("/api/projects/:projectId/funnels/:funnelId/orphan-campaigns", async (request, reply) => {
    const paramResult = funnelParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

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

    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

    // matchCode default = nome do funil (lowercase). Se o usuário cadastrou um
    // override em funnel.matchCode, usa esse. Permite nomes longos tipo
    // "Lançamento DG-PG02 Abril" matchearem só `dg-pg02`.
    const overrideCode = (funnel.matchCode ?? "").trim().toLowerCase();
    const fallbackCode = (funnel.name ?? "").trim().toLowerCase();
    const matchCode = overrideCode.length > 0 ? overrideCode : fallbackCode;

    if (!matchCode) {
      return {
        hasMatchCode: false,
        matchCode: null,
        totalMatching: 0,
        orphans: [],
        byStage: {},
      };
    }

    // Lista campanhas Meta da conta vinculada ao projeto
    const [link] = await fastify.db
      .select({ accountId: metaAdsAccountProjects.accountId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.projectId, paramResult.data.projectId))
      .limit(1);

    if (!link) {
      return { hasMatchCode: true, matchCode, totalMatching: 0, orphans: [], byStage: {} };
    }

    const [account] = await fastify.db
      .select()
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, link.accountId))
      .limit(1);

    if (!account) {
      return { hasMatchCode: true, matchCode, totalMatching: 0, orphans: [], byStage: {} };
    }

    let allCampaigns: Array<{ id: string; name: string; status: string; objective?: string }> = [];
    try {
      const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);
      const fetched = await fetchCampaigns(account.metaAccountId, token);
      allCampaigns = fetched.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
      }));
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar campanhas da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // Filtra: campanhas cujo nome contém o matchCode (case-insensitive) E não estão DELETED
    const matching = allCampaigns.filter((c) => {
      if (c.status === "DELETED") return false;
      return c.name.toLowerCase().includes(matchCode);
    });

    // Carrega stages do funil
    const stages = await fastify.db
      .select()
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, paramResult.data.funnelId));

    // Sets de IDs selecionados
    const selectedAtFunnel = new Set((funnel.campaigns ?? []).map((c) => c.id));
    const selectedAtAnyStage = new Set<string>();
    for (const stage of stages) {
      for (const c of stage.campaigns ?? []) {
        selectedAtAnyStage.add(c.id);
      }
    }
    const selectedAnywhere = new Set<string>([...selectedAtFunnel, ...selectedAtAnyStage]);

    // Órfãs (nível funil) = matchcam o code mas NÃO estão selecionadas em lugar nenhum
    const orphans = matching.filter((c) => !selectedAnywhere.has(c.id));

    // Ordenação: ACTIVE primeiro, PAUSED, ARCHIVED
    const statusRank: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ARCHIVED: 2 };
    orphans.sort((a, b) => {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

    // byStage: pra cada stage, lista campanhas matching que NÃO estão nessa stage
    // (mesmo que estejam em outras — do ponto de vista DESTA stage, são órfãs).
    // Story 28.1: além do matchCode do funil, filtra também pelo phaseSuffix
    // resolvido a partir de funnel.type + stage.stageType + stage.name. Quando
    // suffix é null (perpétuo, cpl, nome ambíguo) cai no comportamento legacy.
    const byStage: Record<string, { stageName: string; orphans: typeof orphans }> = {};
    for (const stage of stages) {
      const phaseSuffix = resolveStagePhaseSuffix(
        funnel.type as "launch" | "perpetual",
        (stage.stageType ?? "free") as "paid" | "free" | "sales" | "cpl",
        stage.name,
      );
      const selectedHere = new Set((stage.campaigns ?? []).map((c) => c.id));
      const orphansHere = matching
        .filter((c) => !selectedHere.has(c.id))
        .filter((c) => !phaseSuffix || c.name.toLowerCase().includes(phaseSuffix))
        .sort((a, b) => {
          const ra = statusRank[a.status] ?? 99;
          const rb = statusRank[b.status] ?? 99;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
      byStage[stage.id] = { stageName: stage.name, orphans: orphansHere };
    }

    return {
      hasMatchCode: true,
      matchCode,
      totalMatching: matching.length,
      orphans,
      byStage,
    };
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
      // Account IS linked, but campaigns couldn't be fetched (API error, test token, etc)
      fastify.log.error({ err }, "[google-ads-campaigns] failed to fetch campaigns");
      return {
        campaigns: [],
        accountLinked: true,
        accountId: account.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // ---- POST /api/funnels/:funnelId/audit ----
  fastify.post("/api/funnels/:funnelId/audit", async (request, reply) => {
    const paramResult = auditFunnelParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.status(400).send({ error: "Invalid funnel ID" });
    }

    const { funnelId } = paramResult.data;
    const userId = request.userId;

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const [funnel] = await fastify.db
      .select()
      .from(funnels)
      .where(eq(funnels.id, funnelId))
      .limit(1);

    if (!funnel) {
      return reply.status(404).send({ error: "Funnel not found" });
    }

    const now = new Date();
    await fastify.db
      .update(funnels)
      .set({
        lastAuditAt: now,
        lastAuditBy: userId,
        auditStatus: "audited",
        updatedAt: now,
      })
      .where(eq(funnels.id, funnelId));

    const [user] = await fastify.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return reply.send({
      lastAuditAt: now.toISOString(),
      lastAuditBy: {
        id: user?.id || userId,
        name: displayUserName(user?.name, user?.email),
      },
    });
  });
});
