import { z } from "zod";
import { eq, and } from "drizzle-orm";
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
    instagram: z.boolean(),
    conversations: z.boolean(),
    mind: z.boolean(),
  }),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function invitationsRoutes(fastify) {
  // Helper: fetch project only if it belongs to the requesting user
  async function getProjectForUser(projectId: string, userId: string) {
    const rows = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.createdBy, userId)))
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

    const project = await getProjectForUser(paramResult.data.id, request.userId);
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

    // Find or create user by email (MVP: placeholder clerkId for guests)
    let userId: string;
    const existing = await fastify.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inv.email))
      .limit(1);

    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const [newUser] = await fastify.db
        .insert(users)
        .values({
          clerkId: `guest:${inv.token}`,
          email: inv.email,
          name: inv.email,
          role: "guest",
        })
        .returning({ id: users.id });
      userId = newUser.id;
    }

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
});
