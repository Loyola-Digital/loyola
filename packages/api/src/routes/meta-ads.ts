import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { metaAdsAccounts, metaAdsAccountProjects, projects } from "../db/schema.js";
import { encrypt } from "../services/encryption.js";
import {
  validateMetaAdAccount,
  fetchCampaigns,
  fetchInsights,
  fetchAdSets,
  fetchAds,
  fetchDailyInsights,
  fetchCampaignInsights,
  fetchAdSetInsights,
  fetchAdInsights,
  decryptAccountToken,
} from "../services/meta-ads.js";

// ============================================================
// SCHEMAS
// ============================================================

const createAccountSchema = z.object({
  accountName: z.string().min(1).max(100),
  metaAccountId: z.string().min(1).max(50),
  accessToken: z.string().min(1),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const linkParamSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});

const insightsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function metaAdsRoutes(fastify) {
  // Helper: get account row + check access
  async function getAccountForUser(accountId: string, userRole: string) {
    if (userRole === "guest") return null;
    const rows = await fastify.db
      .select()
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, accountId))
      .limit(1);
    return rows[0] ?? null;
  }

  // ---- POST /api/meta-ads/accounts ----
  fastify.post("/api/meta-ads/accounts", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados invalidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { accountName, metaAccountId, accessToken } = parseResult.data;

    // Validate token against Meta Marketing API
    try {
      await validateMetaAdAccount(metaAccountId, accessToken);
    } catch (err) {
      return reply.code(400).send({
        error: "Token invalido ou conta nao encontrada na Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // Encrypt token
    const { encrypted, iv } = encrypt(accessToken);

    const [account] = await fastify.db
      .insert(metaAdsAccounts)
      .values({
        accountName,
        metaAccountId,
        accessTokenEncrypted: encrypted,
        accessTokenIv: iv,
        createdBy: request.userId,
      })
      .returning();

    return reply.code(201).send({
      id: account.id,
      accountName: account.accountName,
      metaAccountId: account.metaAccountId,
      isActive: account.isActive,
      createdAt: account.createdAt,
    });
  });

  // ---- GET /api/meta-ads/accounts ----
  fastify.get("/api/meta-ads/accounts", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const rows = await fastify.db
      .select({
        id: metaAdsAccounts.id,
        accountName: metaAdsAccounts.accountName,
        metaAccountId: metaAdsAccounts.metaAccountId,
        isActive: metaAdsAccounts.isActive,
        createdAt: metaAdsAccounts.createdAt,
        updatedAt: metaAdsAccounts.updatedAt,
      })
      .from(metaAdsAccounts);

    // Fetch project associations for each account
    const accountIds = rows.map((r) => r.id);
    const associations = accountIds.length > 0
      ? await fastify.db
          .select({
            accountId: metaAdsAccountProjects.accountId,
            projectId: metaAdsAccountProjects.projectId,
            projectName: projects.name,
          })
          .from(metaAdsAccountProjects)
          .innerJoin(projects, eq(metaAdsAccountProjects.projectId, projects.id))
      : [];

    const projectsByAccount = new Map<string, { projectId: string; projectName: string }[]>();
    for (const a of associations) {
      const list = projectsByAccount.get(a.accountId) ?? [];
      list.push({ projectId: a.projectId, projectName: a.projectName });
      projectsByAccount.set(a.accountId, list);
    }

    return rows.map((r) => ({
      ...r,
      projects: projectsByAccount.get(r.id) ?? [],
    }));
  });

  // ---- DELETE /api/meta-ads/accounts/:id ----
  fastify.delete("/api/meta-ads/accounts/:id", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    await fastify.db
      .delete(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, paramResult.data.id));

    return reply.code(204).send();
  });

  // ---- POST /api/meta-ads/accounts/:id/projects/:projectId ----
  fastify.post("/api/meta-ads/accounts/:id/projects/:projectId", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = linkParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parametros invalidos" });
    }

    const { id: accountId, projectId } = paramResult.data;

    // Verify account exists
    const account = await getAccountForUser(accountId, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    // Verify project exists
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return reply.code(404).send({ error: "Projeto nao encontrado" });
    }

    // Check if already linked
    const [existing] = await fastify.db
      .select({ id: metaAdsAccountProjects.id })
      .from(metaAdsAccountProjects)
      .where(
        and(
          eq(metaAdsAccountProjects.accountId, accountId),
          eq(metaAdsAccountProjects.projectId, projectId)
        )
      )
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "Conta ja vinculada a este projeto" });
    }

    const [link] = await fastify.db
      .insert(metaAdsAccountProjects)
      .values({ accountId, projectId })
      .returning();

    return reply.code(201).send(link);
  });

  // ---- DELETE /api/meta-ads/accounts/:id/projects/:projectId ----
  fastify.delete("/api/meta-ads/accounts/:id/projects/:projectId", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = linkParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parametros invalidos" });
    }

    await fastify.db
      .delete(metaAdsAccountProjects)
      .where(
        and(
          eq(metaAdsAccountProjects.accountId, paramResult.data.id),
          eq(metaAdsAccountProjects.projectId, paramResult.data.projectId)
        )
      );

    return reply.code(204).send();
  });

  // ---- GET /api/meta-ads/accounts/:id/campaigns ----
  fastify.get("/api/meta-ads/accounts/:id/campaigns", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(
      account.accessTokenEncrypted,
      account.accessTokenIv
    );

    try {
      const campaigns = await fetchCampaigns(account.metaAccountId, token);
      return campaigns;
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar campanhas da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/meta-ads/accounts/:id/insights ----
  fastify.get("/api/meta-ads/accounts/:id/insights", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const queryResult = insightsQuerySchema.safeParse(request.query);
    const days = queryResult.success ? queryResult.data.days : 30;

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(
      account.accessTokenEncrypted,
      account.accessTokenIv
    );

    try {
      const insights = await fetchInsights(account.metaAccountId, token, days);
      return insights;
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar insights da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/meta-ads/accounts/:id/adsets ----
  fastify.get("/api/meta-ads/accounts/:id/adsets", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const querySchema = z.object({
      campaignId: z.string().min(1),
      days: z.coerce.number().int().min(1).max(90).default(30),
    });
    const queryResult = querySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "campaignId obrigatorio" });
    }

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);

    try {
      const [adsets, insights] = await Promise.all([
        fetchAdSets(account.metaAccountId, token, queryResult.data.campaignId),
        fetchAdSetInsights(account.metaAccountId, token, queryResult.data.campaignId, queryResult.data.days),
      ]);

      // Merge adsets with their insights
      const insightMap = new Map(insights.map((i) => [i.adset_id, i]));
      return adsets.map((as) => ({
        ...as,
        insights: insightMap.get(as.id) ?? null,
      }));
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar ad sets da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/meta-ads/accounts/:id/ads ----
  fastify.get("/api/meta-ads/accounts/:id/ads", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const querySchema = z.object({
      adsetId: z.string().min(1),
      days: z.coerce.number().int().min(1).max(90).default(30),
    });
    const queryResult = querySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "adsetId obrigatorio" });
    }

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);

    try {
      const [ads, insights] = await Promise.all([
        fetchAds(account.metaAccountId, token, queryResult.data.adsetId),
        fetchAdInsights(account.metaAccountId, token, queryResult.data.adsetId, queryResult.data.days),
      ]);

      const insightMap = new Map(insights.map((i) => [i.ad_id, i]));
      return ads.map((ad) => ({
        ...ad,
        insights: insightMap.get(ad.id) ?? null,
      }));
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar ads da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/meta-ads/accounts/:id/insights/daily ----
  fastify.get("/api/meta-ads/accounts/:id/insights/daily", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const queryResult = insightsQuerySchema.safeParse(request.query);
    const days = queryResult.success ? queryResult.data.days : 30;

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);

    try {
      const daily = await fetchDailyInsights(account.metaAccountId, token, days);
      return daily;
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar insights diarios da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET /api/meta-ads/accounts/:id/insights/campaigns ----
  fastify.get("/api/meta-ads/accounts/:id/insights/campaigns", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const queryResult = insightsQuerySchema.safeParse(request.query);
    const days = queryResult.success ? queryResult.data.days : 30;

    const account = await getAccountForUser(paramResult.data.id, request.userRole);
    if (!account) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    const token = decryptAccountToken(account.accessTokenEncrypted, account.accessTokenIv);

    try {
      const campaignInsights = await fetchCampaignInsights(account.metaAccountId, token, days);
      return campaignInsights;
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao buscar insights por campanha da Meta",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
