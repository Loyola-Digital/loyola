import { readFile } from "node:fs/promises";
import fp from "fastify-plugin";
import { sql } from "drizzle-orm";
import type { MindDetail } from "@loyola-x/shared";

export default fp(async function mindsRoutes(fastify) {
  fastify.get("/api/minds", async (request) => {
    const { q } = request.query as { q?: string };

    if (q && q.trim().length > 0) {
      return { squads: fastify.mindRegistry.search(q.trim()) };
    }

    return { squads: fastify.mindRegistry.getAll() };
  });

  fastify.get("/api/minds/:mindId", async (request, reply) => {
    const { mindId } = request.params as { mindId: string };
    const mind = fastify.mindRegistry.getById(mindId);

    if (!mind) {
      reply.code(404);
      return { error: "Mind not found" };
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
