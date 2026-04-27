import { z } from "zod";
import { eq, and, ne, isNull, gt } from "drizzle-orm";
import fp from "fastify-plugin";
import { randomBytes } from "crypto";
import {
  projectInvitations,
  projectMembers,
  projects,
  users,
} from "../db/schema.js";

// ============================================================
// TYPES
// ============================================================

type Permissions = {
  instagram: boolean;
  traffic: boolean;
  youtubeAds: boolean;
  youtubeOrganic: boolean;
  conversations: boolean;
  mind: boolean;
};

// ============================================================
// SCHEMAS
// ============================================================

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

const createInvitationSchema = z.object({
  email: z.string().email(),
  permissions: z.object({
    instagram: z.boolean().default(false),
    traffic: z.boolean().default(false),
    youtubeAds: z.boolean().default(false),
    youtubeOrganic: z.boolean().default(false),
    conversations: z.boolean().default(false),
    mind: z.boolean().default(false),
  }),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function invitationsRoutes(fastify) {
  // Helper: fetch project for non-guest users (any non-guest can manage any project)
  async function getProjectIfAllowed(projectId: string, userRole: string) {
    if (userRole === "guest") return null;
    const rows = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  // ---- POST /api/projects/:id/invitations ---- (auth required — AC 1)
  fastify.post("/api/projects/:id/invitations", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const bodyResult = createInvitationSchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: bodyResult.error.flatten().fieldErrors,
      });
    }

    const project = await getProjectIfAllowed(paramResult.data.id, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const { email, permissions } = bodyResult.data;
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invitation] = await fastify.db
      .insert(projectInvitations)
      .values({
        projectId: paramResult.data.id,
        invitedBy: request.userId,
        email,
        token,
        permissions,
        expiresAt,
      })
      .returning({ expiresAt: projectInvitations.expiresAt });

    const frontendUrl =
      (fastify.config as Record<string, unknown>).FRONTEND_URL as string | undefined ??
      fastify.config.CORS_ORIGIN;

    return reply.code(201).send({
      inviteUrl: `${frontendUrl}/invite/${token}`,
      expiresAt: invitation.expiresAt,
    });
  });

  // ---- GET /api/invitations/:token ---- (public — AC 2, 7, 8)
  fastify.get("/api/invitations/:token", async (request, reply) => {
    const paramResult = tokenParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Token inválido" });
    }

    const rows = await fastify.db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.token, paramResult.data.token))
      .limit(1);

    if (rows.length === 0 || rows[0].expiresAt < new Date()) {
      return reply.code(404).send({ error: "Convite não encontrado ou expirado" });
    }

    if (rows[0].acceptedAt !== null) {
      return reply.code(409).send({ error: "Convite já foi aceito" });
    }

    const inv = rows[0];

    const [projectRow] = await fastify.db
      .select({ name: projects.name, clientName: projects.clientName })
      .from(projects)
      .where(eq(projects.id, inv.projectId))
      .limit(1);

    const [inviterRow] = await fastify.db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, inv.invitedBy))
      .limit(1);

    return {
      projectName: projectRow?.clientName ?? projectRow?.name ?? "Projeto",
      invitedByName: inviterRow?.name ?? "Admin",
      email: inv.email,
      permissions: inv.permissions,
      expiresAt: inv.expiresAt,
    };
  });

  // ---- POST /api/invitations/:token/accept ---- (public — AC 3, 9)
  fastify.post("/api/invitations/:token/accept", async (request, reply) => {
    const paramResult = tokenParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "Token inválido" });
    }

    const rows = await fastify.db
      .select()
      .from(projectInvitations)
      .where(eq(projectInvitations.token, paramResult.data.token))
      .limit(1);

    if (rows.length === 0 || rows[0].expiresAt < new Date()) {
      return reply.code(404).send({ error: "Convite não encontrado ou expirado" });
    }

    if (rows[0].acceptedAt !== null) {
      return reply.code(409).send({ error: "Convite já foi aceito" });
    }

    const inv = rows[0];

    // Use the authenticated user (request.userId set by auth middleware)
    const userId = request.userId;

    // Activate the user and set their role to guest (invited users are pre-approved).
    // If their email is a placeholder, update it to the real invite email.
    const [currentUser] = await fastify.db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const isPlaceholderEmail = currentUser?.email?.endsWith("@placeholder.dev") ?? false;

    if (isPlaceholderEmail) {
      // Clean up any old stub user with the same email (leftover from old invite flow)
      const oldStub = await fastify.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, inv.email), ne(users.id, userId)))
        .limit(1);

      if (oldStub.length > 0) {
        // Transfer any existing project memberships to the real user
        await fastify.db
          .update(projectMembers)
          .set({ userId })
          .where(eq(projectMembers.userId, oldStub[0].id));
        await fastify.db.delete(users).where(eq(users.id, oldStub[0].id));
      }
    }

    await fastify.db
      .update(users)
      .set({
        ...(isPlaceholderEmail ? { email: inv.email, name: inv.email } : {}),
        role: "guest",
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Insert member (ignore conflict if already a member)
    await fastify.db
      .insert(projectMembers)
      .values({
        projectId: inv.projectId,
        userId,
        role: "guest",
        permissions: inv.permissions as Permissions,
      })
      .onConflictDoNothing();

    // Mark invitation as accepted
    await fastify.db
      .update(projectInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(projectInvitations.id, inv.id));

    return reply.code(200).send({
      projectId: inv.projectId,
      userId,
      permissions: inv.permissions,
    });
  });

  // ---- GET /api/projects/:id/pending-invitations ---- lista convites não aceitos
  fastify.get("/api/projects/:id/pending-invitations", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectIfAllowed(paramResult.data.id, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const now = new Date();
    const invites = await fastify.db
      .select({
        id: projectInvitations.id,
        email: projectInvitations.email,
        permissions: projectInvitations.permissions,
        expiresAt: projectInvitations.expiresAt,
        createdAt: projectInvitations.createdAt,
      })
      .from(projectInvitations)
      .where(
        and(
          eq(projectInvitations.projectId, paramResult.data.id),
          isNull(projectInvitations.acceptedAt),
          gt(projectInvitations.expiresAt, now),
        ),
      );

    return invites;
  });

  // ---- DELETE /api/projects/:id/invitations/:invitationId ---- cancela convite pendente
  fastify.delete("/api/projects/:id/invitations/:invitationId", async (request, reply) => {
    const paramResult = idParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const { invitationId } = request.params as { invitationId: string };

    const project = await getProjectIfAllowed(paramResult.data.id, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    await fastify.db
      .delete(projectInvitations)
      .where(
        and(
          eq(projectInvitations.id, invitationId),
          eq(projectInvitations.projectId, paramResult.data.id),
          isNull(projectInvitations.acceptedAt),
        ),
      );

    return reply.code(204).send();
  });
});
