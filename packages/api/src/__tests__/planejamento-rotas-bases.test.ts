import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";

/**
 * Story 48.9 — `GET …/planejamento/bases`: os lançamentos anteriores do mesmo
 * expert (projeto) e mesmo tipo.
 *
 * Story 48.13 — COM e SEM simulador salvo (decisão 2.3 = B do Danilo): o que
 * não tem simulador entra com `temSimulador: false` e a tela mostra só o
 * realizado dele. Dois testes da 48.9 foram INVERTIDOS (marcados abaixo) —
 * eles afirmavam a regra antiga.
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

  // Story 48.13 — INVERTE o teste da 48.9 "sem nenhum simulador salvo, não há
  // base". É o caso que originou o pedido: fz-m3-set-26 sem oferecer fz-m2 e
  // fz-m1, que estão arquivados, sem simulador e com realizado medido.
  it("sem nenhum simulador salvo, os meteóricos anteriores APARECEM, com `temSimulador: false` (Story 48.13)", async () => {
    const r = await app.inject({ method: "GET", url: url(M3) });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.tipo).toBe("m");
    expect(body.incluiSemSimulador).toBe(true);
    expect(body.bases.map((b: { nome: string }) => b.nome)).toEqual(["fz-m2-jul26", "fz-m1-mai26"]);
    expect(body.bases.map((b: { temSimulador: boolean }) => b.temSimulador)).toEqual([false, false]);
    expect(body.bases.map((b: { simuladorAtualizadoEm: string | null }) => b.simuladorAtualizadoEm)).toEqual([null, null]);
  });

  it("só os anteriores do MESMO tipo entram, do mais recente para o mais antigo — com simulador, `temSimulador: true`", async () => {
    await salvar(M1);
    await salvar(M2);
    await salvar(L2); // gratuito — não pode aparecer para um meteórico
    const body = (await app.inject({ method: "GET", url: url(M3) })).json();
    expect(body.bases.map((b: { nome: string }) => b.nome)).toEqual(["fz-m2-jul26", "fz-m1-mai26"]);
    expect(body.bases[0]).toMatchObject({ funnelId: M2, tipo: "m", rotuloDoTipo: "meteórico", edicao: 2, temSimulador: true });
    expect(body.bases[0].simuladorAtualizadoEm).not.toBeNull();
  });

  // Story 48.13 — INVERTE o teste da 48.9 "o anterior sem simulador é omitido,
  // mesmo sendo do tipo certo": agora ele aparece, identificado.
  it("o anterior sem simulador APARECE, identificado como tal, ao lado do que tem (Story 48.13)", async () => {
    await salvar(M1);
    const body = (await app.inject({ method: "GET", url: url(M3) })).json();
    expect(body.bases.map((b: { nome: string; temSimulador: boolean }) => [b.nome, b.temSimulador])).toEqual([
      ["fz-m2-jul26", false],
      ["fz-m1-mai26", true],
    ]);
    expect(body.bases[0].simuladorAtualizadoEm).toBeNull();
    expect(body.bases[1].simuladorAtualizadoEm).not.toBeNull();
  });

  it("funil sem tipo identificado (bbe-web-mai-26) → sem base e `tipo: null`", async () => {
    await salvar(M1);
    await salvar(M2);
    const body = (await app.inject({ method: "GET", url: url(WEB) })).json();
    expect(body.bases).toEqual([]);
    expect(body.tipo).toBeNull();
  });

  it("primeiro do tipo → sem base, e o `tipo` é o do PRÓPRIO funil (Story 48.13, AC2)", async () => {
    await salvar(M2);
    const body = (await app.inject({ method: "GET", url: url(M1) })).json();
    expect(body.bases).toEqual([]);
    // Antes saía `null` (o tipo vinha do primeiro anterior, que não existe) e a
    // tela culpava o nome do funil.
    expect(body.tipo).toBe("m");
    expect(body.incluiSemSimulador).toBe(true);
  });

  it("fz-l2-jun-26, o primeiro gratuito do projeto → `tipo: 'l'` com `bases: []` (Story 48.13, AC2)", async () => {
    await salvar(M1);
    await salvar(M2);
    const body = (await app.inject({ method: "GET", url: url(L2) })).json();
    expect(body.bases).toEqual([]);
    expect(body.tipo).toBe("l");
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
