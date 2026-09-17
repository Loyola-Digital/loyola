import { z } from "zod";
import { eq, and, gt, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import { instagramAccounts, instagramMetricsCache, instagramAccountProjects } from "../db/schema.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { InstagramApiError } from "../services/instagram.js";
import {
  analisarComIa,
  formatoDoPost,
  montarDadosDaAnalise,
  type AnaliseDoPeriodo,
} from "../services/instagram-analise-ia.js";
import { tituloDoPost } from "../services/instagram-mensal.js";
import { salvarSeguidoresManuais } from "../services/instagram-post-metrics.js";

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

import {
  comVariacao,
  janelasMensais,
  montarLinha,
  reconstruirSeguidores,
} from "../services/instagram-mensal.js";

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

  /**
   * A tabela mensal — o consolidado que os experts acompanham na planilha.
   *
   * ## Uma chamada de insights POR MÊS
   *
   * A Graph API não tem "relatório mensal": ela responde a uma janela
   * `since/until`. Seis meses são seis janelas — e o cache do serviço as guarda
   * por período, então a segunda visita do dia não chama a API nenhuma vez.
   *
   * ## Os posts vêm de UMA busca só
   *
   * Buscar mídia mês a mês repetiria os mesmos posts recentes em cada janela.
   * Aqui vem a lista uma vez e cada post cai no mês da sua data — o que também
   * evita seis vezes o custo de enriquecer cada post com insights.
   *
   * O último mês fica INCOMPLETO de propósito: é o mês corrente, e a API ainda
   * demora cerca de dois dias para fechar os números de seguidores. A tela
   * marca isso; escondê-lo faria o mês parecer uma queda.
   */
  // As interações vêm pela SOMA DAS PARTES: `total_interactions` devolve mais
  // do que a soma (337.700 contra 264.524 em 30 dias de @odanilogato) e o app
  // do Instagram mostra a soma. Custa quatro chamadas por mês em vez de uma —
  // e é o número que o time consegue conferir no celular.
  const METRICAS_DO_MENSAL = [
    "reach",
    "views",
    "follows_and_unfollows",
    "likes",
    "comments",
    "saves",
    "shares",
  ];

  fastify.get("/api/instagram/accounts/:id/mensal", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

    const account = await getAccount(paramResult.data.id);
    if (!account) return reply.code(404).send({ error: "Conta não encontrada" });

    const q = z
      .object({ meses: z.coerce.number().int().min(2).max(12).optional() })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const quantos = q.data.meses ?? 6;

    const janelas = janelasMensais(quantos, new Date());

    try {
      const [perfil, midia, ...porJanela] = await Promise.all([
        fastify.instagramService.getProfile(paramResult.data.id),
        // 100 posts cobrem seis meses com folga em qualquer perfil do time.
        fastify.instagramService.getMediaList(paramResult.data.id, 100),
        ...janelas.map((j) =>
          fastify.instagramService
            .getAccountInsights(
              paramResult.data.id,
              "day",
              Math.floor(j.inicio.getTime() / 1000),
              Math.floor(j.fim.getTime() / 1000),
              // Só o que a tabela mensal usa. Pedir as treze métricas fazia
              // seis meses custarem 78 chamadas das 200 que a Meta dá por hora.
              METRICAS_DO_MENSAL,
            )
            // Um mês que a API recusa não pode derrubar os outros cinco: vira
            // linha zerada, que a tela mostra como "sem dado".
            .catch(() => []),
        ),
      ]);

      const linhas = janelas.map((j, i) => {
        const doMes = (midia?.data ?? []).filter((m) => {
          const t = new Date(m.timestamp);
          return t >= j.inicio && t < j.fim;
        });
        return montarLinha(
          j.mes,
          porJanela[i] ?? [],
          doMes.map((m) => ({
            id: m.id,
            caption: m.caption ?? null,
            permalink: m.permalink ?? null,
            timestamp: m.timestamp,
            mediaType: m.media_type ?? null,
            reach: m.reach ?? null,
            views: m.views ?? null,
            likes: m.like_count ?? null,
            comments: m.comments_count ?? null,
            saved: m.saved ?? null,
            shares: m.shares ?? null,
          })),
        );
      });

      return {
        conta: { id: account.id, username: account.instagramUsername },
        seguidoresHoje: perfil.followers_count ?? null,
        meses: comVariacao(reconstruirSeguidores(linhas, perfil.followers_count ?? 0)),
      };
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      throw error;
    }
  });

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

      const igUserId = account.instagramUserId;

      // Test 1: use the SAME service that the dashboard uses (includes cache)
      let profileFromService = null;
      let serviceError = null;
      try {
        profileFromService = await fastify.instagramService.getProfile(paramResult.data.id);
      } catch (err) {
        serviceError = err instanceof Error ? err.message : String(err);
      }

      // Test 2: decrypt and test token directly (bypasses cache)
      const token = decrypt(account.accessTokenEncrypted, account.accessTokenIv);
      let directProfileResult = null;
      let directError = null;
      try {
        const profileRes = await fetch(`https://graph.instagram.com/v25.0/${igUserId}?fields=id,username&access_token=${token}`);
        directProfileResult = await profileRes.json();
      } catch (err) {
        directError = err instanceof Error ? err.message : String(err);
      }

      // Test 3: try insights via service (with cache)
      let insightsFromService = null;
      let insightsError = null;
      try {
        const since = Math.floor(Date.now() / 1000) - 30 * 86400;
        const until = Math.floor(Date.now() / 1000);
        const insightsResult = await fastify.instagramService.getAccountInsights(paramResult.data.id, "day", since, until);
        insightsFromService = { data: insightsResult };
      } catch (err) {
        insightsError = err instanceof Error ? err.message : String(err);
      }

      const since = Math.floor(Date.now() / 1000) - 30 * 86400;
      const until = Math.floor(Date.now() / 1000);
      const base = `https://graph.instagram.com/v25.0/${igUserId}/insights`;
      const tsTimeSeries = `&period=day&since=${since}&until=${until}&metric_type=time_series`;
      const tsTotal = `&period=day&since=${since}&until=${until}&metric_type=total_value`;

      // v25.0: correct metrics — deprecated ones removed
      const tests = [
        // time_series (only reach supports this)
        { metric: "reach", params: tsTimeSeries },
        // total_value metrics
        { metric: "views", params: tsTotal },
        { metric: "follower_count", params: tsTotal },
        { metric: "accounts_engaged", params: tsTotal },
        { metric: "total_interactions", params: tsTotal },
        { metric: "likes", params: tsTotal },
        { metric: "comments", params: tsTotal },
        { metric: "shares", params: tsTotal },
        { metric: "saves", params: tsTotal },
        { metric: "replies", params: tsTotal },
        { metric: "follows_and_unfollows", params: `${tsTotal}&breakdown=follow_type` },
        { metric: "profile_links_taps", params: tsTotal },
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
            const entry = data.data[0] as Record<string, unknown>;
            // Handle both time_series (values array) and total_value (single value) formats
            const values = (entry.values as { value: unknown }[]) ?? [];
            const totalValue = entry.total_value as { value?: unknown } | undefined;
            if (values.length > 0) {
              const nonZero = values.filter((v) => typeof v.value === "number" ? v.value > 0 : v.value !== null);
              results[metric] = { status: "OK", type: "time_series", totalValues: values.length, nonZeroValues: nonZero.length, sample: nonZero.slice(0, 2) };
            } else if (totalValue) {
              results[metric] = { status: "OK", type: "total_value", value: totalValue.value };
            } else {
              results[metric] = { status: "OK", type: "unknown", raw: entry };
            }
          } else {
            results[metric] = { status: "EMPTY" };
          }
        } catch (err) {
          results[metric] = { status: "FETCH_ERROR", message: err instanceof Error ? err.message.substring(0, 80) : String(err) };
        }
      }

      return {
        igUserId,
        accountName: account.accountName,
        tokenLength: token.length,
        tokenStart: token.substring(0, 15),
        serviceProfile: profileFromService ? { id: profileFromService.id, username: profileFromService.username, followers: profileFromService.followers_count } : null,
        serviceProfileError: serviceError,
        directProfile: directProfileResult,
        directProfileError: directError,
        insightsMetrics: insightsFromService?.data?.map((e: { name: string }) => e.name) ?? [],
        insightsError,
        metricTests: results,
      };
    },
  );

  // ============================================================
  // TOP POSTS BY FOLLOWERS — apenas FEED (foto/carrossel)
  // ============================================================
  //
  // A Meta NÃO suporta `follows` per-Reel — confirmado em testes diretos
  // com erro "(#100) The Media Insights API does not support the follows
  // metric for this media product type". Suporta apenas FEED e Stories.
  //
  // Este endpoint filtra `media_product_type === "FEED"` (foto + carrossel)
  // e ignora REELS. Stories seriam outra feature (expiram em 24h, precisam
  // de captura periódica).
  fastify.get(
    "/api/instagram/accounts/:id/top-posts-by-followers",
    async (request, reply) => {
      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

      const querySchema = z.object({
        days: z.coerce.number().int().min(1).max(365).default(30),
        limit: z.coerce.number().int().min(1).max(20).default(10),
      });
      const queryResult = querySchema.safeParse(request.query);
      if (!queryResult.success) return reply.code(400).send({ error: "Query inválida" });

      const { id: accountId } = paramResult.data;
      const { days, limit } = queryResult.data;

      const account = await getAccount(accountId);
      if (!account) return reply.code(404).send({ error: "Conta não encontrada" });

      const accessToken = decrypt(account.accessTokenEncrypted, account.accessTokenIv);
      const igUserId = account.instagramUserId;

      // Lista media direto da Graph API com media_product_type pra filtrar
      let mediaList: Array<{
        id: string;
        media_type?: string;
        media_product_type?: string;
        timestamp: string;
        thumbnail_url?: string;
        media_url?: string;
        caption?: string;
        permalink?: string;
      }> = [];
      try {
        const url = `https://graph.instagram.com/v25.0/${igUserId}/media?fields=id,media_type,media_product_type,timestamp,thumbnail_url,media_url,caption,permalink&limit=100&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json() as { data?: typeof mediaList; error?: unknown };
        if (data.data) mediaList = data.data;
      } catch (err) {
        return reply.code(502).send({ error: "Falha ao listar media", details: err instanceof Error ? err.message : String(err) });
      }

      // Filtra FEED + período
      const cutoffMs = Date.now() - days * 86_400_000;
      const eligible = mediaList.filter((m) => {
        if (m.media_product_type !== "FEED") return false;
        const t = new Date(m.timestamp).getTime();
        return !isNaN(t) && t >= cutoffMs;
      });

      // Pra cada FEED, busca follows com try/catch isolado.
      // Formato esperado da Meta: { data: [{ name: "follows", values: [{ value: N }] }] }
      const enriched = await Promise.all(
        eligible.map(async (m) => {
          let follows: number | null = null;
          try {
            const url = `https://graph.instagram.com/v25.0/${m.id}/insights?metric=follows&access_token=${accessToken}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json() as {
                data?: Array<{
                  name: string;
                  values?: Array<{ value?: unknown }>;
                  total_value?: { value?: unknown };
                }>;
              };
              const entry = data.data?.find((e) => e.name === "follows");
              if (entry) {
                if (entry.values && entry.values.length > 0) {
                  for (const v of entry.values) {
                    if (typeof v.value === "number") {
                      follows = (follows ?? 0) + v.value;
                    }
                  }
                }
                if (follows == null && entry.total_value && typeof entry.total_value.value === "number") {
                  follows = entry.total_value.value;
                }
              }
            }
          } catch {
            // ignora — esse post não vai aparecer no ranking
          }
          return { ...m, follows };
        })
      );

      // Filtra apenas os que retornaram follows > 0 e ordena desc
      const ranked = enriched
        .filter((m): m is typeof m & { follows: number } => m.follows != null && m.follows > 0)
        .sort((a, b) => b.follows - a.follows)
        .slice(0, limit);

      return {
        days,
        totalReelsSkipped: mediaList.filter((m) => m.media_product_type === "REELS").length,
        totalFeedInPeriod: eligible.length,
        totalWithData: ranked.length,
        items: ranked.map((m) => ({
          id: m.id,
          mediaType: m.media_type ?? null,
          timestamp: m.timestamp,
          thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
          permalink: m.permalink ?? null,
          caption: m.caption ?? null,
          follows: m.follows,
        })),
      };
    },
  );
  // ---- Análise do período com IA (itens 3 e 13) ----
  //
  // GET devolve a última análise guardada para o período; POST gera uma nova.
  // Separado de propósito: gerar custa uma chamada ao modelo e leva de 20 a 60
  // segundos — abrir a tela não pode disparar isso sozinho.

  const ANALISE_IA = "analise_ia_v1";
  const periodoQuery = z.object({
    since: z.coerce.number().int().positive(),
    until: z.coerce.number().int().positive(),
  });
  const dia = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);

  type AnaliseGuardada = {
    analise: AnaliseDoPeriodo;
    geradoEm: string;
    posts: { id: string; titulo: string; permalink: string | null; formato: string }[];
  };

  fastify.get("/api/instagram/accounts/:id/analise-ia", async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const q = periodoQuery.safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [linha] = await fastify.db
      .select({ dados: instagramMetricsCache.metricData })
      .from(instagramMetricsCache)
      .where(
        and(
          eq(instagramMetricsCache.accountId, p.data.id),
          eq(instagramMetricsCache.metricType, ANALISE_IA),
          eq(instagramMetricsCache.periodStart, dia(q.data.since)),
          eq(instagramMetricsCache.periodEnd, dia(q.data.until)),
          gt(instagramMetricsCache.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return { resultado: (linha?.dados as AnaliseGuardada | undefined) ?? null };
  });

  fastify.post("/api/instagram/accounts/:id/analise-ia", async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const q = periodoQuery.safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (q.data.until <= q.data.since) return reply.code(400).send({ error: "Período inválido" });

    const chave = process.env.ANTHROPIC_API_KEY;
    if (!chave) return reply.code(503).send({ error: "IA não configurada no servidor (ANTHROPIC_API_KEY)." });

    const account = await getAccount(p.data.id);
    if (!account) return reply.code(404).send({ error: "Conta não encontrada" });

    const { since, until } = q.data;
    const duracao = until - since;
    try {
      const [midia, atual, anterior] = await Promise.all([
        fastify.instagramService.getMediaList(p.data.id, 100),
        fastify.instagramService.getAccountInsights(p.data.id, "day", since, until),
        fastify.instagramService
          .getAccountInsights(p.data.id, "day", since - duracao, since)
          // Sem o período anterior a análise ainda sai — só sem as variações.
          .catch(() => []),
      ]);
      const posts = (midia?.data ?? []).filter((m) => {
        const t = Math.floor(new Date(m.timestamp).getTime() / 1000);
        return t >= since && t <= until;
      });
      if (posts.length === 0) {
        return reply.code(400).send({ error: "Nenhum post publicado no período para analisar." });
      }

      const dados = montarDadosDaAnalise({
        posts,
        atual,
        anterior,
        periodo: { de: dia(since), ate: dia(until) },
      });
      const analise = await analisarComIa(chave, dados);

      const guardada: AnaliseGuardada = {
        analise,
        geradoEm: new Date().toISOString(),
        posts: posts.map((m) => ({
          id: m.id,
          titulo: tituloDoPost(m.caption),
          permalink: m.permalink ?? null,
          formato: formatoDoPost(m),
        })),
      };
      await fastify.db
        .insert(instagramMetricsCache)
        .values({
          accountId: p.data.id,
          metricType: ANALISE_IA,
          metricData: guardada,
          periodStart: dia(since),
          periodEnd: dia(until),
          // Uma semana: o período fechado não muda, e o botão refaz quando quiser.
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        })
        .onConflictDoUpdate({
          target: [
            instagramMetricsCache.accountId,
            instagramMetricsCache.metricType,
            instagramMetricsCache.periodStart,
            instagramMetricsCache.periodEnd,
          ],
          set: { metricData: guardada, expiresAt: new Date(Date.now() + 7 * 86_400_000) },
        });
      return { resultado: guardada };
    } catch (error) {
      if (error instanceof InstagramApiError) {
        return reply.code(error.statusCode).send(errorResponse(error));
      }
      fastify.log.error({ err: error }, "[IG] análise com IA falhou");
      return reply.code(502).send({
        error: error instanceof Error ? error.message : "A análise com IA falhou.",
      });
    }
  });
  // ---- Seguidores por post, à mão ----
  //
  // A Meta recusa `follows` em Reels (medido em 15/09/2026), mas o número está
  // no painel do Instagram. Aqui o time copia de lá. Vale para qualquer post:
  // se a API responder, o número dela manda; o digitado preenche o buraco.

  const seguidoresBody = z.object({
    // `null` apaga o valor digitado. O teto evita que um dedo escorregado
    // vire 900 milhões de seguidores num post.
    seguidores: z.number().int().min(0).max(10_000_000).nullable(),
  });

  fastify.put(
    "/api/instagram/accounts/:id/posts/:mediaId/seguidores",
    async (request, reply) => {
      const p = idParamSchema.safeParse(request.params);
      const mediaId = (request.params as { mediaId?: string }).mediaId;
      const body = seguidoresBody.safeParse(request.body);
      if (!p.success || !mediaId || !/^[0-9]{5,32}$/.test(mediaId) || !body.success) {
        return reply.code(400).send({ error: "Dados inválidos" });
      }
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const ok = await salvarSeguidoresManuais(
        fastify.db,
        p.data.id,
        mediaId,
        body.data.seguidores,
        request.userId ?? null,
      );
      if (!ok) {
        // A linha nasce na primeira leitura da lista; se não existe, o post não
        // é desta conta ou a lista nunca foi aberta.
        return reply.code(404).send({ error: "Post não encontrado nesta conta" });
      }
      return { seguidores: body.data.seguidores };
    },
  );
});
