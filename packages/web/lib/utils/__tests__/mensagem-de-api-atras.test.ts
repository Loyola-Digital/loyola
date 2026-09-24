// Story 47.15 — AC2/AC3/AC4: os dois erros crus de 15/09 viram a frase da API antiga; o resto não.
import { describe, expect, it } from "vitest";
import { ehApiAtras, mensagemDeApiAtras, mensagemDeApiAtrasAoSalvarAnuncio } from "../mensagem-de-api-atras";

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
  it("404 de DOMÍNIO (mensagem própria, ex.: expert apagado) NÃO é API atrás — aparece como veio (QA 47.15)", () => {
    expect(ehApiAtras({ status: 404, mensagem: "Expert não encontrado" })).toBe(false);
    expect(mensagemDeApiAtras({ status: 404, mensagem: "expertId: expert não encontrado" }, "hooks e bodies")).toBeNull();
    expect(ehApiAtras({ status: 404, mensagem: " not found " })).toBe(true);
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

// Story 47.16 — AC11 (PO-07): Salvar `perpetuo` com a API anterior à 47.16 — o 400 do zod em `launchSeq` que `ehApiAtras` não pega.
describe("mensagemDeApiAtrasAoSalvarAnuncio", () => {
  // Os textos EXATOS do zod 4.3.6 da API para o schema antigo (`z.number().int().min(1).max(99)`) — fixados do
  // lado da API por `nomenclatura-rotas.test.ts` ("47.16 AC11"): se o zod mudar a frase, aquele teste cai primeiro.
  const zodNull = { status: 400, mensagem: "launchSeq: Invalid input: expected number, received null", corpo: { campo: "launchSeq" } };
  const zodAusente = { status: 400, mensagem: "launchSeq: Invalid input: expected number, received undefined", corpo: { campo: "launchSeq" } };
  it("com o contrato acusando API atrás, o 400 do zod em launchSeq vira explicação — não o texto cru", () => {
    const m = mensagemDeApiAtrasAoSalvarAnuncio(zodNull, true);
    expect(m).toMatch(/A API ainda não aceita anúncio sem número do lançamento \(perpetuo\)/);
    expect(m).not.toMatch(/expected number/i);
    expect(ehApiAtras(zodNull)).toBe(false); // o que a 47.15 sozinha faria: repassar cru
  });
  it("sem o veredito (health fora do ar), a assinatura do zod em inglês basta — a API da 47.16 responde em português", () => {
    expect(mensagemDeApiAtrasAoSalvarAnuncio(zodNull, false)).toMatch(/versão anterior à do painel/);
    expect(mensagemDeApiAtrasAoSalvarAnuncio(zodAusente, false)).toMatch(/versão anterior à do painel/);
  });
  it("o veredito sozinho também basta — um 400 em launchSeq com texto que a assinatura não conhece (zod de outra versão)", () => {
    const outroTexto = { status: 400, mensagem: "launchSeq: número inválido", corpo: { campo: "launchSeq" } };
    expect(mensagemDeApiAtrasAoSalvarAnuncio(outroTexto, true)).toMatch(/versão anterior à do painel/);
    expect(mensagemDeApiAtrasAoSalvarAnuncio(outroTexto, false)).toBeNull();
  });
  it("as recusas da PRÓPRIA API da 47.16 aparecem como vieram, mesmo com o contrato à frente por outra story", () => {
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 400, mensagem: "launchSeq: a sigla pg exige o número do lançamento (01 a 99)", corpo: { campo: "launchSeq" } }, true)).toBeNull();
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 400, mensagem: 'launchSeq: "perpetuo" não tem número do lançamento — mande sem launchSeq', corpo: { campo: "launchSeq" } }, true)).toBeNull();
  });
  it("outros erros: 404/Invalid UUID seguem a frase da 47.15; o resto (409, 422, outro campo) aparece como veio", () => {
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 404, mensagem: "Not Found" }, false)).toMatch(/rotas de anúncios/);
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 409, mensagem: "O NN 01 já é de adv01…", corpo: { campo: "creativeSeq" } }, true)).toBeNull();
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 422, mensagem: "hookId: obrigatório", corpo: { campo: "hookId" } }, true)).toBeNull();
    expect(mensagemDeApiAtrasAoSalvarAnuncio({ status: 400, mensagem: "date: data no formato mm-aaaa", corpo: { campo: "date" } }, true)).toBeNull();
    expect(mensagemDeApiAtrasAoSalvarAnuncio(null, true)).toBeNull();
  });
});
