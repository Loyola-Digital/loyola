import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

// ============================================================
// CONSTANTS
// ============================================================

const MOCK_USER_ID = "10000000-0000-4000-8000-000000000001";
const MOCK_PROJECT_ID = "30000000-0000-4000-8000-000000000003";
const MOCK_ACCOUNT_ID = "20000000-0000-4000-8000-000000000002";
const MOCK_CONV_ID = "40000000-0000-4000-8000-000000000004";

const MOCK_PROJECT_ROW = {
  id: MOCK_PROJECT_ID,
  name: "Projeto XYZ",
  clientName: "Cliente XYZ Ltda",
  description: "Desc",
  color: "#d4a843",
  isActive: true,
  createdBy: MOCK_USER_ID,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const MOCK_ACCOUNT_ROW = {
  id: MOCK_ACCOUNT_ID,
  accountName: "Cliente XYZ IG",
  instagramUsername: "clientexyz",
  instagramUserId: "17841400123",
  profilePictureUrl: null,
  isActive: true,
  projectId: MOCK_PROJECT_ID,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const MOCK_CONV_ROW = {
  id: MOCK_CONV_ID,
  userId: MOCK_USER_ID,
  mindId: "mind-001",
  mindName: "Mind 1",
  squadId: "squad-001",
  title: "Conversa 1",
  messageCount: 0,
  totalTokens: 0,
  projectId: MOCK_PROJECT_ID,
  deletedAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

// ============================================================
// MOCK DB
// ============================================================

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

/** select().from().where().limit() → rows */
function setupGetProject(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

/** select().from().where() → rows (no limit) */
function setupSelectWhere(rows: unknown[]) {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

// ============================================================
// PLUGINS
// ============================================================

const mockEnvPlugin = fp(async (fastify) => {
  fastify.decorate("config", {
    PORT: 3001,
    HOST: "0.0.0.0",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    CLERK_SECRET_KEY: "sk_test",
    CLERK_PUBLISHABLE_KEY: "pk_test",
    ANTHROPIC_API_KEY: "sk-ant-test",
    CORS_ORIGIN: "http://localhost:3000",
    MINDS_BASE_PATH: "./squads",
    ENCRYPTION_KEY: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  });
});

const mockAuthPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    request.userId = MOCK_USER_ID;
  });
});

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  } as unknown as Database);
});

import projectRoutes from "../routes/projects.js";

// ============================================================
// TESTS
// ============================================================

describe("Project Routes", () => {
  const app = Fastify();
  const AUTH = { authorization: "Bearer mock_token" };

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(projectRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Auth ----

  it("returns 401 without auth header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/projects" });
    expect(res.statusCode).toBe(401);
  });

  // ---- POST /api/projects ----

  it("creates project — 201 with all fields", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([MOCK_PROJECT_ROW]),
      }),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: AUTH,
      payload: {
        name: "Projeto XYZ",
        clientName: "Cliente XYZ Ltda",
        description: "Desc",
        color: "#d4a843",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Projeto XYZ");
    expect(body.clientName).toBe("Cliente XYZ Ltda");
    expect(body.color).toBe("#d4a843");
    expect(body.isActive).toBe(true);
  });

  it("returns 400 for missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: AUTH,
      payload: { name: "Sem clientName" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid color format", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers: AUTH,
      payload: { name: "P", clientName: "C", color: "red" },
    });
    expect(res.statusCode).toBe(400);
  });

  // ---- GET /api/projects ----

  it("lists only projects belonging to the authenticated user", async () => {
    setupSelectWhere([MOCK_PROJECT_ROW]);

    const res = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe(MOCK_PROJECT_ID);
  });

  // ---- GET /api/projects/:id ----

  it("returns project details when user owns it", async () => {
    setupGetProject([MOCK_PROJECT_ROW]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Projeto XYZ");
  });

  it("returns 404 when project belongs to another user", async () => {
    setupGetProject([]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid UUID param", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/projects/not-a-uuid",
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
  });

  // ---- PUT /api/projects/:id ----

  it("updates project fields", async () => {
    const updated = { ...MOCK_PROJECT_ROW, name: "Novo Nome", updatedAt: new Date() };
    setupGetProject([MOCK_PROJECT_ROW]);
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    });

    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
      payload: { name: "Novo Nome" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Novo Nome");
  });

  it("returns 404 on PUT for non-owned project", async () => {
    setupGetProject([]);

    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
      payload: { name: "X" },
    });

    expect(res.statusCode).toBe(404);
  });

  // ---- DELETE /api/projects/:id ----

  it("deletes owned project — 204", async () => {
    setupGetProject([MOCK_PROJECT_ROW]);
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 on DELETE for non-owned project", async () => {
    setupGetProject([]);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${MOCK_PROJECT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });

  // ---- GET /api/projects/:id/instagram/accounts ----

  it("returns instagram accounts for the project", async () => {
    setupGetProject([MOCK_PROJECT_ROW]);
    setupSelectWhere([MOCK_ACCOUNT_ROW]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/instagram/accounts`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].projectId).toBe(MOCK_PROJECT_ID);
  });

  it("returns 404 on GET instagram/accounts for non-owned project", async () => {
    setupGetProject([]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/instagram/accounts`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });

  // ---- GET /api/projects/:id/conversations ----

  it("returns conversations for the project", async () => {
    setupGetProject([MOCK_PROJECT_ROW]);
    setupSelectWhere([MOCK_CONV_ROW]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/conversations`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe(MOCK_CONV_ID);
  });

  it("returns 404 on GET conversations for non-owned project", async () => {
    setupGetProject([]);

    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/conversations`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
  });
});
