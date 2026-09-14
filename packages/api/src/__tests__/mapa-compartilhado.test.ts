import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  gerarToken,
  payloadPublico,
  tokenValido,
} from "../services/mapa-compartilhado.js";

// O auth chama o Clerk para toda rota que NÃO pula. Espionar essa chamada é o
// jeito de provar, sem Clerk de pé, qual rota pula e qual não.
const getAuth = vi.fn(() => ({ userId: null }));
vi.mock("@clerk/fastify", () => ({
  getAuth: (...a: unknown[]) => getAuth(...(a as [])),
  clerkClient: {},
}));

describe("tokenValido", () => {
  it("aceita todo token que gerarToken produz", () => {
    // Geração e validação no mesmo arquivo: se o formato mudar de um lado, este
    // teste pega antes de o link parar de abrir.
    for (let i = 0; i < 200; i++) expect(tokenValido(gerarToken())).toBe(true);
  });

  it("não gera o mesmo token duas vezes", () => {
    const vistos = new Set(Array.from({ length: 500 }, gerarToken));
    expect(vistos.size).toBe(500);
  });

  it("nem consulta o banco com o UUID de um mapa", () => {
    // Não seria vazamento — a busca é por share_token, nunca por id. Mas um
    // UUID tem 36 caracteres e hífen está no alfabeto base64url: com filtro
    // frouxo (32-64) ele passava e gastava consulta. O exato (43) barra.
    expect(tokenValido("66aa4c1f-c8dc-4d87-b402-0a74fc8243d7")).toBe(false);
  });

  it("recusa vazio, curto e caractere fora do alfabeto", () => {
    expect(tokenValido("")).toBe(false);
    expect(tokenValido("abc")).toBe(false);
    expect(tokenValido("../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      false,
    );
    expect(tokenValido("a".repeat(65))).toBe(false);
  });
});

describe("payloadPublico", () => {
  const base = {
    nome: "Rascunho",
    nomeDaEtapa: null,
    tabs: [],
    updatedAt: null,
  };

  it("não carrega o id, o projeto nem quem editou", () => {
    // O `id` é o que liga os comentários — conversa interna do time.
    const mapaComTudo = {
      ...base,
      id: "66aa4c1f-c8dc-4d87-b402-0a74fc8243d7",
      projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3",
      updatedBy: "u1",
      shareToken: "segredo",
    } as never;
    const saida = payloadPublico(mapaComTudo);
    expect(Object.keys(saida).sort()).toEqual([
      "nome",
      "rascunho",
      "tabs",
      "updatedAt",
    ]);
  });

  it("o nome da etapa manda sobre o do mapa", () => {
    expect(payloadPublico({ ...base, nomeDaEtapa: "Captação Paga" }).nome).toBe(
      "Captação Paga",
    );
  });

  it("mapa sem nome nenhum ganha um rótulo, não string vazia", () => {
    expect(payloadPublico({ ...base, nome: null }).nome).toBe("Mapa do funil");
  });

  it("mapa nunca salvo vem como rascunho, com ao menos uma aba", () => {
    // Lista vazia de abas trava o canvas no esqueleto de carregamento.
    const saida = payloadPublico(base);
    expect(saida.rascunho).toBe(true);
    expect(saida.tabs.length).toBeGreaterThan(0);
  });
});

describe("middleware de auth — a fronteira do link público", () => {
  async function app() {
    const { default: authPlugin } = await import("../middleware/auth.js");
    const f = Fastify();
    f.decorate("usoDoProduto", { registrar: vi.fn() } as never);
    await f.register(authPlugin);
    f.get("/api/compartilhado/mapas/:token", async () => ({ ok: true }));
    f.post("/api/compartilhado/mapas/:token", async () => ({ ok: true }));
    f.get("/api/funnel-maps/:id", async () => ({ ok: true }));
    await f.ready();
    return f;
  }

  it("GET do link público passa sem login", async () => {
    getAuth.mockClear();
    const f = await app();
    const r = await f.inject({
      method: "GET",
      url: "/api/compartilhado/mapas/qualquer",
    });
    expect(r.statusCode).toBe(200);
    expect(getAuth).not.toHaveBeenCalled();
    await f.close();
  });

  it("POST no mesmo caminho NÃO passa — o link é só leitura", async () => {
    // Se escrever pelo prefixo público fosse possível, o token viraria chave de
    // edição para qualquer um que recebeu o link.
    getAuth.mockClear();
    const f = await app();
    const r = await f.inject({
      method: "POST",
      url: "/api/compartilhado/mapas/qualquer",
    });
    expect(r.statusCode).toBe(401);
    expect(getAuth).toHaveBeenCalled();
    await f.close();
  });

  it("a rota normal do mapa continua exigindo login", async () => {
    getAuth.mockClear();
    const f = await app();
    const r = await f.inject({
      method: "GET",
      url: "/api/funnel-maps/66aa4c1f-c8dc-4d87-b402-0a74fc8243d7",
    });
    expect(r.statusCode).toBe(401);
    await f.close();
  });
});
