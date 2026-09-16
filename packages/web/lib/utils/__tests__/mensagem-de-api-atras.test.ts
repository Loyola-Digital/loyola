// Story 47.15 — AC2/AC3/AC4: os dois erros crus de 15/09 viram a frase da API antiga; o resto não.
import { describe, expect, it } from "vitest";
import { ehApiAtras, mensagemDeApiAtras } from "../mensagem-de-api-atras";

describe("mensagemDeApiAtras", () => {
  it("404 (rota não existe na API antiga) → frase da API atrás", () => {
    expect(mensagemDeApiAtras({ status: 404, mensagem: "Not Found" }, "hooks e bodies")).toBe(
      "A API ainda não tem as rotas de hooks e bodies — provavelmente está atrás do painel. Veja o aviso de versão no topo.",
    );
  });
  it('400 "id: Invalid UUID" (GET …/ads/partes caindo em /ads/:id) → frase da API atrás', () => {
    expect(ehApiAtras({ status: 400, mensagem: "id: Invalid UUID" })).toBe(true);
    expect(mensagemDeApiAtras({ status: 400, mensagem: "id: Invalid UUID" }, "origens do vídeo")).toMatch(/rotas de origens do vídeo/);
  });
  it("qualquer outro erro NÃO é traduzido — aparece como veio (erro ≠ ausência)", () => {
    expect(mensagemDeApiAtras({ status: 400, mensagem: "code: h + dois dígitos (ex.: h01)" }, "hooks e bodies")).toBeNull();
    expect(mensagemDeApiAtras({ status: 500, mensagem: "Internal Server Error" }, "hooks e bodies")).toBeNull();
    expect(mensagemDeApiAtras({ status: 403, mensagem: "guest" }, "hooks e bodies")).toBeNull();
    expect(mensagemDeApiAtras({ status: 0, mensagem: "Failed to fetch" }, "hooks e bodies")).toBeNull();
    expect(mensagemDeApiAtras(null, "hooks e bodies")).toBeNull();
    expect(mensagemDeApiAtras(undefined, "hooks e bodies")).toBeNull();
  });
});
