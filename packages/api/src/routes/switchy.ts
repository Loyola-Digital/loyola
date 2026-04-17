import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { projects, projectMembers } from "../db/schema.js";
import { fetchSwitchyFolders, fetchSwitchyLinks } from "../services/switchy.js";

// ============================================================
// SCHEMAS
// ============================================================

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const linksQuerySchema = z.object({
  folderId: z.coerce.number().int().positive().optional(),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function switchyRoutes(fastify) {
  function getSwitchyToken(): string {
    const token = fastify.config.SWITCHY_API_TOKEN;
    if (!token) {
      throw new Error("SWITCHY_API_TOKEN not configured");
    }
    return token;
  }

  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.userId, userId),
          ),
        )
        .limit(1);
      if (!member) return null;
    }

    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    return project ?? null;
  }

  // ---- GET /api/projects/:projectId/switchy/folders ----
  fastify.get("/api/projects/:projectId/switchy/folders", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      const folders = await fetchSwitchyFolders(getSwitchyToken());
      return { folders };
    } catch (error) {
      fastify.log.error(error, "Failed to fetch Switchy folders");
      return reply.code(502).send({ error: "Falha ao buscar folders do Switchy" });
    }
  });

  // ---- GET /api/projects/:projectId/switchy/links ----
  fastify.get("/api/projects/:projectId/switchy/links", async (request, reply) => {
    const paramResult = projectIdParamSchema.safeParse(request.params);
    if (!paramResult.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const project = await getProjectAccess(paramResult.data.projectId, request.userId, request.userRole);
    if (!project) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const queryResult = linksQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      return reply.code(400).send({ error: "Query inválida" });
    }

    try {
      const links = await fetchSwitchyLinks(getSwitchyToken(), queryResult.data.folderId);
      return { links };
    } catch (error) {
      fastify.log.error(error, "Failed to fetch Switchy links");
      return reply.code(502).send({ error: "Falha ao buscar links do Switchy" });
    }
  });
});
