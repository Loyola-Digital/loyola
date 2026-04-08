import { z } from "zod";
import { eq, like, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { clerkClient } from "@clerk/fastify";
import { users, messages, conversations } from "../db/schema.js";

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
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt })
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
