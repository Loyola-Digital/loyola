import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared";

/**
 * Story 48.1 — rotas do Painel de Planejamento (AC1, AC11, AC13, AC17).
 *
 * Mesmo desenho do teste das rotas de nomenclatura: Fastify de verdade, sem
 * banco, com o repositório em memória em `fastify.planejamentoRepo` e o
 * usuário injetado por hook (`x-papel` escolhe o papel).
 */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const LANCAMENTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO_MEMBRO = "88888888-8888-4888-8888-888888888888";

const url = (funnelId = LANCAMENTO, projectId = PROJETO) => `/api/projects/${projectId}/funnels/${funnelId}/planejamento/inputs`;

/** Payload válido completo: apêndice A da spec. */
function payloadValido() {
  return {
    pctReembolso: 0.04,
    pctMarketplace: 0.09,
    pctImposto: 0.12,
    pctCustoProduto: 0.06,
    pctComissoes: 0.03,
    pctOutrosCustos: 0.01,
    metaMargemTotal: 250000,
    pctMargemPagos: 0.25,
    ticketMedio: 1200,
    mcAlvoPagos: 0.3,
    investimentoAnuncios: 100000,
    pctInvestMeta: 0.4,
    pctMetaQuente: 0.8,
    pctGoogleQuente: 0.75,
    pctOrgWhatsapp: 0.4,
    pctOrgEmail: 0.3,
    pctOrgInstagram: 0.15,
    pctOrgManychat: 0.05,
    pctOrgYoutube: 0.05,
    pctOrgAreaMembros: 0.05,
    baseWhatsapp: 25000,
    baseEmail: 50000,
    baseInstagram: 30000,
    baseManychat: 8000,
    baseYoutube: 120000,
    baseAreaMembros: 6000,
  };
}

describe("rotas de planejamento (Story 48.1)", () => {
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
    // O primeiro `register` importa a rota e o shared a frio; nesta máquina o
    // I/O de node_modules é lento (scanner) e estourava os 10 s padrão do hook.
  }, 30_000);

  it("GET antes de salvar devolve as 26 entradas em null e updatedAt null (AC1: nada é criado na leitura)", async () => {
    const r = await app.inject({ method: "GET", url: url() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.funnelId).toBe(LANCAMENTO);
    expect(body.updatedAt).toBeNull();
    expect(Object.keys(body.inputs).sort()).toEqual([...CAMPOS_DOS_INPUTS_FINANCEIROS].sort());
    expect(Object.values(body.inputs).every((v) => v === null)).toBe(true);
    expect(app.planejamentoRepo!.lerInputs).toBeDefined();
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();
  });

  it("PUT válido persiste e GET devolve o mesmo (AC17)", async () => {
    const p = payloadValido();
    const put = await app.inject({ method: "PUT", url: url(), payload: p });
    expect(put.statusCode).toBe(200);
    expect(put.json().ok).toBe(true);
    expect(put.json().inputs).toEqual(p);
    const get = await app.inject({ method: "GET", url: url() });
    expect(get.json().inputs).toEqual(p);
    expect(get.json().updatedAt).not.toBeNull();
  });

  it("PUT aceita vazio (null) em qualquer campo — vazio não é zero, é ausência (AC11)", async () => {
    const p = { ...inputsVazios() };
    const put = await app.inject({ method: "PUT", url: url(), payload: p });
    expect(put.statusCode).toBe(200);
    expect(put.json().inputs).toEqual(p);
  });

  it("PUT rejeita com 400: percentual 1,5; ticket 0; margem-alvo 0; base negativa; texto em campo numérico; campo desconhecido; campo faltando", async () => {
    const casos: Array<[string, Record<string, unknown>]> = [
      ["percentual > 1", { ...payloadValido(), pctImposto: 1.5 }],
      ["percentual < 0", { ...payloadValido(), pctOrgEmail: -0.1 }],
      ["ticket 0", { ...payloadValido(), ticketMedio: 0 }],
      ["margem-alvo dos pagos 0", { ...payloadValido(), mcAlvoPagos: 0 }],
      ["moeda negativa", { ...payloadValido(), metaMargemTotal: -1 }],
      ["base negativa", { ...payloadValido(), baseWhatsapp: -5 }],
      ["base fracionária", { ...payloadValido(), baseEmail: 10.5 }],
      ["texto em campo numérico", { ...payloadValido(), pctReembolso: "4%" }],
      ["campo desconhecido", { ...payloadValido(), pctCustosTotal: 0.35 }],
      ["campo faltando", (({ baseAreaMembros: _omitido, ...resto }) => resto)(payloadValido())],
    ];
    for (const [nome, payload] of casos) {
      const r = await app.inject({ method: "PUT", url: url(), payload });
      expect(r.statusCode, nome).toBe(400);
      expect(r.json().error, nome).toBe("Dados inválidos");
    }
    // e nada foi gravado
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();
  });

  it("funil perpétuo → 404 nos dois verbos (AC1: a aba não existe para ele)", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: url(PERPETUO), payload: payloadValido() })).statusCode).toBe(404);
  });

  it("funil de outro projeto → 404 (caminho escopado por projeto, PO-01)", async () => {
    expect((await app.inject({ method: "GET", url: url(LANCAMENTO, OUTRO_PROJETO) })).statusCode).toBe(404);
  });

  it("guest membro do projeto LÊ (200) mas não ESCREVE (403); guest não membro não vê (404)", async () => {
    const h = { "x-papel": "guest" };
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(200);
    const put = await app.inject({ method: "PUT", url: url(), headers: h, payload: payloadValido() });
    expect(put.statusCode).toBe(403);
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();

    papelDoConvidado = "77777777-7777-4777-8777-777777777777"; // não é membro
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(404);
  });

  it("parâmetros que não são UUID → 400", async () => {
    expect((await app.inject({ method: "GET", url: "/api/projects/x/funnels/y/planejamento/inputs" })).statusCode).toBe(400);
  });
});
