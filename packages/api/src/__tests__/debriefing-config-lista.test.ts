/**
 * Story 49.11 — config do debriefing com a LISTA de lançamentos de comparação
 * (AC1–AC6) e a pesquisa de captação por etapa (R6-7).
 *
 * Três camadas: funções puras; rotas com o store em memória (o que se confere
 * é o CORPO que chega ao store e o contrato); e o store Drizzle REAL sobre
 * PGlite com as migrations 0161 + 0162 de verdade (leitura compatível de linha
 * antiga e das duas versões da API na mesma linha). Nada toca o `.env`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pg-proxy";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import * as schema from "../db/schema.js";
import type { Database } from "../db/client.js";
import debriefingConfigRoutes from "../routes/debriefing-config.js";
import {
  MAX_LANCAMENTOS_COMPARACAO,
  avisosDebriefing,
  comparacaoDoCorpo,
  criarDebriefingConfigStore,
  listaDeComparacaoDaLinha,
  loadDebriefingConfig,
  loadDebriefingConfigRaw,
  premissaEfetiva,
  premissaMudou,
  problemasDaPesquisaDeCaptacao,
  problemasDoCorpoLancamento,
  type DebriefingConfigLancamento,
  type DebriefingConfigRaw,
  type DebriefingConfigStore,
} from "../services/debriefing-config.js";
import { META_TAX_RATE } from "../utils/meta-tax.js";
import { IDS, contexto, linha, mundoPadrao, storeEmMemoria, valoresCompletos, type Mundo } from "./fixtures/debriefing-config-store.js";

const C1 = IDS.funilComparacao;
const C2 = IDS.funilComparacao2;
const C3 = IDS.funilComparacao3;
const ORFA = IDS.funilDeOutroProjeto;
const db = {} as Database; // camada em memória: nunca usado

/** Valores na forma NOVA (lista + principal coerentes). */
function comLista(lista: string[], over: Parameters<typeof valoresCompletos>[0] = {}) {
  return valoresCompletos({ lancamentoComparacaoFunnelId: lista[0] ?? null, lancamentosComparacao: lista, ...over });
}

// ------------------------------------------------------------------
// Funções puras
// ------------------------------------------------------------------

describe("AC2 — leitura compatível de uma linha (a coluna antiga manda na divergência)", () => {
  it("lista coerente → a lista; lista vazia + antiga → [antiga]; divergência → [antiga]; ambas vazias → []", () => {
    expect(listaDeComparacaoDaLinha([C1, C2, C3], C1)).toEqual([C1, C2, C3]);
    expect(listaDeComparacaoDaLinha([], C1)).toEqual([C1]); // linha de antes da 0162
    expect(listaDeComparacaoDaLinha([C2, C1], C1)).toEqual([C1]); // API antiga escreveu por último
    expect(listaDeComparacaoDaLinha([C1, C2], null)).toEqual([]); // API antiga limpou a comparação
    expect(listaDeComparacaoDaLinha([], null)).toEqual([]);
  });
});

describe("AC3 (c) — corpo: campo antigo, lista ou os dois coerentes", () => {
  it("só o antigo → [id]; só a lista → a lista; os dois iguais → ok; divergentes → erro; null/[]/omitido → sem comparação", () => {
    expect(comparacaoDoCorpo(C1, undefined)).toEqual({ lista: [C1], peloCampoAntigo: true });
    expect(comparacaoDoCorpo(undefined, [C1, C2])).toEqual({ lista: [C1, C2], peloCampoAntigo: false });
    expect(comparacaoDoCorpo(C1, [C1, C2])).toEqual({ lista: [C1, C2], peloCampoAntigo: false });
    expect(comparacaoDoCorpo(null, [])).toEqual({ lista: [], peloCampoAntigo: false });
    expect(comparacaoDoCorpo(null, undefined)).toEqual({ lista: [], peloCampoAntigo: true });
    expect(comparacaoDoCorpo(undefined, undefined)).toEqual({ lista: [], peloCampoAntigo: true });
    expect(comparacaoDoCorpo(C2, [C1, C2])).toEqual({
      erro: `lancamentoComparacaoFunnelId (${C2}) diverge de lancamentosComparacao[0] (${C1}) — envie só a lista, ou o campo antigo igual ao 1º item da lista`,
    });
    expect(comparacaoDoCorpo(null, [C1])).toHaveProperty("erro");
    expect(comparacaoDoCorpo(C1, [])).toHaveProperty("erro");
  });
});

describe("AC3 (a) — mesmas regras do campo atual, POR ITEM, com a posição", () => {
  const ctxVal = {
    stageId: IDS.debriefing,
    funnelId: IDS.funil,
    etapasDoFunil: valoresCompletos().etapas.map((e) => e.stageId),
    funisDoProjeto: [IDS.funil, C1, C2, C3],
  };
  it("outro projeto, o próprio funil e repetição nomeiam o item e a posição; ordem válida passa", () => {
    expect(problemasDoCorpoLancamento(comLista([C1, C2, C3]), ctxVal)).toEqual([]);
    expect(problemasDoCorpoLancamento(comLista([C1, ORFA, IDS.funil, C1]), ctxVal)).toEqual([
      `lancamentosComparacao[1] (${ORFA}) não é um funil do mesmo projeto`,
      `lancamentosComparacao[2] (${IDS.funil}) é o próprio funil da etapa`,
      `lancamentosComparacao[3] (${C1}) repetido — igual a lancamentosComparacao[0]`,
    ]);
    expect(problemasDoCorpoLancamento(comLista([IDS.funil]), ctxVal)).toEqual([
      `lancamentosComparacao[0] (${IDS.funil}) é o próprio funil da etapa`,
    ]);
  });
  it(`no máximo ${MAX_LANCAMENTOS_COMPARACAO} itens`, () => {
    const muitos = Array.from({ length: MAX_LANCAMENTOS_COMPARACAO + 1 }, (_, i) => `20000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
    expect(problemasDoCorpoLancamento(comLista(muitos), { ...ctxVal, funisDoProjeto: [...ctxVal.funisDoProjeto, ...muitos] })).toEqual([
      `lancamentosComparacao tem ${MAX_LANCAMENTOS_COMPARACAO + 1} itens — no máximo ${MAX_LANCAMENTOS_COMPARACAO}`,
    ]);
  });
  it("pelo campo antigo: as mensagens da 49.1, palavra por palavra", () => {
    const antigo = { ...ctxVal, comparacaoPeloCampoAntigo: true };
    expect(problemasDoCorpoLancamento(comLista([ORFA]), antigo)).toEqual([`lancamentoComparacaoFunnelId (${ORFA}) não é um funil do mesmo projeto`]);
    expect(problemasDoCorpoLancamento(comLista([IDS.funil]), antigo)).toEqual(["lancamentoComparacaoFunnelId não pode ser o próprio funil da etapa"]);
  });
});

describe("AC4 — a lista ORDENADA é premissa; o órfão é filtrado por item", () => {
  it("adicionar, remover e reordenar derrubam; a mesma lista (inclusive pelo campo antigo) não", () => {
    const antes = comLista([C1, C2]);
    expect(premissaMudou(antes, comLista([C1, C2]))).toBe(false);
    expect(premissaMudou(antes, comLista([C2, C1]))).toBe(true); // troca a principal
    expect(premissaMudou(antes, comLista([C1]))).toBe(true);
    expect(premissaMudou(antes, comLista([C1, C2, C3]))).toBe(true);
    // forma da 49.1 ([antiga]) = forma nova de 1 item
    expect(premissaMudou(valoresCompletos({ lancamentoComparacaoFunnelId: C1 }), comLista([C1]))).toBe(false);
  });

  it("(e) a pesquisa de captação marcada é premissa; {} antigo = {} novo", () => {
    const antes = comLista([], { pesquisaDeCaptacaoPorEtapa: { [IDS.captacao]: IDS.pesquisaCaptacao } });
    expect(premissaMudou(antes, comLista([], { pesquisaDeCaptacaoPorEtapa: { [IDS.captacao]: IDS.pesquisaAlunos } }))).toBe(true);
    expect(premissaMudou(antes, comLista([]))).toBe(true);
    expect(premissaMudou(valoresCompletos(), comLista([], { pesquisaDeCaptacaoPorEtapa: {} }))).toBe(false);
  });

  it("(c) premissaEfetiva tira os órfãos e mantém a ordem; nada a tirar → a mesma referência", () => {
    const funis = [IDS.funil, C1, C2];
    const v = comLista([ORFA, C2, C1]);
    expect(premissaEfetiva(v, funis)).toEqual(comLista([C2, C1]));
    expect(v.lancamentosComparacao).toEqual([ORFA, C2, C1]); // não muta
    const ok = comLista([C1, C2]);
    expect(premissaEfetiva(ok, funis)).toBe(ok);
  });
});

describe("AC5 — um aviso por item removido; principal removida nomeia a nova", () => {
  function raw(lista: string[], removidas: string[]): DebriefingConfigRaw {
    return {
      ...contexto(),
      ...comLista(lista),
      validado: true,
      validadoEm: null,
      validadoPor: null,
      imposto: { valor: META_TAX_RATE, origem: "default" },
      etapasComPesquisa: [IDS.captacao],
      etapasForaDoFunil: [],
      comparacaoRemovida: removidas.length > 0,
      comparacoesRemovidas: removidas,
    };
  }

  it("principal removida: o aviso diz qual passou a ser a principal", () => {
    expect(avisosDebriefing(raw([ORFA, C2, C3], [ORFA]))).toEqual([
      {
        codigo: "COMPARACAO_REMOVIDA",
        detalhe:
          `o funil de comparação principal (${ORFA}, posição 1 da lista) foi apagado ou não é mais do projeto Expert Teste — ` +
          `a comparação principal passa a ser ${C2} (posição 2 da lista)`,
        acao: "Tirar este lançamento da lista de comparação (ou trocá-lo por outro) na configuração do debriefing para tirar este aviso",
      },
    ]);
  });

  it("item que não é a principal: sai da série; a principal continua", () => {
    const [aviso] = avisosDebriefing(raw([C1, ORFA], [ORFA]));
    expect(aviso!.detalhe).toBe(
      `o funil de comparação ${ORFA} (posição 2 da lista) foi apagado ou não é mais do projeto Expert Teste — ` +
        `ele sai da série histórica; a comparação principal continua ${C1}`,
    );
  });

  it("todos removidos: um aviso POR ITEM, e cada um diz que vira edição única", () => {
    const avisos = avisosDebriefing(raw([ORFA, C3], [ORFA, C3]));
    expect(avisos.map((a) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA", "COMPARACAO_REMOVIDA"]);
    expect(avisos[0]!.detalhe).toContain(`(${ORFA}, posição 1 da lista)`);
    expect(avisos[1]!.detalhe).toContain(`${C3} (posição 2 da lista)`);
    for (const a of avisos) expect(a.detalhe).toContain("não resta nenhum lançamento de comparação: o debriefing será gerado como edição única");
  });
});

describe("R6-7 — a pesquisa marcada é uma pesquisa DAQUELA etapa do lançamento", () => {
  const pesquisas = [
    { id: IDS.pesquisaCaptacao, stageId: IDS.captacao },
    { id: IDS.pesquisaAlunos, stageId: IDS.captacao },
  ];
  const etapas = valoresCompletos().etapas.map((e) => e.stageId);
  it("ok; etapa fora do lançamento, etapa sem pesquisa e pesquisa de outra etapa → problema nomeando a etapa", () => {
    expect(problemasDaPesquisaDeCaptacao({ [IDS.captacao]: IDS.pesquisaAlunos }, etapas, pesquisas)).toEqual([]);
    expect(
      problemasDaPesquisaDeCaptacao(
        { [IDS.reabertura]: IDS.pesquisaCaptacao, [IDS.principal]: IDS.pesquisaCaptacao },
        etapas,
        pesquisas,
      ),
    ).toEqual([
      `pesquisaDeCaptacaoPorEtapa[${IDS.reabertura}] não é uma das etapas do lançamento`,
      `pesquisaDeCaptacaoPorEtapa[${IDS.principal}]: a etapa não tem pesquisa`,
    ]);
    expect(
      problemasDaPesquisaDeCaptacao({ [IDS.captacao]: IDS.pesquisaCaptacao }, etapas, [{ id: IDS.pesquisaCaptacao, stageId: IDS.vendasCaptacao }, { id: IDS.pesquisaAlunos, stageId: IDS.captacao }]),
    ).toEqual([`pesquisaDeCaptacaoPorEtapa[${IDS.captacao}] = ${IDS.pesquisaCaptacao} não é uma pesquisa desta etapa`]);
  });
});

// ------------------------------------------------------------------
// Rotas + store em memória
// ------------------------------------------------------------------

const URL = `/api/projects/${IDS.projeto}/funnels/${IDS.funil}/stages/${IDS.debriefing}/debriefing/config`;

describe("rotas (store em memória) — PUT/GET com a lista", () => {
  let mundo: Mundo;
  let store: ReturnType<typeof storeEmMemoria>;
  let app: FastifyInstance;

  beforeEach(async () => {
    mundo = mundoPadrao();
    mundo.funisPorProjeto.set(IDS.projeto, [IDS.funil, C1, C2, C3]);
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
  }, 30_000); // o default de 10 s estoura com a máquina carregada (Fastify sobe a cada teste)

  /** Corpo do PUT; `over` substitui/acrescenta chaves (as da 49.11 incluídas). */
  function corpo(over: Record<string, unknown> = {}): Record<string, unknown> {
    const v = valoresCompletos();
    return {
      datasChave: {
        inicioCaptacao: v.inicioCaptacao,
        aberturaCarrinho: v.aberturaCarrinho,
        fimCarrinho: v.fimCarrinho,
        reabertura: v.reabertura,
        downsell: v.downsell,
      },
      etapas: v.etapas,
      perguntasConfirmadas: v.perguntasConfirmadas,
      closerMediums: v.closerMediums,
      closerPorSellerName: v.closerPorSellerName,
      ferramentasDeAtendimento: v.ferramentasDeAtendimento,
      dimensaoDeCriativo: v.dimensaoDeCriativo,
      ...over,
    };
  }
  const put = (payload: Record<string, unknown>) => app.inject({ method: "PUT", url: URL, payload });
  async function put400(payload: Record<string, unknown>): Promise<string[]> {
    const res = await put(payload);
    expect(res.statusCode).toBe(400);
    expect(store.gravar).not.toHaveBeenCalled();
    return res.json().erros as string[];
  }
  const get = async () => (await app.inject({ method: "GET", url: URL })).json();
  async function contrato(): Promise<DebriefingConfigLancamento> {
    const c = await loadDebriefingConfig(db, IDS.debriefing, store as DebriefingConfigStore);
    if (c.tipoDeFunil !== "launch") throw new Error("esperava launch");
    return c;
  }
  function gravada(lista: string[], over: Parameters<typeof valoresCompletos>[0] = {}) {
    mundo.linhas.set(IDS.debriefing, linha(IDS.debriefing, comLista(lista, over), { validado: true, validadoPor: IDS.usuario }));
  }

  it("(b, d) lista: ordem preservada, as duas colunas coerentes no corpo gravado; GET e contrato com a lista e a principal", async () => {
    const res = await put(corpo({ lancamentosComparacao: [C2, C1, C3] }));
    expect(res.statusCode).toBe(200);
    expect(store.gravar.mock.calls[0]![1]).toMatchObject({ lancamentoComparacaoFunnelId: C2, lancamentosComparacao: [C2, C1, C3] });
    const g = await get();
    expect(g.config).toMatchObject({ lancamentoComparacaoFunnelId: C2, lancamentosComparacao: [C2, C1, C3], comparacoesRemovidas: [] });
    await app.inject({ method: "POST", url: `${URL}/validate` });
    expect(await contrato()).toMatchObject({ lancamentoComparacaoFunnelId: C2, lancamentosComparacao: [C2, C1, C3], pesquisaDeCaptacaoPorEtapa: {} });
  });

  it("(c) só o campo antigo: vale [id] — gravado como na 49.1 e lido como lista de 1", async () => {
    expect((await put(corpo({ lancamentoComparacaoFunnelId: C1 }))).statusCode).toBe(200);
    expect(store.gravar.mock.calls[0]![1]).not.toHaveProperty("lancamentosComparacao");
    expect((await get()).config).toMatchObject({ lancamentoComparacaoFunnelId: C1, lancamentosComparacao: [C1] });
  });

  it("(c) os dois divergentes → 400 (nunca presumir qual vale); coerentes → 200", async () => {
    expect(await put400(corpo({ lancamentoComparacaoFunnelId: C2, lancamentosComparacao: [C1, C2] }))).toEqual([
      `lancamentoComparacaoFunnelId (${C2}) diverge de lancamentosComparacao[0] (${C1}) — envie só a lista, ou o campo antigo igual ao 1º item da lista`,
    ]);
    expect((await put(corpo({ lancamentoComparacaoFunnelId: C1, lancamentosComparacao: [C1, C2] }))).statusCode).toBe(200);
  });

  it("(a) item de outro projeto, o próprio funil, repetido, > 10 e não-uuid → 400 nomeando item e posição", async () => {
    expect(await put400(corpo({ lancamentosComparacao: [C1, ORFA] }))).toEqual([`lancamentosComparacao[1] (${ORFA}) não é um funil do mesmo projeto`]);
    expect(await put400(corpo({ lancamentosComparacao: [IDS.funil] }))).toEqual([`lancamentosComparacao[0] (${IDS.funil}) é o próprio funil da etapa`]);
    expect(await put400(corpo({ lancamentosComparacao: [C1, C2, C1] }))).toEqual([`lancamentosComparacao[2] (${C1}) repetido — igual a lancamentosComparacao[0]`]);
    expect((await put400(corpo({ lancamentosComparacao: Array(11).fill(C1) }))).join("\n")).toContain("no máximo 10 lançamentos de comparação");
    expect((await put400(corpo({ lancamentosComparacao: [C1, "pg02"] }))).join("\n")).toContain("lancamentosComparacao.1");
  });

  it("(e) o corpo segue .strict(): a chave nova entra, nenhuma outra", async () => {
    expect((await put400(corpo({ lancamentosDeComparacao: [C1] }))).join("\n")).toMatch(/lancamentosDeComparacao/);
  });

  it("comparação opcional: [] e null são válidos e gravam sem comparação", async () => {
    expect((await put(corpo({ lancamentosComparacao: [] }))).statusCode).toBe(200);
    expect(store.gravar.mock.calls[0]![1]).toMatchObject({ lancamentoComparacaoFunnelId: null, lancamentosComparacao: [] });
    expect((await put(corpo({ lancamentoComparacaoFunnelId: null }))).statusCode).toBe(200);
  });

  it("AC4 — reordenar (trocar a principal) derruba validado; a mesma lista não", async () => {
    gravada([C1, C2]);
    expect((await put(corpo({ lancamentosComparacao: [C1, C2] }))).json()).toEqual({ ok: true, validacaoResetada: false });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(true);
    expect((await put(corpo({ lancamentosComparacao: [C2, C1] }))).json()).toEqual({ ok: true, validacaoResetada: true });
    expect(mundo.linhas.get(IDS.debriefing)?.validado).toBe(false);
  });

  it("AC4 (c) — limpar o órfão não derruba; trocar o órfão por OUTRO funil derruba", async () => {
    gravada([C1, ORFA]);
    expect((await put(corpo({ lancamentosComparacao: [C1] }))).json().validacaoResetada).toBe(false);
    gravada([C1, ORFA]);
    expect((await put(corpo({ lancamentosComparacao: [C1, C3] }))).json().validacaoResetada).toBe(true);
  });

  it("AC5 — item removido depois de validar: não bloqueia, não derruba; contrato com a efetiva; GET com a gravada + removidos", async () => {
    gravada([ORFA, C2]);
    const g = await get();
    expect(g.bloqueio).toBeNull();
    expect(g.config).toMatchObject({
      validado: true,
      lancamentoComparacaoFunnelId: ORFA, // a principal GRAVADA, como rastro
      lancamentosComparacao: [ORFA, C2],
      comparacaoRemovida: true,
      comparacoesRemovidas: [ORFA],
    });
    expect(g.avisos.map((a: { codigo: string }) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);
    const c = await contrato();
    expect(c).toMatchObject({ validado: true, lancamentoComparacaoFunnelId: C2, lancamentosComparacao: [C2] });
    expect(c.avisos[0]!.detalhe).toContain(`a comparação principal passa a ser ${C2}`);
  });

  it("AC5 (d) — todos removidos: edição única, um aviso por item", async () => {
    mundo.funisPorProjeto.set(IDS.projeto, [IDS.funil]);
    gravada([C1, C2]);
    const c = await contrato();
    expect(c).toMatchObject({ lancamentoComparacaoFunnelId: null, lancamentosComparacao: [], validado: true });
    expect(c.avisos).toHaveLength(2);
  });

  it("R6-7 — PUT grava a marca; GET e contrato a expõem; trocar a marca derruba validado", async () => {
    const marca = { [IDS.captacao]: IDS.pesquisaAlunos };
    expect((await put(corpo({ pesquisaDeCaptacaoPorEtapa: marca }))).statusCode).toBe(200);
    expect(store.gravar.mock.calls[0]![1].pesquisaDeCaptacaoPorEtapa).toEqual(marca);
    expect((await get()).config.pesquisaDeCaptacaoPorEtapa).toEqual(marca);
    await app.inject({ method: "POST", url: `${URL}/validate` });
    expect((await contrato()).pesquisaDeCaptacaoPorEtapa).toEqual(marca);
    expect((await put(corpo({ pesquisaDeCaptacaoPorEtapa: marca }))).json().validacaoResetada).toBe(false);
    expect((await put(corpo({ pesquisaDeCaptacaoPorEtapa: { [IDS.captacao]: IDS.pesquisaCaptacao } }))).json().validacaoResetada).toBe(true);
  });

  it("R6-7 — pesquisa de outra etapa, etapa fora do lançamento ou sem pesquisa → 400 nomeando a etapa", async () => {
    mundo.pesquisasPorEtapa.set(IDS.vendasCaptacao, ["60000000-0000-4000-8000-000000000003"]);
    expect(await put400(corpo({ pesquisaDeCaptacaoPorEtapa: { [IDS.captacao]: "60000000-0000-4000-8000-000000000003" } }))).toEqual([
      `pesquisaDeCaptacaoPorEtapa[${IDS.captacao}] = 60000000-0000-4000-8000-000000000003 não é uma pesquisa desta etapa`,
    ]);
    expect(await put400(corpo({ pesquisaDeCaptacaoPorEtapa: { [IDS.reabertura]: IDS.pesquisaCaptacao } }))).toEqual([
      `pesquisaDeCaptacaoPorEtapa[${IDS.reabertura}] não é uma das etapas do lançamento`,
    ]);
    expect(await put400(corpo({ pesquisaDeCaptacaoPorEtapa: { [IDS.principal]: IDS.pesquisaCaptacao } }))).toEqual([
      `pesquisaDeCaptacaoPorEtapa[${IDS.principal}]: a etapa não tem pesquisa`,
    ]);
  });
});

// ------------------------------------------------------------------
// Store REAL sobre PGlite — migrations 0161 + 0162 de verdade
// ------------------------------------------------------------------

const MIGRACOES = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FC = "20000000-0000-4000-8000-000000000002";
const FC2 = "20000000-0000-4000-8000-000000000004";
const D = "30000000-0000-4000-8000-000000000001";
const CAP = "30000000-0000-4000-8000-000000000002";
const PESQ = "60000000-0000-4000-8000-000000000001";
const U = "40000000-0000-4000-8000-000000000001";

const DDL = `
CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE projects (id uuid PRIMARY KEY, name varchar(100) NOT NULL);
CREATE TABLE funnels (
  id uuid PRIMARY KEY, name varchar(255) NOT NULL, type text NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE funnel_stages (
  id uuid PRIMARY KEY, name varchar(255) NOT NULL, stage_type varchar(20) NOT NULL,
  funnel_id uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE funnel_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funnel_id uuid NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES funnel_stages(id) ON DELETE CASCADE
);
CREATE TABLE expert_report_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  imposto_pct numeric(6, 4)
);
INSERT INTO users VALUES ('${U}', 'Fulano do Time');
INSERT INTO projects VALUES ('${P}', 'Expert A');
INSERT INTO funnels VALUES ('${F}', 'xx-pg09', 'launch', '${P}'), ('${FC}', 'xx-pg08', 'launch', '${P}'), ('${FC2}', 'xx-pg07', 'launch', '${P}');
INSERT INTO funnel_stages VALUES ('${D}', 'Debriefing', 'debriefing', '${F}', 9), ('${CAP}', 'Captação', 'event_capture', '${F}', 1);
INSERT INTO funnel_surveys (id, funnel_id, stage_id) VALUES ('${PESQ}', '${F}', '${CAP}');
`;

describe("store real (PGlite, 0161 + 0162) — leitura compatível e escrita coerente", () => {
  let pg: PGlite;
  let pdb: Database;
  let app: FastifyInstance;

  beforeAll(async () => {
    const comoString = (v: string) => v;
    pg = new PGlite({ parsers: { 1082: comoString, 1114: comoString, 1184: comoString, 1700: comoString } });
    await pg.exec(DDL);
    await pg.exec(readFileSync(join(MIGRACOES, "0161_debriefing_configs.sql"), "utf8"));
    await pg.exec(readFileSync(join(MIGRACOES, "0162_debriefing_lancamentos_comparacao.sql"), "utf8"));
    pdb = drizzle(
      async (sql, params) => {
        const r = await pg.query(sql, params as unknown[], { rowMode: "array" });
        return { rows: r.rows as unknown[] };
      },
      { schema },
    ) as unknown as Database;
    app = Fastify();
    app.decorate("db", pdb);
    await app.register(
      fp(async (f) => {
        f.addHook("onRequest", async (request) => {
          request.userId = U;
          request.userRole = "user";
        });
      }),
    );
    const storeReal = (d: Database): DebriefingConfigStore => ({
      ...criarDebriefingConfigStore(d),
      perguntasDaEtapa: async () => [{ key: "faixa", label: "Faixa" }],
    });
    await app.register(debriefingConfigRoutes, { criarStore: storeReal });
    await app.ready();
  }, 60_000);

  beforeEach(async () => {
    await pg.exec("DELETE FROM debriefing_configs;");
  });

  afterAll(async () => {
    await app?.close();
    await pg?.close();
  });

  const url = `/api/projects/${P}/funnels/${F}/stages/${D}/debriefing/config`;
  const corpo = (over: Record<string, unknown> = {}) => ({
    datasChave: {
      inicioCaptacao: "2026-04-17",
      aberturaCarrinho: "2026-05-12",
      fimCarrinho: "2026-05-16",
      reabertura: { houve: false },
      downsell: { houve: false },
    },
    etapas: [{ stageId: CAP, papel: "leads-captacao" }],
    perguntasConfirmadas: { [CAP]: { faixa: "faixa" } },
    closerMediums: [],
    closerPorSellerName: false,
    ferramentasDeAtendimento: [],
    dimensaoDeCriativo: "nenhuma",
    ...over,
  });
  const put = (payload: Record<string, unknown>) => app.inject({ method: "PUT", url, payload });
  const validar = () => app.inject({ method: "POST", url: `${url}/validate` });
  const colunas = async () =>
    (
      await pg.query<{ antiga: string | null; lista: string[]; marca: Record<string, string>; validado: boolean }>(
        `SELECT lancamento_comparacao_funnel_id AS antiga, lancamentos_comparacao AS lista,
                pesquisa_de_captacao_por_etapa AS marca, validado FROM debriefing_configs WHERE stage_id = $1`,
        [D],
      )
    ).rows[0];
  const listaLida = async () => (await loadDebriefingConfigRaw(pdb, D))?.config?.lancamentosComparacao;

  it("AC1 — 21 colunas; as novas são NOT NULL com default '[]' e '{}'", async () => {
    const cols = (
      await pg.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
        `SELECT column_name, is_nullable, column_default FROM information_schema.columns
          WHERE table_name = 'debriefing_configs' ORDER BY ordinal_position`,
      )
    ).rows;
    expect(cols).toHaveLength(21);
    expect(cols.find((c) => c.column_name === "lancamentos_comparacao")).toMatchObject({ is_nullable: "NO", column_default: "'[]'::jsonb" });
    expect(cols.find((c) => c.column_name === "pesquisa_de_captacao_por_etapa")).toMatchObject({ is_nullable: "NO", column_default: "'{}'::jsonb" });
    expect(cols.some((c) => c.column_name === "lancamento_comparacao_funnel_id")).toBe(true);
  });

  it("AC3 (d) — o PUT grava as DUAS colunas coerentes (lista, campo antigo e vazio)", async () => {
    await put(corpo({ lancamentosComparacao: [FC2, FC] }));
    expect(await colunas()).toMatchObject({ antiga: FC2, lista: [FC2, FC], marca: {} });
    await put(corpo({ lancamentoComparacaoFunnelId: FC }));
    expect(await colunas()).toMatchObject({ antiga: FC, lista: [FC] });
    await put(corpo({ lancamentosComparacao: [], pesquisaDeCaptacaoPorEtapa: { [CAP]: PESQ } }));
    expect(await colunas()).toMatchObject({ antiga: null, lista: [], marca: { [CAP]: PESQ } });
  });

  it("AC2 — os quatro casos de leitura sobre a linha REAL (duas versões da API na mesma linha)", async () => {
    await put(corpo());
    const gravar = (antiga: string | null, lista: string[]) =>
      pg.query(`UPDATE debriefing_configs SET lancamento_comparacao_funnel_id = $1, lancamentos_comparacao = $2::jsonb`, [
        antiga,
        JSON.stringify(lista),
      ]);
    await gravar(FC, [FC, FC2]);
    expect(await listaLida()).toEqual([FC, FC2]); // coerente → a lista
    await gravar(FC, []);
    expect(await listaLida()).toEqual([FC]); // linha de antes da 0162
    await gravar(FC2, [FC, FC2]);
    expect(await listaLida()).toEqual([FC2]); // divergência: vale a antiga
    await gravar(null, []);
    expect(await listaLida()).toEqual([]); // ambas vazias
  });

  it("AC2 — linha de antes da migration ([X] pela coluna antiga): o 1º PUT idêntico NÃO derruba validado (nem pelo campo antigo, nem pela lista)", async () => {
    await put(corpo({ lancamentoComparacaoFunnelId: FC }));
    await validar();
    // como a 0162 deixa uma linha da 49.1: só a coluna antiga, lista no default
    await pg.query(`UPDATE debriefing_configs SET lancamentos_comparacao = '[]'::jsonb, pesquisa_de_captacao_por_etapa = '{}'::jsonb`);
    expect((await put(corpo({ lancamentoComparacaoFunnelId: FC }))).json()).toEqual({ ok: true, validacaoResetada: false });
    await pg.query(`UPDATE debriefing_configs SET lancamentos_comparacao = '[]'::jsonb`);
    expect((await put(corpo({ lancamentosComparacao: [FC] }))).json()).toEqual({ ok: true, validacaoResetada: false });
    expect((await colunas())?.validado).toBe(true);
  });

  it("R8 — aba antiga grava só o campo antigo: a lista encolhe para [id] e validado cai (a perda fica visível)", async () => {
    await put(corpo({ lancamentosComparacao: [FC, FC2] }));
    await validar();
    expect((await put(corpo({ lancamentoComparacaoFunnelId: FC }))).json().validacaoResetada).toBe(true);
    expect(await colunas()).toMatchObject({ antiga: FC, lista: [FC], validado: false });
  });

  it("AC5 — funil da lista apagado: segue validada, contrato com a efetiva e um aviso", async () => {
    await put(corpo({ lancamentosComparacao: [FC2, FC] }));
    await validar();
    await pg.exec(`DELETE FROM funnels WHERE id = '${FC2}'`);
    try {
      const c = await loadDebriefingConfig(pdb, D);
      if (c.tipoDeFunil !== "launch") throw new Error("esperava launch");
      expect(c).toMatchObject({ validado: true, lancamentoComparacaoFunnelId: FC, lancamentosComparacao: [FC] });
      expect(c.avisos.map((a) => a.codigo)).toEqual(["COMPARACAO_REMOVIDA"]);
      expect(await colunas()).toMatchObject({ antiga: FC2, lista: [FC2, FC] }); // rastro no banco
    } finally {
      await pg.exec(`INSERT INTO funnels VALUES ('${FC2}', 'xx-pg07', 'launch', '${P}')`);
    }
  });
});
