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
    CORS_ORIGIN: "http://localhost:3000",
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
