import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import FormData from "form-data";
import uploadRoutes from "../routes/upload.js";

// Mock mammoth
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: "Extracted docx text content" }),
  },
}));

// Mock pdf-parse PDFParse class
vi.mock("pdf-parse", () => ({
  PDFParse: class MockPDFParse {
    async getText() {
      return { text: "Extracted pdf text content" };
    }
    async destroy() {}
  },
}));

// Mock env plugin
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

// Mock auth plugin
const mockAuthPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    request.userId = "user_test_123";
  });
});

function createMultipartPayload(
  filename: string,
  content: string | Buffer,
  mimeType: string,
) {
  const form = new FormData();
  form.append("file", Buffer.isBuffer(content) ? content : Buffer.from(content), {
    filename,
    contentType: mimeType,
  });
  return form;
}

describe("Upload Endpoint", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(mockEnvPlugin);
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    await app.register(mockAuthPlugin);
    await app.register(uploadRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("extracts text from .txt file", async () => {
    const form = createMultipartPayload(
      "test.txt",
      "Hello world plain text",
      "text/plain",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: {
        ...form.getHeaders(),
        authorization: "Bearer mock_jwt_token",
      },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.filename).toBe("test.txt");
    expect(body.mimeType).toBe("text/plain");
    expect(body.extractedText).toBe("Hello world plain text");
    expect(body.textLength).toBeGreaterThan(0);
  });

  it("extracts text from .docx file via mammoth", async () => {
    const form = createMultipartPayload(
      "test.docx",
      "fake docx binary",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: {
        ...form.getHeaders(),
        authorization: "Bearer mock_jwt_token",
      },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.filename).toBe("test.docx");
    expect(body.extractedText).toBe("Extracted docx text content");
  });

  it("extracts text from .pdf file via pdf-parse", async () => {
    const form = createMultipartPayload(
      "test.pdf",
      "fake pdf binary",
      "application/pdf",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: {
        ...form.getHeaders(),
        authorization: "Bearer mock_jwt_token",
      },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.filename).toBe("test.pdf");
    expect(body.extractedText).toBe("Extracted pdf text content");
  });

  it("returns 400 for unsupported file type", async () => {
    const form = createMultipartPayload(
      "image.jpg",
      "fake image",
      "image/jpeg",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: {
        ...form.getHeaders(),
        authorization: "Bearer mock_jwt_token",
      },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toContain("Unsupported file type");
  });

  it("truncates extracted text exceeding 200KB", async () => {
    // Create text larger than 200KB
    const largeText = "A".repeat(250 * 1024);
    const form = createMultipartPayload(
      "large.txt",
      largeText,
      "text/plain",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: {
        ...form.getHeaders(),
        authorization: "Bearer mock_jwt_token",
      },
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.truncated).toBe(true);
    expect(body.extractedText).toContain("[Documento truncado");
  });

  it("returns 401 without auth token", async () => {
    const form = createMultipartPayload(
      "test.txt",
      "Hello",
      "text/plain",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/upload",
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    });

    expect(response.statusCode).toBe(401);
  });
});
