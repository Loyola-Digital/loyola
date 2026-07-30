import { describe, it, expect } from "vitest";
import {
  decompor, simular, recuperacoes, calcularDeltas, compararLancamentos,
  METRICAS, valorDaMetrica, TOLERANCIA_DECOMPOSICAO,
} from "../services/launch-report-compare";
import type { LaunchReportMetrics } from "../services/launch-report-engine";
import { renderComparativo } from "../services/launch-report-render";

/**
 * Story 41.6 — AC8: a decomposição PG02→PG04 da §10 é o oráculo.
 *
 * | Fator     | ratio | efeito  | peso | direção          |
 * |-----------|-------|---------|------|------------------|
 * | CPM       | 0,684 | −31,6%  | +49% | puxou pra baixo  |
 * | CTR       | 1,079 |  +7,9%  | −10% | ajudou           |
 * | Conversão | 1,138 | +13,8%  | −17% | ajudou           |
 * | Ticket    | 0,550 | −45,0%  | +77% | puxou pra baixo  |
 * | produto   | 0,4620 — 0,9646 × 0,4620 = 0,4457 = ROAS pago PG04
 */

const mem = (valor: number) => ({ valor, memoria: "" });

function metrica(over: {
  cpm: number; ctr: number; conversao: number; ticketPago: number; roasPago: number;
  investimento?: number; organico?: number; faturamentoPago?: number;
}): LaunchReportMetrics {
  const inv = over.investimento ?? 1000;
  return {
    periodo: { inicio: "2026-04-17", fim: "2026-05-09", dias: 23 },
    campanhas: { total: 1, comInvestimento: 1, porFase: {}, naoPadrao: [] },
    investimento: {
      bruto: inv * 0.8785, comImposto: inv, quente: inv * 0.6, frio: inv * 0.4,
      pctQuente: 60, pctFrio: 40, impostoPct: 0.1215,
      impostoOrigem: "stage", impostoAplicadoPor: "fonte",
    },
    midia: {
      impressoes: 100_000, cliques: 2000,
      ctr: mem(over.ctr), cpc: mem(0.5), cpm: mem(over.cpm),
    },
    ingressos: {
      unicos: 100, totais: 120, captacao: 100, orderBump: 20,
      porOrigem: { Pago: 40, "Orgânico": 50, "Sem Track": 10 },
      pagos: 40, pagoQuente: 25, pagoFrio: 15, emailsDistintos: 100, avulsosSemEmail: 0,
    },
    faturamento: {
      total: (over.faturamentoPago ?? 2000) + (over.organico ?? 2500),
      captacao: 4000, orderBump: 1000,
      porOrigem: { Pago: over.faturamentoPago ?? 2000, "Orgânico": over.organico ?? 2500, "Sem Track": 0 },
      pago: over.faturamentoPago ?? 2000, pagoQuente: 1300, pagoFrio: 700,
      organico: over.organico ?? 2500,
    },
    roas: { pago: mem(over.roasPago), pagoQuente: mem(0), pagoFrio: mem(0), total: mem(0) },
    cpv: { geral: mem(10), pago: mem(25), quente: mem(24), frio: mem(26.7) },
    ticket: { captacao: mem(40), total: mem(41.7), pago: mem(over.ticketPago) },
    orderBump: {
      attachRateGeral: mem(20), attachRatePago: mem(20),
      pctFatObGeral: mem(20), pctFatObPago: mem(20), ticketOb: mem(50),
    },
    conversao: { cliqueVenda: mem(over.conversao) },
    pesquisa: { taxaResposta: mem(80), respondentes: 80 },
    produtos: [], notas: [], divergencias: [], pendencias: [],
    precoDistintoPorProduto: {}, linhasConvertidas: 0,
    adsComSpendSuspeito: [], destaques: null,
  };
}

/** Os dois lançamentos da §10, com os valores reais. */
const PG02 = metrica({
  cpm: 52.93, ctr: 1.8371, conversao: 1.7437, ticketPago: 159.39, roasPago: 0.9646,
  investimento: 126_566.14, faturamentoPago: 122_089.47, organico: 105_128.2,
});
const PG04 = metrica({
  cpm: 77.43, ctr: 1.9823, conversao: 1.9845, ticketPago: 87.72, roasPago: 0.4457,
  investimento: 43_301.37, faturamentoPago: 19_298.36, organico: 50_653.5,
});

// ---------------------------------------------------------------------------

describe("AC8 — decomposição PG02 → PG04 contra a §10", () => {
  const d = decompor(PG02, PG04);
  const por = (c: string) => d.fatores.find((f) => f.chave === c)!;

  it("a decomposição é válida", () => {
    expect(d.valida).toBe(true);
    expect(d.motivoInvalida).toBeNull();
  });

  it("CPM: ratio 0,684 · efeito −31,6% · peso +49% · puxou pra baixo", () => {
    const f = por("cpm");
    expect(f.ratio).toBeCloseTo(0.684, 3);
    expect(f.efeito).toBeCloseTo(-31.6, 1);
    expect(f.peso).toBeCloseTo(49, 0);
    expect(f.direcao).toBe("puxou pra baixo");
  });

  it("CTR: ratio 1,079 · efeito +7,9% · peso −10% · AJUDOU", () => {
    const f = por("ctr");
    expect(f.ratio).toBeCloseTo(1.079, 3);
    expect(f.efeito).toBeCloseTo(7.9, 1);
    expect(f.peso).toBeCloseTo(-10, 0);
    expect(f.direcao).toBe("ajudou");
  });

  it("Conversão: ratio 1,138 · efeito +13,8% · peso −17% · AJUDOU", () => {
    // É exatamente o fator que o relatório manual descreveu como "piorou" (§6).
    const f = por("conversao");
    expect(f.ratio).toBeCloseTo(1.138, 3);
    expect(f.efeito).toBeCloseTo(13.8, 1);
    expect(f.peso).toBeCloseTo(-17, 0);
    expect(f.direcao).toBe("ajudou");
  });

  it("Ticket: ratio 0,550 · efeito −45,0% · peso +77% · puxou pra baixo", () => {
    const f = por("ticket");
    expect(f.ratio).toBeCloseTo(0.55, 3);
    expect(f.efeito).toBeCloseTo(-45, 1);
    expect(f.peso).toBeCloseTo(77, 0);
    expect(f.direcao).toBe("puxou pra baixo");
  });

  it("produto 0,4620 e 0,9646 × 0,4620 = 0,4457", () => {
    expect(d.produto).toBeCloseTo(0.462, 3);
    expect(d.roasReconstruido).toBeCloseTo(0.4457, 3);
    expect(d.roasReconstruido).toBeCloseTo(d.roasB, 3);
  });

  it("os pesos somam 100%", () => {
    const soma = d.fatores.reduce((s, f) => s + f.peso, 0);
    expect(soma).toBeCloseTo(100, 6);
  });

  it("peso NEGATIVO significa que o fator ajudou — nas duas direções", () => {
    for (const f of d.fatores) {
      if (f.peso < 0) expect(f.direcao).toBe("ajudou");
      if (f.peso > 0) expect(f.direcao).toBe("puxou pra baixo");
    }
  });
});

describe("o CPM é o único fator invertido", () => {
  it("CPM usa a/b; os outros três usam b/a", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 20, ctr: 4, conversao: 4, ticketPago: 100, roasPago: 32 });
    const d = decompor(a, b);
    // CPM dobrou → ratio 0,5 (pior). Os outros dobraram → ratio 2 (melhor).
    expect(d.fatores.find((f) => f.chave === "cpm")!.ratio).toBeCloseTo(0.5, 6);
    expect(d.fatores.find((f) => f.chave === "ctr")!.ratio).toBeCloseTo(2, 6);
    expect(d.fatores.find((f) => f.chave === "conversao")!.ratio).toBeCloseTo(2, 6);
    expect(d.fatores.find((f) => f.chave === "ticket")!.ratio).toBeCloseTo(2, 6);
  });

  it("CPM que MELHORA (cai) tem ratio > 1 e ajuda", () => {
    const a = metrica({ cpm: 100, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 50, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 4 });
    const f = decompor(a, b).fatores.find((x) => x.chave === "cpm")!;
    expect(f.ratio).toBeCloseTo(2, 6);
    expect(f.direcao).toBe("ajudou");
  });
});

describe("decomposição inválida não é renderizada (AC2/R2)", () => {
  it("ratio <= 0 → inválida, com motivo", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 10, ctr: 0, conversao: 2, ticketPago: 50, roasPago: 2 });
    const d = decompor(a, b);
    expect(d.valida).toBe(false);
    expect(d.motivoInvalida).toContain("CTR");
    expect(d.fatores).toEqual([]);
  });

  it("ROAS de A em zero → inválida, sem dividir por zero", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 0 });
    const b = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const d = decompor(a, b);
    expect(d.valida).toBe(false);
    expect(d.motivoInvalida).toContain("A é zero");
  });

  it("identidade que não fecha → inválida, com os dois lados no motivo", () => {
    // ROAS de B incoerente com os fatores.
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 99 });
    const d = decompor(a, b);
    expect(d.valida).toBe(false);
    expect(d.motivoInvalida).toContain("não fecha");
    expect(d.motivoInvalida).toContain("99");
  });

  it("a tolerância é a da spec", () => {
    expect(TOLERANCIA_DECOMPOSICAO).toBe(0.001);
  });
});

describe("cenários hipotéticos (AC3)", () => {
  it("mesmo investimento com CPM menor compra mais impressões", () => {
    const base = metrica({ cpm: 100, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2, investimento: 10_000 });
    const c = simular(base, 50, 2, "teste");
    // 10.000 / 50 × 1000 = 200.000 impressões (o dobro de 100.000)
    expect(c.impressoes).toBeCloseTo(200_000, 0);
    expect(c.cliques).toBeCloseTo(4000, 0);
  });

  it("mantém conversão, ticket e orgânico da BASE", () => {
    const base = metrica({
      cpm: 100, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2,
      investimento: 10_000, organico: 7000,
    });
    const c = simular(base, 100, 2, "teste");
    // 10.000/100×1000 = 100.000 impr × 2% = 2.000 cliques × 2% = 40 vendas
    expect(c.vendas).toBeCloseTo(40, 6);
    expect(c.faturamentoPago).toBeCloseTo(2000, 6);
    expect(c.faturamentoTotal).toBeCloseTo(9000, 6); // 2.000 + 7.000 orgânico
    expect(c.roasPago).toBeCloseTo(0.2, 6);
  });

  it("cada cenário empresta o CPM e o CTR do OUTRO lançamento", () => {
    const r = compararLancamentos(PG02, PG04);
    expect(r.cenarios).toHaveLength(2);
    // Cenário 1 = PG02 com a mídia do PG04: CPM 77,43 é pior que 52,93
    const [c1] = r.cenarios;
    const impressoesReais = (PG02.investimento.comImposto / PG02.midia.cpm.valor) * 1000;
    expect(c1!.impressoes).toBeLessThan(impressoesReais);
  });

  it("CPM zero não explode", () => {
    const base = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const c = simular(base, 0, 2, "t");
    expect(Number.isFinite(c.impressoes)).toBe(true);
    expect(c.impressoes).toBe(0);
    expect(c.roasPago).toBe(0);
  });
});

describe("recuperações (AC3)", () => {
  it("se B tivesse o ticket de A", () => {
    const r = recuperacoes(PG02, PG04);
    // 0,4457 × (159,39 / 87,72) = 0,8099
    expect(r.seIgualarTicket).toBeCloseTo(0.4457 * (159.39 / 87.72), 4);
  });

  it("se B tivesse ticket E CPM de A", () => {
    const r = recuperacoes(PG02, PG04);
    expect(r.seIgualarAmbos).toBeCloseTo(
      0.4457 * (159.39 / 87.72) * (77.43 / 52.93), 4,
    );
  });

  it("igualar ambos recupera mais que só o ticket, quando o CPM piorou", () => {
    const r = recuperacoes(PG02, PG04);
    expect(r.seIgualarAmbos).toBeGreaterThan(r.seIgualarTicket);
  });
});

describe("AC5 — cor invertida em métrica de custo, via metadados", () => {
  it("as métricas de custo estão marcadas", () => {
    const custo = METRICAS.filter((m) => m.menorEhMelhor).map((m) => m.chave);
    expect(custo).toContain("cpm");
    expect(custo).toContain("cpc");
    expect(custo).toContain("cpvPago");
    expect(custo).toContain("cpvGeral");
  });

  it("CPV menor em B é MELHORA", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    a.cpv.pago.valor = 200;
    b.cpv.pago.valor = 100;
    const d = calcularDeltas(a, b).find((x) => x.chave === "cpvPago")!;
    expect(d.avaliacao).toBe("melhorou");
    expect(d.deltaPct).toBeCloseTo(-50, 6);
  });

  it("faturamento menor em B é PIORA", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2, faturamentoPago: 2000 });
    const b = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2, faturamentoPago: 1000 });
    const d = calcularDeltas(a, b).find((x) => x.chave === "faturamentoPago")!;
    expect(d.avaliacao).toBe("piorou");
  });

  it("valores iguais são estáveis nos dois tipos", () => {
    const d = calcularDeltas(PG02, PG02);
    expect(d.every((x) => x.avaliacao === "estável")).toBe(true);
    expect(d.every((x) => x.deltaPct === 0 || x.deltaPct === null)).toBe(true);
  });

  it("base zero → deltaPct null, não Infinity", () => {
    const a = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    const b = metrica({ cpm: 10, ctr: 2, conversao: 2, ticketPago: 50, roasPago: 2 });
    a.midia.impressoes = 0;
    b.midia.impressoes = 100;
    const d = calcularDeltas(a, b).find((x) => x.chave === "impressoes")!;
    expect(d.deltaPct).toBeNull();
  });

  it("toda métrica do catálogo é extraível", () => {
    for (const m of METRICAS) {
      expect(Number.isFinite(valorDaMetrica(PG02, m.chave))).toBe(true);
    }
  });
});

describe("AC6 — inverter A/B inverte tudo", () => {
  it("os ratios viram o recíproco", () => {
    const ab = decompor(PG02, PG04);
    const ba = decompor(PG04, PG02);
    for (const f of ab.fatores) {
      const inv = ba.fatores.find((x) => x.chave === f.chave)!;
      expect(inv.ratio).toBeCloseTo(1 / f.ratio, 6);
    }
  });

  it("as direções invertem", () => {
    const ab = decompor(PG02, PG04);
    const ba = decompor(PG04, PG02);
    for (const f of ab.fatores) {
      const inv = ba.fatores.find((x) => x.chave === f.chave)!;
      expect(inv.direcao).not.toBe(f.direcao);
    }
  });

  it("as avaliações dos deltas invertem", () => {
    const ab = calcularDeltas(PG02, PG04).filter((d) => d.avaliacao !== "estável");
    const ba = calcularDeltas(PG04, PG02);
    for (const d of ab) {
      const inv = ba.find((x) => x.chave === d.chave)!;
      expect(inv.avaliacao).not.toBe(d.avaliacao);
    }
  });

  it("PG04 → PG02: a decomposição continua fechando", () => {
    const ba = decompor(PG04, PG02);
    expect(ba.valida).toBe(true);
    expect(ba.roasReconstruido).toBeCloseTo(PG02.roas.pago.valor, 3);
  });
});

// ---------------------------------------------------------------------------
// Render do Comparativo (§5)
// ---------------------------------------------------------------------------

describe("render do Comparativo", () => {
  const guardas = { invariantes: [], alertas: [], conferencia: { status: "skipped" as const, investimentoCalculado: 0, investimentoOficial: null, delta: null, detalhe: "pulada" }, bloqueado: false, violacoes: [] };
  const render = (x: LaunchReportMetrics, y: LaunchReportMetrics) =>
    renderComparativo({
      a: { metricas: x, projeto: "DG", etapa: "PG02" },
      b: { metricas: y, projeto: "DG", etapa: "PG04" },
      comparativo: compararLancamentos(x, y),
      guardasA: guardas,
      guardasB: guardas,
    });

  const html = render(PG02, PG04);

  it("contém as seções do §5, na ordem", () => {
    const ordem = [
      "Visão geral", "Leitura rápida", "Classificação de produtos",
      "Comparação por seção", "Cenários hipotéticos", "Decomposição do ROAS pago",
    ].map((s) => html.indexOf(s));
    for (let i = 1; i < ordem.length; i += 1) {
      expect(ordem[i]).toBeGreaterThan(ordem[i - 1]!);
    }
  });

  it("KPIs pareados no formato A → B", () => {
    expect(html).toContain("→");
  });

  it("a direção tem COLUNA PRÓPRIA, não se deduz da cor", () => {
    expect(html).toContain("<th>Direção</th>");
    expect(html).toContain("puxou pra baixo");
    expect(html).toContain("ajudou");
  });

  it("AC8: o texto descreve CTR e Conversão como tendo AJUDADO", () => {
    // É o bug documentado no §6 — o relatório manual escreveu "piorou".
    const leitura = html.slice(html.indexOf("Leitura rápida"), html.indexOf("Classificação"));
    expect(leitura).toContain("Ajudaram:");
    expect(leitura).toContain("CTR");
    expect(leitura).toContain("Conversão");
  });

  it("explica que peso negativo significa que o fator ajudou", () => {
    expect(html).toContain("Peso negativo significa que o fator ajudou");
  });

  it("avisa que os períodos não são normalizados (R3)", () => {
    expect(html).toContain("não normalizados por duração");
    expect(html).toContain("23 dias");
  });

  it("AC6: inverter A/B inverte os textos", () => {
    const invertido = render(PG04, PG02);
    expect(html).not.toBe(invertido);

    const leituraAB = html.slice(html.indexOf("Leitura rápida"), html.indexOf("Classificação"));
    const leituraBA = invertido.slice(invertido.indexOf("Leitura rápida"), invertido.indexOf("Classificação"));
    expect(leituraAB).not.toBe(leituraBA);
    // O ROAS caiu de A para B; invertendo, sobe.
    expect(leituraAB).toContain("caiu");
    expect(leituraBA).toContain("subiu");
  });

  it("a decomposição inválida vira aviso, não tabela", () => {
    const quebrado = metrica({ cpm: 10, ctr: 0, conversao: 2, ticketPago: 50, roasPago: 2 });
    const h = render(PG02, quebrado);
    expect(h).toContain("Decomposição não exibida");
    expect(h).not.toContain("<th>Ratio</th>");
  });

  it("escapa conteúdo dinâmico", () => {
    const mal = metrica({ cpm: 77.43, ctr: 1.9823, conversao: 1.9845, ticketPago: 87.72, roasPago: 0.4457 });
    mal.produtos = [{ nome: "<img onerror=x>", categoria: "captacao", vendas: 1, faturamento: 10, pctFaturamento: 100, precoMin: 10, precoMax: 10 }];
    const h = render(PG02, mal);
    expect(h).not.toContain("<img onerror=x>");
    expect(h).toContain("&lt;img");
  });

  it("cabe no teto de 5MB", () => {
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(5 * 1024 * 1024);
  });
});
