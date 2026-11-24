import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * O token que a Fernanda Zapparoli gerou em 24/11/2026 era do Facebook Business
 * (System User). Ele FUNCIONA — lê a conta e os 154 mil seguidores — mas em
 * `graph.facebook.com`, e este serviço fala com `graph.instagram.com`, que
 * responde `190 Cannot parse access token`.
 *
 * A tela traduzia esse 190 como "o token expirou ou foi invalidado", e aí a
 * saída parecia ser gerar outro token — do mesmo tipo errado. Estes testes
 * fixam a mensagem que diz a causa real, e garantem que um token de verdade
 * expirado continua com a mensagem dele.
 *
 * O timeout generoso é porque o primeiro teste paga o import do serviço.
 */

vi.mock("../services/encryption.js", () => ({
  encrypt: vi.fn().mockReturnValue({ encrypted: "x", iv: "y" }),
  decrypt: vi.fn().mockReturnValue("TOKEN"),
}));

const TIMEOUT = 30_000;

describe("validateToken e o tipo do token", () => {
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

  const responder = (data: unknown, ok = true, status = 200) =>
    mockFetch.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(data) });

  async function carregarServico() {
    const mod = await import("../services/instagram.js");
    const decorations: Record<string, unknown> = {};
    const fastify = {
      db: {},
      decorate: (n: string, v: unknown) => {
        decorations[n] = v;
      },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };
    await (mod.default as unknown as (f: unknown) => Promise<void>)(fastify);
    return decorations.instagramService as {
      validateToken: (t: string) => Promise<{ id: string; username: string; name: string }>;
    };
  }

  it(
    "token do Facebook Business: diz que o host não lê esse tipo, não que expirou",
    async () => {
      const servico = await carregarServico();
      responder(
        {
          error: {
            message: "Invalid OAuth access token - Cannot parse access token",
            type: "OAuthException",
            code: 190,
          },
        },
        false,
        400,
      );
      await expect(servico.validateToken("TOKEN_DE_SYSTEM_USER")).rejects.toThrow(
        /não conseguiu LER este token/,
      );
    },
    TIMEOUT,
  );

  it(
    "token de verdade expirado mantém a mensagem de expiração",
    async () => {
      const servico = await carregarServico();
      responder(
        {
          error: {
            message: "Error validating access token: Session has expired on Friday",
            type: "OAuthException",
            code: 190,
          },
        },
        false,
        401,
      );
      await expect(servico.validateToken("TOKEN_MORTO")).rejects.toThrow(/expirado ou inválido/);
    },
    TIMEOUT,
  );

  // `#100 nonexisting field` é consulta errada nossa, não token nem permissão.
  it(
    "campo inexistente não é tratado como erro de permissão",
    async () => {
      const servico = await carregarServico();
      responder(
        {
          error: {
            message:
              "(#100) Tried accessing nonexisting field (profile_picture_url) on node type (Page)",
            type: "OAuthException",
            code: 100,
          },
        },
        false,
        400,
      );
      await expect(servico.validateToken("TOKEN")).rejects.toThrow(
        /pediu um campo que não existe neste nó/,
      );
    },
    TIMEOUT,
  );

  it(
    "token de Instagram Login resolve numa chamada",
    async () => {
      const servico = await carregarServico();
      responder({ id: 123, name: "Conta", username: "conta", profile_picture_url: "u" });
      const perfil = await servico.validateToken("TOKEN_IG_LOGIN");
      expect(perfil.username).toBe("conta");
      expect(perfil.id).toBe("123");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    },
    TIMEOUT,
  );
});
