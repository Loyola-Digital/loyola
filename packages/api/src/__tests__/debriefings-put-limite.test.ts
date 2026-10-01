import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import multipart from "@fastify/multipart";
import type { Database } from "../db/client.js";
import debriefingsRoutes from "../routes/debriefings.js";

// ============================================================
// Story 49.8 (AC5) — tamanho do salvar da edição inline.
//
// O salvar manda o HTML inteiro em JSON pelo PUT. Sem `bodyLimit` na rota
// valia o default do Fastify 5 (1 MiB), abaixo dos 5 MB do upload: um doc que
// subia pelo upload não salvava pela edição. O app de teste é um `Fastify()`
// sem `bodyLimit`, igual ao `buildServer()` — o default é o mesmo de produção.
// ============================================================

const USER_ID = "10000000-0000-4000-8000-000000000001";
const DOC_ID = "30000000-0000-4000-8000-000000000003";
const MSG_LIMITE = "Arquivo muito grande. Máximo: 5MB";
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

const mockAuthPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request) => {
    request.userId = USER_ID;
  });
});

const mockDbPlugin = fp(async (fastify) => {
  fastify.decorate("db", {
    select: mockSelect,
    update: mockUpdate,
  } as unknown as Database);
});

/** O PUT confere a existência do doc (select…limit) e grava (update…set…where). */
function prepararDocExistente() {
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([{ id: DOC_ID }]),
      }),
    }),
  });
  mockUpdate.mockReturnValueOnce({
    set: mockSet.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

/** HTML com exatamente `bytes` bytes em UTF-8, com aspas (o JSON escapa). */
function htmlComBytes(bytes: number): string {
  const abre = '<!DOCTYPE html><html><body><p class="x">';
  const fecha = "</p></body></html>";
  return abre + "a".repeat(bytes - abre.length - fecha.length) + fecha;
}

function put(payload: string) {
  return app.inject({
    method: "PUT",
    url: `/api/debriefings/${DOC_ID}`,
    headers: { "content-type": "application/json" },
    payload,
  });
}

const app = Fastify();

beforeAll(async () => {
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(mockAuthPlugin);
  await app.register(mockDbPlugin);
  await app.register(debriefingsRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  mockSelect.mockReset();
  mockUpdate.mockReset();
  mockSet.mockReset();
});

describe("PUT /api/debriefings/:id — limite do salvar (Story 49.8, AC5)", () => {
  it("aceita um HTML de ~2 MB (acima do default de 1 MiB do Fastify, abaixo dos 5 MB)", async () => {
    prepararDocExistente();
    const html = htmlComBytes(2 * 1024 * 1024);

    const res = await put(JSON.stringify({ html }));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][0].html).toBe(html);
  });

  it("aceita exatamente MAX_HTML_BYTES (5 MB), mesmo com o JSON maior que o HTML", async () => {
    prepararDocExistente();
    // Metade de aspas: o JSON fica ~1,5× o HTML e ainda cabe no bodyLimit.
    const html = htmlComBytes(MAX_HTML_BYTES).replace(
      /a{2621440}/,
      '"'.repeat(MAX_HTML_BYTES / 2),
    );
    expect(Buffer.byteLength(html)).toBe(MAX_HTML_BYTES);
    const corpo = JSON.stringify({ html });
    expect(Buffer.byteLength(corpo)).toBeGreaterThan(7 * 1024 * 1024);

    const res = await put(corpo);

    expect(res.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it("HTML acima de MAX_HTML_BYTES responde 413 com a mensagem do upload e não grava", async () => {
    prepararDocExistente();
    const res = await put(JSON.stringify({ html: htmlComBytes(MAX_HTML_BYTES + 1) }));

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: MSG_LIMITE });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("conta BYTES, não caracteres: 'é' ocupa 2 bytes", async () => {
    prepararDocExistente();
    // 2.621.441 caracteres "é" = 5.242.882 bytes > 5 MB (em caracteres, caberia).
    const html = "é".repeat(MAX_HTML_BYTES / 2 + 1);
    expect(html.length).toBeLessThan(MAX_HTML_BYTES);

    const res = await put(JSON.stringify({ html }));

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: MSG_LIMITE });
  });

  it("corpo acima do bodyLimit da rota também sai 413 com a mesma mensagem", async () => {
    // 12 MB de corpo: passa do bodyLimit (11 MiB) — o Fastify recusa antes do handler.
    const res = await put(JSON.stringify({ html: htmlComBytes(12 * 1024 * 1024) }));

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({ error: MSG_LIMITE });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("outros erros de corpo seguem o tratamento normal (JSON inválido → 400)", async () => {
    const res = await put('{"html": "<p>sem fechar');

    expect(res.statusCode).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("PUT só de nome continua funcionando", async () => {
    prepararDocExistente();
    const res = await put(JSON.stringify({ campaignName: "Novo nome" }));

    expect(res.statusCode).toBe(200);
    expect(mockSet.mock.calls[0][0].campaignName).toBe("Novo nome");
    expect(mockSet.mock.calls[0][0].html).toBeUndefined();
  });
});
