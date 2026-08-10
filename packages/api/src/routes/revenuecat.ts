import { z } from "zod";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import fp from "fastify-plugin";
import {
  revenuecatConnections,
  revenuecatStageConfig,
  revenuecatSales,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import {
  encryptRevenuecatKey,
  decryptRevenuecatKey,
  verifyRevenuecatKey,
  listRevenuecatProjects,
  REVENUE_EVENT_TYPES,
} from "../services/revenuecat.js";

// ============================================================
// Etapa Lyrio — Rotas RevenueCat
// Conexão POR PROJETO (Secret API Key v2) + config POR ETAPA (rcProjectId +
// webhook token) + agregação de vendas (vinda dos webhooks).
//
// SEGURANÇA: GET connection devolve só { connected }. NUNCA serializar a key, o
// token do webhook (exceto pra não-guest que configura) nem app_user_id (PII).
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const connectionBodySchema = z.object({
  apiKey: z.string().min(10, "Secret API Key inválida"),
});

const configBodySchema = z.object({
  rcProjectId: z.string().max(64).nullable().optional(),
  label: z.string().max(255).nullable().optional(),
});

const salesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

const REVENUE_TYPES = [...REVENUE_EVENT_TYPES];

export default fp(async function revenuecatRoutes(fastify) {
  // Acesso ao projeto (espelho de kiwify/mautic): guest sem vínculo -> null (404).
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

  /** Confere que a etapa existe e pertence ao funil/projeto. */
  async function getStage(projectId: string, funnelId: string, stageId: string) {
    const [row] = await fastify.db
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
    return row ?? null;
  }

  async function getApiKey(projectId: string): Promise<string | null> {
    const [row] = await fastify.db
      .select()
      .from(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, projectId))
      .limit(1);
    if (!row) return null;
    try {
      return decryptRevenuecatKey(row.apiKeyEncrypted, row.apiKeyIv);
    } catch {
      return null;
    }
  }

  // ---- GET connection (status, sem a key) ----
  fastify.get("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [row] = await fastify.db
      .select({ id: revenuecatConnections.id })
      .from(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, params.data.projectId))
      .limit(1);
    return { connected: Boolean(row) };
  });

  // ---- PUT connection (valida a key, criptografa, salva) ----
  fastify.put("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    try {
      await verifyRevenuecatKey(body.data.apiKey);
    } catch (err) {
      request.log.error(err, "RevenueCat connection validation failed");
      return reply.code(502).send({
        error: "Falha ao conectar no RevenueCat. Verifique a Secret API Key (v2).",
      });
    }

    const enc = encryptRevenuecatKey(body.data.apiKey);
    const now = new Date();
    await fastify.db
      .insert(revenuecatConnections)
      .values({
        projectId: params.data.projectId,
        apiKeyEncrypted: enc.encrypted,
        apiKeyIv: enc.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: revenuecatConnections.projectId,
        set: { apiKeyEncrypted: enc.encrypted, apiKeyIv: enc.iv, updatedAt: now },
      });
    return { connected: true };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, params.data.projectId));
    return { connected: false };
  });

  // ---- GET projects (lista os projects do RevenueCat pro dropdown) ----
  fastify.get("/api/projects/:projectId/revenuecat/projects", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const apiKey = await getApiKey(params.data.projectId);
    if (!apiKey) return reply.code(409).send({ error: "RevenueCat não conectado neste projeto" });

    try {
      const rcProjects = await listRevenuecatProjects(apiKey);
      return { projects: rcProjects };
    } catch (err) {
      request.log.error(err, "Erro ao listar projects do RevenueCat");
      return reply.code(502).send({ error: "Erro ao listar projects do RevenueCat" });
    }
  });

  // ---- GET stage config (rcProjectId + label + webhook p/ não-guest) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/config",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [row] = await fastify.db
        .select()
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      // Token do webhook é segredo de config — só não-guest recebe.
      const webhook =
        request.userRole !== "guest" && row?.webhookToken
          ? { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token: row.webhookToken }
          : null;

      return {
        rcProjectId: row?.rcProjectId ?? null,
        label: row?.label ?? null,
        webhook,
      };
    },
  );

  // ---- PUT stage config (upsert rcProjectId/label; garante linha) ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/config",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = configBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const now = new Date();
      await fastify.db
        .insert(revenuecatStageConfig)
        .values({
          stageId: params.data.stageId,
          projectId: params.data.projectId,
          rcProjectId: body.data.rcProjectId ?? null,
          label: body.data.label ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: revenuecatStageConfig.stageId,
          set: {
            rcProjectId: body.data.rcProjectId ?? null,
            label: body.data.label ?? null,
            updatedAt: now,
          },
        });
      return { ok: true };
    },
  );

  // ---- GET webhook (gera token na 1ª vez; devolve path + token) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/webhook",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [existing] = await fastify.db
        .select({ id: revenuecatStageConfig.id, webhookToken: revenuecatStageConfig.webhookToken })
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      let token = existing?.webhookToken ?? null;
      const now = new Date();
      if (!token) {
        token = randomBytes(24).toString("hex");
        if (existing) {
          await fastify.db
            .update(revenuecatStageConfig)
            .set({ webhookToken: token, updatedAt: now })
            .where(eq(revenuecatStageConfig.stageId, params.data.stageId));
        } else {
          await fastify.db.insert(revenuecatStageConfig).values({
            stageId: params.data.stageId,
            projectId: params.data.projectId,
            webhookToken: token,
            updatedAt: now,
          });
        }
      }
      return { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token };
    },
  );

  // ---- POST webhook/rotate (revoga token antigo, gera novo) ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/webhook/rotate",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const token = randomBytes(24).toString("hex");
      const now = new Date();
      await fastify.db
        .insert(revenuecatStageConfig)
        .values({
          stageId: params.data.stageId,
          projectId: params.data.projectId,
          webhookToken: token,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: revenuecatStageConfig.stageId,
          set: { webhookToken: token, updatedAt: now },
        });
      return { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token };
    },
  );

  // ---- GET sales (agregação das vendas vindas do webhook) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/sales",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const cutoff = new Date(Date.now() - query.data.days * 86_400_000);
      // Só eventos que contam como venda (receita nova), na janela.
      const scope = and(
        eq(revenuecatSales.stageId, params.data.stageId),
        gte(revenuecatSales.purchasedAt, cutoff),
        inArray(revenuecatSales.eventType, REVENUE_TYPES),
      );

      const [totals] = await fastify.db
        .select({
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope);

      const byCurrency = await fastify.db
        .select({
          currency: revenuecatSales.currency,
          revenue: sql<number>`coalesce(sum(${revenuecatSales.priceInPurchasedCurrency}), 0)::float8`,
          sales: sql<number>`count(*)::int`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.currency);

      const daily = await fastify.db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${revenuecatSales.purchasedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      const byStore = await fastify.db
        .select({
          store: revenuecatSales.store,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.store);

      const byProduct = await fastify.db
        .select({
          productId: revenuecatSales.productId,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.productId)
        .orderBy(sql`2 desc`)
        .limit(20);

      return {
        days: query.data.days,
        totalSales: totals?.sales ?? 0,
        revenueUsd: totals?.revenueUsd ?? 0,
        byCurrency: byCurrency.filter((c) => c.currency),
        daily,
        byStore: byStore.filter((s) => s.store),
        byProduct: byProduct.filter((p) => p.productId),
      };
    },
  );
});
