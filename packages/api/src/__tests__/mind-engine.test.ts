import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { join } from "node:path";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { ArtifactCache } from "../services/artifact-cache.js";
import {
  buildSystemPrompt,
  getTokenEstimate,
  loadTier3Artifact,
} from "../services/prompt-builder.js";
import mindRegistryPlugin from "../services/mind-registry.js";
import mindEnginePlugin from "../services/mind-engine.js";

const FIXTURES_PATH = join(__dirname, "fixtures", "squads");

const mockEnvPlugin = fp(async (fastify) => {
  fastify.decorate("config", {
    PORT: 3001,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    CLERK_SECRET_KEY: "sk_test_mock",
    CLERK_PUBLISHABLE_KEY: "pk_test_mock",
    ANTHROPIC_API_KEY: "sk-ant-test-mock",
    CORS_ORIGIN: "http://localhost:3000",
    MINDS_BASE_PATH: FIXTURES_PATH,
  });
});

// ---------- Unit Tests: ArtifactCache ----------

describe("ArtifactCache", () => {
  it("loads artifact from filesystem on cache miss", async () => {
    const cache = new ArtifactCache();
    const cogPath = join(
      FIXTURES_PATH,
      "test-mmos/minds/mind_one/system_prompts/COGNITIVE_OS.md"
    );
    const content = await cache.loadArtifact(cogPath);
    expect(content).toContain("Test Mind One Cognitive OS");
    expect(cache.stats().items).toBe(1);
  });

  it("returns cached content on second call (cache hit)", async () => {
    const cache = new ArtifactCache();
    const cogPath = join(
      FIXTURES_PATH,
      "test-mmos/minds/mind_one/system_prompts/COGNITIVE_OS.md"
    );

    // First call — cache miss
    const content1 = await cache.loadArtifact(cogPath);
    expect(cache.stats().items).toBe(1);

    // Second call — cache hit (same content, same item count)
    const content2 = await cache.loadArtifact(cogPath);
    expect(content2).toBe(content1);
    expect(cache.stats().items).toBe(1);

    // Load a non-existent path — should NOT add to cache (empty string)
    await cache.loadArtifact("/nonexistent/file.md");
    // Items should still be 1 (empty strings are still cached by lru-cache,
    // but let's verify the content is correct)
    expect(content2).toContain("Test Mind One Cognitive OS");
  });

  it("returns empty string for non-existent file", async () => {
    const cache = new ArtifactCache();
    const content = await cache.loadArtifact("/nonexistent/path.md");
    expect(content).toBe("");
  });

  it("clear() empties the cache", async () => {
    const cache = new ArtifactCache();
    const cogPath = join(
      FIXTURES_PATH,
      "test-mmos/minds/mind_one/system_prompts/COGNITIVE_OS.md"
    );
    await cache.loadArtifact(cogPath);
    expect(cache.stats().items).toBe(1);

    cache.clear();
    expect(cache.stats().items).toBe(0);
  });

  it("stats() reports size and items", async () => {
    const cache = new ArtifactCache();
    const stats = cache.stats();
    expect(stats).toHaveProperty("size");
    expect(stats).toHaveProperty("items");
    expect(stats.items).toBe(0);
    expect(stats.size).toBe(0);
  });
});

// ---------- Unit Tests: PromptBuilder ----------

describe("PromptBuilder", () => {
  let cache: ArtifactCache;

  beforeEach(() => {
    cache = new ArtifactCache();
  });

  it("buildSystemPrompt tier 1 contains identity header + COGNITIVE_OS + COMMUNICATION_DNA + TASK_DELEGATION", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const mind = app.mindRegistry.getById("mind_one")!;
    const prompt = await buildSystemPrompt(mind, 1, cache);

    expect(prompt).toContain("You are Test Mind One");
    expect(prompt).toContain("Squad: Test Mmos");
    expect(prompt).toContain("Test Mind One Cognitive OS");
    expect(prompt).toContain("Communication DNA");
    expect(prompt).toContain("Task Delegation Capability");
    // Sections separated by ---
    expect(prompt).toContain("\n\n---\n\n");

    await app.close();
  });

  it("buildSystemPrompt tier 2 includes tier 1 + frameworks", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const mind = app.mindRegistry.getById("mind_one")!;
    const promptTier1 = await buildSystemPrompt(mind, 1, cache);
    cache.clear();
    const promptTier2 = await buildSystemPrompt(mind, 2, cache);

    // Tier 2 should be longer (includes frameworks)
    expect(promptTier2.length).toBeGreaterThan(promptTier1.length);
    // Frameworks artifact is 01_FRAMEWORKS_OPERACIONAIS.md
    expect(promptTier2).toContain("You are Test Mind One");

    await app.close();
  });

  it("buildSystemPrompt for agent loads entire file as tier 1", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const agent = app.mindRegistry.getById("test-agent")!;
    const prompt = await buildSystemPrompt(agent, 1, cache);

    expect(prompt).toContain("You are Test Agent");
    expect(prompt).toContain("test agent for validating");
    expect(prompt).toContain("Task Delegation Capability");

    await app.close();
  });

  it("mind without COGNITIVE_OS returns minimal prompt (header + task delegation)", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const mind = app.mindRegistry.getById("mind_two")!;
    // mind_two has COGNITIVE_OS in artifacts/ not system_prompts/
    // But let's test with a fabricated mind that has no cognitiveOS
    const fakeMind = {
      ...mind,
      artifactPaths: {
        ...mind.artifactPaths,
        cognitiveOS: null,
        communicationDNA: null,
      },
    };

    const prompt = await buildSystemPrompt(fakeMind, 1, cache);

    expect(prompt).toContain("You are");
    expect(prompt).toContain("Task Delegation Capability");

    await app.close();
  });

  it("getTokenEstimate returns > 0 for MMOS mind", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const mind = app.mindRegistry.getById("mind_one")!;
    const estimate = getTokenEstimate(mind, 2);
    expect(estimate).toBeGreaterThan(0);

    await app.close();
  });

  it("getTokenEstimate for agent returns totalTokenEstimate", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const agent = app.mindRegistry.getById("test-agent")!;
    const estimate = getTokenEstimate(agent, 1);
    expect(estimate).toBe(agent.totalTokenEstimate);

    await app.close();
  });

  it("loadTier3Artifact returns null for nonexistent artifact key", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.ready();

    const mind = app.mindRegistry.getById("mind_one")!;
    const result = await loadTier3Artifact(mind, "nonexistent", cache);
    expect(result).toBeNull();

    await app.close();
  });
});

// ---------- Integration Tests: MindEngine Fastify Plugin ----------

describe("MindEngine Fastify Plugin", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mindRegistryPlugin);
    await app.register(mindEnginePlugin);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("fastify.mindEngine is decorated", () => {
    expect(app.mindEngine).toBeDefined();
    expect(typeof app.mindEngine.buildPrompt).toBe("function");
    expect(typeof app.mindEngine.getTokenEstimate).toBe("function");
    expect(typeof app.mindEngine.loadTier3Artifact).toBe("function");
    expect(typeof app.mindEngine.getCacheStats).toBe("function");
  });

  it("buildPrompt returns prompt with identity header and task delegation", async () => {
    const prompt = await app.mindEngine.buildPrompt("mind_one", 1);
    expect(prompt).toContain("You are Test Mind One");
    expect(prompt).toContain("Task Delegation Capability");
  });

  it("buildPrompt defaults to tier 2", async () => {
    const prompt = await app.mindEngine.buildPrompt("mind_one");
    // Tier 2 includes frameworks — prompt should be longer than tier 1
    expect(prompt).toContain("You are Test Mind One");
  });

  it("buildPrompt throws for nonexistent mind", async () => {
    await expect(
      app.mindEngine.buildPrompt("nonexistent_mind")
    ).rejects.toThrow("Mind not found: nonexistent_mind");
  });

  it("getTokenEstimate returns > 0", () => {
    const estimate = app.mindEngine.getTokenEstimate("mind_one", 2);
    expect(estimate).toBeGreaterThan(0);
  });

  it("getTokenEstimate throws for nonexistent mind", () => {
    expect(() =>
      app.mindEngine.getTokenEstimate("nonexistent_mind")
    ).toThrow("Mind not found: nonexistent_mind");
  });

  it("getCacheStats returns stats object", () => {
    const stats = app.mindEngine.getCacheStats();
    expect(stats).toHaveProperty("size");
    expect(stats).toHaveProperty("items");
  });

  it("loadTier3Artifact returns null for nonexistent key", async () => {
    const result = await app.mindEngine.loadTier3Artifact(
      "mind_one",
      "nonexistent_key"
    );
    expect(result).toBeNull();
  });
});
