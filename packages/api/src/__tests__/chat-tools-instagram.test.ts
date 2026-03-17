import { describe, it, expect, vi, beforeEach } from "vitest";
import { getChatTools, executeChatTool } from "../services/chat-tools.js";

// ============================================================
// Mock drizzle-orm so dynamic imports resolve in tests
// ============================================================

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "eq" })),
  desc: vi.fn((col: unknown) => ({ col, op: "desc" })),
  and: vi.fn((...args: unknown[]) => ({ args, op: "and" })),
  isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
  or: vi.fn((...args: unknown[]) => ({ args, op: "or" })),
  ilike: vi.fn((col: unknown, val: unknown) => ({ col, val, op: "ilike" })),
}));

vi.mock("../db/schema.js", () => ({
  conversations: { userId: "userId", mindId: "mindId", deletedAt: "deletedAt", updatedAt: "updatedAt" },
  messages: { conversationId: "conversationId", createdAt: "createdAt", role: "role", content: "content" },
  instagramAccounts: {
    id: "id",
    accountName: "account_name",
    instagramUsername: "instagram_username",
    tokenExpiresAt: "token_expires_at",
  },
}));

// ============================================================
// Helpers
// ============================================================

const ACCOUNT_FIXTURE = {
  id: "acc-001",
  accountName: "Cliente ABC",
  instagramUsername: "clienteabc",
  tokenExpiresAt: null as Date | null,
};

const PROFILE_FIXTURE = {
  id: "123",
  username: "clienteabc",
  name: "Cliente ABC",
  biography: "Bio",
  followers_count: 10000,
  follows_count: 500,
  media_count: 200,
  profile_picture_url: "https://example.com/pic.jpg",
};

const INSIGHTS_FIXTURE = [
  {
    name: "reach",
    period: "day",
    values: [{ value: 500, end_time: "2026-01-01T00:00:00Z" }, { value: 600 }],
    title: "reach",
    description: "",
    id: "reach-id",
  },
  {
    name: "accounts_engaged",
    period: "day",
    values: [{ value: 100 }, { value: 150 }],
    title: "accounts_engaged",
    description: "",
    id: "eng-id",
  },
];

const MEDIA_FIXTURE = [
  {
    id: "post-1",
    caption: "Post de teste",
    media_type: "IMAGE",
    timestamp: "2026-01-15T12:00:00Z",
    like_count: 120,
    comments_count: 8,
  },
];

const DEMOGRAPHICS_FIXTURE = [
  {
    name: "audience_gender_age",
    period: "lifetime",
    values: [{ value: { "M.18-24": 500, "F.25-34": 800 } }],
    title: "audience_gender_age",
    description: "",
    id: "demo-id",
  },
  {
    name: "audience_country",
    period: "lifetime",
    values: [{ value: { BR: 8000, US: 1000 } }],
    title: "audience_country",
    description: "",
    id: "country-id",
  },
  {
    name: "audience_city",
    period: "lifetime",
    values: [{ value: { "São Paulo": 3000, Curitiba: 1500 } }],
    title: "audience_city",
    description: "",
    id: "city-id",
  },
];

function buildQueryChain(resolvedWith: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(resolvedWith),
  };
  return chain;
}

function buildFastify(overrides: {
  dbRows?: unknown[];
  allAccountsRows?: unknown[];
  instagramService?: Partial<{
    getProfile: () => Promise<unknown>;
    getAccountInsights: () => Promise<unknown>;
    getMediaList: () => Promise<unknown>;
    getAudienceDemographics: () => Promise<unknown>;
  }>;
  clickupConfigured?: boolean;
}) {
  const { dbRows = [], allAccountsRows = [], instagramService = {}, clickupConfigured = false } = overrides;

  let callCount = 0;
  const db = {
    select: vi.fn(() => {
      // First call = search by name/username, second = get all accounts
      const rows = callCount++ === 0 ? dbRows : allAccountsRows;
      return buildQueryChain(rows);
    }),
  };

  return {
    db,
    clickupService: { isConfigured: () => clickupConfigured },
    instagramService: {
      getProfile: vi.fn().mockResolvedValue(PROFILE_FIXTURE),
      getAccountInsights: vi.fn().mockResolvedValue(INSIGHTS_FIXTURE),
      getMediaList: vi.fn().mockResolvedValue({ data: MEDIA_FIXTURE }),
      getAudienceDemographics: vi.fn().mockResolvedValue(DEMOGRAPHICS_FIXTURE),
      ...instagramService,
    },
  } as unknown as Parameters<typeof executeChatTool>[0];
}

// ============================================================
// Tests
// ============================================================

describe("getChatTools", () => {
  it("includes instagram_metrics tool", () => {
    const fastify = buildFastify({});
    const tools = getChatTools(fastify);
    const tool = tools.find((t) => t.name === "instagram_metrics");
    expect(tool).toBeDefined();
    expect(tool?.input_schema.required).toContain("account_name_or_username");
  });
});

describe("executeChatTool — instagram_metrics", () => {
  const userId = "user-001";

  it("overview: returns profile + reach + engagement for found account", async () => {
    const fastify = buildFastify({ dbRows: [ACCOUNT_FIXTURE] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "Cliente ABC",
    });

    expect(result).toContain("@clienteabc");
    expect(result).toContain("10.000");      // followers_count formatted
    expect(result).toContain("Alcance Total");
    expect(result).toContain("Contas Engajadas");
    expect(result).toContain("Taxa de Engajamento");
  });

  it("finds account by partial username search", async () => {
    const fastify = buildFastify({ dbRows: [ACCOUNT_FIXTURE] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "@clienteabc",
    });
    expect(result).toContain("Cliente ABC");
  });

  it("returns account list when account not found and accounts exist", async () => {
    const fastify = buildFastify({
      dbRows: [],
      allAccountsRows: [ACCOUNT_FIXTURE],
    });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "desconhecido",
    });
    expect(result).toContain("não encontrada");
    expect(result).toContain("Cliente ABC");
  });

  it("returns 'no accounts' message when platform has no accounts", async () => {
    const fastify = buildFastify({ dbRows: [], allAccountsRows: [] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "qualquer",
    });
    expect(result).toContain("Nenhuma conta de Instagram cadastrada");
  });

  it("returns token expired warning when token is past expiry", async () => {
    const expired = { ...ACCOUNT_FIXTURE, tokenExpiresAt: new Date("2020-01-01") };
    const fastify = buildFastify({ dbRows: [expired] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
    });
    expect(result).toContain("expirou");
    expect(result).toContain("Settings");
  });

  it("posts: returns markdown table with post data", async () => {
    const fastify = buildFastify({ dbRows: [ACCOUNT_FIXTURE] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
      metric_type: "posts",
    });
    expect(result).toContain("Últimos Posts");
    expect(result).toContain("IMAGE");
    expect(result).toContain("120"); // likes
  });

  it("demographics: returns audience breakdown", async () => {
    const fastify = buildFastify({ dbRows: [ACCOUNT_FIXTURE] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
      metric_type: "demographics",
    });
    expect(result).toContain("Audiência");
    expect(result).toContain("Faixa Etária");
    expect(result).toContain("Top Países");
    expect(result).toContain("Top Cidades");
  });

  it("full: returns overview + posts + demographics", async () => {
    const fastify = buildFastify({ dbRows: [ACCOUNT_FIXTURE] });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
      metric_type: "full",
    });
    expect(result).toContain("Overview");
    expect(result).toContain("Últimos Posts");
    expect(result).toContain("Audiência");
  });

  it("returns friendly error on token expiry API error (posts path)", async () => {
    const fastify = buildFastify({
      dbRows: [ACCOUNT_FIXTURE],
      instagramService: {
        getMediaList: vi.fn().mockRejectedValue(new Error("Token de acesso expirado ou inválido")),
      },
    });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
      metric_type: "posts",
    });
    expect(result).toContain("Token expirado");
    expect(result).toContain("Settings");
  });

  it("returns generic error on unexpected API failure (demographics path)", async () => {
    const fastify = buildFastify({
      dbRows: [ACCOUNT_FIXTURE],
      instagramService: {
        getAudienceDemographics: vi.fn().mockRejectedValue(new Error("Network failure")),
      },
    });
    const result = await executeChatTool(fastify, userId, "instagram_metrics", {
      account_name_or_username: "abc",
      metric_type: "demographics",
    });
    expect(result).toContain("Erro ao buscar métricas");
    expect(result).toContain("Network failure");
  });
});
