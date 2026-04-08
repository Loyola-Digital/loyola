import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import { instagramAccounts, instagramMetricsCache, instagramAccountProjects } from "../db/schema.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { InstagramApiError } from "../services/instagram.js";

// ============================================================
// SCHEMAS
// ============================================================

const createAccountSchema = z.object({
  accountName: z.string().min(1).max(100),
  accessToken: z.string().min(1),
  projectIds: z.array(z.string().uuid()).optional(),
});

const accountsQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
});

const updateAccountSchema = z.object({
  accountName: z.string().min(1).max(100).optional(),
  accessToken: z.string().min(1).optional(),
});

const linkProjectSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
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

    const { accountName, accessToken, projectIds } = parseResult.data;
    const userId = request.userId;

    try {
      // Validate token via Graph API
      const profile = await fastify.instagramService.validateToken(accessToken);

      // Check for duplicate instagram_user_id
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
          instagramUserId,
          instagramUsername: profile.username,
          accessTokenEncrypted: encrypted,
          accessTokenIv: iv,
          profilePictureUrl: profile.profile_picture_url ?? null,
        })
        .returning();

      // Link to projects if provided
      if (projectIds && projectIds.length > 0) {
        await fastify.db
          .insert(instagramAccountProjects)
          .values(projectIds.map((pid) => ({ accountId: account.id, projectId: pid })))
          .onConflictDoNothing();
      }

      return reply.code(201).send({
        id: account.id,
        accountName: account.accountName,
        instagramUsername: account.instagramUsername,
        instagramUserId: account.instagramUserId,
        profilePictureUrl: account.profilePictureUrl,
        projectIds: projectIds ?? [],
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
    const userRole = request.userRole;
    const { project_id: filterProjectId } = queryResult.data;

    // Guests see only their own accounts; all other roles see ALL accounts
    const isGuest = userRole === "guest";

    // Fetch base accounts
    const baseQuery = fastify.db
      .select({
        id: instagramAccounts.id,
        accountName: instagramAccounts.accountName,
        instagramUsername: instagramAccounts.instagramUsername,
        instagramUserId: instagramAccounts.instagramUserId,
        profilePictureUrl: instagramAccounts.profilePictureUrl,
        isActive: instagramAccounts.isActive,
        lastSyncedAt: instagramAccounts.lastSyncedAt,
        tokenExpiresAt: instagramAccounts.tokenExpiresAt,
        createdAt: instagramAccounts.createdAt,
      })
      .from(instagramAccounts);

    const accountRows = isGuest
      ? await baseQuery.where(eq(instagramAccounts.userId, userId))
      : await baseQuery;

    if (accountRows.length === 0) return [];

    const accountIds = accountRows.map((a) => a.id);

    // Fetch project links
    const links = await fastify.db
      .select({ accountId: instagramAccountProjects.accountId, projectId: instagramAccountProjects.projectId })
      .from(instagramAccountProjects)
      .where(inArray(instagramAccountProjects.accountId, accountIds));

    // Build projectIds map
    const projectIdsMap: Record<string, string[]> = {};
    for (const link of links) {
      if (!projectIdsMap[link.accountId]) projectIdsMap[link.accountId] = [];
      projectIdsMap[link.accountId].push(link.projectId);
    }

    const result = accountRows.map((a) => ({
      ...a,
      projectIds: projectIdsMap[a.id] ?? [],
    }));

    // Filter by project if requested
    if (filterProjectId) {
      return result.filter((a) => a.projectIds.includes(filterProjectId));
    }

    return result;
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

  // ---- POST /api/instagram/accounts/:id/projects/:projectId ---- (link account to project)
  fastify.post(
    "/api/instagram/accounts/:id/projects/:projectId",
    async (request, reply) => {
      const paramResult = linkProjectSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }

      const account = await getAccount(paramResult.data.id);
      if (!account) {
        return reply.code(404).send({ error: "Conta não encontrada" });
      }

      await fastify.db
        .insert(instagramAccountProjects)
        .values({ accountId: paramResult.data.id, projectId: paramResult.data.projectId })
        .onConflictDoNothing();

      return reply.code(201).send({ message: "Conta vinculada ao projeto." });
    },
  );

  // ---- DELETE /api/instagram/accounts/:id/projects/:projectId ---- (unlink)
  fastify.delete(
    "/api/instagram/accounts/:id/projects/:projectId",
    async (request, reply) => {
      const paramResult = linkProjectSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }

      await fastify.db
        .delete(instagramAccountProjects)
        .where(
          and(
            eq(instagramAccountProjects.accountId, paramResult.data.id),
            eq(instagramAccountProjects.projectId, paramResult.data.projectId),
          ),
        );

      return reply.code(204).send();
    },
  );

  // ---- GET /api/instagram/accounts/:id/debug-metrics ---- (admin only)
  fastify.get(
    "/api/instagram/accounts/:id/debug-metrics",
    async (request, reply) => {
      if (request.userRole !== "admin" && request.userRole !== "manager") {
        return reply.code(403).send({ error: "Admin only" });
      }

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) return reply.code(400).send({ error: "ID invalido" });

      const account = await getAccount(paramResult.data.id);
      if (!account) return reply.code(404).send({ error: "Conta nao encontrada" });

      const token = decrypt(account.accessTokenEncrypted, account.accessTokenIv);
      const igUserId = account.instagramUserId;

      // Debug: log token shape to verify decryption
      fastify.log.info(`[debug-metrics] token length=${token.length}, starts=${token.substring(0, 10)}..., ends=...${token.substring(token.length - 5)}`);

      // First test: try a simple profile fetch to verify token works
      let tokenValid = false;
      try {
        const profileRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}?fields=id,username&access_token=${token}`);
        const profileData = await profileRes.json() as { id?: string; error?: { message: string } };
        tokenValid = !!profileData.id;
        if (!tokenValid) {
          return { igUserId, accountName: account.accountName, tokenValid: false, tokenError: profileData.error?.message ?? "Unknown", tokenLength: token.length };
        }
      } catch (err) {
        return { igUserId, accountName: account.accountName, tokenValid: false, tokenError: err instanceof Error ? err.message : String(err) };
      }

      const since = Math.floor(Date.now() / 1000) - 30 * 86400;
      const until = Math.floor(Date.now() / 1000);
      const base = `https://graph.facebook.com/v21.0/${igUserId}/insights`;
      const tsDay = `&period=day&since=${since}&until=${until}`;
      const tsTotal = `&period=day&since=${since}&until=${until}&metric_type=total_value`;

      // All possible metrics
      const tests = [
        { metric: "reach", params: tsDay },
        { metric: "impressions", params: tsDay },
        { metric: "views", params: tsDay },
        { metric: "follower_count", params: tsDay },
        { metric: "accounts_engaged", params: tsTotal },
        { metric: "total_interactions", params: tsDay },
        { metric: "website_clicks", params: tsDay },
        { metric: "profile_links_taps", params: tsDay },
        { metric: "profile_views", params: tsDay },
        { metric: "likes", params: tsDay },
        { metric: "comments", params: tsDay },
        { metric: "shares", params: tsDay },
        { metric: "saves", params: tsDay },
        { metric: "follows_and_unfollows", params: tsDay },
        { metric: "profile_activity", params: tsDay },
        { metric: "engaged_audience_demographics", params: tsTotal },
      ];

      const results: Record<string, unknown> = {};

      for (const { metric, params } of tests) {
        try {
          const url = `${base}?metric=${metric}${params}&access_token=${token}`;
          const res = await fetch(url);
          const data = await res.json() as { data?: { name: string; values?: { value: unknown }[] }[]; error?: { message: string; code: number } };

          if (data.error) {
            results[metric] = { status: "ERROR", code: data.error.code, message: data.error.message.substring(0, 100) };
          } else if (data.data?.[0]) {
            const entry = data.data[0];
            const values = entry.values ?? [];
            const nonZero = values.filter((v) => typeof v.value === "number" ? v.value > 0 : v.value !== null);
            results[metric] = {
              status: "OK",
              totalValues: values.length,
              nonZeroValues: nonZero.length,
              sample: nonZero.slice(0, 2),
            };
          } else {
            results[metric] = { status: "EMPTY" };
          }
        } catch (err) {
          results[metric] = { status: "FETCH_ERROR", message: err instanceof Error ? err.message.substring(0, 80) : String(err) };
        }
      }

      return { igUserId, accountName: account.accountName, results };
    },
  );
});
