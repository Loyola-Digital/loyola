import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";

/** Story 48.5 — rotas `…/planejamento/resumo` (rótulos dos cenários; AC2, AC16). */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const LANCAMENTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO_MEMBRO = "88888888-8888-4888-8888-888888888888";

const url = (funnelId = LANCAMENTO, projectId = PROJETO) => `/api/projects/${projectId}/funnels/${funnelId}/planejamento/resumo`;
const urlInputs = () => `/api/projects/${PROJETO}/funnels/${LANCAMENTO}/planejamento/inputs`;

function payloadValido() {
  return {
    cenarios: [
      { indice: 1, rotulo: "META PISO" },
      { indice: 2, rotulo: "META BOA" },
      { indice: 3, rotulo: "META SUPER" },
      { indice: 4, rotulo: null },
      { indice: 5, rotulo: null },
    ],
  };
}

describe("rotas de planejamento — resumo/rótulos (Story 48.5)", () => {
  let app: FastifyInstance;
  let papelDoConvidado: string;

  beforeEach(async () => {
    app = Fastify();
    app.decorateRequest("userId", "");
    app.decorateRequest("userRole", "");
    app.addHook("onRequest", async (req) => {
      const papel = (req.headers["x-papel"] as string) || "strategist";
      req.userRole = papel;
      req.userId = papel === "guest" ? papelDoConvidado : USUARIO;
    });
    app.decorate("db", {} as never);
    app.decorate(
      "planejamentoRepo",
      criarRepositorioEmMemoria({
        projetos: [{ id: PROJETO, membros: [CONVIDADO_MEMBRO] }, { id: OUTRO_PROJETO }],
        funis: [
          { id: LANCAMENTO, projectId: PROJETO, type: "launch" },
          { id: PERPETUO, projectId: PROJETO, type: "perpetual" },
        ],
      }),
    );
    papelDoConvidado = CONVIDADO_MEMBRO;
    await app.register(planejamentoRoutes);
  }, 30_000);

  async function salvarInputs() {
    expect((await app.inject({ method: "PUT", url: urlInputs(), payload: inputsVazios() })).statusCode).toBe(200);
  }

  it("GET antes de salvar devolve os cinco cenários 1…5 sem rótulo, sem criar linha", async () => {
    const r = await app.inject({ method: "GET", url: url() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.funnelId).toBe(LANCAMENTO);
    expect(body.updatedAt).toBeNull();
    expect(body.cenarios).toEqual([1, 2, 3, 4, 5].map((indice) => ({ indice, rotulo: null })));
    expect(await app.planejamentoRepo!.lerRotulos(LANCAMENTO)).toBeNull();
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();
  });

  it("PUT válido persiste e GET devolve o mesmo (ida-e-volta); os três rótulos e o vazio", async () => {
    await salvarInputs();
    const p = payloadValido();
    const put = await app.inject({ method: "PUT", url: url(), payload: p });
    expect(put.statusCode).toBe(200);
    expect(put.json().ok).toBe(true);
    expect(put.json().cenarios).toEqual(p.cenarios);
    const get = await app.inject({ method: "GET", url: url() });
    expect(get.json().cenarios).toEqual(p.cenarios);
    expect(get.json().updatedAt).not.toBeNull();
  });

  it("PUT sem os Inputs Financeiros salvos → 409 e nada gravado", async () => {
    const put = await app.inject({ method: "PUT", url: url(), payload: payloadValido() });
    expect(put.statusCode).toBe(409);
    expect(put.json().error).toMatch(/Inputs Financeiros/);
    expect(await app.planejamentoRepo!.lerRotulos(LANCAMENTO)).toBeNull();
  });

  it("PUT rejeita com 400: rótulo fora da lista, texto vazio, índice 6, quatro cenários, índice repetido, campo desconhecido, campo faltando", async () => {
    await salvarInputs();
    const casos: Array<[string, unknown]> = [
      ["rótulo fora da lista", { cenarios: [{ indice: 1, rotulo: "META ÓTIMA" }, ...payloadValido().cenarios.slice(1)] }],
      ["texto vazio", { cenarios: [{ indice: 1, rotulo: "" }, ...payloadValido().cenarios.slice(1)] }],
      ["rótulo minúsculo", { cenarios: [{ indice: 1, rotulo: "meta boa" }, ...payloadValido().cenarios.slice(1)] }],
      ["índice 6", { cenarios: [...payloadValido().cenarios.slice(0, 4), { indice: 6, rotulo: null }] }],
      ["quatro cenários", { cenarios: payloadValido().cenarios.slice(0, 4) }],
      ["índice repetido", { cenarios: [...payloadValido().cenarios.slice(0, 4), { indice: 1, rotulo: null }] }],
      ["campo desconhecido no cenário", { cenarios: [{ indice: 1, rotulo: null, cor: "verde" }, ...payloadValido().cenarios.slice(1)] }],
      ["campo desconhecido na raiz", { ...payloadValido(), resumo: {} }],
      ["campo faltando", { cenarios: [{ indice: 1 }, ...payloadValido().cenarios.slice(1)] }],
    ];
    for (const [nome, payload] of casos) {
      const r = await app.inject({ method: "PUT", url: url(), payload: payload as object });
      expect(r.statusCode, nome).toBe(400);
      expect(r.json().error, nome).toBe("Dados inválidos");
    }
    expect(await app.planejamentoRepo!.lerRotulos(LANCAMENTO)).toBeNull();
  });

  it("funil perpétuo → 404 nos dois verbos; outro projeto → 404", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: url(PERPETUO), payload: payloadValido() })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(LANCAMENTO, OUTRO_PROJETO) })).statusCode).toBe(404);
  });

  it("guest membro LÊ (200) mas não ESCREVE (403); guest não membro não vê (404)", async () => {
    await salvarInputs();
    const h = { "x-papel": "guest" };
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: url(), headers: h, payload: payloadValido() })).statusCode).toBe(403);
    expect(await app.planejamentoRepo!.lerRotulos(LANCAMENTO)).toBeNull();
    papelDoConvidado = "77777777-7777-4777-8777-777777777777";
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(404);
  });
});
