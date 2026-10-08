/**
 * Story 49.17 (fatias A e B) — o "Resumo macro" do topo do Debriefing: CAC
 * (AC3), leads únicos e taxa lead → comprador (AC4), curva acumulada (AC6), o
 * bloco no documento com a paridade, as maiores diferenças, as limitações e as
 * pendências (AC1, AC2, AC7, AC8), sem projeção (AC9), e as 18 seções
 * intocadas menos a exceção declarada da seção 03 (AC10).
 *
 * Motores REAIS sobre a entrada sintética da 49.5 e o orquestrador
 * `gerarDebriefing` de ponta a ponta, com o relógio fixado. A fixture
 * compartilhada não é alterada (as variações são montadas aqui). Cada teste
 * falha com o código de antes da 49.17 (mutações no Dev Agent Record).
 */

import { describe, expect, it } from "vitest";
import {
  LACUNA_LEADS_UNICOS_SEM_FONTE,
  computeDebriefingMoneyTime,
  configDoMotor,
  contarLeadsUnicos,
  ehEmailDeTeste,
  type DebriefingMoneyTimeInput,
  type LeadInput,
  type LeadsDeCadastroInput,
  type VendaCruaInput,
} from "../services/debriefing-money-time-engine.js";
import { computeDebriefingAudience } from "../services/debriefing-audience-engine.js";
import { DEBRIEFING_PAYLOAD_VERSAO, montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { checarF11, validateDebriefing } from "../services/debriefing-guards.js";
import {
  SECOES_DO_DEBRIEFING,
  TEXTO_INGRESSOS_POR_DIA_COM_CURVA,
  TEXTO_INGRESSOS_POR_DIA_SEM_CURVA,
  renderDebriefing,
} from "../services/debriefing-render.js";
import { MAX_MAIORES_DIFERENCAS, SEM_LEITURA_DE_IA, montarResumoMacro } from "../services/debriefing-resumo-macro.js";
import {
  gerarDebriefing,
  type DependenciasDaGeracao,
  type PayloadSalvo,
  type RegistroDoDebriefing,
} from "../services/debriefing-generate.js";
import { escolherPlanilhasDeLeadsDeCadastro, etapasDeCaptacao } from "../services/debriefing-money-time-loader.js";
import type {
  DebriefingConfigLancamento,
  DebriefingConfigLancamentoEmAndamento,
  DebriefingConfigLancamentoEncerrado,
} from "../services/debriefing-config.js";
import { escaparHtml } from "../services/launch-report-narrative.js";
import { CAP, GERADO_EM, PRIN, configSintetica, entradaAudienceSintetica, entradaMoneyTimeSintetica } from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FB = "20000000-0000-4000-8000-000000000002";
const S = "30000000-0000-4000-8000-000000000001";
const SB = "30000000-0000-4000-8000-000000000002";
const U = "40000000-0000-4000-8000-000000000001";
const PARAMS = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null } as const;
/** 12:00 de 22/04/2026 em Brasília → corte 21/04 (D+4). */
const AGORA_PARCIAL = new Date("2026-04-22T15:00:00.000Z");

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

const lead = (emailCru: string | null, telefoneCru: string | null, dataCriacaoCru: string | null): LeadInput => ({ emailCru, telefoneCru, dataCriacaoCru, utm: {} });

/** Leads do lançamento atual: 3 únicos na janela inteira (2 até o corte de 21/04). */
const LEADS_ATUAL: LeadsDeCadastroInput = {
  fontes: [{ rotulo: "Leads · n8n-leads-captacao", linhas: 9, semIdentificador: false }],
  leads: [
    lead("c1@x.com", null, "18/04/2026"),
    lead("C1@X.com ", null, "19/04/2026"), // mesmo e-mail (normalizado)
    lead("l2@x.com", "11988887777", "19/04/2026"),
    lead("l3@x.com", "5511988887777.0", "20/04/2026"), // mesmo telefone (últimos 8 dígitos) que o l2
    lead("Test.QA@x.com", null, "19/04/2026"), // "Test"
    lead("teste@x.com", "11911112222", "19/04/2026"), // "teste" — some mesmo com telefone
    lead("l4@x.com", null, "28/04/2026"), // depois do corte de 21/04 (dentro da janela final)
    lead("velho@x.com", null, "01/03/2026"), // antes do início — fora da janela
    lead("semdata@x.com", null, null), // sem data legível — fica
  ],
};

/** Leads da comparação: 6 únicos (taxa menor que a do atual). */
const LEADS_COMP: LeadsDeCadastroInput = {
  fontes: [{ rotulo: "Leads · comp", linhas: 6, semIdentificador: false }],
  leads: ["a", "b", "c", "d", "e", "f"].map((x) => lead(`${x}@y.com`, null, "18/04/2026")),
};

function configFinal(over: Partial<DebriefingConfigLancamentoEncerrado> = {}): DebriefingConfigLancamentoEncerrado {
  return { ...configSintetica(), stageId: S, funnelId: F, projectId: P, ...over };
}

function configParcial(over: Partial<DebriefingConfigLancamentoEmAndamento> = {}): DebriefingConfigLancamentoEmAndamento {
  return {
    ...configFinal(),
    situacaoDoLancamento: "em-andamento",
    datasChave: { inicioCaptacao: "2026-04-17", aberturaCarrinho: null, fimCarrinho: null, reabertura: null, downsell: null },
    aindaNaoAconteceu: ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"],
    ...over,
  };
}

function configComparacao(): DebriefingConfigLancamentoEncerrado {
  return { ...configSintetica(), stageId: SB, funnelId: FB, projectId: P };
}

type Lado = "atual" | "comparacao";

/** Entrada do Motor I. A comparação perde dois compradores, triplica a mídia e dobra as impressões. */
function entradaMt(config: DebriefingConfigLancamento, lado: Lado, leads: LeadsDeCadastroInput | null | undefined = undefined): DebriefingMoneyTimeInput {
  const base = entradaMoneyTimeSintetica();
  const leadsDeCadastro = leads === undefined ? (lado === "atual" ? LEADS_ATUAL : LEADS_COMP) : leads;
  const extra = leadsDeCadastro ? { leadsDeCadastro } : {};
  if (lado === "atual") return { ...base, ...extra, config: configDoMotor(config) };
  return {
    ...base,
    ...extra,
    config: configDoMotor(config),
    vendas: base.vendas.filter((v) => !(v.planilhaId === "p-cap" && (v.emailCru === "c3@x.com" || v.emailCru === "c4@x.com"))),
    midia: base.midia.map((m) => ({ ...m, spendBruto: m.spendBruto * 3, impressoes: m.impressoes * 2 })),
  };
}

function payloadDe(config: DebriefingConfigLancamento, lado: Lado, geradoEm: Date | string = GERADO_EM, leads?: LeadsDeCadastroInput | null): DebriefingPayload {
  const mtIn = entradaMt(config, lado, leads);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au = computeDebriefingAudience({ ...entradaAudienceSintetica(mtIn), janela: mt.janela });
  return montarPayloadDebriefing(mt, au, config, geradoEm);
}

/** O payload como uma geração ANTERIOR à 49.17 o salvou (sem CAC, leads, curva nem resumo). */
function comoPayloadAntigo(p: DebriefingPayload): DebriefingPayload {
  const c = structuredClone(p);
  delete c.dinheiroTempo.cac;
  delete c.dinheiroTempo.leads;
  delete c.dinheiroTempo.curvaAcumulada;
  delete c.resumoMacro;
  c.lacunas = c.lacunas.filter((l) => l.codigo !== LACUNA_LEADS_UNICOS_SEM_FONTE);
  return c;
}

interface Cenario {
  config: DebriefingConfigLancamento;
  comparacao?: "recalculada" | "salva" | "salva-antiga" | null;
  agora?: Date;
  leadsAtual?: LeadsDeCadastroInput | null;
}

function deps(c: Cenario): DependenciasDaGeracao & { gravados: RegistroDoDebriefing[] } {
  const gravados: RegistroDoDebriefing[] = [];
  const salvoPayload = payloadDe(configComparacao(), "comparacao", "2026-07-01T12:00:00.000Z");
  const salvo: PayloadSalvo | null =
    c.comparacao === "salva" || c.comparacao === "salva-antiga"
      ? {
          debriefingId: "50000000-0000-4000-8000-000000000009",
          salvoEm: "2026-07-01T12:00:00.000Z",
          payload: c.comparacao === "salva-antiga" ? comoPayloadAntigo(salvoPayload) : salvoPayload,
        }
      : null;
  const config = c.comparacao ? { ...c.config, lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] } : c.config;
  return {
    gravados,
    resolverEtapa: async () => ({ stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert" }),
    carregarConfig: async (sid) => (sid === SB ? configComparacao() : config),
    etapasDeDebriefingDoFunil: async () => (c.comparacao === "recalculada" ? [SB] : []),
    ultimoPayloadSalvoDoFunil: async () => salvo,
    calcularPayload: async (cfg, g) => payloadDe(cfg, cfg.funnelId === FB ? "comparacao" : "atual", g, cfg.funnelId === FB ? undefined : c.leadsAtual),
    nomes: async () => ({ funis: { [F]: "PG02", [FB]: "PG01" }, etapas: { [CAP]: "Captação", [PRIN]: "Principal" } }),
    gravar: async (r) => {
      gravados.push(r);
      return { id: "60000000-0000-4000-8000-000000000001" };
    },
    estadoDoSyncDaMidia: async () => [],
    agora: () => c.agora ?? new Date(GERADO_EM),
  };
}

async function gerar(c: Cenario) {
  const d = deps(c);
  const r = await gerarDebriefing(d, PARAMS);
  expect(r.status).toBe(200);
  const body = r.body as { html: string; payload: DebriefingPayload };
  return { html: body.html, payload: body.payload, gravado: d.gravados[0]! };
}

/** O bloco do resumo macro, do começo até a navegação das abas. */
function bloco(html: string): string {
  const i = html.indexOf('<div class="resumo-macro" data-resumo-macro>');
  const f = html.indexOf('<div class="nav">');
  expect(i).toBeGreaterThan(-1);
  expect(f).toBeGreaterThan(i);
  return html.slice(i, f);
}

function secoesPorTitulo(html: string): Map<string, string> {
  return new Map([...html.matchAll(/<section[^>]*data-secao="([^"]+)"[^>]*>[\s\S]*?<\/section>/g)].map((m) => [m[1]!.replace(/&amp;/g, "&"), m[0]]));
}

// ---------------------------------------------------------------------------
// AC3 — CAC
// ---------------------------------------------------------------------------

describe("AC3 — CAC = investimento de captação c/ imposto ÷ compradores de captação únicos", () => {
  it("a mesma base do ROAS de captação, com a memória de cálculo", () => {
    const mt = computeDebriefingMoneyTime(entradaMt(configFinal(), "atual"));
    const cac = mt.cac!;
    expect(cac.numerador).toBe(mt.midia.porGrupo.captacao.investimentoComImposto);
    expect(cac.numerador).toBe(mt.roasCaptacao.denominador);
    expect(cac.denominador).toBe(mt.ingressosUnicos);
    expect(mt.ingressosUnicos).toBe(4);
    expect(cac.valor).toBeCloseTo(228.79908935685825 / 4, 10);
    expect(cac.memoria).toBe("investimento de captação c/ imposto R$ 228,80 ÷ compradores de captação 4 = R$ 57,20");
  });

  it("compradores de captação = 0 → nulo com motivo, nunca infinito nem zero", () => {
    const base = entradaMt(configFinal(), "atual");
    // Só o avulso de order bump (c5) fica na captação: a etapa tem venda, mas nenhum comprador de captação.
    const so = { ...base, vendas: base.vendas.filter((v) => v.planilhaId !== "p-cap" || v.tipo === "order_bump") };
    const mt = computeDebriefingMoneyTime(so);
    expect(mt.ingressosUnicos).toBe(0);
    expect(mt.cac!.valor).toBeNull();
    expect(mt.cac!.motivo).toMatch(/^SEM_COMPRADORES_DE_CAPTACAO: /);
    expect(mt.cac!.numerador).toBeGreaterThan(0);
  });

  it("captação gratuita (sem planilha de venda na captação) → nulo com o motivo da gratuita", () => {
    const base = entradaMt(configFinal(), "atual");
    const mt = computeDebriefingMoneyTime({
      ...base,
      planilhas: base.planilhas.filter((p) => p.planilhaId !== "p-cap"),
      vendas: base.vendas.filter((v) => v.planilhaId !== "p-cap"),
    });
    expect(mt.cac!.valor).toBeNull();
    expect(mt.cac!.motivo).toMatch(/^CAPTACAO_GRATUITA/);
  });
});

// ---------------------------------------------------------------------------
// AC4 — leads únicos e taxa lead → comprador (fatia B)
// ---------------------------------------------------------------------------

describe("AC4 — leads únicos (e-mail OU telefone, sem os de teste) e taxa lead → comprador", () => {
  it("R11-4: e-mail que contém \"test\", sem diferenciar maiúsculas", () => {
    expect(ehEmailDeTeste("Test.QA@x.com")).toBe(true);
    expect(ehEmailDeTeste("teste@x.com")).toBe(true);
    expect(ehEmailDeTeste("ANA.TESTE@X.COM")).toBe(true);
    expect(ehEmailDeTeste("contestado@x.com")).toBe(true); // R2 da story: a regra do dono pega, e a contagem aparece
    expect(ehEmailDeTeste("ana@x.com")).toBe(false);
    expect(ehEmailDeTeste(null)).toBe(false);
  });

  it("dedup por e-mail OU telefone, descarte de teste contado, fora da janela fora, sem data fica", () => {
    const mt = computeDebriefingMoneyTime(entradaMt(configFinal(), "atual"));
    const l = mt.leads!;
    expect(l.aplicavel).toBe(true);
    expect(l.registrosLidos).toBe(9);
    expect(l.descartadosComoTeste).toMatchObject({ registros: 2, emailsDistintos: 2 });
    expect(l.foraDaJanela).toBe(1);
    expect(l.semData).toBe(1);
    // c1 (2 registros) · l2+l3 (mesmo telefone) · l4 · semdata = 4
    expect(l.unicos.valor).toBe(4);
    expect(l.unicos.memoria).toContain("2 de teste");
    expect(l.unicos.memoria).toContain("deduplicados por e-mail OU telefone = 4");
    // taxa = compradores de captação (headline, 4) ÷ leads únicos (4)
    expect(l.taxaLeadComprador).toMatchObject({ valor: 1, numerador: 4, denominador: 4 });
  });

  it("na parcial, só os leads até o corte (21/04, D+4) — o mesmo corte da janela", () => {
    const cfg = { ...configParcial(), corte: "2026-04-21" };
    const mt = computeDebriefingMoneyTime(entradaMt(cfg, "atual"));
    expect(mt.janela.fim).toBe("2026-04-21");
    // l4 (28/04) sai: c1 · l2/l3 · semdata = 3
    expect(mt.leads!.foraDaJanela).toBe(2);
    expect(mt.leads!.unicos.valor).toBe(3);
  });

  it("todos os leads de teste → 0 leads únicos (fonte existe) e taxa nula por divisão por zero", () => {
    const r = contarLeadsUnicos(
      { fontes: [{ rotulo: "x", linhas: 1, semIdentificador: false }], leads: [lead("TESTE@x.com", null, "18/04/2026")] },
      { inicio: "2026-04-17", fim: "2026-04-30" },
      4,
      null,
    );
    expect(r.unicos.valor).toBe(0);
    expect(r.taxaLeadComprador.valor).toBeNull();
    expect(r.taxaLeadComprador.motivo).toMatch(/^DIVISAO_POR_ZERO/);
  });

  it("sem planilha de leads → lacuna nova (nunca zero), e a LEADS_DO_PAINEL continua", () => {
    for (const leads of [{ fontes: [], leads: [] }, { fontes: [{ rotulo: "Lista sem contato · nomes", linhas: 0, semIdentificador: true }], leads: [] }]) {
      const p = payloadDe(configFinal(), "atual", GERADO_EM, leads);
      const l = p.dinheiroTempo.leads!;
      expect(l.aplicavel).toBe(false);
      expect(l.unicos.valor).toBeNull();
      expect(l.unicos.motivo).toMatch(new RegExp(`^${LACUNA_LEADS_UNICOS_SEM_FONTE}`));
      expect(l.taxaLeadComprador.valor).toBeNull();
      const codigos = p.lacunas.map((x) => x.codigo);
      expect(codigos).toContain(LACUNA_LEADS_UNICOS_SEM_FONTE);
      expect(codigos).toContain("LEADS_DO_PAINEL");
      expect(checarF11(p).status).toBe("passed");
    }
  });

  it("F11: a lacuna nova é exigida quando não há planilha de leads (catálogo da F11)", () => {
    const p = payloadDe(configFinal(), "atual", GERADO_EM, { fontes: [], leads: [] });
    p.lacunas = p.lacunas.filter((x) => x.codigo !== LACUNA_LEADS_UNICOS_SEM_FONTE);
    const f11 = checarF11(p);
    expect(f11.status).toBe("failed");
    expect(f11.detalhe).toContain(LACUNA_LEADS_UNICOS_SEM_FONTE);
  });

  it("chamador sem `leadsDeCadastro` (anterior à 49.17): sem contagem e sem lacuna", () => {
    const p = payloadDe(configFinal(), "atual", GERADO_EM, null);
    expect(p.dinheiroTempo.leads).toBeUndefined();
    expect(p.lacunas.map((x) => x.codigo)).not.toContain(LACUNA_LEADS_UNICOS_SEM_FONTE);
  });

  it("loader: só planilhas de LEADS das etapas de captação, sem campo de valor, uma vez por aba", () => {
    const captacao = etapasDeCaptacao([
      { stageId: "cap", papel: "vendas-captacao" },
      { stageId: "lcap", papel: "leads-captacao" },
      { stageId: "prin", papel: "vendas-principal" },
      { stageId: "lds", papel: "leads-downsell" },
    ]);
    expect([...captacao].sort()).toEqual(["cap", "lcap"]);
    const pl = (stageId: string | null, type: string, aba: string, columnMapping: Record<string, string> = { email: "Email" }) => ({
      stageId,
      type,
      spreadsheetId: "g",
      sheetName: aba,
      columnMapping,
    });
    const escolhidas = escolherPlanilhasDeLeadsDeCadastro(
      [
        pl("cap", "leads", "n8n-leads-captacao"),
        pl("lcap", "leads", "leads-gratuita"),
        pl("cap", "leads", "n8n-leads-captacao"), // a mesma aba de novo
        pl("cap", "leads", "n8n-kiwify-captação", { email: "Email", value: "valor" }), // planilha de vendas cadastrada como leads (36.9)
        pl(null, "leads", "leads-do-funil"), // sem etapa
        pl("prin", "leads", "leads-do-principal"), // etapa que não é de captação
        pl("lds", "leads", "leads-downsell"),
        pl("cap", "custom", "outra"),
      ],
      captacao,
    );
    expect(escolhidas.map((e) => e.sheetName)).toEqual(["n8n-leads-captacao", "leads-gratuita"]);
  });
});

// ---------------------------------------------------------------------------
// AC6 — curva acumulada
// ---------------------------------------------------------------------------

describe("AC6 — curva acumulada D+0…D+x (D0 = início informado)", () => {
  it("compradores pelo dia da 1ª compra de ingresso/combo; fecha com os totais; sem data fora da curva", () => {
    const base = entradaMt(configFinal(), "atual");
    const extra: VendaCruaInput[] = [
      // c2 compra um ingresso DEPOIS do combo (20/04): continua 1 comprador, no dia 20/04
      { ...base.vendas[2]!, linha: 801, idDaVendaCru: "X1", produto: "Imersão", tipo: "ingresso", valorBrutoCru: "99,00", dataVendaCru: "25/04/2026" },
      // comprador novo sem data legível: fora da curva, dentro dos totais
      { ...base.vendas[0]!, linha: 802, idDaVendaCru: "X2", emailCru: "semdia@x.com", dataVendaCru: "ontem" },
    ];
    const mt = computeDebriefingMoneyTime({ ...base, vendas: [...base.vendas, ...extra] });
    const c = mt.curvaAcumulada!;
    expect(c.aplicavel).toBe(true);
    expect(c.d0).toBe("2026-04-17");
    expect(c.ateDia).toBe(mt.janela.fim);
    expect(c.ateDMais).toBe(74);
    expect(c.pontos).toHaveLength(75);
    expect(c.pontos.map((x) => x.dMais)).toEqual(Array.from({ length: 75 }, (_, i) => i));
    const d = (n: number) => c.pontos[n]!;
    expect(d(2)).toMatchObject({ dia: "2026-04-19", compradores: 0, faturamento: 0, investimento: 0 });
    expect(d(3).compradores).toBe(4); // 20/04: c1, c2, c3, c4
    expect(d(8).compradores).toBe(4); // 25/04: o 2º ingresso do c2 não conta outra pessoa
    expect(d(8).faturamento).toBe(d(3).faturamento + 99);
    expect(c.semData).toEqual({ compradores: 1, faturamento: 99 });
    const ultimo = c.pontos.at(-1)!;
    expect(ultimo.compradores + c.semData.compradores).toBe(mt.ingressosUnicos);
    expect(ultimo.faturamento + c.semData.faturamento).toBeCloseTo(mt.captacao.faturamentoCaptacao.valor!, 6);
    expect(ultimo.investimento).toBeCloseTo(mt.midia.porGrupo.captacao.investimentoComImposto, 6);
    expect(c.memoria).toContain("sem data da venda: 1 comprador(es) e R$ 99,00");
  });

  it("na parcial, para no corte dos DOIS lados (a comparação no mesmo D+N), pelo orquestrador", async () => {
    const r = await gerar({ config: configParcial(), comparacao: "recalculada", agora: AGORA_PARCIAL });
    expect(r.payload.dinheiroTempo.curvaAcumulada!.ateDMais).toBe(4);
    expect(r.payload.dinheiroTempo.curvaAcumulada!.pontos).toHaveLength(5);
    const comp = r.gravado.comparacao!.payload.dinheiroTempo.curvaAcumulada!;
    expect(comp.ateDia).toBe("2026-04-21");
    expect(comp.ateDMais).toBe(4);
    const tabelaDaCurva = /<div data-curva-acumulada>([\s\S]*?)<\/table>/.exec(bloco(r.html))![1]!;
    expect([...tabelaDaCurva.matchAll(/<tr><td>(D[^<]*)<\/td>/g)].map((m) => m[1])).toEqual(["D0", "D+1", "D+2", "D+3", "D+4"]);
    expect(bloco(r.html)).toContain("a curva para no corte (D+4) dos dois lados");
  });
});

// ---------------------------------------------------------------------------
// AC1, AC2, AC7, AC8, AC9 — o bloco no documento (orquestrador ponta a ponta)
// ---------------------------------------------------------------------------

describe("AC1 — bloco \"Resumo macro\" no topo, fora das abas e da numeração", () => {
  it("depois dos avisos e sinalizações, antes das abas; as 18 seções seguem 00…17", async () => {
    const { html, payload, gravado } = await gerar({ config: configParcial(), comparacao: "recalculada", agora: AGORA_PARCIAL });
    const i = html.indexOf("data-resumo-macro");
    expect(i).toBeGreaterThan(html.indexOf("data-parcial"));
    expect(i).toBeGreaterThan(html.indexOf("data-alertas"));
    expect(i).toBeLessThan(html.indexOf('<div class="nav">'));
    expect(i).toBeLessThan(html.indexOf('<div class="tab'));
    const b = bloco(html);
    expect(b).toContain("<h2>Resumo macro</h2>");
    expect(b).not.toContain("sec-num");
    expect(b).not.toContain("<section");
    const nums = [...html.matchAll(/<span class="sec-num">(\d{2})<\/span><h2>([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]!.replace(/&amp;/g, "&")]);
    expect(nums).toEqual(SECOES_DO_DEBRIEFING.map((t, n) => [String(n).padStart(2, "0"), t]));
    // AC11: no payload persistido e devolvido, aditivo; a versão não sobe.
    expect(payload.resumoMacro).toBeDefined();
    expect(gravado.payload.resumoMacro).toEqual(payload.resumoMacro);
    expect(payload.versao).toBe(DEBRIEFING_PAYLOAD_VERSAO);
    expect(DEBRIEFING_PAYLOAD_VERSAO).toBe(1);
  });

  it("também no final (R11-0g), em edição única", async () => {
    const { html, payload } = await gerar({ config: configFinal() });
    expect(bloco(html)).toContain("Edição única");
    expect(payload.resumoMacro!.comparacao).toBeNull();
    expect(payload.resumoMacro!.maioresDiferencas).toEqual([]);
  });
});

describe("AC2 — tabela de paridade", () => {
  it("as 10 linhas na ordem do método, atual × comparação, com Δ", async () => {
    const { html, payload } = await gerar({ config: configFinal(), comparacao: "recalculada" });
    const rm = payload.resumoMacro!;
    expect(rm.comparacao).toMatchObject({ funnelId: FB, nome: "PG01", origem: "recalculada", corte: null });
    expect(rm.paridade.map((l) => l.chave)).toEqual([
      "compradores",
      "faturamento",
      "ticket",
      "tierSuperior",
      "investimento",
      "cac",
      "roasCaptacao",
      "leads",
      "taxaLeadComprador",
      "cpm",
    ]);
    const l = (k: string) => rm.paridade.find((x) => x.chave === k)!;
    expect(l("compradores")).toMatchObject({ atual: { valor: 4 }, comparacao: { valor: 2 }, delta: { absoluto: 2, relativoPct: 100 } });
    expect(l("faturamento")).toMatchObject({ atual: { valor: 641 }, comparacao: { valor: 443 } });
    expect(l("leads")).toMatchObject({ atual: { valor: 4 }, comparacao: { valor: 6 } });
    expect(l("cac").atual.valor).toBeCloseTo(payload.dinheiroTempo.cac!.valor!, 10);
    expect(l("investimento").atual.valor).toBe(payload.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto);
    const t = /<div data-paridade>([\s\S]*?)<\/table>/.exec(bloco(html))![1]!;
    expect(t).toContain("<th>Indicador</th><th>PG01</th><th>PG02</th><th>Diferença</th><th>Variação</th>");
    expect(t).toContain("<tr><td>Compradores de captação (únicos)</td><td>2</td><td>4</td><td>+2</td>");
    expect(t).toContain("<td>Leads únicos</td><td>6</td><td>4</td><td>−2</td>");
  });

  it("número que falta de um lado: \"—\" com nota, nunca Δ inventado (comparação de relatório salvo antigo)", async () => {
    const { html, payload } = await gerar({ config: configFinal(), comparacao: "salva-antiga" });
    const rm = payload.resumoMacro!;
    for (const k of ["cac", "leads", "taxaLeadComprador"]) {
      const l = rm.paridade.find((x) => x.chave === k)!;
      expect(l.comparacao!.valor).toBeNull();
      expect(l.delta).toBeNull();
      expect(l.notaSemDelta).toContain("sem o número de PG01");
    }
    expect(rm.paridade.find((x) => x.chave === "compradores")!.delta).not.toBeNull();
    const b = bloco(html);
    expect(b).toContain("data-delta-lacuna-resumo");
    expect(b).toContain("CAC (investimento ÷ compradores) — Δ “—”: sem o número de PG01");
    expect(rm.limitacoes.some((x) => x.includes("último relatório salvo"))).toBe(true);
  });

  it("sem comparação: só a coluna do lançamento atual e a nota de edição única", async () => {
    const { html } = await gerar({ config: configFinal() });
    const t = /<div data-paridade>([\s\S]*?)<\/table>/.exec(bloco(html))![1]!;
    expect(t).toContain("<tr><th>Indicador</th><th>PG02</th></tr>");
    expect(bloco(html)).toContain("Edição única: sem lançamento de comparação na configuração");
  });

  it("parcial com comparação só de relatório salvo: sem Δ, dito no bloco", async () => {
    const { html, payload } = await gerar({ config: configParcial(), comparacao: "salva", agora: AGORA_PARCIAL });
    expect(payload.resumoMacro!.comparacao).toBeNull();
    expect(payload.resumoMacro!.semDelta).toMatchObject({ funnelId: FB, nome: "PG01" });
    expect(bloco(html)).toContain("Sem Δ:");
  });
});

describe("AC4 no documento — leads de teste descartados aparecem", () => {
  it("contagem dos dois lados", async () => {
    const { html } = await gerar({ config: configFinal(), comparacao: "recalculada" });
    const n = /<p class="tnote" data-leads-de-teste>([\s\S]*?)<\/p>/.exec(bloco(html))![1]!;
    expect(n).toContain("PG02: 2 registro(s) descartado(s) como teste (2 e-mail(s) distinto(s))");
    expect(n).toContain("PG01: 0 registro(s) descartado(s) como teste");
  });
});

describe("AC7 — maiores diferenças, sem ação escrita por regra", () => {
  it("as de maior diferença relativa, numeradas, com atual, comparação e Δ; ação = \"sem leitura de IA\"", async () => {
    const { html, payload } = await gerar({ config: configFinal(), comparacao: "recalculada" });
    const md = payload.resumoMacro!.maioresDiferencas;
    expect(md).toHaveLength(MAX_MAIORES_DIFERENCAS);
    expect(md.map((d) => d.chave)).toEqual(["roasCaptacao", "taxaLeadComprador", "compradores", "cac", "investimento"]);
    expect(md.map((d) => d.posicao)).toEqual([1, 2, 3, 4, 5]);
    const rel = md.map((d) => Math.abs(d.delta.relativoPct!));
    expect([...rel].sort((a, b) => b - a)).toEqual(rel);
    expect(md[2]).toMatchObject({ atual: 4, comparacao: 2, delta: { absoluto: 2, relativoPct: 100 }, acao: null, rotuloDaAcao: SEM_LEITURA_DE_IA });
    const lista = /<ul class="notes-list" data-maiores-diferencas>([\s\S]*?)<\/ul>/.exec(bloco(html))![1]!;
    expect([...lista.matchAll(/data-diferenca="([^"]+)"/g)].map((m) => m[1])).toEqual(md.map((d) => d.chave));
    expect(lista).toContain("<b>3. Compradores de captação (únicos)</b>: PG02 4 × PG01 2 — Δ +2 (+100,0%).");
    expect((lista.match(/Ação: sem leitura de IA/g) ?? []).length).toBe(MAX_MAIORES_DIFERENCAS);
    expect(bloco(html)).toContain('data-bloco-ia="acoes-do-resumo"');
  });

  it("linha sem número de um lado não entra nas diferenças", () => {
    const atual = payloadDe(configFinal(), "atual");
    const comp = comoPayloadAntigo(payloadDe(configComparacao(), "comparacao"));
    const rm = montarResumoMacro({ payload: atual, nomeAtual: "PG02", comparacao: { funnelId: FB, nome: "PG01", payload: comp, origem: { tipo: "recalculada" } }, alertas: [] });
    expect(rm.maioresDiferencas.map((d) => d.chave)).not.toContain("cac");
    expect(rm.maioresDiferencas.map((d) => d.chave)).not.toContain("taxaLeadComprador");
  });
});

describe("AC8 — limitações e pendências no fim do bloco", () => {
  it("lacunas que afetam a tabela (leads sem fonte) e as pendências do \"ainda não aconteceu\"", async () => {
    const { html, payload } = await gerar({ config: configParcial(), agora: AGORA_PARCIAL, leadsAtual: { fontes: [], leads: [] } });
    const rm = payload.resumoMacro!;
    expect(rm.limitacoes.some((x) => x.startsWith(`${LACUNA_LEADS_UNICOS_SEM_FONTE} — `))).toBe(true);
    expect(rm.limitacoes.some((x) => x.includes("LEADS_DO_PAINEL"))).toBe(false);
    expect(rm.pendencias.slice(0, 4)).toEqual([
      "Abertura do carrinho: ainda não aconteceu — informar a data na configuração do debriefing quando acontecer.",
      "Fim do carrinho: ainda não aconteceu — informar a data na configuração do debriefing quando acontecer.",
      "Reabertura: ainda não aconteceu — informar a data na configuração do debriefing quando acontecer.",
      "Downsell: ainda não aconteceu — informar a data na configuração do debriefing quando acontecer.",
    ]);
    expect(rm.pendencias.some((x) => x.startsWith("Pergunta(s) da pesquisa sem confirmação"))).toBe(true);
    const b = bloco(html);
    expect(b.indexOf("data-limitacoes-resumo")).toBeGreaterThan(b.indexOf("data-maiores-diferencas") === -1 ? b.indexOf("acoes-do-resumo") : b.indexOf("data-maiores-diferencas"));
    expect(b).toContain(escaparHtml(rm.pendencias[0]!));
  });

  it("alerta WF2 (preço contaminado) entra nas limitações; alerta que não mexe na tabela não", () => {
    const p = payloadDe(configFinal(), "atual");
    const rm = montarResumoMacro({
      payload: p,
      nomeAtual: "PG02",
      comparacao: null,
      alertas: [
        { codigo: "WF2", quantidade: 1, mensagem: "1 produto(s) com mais de 3 preços distintos" },
        { codigo: "WF4", quantidade: 1, mensagem: "taxa de resposta baixa" },
      ],
    });
    expect(rm.limitacoes.some((x) => x.startsWith("WF2 — "))).toBe(true);
    expect(rm.limitacoes.some((x) => x.startsWith("WF4"))).toBe(false);
  });
});

describe("render a partir do payload completo", () => {
  it("o bloco mostra o resumo que veio no payload (o da orquestração), não um recálculo", () => {
    const p = payloadDe(configFinal(), "atual");
    p.resumoMacro = montarResumoMacro({ payload: p, nomeAtual: "PG02", comparacao: null, alertas: [] });
    p.resumoMacro.pendencias = ["Pendência gravada no payload"];
    p.resumoMacro.limitacoes = ["Limitação gravada no payload"];
    const html = renderDebriefing({ payload: p, comparacao: null, rotulos: { projeto: "Expert", lancamento: "PG02", etapas: {}, funis: {} }, alertas: [] });
    expect(bloco(html)).toContain("<li>Pendência gravada no payload</li>");
    expect(bloco(html)).toContain("<li>Limitação gravada no payload</li>");
  });
});

describe("AC9 — sem projeção do fechamento", () => {
  it("nem na parcial nem no final", async () => {
    for (const c of [
      { config: configParcial(), comparacao: "recalculada" as const, agora: AGORA_PARCIAL },
      { config: configFinal(), comparacao: "recalculada" as const },
    ]) {
      const { html, payload } = await gerar(c);
      expect(html).not.toMatch(/proje[cç][aã]o|estimativa de fechamento|fechamento estimado|projetad/i);
      expect(JSON.stringify(payload.resumoMacro)).not.toMatch(/proje[cç]|estimativa/i);
    }
  });
});

// ---------------------------------------------------------------------------
// AC10 — as 18 seções sem mudança, menos a exceção da seção 03
// ---------------------------------------------------------------------------

describe("AC10 — as 18 seções do encerrado não mudam (só o texto \"Ingressos por dia\" da seção 03)", () => {
  it("render do payload novo × o mesmo payload sem os campos da 49.17, por título", () => {
    const novo = payloadDe(configFinal(), "atual");
    const antigo = comoPayloadAntigo(novo);
    const rot = { projeto: "Expert", lancamento: "PG02", etapas: {}, funis: {} };
    const alertas = validateDebriefing(novo).alertas;
    const hn = secoesPorTitulo(renderDebriefing({ payload: novo, comparacao: null, rotulos: rot, alertas }));
    const ha = secoesPorTitulo(renderDebriefing({ payload: antigo, comparacao: null, rotulos: rot, alertas }));
    expect([...hn.keys()]).toEqual([...SECOES_DO_DEBRIEFING]);
    for (const t of SECOES_DO_DEBRIEFING) {
      if (t === "Evolução Diária") continue;
      expect(hn.get(t), t).toBe(ha.get(t));
    }
    const ev = hn.get("Evolução Diária")!;
    expect(ev).not.toBe(ha.get("Evolução Diária"));
    expect(ev).toContain(escaparHtml(TEXTO_INGRESSOS_POR_DIA_COM_CURVA));
    expect(ev.split(escaparHtml(TEXTO_INGRESSOS_POR_DIA_COM_CURVA)).join(escaparHtml(TEXTO_INGRESSOS_POR_DIA_SEM_CURVA))).toBe(ha.get("Evolução Diária"));
    expect(TEXTO_INGRESSOS_POR_DIA_COM_CURVA).toContain("curva acumulada do Resumo macro");
  });
});

// ---------------------------------------------------------------------------
// QA 49.17 (TEST-001, rascunho do @qa) — o fio dos alertas pelo orquestrador
// e as colunas da curva; REQ-002 — pendências e alertas da comparação
// ---------------------------------------------------------------------------

describe("QA TEST-001 — alertas pelo orquestrador e colunas da curva", () => {
  it("Q7: o WF2 das guardas chega às limitações do payload e do bloco, pelo gerarDebriefing", async () => {
    const d = deps({ config: configFinal() });
    const calcular = d.calcularPayload;
    d.calcularPayload = async (cfg, g) => {
      const p = await calcular(cfg, g);
      p.dinheiroTempo.higiene.precoDistintoPorProduto = { "Ingresso X": 99 };
      return p;
    };
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    const body = r.body as { html: string; payload: DebriefingPayload; alertas: { codigo: string }[] };
    expect(body.alertas.map((a) => a.codigo)).toContain("WF2");
    expect(body.payload.resumoMacro!.limitacoes.some((x) => x.startsWith("WF2 — "))).toBe(true);
    expect(bloco(body.html)).toMatch(/<li>WF2 — /);
  });

  it("Q11: cada coluna e cada série da curva é do lançamento do rótulo", async () => {
    const r = await gerar({ config: configFinal(), comparacao: "recalculada" });
    const a = r.payload.dinheiroTempo.curvaAcumulada!.pontos.at(-1)!;
    const b = r.gravado.comparacao!.payload.dinheiroTempo.curvaAcumulada!.pontos.at(-1)!;
    expect(a.compradores).not.toBe(b.compradores);
    expect(a.faturamento).not.toBe(b.faturamento);
    expect(a.investimento).not.toBe(b.investimento);
    const tab = /<div data-curva-acumulada>([\s\S]*?)<\/table>/.exec(bloco(r.html))![1]!;
    expect(tab).toContain("<th>D+x</th><th>Compradores PG01</th><th>Compradores PG02</th><th>Faturamento PG01</th><th>Faturamento PG02</th><th>Investimento PG01</th><th>Investimento PG02</th>");
    const ultima = [...tab.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].at(-1)![1]!;
    const cel = [...ultima.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1]);
    const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(cel.slice(1)).toEqual([String(b.compradores), String(a.compradores), brl(b.faturamento), brl(a.faturamento), brl(b.investimento), brl(a.investimento)]);
    // As séries dos 2 gráficos: o nome diz de quem é o dado.
    const D = JSON.parse(/<script>const D=(.*?);\n/s.exec(r.html)![1]!) as { graficos: Record<string, { series: { nome: string; dados: (number | null)[] }[] }> };
    const fim = (id: string, nome: string) => D.graficos[id]!.series.find((s) => s.nome === nome)!.dados.at(-1);
    expect(fim("cCurvaCompradores", "PG01")).toBe(b.compradores);
    expect(fim("cCurvaCompradores", "PG02")).toBe(a.compradores);
    expect(fim("cCurvaFaturamento", "Faturamento — PG01")).toBe(b.faturamento);
    expect(fim("cCurvaFaturamento", "Faturamento — PG02")).toBe(a.faturamento);
    expect(fim("cCurvaFaturamento", "Investimento — PG01 (referência)")).toBe(b.investimento);
    expect(fim("cCurvaFaturamento", "Investimento — PG02 (referência)")).toBe(a.investimento);
  });
});

describe("QA REQ-002 — limitações com as pendências que tiram venda/mídia da conta e os alertas da comparação", () => {
  it("venda de etapa fora da config (atual) e WF2 da comparação, pelo gerarDebriefing", async () => {
    const d = deps({ config: configFinal(), comparacao: "recalculada" });
    d.calcularPayload = async (cfg, g) => {
      const lado: Lado = cfg.funnelId === FB ? "comparacao" : "atual";
      const mtIn = entradaMt(cfg, lado);
      const entrada =
        lado === "atual"
          ? {
              ...mtIn,
              planilhas: [...mtIn.planilhas, { planilhaId: "p-fora", stageId: "stage-fora", nome: "fora", plataforma: "main_product", temColunaStatus: true, temColunaId: true, temColunaProduto: true, camada2Vale: true }],
              vendas: [...mtIn.vendas, { ...mtIn.vendas[0]!, planilhaId: "p-fora", linha: 990, idDaVendaCru: "F1", emailCru: "fora@x.com" }],
            }
          : mtIn;
      const mt = computeDebriefingMoneyTime(entrada);
      if (lado === "comparacao") mt.higiene.precoDistintoPorProduto = { "Ingresso Y": 99 };
      const au = computeDebriefingAudience({ ...entradaAudienceSintetica(entrada), janela: mt.janela });
      return montarPayloadDebriefing(mt, au, cfg, g);
    };
    const r = await gerarDebriefing(d, PARAMS);
    expect(r.status).toBe(200);
    const body = r.body as { html: string; payload: DebriefingPayload; alertas: { codigo: string }[] };
    const lim = body.payload.resumoMacro!.limitacoes;
    expect(lim.some((x) => x.startsWith("VENDA_DE_ETAPA_FORA_DA_CONFIG — 1 linha(s) de venda"))).toBe(true);
    expect(lim.some((x) => x.startsWith("PG01: WF2 — "))).toBe(true);
    expect(body.alertas.map((a) => a.codigo)).not.toContain("WF2"); // o WF2 é só da comparação
    expect(bloco(body.html)).toContain("<li>PG01: WF2 — ");
  });
});
