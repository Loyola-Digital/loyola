import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  googleAdsAccounts,
  googleAdsAccountProjects,
  projects,
} from "../db/schema.js";
import { encrypt } from "../services/encryption.js";
import {
  validateGoogleAdsAccount,
  normalizeCustomerId,
  decryptToken,
  getGoogleOAuthUrl,
  exchangeGoogleCode,
  listAccessibleAccounts,
} from "../services/google-ads.js";

// ============================================================
// SCHEMAS
// ============================================================

const createAccountSchema = z.object({
  accountName: z.string().min(1).max(100),
  customerId: z.string().min(1).max(20),
  developerToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const linkParamSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function googleAdsRoutes(fastify) {
  // ---- POST /api/google-ads/accounts ----
  fastify.post("/api/google-ads/accounts", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados invalidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { accountName, customerId, developerToken, refreshToken } =
      parseResult.data;
    const normalizedId = normalizeCustomerId(customerId);

    // Validate credentials against Google Ads API
    try {
      await validateGoogleAdsAccount(normalizedId, developerToken, refreshToken);
    } catch (err) {
      return reply.code(400).send({
        error: "Credenciais invalidas ou conta nao encontrada no Google Ads",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    // Encrypt tokens
    const devTokenEnc = encrypt(developerToken);
    const refreshTokenEnc = encrypt(refreshToken);

    try {
      const [account] = await fastify.db
        .insert(googleAdsAccounts)
        .values({
          accountName,
          customerId: normalizedId,
          developerTokenEncrypted: devTokenEnc.encrypted,
          developerTokenIv: devTokenEnc.iv,
          refreshTokenEncrypted: refreshTokenEnc.encrypted,
          refreshTokenIv: refreshTokenEnc.iv,
          createdBy: request.userId!,
        })
        .returning({
          id: googleAdsAccounts.id,
          accountName: googleAdsAccounts.accountName,
          customerId: googleAdsAccounts.customerId,
          isActive: googleAdsAccounts.isActive,
          createdAt: googleAdsAccounts.createdAt,
          updatedAt: googleAdsAccounts.updatedAt,
        });

      return reply.code(201).send(account);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("uq_google_ads_customer_id")
      ) {
        return reply.code(409).send({ error: "Conta ja cadastrada" });
      }
      throw err;
    }
  });

  // ---- GET /api/google-ads/accounts ----
  fastify.get("/api/google-ads/accounts", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const rows = await fastify.db
      .select({
        id: googleAdsAccounts.id,
        accountName: googleAdsAccounts.accountName,
        customerId: googleAdsAccounts.customerId,
        isActive: googleAdsAccounts.isActive,
        createdAt: googleAdsAccounts.createdAt,
        updatedAt: googleAdsAccounts.updatedAt,
        projectId: googleAdsAccountProjects.projectId,
        projectName: projects.name,
      })
      .from(googleAdsAccounts)
      .leftJoin(
        googleAdsAccountProjects,
        eq(googleAdsAccounts.id, googleAdsAccountProjects.accountId)
      )
      .leftJoin(
        projects,
        eq(googleAdsAccountProjects.projectId, projects.id)
      );

    // Group by account
    const accountMap = new Map<
      string,
      {
        id: string;
        accountName: string;
        customerId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        projects: { projectId: string; projectName: string }[];
      }
    >();

    for (const row of rows) {
      if (!accountMap.has(row.id)) {
        accountMap.set(row.id, {
          id: row.id,
          accountName: row.accountName,
          customerId: row.customerId,
          isActive: row.isActive,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          projects: [],
        });
      }
      if (row.projectId && row.projectName) {
        accountMap.get(row.id)!.projects.push({
          projectId: row.projectId,
          projectName: row.projectName,
        });
      }
    }

    return Array.from(accountMap.values());
  });

  // ---- DELETE /api/google-ads/accounts/:id ----
  fastify.delete("/api/google-ads/accounts/:id", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID invalido" });
    }

    const deleted = await fastify.db
      .delete(googleAdsAccounts)
      .where(eq(googleAdsAccounts.id, paramResult.data.id))
      .returning({ id: googleAdsAccounts.id });

    if (deleted.length === 0) {
      return reply.code(404).send({ error: "Conta nao encontrada" });
    }

    return { success: true };
  });

  // ---- POST /api/google-ads/accounts/:id/projects/:projectId ----
  fastify.post(
    "/api/google-ads/accounts/:id/projects/:projectId",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = linkParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      try {
        await fastify.db.insert(googleAdsAccountProjects).values({
          accountId: paramResult.data.id,
          projectId: paramResult.data.projectId,
        });
        return { success: true };
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes("uq_google_ads_account_project")
        ) {
          return reply.code(409).send({ error: "Projeto ja vinculado" });
        }
        throw err;
      }
    }
  );

  // ---- DELETE /api/google-ads/accounts/:id/projects/:projectId ----
  fastify.delete(
    "/api/google-ads/accounts/:id/projects/:projectId",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const paramResult = linkParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      await fastify.db
        .delete(googleAdsAccountProjects)
        .where(
          and(
            eq(googleAdsAccountProjects.accountId, paramResult.data.id),
            eq(
              googleAdsAccountProjects.projectId,
              paramResult.data.projectId
            )
          )
        );

      return { success: true };
    }
  );

  // ============================================================
  // OAUTH FLOW
  // ============================================================

  // ---- GET /api/google-ads/auth/url ----
  fastify.get("/api/google-ads/auth/url", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const origin = (request.query as { origin?: string }).origin
      ?? fastify.config.CORS_ORIGIN
      ?? "http://localhost:3000";
    const redirectUri = `${origin}/settings/google-ads/callback`;

    try {
      const url = getGoogleOAuthUrl(redirectUri);
      return { url, redirectUri };
    } catch (err) {
      return reply.code(500).send({
        error: "Google OAuth nao configurado",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- POST /api/google-ads/auth/callback ----
  const callbackSchema = z.object({
    code: z.string().min(1),
    redirectUri: z.string().url(),
  });

  fastify.post("/api/google-ads/auth/callback", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parseResult = callbackSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "code e redirectUri obrigatorios" });
    }

    try {
      fastify.log.info("[google-ads-auth] exchanging code for tokens...");
      const { accessToken, refreshToken } = await exchangeGoogleCode(
        parseResult.data.code,
        parseResult.data.redirectUri
      );
      fastify.log.info("[google-ads-auth] tokens received, listing accounts...");

      let accounts: Awaited<ReturnType<typeof listAccessibleAccounts>> = [];
      try {
        accounts = await listAccessibleAccounts(accessToken);
        fastify.log.info(`[google-ads-auth] found ${accounts.length} accessible accounts`);
      } catch (listErr) {
        fastify.log.error({ err: listErr }, "[google-ads-auth] listAccessibleAccounts failed — returning empty list");
        // Still return the refresh token so user can connect manually
      }

      return { refreshToken, accounts };
    } catch (err) {
      fastify.log.error({ err }, "[google-ads-auth] callback failed");
      return reply.code(400).send({
        error: "Falha na autenticacao",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- POST /api/google-ads/auth/connect ----
  const connectSchema = z.object({
    accountName: z.string().min(1).max(100),
    customerId: z.string().min(1).max(20),
    refreshToken: z.string().min(1),
  });

  fastify.post("/api/google-ads/auth/connect", async (request, reply) => {
    if (request.userRole === "guest") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parseResult = connectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Dados invalidos" });
    }

    const { accountName, customerId, refreshToken } = parseResult.data;
    const normalizedId = normalizeCustomerId(customerId);
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";

    // Encrypt tokens
    const devTokenEnc = encrypt(developerToken);
    const refreshTokenEnc = encrypt(refreshToken);

    try {
      const [account] = await fastify.db
        .insert(googleAdsAccounts)
        .values({
          accountName,
          customerId: normalizedId,
          developerTokenEncrypted: devTokenEnc.encrypted,
          developerTokenIv: devTokenEnc.iv,
          refreshTokenEncrypted: refreshTokenEnc.encrypted,
          refreshTokenIv: refreshTokenEnc.iv,
          createdBy: request.userId!,
        })
        .returning({
          id: googleAdsAccounts.id,
          accountName: googleAdsAccounts.accountName,
          customerId: googleAdsAccounts.customerId,
          isActive: googleAdsAccounts.isActive,
          createdAt: googleAdsAccounts.createdAt,
          updatedAt: googleAdsAccounts.updatedAt,
        });

      return reply.code(201).send(account);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("uq_google_ads_customer_id")) {
        return reply.code(409).send({ error: "Conta ja cadastrada" });
      }
      throw err;
    }
  });
});
