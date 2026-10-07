/**
 * Story 49.14 — Debriefing em andamento com o carrinho aberto (e com a
 * reabertura/downsell ainda por vir): estado por fase no corte, carrinho em
 * curso calculado até o corte e rotulado parcial, coorte incompleta, ROAS total
 * que diz o que aconteceu com o downsell, comparação no mesmo D+N com o
 * carrinho, todas as fases concluídas (R9-5) e o "ponto de virada" (AC9 b).
 *
 * Motores REAIS sobre a entrada sintética da 49.5 (a que os testes rotulam
 * "PG02": captação 17/04, carrinho 11/05 → 30/06), pelo orquestrador
 * (`gerarDebriefing`) com relógio e fuso fixados. Cada regra nova falha com o
 * código de antes da 49.14 (mutações no Dev Agent Record da story).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DebriefingConfig,
  DebriefingConfigLancamento,
  DebriefingConfigLancamentoEmAndamento,
  DebriefingConfigLancamentoEncerrado,
  EtapaDoLancamento,
} from "../services/debriefing-config.js";
import {
  configDoMotor,
  computeDebriefingMoneyTime,
  type DebriefingMoneyTimeInput,
  type LeadInput,
  type VendaCruaInput,
} from "../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience, type RespostaInput } from "../services/debriefing-audience-engine.js";
import { higienizarVendasDoDebriefing } from "../services/debriefing-audience-loader.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { checarF7, checarF8, checarF11, validateDebriefing } from "../services/debriefing-guards.js";
import { INDICADORES } from "../services/debriefing-render.js";
import { gerarDebriefing, type DependenciasDaGeracao, type RegistroDoDebriefing } from "../services/debriefing-generate.js";
import { estadoDaFase, fasesNoCorte, textoDaFaseNoCorte } from "../services/debriefing-hygiene.js";
import { CAP, PESQ, PRIN, configSintetica, entradaAudienceSintetica, entradaMoneyTimeSintetica } from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FB = "20000000-0000-4000-8000-000000000002";
const S = "30000000-0000-4000-8000-000000000001";
const SB = "30000000-0000-4000-8000-000000000002";
const U = "40000000-0000-4000-8000-000000000001";
const DSL = "stage-dsl";
const REAB = "stage-reab";
const PARAMS = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null } as const;

/** 12:00 de 16/05/2026 em Brasília → corte 15/05 = D+28 (carrinho aberto em 11/05: 5º dia). */
const AGORA_D28 = new Date("2026-05-16T15:00:00.000Z");
/** 22:30 de 15/05 em Brasília (01:30 UTC de 16/05): UTC e Brasília em DIAS diferentes → corte 14/05. */
const AGORA_NA_VIRADA = new Date("2026-05-16T01:30:00.000Z");

// ---------------------------------------------------------------------------
// Entrada: a sintética + etapas de downsell e reabertura (com uma venda cada,
// datada ANTES da abertura delas), e dados DEPOIS do fim do carrinho (01/07)
// ---------------------------------------------------------------------------

/** As etapas do lançamento: downsell e reabertura só quando a config diz que existem (o gate/F10 exigem). */
function etapasPara(d: { reabertura: unknown; downsell: unknown }): EtapaDoLancamento[] {
  const naoHouve = (r: unknown) => (r as { houve?: boolean } | null)?.houve === false;
  return [
    { stageId: CAP, papel: "vendas-captacao" },
    { stageId: PRIN, papel: "vendas-principal" },
    ...(naoHouve(d.downsell) ? [] : [{ stageId: DSL, papel: "vendas-downsell" as const }]),
    ...(naoHouve(d.reabertura) ? [] : [{ stageId: REAB, papel: "reabertura" as const }]),
  ];
}

const venda = (over: Partial<VendaCruaInput>): VendaCruaInput => ({
  planilhaId: "p-dsl",
  linha: 800,
  idDaVendaCru: "DSL-1",
  produto: "Downsell",
  tipo: "principal",
  tipoClassificado: true,
  valorBrutoCru: "500,00",
  moeda: null,
  statusCru: "paid",
  emailCru: "c2@x.com",
  telefoneCru: null,
  dataVendaCru: "14/05/2026",
  utm: {},
  sellerName: null,
  ...over,
});

/** A entrada do motor para a config dada — a mesma para o atual e a comparação, salvo `extras`. */
function entradaMt(config: DebriefingConfigLancamento, extras: { vendas?: VendaCruaInput[] } = {}): DebriefingMoneyTimeInput {
  const base = entradaMoneyTimeSintetica();
  const tem = (stageId: string) => config.etapas.some((e) => e.stageId === stageId);
  const leads: LeadInput[] = [
    ...base.leads,
    // lead DEPOIS do fim do carrinho (02/07): o final o lê — o ponto de virada também tem de ler (AC9 b)
    { emailCru: "c5@x.com", telefoneCru: null, dataCriacaoCru: "02/07/2026", utm: { source: "fb", medium: "paid" } },
  ];
  const vendas: VendaCruaInput[] = [
    ...base.vendas,
    // downsell e reabertura com venda em 14/05 (antes da abertura delas nos cenários de "não começou")
    ...(tem(DSL) ? [venda({})] : []),
    ...(tem(REAB) ? [venda({ planilhaId: "p-reab", linha: 801, idDaVendaCru: "REAB-1", produto: "Reabertura", emailCru: "c3@x.com", valorBrutoCru: "800,00" })] : []),
    // principal DEPOIS do fim do carrinho (01/07): fora de todo número no final e no ponto de virada
    venda({ planilhaId: "p-prin", linha: 802, idDaVendaCru: "TARDE", produto: "Mentoria", valorBrutoCru: "4.000,00", emailCru: "c4@x.com", dataVendaCru: "01/07/2026" }),
    ...(extras.vendas ?? []),
  ];
  return {
    ...base,
    config: configDoMotor(config),
    planilhas: [
      ...base.planilhas,
      ...(tem(DSL) ? [{ planilhaId: "p-dsl", stageId: DSL, nome: "dsl", plataforma: "sales", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: false }] : []),
      ...(tem(REAB) ? [{ planilhaId: "p-reab", stageId: REAB, nome: "reab", plataforma: "sales", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: false }] : []),
    ],
    vendas,
    leads,
    midia: [
      ...base.midia,
      // mídia DEPOIS do fim do carrinho (01/07): o final não a lê
      { stageId: PRIN, campaignId: "c-prin", campaignName: "lanc--vendas-principal--hot--cbo", dia: "2026-07-01", spendBruto: 70, impressoes: 2000, linkClicks: 30 },
    ],
  };
}

function calcular(config: DebriefingConfigLancamento, geradoEm: Date | string, extras: { vendas?: VendaCruaInput[] } = {}): DebriefingPayload {
  const mtIn = entradaMt(config, extras);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au0 = entradaAudienceSintetica(mtIn);
  const au = computeDebriefingAudience({ ...au0, janela: mt.janela, compradores: higienizarVendasDoDebriefing(mtIn), respondentes: [...au0.respondentes, RESPOSTA_DEPOIS_DO_FIM] });
  return montarPayloadDebriefing(mt, au, config, geradoEm);
}

/**
 * QA 49.14 TEST-001 — resposta da pesquisa DEPOIS do fim do carrinho (02/07): o
 * final a lê (a pesquisa não é cortada pela janela); o ponto de virada também
 * tem de ler (R9-5), e a parcial com o carrinho em curso não (49.12 AC5).
 */
const RESPOSTA_DEPOIS_DO_FIM: RespostaInput = {
  pesquisaId: PESQ,
  linha: 99,
  linhaTemRespondente: true,
  emailCru: "pesquisa-tarde@x.com",
  telefoneCru: null,
  dataRespostaCru: "02/07/2026",
  utm: {},
  utmContentCru: null,
  respostas: { faixa: "A", Sexo: "Feminino" },
};

type Datas = DebriefingConfigLancamentoEmAndamento["datasChave"];

/** Em andamento: cada `null` vira "ainda não aconteceu" (a forma que o gate entrega). */
function emAndamento(datas: Partial<Datas>, over: Partial<DebriefingConfigLancamentoEmAndamento> = {}): DebriefingConfigLancamentoEmAndamento {
  const d: Datas = { inicioCaptacao: "2026-04-17", aberturaCarrinho: "2026-05-11", fimCarrinho: null, reabertura: { houve: false }, downsell: { houve: false }, ...datas };
  const aindaNao = (["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"] as const).filter((k) => d[k] === null);
  return { ...configSintetica(), stageId: S, etapas: etapasPara(d), situacaoDoLancamento: "em-andamento", datasChave: d, aindaNaoAconteceu: [...aindaNao], ...over };
}

/** O encerrado (o relatório final) com as mesmas etapas. */
function encerrado(datas: Partial<DebriefingConfigLancamentoEncerrado["datasChave"]> = {}, over: Partial<DebriefingConfigLancamentoEncerrado> = {}): DebriefingConfigLancamentoEncerrado {
  const s = configSintetica();
  const d = { ...s.datasChave, ...datas };
  return { ...s, stageId: S, etapas: etapasPara(d), datasChave: d, ...over };
}

interface Falsas extends DependenciasDaGeracao {
  gravados: RegistroDoDebriefing[];
  calculadas: DebriefingConfigLancamento[];
}

function deps(over: { config?: (stageId: string) => DebriefingConfig; agora?: Date; extrasDoAtual?: VendaCruaInput[] } = {}): Falsas {
  const gravados: RegistroDoDebriefing[] = [];
  const calculadas: DebriefingConfigLancamento[] = [];
  const agora = over.agora ?? AGORA_D28;
  return {
    gravados,
    calculadas,
    resolverEtapa: async () => ({ stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG05", projectId: P, projectName: "DG" }),
    carregarConfig: async (sid) => (over.config ? over.config(sid) : emAndamento({})),
    etapasDeDebriefingDoFunil: async () => [SB],
    ultimoPayloadSalvoDoFunil: async () => null,
    calcularPayload: async (c, g) => {
      calculadas.push(c);
      return calcular(c, g, c.stageId === S ? { vendas: over.extrasDoAtual } : {});
    },
    nomes: async () => ({ funis: { [F]: "PG05", [FB]: "PG04" }, etapas: { [CAP]: "Captação", [PRIN]: "Principal", [DSL]: "Downsell", [REAB]: "Reabertura" } }),
    gravar: async (r) => {
      gravados.push(r);
      return { id: "50000000-0000-4000-8000-000000000001", substituiuParcial: false };
    },
    estadoDoSyncDaMidia: async () => [{ accountId: "act_1", nome: "Conta", adDaily: { lastSuccessAt: agora.toISOString() }, campaignDaily: null }],
    agora: () => agora,
  };
}

const kpiDe = (html: string, rotulo: string) => html.split(`<div class="lbl">${rotulo}</div>`)[1]!.split('<div class="kpi">')[0]!;
const secaoDe = (html: string, titulo: string) => html.split(`data-secao="${titulo}"`)[1]!.split("</section>")[0]!;
const constD = (html: string) => JSON.parse(html.split("const D=")[1]!.split(";\n")[0]!) as { graficos: Record<string, { marcos?: { rotulo: string }[] }> };
const marcos = (html: string) => [...new Set(Object.values(constD(html).graficos).flatMap((g) => (g.marcos ?? []).map((m) => m.rotulo)))].sort();

async function gerar(d: Falsas) {
  const r = await gerarDebriefing(d, PARAMS);
  if (r.status !== 200) expect(r.body).toEqual({ status: 200 }); // mostra o corpo do erro
  return d.gravados[0]!;
}

// ---------------------------------------------------------------------------
// AC2 — o estado de cada fase no corte (com as fronteiras)
// ---------------------------------------------------------------------------

describe("AC2 — concluída / em curso / não começou, com as fronteiras", () => {
  it("abertura = corte → em curso; fim = corte → concluída; abertura no dia seguinte → não começou; 'ainda não aconteceu' → não começou", () => {
    expect(estadoDaFase("2026-05-15", null, "2026-05-15")).toBe("em-curso");
    expect(estadoDaFase("2026-05-15", "2026-05-20", "2026-05-15")).toBe("em-curso");
    expect(estadoDaFase("2026-05-11", "2026-05-15", "2026-05-15")).toBe("concluida");
    expect(estadoDaFase("2026-05-11", "2026-05-16", "2026-05-15")).toBe("em-curso");
    expect(estadoDaFase("2026-05-16", null, "2026-05-15")).toBe("nao-comecou");
    expect(estadoDaFase(null, null, "2026-05-15")).toBe("nao-comecou");
    expect(
      fasesNoCorte({ aberturaCarrinho: "2026-05-11", fimCarrinho: "2026-05-15", reabertura: { houve: false }, downsell: null }, "2026-05-15"),
    ).toEqual({
      carrinho: { estado: "concluida", abertura: "2026-05-11", fim: "2026-05-15" },
      reabertura: { estado: "nao-houve", abertura: null, fim: null },
      downsell: { estado: "nao-comecou", abertura: null, fim: null },
    });
  });

  it("o texto da fase no corte", () => {
    const f = (d: Parameters<typeof fasesNoCorte>[0], c: string) => textoDaFaseNoCorte(fasesNoCorte(d, c), c);
    const base = { aberturaCarrinho: "2026-05-11", fimCarrinho: "2026-05-20", reabertura: { houve: false as const }, downsell: { houve: false as const } };
    expect(f(base, "2026-05-13")).toBe("3º dia de carrinho");
    expect(f({ ...base, aberturaCarrinho: null }, "2026-05-13")).toBe("captação — carrinho ainda não abriu");
    expect(f({ ...base, downsell: { houve: true, abertura: "2026-05-21", fim: "2026-05-25" } }, "2026-05-22")).toBe("carrinho encerrado · 2º dia de downsell");
    expect(f({ ...base, reabertura: null }, "2026-05-22")).toBe("carrinho encerrado · reabertura ainda não começou");
    expect(f(base, "2026-05-22")).toBe("todas as fases encerradas");
  });

  it("o estado de cada fase vai ao payload (situação e janela) — carrinho em curso, reabertura e downsell não começaram", async () => {
    const d = deps({ config: () => emAndamento({ reabertura: null, downsell: { houve: true, abertura: "2026-05-20", fim: "2026-05-25" } }) });
    const g = await gerar(d);
    const esperado = {
      carrinho: { estado: "em-curso", abertura: "2026-05-11", fim: null },
      reabertura: { estado: "nao-comecou", abertura: null, fim: null },
      downsell: { estado: "nao-comecou", abertura: "2026-05-20", fim: "2026-05-25" },
    };
    expect(g.payload.situacao).toMatchObject({ modo: "parcial", corte: "2026-05-15", dMaisN: 28, carrinhoAberto: true, fases: esperado, todasAsFasesConcluidas: false });
    expect(g.payload.dinheiroTempo.janela.corte).toMatchObject({ fases: esperado, todasAsFasesConcluidas: false });
    expect(g.payload.dinheiroTempo.janela).toMatchObject({ inicio: "2026-04-17", fim: "2026-05-15", fimPor: "corte" });
  });
});

// ---------------------------------------------------------------------------
// AC1 + AC3 — carrinho em curso (sem o 422 da 49.12)
// ---------------------------------------------------------------------------

describe.each(["UTC", "America/Sao_Paulo"])("AC1/AC3 — carrinho em curso, calculado até o corte (TZ=%s)", (tz) => {
  const antes = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (antes === undefined) delete process.env.TZ;
    else process.env.TZ = antes;
  });

  it("às 22:30 de 15/05 em Brasília (01:30 UTC de 16/05): corte 14/05 (D+27), 4º dia de carrinho — a venda de 14/05 entra, a de 15/05 não existiria", async () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tz === "UTC" ? 0 : 180);
    const d = deps({ agora: AGORA_NA_VIRADA, extrasDoAtual: [venda({ planilhaId: "p-prin", linha: 900, idDaVendaCru: "D15", produto: "Mentoria", valorBrutoCru: "4.000,00", emailCru: "c1@x.com", dataVendaCru: "15/05/2026" })] });
    const g = await gerar(d);
    expect(d.calculadas[0]).toMatchObject({ situacaoDoLancamento: "em-andamento", corte: "2026-05-14" });
    expect(g.payload.situacao).toMatchObject({ corte: "2026-05-14", dMaisN: 27, fases: { carrinho: { estado: "em-curso" } } });
    // 12/05, 13/05 e 14/05 (TMB) entram; 15/05 (depois do corte) e 15/06 não; 05/05 sai pela decisão 7
    expect(g.payload.dinheiroTempo.vendasPrincipal).toBe(3);
    expect(g.payload.dinheiroTempo.auditoriaDeVendas.map((a) => a.dataBrt).sort()).toEqual(["2026-05-12", "2026-05-13", "2026-05-14"]);
    expect(g.html).toContain("parcial — carrinho aberto, dados até 14/05 (D+27)");
  });
});

describe("AC3 — carrinho em curso: números até o corte, rotulados parciais, coorte incompleta", () => {
  it("vendas, faturamento, conversão e ROAS do principal/total CALCULADOS (nunca lacuna) — e a decisão 7 continua", async () => {
    const g = await gerar(deps());
    const m = g.payload.dinheiroTempo;
    expect(m.vendasPrincipal).toBe(3);
    expect(m.faturamentoPrincipal.valor).toBe(8000); // 12/05 + 13/05 (a TMB de 14/05 conta a venda, não o valor)
    expect(m.conversaoIngressoPrincipal.valor).not.toBeNull();
    expect(m.roasTotalSemTmb.valor).not.toBeNull();
    expect(g.payload.lacunas.map((l) => l.codigo)).not.toContain("CARRINHO_AINDA_NAO_ABRIU");
    expect(m.vendasExcluidas.map((v) => [v.dataBrt, v.motivo])).toEqual([["2026-05-05", "ANTERIOR_A_ABERTURA"]]);
  });

  it("no documento: cada KPI do carrinho tem o rótulo 'parcial — carrinho aberto, dados até 15/05 (D+28)'", async () => {
    const g = await gerar(deps());
    for (const rot of ["Vendas do Produto Principal", "Fat. Produto Principal s/ TMB", "Fat. Total s/ TMB", "ROAS Total s/ TMB (fat ÷ invest total)", "Conversão Ingresso → Principal"]) {
      const k = kpiDe(g.html, rot);
      expect(k).toContain('<div class="tnote" data-parcial-da-fase>parcial — carrinho aberto, dados até 15/05 (D+28)</div>');
      expect(k).not.toContain("<b>—</b>");
    }
    // captação não é do carrinho: sem o rótulo
    expect(kpiDe(g.html, "Fat. Captação (ingresso + combo + bump) s/ TMB")).not.toContain("data-parcial-da-fase");
    const aviso = g.html.split('<div class="warn" data-parcial>')[1]!.split("</div>")[0]!;
    expect(aviso).toContain("<b>O carrinho está aberto (5º dia de carrinho):</b>");
    expect(aviso).toContain("a coorte está incompleta");
  });

  it("linha vertical 'abre carrinho' aparece; 'fecha carrinho' só com o fim informado ≤ corte (fronteira fim = corte)", async () => {
    expect(marcos((await gerar(deps())).html)).toEqual(["abre carrinho"]);
    // fim planejado DEPOIS do corte: não vira linha
    expect(marcos((await gerar(deps({ config: () => emAndamento({ fimCarrinho: "2026-05-20" }) }))).html)).toEqual(["abre carrinho"]);
    // fronteira: fim = corte → concluída, as duas linhas
    const fimNoCorte = await gerar(deps({ config: () => emAndamento({ fimCarrinho: "2026-05-15", downsell: null }) }));
    expect(fimNoCorte.payload.situacao).toMatchObject({ fases: { carrinho: { estado: "concluida" } } });
    expect(marcos(fimNoCorte.html)).toEqual(["abre carrinho", "fecha carrinho"]);
  });

  it("fronteira abertura = corte: 1º dia de carrinho, em curso, a linha 'abre carrinho' aparece", async () => {
    const g = await gerar(deps({ config: () => emAndamento({ aberturaCarrinho: "2026-05-15" }) }));
    expect(g.payload.situacao).toMatchObject({ carrinhoAberto: true, fases: { carrinho: { estado: "em-curso", abertura: "2026-05-15" } } });
    expect(marcos(g.html)).toEqual(["abre carrinho"]);
    expect(g.html).toContain("Fase em D+28: <b>1º dia de carrinho</b>");
    // as vendas do principal de 12–14/05 são anteriores à abertura: decisão 7
    expect(g.payload.dinheiroTempo.vendasPrincipal).toBe(0);
    expect(g.payload.dinheiroTempo.vendasExcluidas.map((v) => v.dataBrt).sort()).toEqual(["2026-05-05", "2026-05-12", "2026-05-13", "2026-05-14"]);
  });

  it("a coorte diz que está incompleta (payload, documento e lacuna) e a F7 continua fechando a conta", async () => {
    const g = await gerar(deps());
    const m = g.payload.dinheiroTempo;
    const texto = "coorte incompleta — vendas do principal até 15/05 (D+28); leads recentes ainda não tiveram tempo de comprar";
    expect(m.coorte.incompleta).toEqual({ ateDia: "2026-05-15", dMaisN: 28, texto });
    expect(m.coortePaga.incompleta).toEqual(m.coorte.incompleta);
    expect(checarF7(g.payload)).toMatchObject({ status: "passed", detalhe: expect.stringContaining(texto) });
    expect(m.coorte.naCoorte + m.coorte.basePreLancamento + m.coorte.foraDaCoorte.length + m.coorte.alemDaJanela.length).toBe(m.vendasPrincipal);
    // a F7 cobra a declaração
    const sem = structuredClone(g.payload);
    delete sem.dinheiroTempo.coorte.incompleta;
    expect(checarF7(sem)).toMatchObject({ status: "failed" });
    // lacuna nomeada, cobrada pela F11
    expect(g.payload.lacunas.find((l) => l.codigo === "COORTE_INCOMPLETA")).toMatchObject({ itens: ["coorte", "coortePaga"] });
    const semLacuna = structuredClone(g.payload);
    semLacuna.lacunas = semLacuna.lacunas.filter((l) => l.codigo !== "COORTE_INCOMPLETA");
    expect(checarF11(semLacuna)).toMatchObject({ status: "failed", detalhe: expect.stringMatching(/COORTE_INCOMPLETA ausente/) });
    expect(secaoDe(g.html, "Evolução Diária")).toContain(`<b data-coorte-incompleta>${texto}.</b>`);
  });
});

// ---------------------------------------------------------------------------
// AC4 — reabertura e downsell em curso / não começou; ROAS total explica o downsell
// ---------------------------------------------------------------------------

describe("AC4 — reabertura e downsell", () => {
  it("downsell que NÃO começou: fica FORA do ROAS total (dito por extenso), Vendas Downsell é lacuna escrita — nunca zero; a F8 fecha", async () => {
    const g = await gerar(deps({ config: () => emAndamento({ downsell: { houve: true, abertura: "2026-05-20", fim: "2026-05-25" } }) }));
    const m = g.payload.dinheiroTempo;
    // a venda de 14/05 da etapa de downsell existe nos dados, mas o downsell não começou: fora do numerador
    expect(m.faturamentoPorEtapa.downsell).toBe(500);
    expect(m.roasTotalSemTmb.valor).toBeCloseTo(m.roasTotalSemTmb.semDownsell.valor!, 10);
    expect(m.roasTotalSemTmb.numerador).toBeCloseTo(m.faturamentoPorEtapa.captacao + m.faturamentoPorEtapa.principal, 6);
    expect(m.roasTotalSemTmb.downsellNoCorte).toEqual({ estado: "nao-comecou", texto: "fora do ROAS total: downsell ainda não começou — dados até 15/05, D+28", faturamentoFora: 500 });
    expect(checarF8(g.payload).status).toBe("passed");
    const k = kpiDe(g.html, "Vendas Downsell");
    expect(k).toContain("<b>—</b>");
    expect(k).toContain("— = downsell ainda não começou — dados até 15/05, D+28");
    expect(kpiDe(g.html, "ROAS Total s/ TMB (fat ÷ invest total)")).toContain("fora do ROAS total: downsell ainda não começou — dados até 15/05, D+28 — o numerador é captação + principal");
    expect(secaoDe(g.html, "ROAS")).toContain(
      "<span data-downsell-fora>downsell FORA (fora do ROAS total: downsell ainda não começou — dados até 15/05, D+28); R$ 500,00 de venda(s) da etapa de downsell datada(s) antes do início dele estão no Fat. Total e fora deste numerador</span>",
    );
    expect(secaoDe(g.html, "ROAS")).not.toMatch(/downsell R\$ 0,00/);
    expect(g.payload.lacunas.find((l) => l.codigo === "DOWNSELL_AINDA_NAO_COMECOU")).toMatchObject({ itens: ["downsell.vendas", "downsell.faturamento", "roasTotalSemTmb (downsell fora do numerador)"] });
    expect(validateDebriefing(g.payload, {}).violacoes).toEqual([]);
  });

  it("MNT-001: a parcela do downsell que ficou fora do ROAS total é declarada no Fat. Total e no ROAS total — a conta fecha para quem lê", async () => {
    const g = await gerar(deps({ config: () => emAndamento({ downsell: { houve: true, abertura: "2026-05-20", fim: "2026-05-25" } }) }));
    const m = g.payload.dinheiroTempo;
    expect(m.roasTotalSemTmb.downsellNoCorte?.faturamentoFora).toBe(500);
    // a conta que o documento escreve fecha: (Fat. Total − parcela) ÷ investimento total = ROAS total
    expect((m.faturamentoTotal - 500) / m.roasTotalSemTmb.denominador).toBeCloseTo(m.roasTotalSemTmb.valor!, 10);
    const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
    const conta = `ROAS total = (Fat. Total ${brl(m.faturamentoTotal)} − R$ 500,00) ÷ investimento total ${brl(m.roasTotalSemTmb.denominador)}`;
    const fat = kpiDe(g.html, "Fat. Total s/ TMB");
    expect(fat).toContain("inclui R$ 500,00 de venda(s) da etapa de downsell datada(s) antes do início dele, que ficam FORA do ROAS total (o downsell ainda não começou)");
    expect(fat).toContain(conta);
    expect(kpiDe(g.html, "ROAS Total s/ TMB (fat ÷ invest total)")).toContain(conta);
    // sem venda da etapa de downsell na janela (corte 13/05, antes da venda de 14/05): nada a declarar — Fat. Total ÷ investimento já é o ROAS total
    const sem = await gerar(deps({ agora: new Date("2026-05-14T15:00:00.000Z"), config: () => emAndamento({ downsell: null }) }));
    expect(sem.payload.dinheiroTempo.roasTotalSemTmb.downsellNoCorte).toMatchObject({ estado: "nao-comecou", faturamentoFora: 0 });
    expect(kpiDe(sem.html, "Fat. Total s/ TMB")).not.toContain("FORA do ROAS total");
    expect(secaoDe(sem.html, "ROAS")).not.toContain("estão no Fat. Total");
  });

  it("downsell 'ainda não aconteceu' é o mesmo 'não começou'", async () => {
    const g = await gerar(deps({ config: () => emAndamento({ downsell: null }) }));
    expect(g.payload.dinheiroTempo.roasTotalSemTmb.downsellNoCorte?.estado).toBe("nao-comecou");
  });

  it("downsell EM CURSO: entra no ROAS total com os dados até o corte, marcado parcial", async () => {
    const g = await gerar(deps({ config: () => emAndamento({ fimCarrinho: "2026-05-13", downsell: { houve: true, abertura: "2026-05-14", fim: "2026-05-20" } }) }));
    const m = g.payload.dinheiroTempo;
    expect(g.payload.situacao).toMatchObject({ fases: { carrinho: { estado: "concluida" }, downsell: { estado: "em-curso" } } });
    expect(m.roasTotalSemTmb.numerador).toBeCloseTo(m.faturamentoPorEtapa.captacao + m.faturamentoPorEtapa.principal + m.faturamentoPorEtapa.downsell, 6);
    expect(m.roasTotalSemTmb.downsellNoCorte).toEqual({ estado: "em-curso", texto: "downsell parcial — downsell em curso, dados até 15/05 (D+28)" });
    expect(checarF8(g.payload).status).toBe("passed");
    expect(kpiDe(g.html, "Vendas Downsell")).toContain('data-parcial-da-fase>parcial — downsell em curso, dados até 15/05 (D+28)</div>');
    expect(g.html).toContain("Fase em D+28: <b>carrinho encerrado · 2º dia de downsell</b>");
    expect(g.payload.lacunas.map((l) => l.codigo)).not.toContain("DOWNSELL_AINDA_NAO_COMECOU");
    // carrinho concluído: a coorte não é incompleta
    expect(m.coorte.incompleta).toBeUndefined();
  });

  it("reabertura que NÃO começou: apêndice e referência combinada são lacuna escrita (nunca zero); em curso, parcial", async () => {
    const nao = await gerar(deps({ config: () => emAndamento({ reabertura: { houve: true, abertura: "2026-05-20", fim: "2026-05-22" } }) }));
    const m = nao.payload.dinheiroTempo;
    expect(m.apendiceReabertura.roasMarginal).toMatchObject({ valor: null, motivo: "REABERTURA_AINDA_NAO_COMECOU: reabertura ainda não começou — dados até 15/05, D+28" });
    expect(m.referenciaCombinada.roas.valor).toBeNull();
    expect(secaoDe(nao.html, "Evolução Diária")).toContain("<b>Apêndice — Reabertura</b> — reabertura ainda não começou — dados até 15/05, D+28");
    expect(nao.payload.lacunas.find((l) => l.codigo === "REABERTURA_AINDA_NAO_COMECOU")).toMatchObject({ itens: ["apendiceReabertura.roasMarginal", "referenciaCombinada.roas"] });
    expect(validateDebriefing(nao.payload, {}).violacoes).toEqual([]);

    const curso = await gerar(deps({ config: () => emAndamento({ reabertura: { houve: true, abertura: "2026-05-14", fim: "2026-05-22" } }) }));
    // em curso: calculada com os dados até o corte (a venda de 14/05 entra; sem mídia própria, o ROAS marginal é DIVISAO_POR_ZERO, não lacuna)
    expect(curso.payload.dinheiroTempo.apendiceReabertura).toMatchObject({ vendas: 1, faturamento: 800 });
    expect(curso.payload.dinheiroTempo.apendiceReabertura.roasMarginal.motivo ?? "").not.toMatch(/REABERTURA_AINDA_NAO_COMECOU/);
    expect(curso.payload.lacunas.map((l) => l.codigo)).not.toContain("REABERTURA_AINDA_NAO_COMECOU");
    expect(secaoDe(curso.html, "Evolução Diária")).toContain('<p class="tnote" data-parcial-da-fase>parcial — reabertura em curso, dados até 15/05 (D+28)</p>');
  });
});

// ---------------------------------------------------------------------------
// AC7 — todas as guardas, em qualquer combinação de estados
// ---------------------------------------------------------------------------

describe("AC7 — guardas em toda combinação de estados (F7, F8 e F11 fecham com os parciais)", () => {
  const extra = (abertura: string | null, fim: string | null) => (abertura === null ? null : { houve: true as const, abertura, fim: fim! });
  const casos: [string, Partial<Datas>][] = [
    ["carrinho não começou (data planejada)", { aberturaCarrinho: "2026-05-20", downsell: null }],
    ["carrinho em curso, downsell não começou", { downsell: extra("2026-05-20", "2026-05-25") }],
    ["carrinho em curso, reabertura e downsell 'ainda não aconteceu'", { reabertura: null, downsell: null }],
    ["carrinho concluído, downsell em curso, reabertura não começou", { fimCarrinho: "2026-05-13", downsell: extra("2026-05-14", "2026-05-20"), reabertura: extra("2026-05-21", "2026-05-22") }],
    ["carrinho concluído, reabertura em curso", { fimCarrinho: "2026-05-13", reabertura: extra("2026-05-14", "2026-05-22") }],
  ];
  it.each(casos)("%s", async (_n, datas) => {
    const g = await gerar(deps({ config: () => emAndamento(datas) }));
    const v = validateDebriefing(g.payload, {});
    expect(v.violacoes).toEqual([]);
    expect(v.invariantes.filter((i) => ["F7", "F8", "F11"].includes(i.codigo)).map((i) => i.status)).toEqual(["passed", "passed", "passed"]);
  });
});

// ---------------------------------------------------------------------------
// AC6 — todas as fases concluídas e ainda "em andamento" (R9-5)
// ---------------------------------------------------------------------------

describe("AC6 — todas as fases concluídas até o corte: a janela é a da regra 2A (R9-5)", () => {
  const AGORA_10_07 = new Date("2026-07-11T15:00:00.000Z"); // corte 10/07, 10 dias depois do fim do carrinho

  it("a janela termina no fim da regra 2A, não no corte; o documento continua parcial, com o corte e o fim da janela", async () => {
    const g = await gerar(deps({ agora: AGORA_10_07, config: () => emAndamento({ fimCarrinho: "2026-06-30" }) }));
    expect(g.payload.dinheiroTempo.janela).toMatchObject({ inicio: "2026-04-17", fim: "2026-06-30", fimPor: "fimCarrinho" });
    expect(g.payload.situacao).toMatchObject({
      modo: "parcial",
      corte: "2026-07-10",
      todasAsFasesConcluidas: true,
      janela: { inicio: "2026-04-17", fim: "2026-06-30", motivoDoFim: "fim da regra 2A — todas as fases concluídas até o corte (R9-5)" },
    });
    expect(g.parcial).toBe(true);
    expect(g.campaignName).toBe("Debriefing DG PG05 — PARCIAL — dados até 10/07 · D+84");
    const aviso = g.html.split('<div class="warn" data-parcial data-fases-concluidas>')[1]!.split("</div>")[0]!;
    expect(aviso).toContain("Corte em <b>10/07/26</b>");
    expect(aviso).toContain("a janela terminou em <b>30/06/26</b> (fim da regra 2A)");
    expect(aviso).toContain("Marque “encerrado”");
    expect(g.html).toContain("<span data-janela-terminou>Janela terminou em <b>30/06 · D+74</b> (fim da regra 2A)</span>");
    // mídia e venda de 01/07 (entre o fim e o corte) não entram
    expect(g.payload.dinheiroTempo.midia.midiaDiariaPorEtapa.map((x) => x.dia)).not.toContain("2026-07-01");
    expect(g.payload.dinheiroTempo.auditoriaDeVendas.map((a) => a.txId)).not.toContain("TARDE");
  });

  it("com downsell que houve, a janela vai até o fim dele (o maior da regra 2A)", async () => {
    const g = await gerar(deps({ agora: AGORA_10_07, config: () => emAndamento({ fimCarrinho: "2026-06-30", downsell: { houve: true, abertura: "2026-07-01", fim: "2026-07-05" } }) }));
    expect(g.payload.dinheiroTempo.janela).toMatchObject({ fim: "2026-07-05", fimPor: "downsell.fim" });
    expect(g.payload.situacao).toMatchObject({ todasAsFasesConcluidas: true });
  });

  it("uma fase ainda por vir (downsell 'ainda não aconteceu') → a janela volta a terminar no corte", async () => {
    const g = await gerar(deps({ agora: AGORA_10_07, config: () => emAndamento({ fimCarrinho: "2026-06-30", downsell: null }) }));
    expect(g.payload.dinheiroTempo.janela).toMatchObject({ fim: "2026-07-10", fimPor: "corte" });
    expect(g.payload.situacao).toMatchObject({ todasAsFasesConcluidas: false });
  });
});

// ---------------------------------------------------------------------------
// AC9 (b) — ponto de virada: o encerrado gerado "em andamento" = o final
// ---------------------------------------------------------------------------

describe("AC9 (b) — ponto de virada: PG02 gerado 'em andamento' com o corte no último dia da janela dá os números do final", () => {
  /** Tudo que é número no payload — sem a janela (o rótulo do corte) e sem a situação. */
  const numeros = (p: DebriefingPayload) => {
    const mt: Partial<DebriefingPayload["dinheiroTempo"]> = { ...p.dinheiroTempo };
    const pub: Partial<DebriefingPayload["publico"]> = { ...p.publico };
    delete mt.janela;
    delete pub.janela;
    return { dinheiroTempo: mt, publico: pub, lacunas: p.lacunas };
  };
  const valoresDosKpis = (html: string) => [...html.matchAll(/<div class="single"><b>([^<]*)<\/b>/g)].map((m) => m[1]);
  const semRotulos = (html: string) =>
    html
      .replace(/<div class="warn" data-parcial[^]*?<\/div>/, "")
      .replace(/<div class="tnote" data-parcial-da-fase>[^<]*<\/div>/g, "");

  it.each([
    ["sem reabertura nem downsell — corte 30/06 (o fim do carrinho)", {}, new Date("2026-07-01T15:00:00.000Z")],
    ["com downsell 01/07–05/07 — corte 05/07 (o fim do downsell)", { downsell: { houve: true as const, abertura: "2026-07-01", fim: "2026-07-05" } }, new Date("2026-07-06T15:00:00.000Z")],
    ["corte DEPOIS do fim (10/07): os mesmos números", {}, new Date("2026-07-11T15:00:00.000Z")],
  ])("%s", async (_n, extra, agora) => {
    const datas = { fimCarrinho: "2026-06-30", ...extra };
    const final = await gerar(deps({ agora, config: () => encerrado(datas) }));
    const parcial = await gerar(deps({ agora, config: () => emAndamento(datas) }));
    expect(final.payload.situacao).toEqual({ modo: "final" });
    expect(parcial.payload.situacao).toMatchObject({ modo: "parcial", todasAsFasesConcluidas: true });
    // toda métrica calculada: cada indicador do Resumo, e o payload inteiro menos a janela
    for (const ind of INDICADORES) {
      expect({ indicador: ind.rotulo, valor: ind.ler(parcial.payload).valor }).toEqual({ indicador: ind.rotulo, valor: ind.ler(final.payload).valor });
    }
    expect(numeros(parcial.payload)).toEqual(numeros(final.payload));
    expect(parcial.payload.dinheiroTempo.janela.fim).toBe(final.payload.dinheiroTempo.janela.fim);
    expect(parcial.payload.dinheiroTempo.janela.fimPor).toBe(final.payload.dinheiroTempo.janela.fimPor);
    // no documento: os mesmos valores em todo KPI; a diferença é só de rótulo
    expect(valoresDosKpis(semRotulos(parcial.html))).toEqual(valoresDosKpis(final.html));
    expect(secaoDe(semRotulos(parcial.html), "ROAS")).toEqual(secaoDe(final.html, "ROAS"));
    expect(secaoDe(semRotulos(parcial.html), "Vendas do Principal")).toEqual(secaoDe(final.html, "Vendas do Principal"));
    expect(marcos(parcial.html)).toEqual(marcos(final.html));
    // TEST-001: a resposta de 02/07 (depois do fim) entra nos dois — a pesquisa não é cortada no R9-5
    expect(parcial.payload.publico.pesquisa.respondentes).toBe(final.payload.publico.pesquisa.respondentes);
  });

  it("controle da pesquisa (TEST-001): a resposta de 02/07 conta no final e sai da parcial com o carrinho em curso", () => {
    const final = calcular(encerrado({ fimCarrinho: "2026-06-30" }), "2026-07-01T15:00:00.000Z");
    const emCurso = calcular({ ...emAndamento({}), corte: "2026-06-29" }, "2026-06-30T15:00:00.000Z");
    expect(final.publico.pesquisa.linhasLidas).toBe(emCurso.publico.pesquisa.linhasLidas + 1);
    expect(final.publico.pesquisa.respondentes).toBe(emCurso.publico.pesquisa.respondentes + 1);
  });

  it("controle: o lead de 02/07 (depois do corte) muda número se for cortado — a igualdade acima não é coincidência", () => {
    // o lead de c5 em 02/07 é DEPOIS do corte 30/06: o final o lê (nenhum corte de lead no encerrado)
    const final = calcular(encerrado({ fimCarrinho: "2026-06-30" }), "2026-07-01T15:00:00.000Z");
    const cortado = calcular({ ...encerrado({ fimCarrinho: "2026-06-30" }), corte: "2026-06-30" }, "2026-07-01T15:00:00.000Z");
    // cortar o lead no corte (o que a comparação em D+N faz) muda a coorte: c5 perde a data do lead
    const c5 = (p: DebriefingPayload) => p.dinheiroTempo.auditoriaDeVendas.find((a) => a.dataBrt === "2026-05-14")!;
    expect(c5(final)).toMatchObject({ origemDaData: "lead-email", dataDoLead: "2026-07-02" });
    expect(c5(cortado)).toMatchObject({ origemDaData: "nenhuma", dataDoLead: null });
    expect(numeros(cortado)).not.toEqual(numeros(final));
  });
});

// ---------------------------------------------------------------------------
// AC5 + AC9 (d) — comparação no mesmo D+N com o carrinho em curso dos dois lados
// ---------------------------------------------------------------------------

describe("AC5 / AC9 (d) — comparação no mesmo D+N com o carrinho em curso dos dois lados", () => {
  // PG04 (comparação) = o encerrado sintético; PG05 (atual) = em andamento, com UMA venda a mais do principal (13/05).
  const EXTRA = venda({ planilhaId: "p-prin", linha: 950, idDaVendaCru: "A-MAIS", produto: "Mentoria", valorBrutoCru: "4.000,00", emailCru: "c4@x.com", dataVendaCru: "13/05/2026" });
  const config = (sid: string): DebriefingConfig =>
    sid === SB
      ? { ...encerrado(), stageId: SB, funnelId: FB }
      : emAndamento({}, { lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] });

  it("o Δ do carrinho existe (os dois lados têm o número) e bate com os motores rodados à parte nas duas janelas", async () => {
    const d = deps({ config, extrasDoAtual: [EXTRA] });
    const g = await gerar(d);
    const comp = g.comparacao!.payload;
    expect(d.calculadas.map((c) => [c.stageId, c.corte])).toEqual([
      [S, "2026-05-15"],
      [SB, "2026-05-15"],
    ]);
    expect(comp.dinheiroTempo.janela.corte).toMatchObject({ dMaisN: 28, fases: { carrinho: { estado: "em-curso" } } });

    // À parte: cada lado com a entrada filtrada até 15/05 e os motores SEM corte (config encerrada com fim = 15/05).
    const ate = (cel: string | null) => {
      if (!cel) return true;
      const [dd, mm, aa] = cel.split("/");
      return `${aa}-${mm}-${dd}` <= "2026-05-15";
    };
    const aParte = (cfg: DebriefingConfigLancamento, extras: VendaCruaInput[]) => {
      const mtIn = entradaMt(cfg, { vendas: extras });
      const f = { ...mtIn, vendas: mtIn.vendas.filter((v) => ate(v.dataVendaCru)), leads: mtIn.leads.filter((l) => ate(l.dataCriacaoCru)), midia: mtIn.midia.filter((m) => m.dia <= "2026-05-15") };
      const mt = computeDebriefingMoneyTime(f);
      const au0 = entradaAudienceSintetica(f);
      const au = computeDebriefingAudience({ ...au0, janela: mt.janela, compradores: higienizarVendasDoDebriefing(f), respondentes: au0.respondentes.filter((r) => ate(r.dataRespostaCru)) });
      return montarPayloadDebriefing(mt, au, cfg, AGORA_D28);
    };
    const atualAParte = aParte(encerrado({ fimCarrinho: "2026-05-15" }), [EXTRA]);
    const compAParte = aParte({ ...encerrado({ fimCarrinho: "2026-05-15" }), stageId: SB, funnelId: FB }, []);
    for (const ind of INDICADORES) {
      expect({ indicador: ind.rotulo, atual: ind.ler(g.payload).valor, comp: ind.ler(comp).valor }).toEqual({
        indicador: ind.rotulo,
        atual: ind.ler(atualAParte).valor,
        comp: ind.ler(compAParte).valor,
      });
    }
    expect(g.payload.dinheiroTempo.vendasPrincipal).toBe(4);
    expect(comp.dinheiroTempo.vendasPrincipal).toBe(3);
    // o Δ no documento: 3 → 4 = +33,3% (nunca "—")
    const k = kpiDe(g.html, "Vendas do Produto Principal");
    expect(k).toMatch(/<div class="delta (up|down|neu)">[^<]*\+33,3%<\/div>/);
    expect(k).not.toContain("data-delta-lacuna");
  });

  it("o documento diz em que fase a comparação estava em D+N", async () => {
    const g = await gerar(deps({ config, extrasDoAtual: [EXTRA] }));
    expect(secaoDe(g.html, "Resumo Executivo")).toContain("<span data-fase-da-comparacao>PG04 em D+28: 5º dia de carrinho.</span>");
    expect(secaoDe(g.html, "Diferenças de Valores e Taxas")).toContain("<span data-fase-da-comparacao>PG04 em D+28: 5º dia de carrinho.</span>");
  });

  it("carrinho só de um lado (o da comparação ainda não abriu em D+N): Δ '—' com nota, como na 49.12", async () => {
    // a comparação abre o carrinho em 20/05 (D+33): em D+28 ela ainda está na captação
    const cfg = (sid: string): DebriefingConfig =>
      sid === SB ? { ...encerrado({ aberturaCarrinho: "2026-05-20" }), stageId: SB, funnelId: FB } : config(sid);
    const g = await gerar(deps({ config: cfg }));
    const k = kpiDe(g.html, "Vendas do Produto Principal");
    expect(k).toContain("Δ — : sem o número de PG04 (carrinho ainda não abriu — dados até 15/05, D+28)");
    expect(secaoDe(g.html, "Resumo Executivo")).toContain("PG04 em D+28: captação — carrinho ainda não abriu.");
  });
});
