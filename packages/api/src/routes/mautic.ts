import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  mauticConnections,
  funnelStageMauticCampaigns,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import {
  encryptMauticPassword,
  decryptMauticPassword,
  testMauticConnection,
  listMauticCampaigns,
  getMauticCampaignEmailStats,
  matchCampaignByName,
  type MauticCampaign,
} from "../services/mautic.js";

// ============================================================
// Story 32.1 — Integração Mautic
// Conexão por projeto + vínculo de campanha por etapa (auto-match/manual).
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const connectionBodySchema = z.object({
  baseUrl: z.string().url("URL inválida (ex.: https://mautic.seudominio.com)"),
  username: z.string().min(1),
  password: z.string().min(1),
});

const linkBodySchema = z.union([
  z.object({ auto: z.literal(true) }),
  z.object({
    campaignId: z.string().min(1),
    campaignName: z.string().min(1).max(500),
  }),
]);

/** Token de auto-match a partir do nome do funil: 2 primeiros segmentos
 * (ex.: "fz-l2-jun-26" → "fz-l2"). Fallback: nome inteiro. */
function funnelMatchToken(funnelName: string): string {
  const segs = funnelName.trim().split("-").filter(Boolean);
  if (segs.length >= 2) return `${segs[0]}-${segs[1]}`;
  return funnelName.trim();
}

export default fp(async function mauticRoutes(fastify) {
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

  /** Retorna stage + nome do funil (pro auto-match) ou null se não bater. */
  async function getStageWithFunnel(projectId: string, funnelId: string, stageId: string) {
    const [row] = await fastify.db
      .select({ stageId: funnelStages.id, funnelName: funnels.name })
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
    return row ?? null;
  }

  async function getConnectionRow(projectId: string) {
    const [row] = await fastify.db
      .select()
      .from(mauticConnections)
      .where(eq(mauticConnections.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  /** Credenciais decifradas da conexão do projeto, ou null se não conectado. */
  async function getCreds(projectId: string) {
    const row = await getConnectionRow(projectId);
    if (!row) return null;
    try {
      const password = decryptMauticPassword(row.passwordEncrypted, row.passwordIv);
      return { baseUrl: row.baseUrl, username: row.username, password };
    } catch {
      return null;
    }
  }

  // ---- GET connection (status, sem senha) ----
  fastify.get("/api/projects/:projectId/mautic/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const row = await getConnectionRow(params.data.projectId);
    if (!row) return { connected: false };
    return { connected: true, baseUrl: row.baseUrl, username: row.username };
  });

  // ---- PUT connection (testa credenciais, criptografa e salva) ----
  fastify.put("/api/projects/:projectId/mautic/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Valida credenciais antes de persistir.
    try {
      await testMauticConnection(body.data.baseUrl, body.data.username, body.data.password);
    } catch (err) {
      return reply.code(502).send({
        error: "Falha ao conectar no Mautic. Verifique URL, usuário/senha e se o Basic Auth está habilitado.",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const enc = encryptMauticPassword(body.data.password);
    const now = new Date();
    await fastify.db
      .insert(mauticConnections)
      .values({
        projectId: params.data.projectId,
        baseUrl: body.data.baseUrl,
        username: body.data.username,
        passwordEncrypted: enc.encrypted,
        passwordIv: enc.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: mauticConnections.projectId,
        set: {
          baseUrl: body.data.baseUrl,
          username: body.data.username,
          passwordEncrypted: enc.encrypted,
          passwordIv: enc.iv,
          updatedAt: now,
        },
      });

    return { connected: true, baseUrl: body.data.baseUrl, username: body.data.username };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/mautic/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db.delete(mauticConnections).where(eq(mauticConnections.projectId, params.data.projectId));
    return { connected: false };
  });

  // ---- GET campanhas (lista pra seleção manual) ----
  fastify.get("/api/projects/:projectId/mautic/campaigns", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await getCreds(params.data.projectId);
    if (!creds) return reply.code(409).send({ error: "Mautic não conectado neste projeto" });

    try {
      const campaigns = await listMauticCampaigns(creds.baseUrl, creds.username, creds.password);
      return { campaigns };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao listar campanhas do Mautic",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET vínculo da etapa + sugestão de auto-match ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/mautic-campaign",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStageWithFunnel(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [link] = await fastify.db
        .select()
        .from(funnelStageMauticCampaigns)
        .where(eq(funnelStageMauticCampaigns.stageId, params.data.stageId))
        .limit(1);

      const linked = link
        ? {
            campaignId: link.mauticCampaignId,
            campaignName: link.mauticCampaignName,
            matchMode: link.matchMode,
          }
        : null;

      // Sugestão de auto-match (só calcula se conectado e ainda sem vínculo).
      let suggested: MauticCampaign | null = null;
      const matchToken = funnelMatchToken(stage.funnelName);
      if (!linked) {
        const creds = await getCreds(params.data.projectId);
        if (creds) {
          try {
            const campaigns = await listMauticCampaigns(creds.baseUrl, creds.username, creds.password);
            suggested = matchCampaignByName(campaigns, matchToken);
          } catch {
            suggested = null;
          }
        }
      }

      return { linked, suggested, matchToken };
    },
  );

  // ---- PUT vínculo (auto pelo nome do funil OU manual) ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/mautic-campaign",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = linkBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStageWithFunnel(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      let campaignId: string;
      let campaignName: string;
      let matchMode: "auto" | "manual";

      if ("auto" in body.data) {
        const creds = await getCreds(params.data.projectId);
        if (!creds) return reply.code(409).send({ error: "Mautic não conectado neste projeto" });
        let matched: MauticCampaign | null = null;
        try {
          const campaigns = await listMauticCampaigns(creds.baseUrl, creds.username, creds.password);
          matched = matchCampaignByName(campaigns, funnelMatchToken(stage.funnelName));
        } catch (err) {
          return reply.code(502).send({
            error: "Erro ao buscar campanhas pro auto-match",
            details: err instanceof Error ? err.message : String(err),
          });
        }
        if (!matched) {
          return reply.code(404).send({
            error: `Nenhuma campanha Mautic casou com "${funnelMatchToken(stage.funnelName)}". Selecione manualmente.`,
          });
        }
        campaignId = matched.id;
        campaignName = matched.name;
        matchMode = "auto";
      } else {
        campaignId = body.data.campaignId;
        campaignName = body.data.campaignName;
        matchMode = "manual";
      }

      const now = new Date();
      await fastify.db
        .insert(funnelStageMauticCampaigns)
        .values({ stageId: params.data.stageId, mauticCampaignId: campaignId, mauticCampaignName: campaignName, matchMode, updatedAt: now })
        .onConflictDoUpdate({
          target: funnelStageMauticCampaigns.stageId,
          set: { mauticCampaignId: campaignId, mauticCampaignName: campaignName, matchMode, updatedAt: now },
        });

      return { linked: { campaignId, campaignName, matchMode } };
    },
  );

  // ---- DELETE vínculo ----
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/mautic-campaign",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      await fastify.db
        .delete(funnelStageMauticCampaigns)
        .where(eq(funnelStageMauticCampaigns.stageId, params.data.stageId));
      return { linked: null };
    },
  );

  // ---- GET métricas de email da campanha vinculada ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/mautic-metrics",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [link] = await fastify.db
        .select()
        .from(funnelStageMauticCampaigns)
        .where(eq(funnelStageMauticCampaigns.stageId, params.data.stageId))
        .limit(1);
      if (!link) return reply.code(404).send({ error: "Etapa sem campanha Mautic vinculada" });

      const creds = await getCreds(params.data.projectId);
      if (!creds) return reply.code(409).send({ error: "Mautic não conectado neste projeto" });

      try {
        const stats = await getMauticCampaignEmailStats(
          creds.baseUrl,
          creds.username,
          creds.password,
          link.mauticCampaignId,
        );
        return { campaignName: link.mauticCampaignName, ...stats };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar métricas do Mautic",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
});
