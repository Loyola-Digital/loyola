/**
 * Story 49.6 — acréscimos ao GET da config (49.1):
 *  - PERF-001: com `cachePerguntasMs`, o GET não reabre a planilha da pesquisa a
 *    cada chamada; falha de leitura NÃO é memoizada (continua "falha", nunca vira
 *    "sem pesquisa" nem sucesso velho); sem a opção, nada muda (49.1 intacta);
 *  - `pesquisasPorEtapa` (seletor da pesquisa de captação, 49.11 AC7) só quando
 *    o store sabe listar com o nome da aba.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import type { Database } from "../db/client.js";
import { IDS, mundoPadrao, storeEmMemoria, type Mundo } from "./fixtures/debriefing-config-store.js";

const URL = `/api/projects/${IDS.projeto}/funnels/${IDS.funil}/stages/${IDS.debriefing}/debriefing/config`;

let mundo: Mundo;

async function montar(opts: { cachePerguntasMs?: number; comRotulo?: boolean | "falha" } = {}) {
  const base = storeEmMemoria(mundo);
  const store = opts.comRotulo
    ? {
        ...base,
        pesquisasComRotulo: vi.fn(async (ids: string[]) =>
          opts.comRotulo === "falha" ? Promise.reject(new Error("banco fora")) : ids.flatMap((stageId) => (mundo.pesquisasPorEtapa.get(stageId) ?? []).map((id, i) => ({ id, stageId, rotulo: `Aba ${i + 1}` }))),
        ),
      }
    : base;
  const a = Fastify();
  a.decorate("db", {} as Database);
  await a.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = IDS.usuario;
        request.userRole = "user" as never;
      });
    }),
  );
  await a.register(debriefingConfigRoutes, { criarStore: () => store, cachePerguntasMs: opts.cachePerguntasMs });
  await a.ready();
  return { a, store };
}

beforeEach(() => {
  mundo = mundoPadrao();
});

describe("PERF-001 — memoização das perguntas no GET", () => {
  it("com cache: o 2º GET não reabre a planilha", async () => {
    const { a, store } = await montar({ cachePerguntasMs: 60_000 });
    expect((await a.inject({ method: "GET", url: URL })).statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: URL })).statusCode).toBe(200);
    expect(store.perguntasDaEtapa).toHaveBeenCalledTimes(1);
  });

  it("sem a opção (como nos testes da 49.1): toda chamada lê a planilha", async () => {
    const { a, store } = await montar();
    await a.inject({ method: "GET", url: URL });
    await a.inject({ method: "GET", url: URL });
    expect(store.perguntasDaEtapa).toHaveBeenCalledTimes(2);
  });

  it("falha de leitura não é memoizada: segue 'falha' e a próxima chamada tenta de novo", async () => {
    mundo.perguntas.set(IDS.captacao, new Error("planilha fora"));
    const { a, store } = await montar({ cachePerguntasMs: 60_000 });
    const r1 = (await a.inject({ method: "GET", url: URL })).json();
    const r2 = (await a.inject({ method: "GET", url: URL })).json();
    for (const r of [r1, r2]) {
      expect(r.perguntasDisponiveis.find((e: { stageId: string }) => e.stageId === IDS.captacao).status).toBe("falha");
    }
    expect(store.perguntasDaEtapa).toHaveBeenCalledTimes(2);
  });
});

describe("49.11 AC7 — pesquisas por etapa para o seletor da pesquisa de captação", () => {
  it("store com rótulo → GET devolve pesquisasPorEtapa com id e nome da aba", async () => {
    const { a } = await montar({ comRotulo: true });
    const r = (await a.inject({ method: "GET", url: URL })).json();
    expect(r.pesquisasPorEtapa[IDS.captacao]).toEqual([
      { id: IDS.pesquisaCaptacao, rotulo: "Aba 1" },
      { id: IDS.pesquisaAlunos, rotulo: "Aba 2" },
    ]);
  });
  it("falha ao listar → estado próprio `pesquisasPorEtapaFalha` (nunca 'sem pesquisa'), GET segue 200", async () => {
    const { a } = await montar({ comRotulo: "falha" });
    const r = await a.inject({ method: "GET", url: URL });
    expect(r.statusCode).toBe(200);
    expect(r.json().pesquisasPorEtapaFalha).toMatch(/não foi possível listar/);
    expect(r.json()).not.toHaveProperty("pesquisasPorEtapa");
  });
  it("store sem rótulo (forma da 49.1) → o campo não aparece", async () => {
    const { a } = await montar();
    expect((await a.inject({ method: "GET", url: URL })).json()).not.toHaveProperty("pesquisasPorEtapa");
  });
});
