import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { instagramAccounts, instagramMetricsCache } from "../db/schema.js";
import { encrypt } from "../services/encryption.js";
import { InstagramApiError } from "../services/instagram.js";

// ============================================================
// SCHEMAS
// ============================================================

const createAccountSchema = z.object({
  accountName: z.string().min(1).max(100),
  accessToken: z.string().min(1),
  projectId: z.string().uuid().optional(),
});

const accountsQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
});

const updateAccountSchema = z.object({
  accountName: z.string().min(1).max(100).optional(),
  accessToken: z.string().min(1).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const insightsQuerySchema = z.object({
  period: z.enum(["day", "week", "days_28"]).default("day"),
  since: z.coerce.number().optional(),
  until: z.coerce.number().optional(),
});

const mediaQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
});

// ============================================================
// HELPERS
// ============================================================

function errorResponse(error: unknown): { error: string; code?: string } {
  if (error instanceof InstagramApiError) {
    return { error: error.message, code: `INSTAGRAM_${error.statusCode}` };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: "Erro desconhecido" };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function instagramRoutes(fastify) {
  // ---- Account lookup helper ----
  async function getAccount(accountId: string) {
    const rows = await fastify.db
      .select()
      .from(instagramAccounts)
      .where(eq(instagramAccounts.id, accountId))
      .limit(1);

    return rows.length > 0 ? rows[0] : null;
  }

  // ---- POST /api/instagram/accounts ----
  fastify.post("/api/instagram/accounts", async (request, reply) => {
    const parseResult = createAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { accountName, accessToken, projectId } = parseResult.data;
    const userId = request.userId;

    try {
      // Validate token via Graph API
      const profile = await fastify.instagramService.validateToken(accessToken);

      // Check for duplicate instagram_user_id
      // profile.id comes from the Graph API as a string, but can be parsed as a
      // number by JSON.parse when it fits in a float — force string to avoid
      // type mismatch against the varchar column.
      const instagramUserId = String(profile.id);

      const existing = await fastify.db
        .select({ id: instagramAccounts.id })
        .from(instagramAccounts)
        .where(eq(instagramAccounts.instagramUserId, instagramUserId))
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({
          error: "Esta conta do Instagram já está cadastrada",
          code: "DUPLICATE_ACCOUNT",
        });
      }

      // Encrypt token
      const { encrypted, iv } = encrypt(accessToken);

      // Save account
      const [account] = await fastify.db
        .insert(instagramAccounts)
        .values({
          userId,
          accountName,
          projectId: projectId ?? null,
          instagramUserId,
          instagramUsername: profile.username,
          accessTokenEncrypted: encrypted,
          accessTokenIv: iv,
          profilePictureUrl: profile.profile_picture_url ?? null,
        })
        .returning();

      return reply.code(201).send({
        id: account.id,
        accountName: account.accountName,
        instagramUsername: account.instagramUsername,
        instagramUserId: account.instagramUserId,
        profilePictureUrl: account.profilePictureUrl,
        projectId: account.projectId,
        isActive: account.isActive,
        tokenExpiresAt: account.tokenExpiresAt,
        createdAt: account.createdAt,
      });
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

  // ---- GET /api/instagram/accounts ----
  fastify.get("/api/instagram/accounts", async (request, reply) => {
    const queryResult = accountsQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    const userId = request.userId;
    const { project_id: projectId } = queryResult.data;

    const whereClause = projectId
      ? and(eq(instagramAccounts.userId, userId), eq(instagramAccounts.projectId, projectId))
      : eq(instagramAccounts.userId, userId);

    const accounts = await fastify.db
      .select({
        id: instagramAccounts.id,
        accountName: instagramAccounts.accountName,
        instagramUsername: instagramAccounts.instagramUsername,
        instagramUserId: instagramAccounts.instagramUserId,
        profilePictureUrl: instagramAccounts.profilePictureUrl,
        projectId: instagramAccounts.projectId,
        isActive: instagramAccounts.isActive,
        lastSyncedAt: instagramAccounts.lastSyncedAt,
        tokenExpiresAt: instagramAccounts.tokenExpiresAt,
        createdAt: instagramAccounts.createdAt,
      })
      .from(instagramAccounts)
      .where(whereClause);

    return accounts;
  });

  // ---- GET /api/instagram/accounts/:id ----
  fastify.get("/api/instagram/accounts/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    return {
      id: account.id,
      accountName: account.accountName,
      instagramUsername: account.instagramUsername,
      instagramUserId: account.instagramUserId,
      profilePictureUrl: account.profilePictureUrl,
      isActive: account.isActive,
      lastSyncedAt: account.lastSyncedAt,
      tokenExpiresAt: account.tokenExpiresAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  });

  // ---- PUT /api/instagram/accounts/:id ----
  fastify.put("/api/instagram/accounts/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const parseResult = updateAccountSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (parseResult.data.accountName) {
      updates.accountName = parseResult.data.accountName;
    }

    if (parseResult.data.accessToken) {
      try {
        // Validate new token
        const profile = await fastify.instagramService.validateToken(
          parseResult.data.accessToken,
        );
        const { encrypted, iv } = encrypt(parseResult.data.accessToken);
        updates.accessTokenEncrypted = encrypted;
        updates.accessTokenIv = iv;
        updates.instagramUsername = profile.username;
      } catch (error) {
        if (error instanceof InstagramApiError) {
          return reply.code(error.statusCode).send(errorResponse(error));
        }
        throw error;
      }
    }

    const [updated] = await fastify.db
      .update(instagramAccounts)
      .set(updates)
      .where(eq(instagramAccounts.id, paramResult.data.id))
      .returning();

    return {
      id: updated.id,
      accountName: updated.accountName,
      instagramUsername: updated.instagramUsername,
      instagramUserId: updated.instagramUserId,
      profilePictureUrl: updated.profilePictureUrl,
      isActive: updated.isActive,
      tokenExpiresAt: updated.tokenExpiresAt,
      updatedAt: updated.updatedAt,
    };
  });

  // ---- DELETE /api/instagram/accounts/:id ----
  fastify.delete("/api/instagram/accounts/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    // Delete cache first to avoid FK violations if cascade isn't set in DB
    await fastify.db
      .delete(instagramMetricsCache)
      .where(eq(instagramMetricsCache.accountId, paramResult.data.id));

    await fastify.db
      .delete(instagramAccounts)
      .where(eq(instagramAccounts.id, paramResult.data.id));

    return reply.code(204).send();
  });

  // ---- GET /api/instagram/accounts/:id/profile ----
  fastify.get("/api/instagram/accounts/:id/profile", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    try {
      return await fastify.instagramService.getProfile(paramResult.data.id);
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

  // ---- GET /api/instagram/accounts/:id/insights ----
  fastify.get(
    "/api/instagram/accounts/:id/insights",
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID inválido" });
      }

      const account = await getAccount(paramResult.data.id);
      if (!account) {
        return reply.code(404).send({ error: "Conta não encontrada" });
      }

      const queryResult = insightsQuerySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }

      const { period } = queryResult.data;
      const now = Math.floor(Date.now() / 1000);
      const since = queryResult.data.since ?? now - 30 * 24 * 60 * 60; // default 30 days
      const until = queryResult.data.until ?? now;

      try {
        const data = await fastify.instagramService.getAccountInsights(
          paramResult.data.id,
          period,
          since,
          until,
        );

        return {
          period,
          since: new Date(since * 1000).toISOString().split("T")[0],
          until: new Date(until * 1000).toISOString().split("T")[0],
          data,
        };
      } catch (error) {
        if (error instanceof InstagramApiError) {
          return reply.code(error.statusCode).send(errorResponse(error));
        }
        throw error;
      }
    },
  );

  // ---- GET /api/instagram/accounts/:id/media ----
  fastify.get("/api/instagram/accounts/:id/media", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    const queryResult = mediaQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    try {
      return await fastify.instagramService.getMediaList(
        paramResult.data.id,
        queryResult.data.limit,
        queryResult.data.after,
      );
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

  // ---- GET /api/instagram/accounts/:id/demographics ----
  fastify.get(
    "/api/instagram/accounts/:id/demographics",
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID inválido" });
      }

      const account = await getAccount(paramResult.data.id);
      if (!account) {
        return reply.code(404).send({ error: "Conta não encontrada" });
      }

      try {
        return await fastify.instagramService.getAudienceDemographics(
          paramResult.data.id,
        );
      } catch (error) {
        if (error instanceof InstagramApiError) {
          return reply.code(error.statusCode).send(errorResponse(error));
        }
        throw error;
      }
    },
  );

  // ---- GET /api/instagram/accounts/:id/stories ----
  fastify.get("/api/instagram/accounts/:id/stories", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    try {
      return await fastify.instagramService.getStories(paramResult.data.id);
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

  // ---- GET /api/instagram/accounts/:id/reels ----
  fastify.get("/api/instagram/accounts/:id/reels", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const account = await getAccount(paramResult.data.id);
    if (!account) {
      return reply.code(404).send({ error: "Conta não encontrada" });
    }

    try {
      return await fastify.instagramService.getReels(paramResult.data.id);
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

  // ---- POST /api/instagram/accounts/:id/refresh ----
  fastify.post(
    "/api/instagram/accounts/:id/refresh",
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID inválido" });
      }

      const account = await getAccount(paramResult.data.id);
      if (!account) {
        return reply.code(404).send({ error: "Conta não encontrada" });
      }

      await fastify.instagramService.invalidateCache(paramResult.data.id);

      return { message: "Cache invalidado com sucesso" };
    },
  );
});
