import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";

/**
 * Story 48.9 — `GET …/planejamento/bases`: os lançamentos anteriores do mesmo
 * expert (projeto) e mesmo tipo que JÁ TÊM simulador salvo.
 *
 * Os funis do seed são os reais de produção do projeto FZ & MFB, na ordem de
 * criação.
 */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO = "88888888-8888-4888-8888-888888888888";

const M1 = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L2 = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M2 = "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M3 = "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEB = "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DE_OUTRO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const url = (funnelId: string) => `/api/projects/${PROJETO}/funnels/${funnelId}/planejamento/bases`;
const urlInputs = (funnelId: string) => `/api/projects/${PROJETO}/funnels/${funnelId}/planejamento/inputs`;

describe("rotas de planejamento — bases (Story 48.9)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    app.decorateRequest("userId", "");
    app.decorateRequest("userRole", "");
    app.addHook("onRequest", async (req) => {
      const papel = (req.headers["x-papel"] as string) || "strategist";
      req.userRole = papel;
      req.userId = papel === "guest" ? CONVIDADO : USUARIO;
    });
    app.decorate("db", {} as never);
    app.decorate(
      "planejamentoRepo",
      criarRepositorioEmMemoria({
        projetos: [{ id: PROJETO, membros: [CONVIDADO] }, { id: OUTRO_PROJETO }],
        funis: [
          { id: M1, projectId: PROJETO, type: "launch", nome: "fz-m1-mai26", criadoEm: "2026-05-01T00:00:00.000Z" },
          { id: WEB, projectId: PROJETO, type: "launch", nome: "bbe-web-mai-26", criadoEm: "2026-05-10T00:00:00.000Z" },
          { id: L2, projectId: PROJETO, type: "launch", nome: "fz-l2-jun-26", criadoEm: "2026-06-01T00:00:00.000Z" },
          { id: M2, projectId: PROJETO, type: "launch", nome: "fz-m2-jul26", criadoEm: "2026-07-01T00:00:00.000Z" },
          { id: M3, projectId: PROJETO, type: "launch", nome: "fz-m3-set-26", criadoEm: "2026-09-01T00:00:00.000Z" },
          { id: PERPETUO, projectId: PROJETO, type: "perpetual", nome: "fz-perpetuo", criadoEm: "2026-01-01T00:00:00.000Z" },
          { id: DE_OUTRO, projectId: OUTRO_PROJETO, type: "launch", nome: "dg-pg02", criadoEm: "2026-03-01T00:00:00.000Z" },
        ],
      }),
    );
    await app.register(planejamentoRoutes);
  }, 30_000);

  const salvar = async (funnelId: string) =>
    expect((await app.inject({ method: "PUT", url: urlInputs(funnelId), payload: inputsVazios() })).statusCode).toBe(200);

  it("sem nenhum simulador salvo, não há base — mesmo existindo meteóricos anteriores", async () => {
    const r = await app.inject({ method: "GET", url: url(M3) });
    expect(r.statusCode).toBe(200);
    expect(r.json().bases).toEqual([]);
    expect(r.json().tipo).toBe("m");
  });

  it("só os anteriores do MESMO tipo e COM simulador salvo entram, do mais recente para o mais antigo", async () => {
    await salvar(M1);
    await salvar(M2);
    await salvar(L2); // gratuito — não pode aparecer para um meteórico
    const body = (await app.inject({ method: "GET", url: url(M3) })).json();
    expect(body.bases.map((b: { nome: string }) => b.nome)).toEqual(["fz-m2-jul26", "fz-m1-mai26"]);
    expect(body.bases[0]).toMatchObject({ funnelId: M2, tipo: "m", rotuloDoTipo: "meteórico", edicao: 2 });
    expect(body.bases[0].simuladorAtualizadoEm).not.toBeNull();
  });

  it("o anterior sem simulador é omitido, mesmo sendo do tipo certo", async () => {
    await salvar(M1);
    const body = (await app.inject({ method: "GET", url: url(M3) })).json();
    expect(body.bases.map((b: { nome: string }) => b.nome)).toEqual(["fz-m1-mai26"]);
  });

  it("funil sem tipo identificado (bbe-web-mai-26) → sem base e `tipo: null`", async () => {
    await salvar(M1);
    await salvar(M2);
    const body = (await app.inject({ method: "GET", url: url(WEB) })).json();
    expect(body.bases).toEqual([]);
    expect(body.tipo).toBeNull();
  });

  it("primeiro do tipo → sem base", async () => {
    await salvar(M2);
    expect((await app.inject({ method: "GET", url: url(M1) })).json().bases).toEqual([]);
  });

  it("não oferece funil de outro projeto nem funil perpétuo", async () => {
    await salvar(M1);
    await salvar(M2);
    const body = (await app.inject({ method: "GET", url: url(M3) })).json();
    const ids = body.bases.map((b: { funnelId: string }) => b.funnelId);
    expect(ids).not.toContain(DE_OUTRO);
    expect(ids).not.toContain(PERPETUO);
  });

  it("funil perpétuo → 404 (a aba não existe para ele); guest membro lê", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(M3), headers: { "x-papel": "guest" } })).statusCode).toBe(200);
  });
});
