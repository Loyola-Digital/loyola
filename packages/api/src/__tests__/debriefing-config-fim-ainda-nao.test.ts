/**
 * Story 49.14 — REQ-002 do gate (@po, AC2): reabertura/downsell ABERTOS com o
 * fim "ainda não aconteceu" (`houve: true`, abertura, `fim: null` + a resposta
 * explícita `fimReabertura`/`fimDownsell`). Só no modo em andamento; no
 * encerrado, 400 no PUT e CONFIG_INCOMPLETA no gate. Rota real (chamador do
 * zod e de `problemasDasDatasChave`) com o store em memória.
 */

import { beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import { aplicarGateDebriefing, DebriefingConfigError, problemasPapelXDatas, type DebriefingConfigRaw, type DebriefingConfigStore, type ValoresDaConfig } from "../services/debriefing-config.js";
import type { Database } from "../db/client.js";
import { IDS, contexto, mundoPadrao, storeEmMemoria, valoresCompletos, type Mundo } from "./fixtures/debriefing-config-store.js";

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

const DOWNSELL_ABERTO = { houve: true, abertura: "2026-10-20", fim: null };

describe("REQ-002 — PUT e gate", () => {
  it("em andamento: downsell aberto com o fim 'ainda não aconteceu' → 200; grava fim nulo e a resposta explícita; o GET devolve e o gate libera", async () => {
    const r = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpoEmAndamento({}, { aberturaCarrinho: "2026-10-10", fimCarrinho: "2026-10-15", downsell: DOWNSELL_ABERTO, aindaNaoAconteceu: ["fimDownsell"] }),
    });
    expect(r.statusCode, r.body).toBe(200);
    const gravado = store.gravar.mock.calls[0]![1] as ValoresDaConfig;
    expect(gravado).toMatchObject({ downsell: DOWNSELL_ABERTO, aindaNaoAconteceu: ["fimDownsell"] });
    const get = (await app.inject({ method: "GET", url: URL })).json();
    expect(get.config.datasChave).toMatchObject({ downsell: DOWNSELL_ABERTO, aindaNaoAconteceu: ["fimDownsell"] });
    expect(get.camposFaltantes).toEqual([]);
    expect(get.bloqueio).toBeNull();
  });

  it("(2) encerrado com a mesma resposta → 400 explicado; nada gravado", async () => {
    const r = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpoEmAndamento({ situacaoDoLancamento: "encerrado" }, { aberturaCarrinho: "2026-10-10", fimCarrinho: "2026-10-15", downsell: DOWNSELL_ABERTO, aindaNaoAconteceu: ["fimDownsell"] }),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erros).toEqual([
      expect.stringMatching(/aindaNaoAconteceu \(fimDownsell\) só vale com o lançamento em andamento/),
      "datasChave.downsell.fim é obrigatória quando houve downsell",
    ]);
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("em andamento: fim nulo SEM a resposta explícita, ou data E resposta, ou resposta sem houve → 400", async () => {
    const semResposta = await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({}, { downsell: DOWNSELL_ABERTO, aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho"] }) });
    expect(semResposta.statusCode).toBe(400);
    expect(semResposta.json().erros).toContain('datasChave.downsell.fim é obrigatória quando houve downsell (ou "fim ainda não aconteceu", com o lançamento em andamento)');
    const osDois = await app.inject({
      method: "PUT",
      url: URL,
      payload: corpoEmAndamento({}, { downsell: { houve: true, abertura: "2026-10-20", fim: "2026-10-25" }, aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "fimDownsell"] }),
    });
    expect(osDois.json().erros).toContain('datasChave.downsell.fim: responda a data OU "fim ainda não aconteceu", não os dois');
    const semHouve = await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({}, { downsell: { houve: false }, aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "fimDownsell"] }) });
    expect(semHouve.json().erros).toContain('datasChave.downsell: "fim ainda não aconteceu" exige houve = true com a abertura informada');
    const fase = await app.inject({ method: "PUT", url: URL, payload: corpoEmAndamento({}, { aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "downsell", "fimDownsell"] }) });
    expect(fase.json().erros).toContain('datasChave.downsell: "ainda não aconteceu" (a fase inteira) e "fim ainda não aconteceu" ao mesmo tempo — responda um dos dois');
    expect(store.gravar).not.toHaveBeenCalled();
  });

  it("papel × datas: etapa de downsell com o downsell aberto (fim 'ainda não aconteceu') satisfaz o papel", () => {
    expect(problemasPapelXDatas([{ stageId: "d", papel: "vendas-downsell" }], { reabertura: { houve: false }, downsell: DOWNSELL_ABERTO, situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["fimDownsell"] })).toEqual([]);
  });

  it("(2) gate: a linha gravada encerrada com o fim nulo dá CONFIG_INCOMPLETA; em andamento com a resposta, libera", () => {
    const ctx = contexto({ projectId: PG05.projectId, funnelId: PG05.funnelId, funnelName: "dgpg05-out-26", projectName: "DG & CPDF" });
    const v = valoresCompletos();
    const raw = (over: Partial<DebriefingConfigRaw>): DebriefingConfigRaw =>
      ({ ...ctx, ...v, aberturaCarrinho: "2026-10-10", fimCarrinho: "2026-10-15", downsell: DOWNSELL_ABERTO, validado: true, validadoEm: null, validadoPor: null, imposto: { valor: 0.1215, origem: "default" }, etapasComPesquisa: [], etapasForaDoFunil: [], comparacaoRemovida: false, ...over }) as DebriefingConfigRaw;
    try {
      aplicarGateDebriefing(ctx, raw({ situacaoDoLancamento: "encerrado", aindaNaoAconteceu: [] }));
      throw new Error("deveria bloquear");
    } catch (e) {
      expect(e).toBeInstanceOf(DebriefingConfigError);
      expect((e as DebriefingConfigError).erro).toBe("CONFIG_INCOMPLETA");
    }
    const c = aplicarGateDebriefing(ctx, raw({ situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["fimDownsell"] }));
    expect(c).toMatchObject({ situacaoDoLancamento: "em-andamento", datasChave: { downsell: DOWNSELL_ABERTO }, aindaNaoAconteceu: ["fimDownsell"] });
  });
});
