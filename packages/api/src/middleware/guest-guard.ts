import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projectMembers } from "../db/schema.js";

type GuestPermissions = {
  instagram?: boolean;
  conversations?: boolean;
  mind?: boolean;
};

/**
 * Detects which module a project sub-path belongs to.
 * Returns null if not a module-scoped path.
 */
function detectModule(subPath: string): keyof GuestPermissions | null {
  if (subPath.includes("/instagram")) return "instagram";
  if (subPath.includes("/conversations")) return "conversations";
  return null;
}

/**
 * Global preHandler that enforces guest access restrictions:
 *
 * - Guests cannot use write operations on project routes
 * - Guests cannot access global (non-project-scoped) routes
 * - Guests accessing /api/projects/:id/* must be members with matching permissions
 * - GET /api/projects is NOT blocked here — filtered in route handler
 */
export default fp(async function guestGuardPlugin(fastify) {
  fastify.addHook("preHandler", async (request, reply) => {
    if (request.userRole !== "guest") return;

    const rawUrl = request.url.split("?")[0];
    const method = request.method.toUpperCase();

    // Block write operations on any project route
    if (
      rawUrl.startsWith("/api/projects") &&
      ["POST", "PUT", "DELETE"].includes(method)
    ) {
      return reply.code(403).send({ error: "project_access_denied" });
    }

    // Block global routes (non-project-scoped)
    if (rawUrl === "/api/instagram/accounts" && method === "GET") {
      return reply.code(403).send({ error: "project_access_denied" });
    }
    if (rawUrl === "/api/conversations" && method === "GET") {
      return reply.code(403).send({ error: "project_access_denied" });
    }
    if (rawUrl.startsWith("/api/tasks") && method === "GET") {
      return reply.code(403).send({ error: "project_access_denied" });
    }

    // Chat: if projectId is in body, validate mind permission
    if (rawUrl === "/api/chat" && method === "POST") {
      const body = request.body as Record<string, unknown> | null;
      const projectId = body?.projectId as string | undefined;
      if (projectId) {
        const [member] = await fastify.db
          .select({ permissions: projectMembers.permissions })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, request.userId)
            )
          )
          .limit(1);

        if (!member) {
          return reply.code(403).send({ error: "project_access_denied" });
        }
        const perms = member.permissions as GuestPermissions;
        if (!perms.mind) {
          return reply.code(403).send({ error: "module_not_allowed", module: "mind" });
        }
      }
      return;
    }

    // /api/projects/:id/* — validate membership + module permissions
    const projectMatch = rawUrl.match(/^\/api\/projects\/([^/]+)(\/.*)?$/);
    if (!projectMatch) return;

    const projectId = projectMatch[1];
    const subPath = projectMatch[2] ?? "";

    const [member] = await fastify.db
      .select({ permissions: projectMembers.permissions })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, request.userId)
        )
      )
      .limit(1);

    if (!member) {
      return reply.code(403).send({ error: "project_access_denied" });
    }

    const module = detectModule(subPath);
    if (module) {
      const perms = member.permissions as GuestPermissions;
      if (!perms[module]) {
        return reply.code(403).send({ error: "module_not_allowed", module });
      }
    }
  });
});
