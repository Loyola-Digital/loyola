import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import { hashApiKey } from "../services/api-key.js";
import apiKeyAuthPlugin, { requireScope } from "../middleware/api-key-auth.js";

// Chave de teste e hash correspondente (o middleware faz lookup por hash).
const RAW_KEY = "lyx_live_test_key_value";
const KEY_HASH = hashApiKey(RAW_KEY);

const mockSelect = vi.fn();
const mockUpdate = vi.fn(() => ({
  set: () => ({ where: () => Promise.resolve() }),
}));

function setKeyRow(row: unknown | null) {
  // select().from().where().limit() — persistente (vários requests no mesmo teste)
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }),
    }),
  });
}

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", {
    select: mockSelect,
    update: mockUpdate,
  } as unknown as Database);
});

async function buildTestApp() {
  const app = Fastify();
  await app.register(mockDbPlugin);
  await app.register(apiKeyAuthPlugin);

  app.get("/api/public/meta/test", { preHandler: requireScope("meta:read") }, async (req) => ({
    ok: true,
    apiKeyId: req.apiKey?.id ?? null,
  }));
  app.get("/api/public/admin/test", { preHandler: requireScope("admin:read") }, async () => ({ ok: true }));
  app.get("/api/public/plain", async (req) => ({ ok: true, scopes: req.apiKey?.scopes ?? null }));
  app.post("/api/public/meta/test", async () => ({ ok: true }));
  app.get("/api/other", async () => ({ ok: true })); // rota não-pública: middleware ignora

  await app.ready();
  return app;
}

describe("apiKeyAuth — validação", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    mockSelect.mockReset();
    mockUpdate.mockClear();
  });

  it("rota não-pública passa sem API key", async () => {
    const res = await app.inject({ method: "GET", url: "/api/other" });
    expect(res.statusCode).toBe(200);
  });

  it("401 quando API key ausente", async () => {
    setKeyRow({ id: "k1", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
    const res = await app.inject({ method: "GET", url: "/api/public/plain" });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("API_KEY_MISSING");
  });

  it("401 quando API key inválida (sem registro)", async () => {
    setKeyRow(null);
    const res = await app.inject({
      method: "GET",
      url: "/api/public/plain",
      headers: { "x-api-key": "lyx_live_inexistente" },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe("API_KEY_INVALID");
  });

  it("403 quando API key revogada", async () => {
    setKeyRow({ id: "k1", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: new Date() });
    const res = await app.inject({
      method: "GET",
      url: "/api/public/plain",
      headers: { "x-api-key": RAW_KEY },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("API_KEY_REVOKED");
  });

  it("405 em método de escrita (read-only) antes mesmo de checar a key", async () => {
    setKeyRow({ id: "k1", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
    const res = await app.inject({
      method: "POST",
      url: "/api/public/meta/test",
      headers: { "x-api-key": RAW_KEY },
      body: {},
    });
    expect(res.statusCode).toBe(405);
  });

  it("200 com key válida e popula request.apiKey", async () => {
    setKeyRow({ id: "kvalid", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
    const res = await app.inject({
      method: "GET",
      url: "/api/public/plain",
      headers: { "x-api-key": RAW_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).scopes).toEqual(["meta:read"]);
  });

  it("requireScope: passa quando a key tem o scope", async () => {
    setKeyRow({ id: "kscope1", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
    const res = await app.inject({
      method: "GET",
      url: "/api/public/meta/test",
      headers: { "x-api-key": RAW_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).apiKeyId).toBe("kscope1");
  });

  it("requireScope: 403 quando a key NÃO tem o scope", async () => {
    setKeyRow({ id: "kscope2", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
    const res = await app.inject({
      method: "GET",
      url: "/api/public/admin/test",
      headers: { "x-api-key": RAW_KEY },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("SCOPE_REQUIRED");
  });
});

describe("apiKeyAuth — rate limit", () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
    // id próprio para não colidir com os buckets dos outros testes (map é module-level)
    setKeyRow({ id: "krate", keyHash: KEY_HASH, scopes: ["meta:read"], revokedAt: null });
  });
  afterAll(async () => {
    await app.close();
  });

  it("retorna 429 após exceder o limite da janela", async () => {
    let got429 = false;
    let okCount = 0;
    for (let i = 0; i < 130; i++) {
      const res = await app.inject({
        method: "GET",
        url: "/api/public/plain",
        headers: { "x-api-key": RAW_KEY },
      });
      if (res.statusCode === 200) okCount++;
      if (res.statusCode === 429) {
        got429 = true;
        expect(res.headers["retry-after"]).toBeDefined();
        break;
      }
    }
    expect(okCount).toBe(120);
    expect(got429).toBe(true);
  });
});
