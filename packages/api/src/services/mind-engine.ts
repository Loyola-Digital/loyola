import fp from "fastify-plugin";
import type { MindMetadata } from "@loyola-x/shared";
import { ArtifactCache } from "./artifact-cache.js";
import {
  buildSystemPrompt,
  getTokenEstimate,
  loadTier3Artifact,
} from "./prompt-builder.js";

interface MindEngine {
  buildPrompt(mindId: string, tier?: 1 | 2 | 3): Promise<string>;
  getTokenEstimate(mindId: string, tier?: 1 | 2 | 3): number;
  loadTier3Artifact(
    mindId: string,
    artifactKey: string
  ): Promise<string | null>;
  getCacheStats(): { size: number; items: number };
}

declare module "fastify" {
  interface FastifyInstance {
    mindEngine: MindEngine;
  }
}

export default fp(async function mindEnginePlugin(fastify) {
  const cache = new ArtifactCache();

  function resolveMind(mindId: string): MindMetadata {
    const mind = fastify.mindRegistry.getById(mindId);
    if (!mind) {
      throw new Error(`Mind not found: ${mindId}`);
    }
    return mind;
  }

  const engine: MindEngine = {
    async buildPrompt(mindId: string, tier: 1 | 2 | 3 = 2): Promise<string> {
      const mind = resolveMind(mindId);
      return buildSystemPrompt(mind, tier, cache);
    },

    getTokenEstimate(mindId: string, tier: 1 | 2 | 3 = 2): number {
      const mind = resolveMind(mindId);
      return getTokenEstimate(mind, tier);
    },

    async loadTier3Artifact(
      mindId: string,
      artifactKey: string
    ): Promise<string | null> {
      const mind = resolveMind(mindId);
      return loadTier3Artifact(mind, artifactKey, cache);
    },

    getCacheStats() {
      return cache.stats();
    },
  };

  fastify.decorate("mindEngine", engine);
});
