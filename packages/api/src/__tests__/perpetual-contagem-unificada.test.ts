/**
 * Story 29.53 (AC6) — card, quadro diário e relatório respondem "quantas
 * vendas?" com a MESMA REGRA.
 *
 * ⚠️ O AC foi reescrito pelo @po justamente aqui: o rascunho pedia que as três
 * "convirjam", e convergir em NÚMERO é impossível por construção — a soma dos
 * dias não bate com o período (quem compra em dois dias conta nos dois), e o
 * relatório conta só as vendas de origem paga. O que tem que convergir é a
 * regra. Sobre o MESMO conjunto, num único dia e todo pago, os três números
 * coincidem — e é esse recorte que este arquivo usa.
 */

import { describe, it, expect } from "vitest";
import { chaveDeComprador } from "../utils/comprador.js";
import {
  computePerpetualReport,
  type PerpetualReportInput,
  type PerpetualSaleRow,
} from "../services/perpetual-report-metrics.js";
import {
  resolvePerpetualRates,
  type PerpetualReportConfig,
} from "../services/perpetual-report-config.js";

const DIA = "2026-08-08";

function config(): PerpetualReportConfig {
  return {
    funnelId: "f-1", funnelName: "BBE-A1", projectId: "p-1", projectName: "Netão",
    metaAccountId: "act_1", campanhas: [], prefixoCampanha: null,
    produto: "Curso Completo", produtosOrderBump: ["Workshop Burgers Netão"],
    temSplitFormato: false, origensPagas: ["meta"], inicioTrafego: null,
    validado: true, validadoEm: null, validadoPor: null,
    impostoPct: 0.1215, impostoOrigem: "default",
    taxaPlataformaPct: null, taxaImpostoPct: null, taxaOutrosPct: null,
    margemDesejadaPct: null, cmv: null, gatewayPctVar: null,
    funnelArchitecture: null, chainDefectReading: null, manualRates: {}, ceilings: {},
  };
}

function input(vendas: PerpetualSaleRow[]): PerpetualReportInput {
  const c = config();
  return {
    config: c,
    rates: resolvePerpetualRates(c, "kiwify", true),
    periodo: { inicio: DIA, fim: DIA },
    vendas,
    campanhas: [{ campaignId: "hot", campaignName: "hot_cbo", spend: 726.13, spendComImposto: 814.8 }],
  };
}

function venda(email: string, produto: string, valorBruto: number): PerpetualSaleRow {
  return {
    email, dia: DIA, valorBruto,
    utmSource: "meta", utmCampaign: "hot", utmMedium: "adset-1", utmContent: "ad-1",
    produto,
  };
}

/**
 * O 08/08 do chamado, em miniatura: 5 compradores, e dois deles levaram o bump.
 * São 7 linhas pagas — o número que a tela mostrava — contra 5 compradores.
 */
const LINHAS = [
  venda("ana@x.com", "Curso Completo", 497),
  venda("ana@x.com", "Workshop Burgers Netão", 173.5),
  venda("bru@x.com", "Curso Completo", 497),
  venda("bru@x.com", "Workshop Burgers Netão", 182.63),
  venda("caio@x.com", "Curso Completo", 497),
  venda("dani@x.com", "Curso Completo", 497),
  venda("edu@x.com", "Curso Completo", 497),
];

describe("AC6 — a mesma regra nas três superfícies", () => {
  /** Card: dedup no PERÍODO. É o que `perpetual-sales-data.ts` faz na rota agregada. */
  const doCard = new Set(LINHAS.map((v, i) => chaveDeComprador(v.email, null, i))).size;

  /** Quadro diário: dedup DENTRO DO DIA — a mesma função, com o dia no escopo. */
  const doDia = new Set(LINHAS.map((v, i) => chaveDeComprador(v.email, null, i, v.dia))).size;

  /** Relatório: o código real, não uma cópia da regra. */
  const relatorio = computePerpetualReport(input(LINHAS));

  it("as três dão 5 compradores sobre as mesmas 7 linhas", () => {
    expect(doCard).toBe(5);
    expect(doDia).toBe(5);
    expect(relatorio.kpis.vendas).toBe(5);
  });

  it("o relatório separa comprador de linha: 5 vendas, 7 transações", () => {
    expect(relatorio.kpis.transacoes).toBe(7);
  });

  it("o faturamento soma TODAS as linhas — o bump é receita (AC4)", () => {
    const total = LINHAS.reduce((s, v) => s + v.valorBruto, 0);
    expect(relatorio.kpis.faturamentoBruto).toBeCloseTo(total, 2);
    expect(relatorio.kpis.faturamentoBruto).toBeCloseTo(2841.13, 2);
  });

  /**
   * ⚠️ A story escreve R$ 162,95 e a conta dá R$ 162,96 — 814,80 ÷ 5. O centavo
   * de diferença é do arredondamento do investimento no chamado, não da regra.
   * Fixo o valor da CONTA, não o do texto: um teste que persegue o número do
   * chamado passaria a mentir na primeira vez que o spend mudasse de centavo.
   */
  it("o CAC é o do chamado: 814,80 ÷ 5 = 162,96 — e não 116,40 sobre 7 linhas", () => {
    expect(relatorio.kpis.cac!).toBeCloseTo(814.8 / 5, 2);
    expect(relatorio.kpis.cac!).toBeCloseTo(162.96, 2);
    expect(relatorio.kpis.cac!).not.toBeCloseTo(814.8 / 7, 2);
  });

  /**
   * Reversão: "a contagem volta a ser por linha".
   *
   * Com o bump contando como venda, o CAC cai 29% e o ticket médio despenca —
   * é exatamente a oscilação que a story existe para acabar.
   */
  it("contar linhas em vez de compradores muda o CAC — o defeito, medido", () => {
    const cacPorLinha = 814.8 / LINHAS.length;
    expect(cacPorLinha).toBeCloseTo(116.4, 1);
    expect(relatorio.kpis.cac! - cacPorLinha).toBeGreaterThan(45);
  });
});

describe("AC6 — a rede para a linha sem e-mail", () => {
  /**
   * Reversão: o relatório volta a `new Set(pagas.map(v => v.email...))`.
   *
   * Aquele Set colapsava TODA venda sem e-mail numa chave `""` — três vendas
   * anônimas viravam uma, e o faturamento fechava com uma contagem menor sem
   * nada na tela indicando por quê. `chaveDeComprador` cai para o índice da
   * linha, que é o mesmo comportamento do card.
   */
  const anonimas = [
    venda("", "Curso Completo", 497),
    venda("", "Curso Completo", 497),
    venda("", "Curso Completo", 497),
  ];

  it("três vendas sem e-mail contam três, não uma", () => {
    expect(computePerpetualReport(input(anonimas)).kpis.vendas).toBe(3);
  });

  it("e o Set de e-mail cru — o código de antes — daria 1", () => {
    expect(new Set(anonimas.map((v) => v.email.trim().toLowerCase())).size).toBe(1);
  });
});
