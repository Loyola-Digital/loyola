import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import type { MindDetail, Squad } from "@loyola-x/shared";

const FIXTURES_PATH = join(__dirname, "fixtures", "squads");

const mockEnvPlugin = fp(async (fastify) => {
  fastify.decorate("config", {
    PORT: 3001,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    CLERK_SECRET_KEY: "sk_test_mock",
    CLERK_PUBLISHABLE_KEY: "pk_test_mock",
    CORS_ORIGIN: "http://localhost:3000",
    MINDS_BASE_PATH: FIXTURES_PATH,
  });
});

const mockExecute = vi.fn().mockResolvedValue([]);

const mockDbPlugin = fp(async (fastify) => {
  const mockDb = { execute: mockExecute } as unknown as Database;
  fastify.decorate("db", mockDb);
});

const mockAuthPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url === "/api/health") return;
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    request.userId = "user_test_123";
  });
});

// Import the actual plugins
import mindRegistryPlugin from "../services/mind-registry.js";
import mindsRoutes from "../routes/minds.js";

describe("MindRegistry — Filesystem Scanner", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(mindRegistryPlugin);
    await app.register(mindsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("scans fixture squads and finds 3 minds/agents", () => {
    const squads = app.mindRegistry.getAll();
    const totalMinds = squads.reduce((sum, s) => sum + s.mindCount, 0);
    expect(totalMinds).toBe(3);
  });

  it("finds MMOS minds (multi-file pattern)", () => {
    const mind = app.mindRegistry.getById("mind_one");
    expect(mind).toBeDefined();
    expect(mind!.name).toBe("Test Mind One");
    expect(mind!.type).toBe("mind");
    expect(mind!.squad).toBe("test-mmos");
  });

  it("finds content-engine agents (single-file pattern)", () => {
    const agent = app.mindRegistry.getById("test-agent");
    expect(agent).toBeDefined();
    expect(agent!.name).toBe("Test Agent");
    expect(agent!.type).toBe("agent");
    expect(agent!.specialty).toBe("Content Testing Specialist");
  });

  it("indexes artifact paths correctly", () => {
    const mind = app.mindRegistry.getById("mind_one");
    expect(mind!.artifactPaths.cognitiveOS).toBeTruthy();
    expect(mind!.artifactPaths.frameworks).toBeTruthy();
    expect(mind!.artifactPaths.communicationDNA).toBeTruthy();
  });

  it("calculates totalTokenEstimate > 0", () => {
    const mind = app.mindRegistry.getById("mind_one");
    expect(mind!.totalTokenEstimate).toBeGreaterThan(0);
  });

  it("search filters by name", () => {
    const results = app.mindRegistry.search("Test Mind One");
    const allMinds = results.flatMap((s) => s.minds);
    expect(allMinds).toHaveLength(1);
    expect(allMinds[0].name).toBe("Test Mind One");
  });

  it("search filters by specialty", () => {
    const results = app.mindRegistry.search("Content Testing");
    const allMinds = results.flatMap((s) => s.minds);
    expect(allMinds).toHaveLength(1);
    expect(allMinds[0].id).toBe("test-agent");
  });
});

describe("Minds REST Endpoints", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(mindRegistryPlugin);
    await app.register(mindsRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/minds returns squads with minds", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/minds",
      headers: { authorization: "Bearer mock_jwt" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { squads: Squad[] };
    expect(body.squads).toBeDefined();
    expect(body.squads.length).toBeGreaterThan(0);

    const totalMinds = body.squads.reduce((s, sq) => s + sq.mindCount, 0);
    expect(totalMinds).toBe(3);
  });

  it("GET /api/minds?q=agent filters results", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/minds?q=agent",
      headers: { authorization: "Bearer mock_jwt" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { squads: Squad[] };
    const allMinds = body.squads.flatMap((s) => s.minds);
    expect(allMinds.every((m) => m.name.toLowerCase().includes("agent") || m.specialty.toLowerCase().includes("agent"))).toBe(true);
  });

  it("GET /api/minds/:mindId returns detail with bio", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/minds/mind_one",
      headers: { authorization: "Bearer mock_jwt" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as MindDetail;
    expect(body.id).toBe("mind_one");
    expect(body.name).toBe("Test Mind One");
    expect(body.bio).toBeTruthy();
    expect(body.bio.length).toBeGreaterThan(0);
    expect(body.stats).toBeDefined();
    expect(body.stats.artifactCount).toBeGreaterThan(0);
  });

  it("GET /api/minds/:mindId returns 404 for unknown mind", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/minds/nonexistent",
      headers: { authorization: "Bearer mock_jwt" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("Mind not found");
  });

  it("GET /api/minds requires authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/minds",
    });

    expect(response.statusCode).toBe(401);
  });
});
