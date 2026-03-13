import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";

const FIXTURES_PATH = join(__dirname, "fixtures", "squads");

// ---------- Mock Anthropic SDK ----------

function createMockStream(responseText: string, usage = { input_tokens: 100, output_tokens: 50 }) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const finalMsg = {
    id: "msg_mock",
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text: responseText }],
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage,
  };

  const mockStream = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
      return mockStream; // chainable
    },
    finalMessage: async () => {
      // Emit text events before resolving — simulates stream completion
      if (handlers["text"]) {
        const chunks = responseText.match(/[\s\S]{1,10}/g) ?? [responseText];
        for (const chunk of chunks) {
          for (const h of handlers["text"]) h(chunk);
        }
      }
      return finalMsg;
    },
  };

  return mockStream;
}

// ---------- Mock Plugins ----------

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

// Mock DB with in-memory conversation/message tracking
const mockConversations: Array<{
  id: string;
  userId: string;
  mindId: string;
  mindName: string;
  squadId: string;
  updatedAt: Date;
}> = [];

const mockMessages: Array<{
  id: string;
  conversationId: string;
  role: string;
  content: string;
  tokensUsed: number | null;
  metadata: unknown;
  createdAt: Date;
}> = [];

let convIdCounter = 0;
function resetMockDb() {
  mockConversations.length = 0;
  mockMessages.length = 0;
  convIdCounter = 0;
}

const mockDbPlugin = fp(async (fastify) => {
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() => {
            // Check if this is a conversation lookup or message history
            return Promise.resolve([]);
          }),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              // Message history: return mockMessages for conversation
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation((_cols) => {
          // Detect if inserting conversation or message
          const id = `mock-uuid-${++convIdCounter}`;
          return Promise.resolve([{ id }]);
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;

  fastify.decorate("db", mockDb);
});

// Mock auth plugin
const mockAuthPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    request.userId = "user-test-123";
  });
});

// Mock Claude plugin
let mockStreamFn = vi.fn();

const mockClaudePlugin = fp(async (fastify) => {
  fastify.decorate("claude", {
    stream: mockStreamFn,
  });
});

// ---------- Imports ----------

import mindRegistryPlugin from "../services/mind-registry.js";
import mindEnginePlugin from "../services/mind-engine.js";
import chatRoutes from "../routes/chat.js";

// ---------- Task Detection Unit Tests ----------

describe("Task Detection Regex", () => {
  const TASK_BLOCK_REGEX = /```json:task\s*\n([\s\S]*?)```/;

  it("detects valid json:task block", () => {
    const text = 'Here is my response.\n\n```json:task\n{"action":"create_task","title":"Test","description":"A task","priority":2,"tags":["tag1"]}\n```';
    const match = text.match(TASK_BLOCK_REGEX);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.title).toBe("Test");
    expect(parsed.priority).toBe(2);
  });

  it("ignores regular json blocks without :task label", () => {
    const text = '```json\n{"key":"value"}\n```';
    const match = text.match(TASK_BLOCK_REGEX);
    expect(match).toBeNull();
  });

  it("parses task JSON with multiline content", () => {
    const text = '```json:task\n{\n  "action": "create_task",\n  "title": "Multiline",\n  "description": "Line1\\nLine2",\n  "priority": 1,\n  "tags": []\n}\n```';
    const match = text.match(TASK_BLOCK_REGEX);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed.title).toBe("Multiline");
  });

  it("returns null for text without any code blocks", () => {
    const text = "Just regular text without any code blocks.";
    const match = text.match(TASK_BLOCK_REGEX);
    expect(match).toBeNull();
  });
});

// ---------- ClaudeService Plugin Tests ----------

describe("ClaudeService Plugin", () => {
  it("decorates fastify.claude with stream method", async () => {
    const app = Fastify();
    await app.register(mockEnvPlugin);

    // Register actual claude plugin
    const { default: claudePlugin } = await import("../services/claude.js");
    await app.register(claudePlugin);
    await app.ready();

    expect(app.claude).toBeDefined();
    expect(typeof app.claude.stream).toBe("function");

    await app.close();
  });
});

// ---------- Chat Route Integration Tests ----------

describe("POST /api/chat", () => {
  const app = Fastify();

  beforeAll(async () => {
    resetMockDb();
    mockStreamFn = vi.fn().mockReturnValue(
      createMockStream("Hello! I am Test Mind One.")
    );

    await app.register(mockEnvPlugin);
    await app.register(mockAuthPlugin);
    await app.register(mockDbPlugin);
    await app.register(mindRegistryPlugin);
    await app.register(mindEnginePlugin);
    await app.register(mockClaudePlugin);
    await app.register(chatRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns SSE stream for valid request with new conversation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "mind_one",
        conversationId: null,
        message: "Hello!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream");

    const body = response.body;

    // Should contain conversation event
    expect(body).toContain("event: conversation");
    expect(body).toContain('"isNew":true');

    // Should contain text_delta events
    expect(body).toContain("event: text_delta");

    // Should contain usage event
    expect(body).toContain("event: usage");
    expect(body).toContain('"inputTokens"');
    expect(body).toContain('"outputTokens"');

    // Should contain done event
    expect(body).toContain("event: done");
    expect(body).toContain('"messageId"');
  });

  it("returns 404 for nonexistent mindId", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "nonexistent_mind_xyz",
        conversationId: null,
        message: "Hello!",
      },
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json.error).toContain("Mind not found");
  });

  it("returns 400 for invalid request body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "",
        message: "",
      },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error).toBe("Invalid request body");
  });

  it("returns 400 for missing body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("detects task_detected event in stream when task block present", async () => {
    const taskResponse = 'Here is a task.\n\n```json:task\n{"action":"create_task","title":"Test Task","description":"Do something","priority":2,"tags":["test"]}\n```';

    // Override mock for this test
    mockStreamFn.mockReturnValueOnce(createMockStream(taskResponse));

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "mind_one",
        conversationId: null,
        message: "Create a task for me",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.body;

    expect(body).toContain("event: task_detected");
    expect(body).toContain('"title":"Test Task"');
  });

  it("calls claude.stream with correct system prompt and messages", async () => {
    mockStreamFn.mockReturnValueOnce(
      createMockStream("Response from mind")
    );

    await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "mind_one",
        conversationId: null,
        message: "Test message",
      },
    });

    expect(mockStreamFn).toHaveBeenCalled();
    const callArgs = mockStreamFn.mock.calls[mockStreamFn.mock.calls.length - 1][0];
    expect(callArgs.systemPrompt).toContain("You are Test Mind One");
    expect(callArgs.messages).toBeDefined();
    expect(Array.isArray(callArgs.messages)).toBe(true);
  });

  it("emits error event on stream failure", async () => {
    // Create a stream that will throw
    const failingStream = {
      on: vi.fn().mockReturnValue({ on: vi.fn() }),
      finalMessage: () => Promise.reject(new Error("API rate limit exceeded")),
    };
    mockStreamFn.mockReturnValueOnce(failingStream);

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        mindId: "mind_one",
        conversationId: null,
        message: "This will fail",
      },
    });

    expect(response.statusCode).toBe(200); // SSE starts with 200
    const body = response.body;
    expect(body).toContain("event: error");
    expect(body).toContain("API rate limit exceeded");
  });
});
