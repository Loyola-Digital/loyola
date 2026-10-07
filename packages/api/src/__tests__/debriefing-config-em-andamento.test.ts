/**
 * Story 49.12 (AC1/AC2/AC11/AC12) — rotas da config com o lançamento EM
 * ANDAMENTO: o que o PUT aceita e grava, o que o GET devolve. Fastify real +
 * `inject`, store em memória (o que chega ao `gravar` é o que se confere).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import type { DebriefingConfigStore, ValoresDaConfig } from "../services/debriefing-config.js";
import type { Database } from "../db/client.js";
import { IDS, contexto, linha, mundoPadrao, storeEmMemoria, valoresCompletos, type Mundo } from "./fixtures/debriefing-config-store.js";

// O PG05 (DG & CPDF, dgpg05-out-26) está na lista liberada — o gate não pede `validado`.
const PG05 = { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "d36db817-4681-468c-8ea6-58d260d22f11" };
const URL = `/api/projects/${PG05.projectId}/funnels/${PG05.funnelId}/stages/${IDS.debriefing}/debriefing/config`;

let mundo: Mundo;
let store: ReturnType<typeof storeEmMemoria> & { parcialDaEtapa?: DebriefingConfigStore["parcialDaEtapa"] };
let app: FastifyInstance;

beforeEach(async () => {
  mundo = mundoPadrao(contexto({ projectId: PG05.projectId, funnelId: PG05.funnelId, funnelName: "dgpg05-out-26", projectName: "DG & CPDF" }));
  mundo.funisPorProjeto.set(PG05.projectId, [PG05.funnelId, IDS.funilComparacao]);
  store = storeEmMemoria(mundo);
  app = Fastify();
  app.decorate("db", {} as Database);
  await app.register(
    fp(async (f) => {
      f.addHook("onRequest", async (request) => {
        request.userId = IDS.usuario;
        request.userRole = "user";
      });
    }),
  );
  await app.register(debriefingConfigRoutes, { criarStore: () => store });
  await app.ready();
});

/** O PG05 de 07/10/2026: captação desde 30/09, carrinho ainda não abriu. */
function corpoEmAndamento(over: Record<string, unknown> = {}, datas: Record<string, unknown> = {}): Record<string, unknown> {
  const v = valoresCompletos();
  return {
    situacaoDoLancamento: "em-andamento",
    datasChave: {
      inicioCaptacao: "2026-09-30",
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: { houve: false },
      downsell: null,
      aindaNaoAconteceu: ["downsell", "fimCarrinho", "aberturaCarrinho"],
      ...datas,
    },
    lancamentoComparacaoFunnelId: null,
    etapas: v.etapas,
    perguntasConfirmadas: v.perguntasConfirmadas,
    closerMediums: v.closerMediums,
    closerPorSellerName: v.closerPorSellerName,
    ferramentasDeAtendimento: v.ferramentasDeAtendimento,
    dimensaoDeCriativo: v.dimensaoDeCriativo,
    ...over,
  };
}

describe("AC1/AC2 — PUT", () => {
  it("em andamento com o carrinho 'ainda não aconteceu' → 200; grava a situação, as datas nulas e as fases na ordem canônica", async () => {
    const r = await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento() });
    expect(r.statusCode, r.body).toBe(200);
    const gravado = store.gravar.mock.calls[0]![1] as ValoresDaConfig;
    expect(gravado).toMatchObject({
      situacaoDoLancamento: "em-andamento",
      inicioCaptacao: "2026-09-30",
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: { houve: false },
      downsell: null,
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "downsell"],
    });
  });

  it("encerrado: a regra de sempre — data nula é obrigatória (400 nomeando o campo), e nada é gravado", async () => {
    const r = await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({ situacaoDoLancamento: "encerrado" }, { aindaNaoAconteceu: [] }) });
    expect(r.statusCode).toBe(400);
    expect(r.json().erros).toEqual(
      expect.arrayContaining([
        "datasChave.aberturaCarrinho é obrigatória",
        "datasChave.fimCarrinho é obrigatória",
        "datasChave.downsell exige resposta explícita: { houve: false } ou { houve: true, abertura, fim }",
      ]),
    );
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("'ainda não aconteceu' sem a situação (corpo do painel anterior = encerrado) → 400 explicado", async () => {
    const semSituacao = corpoEmAndamento();
    delete semSituacao.situacaoDoLancamento;
    const r = await app.inject({ method: "PUT", url: URL, payload: semSituacao });
    expect(r.statusCode).toBe(400);
    expect(r.json().erros[0]).toMatch(/aindaNaoAconteceu \(aberturaCarrinho, fimCarrinho, downsell\) só vale com o lançamento em andamento/);
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("situação fora do vocabulário e fase desconhecida → 400 do zod", async () => {
    expect((await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({ situacaoDoLancamento: "pausado" }) })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({}, { aindaNaoAconteceu: ["inicioCaptacao"] }) })).statusCode).toBe(400);
  });

  it("a situação é premissa (R9-2): de encerrado para em andamento numa config validada → validação zerada", async () => {
    const v: ValoresDaConfig = { ...valoresCompletos(), inicioCaptacao: "2026-09-30", aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25" };
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, v, { validado: true, validadoEm: new Date(), validadoPor: IDS.usuario }));
    const mesmo = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpoEmAndamento({ situacaoDoLancamento: "encerrado" }, { aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25", reabertura: { houve: false }, downsell: v.downsell, aindaNaoAconteceu: [] }),
    });
    expect(mesmo.json()).toEqual({ ok: true, validacaoResetada: false });
    const mudou = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpoEmAndamento({}, { aberturaCarrinho: "2026-10-20", fimCarrinho: "2026-10-25", downsell: v.downsell, aindaNaoAconteceu: [] }),
    });
    expect(mudou.json()).toEqual({ ok: true, validacaoResetada: true });
  });
});

describe("AC1/AC2/AC11 — GET", () => {
  it("config salva antes da 49.12 é lida como encerrado, sem fase 'ainda não aconteceu'", async () => {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, valoresCompletos()));
    const r = (await app.inject({ method: "GET", url: URL })).json();
    expect(r.config.situacaoDoLancamento).toBe("encerrado");
    expect(r.config.datasChave.aindaNaoAconteceu).toEqual([]);
    expect(r).not.toHaveProperty("parcialAtual"); // store sem leitor de parcial (forma anterior)
  });

  it("PG05 em andamento: devolve a situação e as fases; o gate libera (nada faltando); `parcialAtual` quando o store sabe ler", async () => {
    await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento() });
    store.parcialDaEtapa = vi.fn(async () => ({ debriefingId: "70000000-0000-4000-8000-000000000001", geradaEm: "2026-10-07T12:00:00.000Z", corte: "2026-10-06", dMaisN: 6 }));
    const r = (await app.inject({ method: "GET", url: URL })).json();
    expect(r.config.situacaoDoLancamento).toBe("em-andamento");
    expect(r.config.datasChave).toEqual({
      inicioCaptacao: "2026-09-30",
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: { houve: false },
      downsell: null,
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "downsell"],
    });
    expect(r.camposFaltantes).toEqual([]);
    expect(r.bloqueio).toBeNull();
    expect(r.parcialAtual).toEqual({ debriefingId: "70000000-0000-4000-8000-000000000001", geradaEm: "2026-10-07T12:00:00.000Z", corte: "2026-10-06", dMaisN: 6 });
  });
});
