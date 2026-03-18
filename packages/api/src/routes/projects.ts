import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, instagramAccounts, instagramAccountProjects, conversations, projectMembers, users } from "../db/schema.js";

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

const memberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

const updatePermissionsSchema = z.object({
  permissions: z.object({
    instagram: z.boolean(),
    conversations: z.boolean(),
    mind: z.boolean(),
  }),
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
  // Helper: fetch project only if it belongs to the requesting user (owner)
  async function getProjectForUser(projectId: string, userId: string) {
    const rows = await fastify.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  // Helper: fetch project if user is owner OR a project member (for guests)
  async function getProjectForMember(projectId: string, userId: string) {
    // Check ownership first
    const owned = await fastify.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)))
      .limit(1);
    if (owned.length > 0) return owned[0];

    // Check membership
    const member = await fastify.db
      .select({ project: projects })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return member.length > 0 ? member[0].project : null;
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
    // Guests see only projects where they are members
    if (request.userRole === "guest") {
      const memberRows = await fastify.db
        .select({ project: projects })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(eq(projectMembers.userId, request.userId));
      return memberRows.map((r) => projectShape(r.project));
    }

    const rows = await fastify.db
      .select()
      .from(projects);
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

    const project = await getProjectForMember(paramResult.data.id, request.userId);
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
        createdAt: instagramAccounts.createdAt,
      })
      .from(instagramAccounts)
      .innerJoin(
        instagramAccountProjects,
        and(
          eq(instagramAccountProjects.accountId, instagramAccounts.id),
          eq(instagramAccountProjects.projectId, paramResult.data.id),
        ),
      );

    return accounts;
  });

  // ---- GET /api/projects/:id/conversations ----
  fastify.get("/api/projects/:id/conversations", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForMember(paramResult.data.id, request.userId);
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

  // ---- GET /api/projects/:id/members ---- (AC: 6)
  fastify.get("/api/projects/:id/members", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const members = await fastify.db
      .select({
        id: projectMembers.id,
        userId: projectMembers.userId,
        role: projectMembers.role,
        permissions: projectMembers.permissions,
        createdAt: projectMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, paramResult.data.id));

    return members;
  });

  // ---- GET /api/projects/:id/my-membership ---- (current user's own membership)
  fastify.get("/api/projects/:id/my-membership", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const [member] = await fastify.db
      .select({ permissions: projectMembers.permissions })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, paramResult.data.id),
          eq(projectMembers.userId, request.userId),
        ),
      )
      .limit(1);

    if (!member) {
      return reply.code(404).send({ error: "Membro não encontrado" });
    }

    return { permissions: member.permissions };
  });

  // ---- DELETE /api/projects/:id/members/:userId ---- (AC: 4)
  fastify.delete("/api/projects/:id/members/:userId", async (request, reply) => {
    const paramResult = memberParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos" });
    }

    const project = await getProjectForUser(paramResult.data.id, request.userId);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    await fastify.db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, paramResult.data.id),
          eq(projectMembers.userId, paramResult.data.userId),
        ),
      );

    return reply.code(204).send();
  });

  // ---- PATCH /api/projects/:id/members/:userId/permissions ---- (AC: 5)
  fastify.patch(
    "/api/projects/:id/members/:userId/permissions",
    async (request, reply) => {
      const paramResult = memberParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }

      const bodyResult = updatePermissionsSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: "Dados inválidos",
          details: bodyResult.error.flatten().fieldErrors,
        });
      }

      const project = await getProjectForUser(paramResult.data.id, request.userId);
      if (!project) {
        return reply.code(404).send({ error: "Projeto não encontrado" });
      }

      const [updated] = await fastify.db
        .update(projectMembers)
        .set({ permissions: bodyResult.data.permissions })
        .where(
          and(
            eq(projectMembers.projectId, paramResult.data.id),
            eq(projectMembers.userId, paramResult.data.userId),
          ),
        )
        .returning();

      if (!updated) {
        return reply.code(404).send({ error: "Membro não encontrado" });
      }

      return { permissions: updated.permissions };
    },
  );
});
