import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

// ============================================================
// CONSTANTS
// ============================================================

const MOCK_USER_ID = "10000000-0000-4000-8000-000000000001";
const MOCK_GUEST_ID = "10000000-0000-4000-8000-000000000099";
const MOCK_PROJECT_ID = "30000000-0000-4000-8000-000000000003";

const MOCK_MEMBER_ROW = {
  projectId: MOCK_PROJECT_ID,
  funnelId: null,
  stageId: null,
  permissions: { instagram: true, conversations: true, mind: true },
};

const MOCK_MEMBER_NO_INSTAGRAM = {
  projectId: MOCK_PROJECT_ID,
  funnelId: null,
  stageId: null,
  permissions: { instagram: false, conversations: true, mind: true },
};

/** Convidado preso a um funil e uma etapa (vendedor de evento). */
const MOCK_FUNNEL_ID = "40000000-0000-4000-8000-000000000004";
const MOCK_STAGE_ID = "50000000-0000-4000-8000-000000000005";
const MOCK_MEMBER_ESCOPADO = {
  projectId: MOCK_PROJECT_ID,
  funnelId: MOCK_FUNNEL_ID,
  stageId: MOCK_STAGE_ID,
  permissions: { instagram: false, conversations: false, mind: false },
};

// ============================================================
// MOCK DB
// ============================================================

const mockSelect = vi.fn();

/**
 * `select().from().where()` já resolve — o guard lê TODOS os acessos do
 * convidado de uma vez (com o escopo de funil/etapa de cada um), em vez de uma
 * consulta por empresa. `.limit()` segue disponível para quem usa.
 */
function setupMemberQuery(rows: unknown[]) {
  const espera = Promise.resolve(rows);
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(
        Object.assign(espera, { limit: vi.fn().mockResolvedValue(rows) }),
      ),
    }),
  });
}

// ============================================================
// PLUGINS
// ============================================================

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", {
    select: mockSelect,
  } as unknown as Database);
});

// Auth plugin that accepts role via header (x-mock-role) for test flexibility
function makeAuthPlugin(role: string) {
  return fp(async (fastify) => {
    fastify.addHook("onRequest", async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Unauthorized" });
        return;
      }
      request.userId = role === "guest" ? MOCK_GUEST_ID : MOCK_USER_ID;
      request.userRole = role;
    });
  });
}

// ============================================================
// APP FACTORY
// ============================================================

import guestGuardPlugin from "../middleware/guest-guard.js";

async function buildTestApp(userRole: string) {
  const app = Fastify();
  await app.register(makeAuthPlugin(userRole));
  await app.register(mockDbPlugin);
  await app.register(guestGuardPlugin);

  // Sentinel routes to verify 200 pass-through
  app.get("/api/projects/:id/instagram/accounts", async () => ({ ok: true }));
  app.get("/api/projects/:id/conversations", async () => ({ ok: true }));
  app.get("/api/projects/:id", async () => ({ ok: true }));
  app.get("/api/instagram/accounts", async () => ({ ok: true }));
  app.get("/api/conversations", async () => ({ ok: true }));
  app.get("/api/tasks", async () => ({ ok: true }));
  app.post("/api/projects", async () => ({ ok: true }));
  app.put("/api/projects/:id", async () => ({ ok: true }));
  app.delete("/api/projects/:id", async () => ({ ok: true }));
  app.post("/api/chat", async () => ({ ok: true }));
  app.put("/api/projects/:id/funnels/:fid/stages/:sid/event-lead-status", async () => ({ ok: true }));
  app.post("/api/projects/:id/funnels/:fid/stages/:sid/manual-sales", async () => ({ ok: true }));
  app.post("/api/projects/:id/funnels/:fid/stages/:sid/manual-sales/:saleId/refund", async () => ({ ok: true }));
  app.delete("/api/projects/:id/funnels/:fid/stages/:sid/manual-sales/:saleId/refund", async () => ({ ok: true }));
  // Escopo do convidado (funil/etapa) — inclusive a rota solta, que não tem
  // checagem de acesso própria.
  app.get("/api/projects/:id/funnels/:fid/stages/:sid/sales-data", async () => ({ ok: true }));
  app.get("/api/projects/:id/funnels/:fid/stages", async () => ({ ok: true }));
  app.get("/api/funnels/:fid/stages/:sid/lp-campaigns", async () => ({ ok: true }));
  // Debriefings (Story 37.1) — global, bloqueado pra guest em qualquer método
  app.get("/api/debriefings", async () => ({ ok: true }));
  app.post("/api/debriefings", async () => ({ ok: true }));
  app.post("/api/debriefings/:id/comments", async () => ({ ok: true }));

  await app.ready();
  return app;
}

const AUTH = { authorization: "Bearer mock_token" };

// ============================================================
// TESTS — Admin passes through
// ============================================================

describe("guestGuard — admin user", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp("admin");
  });

  afterAll(async () => {
    await app.close();
  });

  it("admin can GET /api/instagram/accounts", async () => {
    const res = await app.inject({ method: "GET", url: "/api/instagram/accounts", headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it("admin can POST /api/projects", async () => {
    const res = await app.inject({ method: "POST", url: "/api/projects", headers: AUTH, body: {} });
    expect(res.statusCode).toBe(200);
  });

  it("admin can GET /api/conversations", async () => {
    const res = await app.inject({ method: "GET", url: "/api/conversations", headers: AUTH });
    expect(res.statusCode).toBe(200);
  });

  it("admin can GET /api/debriefings", async () => {
    const res = await app.inject({ method: "GET", url: "/api/debriefings", headers: AUTH });
    expect(res.statusCode).toBe(200);
  });
});

// ============================================================
// TESTS — Guest global blocks
// ============================================================

describe("guestGuard — guest blocked on global routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp("guest");
  });

  afterAll(async () => {
    await app.close();
  });

  it("guest blocked on GET /api/instagram/accounts (global)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/instagram/accounts", headers: AUTH });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest blocked on GET /api/conversations (global)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/conversations", headers: AUTH });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest blocked on GET /api/tasks (global)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tasks", headers: AUTH });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest blocked on POST /api/projects", async () => {
    const res = await app.inject({ method: "POST", url: "/api/projects", headers: AUTH, body: {} });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest blocked on PUT /api/projects/:id", async () => {
    const res = await app.inject({ method: "PUT", url: `/api/projects/${MOCK_PROJECT_ID}`, headers: AUTH, body: {} });
    expect(res.statusCode).toBe(403);
  });

  it("guest blocked on DELETE /api/projects/:id", async () => {
    const res = await app.inject({ method: "DELETE", url: `/api/projects/${MOCK_PROJECT_ID}`, headers: AUTH });
    expect(res.statusCode).toBe(403);
  });

  it("guest blocked on GET /api/debriefings (Story 37.1)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/debriefings", headers: AUTH });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest blocked on POST /api/debriefings (Story 37.1)", async () => {
    const res = await app.inject({ method: "POST", url: "/api/debriefings", headers: AUTH, body: {} });
    expect(res.statusCode).toBe(403);
  });

  it("guest blocked on POST /api/debriefings/:id/comments (Story 37.1)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/debriefings/40000000-0000-4000-8000-000000000004/comments",
      headers: AUTH,
      body: { text: "oi" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ============================================================
// TESTS — Guest project membership
// ============================================================

describe("guestGuard — guest project membership checks", () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp("guest");
  });

  afterAll(async () => {
    await app.close();
  });

  it("guest blocked when not a project member", async () => {
    setupMemberQuery([]); // no membership
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/instagram/accounts`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  it("guest allowed on instagram module when instagram=true", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/instagram/accounts`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  it("guest blocked on instagram module when instagram=false", async () => {
    setupMemberQuery([MOCK_MEMBER_NO_INSTAGRAM]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/instagram/accounts`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("module_not_allowed");
    expect(body.module).toBe("instagram");
  });

  it("guest allowed on conversations module when conversations=true", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/conversations`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  // Evento Presencial: convidado membro PODE escrever status/vendedor do lead
  // (allowlist no guard global; handler valida por membership).
  it("guest allowed to PUT event-lead-status when member", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_PROJECT_ID}/stages/${MOCK_PROJECT_ID}/event-lead-status`,
      headers: AUTH,
      body: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it("guest blocked on PUT event-lead-status when not a member", async () => {
    setupMemberQuery([]); // no membership
    const res = await app.inject({
      method: "PUT",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_PROJECT_ID}/stages/${MOCK_PROJECT_ID}/event-lead-status`,
      headers: AUTH,
      body: {},
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("project_access_denied");
  });

  // Evento Presencial: convidado membro PODE lançar venda (manual-sales).
  it("guest allowed to POST manual-sales when member", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_PROJECT_ID}/stages/${MOCK_PROJECT_ID}/manual-sales`,
      headers: AUTH,
      body: {},
    });
    expect(res.statusCode).toBe(200);
  });

  // Evento Presencial: convidado membro PODE reembolsar/desfazer reembolso do sinal.
  it("guest allowed to POST manual-sales refund when member", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_PROJECT_ID}/stages/${MOCK_PROJECT_ID}/manual-sales/${MOCK_PROJECT_ID}/refund`,
      headers: AUTH,
      body: { reason: "cliente desistiu" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("guest allowed to DELETE manual-sales refund when member", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_PROJECT_ID}/stages/${MOCK_PROJECT_ID}/manual-sales/${MOCK_PROJECT_ID}/refund`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });
});

// ============================================================
// TESTS — getChatTools filters for guest
// ============================================================

import { getChatTools } from "../services/chat-tools.js";

describe("getChatTools — guest role", () => {
  const mockFastify = {
    clickupService: { isConfigured: () => true },
    instagramService: { getAccountsByUserId: async () => [] },
    db: {},
  } as unknown as Parameters<typeof getChatTools>[0];

  it("guest does not receive any clickup_* tools", () => {
    const tools = getChatTools(mockFastify, "guest");
    const hasClickup = tools.some((t) => t.name.startsWith("clickup_"));
    expect(hasClickup).toBe(false);
  });

  it("guest receives instagram_metrics tool", () => {
    const tools = getChatTools(mockFastify, "guest");
    const hasInstagram = tools.some((t) => t.name === "instagram_metrics");
    expect(hasInstagram).toBe(true);
  });

  it("admin receives clickup_* tools when clickup configured", () => {
    const tools = getChatTools(mockFastify, "admin");
    const hasClickup = tools.some((t) => t.name.startsWith("clickup_"));
    expect(hasClickup).toBe(true);
  });
});

// ============================================================
// TESTS — escopo: um funil, uma etapa (vendedor de evento)
// ============================================================

describe("guestGuard — convidado preso a um funil e uma etapa", () => {
  let app: ReturnType<typeof Fastify>;
  const OUTRO_FUNIL = "60000000-0000-4000-8000-000000000006";
  const OUTRA_ETAPA = "70000000-0000-4000-8000-000000000007";

  beforeAll(async () => {
    app = await buildTestApp("guest");
  });

  afterAll(async () => {
    await app.close();
  });

  it("passa na etapa dele", async () => {
    setupMemberQuery([MOCK_MEMBER_ESCOPADO]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_FUNNEL_ID}/stages/${MOCK_STAGE_ID}/sales-data`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  it("barra outra etapa do mesmo funil", async () => {
    setupMemberQuery([MOCK_MEMBER_ESCOPADO]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_FUNNEL_ID}/stages/${OUTRA_ETAPA}/sales-data`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("fora_do_escopo");
  });

  it("barra outro funil da mesma empresa", async () => {
    setupMemberQuery([MOCK_MEMBER_ESCOPADO]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${OUTRO_FUNIL}/stages`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
  });

  it("a lista de etapas do funil dele passa", async () => {
    setupMemberQuery([MOCK_MEMBER_ESCOPADO]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${MOCK_FUNNEL_ID}/stages`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });

  it("barra a rota SOLTA de outro funil — ela não tem checagem própria", async () => {
    setupMemberQuery([MOCK_MEMBER_ESCOPADO]);
    const res = await app.inject({
      method: "GET",
      url: `/api/funnels/${OUTRO_FUNIL}/stages/${OUTRA_ETAPA}/lp-campaigns`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(403);
  });

  it("convidado SEM escopo segue vendo a empresa inteira (como antes)", async () => {
    setupMemberQuery([MOCK_MEMBER_ROW]);
    const res = await app.inject({
      method: "GET",
      url: `/api/projects/${MOCK_PROJECT_ID}/funnels/${OUTRO_FUNIL}/stages/${OUTRA_ETAPA}/sales-data`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);
  });
});
