import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria, inputsVazios } from "../services/planejamento-repositorio.js";
import { FONTES_PAGAS, CAMPOS_DO_BLOCO_PAGO, pagosVazios } from "@loyola-x/shared";

/**
 * Story 48.4 — rotas `…/planejamento/pagos` (AC2, AC17). Mesmo desenho das
 * rotas da 48.1/48.3: Fastify de verdade, sem banco, repositório em memória.
 */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const LANCAMENTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO_MEMBRO = "88888888-8888-4888-8888-888888888888";

const url = (funnelId = LANCAMENTO, projectId = PROJETO) => `/api/projects/${projectId}/funnels/${funnelId}/planejamento/pagos`;
const urlInputs = () => `/api/projects/${PROJETO}/funnels/${LANCAMENTO}/planejamento/inputs`;

/** Payload válido completo: apêndice A da spec (blocos e as cinco seleções). */
function payloadValido() {
  const v = pagosVazios();
  const parametros: Record<string, number[]> = {
    meta_quente: [0.85, 0.012, 0.05, 0.1, 4.5, 0.05, 4],
    meta_frio: [0.85, 0.006, 0.1, 0.1, 2.5, 0.05, 3],
    google_quente: [0.85, 0.01, 0.05, 0.15, 3, 0.1, 5],
    google_frio: [0.85, 0.007, 0.1, 0.2, 2.2, 0.1, 2],
  };
  for (const f of FONTES_PAGAS) {
    const [pctCaptacao, conversaoMedia, variacaoConversao, variacaoReceita, cplMedioHistorico, faixaVariacao, nivelAssumido] = parametros[f];
    v.blocos[f] = { pctCaptacao, conversaoMedia, variacaoConversao, variacaoReceita, cplMedioHistorico, faixaVariacao, fracaoCenario1: 0.7, nivelAssumido };
  }
  const selecoes = [
    [5, 4, 4, 2],
    [4, 4, 5, 3],
    [6, 5, 3, 2],
    [3, 3, 4, 4],
    [2, 6, 2, 1],
  ];
  v.combinacoes = selecoes.map((s, k) => {
    const sel = {} as (typeof v.combinacoes)[number]["selecoes"];
    FONTES_PAGAS.forEach((f, i) => (sel[f] = s[i]));
    return { indice: k + 1, selecoes: sel };
  });
  return v;
}

describe("rotas de planejamento — pagos (Story 48.4)", () => {
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
    const r = await app.inject({ method: "PUT", url: urlInputs(), payload: inputsVazios() });
    expect(r.statusCode).toBe(200);
  }

  it("GET antes de salvar devolve SEMPRE as quatro fontes (oito campos null) e as cinco combinações 1…5, sem criar linha (PO-02)", async () => {
    const r = await app.inject({ method: "GET", url: url() });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.funnelId).toBe(LANCAMENTO);
    expect(body.updatedAt).toBeNull();
    expect(Object.keys(body.blocos).sort()).toEqual([...FONTES_PAGAS].sort());
    for (const f of FONTES_PAGAS) {
      expect(Object.keys(body.blocos[f]).sort()).toEqual([...CAMPOS_DO_BLOCO_PAGO].sort());
      expect(Object.values(body.blocos[f]).every((v) => v === null)).toBe(true);
    }
    expect(body.combinacoes.map((c: { indice: number }) => c.indice)).toEqual([1, 2, 3, 4, 5]);
    for (const c of body.combinacoes) {
      expect(Object.keys(c.selecoes).sort()).toEqual([...FONTES_PAGAS].sort());
      expect(Object.values(c.selecoes).every((v) => v === null)).toBe(true);
    }
    expect(await app.planejamentoRepo!.lerPagos(LANCAMENTO)).toBeNull();
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

  it("PUT aceita vazio (null) em todos os campos, níveis e seleções; a aba 2 (orgânicos) não é tocada", async () => {
    await salvarInputs();
    const put = await app.inject({ method: "PUT", url: url(), payload: pagosVazios() });
    expect(put.statusCode).toBe(200);
    expect(await app.planejamentoRepo!.lerOrganicos(LANCAMENTO)).toBeNull();
  });

  it("PUT sem os Inputs Financeiros salvos → 409 e nada gravado", async () => {
    const put = await app.inject({ method: "PUT", url: url(), payload: payloadValido() });
    expect(put.statusCode).toBe(409);
    expect(put.json().error).toMatch(/Inputs Financeiros/);
    expect(await app.planejamentoRepo!.lerPagos(LANCAMENTO)).toBeNull();
  });

  it("PUT rejeita com 400: nível 11, nível 0, seleção 11, seleção 1,5, fração > 1, CPL médio negativo, fonte desconhecida, texto, campo faltando, quatro combinações, índice repetido", async () => {
    await salvarInputs();
    const base = payloadValido;
    const comBloco = (fonte: string, patch: Record<string, unknown>) => {
      const p = base() as unknown as { blocos: Record<string, Record<string, unknown>> };
      p.blocos[fonte] = { ...p.blocos[fonte], ...patch };
      return p;
    };
    const comSelecao = (k: number, fonte: string, v: unknown) => {
      const p = base() as unknown as { combinacoes: { indice: number; selecoes: Record<string, unknown> }[] };
      p.combinacoes[k - 1].selecoes[fonte] = v;
      return p;
    };
    const casos: Array<[string, unknown]> = [
      ["nível 11", comBloco("meta_quente", { nivelAssumido: 11 })],
      ["nível 0", comBloco("meta_frio", { nivelAssumido: 0 })],
      ["nível fracionário", comBloco("meta_frio", { nivelAssumido: 2.5 })],
      ["seleção 11", comSelecao(1, "meta_quente", 11)],
      ["seleção 0", comSelecao(2, "google_frio", 0)],
      ["seleção 1,5", comSelecao(3, "google_quente", 1.5)],
      ["fração > 1", comBloco("google_quente", { pctCaptacao: 1.5 })],
      ["fração < 0", comBloco("google_quente", { faixaVariacao: -0.1 })],
      ["CPL médio negativo", comBloco("google_frio", { cplMedioHistorico: -1 })],
      ["texto em campo numérico", comBloco("meta_quente", { cplMedioHistorico: "R$ 4,50" })],
      ["texto na seleção", comSelecao(1, "meta_frio", "3")],
      ["campo desconhecido no bloco", comBloco("meta_quente", { remarketing: 4800 })],
      ["fonte desconhecida nos blocos", (() => { const p = base() as unknown as { blocos: Record<string, unknown> }; p.blocos.tiktok = p.blocos.meta_quente; return p; })()],
      ["fonte desconhecida nas seleções", comSelecao(1, "tiktok", 1)],
      ["campo faltando no bloco", (() => { const p = base() as unknown as { blocos: Record<string, Record<string, unknown>> }; delete p.blocos.meta_quente.pctCaptacao; return p; })()],
      ["fonte faltando", (() => { const p = base() as unknown as { blocos: Record<string, unknown> }; delete p.blocos.google_frio; return p; })()],
      ["quatro combinações", (() => { const p = base(); p.combinacoes = p.combinacoes.slice(0, 4); return p; })()],
      ["índice repetido", (() => { const p = base(); p.combinacoes[4].indice = 1; return p; })()],
      ["campo desconhecido na raiz", { ...base(), trafego: {} }],
    ];
    for (const [nome, payload] of casos) {
      const r = await app.inject({ method: "PUT", url: url(), payload: payload as object });
      expect(r.statusCode, nome).toBe(400);
      expect(r.json().error, nome).toBe("Dados inválidos");
    }
    expect(await app.planejamentoRepo!.lerPagos(LANCAMENTO)).toBeNull();
  });

  it("funil perpétuo → 404 nos dois verbos; funil de outro projeto → 404", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: url(PERPETUO), payload: payloadValido() })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(LANCAMENTO, OUTRO_PROJETO) })).statusCode).toBe(404);
  });

  it("guest membro LÊ (200) mas não ESCREVE (403); guest não membro não vê (404)", async () => {
    await salvarInputs();
    const h = { "x-papel": "guest" };
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: url(), headers: h, payload: payloadValido() })).statusCode).toBe(403);
    expect(await app.planejamentoRepo!.lerPagos(LANCAMENTO)).toBeNull();
    papelDoConvidado = "77777777-7777-4777-8777-777777777777";
    expect((await app.inject({ method: "GET", url: url(), headers: h })).statusCode).toBe(404);
  });
});
