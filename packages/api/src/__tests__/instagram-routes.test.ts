import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

// ============================================================
// MOCKS
// ============================================================

// Valid UUIDs: version nibble must be 1-5, variant nibble must be 8/9/a/b
const MOCK_USER_ID = "10000000-0000-4000-8000-000000000001";
const MOCK_ACCOUNT_ID = "20000000-0000-4000-8000-000000000002";
const MOCK_ACCOUNT_ROW = {
  id: MOCK_ACCOUNT_ID,
  userId: MOCK_USER_ID,
  accountName: "Cliente XYZ",
  instagramUserId: "17841400123",
  instagramUsername: "clientexyz",
  accessTokenEncrypted: "enc.tag",
  accessTokenIv: "aXY=",
  profilePictureUrl: "https://pic.jpg",
  isActive: true,
  lastSyncedAt: null,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock encryption
vi.mock("../services/encryption", () => ({
  encrypt: vi.fn().mockReturnValue({ encrypted: "enc.tag", iv: "aXY=" }),
}));

// Mock instagram service
const mockInstagramService = {
  validateToken: vi.fn().mockResolvedValue({
    id: "17841400123",
    name: "Test",
    username: "clientexyz",
  }),
  getProfile: vi.fn().mockResolvedValue({
    id: "17841400123",
    username: "clientexyz",
    followers_count: 5000,
  }),
  getMediaList: vi.fn().mockResolvedValue({
    data: [{ id: "media1", caption: "Post" }],
    nextCursor: "cursor1",
  }),
  getMediaInsights: vi.fn().mockResolvedValue([{ name: "impressions", values: [{ value: 100 }] }]),
  getAccountInsights: vi.fn().mockResolvedValue([{ name: "reach", values: [{ value: 500 }] }]),
  getAudienceDemographics: vi.fn().mockResolvedValue([{ name: "audience_city", values: [{ value: {} }] }]),
  getStories: vi.fn().mockResolvedValue([{ id: "story1" }]),
  getReels: vi.fn().mockResolvedValue({ data: [{ id: "reel1" }] }),
  invalidateCache: vi.fn().mockResolvedValue(undefined),
};

// Mock DB
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

function setupSelectReturns(...results: unknown[][]) {
  for (const result of results) {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    });
  }
}

function setupSelectNoLimit(...results: unknown[][]) {
  for (const result of results) {
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockResolvedValue(result),
    });
  }
}

// Plugins
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

const mockInstagramServicePlugin = fp(async (fastify) => {
  fastify.decorate("instagramService", mockInstagramService);
});

// Import routes
import instagramRoutes from "../routes/instagram.js";

// ============================================================
// TESTS
// ============================================================

describe("Instagram Routes", () => {
  const app = Fastify();
  const AUTH_HEADER = { authorization: "Bearer mock_token" };

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(mockInstagramServicePlugin);
    await app.register(instagramRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Auth ----

  it("returns 401 without auth header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/instagram/accounts",
    });
    expect(response.statusCode).toBe(401);
  });

  // ---- POST /api/instagram/accounts ----

  it("creates account with valid token", async () => {
    // Check for duplicate → empty
    setupSelectReturns([]);
    // Insert
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([MOCK_ACCOUNT_ROW]),
      }),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/instagram/accounts",
      headers: AUTH_HEADER,
      payload: {
        accountName: "Cliente XYZ",
        accessToken: "EAABx123",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accountName).toBe("Cliente XYZ");
    expect(body.instagramUsername).toBe("clientexyz");
    // Should NOT expose token
    expect(body.accessTokenEncrypted).toBeUndefined();
  });

  it("returns 409 for duplicate instagram account", async () => {
    // Duplicate found
    setupSelectReturns([{ id: "existing-id" }]);

    const response = await app.inject({
      method: "POST",
      url: "/api/instagram/accounts",
      headers: AUTH_HEADER,
      payload: {
        accountName: "Duplicate",
        accessToken: "EAABx123",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("DUPLICATE_ACCOUNT");
  });

  it("returns 400 for missing fields on create", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/instagram/accounts",
      headers: AUTH_HEADER,
      payload: { accountName: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  // ---- GET /api/instagram/accounts ----

  it("lists accounts for authenticated user", async () => {
    setupSelectNoLimit([MOCK_ACCOUNT_ROW]);

    const response = await app.inject({
      method: "GET",
      url: "/api/instagram/accounts",
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // ---- GET /api/instagram/accounts/:id ----

  it("returns 404 for non-owned account", async () => {
    setupSelectReturns([]);

    const response = await app.inject({
      method: "GET",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns account details for owned account", async () => {
    setupSelectReturns([MOCK_ACCOUNT_ROW]);

    const response = await app.inject({
      method: "GET",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accountName).toBe("Cliente XYZ");
  });

  // ---- GET /api/instagram/accounts/:id/profile ----

  it("returns profile via instagram service", async () => {
    setupSelectReturns([MOCK_ACCOUNT_ROW]);

    const response = await app.inject({
      method: "GET",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}/profile`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(mockInstagramService.getProfile).toHaveBeenCalledWith(MOCK_ACCOUNT_ID);
  });

  // ---- GET /api/instagram/accounts/:id/insights ----

  it("returns insights with default period", async () => {
    setupSelectReturns([MOCK_ACCOUNT_ROW]);

    const response = await app.inject({
      method: "GET",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}/insights`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().period).toBe("day");
  });

  // ---- POST /api/instagram/accounts/:id/refresh ----

  it("invalidates cache on refresh", async () => {
    setupSelectReturns([MOCK_ACCOUNT_ROW]);

    const response = await app.inject({
      method: "POST",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}/refresh`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(200);
    expect(mockInstagramService.invalidateCache).toHaveBeenCalledWith(MOCK_ACCOUNT_ID);
  });

  // ---- DELETE /api/instagram/accounts/:id ----

  it("deletes owned account", async () => {
    setupSelectReturns([MOCK_ACCOUNT_ROW]);
    // First delete: cache rows
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    // Second delete: account row
    mockDelete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/instagram/accounts/${MOCK_ACCOUNT_ID}`,
      headers: AUTH_HEADER,
    });

    expect(response.statusCode).toBe(204);
  });
});
