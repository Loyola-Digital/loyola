import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, instagramAccounts, conversations } from "../db/schema.js";

// ============================================================
// SCHEMAS
// ============================================================

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  clientName: z.string().min(1).max(100),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex válida, ex: #d4a843").optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  clientName: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex válida, ex: #d4a843").nullable().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ============================================================
// HELPERS
// ============================================================

function projectShape(p: typeof projects.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    description: p.description,
    color: p.color,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function projectRoutes(fastify) {
  // Helper: fetch project only if it belongs to the requesting user
  async function getProjectForUser(projectId: string, userId: string) {
    const rows = await fastify.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  // ---- POST /api/projects ----
  fastify.post("/api/projects", async (request, reply) => {
    const parseResult = createProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, clientName, description, color } = parseResult.data;
    const [project] = await fastify.db
      .insert(projects)
      .values({ name, clientName, description, color, createdBy: request.userId })
      .returning();

    return reply.code(201).send(projectShape(project));
  });

  // ---- GET /api/projects ----
  fastify.get("/api/projects", async (request) => {
    const rows = await fastify.db
      .select()
      .from(projects)
      .where(eq(projects.createdBy, request.userId));
    return rows.map(projectShape);
  });

  // ---- GET /api/projects/:id ----
  fastify.get("/api/projects/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    return projectShape(project);
  });

  // ---- PUT /api/projects/:id ----
  fastify.put("/api/projects/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const parseResult = updateProjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const { name, clientName, description, color } = parseResult.data;
    if (name !== undefined) updates.name = name;
    if (clientName !== undefined) updates.clientName = clientName;
    if (description !== undefined) updates.description = description;
    if (color !== undefined) updates.color = color;

    const [updated] = await fastify.db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, paramResult.data.id))
      .returning();

    return projectShape(updated);
  });

  // ---- DELETE /api/projects/:id ----
  fastify.delete("/api/projects/:id", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    await fastify.db.delete(projects).where(eq(projects.id, paramResult.data.id));
    return reply.code(204).send();
  });

  // ---- GET /api/projects/:id/instagram/accounts ----
  fastify.get("/api/projects/:id/instagram/accounts", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const accounts = await fastify.db
      .select({
        id: instagramAccounts.id,
        accountName: instagramAccounts.accountName,
        instagramUsername: instagramAccounts.instagramUsername,
        instagramUserId: instagramAccounts.instagramUserId,
        profilePictureUrl: instagramAccounts.profilePictureUrl,
        isActive: instagramAccounts.isActive,
        projectId: instagramAccounts.projectId,
        createdAt: instagramAccounts.createdAt,
      })
      .from(instagramAccounts)
      .where(eq(instagramAccounts.projectId, paramResult.data.id));

    return accounts;
  });

  // ---- GET /api/projects/:id/conversations ----
  fastify.get("/api/projects/:id/conversations", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const convs = await fastify.db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.projectId, paramResult.data.id),
          isNull(conversations.deletedAt),
        ),
      );

    return convs;
  });
});
