import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock encryption module
vi.mock("../services/encryption", () => ({
  decrypt: vi.fn().mockReturnValue("FAKE_DECRYPTED_TOKEN"),
}));

// ============================================================
// Helpers to build a mock Fastify instance
// ============================================================

function createMockDb() {
  const selectResult = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };

  return {
    select: vi.fn().mockReturnValue(selectResult),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    _selectResult: selectResult,
  };
}

// ============================================================
// Graph API mock responses
// ============================================================

const MOCK_PROFILE = {
  id: "17841400123456789",
  username: "testaccount",
  name: "Test Account",
  biography: "Bio here",
  followers_count: 5000,
  follows_count: 200,
  media_count: 150,
  profile_picture_url: "https://example.com/pic.jpg",
};

const MOCK_VALIDATE = {
  id: "17841400123456789",
  name: "Test Account",
  username: "testaccount",
};

const MOCK_MEDIA_LIST = {
  data: [
    {
      id: "media1",
      caption: "Post caption",
      media_type: "IMAGE",
      media_url: "https://example.com/image.jpg",
      timestamp: "2026-03-15T10:00:00+0000",
      like_count: 100,
      comments_count: 10,
    },
  ],
  paging: { cursors: { after: "cursor123" }, next: "https://next" },
};

const MOCK_INSIGHTS = {
  data: [
    {
      name: "impressions",
      period: "day",
      values: [{ value: 1500, end_time: "2026-03-15T07:00:00+0000" }],
      title: "Impressions",
      description: "Total impressions",
      id: "insight1",
    },
  ],
};

const MOCK_DEMOGRAPHICS = {
  data: [
    {
      name: "audience_city",
      period: "lifetime",
      values: [{ value: { "São Paulo, São Paulo": 500 } }],
      title: "Audience City",
      description: "Cities",
      id: "demo1",
    },
  ],
};

const MOCK_STORIES_RESPONSE = {
  data: [
    {
      id: "story1",
      media_type: "IMAGE",
      media_url: "https://example.com/story.jpg",
      timestamp: "2026-03-15T10:00:00+0000",
    },
  ],
};

const MOCK_ACCOUNT_ROW = {
  accessTokenEncrypted: "encrypted.authtag",
  accessTokenIv: "aXYgYmFzZTY0",
  instagramUserId: "17841400123456789",
};

// ============================================================
// Test Suite
// ============================================================

describe("Instagram Service", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function setupFetchResponse(data: unknown, ok = true, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      json: () => Promise.resolve(data),
    });
  }

  // Helper to load the plugin and get the service
  async function loadService(dbOverrides?: Partial<ReturnType<typeof createMockDb>>) {
    const mockDb = { ...createMockDb(), ...dbOverrides };

    // We need to dynamically import the module to get the plugin function
    const mod = await import("../services/instagram.js");
    const plugin = mod.default;

    const decorations: Record<string, unknown> = {};
    const mockFastify = {
      db: mockDb,
      decorate: (name: string, value: unknown) => {
        decorations[name] = value;
      },
      log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    };

    // Execute the plugin
    await (plugin as unknown as { (fastify: unknown, opts: unknown): Promise<void> })(
      mockFastify,
      {},
    );

    return {
      service: decorations.instagramService as {
        validateToken: (token: string) => Promise<unknown>;
        getProfile: (accountId: string) => Promise<unknown>;
        getMediaList: (accountId: string, limit?: number, after?: string) => Promise<unknown>;
        getMediaInsights: (mediaId: string, accountId: string) => Promise<unknown>;
        getAccountInsights: (accountId: string, period: string, since: number, until: number) => Promise<unknown>;
        getAudienceDemographics: (accountId: string) => Promise<unknown>;
        getStories: (accountId: string) => Promise<unknown>;
        getReels: (accountId: string) => Promise<unknown>;
        invalidateCache: (accountId: string, metricType?: string) => Promise<void>;
      },
      mockDb,
    };
  }

  // ---- validateToken ----

  it("should validate a token and return profile data", async () => {
    setupFetchResponse(MOCK_VALIDATE);
    const { service } = await loadService();

    const result = await service.validateToken("VALID_TOKEN");
    expect(result).toEqual(MOCK_VALIDATE);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toContain("/me?fields=id,name,username");
  });

  it("should throw on invalid token", async () => {
    setupFetchResponse(
      { error: { message: "Invalid token", type: "OAuthException", code: 190 } },
      false,
      400,
    );
    const { service } = await loadService();

    await expect(service.validateToken("BAD_TOKEN")).rejects.toThrow(
      "Token de acesso expirado ou inválido",
    );
  });

  // ---- getProfile ----

  it("should return cached profile on cache hit", async () => {
    const mockDb = createMockDb();
    mockDb._selectResult.limit.mockResolvedValueOnce([{ metricData: MOCK_PROFILE }]);

    const { service } = await loadService(mockDb);
    const result = await service.getProfile("account-uuid");

    expect(result).toEqual(MOCK_PROFILE);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fetch profile from API on cache miss", async () => {
    // Cache miss (empty array), then account lookup returns row
    const mockDb = createMockDb();
    // First call: cache check returns empty
    mockDb._selectResult.limit.mockResolvedValueOnce([]);
    // Second call: account lookup returns token data
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    setupFetchResponse(MOCK_PROFILE);
    const { service } = await loadService(mockDb);
    const result = await service.getProfile("account-uuid");

    expect(result).toEqual(MOCK_PROFILE);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // ---- getMediaList ----

  it("should return paginated media list", async () => {
    const mockDb = createMockDb();
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    setupFetchResponse(MOCK_MEDIA_LIST);
    const { service } = await loadService(mockDb);
    const result = await service.getMediaList("account-uuid", 10);

    expect(result).toEqual({
      data: MOCK_MEDIA_LIST.data,
      nextCursor: "cursor123",
    });
  });

  // ---- getAccountInsights ----

  it("should return account insights for period", async () => {
    const mockDb = createMockDb();
    // Cache miss
    mockDb._selectResult.limit.mockResolvedValueOnce([]);
    // Account row
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    setupFetchResponse(MOCK_INSIGHTS);
    const { service } = await loadService(mockDb);

    const since = Math.floor(new Date("2026-03-01").getTime() / 1000);
    const until = Math.floor(new Date("2026-03-15").getTime() / 1000);
    const result = await service.getAccountInsights("account-uuid", "day", since, until);

    expect(result).toEqual(MOCK_INSIGHTS.data);
  });

  // ---- getAudienceDemographics ----

  it("should return lifetime demographics", async () => {
    const mockDb = createMockDb();
    mockDb._selectResult.limit.mockResolvedValueOnce([]);
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    setupFetchResponse(MOCK_DEMOGRAPHICS);
    const { service } = await loadService(mockDb);
    const result = await service.getAudienceDemographics("account-uuid");

    expect(result).toEqual(MOCK_DEMOGRAPHICS.data);
    expect(mockFetch.mock.calls[0][0]).toContain("period=lifetime");
  });

  // ---- Rate limit ----

  it("should throw when rate limit exceeded", async () => {
    // We simulate by calling validateToken 201 times with same token
    const { service } = await loadService();

    // Fill up the rate limit
    for (let i = 0; i < 200; i++) {
      setupFetchResponse(MOCK_VALIDATE);
    }

    // Make 200 calls
    const promises = [];
    for (let i = 0; i < 200; i++) {
      promises.push(service.validateToken("RATE_LIMITED_TOKEN"));
    }
    await Promise.all(promises);

    // 201st call should throw
    await expect(service.validateToken("RATE_LIMITED_TOKEN")).rejects.toThrow(
      "Rate limit atingido",
    );
  });

  // ---- Token expired error ----

  it("should return renewal message for expired token", async () => {
    setupFetchResponse(
      { error: { message: "Error validating access token", type: "OAuthException", code: 190 } },
      false,
      400,
    );
    const { service } = await loadService();

    await expect(service.validateToken("EXPIRED_TOKEN")).rejects.toThrow(
      "Renove o token no Meta Business Manager",
    );
  });

  // ---- getStories ----

  it("should return stories with insights", async () => {
    const mockDb = createMockDb();
    // Cache miss
    mockDb._selectResult.limit.mockResolvedValueOnce([]);
    // Account row
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    // Stories list response
    setupFetchResponse(MOCK_STORIES_RESPONSE);
    // Story insights response
    setupFetchResponse(MOCK_INSIGHTS);

    const { service } = await loadService(mockDb);
    const result = await service.getStories("account-uuid") as Array<{ id: string; insights?: unknown[] }>;

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("story1");
    expect(result[0].insights).toEqual(MOCK_INSIGHTS.data);
  });

  // ---- Cache expiration ----

  it("should re-fetch when cache is expired (empty result from DB)", async () => {
    const mockDb = createMockDb();
    // Cache miss (expired = not returned by query with expiresAt > now)
    mockDb._selectResult.limit.mockResolvedValueOnce([]);
    // Account lookup
    mockDb._selectResult.limit.mockResolvedValueOnce([MOCK_ACCOUNT_ROW]);

    setupFetchResponse(MOCK_PROFILE);
    const { service } = await loadService(mockDb);
    const result = await service.getProfile("account-uuid");

    expect(result).toEqual(MOCK_PROFILE);
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
