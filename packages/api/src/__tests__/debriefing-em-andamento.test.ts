/**
 * Story 49.12 — Debriefing em andamento (captação aberta): config, corte,
 * janela, lacuna do carrinho, comparação em D+N, sync da mídia e a prova do
 * encerrado intocado. Motores REAIS sobre a entrada sintética da 49.5 (a mesma
 * que os testes do render rotulam "PG02"), com o relógio e o fuso fixados.
 *
 * Cada regra nova aqui falha com o código de antes da 49.12 (registro das
 * mutações no Dev Agent Record da story).
 */

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aplicarGateDebriefing,
  problemasDasDatasChave,
  problemasPapelXDatas,
  type ContextoDaEtapa,
  type DebriefingConfig,
  type DebriefingConfigLancamento,
  type DebriefingConfigLancamentoEmAndamento,
  type DebriefingConfigLancamentoEncerrado,
  type DebriefingConfigRaw,
} from "../services/debriefing-config.js";
import {
  configDoMotor,
  computeDebriefingMoneyTime,
  type DebriefingMoneyTimeInput,
  type LeadInput,
  type MidiaCampanhaDiaInput,
  type VendaCruaInput,
} from "../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience, type RespostaInput } from "../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../services/debriefing-audience-loader.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { checarF10, checarF11, validateDebriefing } from "../services/debriefing-guards.js";
import {
  INDICADORES,
  AVISO_COMPARACAO_SEM_CORTE_EM_D_MAIS_N,
  CSS_DO_RESUMO_MACRO,
  TEXTO_INGRESSOS_POR_DIA_COM_CURVA,
  TEXTO_INGRESSOS_POR_DIA_SEM_CURVA,
} from "../services/debriefing-render.js";
import { escaparHtml, escaparJson } from "../services/launch-report-narrative.js";
import {
  contasAtrasadasNoCorte,
  gerarDebriefing,
  type DependenciasDaGeracao,
  type EstadoDoSyncDaConta,
  type PayloadSalvo,
  type RegistroDoDebriefing,
} from "../services/debriefing-generate.js";
import { DebriefingConfigError } from "../services/debriefing-config.js";
import { janelaDaGeracao } from "../services/debriefing-hygiene.js";
import {
  CAP,
  PESQ,
  PRIN,
  configSintetica,
  entradaAudienceSintetica,
  entradaMoneyTimeSintetica,
} from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FB = "20000000-0000-4000-8000-000000000002";
const S = "30000000-0000-4000-8000-000000000001";
const SB = "30000000-0000-4000-8000-000000000002";
const U = "40000000-0000-4000-8000-000000000001";
const PARAMS = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null } as const;

/** 22:30 de 21/04/2026 em Brasília = 01:30 UTC de 22/04: UTC e Brasília em DIAS diferentes. */
const AGORA_NA_VIRADA = new Date("2026-04-22T01:30:00.000Z");
/** 12:00 de 22/04/2026 em Brasília. */
const AGORA = new Date("2026-04-22T15:00:00.000Z");

// ---------------------------------------------------------------------------
// Entrada: a sintética + o que fica DEPOIS do corte (21/04) e uma venda do
// principal ANTES da abertura (o carrinho ainda não abriu)
// ---------------------------------------------------------------------------

function configEmAndamento(over: Partial<DebriefingConfigLancamentoEmAndamento> = {}): DebriefingConfigLancamentoEmAndamento {
  return {
    ...configSintetica(),
    stageId: S,
    situacaoDoLancamento: "em-andamento",
    datasChave: { inicioCaptacao: "2026-04-17", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null },
    aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
    ...over,
  };
}

const vendaExtra = (over: Partial<VendaCruaInput>): VendaCruaInput => ({
  planilhaId: "p-cap",
  linha: 900,
  idDaVendaCru: "EXTRA",
  produto: "Imersão",
  tipo: "ingresso",
  tipoClassificado: true,
  valorBrutoCru: "99,00",
  moeda: null,
  statusCru: "paid",
  emailCru: "depois@x.com",
  telefoneCru: null,
  dataVendaCru: "22/04/2026",
  utm: {},
  sellerName: null,
  ...over,
});

function entradaMt(config: DebriefingConfigLancamento): DebriefingMoneyTimeInput {
  const base = entradaMoneyTimeSintetica();
  const leads: LeadInput[] = [...base.leads, { emailCru: "depois@x.com", telefoneCru: null, dataCriacaoCru: "22/04/2026", utm: { source: "fb", medium: "paid" } }];
  const vendas: VendaCruaInput[] = [
    ...base.vendas,
    // captação DEPOIS do corte (22/04): fora de tudo na parcial
    vendaExtra({}),
    // principal ANTES do corte, com o carrinho "ainda não aconteceu": decisão 7 (sai e é listada)
    vendaExtra({ planilhaId: "p-prin", linha: 901, idDaVendaCru: "PRE", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000,00", emailCru: "c2@x.com", dataVendaCru: "20/04/2026" }),
  ];
  const midia: MidiaCampanhaDiaInput[] = [...base.midia];
  return { ...base, config: configDoMotor(config), leads, vendas, midia };
}

function entradaAu(mtIn: DebriefingMoneyTimeInput, janela: ReturnType<typeof janelaDaGeracao>) {
  const base = entradaAudienceSintetica(mtIn);
  const extra: RespostaInput = {
    pesquisaId: PESQ,
    linha: 99,
    linhaTemRespondente: true,
    emailCru: "depois@x.com",
    telefoneCru: null,
    dataRespostaCru: "22/04/2026",
    utm: {},
    utmContentCru: null,
    respostas: { faixa: "A", Sexo: "Feminino" },
  };
  return { ...base, janela, compradores: higienizarVendasDoDebriefing(mtIn), respondentes: [...base.respondentes, extra] };
}

function calcular(config: DebriefingConfigLancamento, geradoEm: Date | string): DebriefingPayload {
  const mtIn = entradaMt(config);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au = computeDebriefingAudience(entradaAu(mtIn, mt.janela));
  return montarPayloadDebriefing(mt, au, config, geradoEm);
}

interface Falsas extends DependenciasDaGeracao {
  chamadas: string[];
  gravados: RegistroDoDebriefing[];
  calculadas: DebriefingConfigLancamento[];
}

function deps(over: {
  config?: (stageId: string) => DebriefingConfig;
  etapasDaComparacao?: string[];
  salvoDaComparacao?: PayloadSalvo | null;
  sync?: EstadoDoSyncDaConta[];
  agora?: Date;
  substituiu?: boolean;
} = {}): Falsas {
  const chamadas: string[] = [];
  const gravados: RegistroDoDebriefing[] = [];
  const calculadas: DebriefingConfigLancamento[] = [];
  return {
    chamadas,
    gravados,
    calculadas,
    async resolverEtapa() {
      chamadas.push("etapa");
      return { stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG05", projectId: P, projectName: "DG" };
    },
    async carregarConfig(stageId) {
      chamadas.push(`config:${stageId}`);
      return over.config ? over.config(stageId) : configEmAndamento();
    },
    async etapasDeDebriefingDoFunil(funnelId) {
      chamadas.push(`etapasDebriefing:${funnelId}`);
      return over.etapasDaComparacao ?? [];
    },
    async ultimoPayloadSalvoDoFunil() {
      chamadas.push("salvo");
      return over.salvoDaComparacao ?? null;
    },
    async calcularPayload(c, geradoEm) {
      chamadas.push(`payload:${c.stageId}`);
      calculadas.push(c);
      return calcular(c, geradoEm);
    },
    async nomes() {
      chamadas.push("nomes");
      return { funis: { [F]: "PG05", [FB]: "PG04" }, etapas: { [CAP]: "Captação", [PRIN]: "Principal" } };
    },
    async gravar(r) {
      chamadas.push("gravar");
      gravados.push(r);
      return { id: "50000000-0000-4000-8000-000000000001", substituiuParcial: over.substituiu ?? false };
    },
    async estadoDoSyncDaMidia() {
      chamadas.push("sync");
      // padrão: a conta sincronizou no próprio instante da geração (depois do fim do dia de corte)
      return over.sync ?? [{ accountId: "act_1", nome: "Conta DG", adDaily: { lastSuccessAt: (over.agora ?? AGORA).toISOString() }, campaignDaily: null }];
    },
    agora: () => over.agora ?? AGORA,
  };
}

function esperar422(r: { status: number; body: Record<string, unknown> }, erro: string): void {
  expect(r.status).toBe(422);
  expect(r.body).toMatchObject({ erro, detalhe: expect.stringMatching(/\S/), acao: expect.stringMatching(/\S/) });
}

const htmlDe = (d: Falsas) => d.gravados[0]!.html;
const kpiDe = (html: string, rotulo: string) => html.split(`<div class="lbl">${rotulo}</div>`)[1]!.split('<div class="kpi">')[0]!;
const secaoDe = (html: string, titulo: string) => html.split(`data-secao="${titulo}"`)[1]!.split("</section>")[0]!;
const constD = (html: string) => JSON.parse(html.split("const D=")[1]!.split(";\n")[0]!) as { graficos: Record<string, { marcos?: { rotulo: string }[] }> };

// ---------------------------------------------------------------------------
// AC1 / AC2 / AC9 — config: "ainda não aconteceu" só em andamento
// ---------------------------------------------------------------------------

describe("AC1/AC2 — datas no modo em andamento ('ainda não aconteceu' ≠ 'não houve')", () => {
  const encerrado = {
    inicioCaptacao: "2026-04-17",
    aberturaCarrinho: "2026-05-11",
    fimCarrinho: "2026-06-30",
    reabertura: { houve: false as const },
    downsell: { houve: false as const },
  };

  it("encerrado: a regra de sempre — sem data é obrigatória, e 'ainda não aconteceu' é recusado", () => {
    expect(problemasDasDatasChave(encerrado)).toEqual([]);
    expect(problemasDasDatasChave({ ...encerrado, situacaoDoLancamento: "encerrado" })).toEqual([]);
    expect(problemasDasDatasChave({ ...encerrado, aberturaCarrinho: null, fimCarrinho: null })).toEqual([
      "datasChave.aberturaCarrinho é obrigatória",
      "datasChave.fimCarrinho é obrigatória",
    ]);
    const p = problemasDasDatasChave({ ...encerrado, aberturaCarrinho: null, aindaNaoAconteceu: ["aberturaCarrinho"] });
    expect(p[0]).toMatch(/aindaNaoAconteceu \(aberturaCarrinho\) só vale com o lançamento em andamento/);
    expect(p).toContain("datasChave.aberturaCarrinho é obrigatória");
  });

  it("em andamento: início obrigatório; carrinho, reabertura e downsell aceitam 'ainda não aconteceu'", () => {
    const d = { inicioCaptacao: "2026-09-30", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null };
    expect(
      problemasDasDatasChave({ ...d, situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"] }),
    ).toEqual([]);
    // sem resposta nenhuma: cada fase é nomeada, com a terceira resposta possível
    const sem = problemasDasDatasChave({ ...d, situacaoDoLancamento: "em-andamento" });
    expect(sem).toHaveLength(4);
    expect(sem[0]).toMatch(/aberturaCarrinho é obrigatória \(ou "ainda não aconteceu"/);
    expect(sem[2]).toMatch(/reabertura exige resposta explícita: .* ou "ainda não aconteceu"/);
    // início continua obrigatório
    expect(problemasDasDatasChave({ ...d, inicioCaptacao: null, situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"] })).toEqual([
      "datasChave.inicioCaptacao é obrigatória",
    ]);
    // data E "ainda não aconteceu" ao mesmo tempo é contradição
    expect(
      problemasDasDatasChave({ ...d, aberturaCarrinho: "2026-10-20", situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"] }),
    ).toEqual(['datasChave.aberturaCarrinho: responda a data OU "ainda não aconteceu", não os dois']);
  });

  it("em andamento: a ordem vale entre as datas que existem", () => {
    const p = problemasDasDatasChave({
      situacaoDoLancamento: "em-andamento",
      inicioCaptacao: "2026-10-10",
      aberturaCarrinho: null,
      fimCarrinho: "2026-10-01",
      reabertura: { houve: false },
      downsell: null,
      aindaNaoAconteceu: ["aberturaCarrinho", "downsell"],
    });
    expect(p).toEqual([]); // início × fim não é par validado — a 49.1 valida início ≤ abertura ≤ fim
    const q = problemasDasDatasChave({
      situacaoDoLancamento: "em-andamento",
      inicioCaptacao: "2026-10-10",
      aberturaCarrinho: "2026-10-05",
      fimCarrinho: null,
      reabertura: { houve: false },
      downsell: { houve: false },
      aindaNaoAconteceu: ["fimCarrinho"],
    });
    expect(q).toEqual(["datasChave.inicioCaptacao (2026-10-10) é posterior a datasChave.aberturaCarrinho (2026-10-05)"]);
  });

  it("papel × datas: etapa de reabertura/downsell aceita 'ainda não aconteceu' só em andamento", () => {
    const etapas = [
      { stageId: "r", papel: "reabertura" as const },
      { stageId: "d", papel: "vendas-downsell" as const },
    ];
    expect(problemasPapelXDatas(etapas, { reabertura: null, downsell: null, situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["reabertura", "downsell"] })).toEqual([]);
    // encerrado com a lista: a lista não vale — a mensagem é a da 49.1
    expect(problemasPapelXDatas(etapas, { reabertura: null, downsell: null, aindaNaoAconteceu: ["reabertura", "downsell"] })).toEqual([
      "etapas[r].papel=reabertura exige datasChave.reabertura.houve = true",
      "etapas[d].papel=vendas-downsell exige datasChave.downsell.houve = true",
    ]);
    // em andamento sem resposta: a terceira resposta possível aparece
    expect(problemasPapelXDatas(etapas, { reabertura: null, downsell: { houve: false }, situacaoDoLancamento: "em-andamento" })).toEqual([
      'etapas[r].papel=reabertura exige datasChave.reabertura.houve = true (ou "ainda não aconteceu")',
      'etapas[d].papel=vendas-downsell exige datasChave.downsell.houve = true (ou "ainda não aconteceu")',
    ]);
    // encerrado sem a lista: a mensagem da 49.1, palavra por palavra
    expect(problemasPapelXDatas(etapas, { reabertura: { houve: false }, downsell: { houve: false } })).toEqual([
      "etapas[r].papel=reabertura exige datasChave.reabertura.houve = true",
      "etapas[d].papel=vendas-downsell exige datasChave.downsell.houve = true",
    ]);
  });

  it("gate: em andamento sai com a situação, as datas nulas e a lista; encerrado com data nula continua CONFIG_INCOMPLETA", () => {
    const s = configSintetica();
    const ctx: ContextoDaEtapa = { stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: s.funnelId, funnelName: "PG05", funnelType: "launch", projectId: s.projectId, projectName: "DG" };
    const raw = (v: Partial<DebriefingConfigRaw>): DebriefingConfigRaw => ({
      ...ctx,
      inicioCaptacao: "2026-09-30",
      aberturaCarrinho: null,
      fimCarrinho: null,
      reabertura: null,
      downsell: null,
      lancamentoComparacaoFunnelId: null,
      lancamentosComparacao: [],
      etapas: s.etapas,
      perguntasConfirmadas: s.perguntasConfirmadas,
      closerMediums: [],
      closerPorSellerName: false,
      ferramentasDeAtendimento: [],
      dimensaoDeCriativo: "nenhuma",
      validado: true,
      validadoEm: null,
      validadoPor: null,
      imposto: s.imposto,
      etapasComPesquisa: [CAP],
      etapasForaDoFunil: [],
      comparacaoRemovida: false,
      ...v,
    });
    const c = aplicarGateDebriefing(ctx, raw({ situacaoDoLancamento: "em-andamento", aindaNaoAconteceu: ["downsell", "aberturaCarrinho", "reabertura", "fimCarrinho"] }));
    expect(c).toMatchObject({
      tipoDeFunil: "launch",
      situacaoDoLancamento: "em-andamento",
      datasChave: { inicioCaptacao: "2026-09-30", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null },
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
    });
    expect(() => aplicarGateDebriefing(ctx, raw({ situacaoDoLancamento: "encerrado" }))).toThrow(DebriefingConfigError);
    try {
      aplicarGateDebriefing(ctx, raw({}));
    } catch (e) {
      expect((e as DebriefingConfigError).erro).toBe("CONFIG_INCOMPLETA");
    }
  });

  it("AC9 — F10 aceita 'ainda não aconteceu' só em andamento e continua bloqueando o encerrado incompleto", () => {
    const parcial = calcular({ ...configEmAndamento(), corte: "2026-04-21" }, AGORA);
    expect(checarF10(parcial).status).toBe("passed");
    const contraditoria = structuredClone(parcial) as DebriefingPayload & { config: DebriefingConfigLancamentoEmAndamento };
    contraditoria.config.aindaNaoAconteceu = ["fimCarrinho", "reabertura", "downsell"]; // abertura sem data e sem resposta
    expect(checarF10(contraditoria)).toMatchObject({ status: "failed" });
    const encerradoIncompleto = structuredClone(calcular(configSintetica(), AGORA)) as unknown as { config: { datasChave: { aberturaCarrinho: string | null } } };
    encerradoIncompleto.config.datasChave.aberturaCarrinho = null;
    expect(checarF10(encerradoIncompleto as unknown as DebriefingPayload)).toMatchObject({ status: "failed" });
  });
});

// ---------------------------------------------------------------------------
// AC3 — corte = ontem em Brasília (relógio E fuso fixados)
// ---------------------------------------------------------------------------

describe.each(["UTC", "America/Sao_Paulo"])("AC3 — corte = ontem em Brasília, com TZ=%s", (tz) => {
  const antes = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (antes === undefined) delete process.env.TZ;
    else process.env.TZ = antes;
  });

  it("às 22:30 de 21/04 em Brasília (01:30 UTC de 22/04) o corte é 20/04 — D+3, gravado no payload com a situação", async () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === "UTC" ? 0 : 180); // o fuso está mesmo fixado
    const d = deps({ agora: AGORA_NA_VIRADA });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    expect(d.calculadas[0]).toMatchObject({ situacaoDoLancamento: "em-andamento", corte: "2026-04-20" });
    const p = d.gravados[0]!.payload;
    expect(p.situacao).toEqual({
      modo: "parcial",
      corte: "2026-04-20",
      dMaisN: 3,
      janela: { inicio: "2026-04-17", fim: "2026-04-20", motivoDoFim: "corte do lançamento em andamento" },
      carrinhoAberto: false,
      aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
      // Story 49.14 (AC2): o estado de cada fase no corte
      fases: {
        carrinho: { estado: "nao-comecou", abertura: null, fim: null },
        reabertura: { estado: "nao-comecou", abertura: null, fim: null },
        downsell: { estado: "nao-comecou", abertura: null, fim: null },
      },
      todasAsFasesConcluidas: false,
    });
    expect(p.geradoEm).toBe(AGORA_NA_VIRADA.toISOString());
  });

  it("às 00:30 de 22/04 em Brasília (03:30 UTC) o corte já é 21/04 — D+4", async () => {
    const d = deps({ agora: new Date("2026-04-22T03:30:00.000Z") });
    expect((await gerarDebriefing(d, PARAMS)).status).toBe(200);
    expect(d.gravados[0]!.payload.situacao).toMatchObject({ modo: "parcial", corte: "2026-04-21", dMaisN: 4 });
  });

  it("captação que começa hoje (ou depois) → 422 SEM_DIA_FECHADO, que diz quando gerar; nada calculado nem gravado", async () => {
    const d = deps({ agora: AGORA_NA_VIRADA, config: () => configEmAndamento({ datasChave: { inicioCaptacao: "2026-04-21", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null } }) });
    const r = await gerarDebriefing(d, PARAMS);
    esperar422(r, "SEM_DIA_FECHADO");
    expect(String((r.body as Record<string, unknown>).detalhe)).toMatch(/não há dia fechado/);
    expect(String((r.body as Record<string, unknown>).acao)).toMatch(/Gerar a partir de 22\/04\/26/);
    expect(d.chamadas).toEqual(["etapa", `config:${S}`]);
  });
});

// ---------------------------------------------------------------------------
// AC4 — carrinho já aberto: fora desta story (422 até a 49.14)
// ---------------------------------------------------------------------------

describe("AC4 — carrinho já aberto até o corte (o 422 CARRINHO_JA_ABERTO saiu com a 49.14 AC1)", () => {
  const comAbertura = (aberturaCarrinho: string) =>
    configEmAndamento({
      datasChave: { inicioCaptacao: "2026-04-17", aberturaCarrinho, fimCarrinho: null, reabertura: null, downsell: null },
      aindaNaoAconteceu: ["fimCarrinho", "reabertura", "downsell"],
    });

  it("49.14 AC1: abertura informada e ≤ corte → gera a parcial com o carrinho aberto (sem o 422 da 49.12)", async () => {
    const d = deps({ config: () => comAbertura("2026-04-21") });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    expect(d.gravados[0]!.payload.situacao).toMatchObject({ carrinhoAberto: true, fases: { carrinho: { estado: "em-curso" } } });
  });

  it("abertura informada e DEPOIS do corte (data planejada) → gera a parcial com o carrinho fechado", async () => {
    const d = deps({ config: () => comAbertura("2026-05-11") });
    expect((await gerarDebriefing(d, PARAMS)).status).toBe(200);
    expect(d.gravados[0]!.payload.situacao).toMatchObject({ carrinhoAberto: false });
    // AC6: a data planejada (depois do corte) não vira linha "abre carrinho" nos gráficos
    expect(Object.values(constD(htmlDe(d)).graficos).flatMap((g) => g.marcos ?? [])).toEqual([]);
    expect(htmlDe(d)).toContain("<span>Abertura carrinho principal <b>11/05 · D+24</b></span>");
  });
});

// ---------------------------------------------------------------------------
// AC5 / AC6 / AC7 — janela parcial, lacuna do carrinho, documento parcial
// ---------------------------------------------------------------------------

describe("AC5 — janela do início da captação até o corte, para mídia, vendas, leads e pesquisa", () => {
  const p = calcular({ ...configEmAndamento(), corte: "2026-04-21" }, AGORA);
  const encerrado = calcular(configSintetica(), AGORA);

  it("a janela termina no corte, com o motivo do fim escrito", () => {
    expect(p.dinheiroTempo.janela).toMatchObject({ inicio: "2026-04-17", fim: "2026-04-21", fimPor: "corte" });
    expect(p.dinheiroTempo.janela.regra).toMatch(/corte do lançamento em andamento/);
    expect(p.publico.janela).toEqual(p.dinheiroTempo.janela);
  });

  it("nada depois do corte entra: mídia de 22/04, venda de 22/04, lead de 22/04 e resposta de 22/04", () => {
    expect(p.dinheiroTempo.midia.midiaDiariaPorEtapa.map((m) => m.dia)).toEqual(["2026-04-20", "2026-04-21"]);
    expect(encerrado.dinheiroTempo.midia.midiaDiariaPorEtapa.map((m) => m.dia)).toContain("2026-04-22");
    expect(p.dinheiroTempo.higiene.foraDoPeriodo.captacao.vendas).toBe(1);
    expect(p.dinheiroTempo.ingressosUnicos).toBe(encerrado.dinheiroTempo.ingressosUnicos - 1);
    // a resposta de 22/04 (depois@x.com) não chega à pesquisa
    expect(p.publico.pesquisa.linhasLidas).toBe(encerrado.publico.pesquisa.linhasLidas - 1);
    expect(p.publico.pesquisa.respondentes).toBe(encerrado.publico.pesquisa.respondentes - 1);
  });

  it("o lead criado depois do corte não dá data de lead à coorte (encerrado cortado em D+N, o caso da comparação)", () => {
    // venda do principal em 14/05 cujo ÚNICO lead é de 16/05: com o corte em 15/05 o lead some
    const cfg = { ...configSintetica(), corte: "2026-05-15" };
    const base = entradaMt(configSintetica());
    const entrada = {
      ...base,
      config: configDoMotor(cfg),
      vendas: [...base.vendas, vendaExtra({ planilhaId: "p-prin", linha: 950, idDaVendaCru: "TARDE", produto: "Mentoria", tipo: "principal", valorBrutoCru: "4.000,00", emailCru: "tarde@x.com", dataVendaCru: "14/05/2026" })],
      leads: [...base.leads, { emailCru: "tarde@x.com", telefoneCru: null, dataCriacaoCru: "16/05/2026", utm: {} }],
    };
    const cortado = computeDebriefingMoneyTime(entrada).auditoriaDeVendas.find((a) => a.txId === "TARDE")!;
    const inteiro = computeDebriefingMoneyTime({ ...entrada, config: configDoMotor(configSintetica()) }).auditoriaDeVendas.find((a) => a.txId === "TARDE")!;
    expect(inteiro).toMatchObject({ origemDaData: "lead-email", dataDoLead: "2026-05-16" });
    expect(cortado).toMatchObject({ origemDaData: "nenhuma", dataDoLead: null });
  });
});

describe("AC6 — o que depende do carrinho vira lacuna escrita, nunca zero", () => {
  const p = calcular({ ...configEmAndamento(), corte: "2026-04-21" }, AGORA);
  const TEXTO = "carrinho ainda não abriu — dados até 21/04, D+4";

  it("as métricas do principal/reabertura/downsell saem nulas com o motivo; as de captação são calculadas", () => {
    const m = p.dinheiroTempo;
    for (const metrica of [m.faturamentoPrincipal, m.conversaoIngressoPrincipal, m.roasTotalSemTmb, m.roasTotalSemTmb.semDownsell, m.apendiceReabertura.roasMarginal, m.referenciaCombinada.roas, ...m.tabela1.canais.map((c) => c.conversao), m.tabela1.fechamento.closer.conversao]) {
      expect(metrica.valor).toBeNull();
      expect(metrica.motivo).toBe(`CARRINHO_AINDA_NAO_ABRIU: ${TEXTO}`);
    }
    for (const l of [...p.publico.faixa.conversaoPorFaixa, ...p.publico.conversaoPorSegmento]) expect(l.ingressoPrincipal.valor).toBeNull();
    expect(m.captacao.faturamentoCaptacao.valor).toBeGreaterThan(0);
    expect(m.roasCaptacao.valor).not.toBeNull();
    // a venda do principal de 20/04 (antes da abertura que ainda não aconteceu) sai e é listada — decisão 7
    expect(m.vendasExcluidas.map((v) => v.txId)).toEqual(["PRE"]);
    expect(m.vendasPrincipal).toBe(0);
  });

  it("a lacuna CARRINHO_AINDA_NAO_ABRIU entra no payload com os itens, e a F11 a cobra", () => {
    const l = p.lacunas.find((x) => x.codigo === "CARRINHO_AINDA_NAO_ABRIU");
    expect(l).toMatchObject({ origem: ["dinheiroTempo", "publico"] });
    expect(l!.itens).toEqual([
      "faturamentoPrincipal",
      "conversaoIngressoPrincipal",
      "roasTotalSemTmb",
      "roasTotalSemTmb.semDownsell",
      "tabela1.canais[].conversao",
      "tabela1.fechamento.closer.conversao",
      "tabela1.fechamento.semCloser.conversao",
      "apendiceReabertura.roasMarginal",
      "referenciaCombinada.roas",
      "faixa.conversaoPorFaixa[].ingressoPrincipal",
      "conversaoPorSegmento[].ingressoPrincipal",
      "crossLaunch.retornoDaBasePrincipal",
      "crossLaunch.jaEmBaseAnterior.principal",
    ]);
    expect(checarF11(p).status).toBe("passed");
    const sem = structuredClone(p);
    sem.lacunas = sem.lacunas.filter((x) => x.codigo !== "CARRINHO_AINDA_NAO_ABRIU");
    expect(checarF11(sem)).toMatchObject({ status: "failed", detalhe: expect.stringMatching(/CARRINHO_AINDA_NAO_ABRIU ausente/) });
    // todas as guardas da 49.5 rodam e liberam (AC9)
    const g = validateDebriefing(p, {});
    expect(g.violacoes).toEqual([]);
    expect(g.invariantes).toHaveLength(15);
  });

  it("no documento: KPI do principal com a lacuna escrita (nunca 0), sem linhas de carrinho nos gráficos, seções de captação calculadas", async () => {
    const d = deps();
    expect((await gerarDebriefing(d, PARAMS)).status).toBe(200);
    const html = htmlDe(d);
    for (const rot of ["Vendas do Produto Principal", "Fat. Produto Principal s/ TMB", "Fat. Total s/ TMB", "ROAS Total s/ TMB (fat ÷ invest total)", "Conversão Ingresso → Principal", "Vendas Downsell"]) {
      const k = kpiDe(html, rot);
      expect(k).toContain("<b>—</b>");
      expect(k).toContain(`— = ${TEXTO}`);
      expect(k).not.toMatch(/<b>0<\/b>|R\$ 0,00/);
    }
    expect(secaoDe(html, "Vendas do Principal")).toContain(`<div class="warn" data-lacuna><b>Vendas do principal (coorte paga, conversão por público e auditoria)</b> — ${TEXTO}</div>`);
    expect(secaoDe(html, "Evolução Diária")).toContain(`<b>Vendas do principal por dia (coorte)</b> — ${TEXTO}`);
    expect(secaoDe(html, "Evolução Diária")).toContain(`<b>Apêndice — Reabertura</b> — ${TEXTO}`);
    expect(secaoDe(html, "Desempenho por Canal")).toContain(`<b>Vendas do principal por canal</b> — ${TEXTO}`);
    expect(secaoDe(html, "Conversão por Faixa")).toContain(`<b>Ingresso → Principal por faixa</b> — ${TEXTO}`);
    // AC6: nenhum marco vertical de carrinho/reabertura/downsell
    const graficos = constD(html).graficos;
    expect(Object.values(graficos).flatMap((g) => g.marcos ?? [])).toEqual([]);
    expect(graficos.cCanalVd).toBeUndefined();
    expect(graficos.cCoorte).toBeUndefined();
    // seções de captação calculadas
    expect(kpiDe(html, "Fat. Captação (ingresso + combo + bump) s/ TMB")).toMatch(/R\$ \d/);
    expect(graficos.cInvest).toBeDefined();
  });

  it("'ainda não aconteceu' ≠ 'não houve' no payload e no documento", async () => {
    const d = deps();
    await gerarDebriefing(d, PARAMS);
    const p2 = d.gravados[0]!.payload as DebriefingPayload & { config: DebriefingConfigLancamentoEmAndamento };
    expect(p2.config.datasChave.reabertura).toBeNull();
    expect(p2.config.aindaNaoAconteceu).toContain("reabertura");
    const strip = htmlDe(d).split('<div class="datestrip">')[1]!.split("</header>")[0]!;
    expect(strip).toContain("<span>Abertura carrinho principal: <b>ainda não aconteceu</b></span>");
    expect(strip).toContain("<span>Reabertura: <b>ainda não aconteceu</b></span>");
    expect(strip).not.toContain("não houve");
    const enc = calcular(configSintetica(), AGORA);
    expect(enc.config.datasChave.reabertura).toEqual({ houve: false });
  });
});

describe("AC7 — o documento diz que é parcial (título, campaignName e aviso no topo)", () => {
  it("título, <title>, campaignName e o aviso com o corte e o D+N", async () => {
    const d = deps();
    await gerarDebriefing(d, PARAMS);
    const r = d.gravados[0]!;
    expect(r.campaignName).toBe("Debriefing DG PG05 — PARCIAL — dados até 21/04 · D+4");
    expect(r.parcial).toBe(true);
    expect(r.html).toContain("<h1>Debriefing PARCIAL — <b>PG05</b> (DG) · dados até 21/04 · D+4</h1>");
    expect(r.html).toContain("<title>Debriefing PARCIAL — PG05 (DG) · dados até 21/04 · D+4</title>");
    const aviso = r.html.split('<div class="warn" data-parcial>')[1]!.split("</div>")[0]!;
    expect(aviso).toContain("Lançamento em andamento — documento PARCIAL.");
    expect(aviso).toContain("Dados até <b>21/04/26</b>");
    expect(aviso).toContain("<b>D+4</b>");
  });
});

// ---------------------------------------------------------------------------
// AC8 — comparação no mesmo D+N
// ---------------------------------------------------------------------------

describe("AC8 — comparação cortada no mesmo D+N", () => {
  // A comparação (PG04) é o encerrado sintético (início 17/04, abertura 11/05).
  // Corte do atual em 15/05 → D+28 → a comparação é cortada em 17/04 + 28 = 15/05,
  // já com o carrinho dela aberto (11/05): o principal existe só do lado dela.
  const AGORA_D28 = new Date("2026-05-16T15:00:00.000Z");
  const comComparacao = (stageId: string): DebriefingConfig =>
    stageId === SB
      ? { ...configSintetica(), stageId: SB, funnelId: FB }
      : configEmAndamento({ lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] });

  it("pela config: a comparação é recalculada até início + N dela, com a decisão 7 dentro da janela", async () => {
    const d = deps({ agora: AGORA_D28, config: comComparacao, etapasDaComparacao: [SB] });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    expect(d.calculadas.map((c) => [c.stageId, c.corte])).toEqual([
      [S, "2026-05-15"],
      [SB, "2026-05-15"],
    ]);
    const comp = d.gravados[0]!.comparacao!;
    expect(comp.payload.dinheiroTempo.janela).toMatchObject({ inicio: "2026-04-17", fim: "2026-05-15", fimPor: "corte" });
    expect(comp.payload.dinheiroTempo.janela.corte).toMatchObject({ motivo: "comparacao-no-mesmo-d-mais-n", dMaisN: 28, carrinhoAberto: true });
    // decisão 7 no lado da comparação: a venda de 05/05 (antes de 11/05) sai; 12, 13 e 14/05 entram; 15/06 fica fora do D+N
    expect(comp.payload.dinheiroTempo.vendasExcluidas.map((v) => v.dataBrt)).toEqual(["2026-05-05", "2026-04-20"]);
    expect(comp.payload.dinheiroTempo.vendasPrincipal).toBe(3);
  });

  it("métrica que existe de um lado e é lacuna do outro: Δ '—' com nota; o documento diz o corte e a data dele", async () => {
    const d = deps({ agora: AGORA_D28, config: comComparacao, etapasDaComparacao: [SB] });
    await gerarDebriefing(d, PARAMS);
    const html = htmlDe(d);
    const k = kpiDe(html, "Vendas do Produto Principal");
    expect(k).toContain('<div class="delta neu">—</div><div class="tnote" data-delta-lacuna>Δ — : sem o número de PG05 (carrinho ainda não abriu — dados até 15/05, D+28)</div>');
    const dif = secaoDe(html, "Diferenças de Valores e Taxas");
    expect(dif).toContain("<b>Comparação cortada no mesmo D+N:</b> PG04 até 15/05/26 (D+28 dele).");
    expect(dif).toContain("<li>Vendas do Produto Principal (carrinho ainda não abriu — dados até 15/05, D+28)</li>");
    expect(secaoDe(html, "Resumo Executivo")).toContain("PG04 até 15/05/26 (D+28 dele)");
    // e nunca um Δ inventado: o principal não tem seta nem %
    expect(k).not.toMatch(/class="delta (up|down)"/);
  });

  it("(c) diferencial: os números da comparação cortada = os mesmos motores rodados à parte na janela início → início + N", async () => {
    const d = deps({ agora: AGORA_D28, config: comComparacao, etapasDaComparacao: [SB] });
    await gerarDebriefing(d, PARAMS);
    const doGerador = d.gravados[0]!.comparacao!.payload;
    // À parte: a entrada da comparação filtrada até 15/05 (vendas, leads, mídia e
    // respostas), motores SEM corte, a config encerrada dela.
    const ate = (cel: string | null) => {
      if (!cel) return true;
      const [dd, mm, aa] = cel.split("/");
      return `${aa}-${mm}-${dd}` <= "2026-05-15";
    };
    const cfg = { ...configSintetica(), stageId: SB, funnelId: FB };
    const mtIn = entradaMt(cfg);
    const filtrada = {
      ...mtIn,
      vendas: mtIn.vendas.filter((v) => ate(v.dataVendaCru)),
      leads: mtIn.leads.filter((l) => ate(l.dataCriacaoCru)),
      midia: mtIn.midia.filter((m) => m.dia <= "2026-05-15"),
    };
    const mt = computeDebriefingMoneyTime(filtrada);
    const au0 = entradaAu(filtrada, mt.janela);
    const au = computeDebriefingAudience({ ...au0, respondentes: au0.respondentes.filter((r) => ate(r.dataRespostaCru)) });
    const aParte = montarPayloadDebriefing(mt, au, cfg, AGORA_D28);
    for (const ind of INDICADORES) {
      expect({ indicador: ind.rotulo, valor: ind.ler(doGerador).valor }).toEqual({ indicador: ind.rotulo, valor: ind.ler(aParte).valor });
    }
    expect(doGerador.dinheiroTempo.faturamentoPorEtapa).toEqual(aParte.dinheiroTempo.faturamentoPorEtapa);
    expect(doGerador.publico.faixa.distribuicao).toEqual(aParte.publico.faixa.distribuicao);
  });

  it("só payload salvo (sem config): a parcial sai SEM Δ, com aviso; a geração não é bloqueada", async () => {
    const salvo = { debriefingId: "60000000-0000-4000-8000-000000000001", salvoEm: "2026-06-01T15:00:00.000Z", payload: calcular({ ...configSintetica(), stageId: SB, funnelId: FB }, "2026-06-01T15:00:00.000Z") };
    const d = deps({
      agora: AGORA_D28,
      config: (sid) => {
        if (sid === SB) throw new DebriefingConfigError("COMBINACAO_NAO_VALIDADA", "sem config liberada", "validar");
        return comComparacao(sid);
      },
      etapasDaComparacao: [SB],
      salvoDaComparacao: salvo,
    });
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    const g = d.gravados[0]!;
    expect(g.comparacao).toBeNull();
    expect(g.campaignName).toBe("Debriefing DG PG05 — PARCIAL — dados até 15/05 · D+28");
    expect(g.html).toContain(`data-aviso="${AVISO_COMPARACAO_SEM_CORTE_EM_D_MAIS_N}"`);
    expect(g.html).toContain("totais fechados");
    expect(secaoDe(g.html, "Diferenças de Valores e Taxas")).toContain("Seção omitida — parcial sem Δ.");
    expect(g.html).not.toContain('class="twin"'); // nenhum KPI com dois lados
  });

  it("sem config e sem payload salvo: o 422 COMPARACAO_SEM_CONFIG de sempre", async () => {
    const d = deps({
      agora: AGORA_D28,
      config: (sid) => {
        if (sid === SB) throw new DebriefingConfigError("COMBINACAO_NAO_VALIDADA", "sem config liberada", "validar");
        return comComparacao(sid);
      },
      etapasDaComparacao: [SB],
    });
    esperar422(await gerarDebriefing(d, PARAMS), "COMPARACAO_SEM_CONFIG");
    expect(d.chamadas).not.toContain("gravar");
  });

  describe.each(["em-andamento", "encerrado"] as const)("comparação que está ela mesma em andamento → 422, nunca Δ (atual %s)", (modo) => {
    const atual = (): DebriefingConfig =>
      modo === "em-andamento"
        ? configEmAndamento({ lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] })
        : { ...configSintetica(), stageId: S, lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] };

    it("pela config dela (marcada em andamento)", async () => {
      const d = deps({ agora: AGORA_D28, config: (sid) => (sid === SB ? { ...configEmAndamento(), stageId: SB, funnelId: FB } : atual()), etapasDaComparacao: [SB] });
      const r = await gerarDebriefing(d, PARAMS);
      esperar422(r, "COMPARACAO_EM_ANDAMENTO");
      expect(String((r.body as Record<string, unknown>).detalhe)).toMatch(/ainda está em andamento: a config de debriefing dele está marcada "em andamento"/);
      expect(String((r.body as Record<string, unknown>).acao)).toMatch(/Tirar este lançamento da lista/);
      expect(d.chamadas).not.toContain("gravar");
    });

    it("pelo ÚLTIMO payload salvo dele, que é uma parcial (mesmo havendo um final mais antigo)", async () => {
      const parcialSalva = calcular({ ...configEmAndamento(), stageId: SB, funnelId: FB, corte: "2026-04-21" }, "2026-04-22T12:00:00.000Z");
      const d = deps({
        agora: AGORA_D28,
        config: (sid) => {
          if (sid === SB) throw new DebriefingConfigError("COMBINACAO_NAO_VALIDADA", "sem config liberada", "validar");
          return atual();
        },
        etapasDaComparacao: [SB],
        salvoDaComparacao: { debriefingId: "60000000-0000-4000-8000-000000000002", salvoEm: "2026-04-22T12:00:00.000Z", payload: parcialSalva },
      });
      const r = await gerarDebriefing(d, PARAMS);
      esperar422(r, "COMPARACAO_EM_ANDAMENTO");
      expect(String((r.body as Record<string, unknown>).detalhe)).toMatch(/último debriefing salvo dele é uma PARCIAL \(dados até 21\/04\/26, D\+4\)/);
      expect(d.chamadas).not.toContain("gravar");
    });
  });
});

// ---------------------------------------------------------------------------
// AC15 — mídia do dia de corte não sincronizada bloqueia (só em andamento)
// ---------------------------------------------------------------------------

describe("AC15 — mídia do dia de corte não sincronizada → 422", () => {
  const CORTE = "2026-04-21"; // fim do dia em Brasília = 2026-04-22T03:00Z
  const conta = (accountId: string, adOk: string | null, camp?: { lastRunAt: string | null; lastSuccessAt: string | null }): EstadoDoSyncDaConta => ({
    accountId,
    nome: `Conta ${accountId}`,
    adDaily: adOk === undefined ? null : { lastSuccessAt: adOk },
    campaignDaily: camp ?? null,
  });

  it("puro: a conta sincronizada depois do fim do dia de corte passa; a de antes (e a nunca sincronizada) fica atrás", () => {
    const r = contasAtrasadasNoCorte(
      [
        conta("act_ok", "2026-04-22T03:00:00.000Z"),
        conta("act_atras", "2026-04-22T02:59:00.000Z"),
        { accountId: "act_nunca", nome: null, adDaily: null, campaignDaily: null },
      ],
      CORTE,
    );
    expect(r).toEqual([
      { accountId: "act_atras", nome: "Conta act_atras", situacao: "sincronizada pela última vez em 21/04/26 às 23:59 (Brasília)" },
      { accountId: "act_nunca", nome: null, situacao: "nunca sincronizada" },
    ]);
  });

  it("puro: campaign-daily só pesa quando RODOU depois do corte e falhou; conta parada (sem campaign-daily recente) não bloqueia", () => {
    expect(contasAtrasadasNoCorte([conta("act_parada", "2026-04-22T03:10:00.000Z", { lastRunAt: "2026-04-10T07:00:00.000Z", lastSuccessAt: "2026-04-10T07:00:00.000Z" })], CORTE)).toEqual([]);
    const r = contasAtrasadasNoCorte([conta("act_falhou", "2026-04-22T03:10:00.000Z", { lastRunAt: "2026-04-22T03:11:00.000Z", lastSuccessAt: "2026-04-21T20:00:00.000Z" })], CORTE);
    expect(r).toHaveLength(1);
    expect(r[0]!.situacao).toMatch(/passo de mídia por campanha falhou na última rodada \(22\/04\/26 às 00:11 \(Brasília\)\); último sucesso em 21\/04\/26 às 17:00/);
  });

  it("uma conta atrás e outra em dia: 422 que nomeia SÓ a atrasada e até quando foi sincronizada; nada calculado nem gravado", async () => {
    const d = deps({ sync: [conta("act_1", "2026-04-22T03:05:00.000Z"), conta("act_2", "2026-04-21T18:00:00.000Z")] });
    const r = await gerarDebriefing(d, PARAMS);
    esperar422(r, "MIDIA_DO_CORTE_NAO_SINCRONIZADA");
    expect(String((r.body as Record<string, unknown>).detalhe)).toBe(
      "a mídia da Meta do dia de corte (21/04/26) ainda não foi sincronizada em 1 conta(s) do lançamento: act_2 (Conta act_2) — sincronizada pela última vez em 21/04/26 às 15:00 (Brasília)",
    );
    expect(String((r.body as Record<string, unknown>).acao)).toMatch(/Esperar o próximo sync .* gerar de novo/);
    expect(d.chamadas).toEqual(["etapa", `config:${S}`, "sync"]);
  });

  it("o encerrado não ganha a checagem (nem lê o estado do sync)", async () => {
    const d = deps({ config: () => ({ ...configSintetica(), stageId: S }), sync: [conta("act_2", null)] });
    expect((await gerarDebriefing(d, PARAMS)).status).toBe(200);
    expect(d.chamadas).not.toContain("sync");
    expect(d.gravados[0]!.parcial).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// AC13 (a) — encerrado intocado: SHA do HTML e do payload do PG02 sintético
// ---------------------------------------------------------------------------

describe("AC13 (a) — encerrado intocado (SHA medido em origin/main 4920adfb, antes da 49.12)", () => {
  // Caminho REAL do gerador para o encerrado, com o relógio fixado; a config
  // pelo gate (o que a linha gravada antes da 0168 vira: DEFAULT 'encerrado').
  // O payload difere SÓ nos dois campos que a story acrescenta — removidos
  // antes do hash: `config.situacaoDoLancamento` e `situacao`.
  // Story 49.17 (AC10): o HTML ganha o bloco "Resumo macro" no topo (com a
  // regra de CSS e os dois gráficos da curva em `D`) e a única troca de texto
  // nas seções (a lacuna "Ingressos por dia" da seção 03); o payload ganha
  // `resumoMacro`, `dinheiroTempo.cac` e `dinheiroTempo.curvaAcumulada`. Tirados
  // os acréscimos (e a troca de texto desfeita), o SHA medido antes da 49.12
  // continua valendo — a prova de que o resto do documento não mudou.
  const SHA = {
    "edicao-unica": { html: "7a7bcbfe254c10b97b8936cc345e3c12d6b57ee86cf10c96ce9776b31901b2c2", payload: "e031c6a295f27f7586bc1b10d17939f09d3e5c3059251fcf27c75d5551aa8b03" },
    "comparacao-recalculada": { html: "318a26ea3167e7571a0a536fadaa60d623de5dfd6ee4f10ff0aa72b60858f068", payload: "9de3477076fae4b178da5c212b852c1cfea8fbaef916e2cef9e18ff5291b9da0" },
  } as const;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");

  function configPeloGate(stageId: string, funnelId: string, comparacao: string | null): DebriefingConfigLancamentoEncerrado {
    const s = configSintetica();
    const ctx: ContextoDaEtapa = { stageId, stageName: "Debriefing", stageType: "debriefing", funnelId, funnelName: "PG02", funnelType: "launch", projectId: s.projectId, projectName: "Expert" };
    return aplicarGateDebriefing(ctx, {
      ...ctx,
      inicioCaptacao: s.datasChave.inicioCaptacao,
      aberturaCarrinho: s.datasChave.aberturaCarrinho,
      fimCarrinho: s.datasChave.fimCarrinho,
      reabertura: s.datasChave.reabertura,
      downsell: s.datasChave.downsell,
      situacaoDoLancamento: "encerrado",
      aindaNaoAconteceu: [],
      lancamentoComparacaoFunnelId: comparacao,
      lancamentosComparacao: comparacao ? [comparacao] : [],
      pesquisaDeCaptacaoPorEtapa: {},
      etapas: s.etapas,
      perguntasConfirmadas: s.perguntasConfirmadas,
      closerMediums: s.closerMediums,
      closerPorSellerName: s.closerPorSellerName,
      ferramentasDeAtendimento: s.ferramentasDeAtendimento,
      dimensaoDeCriativo: s.dimensaoDeCriativo,
      validado: true,
      validadoEm: null,
      validadoPor: null,
      imposto: s.imposto,
      etapasComPesquisa: Object.keys(s.perguntasConfirmadas),
      etapasForaDoFunil: [],
      comparacaoRemovida: false,
      comparacoesRemovidas: [],
    }) as DebriefingConfigLancamentoEncerrado;
  }

  /** 49.17 — o HTML sem os acréscimos da story (o bloco do topo, o CSS, os gráficos da curva e a troca de texto da seção 03). */
  function semO4917(html: string): string {
    const ini = html.indexOf('<div class="resumo-macro" data-resumo-macro>');
    const fim = html.indexOf('<div class="nav">');
    expect(ini).toBeGreaterThan(-1);
    let out = html.slice(0, ini) + html.slice(fim);
    out = out.replace(`\n${CSS_DO_RESUMO_MACRO}`, "");
    out = out.split(escaparHtml(TEXTO_INGRESSOS_POR_DIA_COM_CURVA)).join(escaparHtml(TEXTO_INGRESSOS_POR_DIA_SEM_CURVA));
    const m = /<script>const D=(.*?);\n/s.exec(out)!;
    const D = JSON.parse(m[1]!) as { graficos: Record<string, unknown> };
    delete D.graficos.cCurvaCompradores;
    delete D.graficos.cCurvaFaturamento;
    return out.replace(m[1]!, escaparJson(D));
  }

  /** A entrada sintética SEM os extras desta suíte (a mesma do script medido em origin/main). */
  function calcularOriginal(config: DebriefingConfigLancamento, geradoEm: Date) {
    const mtIn = { ...entradaMoneyTimeSintetica(), config: configDoMotor(config) };
    const mt = computeDebriefingMoneyTime(mtIn);
    const au = computeDebriefingAudience({ ...entradaAudienceSintetica(mtIn), compradores: higienizarVendasDoDebriefing(mtIn), janela: mt.janela });
    return montarPayloadDebriefing(mt, au, config, geradoEm);
  }

  it.each([
    ["edicao-unica", null],
    ["comparacao-recalculada", FB],
  ] as const)("%s: HTML com o MESMO SHA; payload idêntico descontados os campos novos", async (caso, comparacao) => {
    const gravados: RegistroDoDebriefing[] = [];
    const d: DependenciasDaGeracao = {
      resolverEtapa: async () => ({ stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert" }),
      carregarConfig: async (sid) => (sid === SB ? configPeloGate(SB, FB, null) : configPeloGate(S, F, comparacao)),
      etapasDeDebriefingDoFunil: async () => [SB],
      ultimoPayloadSalvoDoFunil: async () => null,
      calcularPayload: async (c, g) => calcularOriginal(c, g),
      nomes: async () => ({ funis: { [F]: "PG02", [FB]: "PG01" }, etapas: { [CAP]: "Captação", [PRIN]: "Principal" } }),
      gravar: async (r) => {
        gravados.push(r);
        return { id: "60000000-0000-4000-8000-000000000001" };
      },
      estadoDoSyncDaMidia: async () => {
        throw new Error("o encerrado não lê o sync");
      },
      agora: () => new Date("2026-10-07T01:30:00.000Z"),
    };
    const r = await gerarDebriefing(d, { ...PARAMS });
    expect(r.status).toBe(200);
    const g = gravados[0]!;
    expect(sha(g.html)).not.toBe(SHA[caso].html);
    expect(sha(semO4917(g.html))).toBe(SHA[caso].html);
    const p = structuredClone(g.payload) as DebriefingPayload & { config: { situacaoDoLancamento?: string } };
    expect(p.situacao).toEqual({ modo: "final" });
    expect(p.config.situacaoDoLancamento).toBe("encerrado");
    delete p.situacao;
    delete p.config.situacaoDoLancamento;
    expect(p.resumoMacro).toBeDefined();
    delete p.resumoMacro;
    delete p.dinheiroTempo.cac;
    delete p.dinheiroTempo.curvaAcumulada;
    expect(sha(JSON.stringify(p))).toBe(SHA[caso].payload);
    expect(g.parcial).toBeUndefined();
    expect(g.campaignName).toBe(comparacao ? "Debriefing Expert PG02 × PG01 — 17/04 a 30/06" : "Debriefing Expert PG02 — 17/04 a 30/06");
  });
});
