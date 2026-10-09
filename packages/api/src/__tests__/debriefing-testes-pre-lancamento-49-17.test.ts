/**
 * Story 49.17 fatia C (AC5, R11-1 opção B + R12-2) — testes pré-lançamento:
 * campanhas vendas-captacao, de etapa de captação, com o código do lançamento
 * no nome e investimento antes do início da captação. Entram no investimento
 * de captação e no total (logo no CAC e no ROAS) e são mostradas à parte no
 * resumo e na seção de mídia; a regra vale igual para a comparação.
 *
 * Motores reais sobre a entrada sintética da 49.5 e o `gerarDebriefing` de
 * ponta a ponta. Cada teste falha com o código de antes da fatia C.
 */

import { describe, expect, it } from "vitest";
import {
  computeDebriefingMoneyTime,
  configDoMotor,
  ehCampanhaDeTestePreLancamento,
  type CodigoDoLancamento,
  type DebriefingMoneyTimeInput,
  type MidiaCampanhaDiaInput,
  type MidiaPreLancamentoInput,
} from "../services/debriefing-money-time-engine.js";
import { codigoDoFunilSemCampanhaDeCaptacao, codigoDoLancamentoDoFunil } from "../services/debriefing-money-time-loader.js";
import { effectiveMatchCode, matchCodeDoFunil } from "../services/funnel-match-code.js";
import { computeDebriefingAudience } from "../services/debriefing-audience-engine.js";
import { montarPayloadDebriefing, type DebriefingPayload } from "../services/debriefing-payload.js";
import { validateDebriefing } from "../services/debriefing-guards.js";
import { gerarDebriefing, type DependenciasDaGeracao, type RegistroDoDebriefing } from "../services/debriefing-generate.js";
import type { DebriefingConfigLancamento, DebriefingConfigLancamentoEncerrado } from "../services/debriefing-config.js";
import { CAP, GERADO_EM, PRIN, configSintetica, entradaAudienceSintetica, entradaMoneyTimeSintetica } from "./fixtures/debriefing-payload-sintetico.js";

const P = "10000000-0000-4000-8000-000000000001";
const F = "20000000-0000-4000-8000-000000000001";
const FB = "20000000-0000-4000-8000-000000000002";
const S = "30000000-0000-4000-8000-000000000001";
const SB = "30000000-0000-4000-8000-000000000002";
const U = "40000000-0000-4000-8000-000000000001";
const PARAMS = { projectId: P, funnelId: F, stageId: S, userId: U, userRole: "user", investimentoOficial: null } as const;

const CODIGO: CodigoDoLancamento = { codigo: "lanc-pg02", origem: "match_code" };
const NOME_TESTE = "lanc-pg02-abr-26--vendas-captacao--2026-04-10--hot--cbo--estaticos";

const linha = (over: Partial<MidiaCampanhaDiaInput>): MidiaCampanhaDiaInput => ({
  stageId: CAP,
  campaignId: "c-teste",
  campaignName: NOME_TESTE,
  dia: "2026-04-14",
  spendBruto: 300,
  impressoes: 9000,
  linkClicks: 90,
  ...over,
});

/** Dois dias de teste (14 e 15/04) antes do início (17/04): R$ 500 brutos. */
const TESTES: MidiaPreLancamentoInput = { codigo: CODIGO, linhas: [linha({}), linha({ dia: "2026-04-15", spendBruto: 200 })] };

function configFinal(over: Partial<DebriefingConfigLancamentoEncerrado> = {}): DebriefingConfigLancamentoEncerrado {
  return { ...configSintetica(), stageId: S, funnelId: F, projectId: P, ...over };
}

function entrada(config: DebriefingConfigLancamento, pre?: MidiaPreLancamentoInput, extra: Partial<DebriefingMoneyTimeInput> = {}): DebriefingMoneyTimeInput {
  return { ...entradaMoneyTimeSintetica(), ...(pre ? { midiaPreLancamento: pre } : {}), ...extra, config: configDoMotor(config) };
}

function payload(
  config: DebriefingConfigLancamento,
  pre?: MidiaPreLancamentoInput,
  geradoEm: Date | string = GERADO_EM,
  extra: Partial<DebriefingMoneyTimeInput> = {},
): DebriefingPayload {
  const mtIn = entrada(config, pre, extra);
  const mt = computeDebriefingMoneyTime(mtIn);
  const au = computeDebriefingAudience({ ...entradaAudienceSintetica(mtIn), janela: mt.janela });
  return montarPayloadDebriefing(mt, au, config, geradoEm);
}

function deps(c: {
  preAtual?: MidiaPreLancamentoInput;
  preComp?: MidiaPreLancamentoInput;
  comparacao?: boolean;
  /** A comparação vem do PAYLOAD SALVO (sem etapa Debriefing), com estes testes (ausente = sem o campo). */
  comparacaoSalva?: { pre?: MidiaPreLancamentoInput };
  extraAtual?: Partial<DebriefingMoneyTimeInput>;
}): DependenciasDaGeracao & { gravados: RegistroDoDebriefing[] } {
  const gravados: RegistroDoDebriefing[] = [];
  const cfgComp = { ...configSintetica(), stageId: SB, funnelId: FB, projectId: P };
  const config =
    c.comparacao || c.comparacaoSalva ? configFinal({ lancamentoComparacaoFunnelId: FB, lancamentosComparacao: [FB] }) : configFinal();
  return {
    gravados,
    resolverEtapa: async () => ({ stageId: S, stageName: "Debriefing", stageType: "debriefing", funnelId: F, funnelName: "PG02", projectId: P, projectName: "Expert" }),
    carregarConfig: async (sid) => (sid === SB ? cfgComp : config),
    etapasDeDebriefingDoFunil: async () => (c.comparacao ? [SB] : []),
    ultimoPayloadSalvoDoFunil: async () =>
      c.comparacaoSalva
        ? { debriefingId: "70000000-0000-4000-8000-000000000001", salvoEm: "2026-06-21T01:00:00.000Z", payload: payload(cfgComp, c.comparacaoSalva.pre) }
        : null,
    calcularPayload: async (cfg, g) => payload(cfg, cfg.funnelId === FB ? c.preComp : c.preAtual, g, cfg.funnelId === FB ? {} : (c.extraAtual ?? {})),
    nomes: async () => ({ funis: { [F]: "PG02", [FB]: "PG01" }, etapas: { [CAP]: "Captação", [PRIN]: "Principal" } }),
    gravar: async (r) => {
      gravados.push(r);
      return { id: "60000000-0000-4000-8000-000000000001" };
    },
    estadoDoSyncDaMidia: async () => [],
    agora: () => new Date(GERADO_EM),
  };
}

async function gerar(c: Parameters<typeof deps>[0]) {
  const d = deps(c);
  const r = await gerarDebriefing(d, PARAMS);
  expect(r.status).toBe(200);
  const body = r.body as { html: string; payload: DebriefingPayload };
  return { ...body, gravado: d.gravados[0]! };
}

// ---------------------------------------------------------------------------
// A regra (R12-2) e o código do lançamento
// ---------------------------------------------------------------------------

describe("R12-2 — a campanha conta só com a fase vendas-captacao E o código do lançamento no nome", () => {
  it("regra do nome", () => {
    expect(ehCampanhaDeTestePreLancamento(NOME_TESTE, CODIGO)).toBe(true);
    expect(ehCampanhaDeTestePreLancamento("LANC-PG02--Vendas-Captacao—hot", CODIGO)).toBe(true); // caixa e travessão normalizados
    expect(ehCampanhaDeTestePreLancamento("lanc-pg01--vendas-captacao--hot", CODIGO)).toBe(false); // outro lançamento
    expect(ehCampanhaDeTestePreLancamento("vendas-captacao--hot--sem-codigo", CODIGO)).toBe(false);
    expect(ehCampanhaDeTestePreLancamento("lanc-pg02--leads-captacao--hot", CODIGO)).toBe(false);
    expect(ehCampanhaDeTestePreLancamento("lanc-pg02--vendas-principal--hot", CODIGO)).toBe(false);
    expect(ehCampanhaDeTestePreLancamento(NOME_TESTE, null)).toBe(false);
    expect(ehCampanhaDeTestePreLancamento(NOME_TESTE, { codigo: "  ", origem: "match_code" })).toBe(false);
  });

  it("o código: o match_code do funil (aparado, minúsculo) e, sem ele, o nome do funil", () => {
    expect(codigoDoLancamentoDoFunil({ name: "dg-pg05-out-26", matchCode: " DG-PG05 " })).toEqual({ codigo: "dg-pg05", origem: "match_code" });
    expect(codigoDoLancamentoDoFunil({ name: "DG-PG02", matchCode: null })).toEqual({ codigo: "dg-pg02", origem: "nome-do-funil" });
    expect(codigoDoLancamentoDoFunil({ name: "dg-pg02", matchCode: "  " })).toEqual({ codigo: "dg-pg02", origem: "nome-do-funil" });
    expect(codigoDoLancamentoDoFunil({ name: " ", matchCode: null })).toBeNull();
  });

  it("QA TEST-001 (K1): sem match_code, o código é o nome INTEIRO do funil — não os 2 primeiros segmentos (tokenDoFunil)", () => {
    expect(codigoDoLancamentoDoFunil({ name: "dg-pg05-out-26", matchCode: null })).toEqual({ codigo: "dg-pg05-out-26", origem: "nome-do-funil" });
    expect(codigoDoLancamentoDoFunil({ name: " Lançamento DG-PG02 Abril ", matchCode: null })).toEqual({ codigo: "lançamento dg-pg02 abril", origem: "nome-do-funil" });
  });

  it("QA MNT-001: a regra é a única de services/funnel-match-code (a das rotas de campanhas órfãs e da etapa)", () => {
    for (const f of [
      { name: "dg-pg05-out-26", matchCode: " DG-PG05 " },
      { name: "dg-pg05-out-26", matchCode: null },
      { name: "DG-PG02", matchCode: "  " },
      { name: " ", matchCode: null },
      { name: null, matchCode: null },
    ]) {
      expect(codigoDoLancamentoDoFunil(f)).toEqual(matchCodeDoFunil(f));
      expect(effectiveMatchCode(f)).toBe(matchCodeDoFunil(f)?.codigo ?? null);
    }
    expect(effectiveMatchCode({ name: "dg-pg05-out-26", matchCode: null })).toBe("dg-pg05-out-26");
    expect(effectiveMatchCode({ name: "x", matchCode: " DG-PG05 " })).toBe("dg-pg05");
    expect(effectiveMatchCode({ name: "  ", matchCode: "" })).toBeNull();
  });

  it("QA TEST-001 (K4): o código vale em qualquer lugar do nome (substring), não só como prefixo", () => {
    expect(ehCampanhaDeTestePreLancamento("teste--lanc-pg02--vendas-captacao--hot", CODIGO)).toBe(true);
    expect(ehCampanhaDeTestePreLancamento("vendas-captacao--hot--lanc-pg02", CODIGO)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC5 no Motor I
// ---------------------------------------------------------------------------

describe("AC5 — o investimento dos testes entra na captação e no total, e muda CAC e ROAS", () => {
  const sem = computeDebriefingMoneyTime(entrada(configFinal()));
  const com = computeDebriefingMoneyTime(entrada(configFinal(), TESTES));
  // imposto do Loyola por dia (12,15%): 500 ÷ (1 − 0,1215)
  const testeComImposto = 300 / (1 - 0.1215) + 200 / (1 - 0.1215);

  it("campanha com o código, antes do início: entra", () => {
    const t = com.testesPreLancamento!;
    expect(t.investimentoBruto).toBe(500);
    expect(t.investimentoComImposto).toBeCloseTo(testeComImposto, 8);
    expect(t.periodo).toEqual({ inicio: "2026-04-14", fim: "2026-04-15" });
    expect(t.campanhas).toEqual([
      { campaignId: "c-teste", campaignName: NOME_TESTE, stageId: CAP, inicio: "2026-04-14", fim: "2026-04-15", investimentoBruto: 500, investimentoComImposto: t.investimentoComImposto },
    ]);
    expect(t.codigoDoLancamento).toEqual(CODIGO);
    expect(com.midia.porGrupo.captacao.investimentoComImposto).toBeCloseTo(sem.midia.porGrupo.captacao.investimentoComImposto + testeComImposto, 8);
    expect(com.midia.investimentoTotal.valor!).toBeCloseTo(sem.midia.investimentoTotal.valor! + testeComImposto, 8);
    expect(com.midia.investimentoTotal.memoria).toContain("de testes pré-lançamento antes do início (2026-04-14 a 2026-04-15, R11-1)");
  });

  it("CAC e ROAS mudam (o denominador é o investimento de captação com os testes)", () => {
    expect(com.cac!.numerador).toBeCloseTo(sem.cac!.numerador! + testeComImposto, 8);
    expect(com.cac!.valor!).toBeGreaterThan(sem.cac!.valor!);
    expect(com.roasCaptacao.denominador).toBeCloseTo(sem.roasCaptacao.denominador! + testeComImposto, 8);
    expect(com.roasCaptacao.valor!).toBeLessThan(sem.roasCaptacao.valor!);
    expect(com.roasTotalSemTmb.denominador).toBeCloseTo(sem.roasTotalSemTmb.denominador + testeComImposto, 8);
  });

  it("sem o código no nome, com outra fase, de etapa que não é de captação ou já dentro da janela: não entra", () => {
    const naoContam: MidiaPreLancamentoInput = {
      codigo: CODIGO,
      linhas: [
        linha({ campaignId: "a", campaignName: "lanc-pg01--vendas-captacao--hot" }),
        linha({ campaignId: "b", campaignName: "lanc-pg02--leads-captacao--hot" }),
        linha({ campaignId: "c", stageId: PRIN }),
        linha({ campaignId: "d", dia: "2026-04-17" }), // o dia do início já é janela (entra pela mídia de sempre, nunca duas vezes)
        linha({ campaignId: "e", spendBruto: 0, impressoes: 0 }),
      ],
    };
    const r = computeDebriefingMoneyTime(entrada(configFinal(), naoContam));
    expect(r.testesPreLancamento).toBeUndefined();
    expect(r.midia.porGrupo.captacao.investimentoComImposto).toBe(sem.midia.porGrupo.captacao.investimentoComImposto);
    expect(JSON.stringify(r)).toBe(JSON.stringify(sem));
  });

  it("vendas atribuídas pela utm_campaign; a anterior ao início fica fora do faturamento", () => {
    const base = entrada(configFinal(), TESTES);
    const venda = base.vendas[0]!;
    const r = computeDebriefingMoneyTime({
      ...base,
      vendas: [
        ...base.vendas,
        { ...venda, linha: 901, idDaVendaCru: "PRE-1", emailCru: "pre@x.com", dataVendaCru: "15/04/2026", utm: { campaign: "c-teste" } },
        { ...venda, linha: 902, idDaVendaCru: "IN-1", emailCru: "in@x.com", dataVendaCru: "18/04/2026", utm: { campaign: "{\"c-teste\",\"c-teste\"}" } },
      ],
    });
    expect(r.testesPreLancamento!.vendasAtribuidas).toEqual({ vendas: 2, faturamento: 198, naJanela: 1 });
    expect(r.higiene.foraDoPeriodo.captacao.vendas).toBe(1);
  });

  it("a curva acumulada já começa o D0 com o investimento dos testes e fecha com o de captação", () => {
    const c = com.curvaAcumulada!;
    expect(c.pontos[0]!.investimento).toBeCloseTo(testeComImposto, 8);
    expect(c.pontos.at(-1)!.investimento).toBeCloseTo(com.midia.porGrupo.captacao.investimentoComImposto, 8);
    expect(c.memoria).toContain("o investimento do D0 inclui");
  });

  it("as guardas fecham com os testes (F12: imposto recomposto por dia, inclusive nos dias antes do início)", () => {
    const p = payload(configFinal(), TESTES);
    expect(validateDebriefing(p).violacoes).toEqual([]);
    expect(p.dinheiroTempo.midia.midiaDiariaPorEtapa.filter((d) => d.dia < "2026-04-17").map((d) => d.dia)).toEqual(["2026-04-14", "2026-04-15"]);
  });

  it("QA TEST-001 (K11): linha com impressão e gasto zero conta — no período e nas campanhas, sem mudar o investimento", () => {
    const comImpressao: MidiaPreLancamentoInput = {
      codigo: CODIGO,
      linhas: [...TESTES.linhas, linha({ campaignId: "c-impressao", dia: "2026-04-10", spendBruto: 0, impressoes: 1200, linkClicks: 0 })],
    };
    const r = computeDebriefingMoneyTime(entrada(configFinal(), comImpressao));
    const t = r.testesPreLancamento!;
    expect(t.periodo).toEqual({ inicio: "2026-04-10", fim: "2026-04-15" });
    expect(t.campanhas.map((c) => c.campaignId)).toEqual(["c-impressao", "c-teste"]);
    expect(t.investimentoBruto).toBe(500);
    expect(t.investimentoComImposto).toBeCloseTo(com.testesPreLancamento!.investimentoComImposto, 8);
    // só impressão também basta para existir o bloco
    const so = computeDebriefingMoneyTime(entrada(configFinal(), { codigo: CODIGO, linhas: [linha({ spendBruto: 0, impressoes: 10 })] }));
    expect(so.testesPreLancamento!.campanhas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// @po 2026-10-09 (REQ-001 da fatia C): o limiar de pico-artefato é só da janela
// ---------------------------------------------------------------------------

describe("REQ-001 — com testes, o limiar de pico-artefato sai igual ao do mesmo lançamento sem testes", () => {
  // Teste separado do início (17/04) por 28 dias: um dia de R$ 1 (abaixo de qualquer limiar) e um de R$ 300.
  const LONGE: MidiaPreLancamentoInput = {
    codigo: CODIGO,
    linhas: [linha({ dia: "2026-03-20", spendBruto: 1 }), linha({ dia: "2026-03-21", spendBruto: 300 })],
  };
  const sem = computeDebriefingMoneyTime(entrada(configFinal()));
  const com = computeDebriefingMoneyTime(entrada(configFinal(), LONGE));

  it("limiar, média diária, dias do denominador e memória: idênticos", () => {
    expect(com.testesPreLancamento!.periodo).toEqual({ inicio: "2026-03-20", fim: "2026-03-21" });
    expect(com.limiarPicoArtefato).toEqual(sem.limiarPicoArtefato);
    expect(sem.limiarPicoArtefato.limiarPicoArtefato).not.toBeNull();
    // o investimento de captação (CAC/ROAS) inclui os testes; o limiar não
    expect(com.midia.porGrupo.captacao.investimentoComImposto).toBeGreaterThan(sem.midia.porGrupo.captacao.investimentoComImposto);
  });

  it("os dias D−n estão na série diária (F12), mas nunca são pico-artefato nem entram no WF6", () => {
    const antes = com.roasDiarioCaptacao.filter((d) => d.dia < "2026-04-17");
    expect(antes[0]!.dia).toBe("2026-03-20");
    expect(antes[0]!.investimento).toBeCloseTo(1 / (1 - 0.1215), 8);
    expect(antes[0]!.investimento).toBeLessThan(com.limiarPicoArtefato.limiarPicoArtefato!);
    expect(antes.some((d) => d.picoArtefato)).toBe(false);
    // na janela, os mesmos dias marcados que sem testes (a série com testes é contínua desde o D−n:
    // os dias sem gasto entre o teste e o primeiro dia da série de antes entram como dia sem gasto)
    const diasDeAntes = new Set(sem.roasDiarioCaptacao.map((d) => d.dia));
    const naJanela = (r: typeof com) => r.roasDiarioCaptacao.filter((d) => diasDeAntes.has(d.dia)).map((d) => [d.dia, d.picoArtefato]);
    expect(naJanela(com)).toEqual(naJanela(sem));
    expect(com.roasDiarioCaptacao.filter((d) => d.dia >= "2026-04-17" && !diasDeAntes.has(d.dia)).every((d) => d.diaSemGasto && !d.picoArtefato)).toBe(true);
    const wf6 = (pp: DebriefingPayload) => validateDebriefing(pp).alertas.find((a) => a.codigo === "WF6");
    const pCom = payload(configFinal(), LONGE);
    expect(wf6(pCom)?.mensagem ?? "").not.toContain("2026-03-");
    expect(wf6(pCom)).toEqual(wf6(payload(configFinal())));
    expect(validateDebriefing(pCom).violacoes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// QA REL-001: código pelo nome do funil que não casa nenhuma campanha → pendência
// ---------------------------------------------------------------------------

describe("REL-001 — código do lançamento pelo nome do funil sem nenhuma campanha de captação com ele: escrito, nunca em silêncio", () => {
  const PELO_NOME: CodigoDoLancamento = { codigo: "lançamento dg-pg02 abril", origem: "nome-do-funil" };

  it("a regra do loader: só quando o código vem do nome E nenhuma campanha de captação o contém", () => {
    expect(codigoDoFunilSemCampanhaDeCaptacao(PELO_NOME, ["dg-pg02--vendas-captacao--hot", null])).toEqual(PELO_NOME);
    expect(codigoDoFunilSemCampanhaDeCaptacao(PELO_NOME, [])).toEqual(PELO_NOME);
    const casa: CodigoDoLancamento = { codigo: "dg-pg02-abr-26", origem: "nome-do-funil" };
    expect(codigoDoFunilSemCampanhaDeCaptacao(casa, ["DG-PG02-ABR-26--vendas-captacao—hot"])).toBeNull();
    expect(codigoDoFunilSemCampanhaDeCaptacao({ codigo: "dg-pg02", origem: "match_code" }, ["nada"])).toBeNull();
    expect(codigoDoFunilSemCampanhaDeCaptacao(null, ["nada"])).toBeNull();
  });

  it("o motor grava a pendência CODIGO_DO_LANCAMENTO_SEM_CAMPANHA; sem o campo, nada muda", () => {
    const r = computeDebriefingMoneyTime(entrada(configFinal(), undefined, { codigoDoLancamentoSemCampanha: PELO_NOME }));
    const pe = r.pendencias.filter((x) => x.codigo === "CODIGO_DO_LANCAMENTO_SEM_CAMPANHA");
    expect(pe).toHaveLength(1);
    expect(pe[0]!.detalhe).toContain('o código do lançamento é o nome do funil ("lançamento dg-pg02 abril")');
    expect(pe[0]!.detalhe).toContain("conferir o match_code do funil");
    const sem = computeDebriefingMoneyTime(entrada(configFinal()));
    expect(sem.pendencias.some((x) => x.codigo === "CODIGO_DO_LANCAMENTO_SEM_CAMPANHA")).toBe(false);
  });

  it("no documento: na lista de pendências e nas limitações do resumo do topo", async () => {
    const { html, payload: p } = await gerar({ extraAtual: { codigoDoLancamentoSemCampanha: PELO_NOME } });
    expect(p.resumoMacro!.limitacoes.some((l) => l.startsWith("CODIGO_DO_LANCAMENTO_SEM_CAMPANHA — ") && l.endsWith("afeta investimento, CAC e ROAS (testes pré-lançamento)"))).toBe(true);
    expect(html).toContain("<h4>CODIGO_DO_LANCAMENTO_SEM_CAMPANHA</h4>");
    const resumo = html.slice(html.indexOf("data-resumo-macro"), html.indexOf('<div class="nav">'));
    expect(resumo).toContain("CODIGO_DO_LANCAMENTO_SEM_CAMPANHA");
  });
});

// ---------------------------------------------------------------------------
// AC5 no documento e na comparação (orquestrador ponta a ponta)
// ---------------------------------------------------------------------------

describe("AC5 — à parte no resumo e na seção de mídia; paridade na comparação", () => {
  it("o bloco à parte aparece no resumo e na seção 07, com valor, período e vendas", async () => {
    const { html, payload: p } = await gerar({ preAtual: TESTES });
    const t = p.resumoMacro!.testesPreLancamento!;
    expect(t.atual).toMatchObject({ codigo: "lanc-pg02", campanhas: 1, periodo: { inicio: "2026-04-14", fim: "2026-04-15" }, vendasAtribuidas: { vendas: 0, faturamento: 0, naJanela: 0 } });
    expect(t.comparacao).toBeNull();
    const resumo = html.slice(html.indexOf("data-resumo-macro"), html.indexOf('<div class="nav">'));
    expect(resumo).toContain("data-testes-pre-lancamento-resumo");
    expect(resumo).toContain("PG02: <b>R$ 569,15</b> c/ imposto, de 14/04/26 a 15/04/26, 1 campanha(s) com “lanc-pg02” no nome; 0 venda(s) atribuída(s) (R$ 0,00)");
    const midia = /<section[^>]*data-secao="Mídia Paga — Visão Geral"[\s\S]*?<\/section>/.exec(html)![0];
    expect(midia).toContain("<h3 class=\"gr\">Testes pré-lançamento</h3>");
    expect(midia).toContain("<tr><td>PG02</td><td>R$ 569,15</td><td>14/04/26 a 15/04/26</td><td>1</td><td>0</td><td>R$ 0,00</td></tr>");
  });

  it("sem testes, nada do bloco (nem no resumo, nem na seção 07, nem no payload)", async () => {
    const { html, payload: p } = await gerar({});
    expect(html).not.toContain("data-testes-pre-lancamento");
    expect(html).not.toContain("Testes pré-lançamento");
    expect(p.resumoMacro!.testesPreLancamento).toBeUndefined();
    expect(p.dinheiroTempo.testesPreLancamento).toBeUndefined();
  });

  it("a mesma regra na comparação principal (paridade): o investimento dela inclui os testes dela", async () => {
    const semTestes = await gerar({ comparacao: true });
    const { html, payload: p, gravado } = await gerar({ comparacao: true, preComp: TESTES });
    const comp = gravado.comparacao!.payload.dinheiroTempo;
    expect(comp.testesPreLancamento!.investimentoBruto).toBe(500);
    const inv = (pp: DebriefingPayload) => pp.resumoMacro!.paridade.find((l) => l.chave === "investimento")!;
    expect(inv(p).comparacao!.valor!).toBeCloseTo(inv(semTestes.payload).comparacao!.valor! + 500 / (1 - 0.1215), 6);
    expect(inv(p).atual.valor).toBe(inv(semTestes.payload).atual.valor);
    const cac = (pp: DebriefingPayload) => pp.resumoMacro!.paridade.find((l) => l.chave === "cac")!;
    expect(cac(p).comparacao!.valor!).toBeGreaterThan(cac(semTestes.payload).comparacao!.valor!);
    expect(p.resumoMacro!.testesPreLancamento).toMatchObject({ atual: null, comparacao: { campanhas: 1 } });
    const resumo = html.slice(html.indexOf("data-resumo-macro"), html.indexOf('<div class="nav">'));
    expect(resumo).toContain("PG02: nenhum · PG01: <b>R$ 569,15</b>");
    const midia = /<section[^>]*data-secao="Mídia Paga — Visão Geral"[\s\S]*?<\/section>/.exec(html)![0];
    expect(midia).toContain("<tr><td>PG01</td><td>R$ 569,15</td>");
    expect(midia).toContain("<tr><td>PG02</td><td>—</td><td>—</td><td>0</td><td>—</td><td>—</td></tr>");
  });

  it("REQ-002 (@po): comparação de PAYLOAD SALVO sem o campo → “—” com “não informado no relatório salvo” e a limitação; nunca “nenhum”/“0”", async () => {
    const { html, payload: p } = await gerar({ preAtual: TESTES, comparacaoSalva: {} });
    expect(p.resumoMacro!.comparacao!.origem).toBe("payload-salvo");
    const resumo = html.slice(html.indexOf("data-resumo-macro"), html.indexOf('<div class="nav">'));
    expect(resumo).toContain("PG01: — (não informado no relatório salvo)");
    expect(resumo).not.toContain("PG01: nenhum");
    const midia = /<section[^>]*data-secao="Mídia Paga — Visão Geral"[\s\S]*?<\/section>/.exec(html)![0];
    expect(midia).toContain("<tr><td>PG01</td><td>— (não informado no relatório salvo)</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>");
    const lim = "O relatório salvo de PG01 não informa testes pré-lançamento; o Δ de investimento, CAC e ROAS supõe que ele não teve.";
    expect(p.resumoMacro!.limitacoes).toContain(lim);
    expect(resumo).toContain(lim);
  });

  it("REQ-002: payload salvo COM testes mostra os números; recalculada sem testes segue “nenhum”/“0”; sem testes no atual, nada muda", async () => {
    const comSalvo = await gerar({ preAtual: TESTES, comparacaoSalva: { pre: TESTES } });
    expect(comSalvo.html).toContain("PG01: <b>R$ 569,15</b>");
    expect(comSalvo.payload.resumoMacro!.limitacoes.some((l) => l.includes("não informa testes pré-lançamento"))).toBe(false);
    const recalc = await gerar({ preAtual: TESTES, comparacao: true });
    const resumo = recalc.html.slice(recalc.html.indexOf("data-resumo-macro"), recalc.html.indexOf('<div class="nav">'));
    expect(resumo).toContain("PG01: nenhum");
    expect(recalc.html).toContain("<tr><td>PG01</td><td>—</td><td>—</td><td>0</td><td>—</td><td>—</td></tr>");
    expect(recalc.html).not.toContain("não informado no relatório salvo");
    const semTestes = await gerar({ comparacaoSalva: {} });
    expect(semTestes.html).not.toContain("não informado no relatório salvo");
    expect(semTestes.payload.resumoMacro!.limitacoes.some((l) => l.includes("não informa testes pré-lançamento"))).toBe(false);
  });
});
