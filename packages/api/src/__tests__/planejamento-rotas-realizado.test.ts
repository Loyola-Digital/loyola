import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import planejamentoRoutes from "../routes/planejamento.js";
import { criarRepositorioEmMemoria } from "../services/planejamento-repositorio.js";

/**
 * Story 48.11 — `GET …/planejamento/realizado`: o investimento Meta que o
 * lançamento de fato teve, e as etapas do funil.
 *
 * A conta em si está provada em `planejamento-investimento.test.ts`. Aqui o que
 * se prova é a ROTA: guardas, forma do payload e o que ela declara sobre o que
 * NÃO mediu.
 */

const PROJETO = "11111111-1111-4111-8111-111111111111";
const OUTRO_PROJETO = "22222222-2222-4222-8222-222222222222";
const USUARIO = "99999999-9999-4999-8999-999999999999";
const CONVIDADO = "88888888-8888-4888-8888-888888888888";

const LANCAMENTO = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEM_CAMPANHA = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PERPETUO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DE_OUTRO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COM_GOOGLE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const url = (funnelId: string, projectId = PROJETO) =>
  `/api/projects/${projectId}/funnels/${funnelId}/planejamento/realizado`;

describe("rotas de planejamento — realizado (Story 48.11)", () => {
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
          {
            id: LANCAMENTO,
            projectId: PROJETO,
            type: "launch",
            nome: "dg-pg02",
            // O caso real: DUAS etapas de vendas (Vendas e Downsell Vendas).
            etapas: [
              { id: "s1", nome: "Captação Paga", stageType: "paid" },
              { id: "s2", nome: "Vendas", stageType: "sales" },
              { id: "s3", nome: "Downsell Vendas", stageType: "sales" },
            ],
            campanhas: [
              { id: "q", name: "dg-pg02-abr-26--vendas--hot--cbo--videos" },
              { id: "f", name: "dg-pg02-abr-26--vendas--cold--cbo--videos" },
            ],
            gasto: [
              { campaignId: "q", spend: "26115.43", de: "2026-04-17", ate: "2026-06-16" },
              { campaignId: "f", spend: "17491.93", de: "2026-04-18", ate: "2026-06-10" },
            ],
          },
          { id: SEM_CAMPANHA, projectId: PROJETO, type: "launch", nome: "bbe-web-mai-26", etapas: [] },
          {
            id: COM_GOOGLE,
            projectId: PROJETO,
            type: "launch",
            nome: "futuro-com-google",
            etapas: [],
            campanhasDeGoogle: 3,
          },
          { id: PERPETUO, projectId: PROJETO, type: "perpetual", nome: "fz-perpetuo" },
          { id: DE_OUTRO, projectId: OUTRO_PROJETO, type: "launch", nome: "fz-m1-mai26" },
        ],
      }),
    );
    await app.register(planejamentoRoutes);
  }, 30_000);

  it("devolve o investimento por temperatura, a janela e as etapas", async () => {
    const r = await app.inject({ method: "GET", url: url(LANCAMENTO) });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.funnelId).toBe(LANCAMENTO);
    expect(b.investimentoMeta.total).toBeCloseTo(43607.36, 2);
    expect(b.investimentoMeta.pctQuente).toBeCloseTo(26115.43 / 43607.36, 6);
    expect(b.investimentoMeta.campanhasComSpend).toBe(2);
    expect(b.investimentoMeta.janela).toEqual({ de: "2026-04-17", ate: "2026-06-16" });
  });

  it("as etapas vêm com o `stageType` — é o que permite achar a de vendas sem adivinhar pelo nome", async () => {
    const b = (await app.inject({ method: "GET", url: url(LANCAMENTO) })).json();
    expect(b.etapas).toHaveLength(3);
    // Duas etapas `sales`: quem escolhe é a tela (AC7), e ela precisa ver as duas.
    expect(b.etapas.filter((e: { stageType: string }) => e.stageType === "sales").map((e: { nome: string }) => e.nome)).toEqual([
      "Vendas",
      "Downsell Vendas",
    ]);
  });

  it("declara que o Google não tem fonte — o 0 % não é medição", async () => {
    const b = (await app.inject({ method: "GET", url: url(LANCAMENTO) })).json();
    expect(b.google.temFonte).toBe(false);
    expect(b.google.campanhasVinculadas).toBe(0);
    expect(b.google.motivo).toMatch(/Google/);
  });

  it("com campanha do Google vinculada, a rota diz QUANTAS e muda o motivo", async () => {
    // Hoje são zero nos 11 lançamentos reais, e é só por isso que a tela pode
    // afirmar "100 % Meta". Este é o caminho que faz ela parar de afirmar.
    const b = (await app.inject({ method: "GET", url: url(COM_GOOGLE) })).json();
    expect(b.google.campanhasVinculadas).toBe(3);
    expect(b.google.motivo).toMatch(/não pode ser medida/);
  });

  it("funil sem campanha vinculada devolve zeros, não erro", async () => {
    const r = await app.inject({ method: "GET", url: url(SEM_CAMPANHA) });
    expect(r.statusCode).toBe(200);
    expect(r.json().investimentoMeta).toMatchObject({
      total: 0,
      campanhasVinculadas: 0,
      campanhasComSpend: 0,
      pctQuente: null,
    });
    expect(r.json().etapas).toEqual([]);
  });

  it("guest LÊ (a base é referência, e a referência é leitura)", async () => {
    const r = await app.inject({ method: "GET", url: url(LANCAMENTO), headers: { "x-papel": "guest" } });
    expect(r.statusCode).toBe(200);
  });

  it("funil perpétuo e funil de outro projeto não passam", async () => {
    expect((await app.inject({ method: "GET", url: url(PERPETUO) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: url(DE_OUTRO) })).statusCode).toBe(404);
  });
});
