import { readFile } from "node:fs/promises";
import fp from "fastify-plugin";
import { sql, eq } from "drizzle-orm";
import type { MindDetail } from "@loyola-x/shared";
import { projectMembers, conversations } from "../db/schema.js";

export default fp(async function mindsRoutes(fastify) {
  fastify.get("/api/minds", async (request) => {
    const { q } = request.query as { q?: string };
    const userId = request.userId!;
    const userRole = request.userRole!;

    // For restricted roles, find mind IDs linked to user's projects
    let projectMindIds: string[] | undefined;
    if (userRole === "guest") {
      try {
        const memberships = await fastify.db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, userId));

        if (memberships.length > 0) {
          const projectIds = memberships.map((m) => m.projectId);
          const result = await fastify.db.execute(
            sql`SELECT DISTINCT mind_id FROM conversations WHERE project_id = ANY(${projectIds}) AND deleted_at IS NULL`
          );
          const rows = result as unknown as { mind_id: string }[];
          projectMindIds = rows.map((r) => r.mind_id);
        }
      } catch {
        projectMindIds = [];
      }
    }

    if (q && q.trim().length > 0) {
      const all = fastify.mindRegistry.search(q.trim());
      // Apply role filtering to search results too
      if (userRole === "guest") {
        return {
          squads: fastify.mindRegistry
            .getAllForRole(userRole, projectMindIds)
            .map((squad) => ({
              ...squad,
              minds: squad.minds.filter(
                (m) =>
                  m.name.toLowerCase().includes(q.trim().toLowerCase()) ||
                  m.specialty.toLowerCase().includes(q.trim().toLowerCase()) ||
                  m.tags.some((t) => t.toLowerCase().includes(q.trim().toLowerCase()))
              ),
            }))
            .filter((s) => s.minds.length > 0)
            .map((s) => ({ ...s, mindCount: s.minds.length })),
        };
      }
      return { squads: all };
    }

    return { squads: fastify.mindRegistry.getAllForRole(userRole, projectMindIds) };
  });

  fastify.get("/api/minds/:mindId", async (request, reply) => {
    const { mindId } = request.params as { mindId: string };
    const userId = request.userId!;
    const userRole = request.userRole!;
    const mind = fastify.mindRegistry.getById(mindId);

    if (!mind) {
      reply.code(404);
      return { error: "Mind not found" };
    }

    // Check squad access restrictions
    const squad = fastify.mindRegistry.getSquadByMindId(mindId);
    if (squad?.access?.excludeRoles?.includes(userRole)) {
      // Check if user has access via project membership
      let hasProjectAccess = false;
      if (squad.access.allowProjectMembers) {
        try {
          const result = await fastify.db.execute(
            sql`SELECT 1 FROM conversations c
                JOIN project_members pm ON pm.project_id = c.project_id AND pm.user_id = ${userId}
                WHERE c.mind_id = ${mindId} AND c.deleted_at IS NULL
                LIMIT 1`
          );
          const rows = result as unknown as unknown[];
          hasProjectAccess = rows.length > 0;
        } catch {
          hasProjectAccess = false;
        }
      }
      if (!hasProjectAccess) {
        reply.code(403);
        return { error: "Access denied" };
      }
    }

    // Read bio from COGNITIVE_OS (first ~500 chars)
    let bio = "";
    if (mind.artifactPaths.cognitiveOS) {
      try {
        const content = await readFile(mind.artifactPaths.cognitiveOS, "utf-8");
        // Skip markdown headers, get actual content
        const lines = content.split("\n").filter((l) => !l.startsWith("#") && l.trim().length > 0);
        bio = lines.join(" ").slice(0, 500).trim();
      } catch {
        bio = "";
      }
    }

    // Extract framework names from artifact keys/paths
    const frameworks: string[] = [];
    for (const [key, path] of Object.entries(mind.artifactPaths)) {
      if (path && key.toLowerCase().includes("framework")) {
        frameworks.push(
          key
            .replace(/^\d+_/, "")
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
        );
      }
    }

    // Extract communication style from COMMUNICATION_DNA
    const communicationStyle = {
      tone: "",
      vocabulary: [] as string[],
      forbiddenWords: [] as string[],
    };

    if (mind.artifactPaths.communicationDNA) {
      try {
        const content = await readFile(
          mind.artifactPaths.communicationDNA,
          "utf-8"
        );
        const header = content.slice(0, 1024);
        const toneMatch = header.match(/(?:tone|tom)[:\s]+(.+)/i);
        if (toneMatch) communicationStyle.tone = toneMatch[1].trim();
      } catch {
        // Optional
      }
    }

    // Get conversation count from DB
    let conversationCount = 0;
    try {
      const result = await fastify.db.execute(
        sql`SELECT COUNT(*)::int as count FROM conversations WHERE mind_id = ${mindId} AND deleted_at IS NULL`
      );
      const rows = result as unknown as { count: number }[];
      if (rows.length > 0) conversationCount = rows[0].count;
    } catch {
      // DB query optional — may fail if no conversations table populated yet
    }

    const detail: MindDetail = {
      id: mind.id,
      name: mind.name,
      squad: mind.squad,
      specialty: mind.specialty,
      tags: mind.tags,
      avatarUrl: mind.avatarUrl,
      totalTokenEstimate: mind.totalTokenEstimate,
      bio,
      frameworks,
      communicationStyle,
      stats: {
        artifactCount: Object.values(mind.artifactPaths).filter(Boolean).length,
        heuristicCount: mind.heuristicPaths.length,
        conversationCount,
      },
    };

    return detail;
  });
});
