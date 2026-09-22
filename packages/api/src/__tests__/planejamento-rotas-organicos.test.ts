import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";
import { CANAIS_ORGANICOS, CAMPOS_DO_BLOCO_ORGANICO, organicosVazios } from "@loyola-x/shared";

/**
 * Story 48.3 — rotas `…/planejamento/organicos` (AC2, AC16).
 *
 * Mesmo desenho do teste da 48.1: Fastify de verdade, sem banco, repositório
 * em memória em `fastify.planejamentoRepo`, papel pelo header `x-papel`.
 */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const LANCAMENTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO_MEMBRO = "88888888-8888-4888-8888-888888888888";

const url = (funnelId = LANCAMENTO, projectId = PROJETO) => `/api/projects/${projectId}/funnels/${funnelId}/planejamento/organicos`;
const urlInputs = (funnelId = LANCAMENTO) => `/api/projects/${PROJETO}/funnels/${funnelId}/planejamento/inputs`;

/** Payload válido completo: apêndice A da spec (blocos e as cinco seleções). */
function payloadValido() {
  const v = organicosVazios();
  const parametros: Record<string, number[]> = {
    whatsapp: [0.04, 0.2, 0.1, 0.12, 0.1, 3],
    email: [0.04, 0.3, 0.1, 0.05, 0.1, 2],
    instagram: [0.02, 0.25, 0.1, 0.03, 0.1, 4],
    telegram: [0.04, 0.5, 0.1, 0.15, 0.2, 1],
    youtube: [0.03, 0.3, 0.2, 0.02, 0.1, 5],
    area_membros: [0.04, 0.4, 0.1, 0.06, 0.1, 3],
  };
  for (const c of CANAIS_ORGANICOS) {
    const [conversaoMedia, variacaoConversao, variacaoReceita, taxaCaptacao, faixaVariacao, nivelAssumido] = parametros[c];
    v.blocos[c] = { conversaoMedia, variacaoConversao, variacaoReceita, taxaCaptacao, faixaVariacao, fracaoCenario1: 0.7, nivelAssumido };
  }
  const selecoes = [
    [4, 3, 2, 1, 5, 6],
    [6, 5, 3, 2, 8, 7],
    [5, 4, 2, 3, 6, 5],
    [3, 3, 1, 2, 4, 4],
    [2, 1, 2, 1, 3, 3],
  ];
  v.combinacoes = selecoes.map((s, k) => {
    const sel = {} as (typeof v.combinacoes)[number]["selecoes"];
    CANAIS_ORGANICOS.forEach((c, i) => (sel[c] = s[i]));
    return { indice: k + 1, selecoes: sel };
  });
  return v;
}

describe("rotas de planejamento — orgânicos (Story 48.3)", () => {
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

  /** Os Inputs Financeiros precisam existir para o PUT dos orgânicos (o simulador é a linha-mãe). */
  async function salvarInputs() {
    const r = await app.inject({ method: "PUT", url: urlInputs(), payload: inputsVazios() });
    expect(r.statusCode).toBe(200);
  }

  it("GET antes de salvar devolve SEMPRE os seis canais (sete campos null) e as cinco combinações 1…5 (seleções null), sem criar linha (PO-02)", async () => {
    const r = await app.inject({ method: "GET", url: url() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.funnelId).toBe(LANCAMENTO);
    expect(body.updatedAt).toBeNull();
    expect(Object.keys(body.blocos).sort()).toEqual([...CANAIS_ORGANICOS].sort());
    for (const c of CANAIS_ORGANICOS) {
      expect(Object.keys(body.blocos[c]).sort()).toEqual([...CAMPOS_DO_BLOCO_ORGANICO].sort());
      expect(Object.values(body.blocos[c]).every((v) => v === null)).toBe(true);
    }
    expect(body.combinacoes.map((c: { indice: number }) => c.indice)).toEqual([1, 2, 3, 4, 5]);
    for (const c of body.combinacoes) {
      expect(Object.keys(c.selecoes).sort()).toEqual([...CANAIS_ORGANICOS].sort());
      expect(Object.values(c.selecoes).every((v) => v === null)).toBe(true);
    }
    expect(await app.planejamentoRepo!.lerOrganicos(LANCAMENTO)).toBeNull();
    // e a leitura dos orgânicos também não cria o simulador
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();
  });

  it("PUT válido persiste e GET devolve o mesmo (ida-e-volta)", async () => {
    await salvarInputs();
    const p = payloadValido();
    const put = await app.inject({ method: "PUT", url: url(), payload: p });
    expect(put.statusCode).toBe(200);
    expect(put.json().ok).toBe(true);
    expect(put.json().blocos).toEqual(p.blocos);
    expect(put.json().combinacoes).toEqual(p.combinacoes);
    const get = await app.inject({ method: "GET", url: url() });
    expect(get.json().blocos).toEqual(p.blocos);
    expect(get.json().combinacoes).toEqual(p.combinacoes);
    expect(get.json().updatedAt).not.toBeNull();
  });

  it("PUT aceita vazio (null) em todos os campos, níveis e seleções", async () => {
    await salvarInputs();
    const p = organicosVazios();
    const put = await app.inject({ method: "PUT", url: url(), payload: p });
    expect(put.statusCode).toBe(200);
    expect(put.json().blocos).toEqual(p.blocos);
    expect(put.json().combinacoes).toEqual(p.combinacoes);
  });

  it("PUT sem os Inputs Financeiros salvos → 409 e nada gravado (o simulador é a linha-mãe; não é criado às escondidas)", async () => {
    const put = await app.inject({ method: "PUT", url: url(), payload: payloadValido() });
    expect(put.statusCode).toBe(409);
    expect(put.json().error).toMatch(/Inputs Financeiros/);
    expect(await app.planejamentoRepo!.lerOrganicos(LANCAMENTO)).toBeNull();
    expect(await app.planejamentoRepo!.lerInputs(LANCAMENTO)).toBeNull();
  });

  it("PUT rejeita com 400: nível 9, nível 0, seleção 11, seleção 1,5, fração > 1, canal desconhecido, texto, campo faltando, quatro combinações, índice repetido", async () => {
    await salvarInputs();
    const base = payloadValido;
    const comBloco = (canal: string, patch: Record<string, unknown>) => {
      const p = base() as unknown as { blocos: Record<string, Record<string, unknown>> };
      p.blocos[canal] = { ...p.blocos[canal], ...patch };
      return p;
    };
    const comSelecao = (k: number, canal: string, v: unknown) => {
      const p = base() as unknown as { combinacoes: { indice: number; selecoes: Record<string, unknown> }[] };
      p.combinacoes[k - 1].selecoes[canal] = v;
      return p;
    };
    const casos: Array<[string, unknown]> = [
      ["nível 9", comBloco("whatsapp", { nivelAssumido: 9 })],
      ["nível 0", comBloco("email", { nivelAssumido: 0 })],
      ["nível fracionário", comBloco("email", { nivelAssumido: 2.5 })],
      ["seleção 11", comSelecao(1, "whatsapp", 11)],
      ["seleção 0", comSelecao(2, "telegram", 0)],
      ["seleção 1,5", comSelecao(3, "youtube", 1.5)],
      ["fração > 1", comBloco("instagram", { conversaoMedia: 1.5 })],
      ["fração < 0", comBloco("instagram", { faixaVariacao: -0.1 })],
      ["texto em campo numérico", comBloco("telegram", { variacaoReceita: "10%" })],
      ["texto na seleção", comSelecao(1, "email", "3")],
      ["campo desconhecido no bloco", comBloco("youtube", { leadsEsperados: 3000 })],
      ["canal desconhecido nos blocos", (() => { const p = base() as unknown as { blocos: Record<string, unknown> }; p.blocos.tiktok = p.blocos.whatsapp; return p; })()],
      ["canal desconhecido nas seleções", comSelecao(1, "tiktok", 1)],
      ["campo faltando no bloco", (() => { const p = base() as unknown as { blocos: Record<string, Record<string, unknown>> }; delete p.blocos.whatsapp.nivelAssumido; return p; })()],
      ["canal faltando", (() => { const p = base() as unknown as { blocos: Record<string, unknown> }; delete p.blocos.area_membros; return p; })()],
      ["quatro combinações", (() => { const p = base(); p.combinacoes = p.combinacoes.slice(0, 4); return p; })()],
      ["índice repetido", (() => { const p = base(); p.combinacoes[4].indice = 1; return p; })()],
      ["índice 6", (() => { const p = base(); p.combinacoes[4].indice = 6; return p; })()],
      ["campo desconhecido na raiz", { ...base(), resumo: {} }],
    ];
    for (const [nome, payload] of casos) {
      const r = await app.inject({ method: "PUT", url: url(), payload: payload as object });
      expect(r.statusCode, nome).toBe(400);
      expect(r.json().error, nome).toBe("Dados inválidos");
    }
    expect(await app.planejamentoRepo!.lerOrganicos(LANCAMENTO)).toBeNull();
  });

  it("funil perpétuo → 404 nos dois verbos", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: url(PERPETUO), payload: payloadValido() })).statusCode).toBe(404);
  });

  it("funil de outro projeto → 404", async () => {
    expect((await app.inject({ method: "GET", url: url(LANCAMENTO, OUTRO_PROJETO) })).statusCode).toBe(404);
  });

  it("guest membro LÊ (200) mas não ESCREVE (403); guest não membro não vê (404)", async () => {
    await salvarInputs();
    const h = { "x-papel": "guest" };
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(200);
    const put = await app.inject({ method: "PUT", url: url(), headers: h, payload: payloadValido() });
    expect(put.statusCode).toBe(403);
    expect(await app.planejamentoRepo!.lerOrganicos(LANCAMENTO)).toBeNull();

    papelDoConvidado = "77777777-7777-4777-8777-777777777777";
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(404);
  });
});
