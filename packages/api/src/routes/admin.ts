import { z } from "zod";
import { eq, like, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { clerkClient } from "@clerk/fastify";
import { users, messages, conversations, userActivity, projectMembers } from "../db/schema.js";
import { ROTULO_DA_AREA } from "../services/adesao.js";
import { syncMetaPerformance } from "../services/meta-perf-sync.js";
import { syncLeadOrigin } from "../services/lead-origin-sync.js";
import { syncSurvey } from "../services/survey-aggregation.js";
import { syncSalesDaily } from "../services/sales-daily-sync.js";

const idParamSchema = z.object({ id: z.string().uuid() });

const updateStatusSchema = z.object({
  status: z.enum(["active", "pending", "blocked"]),
});

export default fp(async function adminRoutes(fastify) {
  // ---- GET /api/me ---- (returns current user status — accessible even when pending)
  fastify.get("/api/me", async (request) => {
    const rows = await fastify.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    return rows[0] ?? null;
  });

  // ---- POST /api/admin/meta-perf-sync ---- (admin/manager only — Story 36.4)
  // Disparo manual do refresh de performance Meta no cache. Útil para a primeira
  // carga e debug. Body opcional: { days?: number } (1-90, default 7).
  fastify.post("/api/admin/meta-perf-sync", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }
    const body = (request.body ?? {}) as {
      days?: number;
      projectIds?: string[];
      creatives?: boolean;
    };
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
    const projectIds = Array.isArray(body.projectIds) ? body.projectIds : undefined;
    // Story 29.43 (AC1): este disparo tinha o mesmo furo do script de backfill —
    // nunca repassava `creatives`, então o único caminho que repopulava
    // meta_ad_creatives_cache era o scheduler das 4h. Opt-in porque custa
    // chamadas à Graph API; o default preserva o comportamento anterior.
    const creatives = body.creatives === true;
    const meta = await syncMetaPerformance(fastify.db, {
      days,
      projectIds,
      creatives,
      log: (m) => fastify.log.info(m),
    });
    const leads = await syncLeadOrigin(fastify.db, {
      projectIds,
      log: (m) => fastify.log.info(m),
    });
    const survey = await syncSurvey(fastify.db, {
      projectIds,
      log: (m) => fastify.log.info(m),
    });
    const salesDaily = await syncSalesDaily(fastify.db, {
      projectIds,
      log: (m) => fastify.log.info(m),
    });
    return { ok: true, days, meta, leads, survey, salesDaily };
  });

  /**
   * Adesão do time — quem usa o Loyola X, quando e onde.
   *
   * ## Só admin, e sem "manager"
   *
   * As outras rotas daqui aceitam manager. Esta não: são dados sobre o
   * comportamento de colegas, e ampliar quem os vê é uma decisão de gestão, não
   * um detalhe de permissão que se herda por conveniência.
   *
   * ## Todo mundo aparece, inclusive quem nunca entrou
   *
   * O `LEFT JOIN` é o ponto da tela: uma lista só de quem usou responderia
   * "quem usa", quando a pergunta é "quem NÃO está usando".
   */
  fastify.get("/api/admin/adesao", async (request, reply) => {
    if (request.userRole !== "admin") {
      return reply.code(403).send({ error: "Só admin vê a adesão do time." });
    }
    const q = z
      .object({ dias: z.coerce.number().int().min(1).max(365).optional() })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const dias = q.data.dias ?? 30;

    const desde = new Date(Date.now() - dias * 86_400_000);

    const linhas = await fastify.db
      .select({
        id: users.id,
        nome: users.name,
        email: users.email,
        papel: users.role,
        situacao: users.status,
        entrouEm: users.createdAt,
        ultimoUso: sql<Date | null>`max(${userActivity.hora})`,
        // Dias DISTINTOS, não requisições: quem abriu uma tela e ficou nela
        // não usou menos que quem recarregou trinta vezes.
        diasAtivos: sql<number>`count(distinct date_trunc('day', ${userActivity.hora}))::int`,
        requisicoes: sql<number>`coalesce(sum(${userActivity.requisicoes}), 0)::int`,
      })
      .from(users)
      .leftJoin(
        userActivity,
        sql`${userActivity.userId} = ${users.id} and ${userActivity.hora} >= ${desde}`,
      )
      .where(sql`${users.status} <> 'blocked' and ${users.listed} = true`)
      .groupBy(users.id)
      .orderBy(sql`max(${userActivity.hora}) desc nulls last`);

    // As áreas de cada pessoa vêm numa segunda consulta: no mesmo `GROUP BY`
    // elas multiplicariam as linhas e estragariam a contagem de dias ativos.
    const areas = await fastify.db
      .select({
        userId: userActivity.userId,
        area: userActivity.area,
        requisicoes: sql<number>`sum(${userActivity.requisicoes})::int`,
      })
      .from(userActivity)
      .where(sql`${userActivity.hora} >= ${desde}`)
      .groupBy(userActivity.userId, userActivity.area);

    const porUsuario = new Map<string, { area: string; rotulo: string; requisicoes: number }[]>();
    for (const a of areas) {
      const lista = porUsuario.get(a.userId) ?? [];
      lista.push({
        area: a.area,
        rotulo: ROTULO_DA_AREA[a.area] ?? a.area,
        requisicoes: a.requisicoes,
      });
      porUsuario.set(a.userId, lista);
    }

    // Atividade por dia, do time inteiro — a linha do tempo da tela.
    const porDia = await fastify.db
      .select({
        dia: sql<string>`to_char(date_trunc('day', ${userActivity.hora}), 'YYYY-MM-DD')`,
        pessoas: sql<number>`count(distinct ${userActivity.userId})::int`,
      })
      .from(userActivity)
      .where(sql`${userActivity.hora} >= ${desde}`)
      .groupBy(sql`date_trunc('day', ${userActivity.hora})`)
      .orderBy(sql`date_trunc('day', ${userActivity.hora})`);

    return {
      dias,
      pessoas: linhas.map((l) => ({
        ...l,
        entrouEm: l.entrouEm?.toISOString() ?? null,
        ultimoUso: l.ultimoUso ? new Date(l.ultimoUso).toISOString() : null,
        areas: (porUsuario.get(l.id) ?? []).sort((a, b) => b.requisicoes - a.requisicoes),
      })),
      porDia,
    };
  });

  // ---- GET /api/admin/users ---- (admin only — list users by status)
  fastify.get("/api/admin/users", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const statusParam = (request.query as Record<string, string>).status;
    const whereClause = statusParam
      ? eq(users.status, statusParam as "active" | "pending" | "blocked")
      : undefined;

    const rows = await fastify.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, listed: users.listed, createdAt: users.createdAt })
      .from(users)
      .where(whereClause);

    return rows;
  });

  // ---- GET /api/admin/audit/tokens ---- (admin/manager only)
  fastify.get("/api/admin/audit/tokens", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const query = request.query as Record<string, string>;
    const days = Math.min(parseInt(query.days ?? "30", 10) || 30, 365);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();

    type Row = Record<string, unknown>;

    // --- Summary ---
    const summaryResult = await fastify.db.execute(sql`
      SELECT
        COALESCE(SUM((m.metadata->>'inputTokens')::int), 0)  AS total_input_tokens,
        COALESCE(SUM((m.metadata->>'outputTokens')::int), 0) AS total_output_tokens,
        COALESCE(SUM(m.tokens_used), 0)                      AS total_tokens,
        COUNT(*)                                              AS message_count,
        COUNT(DISTINCT m.conversation_id)                    AS conversation_count
      FROM ${messages} m
      WHERE m.role = 'assistant'
        AND m.created_at >= ${startDate}
        AND m.created_at <= ${endDate}
    `);

    // --- By user ---
    const byUserResult = await fastify.db.execute(sql`
      SELECT
        u.id                                                         AS user_id,
        u.name                                                       AS user_name,
        u.email                                                      AS user_email,
        COALESCE(SUM((m.metadata->>'inputTokens')::int), 0)         AS input_tokens,
        COALESCE(SUM((m.metadata->>'outputTokens')::int), 0)        AS output_tokens,
        COALESCE(SUM(m.tokens_used), 0)                             AS total_tokens,
        COUNT(*)                                                     AS message_count,
        COUNT(DISTINCT c.id)                                        AS conversation_count
      FROM ${messages} m
      JOIN ${conversations} c ON m.conversation_id = c.id
      JOIN ${users} u ON c.user_id = u.id
      WHERE m.role = 'assistant'
        AND m.created_at >= ${startDate}
        AND m.created_at <= ${endDate}
      GROUP BY u.id, u.name, u.email
      ORDER BY total_tokens DESC
    `);

    // --- By mind ---
    const byMindResult = await fastify.db.execute(sql`
      SELECT
        c.mind_id                                                    AS mind_id,
        c.mind_name                                                  AS mind_name,
        COALESCE(SUM((m.metadata->>'inputTokens')::int), 0)         AS input_tokens,
        COALESCE(SUM((m.metadata->>'outputTokens')::int), 0)        AS output_tokens,
        COALESCE(SUM(m.tokens_used), 0)                             AS total_tokens,
        COUNT(*)                                                     AS message_count
      FROM ${messages} m
      JOIN ${conversations} c ON m.conversation_id = c.id
      WHERE m.role = 'assistant'
        AND m.created_at >= ${startDate}
        AND m.created_at <= ${endDate}
      GROUP BY c.mind_id, c.mind_name
      ORDER BY total_tokens DESC
      LIMIT 10
    `);

    // --- Daily timeline ---
    const timelineResult = await fastify.db.execute(sql`
      SELECT
        DATE(m.created_at AT TIME ZONE 'UTC')                       AS date,
        COALESCE(SUM((m.metadata->>'inputTokens')::int), 0)         AS input_tokens,
        COALESCE(SUM((m.metadata->>'outputTokens')::int), 0)        AS output_tokens,
        COALESCE(SUM(m.tokens_used), 0)                             AS total_tokens
      FROM ${messages} m
      WHERE m.role = 'assistant'
        AND m.created_at >= ${startDate}
        AND m.created_at <= ${endDate}
      GROUP BY DATE(m.created_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `);

    // Cost calculation: Sonnet 4.6 — $3/1M input, $15/1M output
    function calcCost(inputTokens: number, outputTokens: number) {
      return +(inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(4);
    }

    const s = (summaryResult.rows[0] ?? {}) as Row;
    const totalInput = Number(s.total_input_tokens ?? 0);
    const totalOutput = Number(s.total_output_tokens ?? 0);

    return {
      period: { days, startDate, endDate },
      summary: {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        totalTokens: Number(s.total_tokens ?? 0),
        estimatedCostUsd: calcCost(totalInput, totalOutput),
        messageCount: Number(s.message_count ?? 0),
        conversationCount: Number(s.conversation_count ?? 0),
      },
      byUser: (byUserResult.rows as unknown as Row[]).map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        totalTokens: Number(r.total_tokens),
        estimatedCostUsd: calcCost(Number(r.input_tokens), Number(r.output_tokens)),
        messageCount: Number(r.message_count),
        conversationCount: Number(r.conversation_count),
      })),
      byMind: (byMindResult.rows as unknown as Row[]).map((r) => ({
        mindId: r.mind_id,
        mindName: r.mind_name,
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        totalTokens: Number(r.total_tokens),
        messageCount: Number(r.message_count),
      })),
      timeline: (timelineResult.rows as unknown as Row[]).map((r) => ({
        date: String(r.date).substring(0, 10),
        inputTokens: Number(r.input_tokens),
        outputTokens: Number(r.output_tokens),
        totalTokens: Number(r.total_tokens),
      })),
    };
  });

  // ---- PATCH /api/admin/users/:id/status ---- (admin only)
  fastify.patch("/api/admin/users/:id/status", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const bodyResult = updateStatusSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({ error: "Status inválido" });
    }

    const [updated] = await fastify.db
      .update(users)
      .set({ status: bodyResult.data.status, updatedAt: new Date() })
      .where(eq(users.id, paramResult.data.id))
      .returning({ id: users.id, status: users.status });

    if (!updated) {
      return reply.code(404).send({ error: "Usuário não encontrado" });
    }

    return updated;
  });

  /**
   * PATCH /api/admin/users/:id — papel e visibilidade nas listas. Admin only
   * (manager não promove ninguém: dar `admin` é dar acesso a tudo).
   *
   * `listed` controla quem aparece nos seletores de pessoa. É flag, e não
   * exclusão, porque conta antiga costuma ser dona de dado real e apagá-la
   * levaria histórico junto.
   */
  fastify.patch("/api/admin/users/:id", async (request, reply) => {
    if (request.userRole !== "admin") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

    const bodySchema = z
      .object({
        role: z.enum(["copywriter", "strategist", "manager", "admin", "guest"]).optional(),
        listed: z.boolean().optional(),
      })
      .refine((b) => b.role !== undefined || b.listed !== undefined, "Nada para atualizar");

    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    // Rebaixar a si mesmo tranca o próprio acesso à administração — e só outro
    // admin conseguiria desfazer.
    if (body.data.role && body.data.role !== "admin" && paramResult.data.id === request.userId) {
      return reply.code(400).send({ error: "Você não pode remover o próprio acesso de admin" });
    }

    const patch: { role?: "copywriter" | "strategist" | "manager" | "admin" | "guest"; listed?: boolean; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.data.role !== undefined) patch.role = body.data.role;
    if (body.data.listed !== undefined) patch.listed = body.data.listed;

    const [updated] = await fastify.db
      .update(users)
      .set(patch)
      .where(eq(users.id, paramResult.data.id))
      .returning({ id: users.id, role: users.role, listed: users.listed });

    if (!updated) return reply.code(404).send({ error: "Usuário não encontrado" });
    return updated;
  });

  /**
   * O acesso de um convidado: empresa, e até onde dentro dela.
   *
   * Existe para o vendedor contratado: ele cria a conta, e aqui alguém escolhe
   * "empresa X, funil Y, etapa Z" e marca como convidado. Sem isto, a única
   * forma de criar acesso era o link de convite — que dava a empresa inteira.
   *
   * Um acesso por vez, e ele SUBSTITUI os outros: o convidado desta tela tem um
   * escopo só, e somar acessos silenciosamente é o caminho para alguém ver o
   * que ninguém quis dar.
   */
  fastify.put("/api/admin/users/:id/acesso", async (request, reply) => {
    if (request.userRole !== "admin") {
      return reply.code(403).send({ error: "Acesso negado" });
    }
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

    const body = z
      .object({
        projectId: z.string().uuid(),
        funnelId: z.string().uuid().nullable().optional(),
        stageId: z.string().uuid().nullable().optional(),
        /** Módulos da empresa (Instagram, conversas, mind). Padrão: nenhum. */
        permissions: z
          .object({
            instagram: z.boolean().default(false),
            traffic: z.boolean().default(false),
            youtubeAds: z.boolean().default(false),
            youtubeOrganic: z.boolean().default(false),
            conversations: z.boolean().default(false),
            mind: z.boolean().default(false),
          })
          .optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    if (paramResult.data.id === request.userId) {
      return reply.code(400).send({ error: "Você não pode virar convidado de si mesmo" });
    }

    const permissoes = body.data.permissions ?? {
      instagram: false,
      traffic: false,
      youtubeAds: false,
      youtubeOrganic: false,
      conversations: false,
      mind: false,
    };

    await fastify.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: "guest", status: "active", updatedAt: new Date() })
        .where(eq(users.id, paramResult.data.id));
      await tx.delete(projectMembers).where(eq(projectMembers.userId, paramResult.data.id));
      await tx.insert(projectMembers).values({
        projectId: body.data.projectId,
        userId: paramResult.data.id,
        role: "guest",
        funnelId: body.data.funnelId ?? null,
        stageId: body.data.stageId ?? null,
        permissions: permissoes,
      });
    });

    return { ok: true, acesso: { ...body.data, permissions: permissoes } };
  });

  /** O acesso atual do convidado — o que a tela mostra ao abrir o diálogo. */
  fastify.get("/api/admin/users/:id/acesso", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) return reply.code(400).send({ error: "ID inválido" });

    const [acesso] = await fastify.db
      .select({
        projectId: projectMembers.projectId,
        funnelId: projectMembers.funnelId,
        stageId: projectMembers.stageId,
        permissions: projectMembers.permissions,
      })
      .from(projectMembers)
      .where(eq(projectMembers.userId, paramResult.data.id))
      .limit(1);

    return { acesso: acesso ?? null };
  });

  // ---- POST /api/admin/sync-users ---- (admin only — fix placeholder users from Clerk)
  fastify.post("/api/admin/sync-users", async (request, reply) => {
    if (request.userRole !== "admin" && request.userRole !== "manager") {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    // Find all users with placeholder emails
    const placeholders = await fastify.db
      .select({ id: users.id, clerkId: users.clerkId, email: users.email })
      .from(users)
      .where(like(users.email, "%@placeholder.dev"));

    let updated = 0;
    const errors: string[] = [];

    for (const user of placeholders) {
      try {
        const clerkUser = await clerkClient.users.getUser(user.clerkId);
        const email = clerkUser.emailAddresses?.[0]?.emailAddress;
        const firstName = clerkUser.firstName ?? "";
        const lastName = clerkUser.lastName ?? "";
        const name = `${firstName} ${lastName}`.trim() || clerkUser.username || user.clerkId;
        const avatarUrl = clerkUser.imageUrl ?? null;

        if (email) {
          await fastify.db
            .update(users)
            .set({ email, name, avatarUrl, updatedAt: new Date() })
            .where(eq(users.id, user.id));
          updated++;
        }
      } catch (err) {
        errors.push(`${user.clerkId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { total: placeholders.length, updated, errors };
  });
});
