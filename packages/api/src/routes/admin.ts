import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { users } from "../db/schema.js";

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
});
