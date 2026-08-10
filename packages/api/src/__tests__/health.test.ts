import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

// Mock env plugin — provides config without real env vars
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
    MINDS_BASE_PATH: "./squads",
  });
});

const mockExecute = vi.fn().mockResolvedValue([{ "?column?": 1 }]);

// Mock DB plugin — simulates database connection
const mockDbPlugin = fp(async (fastify) => {
  const mockDb = { execute: mockExecute } as unknown as Database;
  fastify.decorate("db", mockDb);
});

// Mock auth plugin — simulates Clerk auth
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

// Import the actual health routes
import healthRoutes from "../routes/health.js";
import { API_CONTRACT_VERSION } from "@loyola-x/shared";

describe("Health Endpoint", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(healthRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/health returns 200 with ok status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.timestamp).toBeDefined();
  });

  it("GET /api/health does not require authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      // No authorization header
    });

    expect(response.statusCode).toBe(200);
  });

  it("GET /api/health returns 503 when DB is down", async () => {
    // Override mock to simulate DB failure
    mockExecute.mockRejectedValueOnce(new Error("Connection refused"));

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe("error");
    expect(body.db).toBe("disconnected");
  });

  // ---- Story 29.46 (AC2/AC5) ----

  it("publica o contrato do shared, para o web comparar", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.json().contract).toBe(API_CONTRACT_VERSION);
  });

  it("commit e null sem a variavel do provedor", async () => {
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;

    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.json().commit).toBeNull();
  });

  it("commit e o SHA curto quando o Railway injeta a variavel", async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "0489cfe6c9d10c9d7640f94ab08d8e2d9e3ae4be";
    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });
      expect(response.json().commit).toBe("0489cfe");
    } finally {
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
    }
  });

  // Quando o banco cai e que saber o build importa mais, nao menos.
  it("contrato e commit tambem no 503", async () => {
    mockExecute.mockRejectedValueOnce(new Error("Connection refused"));

    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json().contract).toBe(API_CONTRACT_VERSION);
    expect(response.json()).toHaveProperty("commit");
  });
});

describe("Auth Middleware", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);

    // Add a protected test route
    app.get("/api/protected", async (request) => {
      return { userId: request.userId };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 for request without JWT", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/protected",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Unauthorized");
  });

  it("returns 200 for request with valid JWT", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/protected",
      headers: {
        authorization: "Bearer mock_jwt_token",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().userId).toBe("user_test_123");
  });
});
