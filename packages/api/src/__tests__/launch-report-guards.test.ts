import { describe, it, expect } from "vitest";
import {
  validateLaunchReport,
  assertLaunchReport,
  InvarianteVioladoError,
  ConferenciaExternaError,
  TOLERANCIAS,
  LIMIAR_CONFERENCIA,
  LIMIARES_ALERTA,
  type CodigoInvariante,
} from "../services/launch-report-guards";
import type { LaunchReportMetrics } from "../services/launch-report-engine";

/**
 * Story 41.3 — AC5 pede ao menos um caso positivo e um negativo por invariante.
 *
 * O fixture nasce **coerente** (todos os 9 passam) e cada teste negativo quebra
 * exatamente uma coisa. É o que garante que um invariante falhe pelo motivo que
 * ele deveria pegar, e não por efeito colateral do fixture.
 */

// ---------------------------------------------------------------------------
// Fixture coerente
// ---------------------------------------------------------------------------

function metrica(): LaunchReportMetrics {
  // Números escolhidos para a identidade A9 fechar exatamente:
  // INV 1.000, impressões 100.000, cliques 2.000, pagos 40, fat pago 2.000.
  // CPM = 10, CTR = 2%, conv = 2%, ticket = 50 → ROAS = 2,0.
  const mem = (valor: number) => ({ valor, memoria: "" });
  return {
    periodo: { inicio: "2026-04-17", fim: "2026-05-09", dias: 23 },
    campanhas: { total: 2, comInvestimento: 2, porFase: { "vendas-captacao": 2 }, naoPadrao: [] },
    investimento: {
      bruto: 878.5,
      comImposto: 1000,
      quente: 600,
      frio: 400,
      pctQuente: 60,
      pctFrio: 40,
      impostoPct: 0.1215,
      impostoOrigem: "stage",
      impostoAplicadoPor: "fonte",
    },
    midia: {
      impressoes: 100_000,
      cliques: 2000,
      ctr: mem(2),
      cpc: mem(0.5),
      cpm: mem(10),
    },
    ingressos: {
      unicos: 100,
      totais: 120,
      captacao: 100,
      orderBump: 20,
      porOrigem: { Pago: 40, "Orgânico": 50, "Sem Track": 10 },
      pagos: 40,
      pagoQuente: 25,
      pagoFrio: 15,
      emailsDistintos: 100,
      avulsosSemEmail: 0,
    },
    faturamento: {
      total: 5000,
      captacao: 4000,
      orderBump: 1000,
      porOrigem: { Pago: 2000, "Orgânico": 2500, "Sem Track": 500 },
      pago: 2000,
      pagoQuente: 1300,
      pagoFrio: 700,
      organico: 2500,
    },
    roas: { pago: mem(2), pagoQuente: mem(2.17), pagoFrio: mem(1.75), total: mem(5) },
    cpv: { geral: mem(10), pago: mem(25), quente: mem(24), frio: mem(26.7) },
    ticket: { captacao: mem(40), total: mem(41.7), pago: mem(50) },
    orderBump: {
      attachRateGeral: mem(20),
      attachRatePago: mem(20),
      pctFatObGeral: mem(20),
      pctFatObPago: mem(20),
      ticketOb: mem(50),
    },
    conversao: { cliqueVenda: mem(2) },
    pesquisa: { taxaResposta: mem(80), respondentes: 80 },
    produtos: [
      { nome: "Imersão", categoria: "captacao", vendas: 100, faturamento: 4000, pctFaturamento: 80, precoMin: 40, precoMax: 40 },
      { nome: "Combo", categoria: "order_bump", vendas: 20, faturamento: 1000, pctFaturamento: 20, precoMin: 50, precoMax: 50 },
    ],
    notas: [],
    divergencias: [],
    pendencias: [],
    precoDistintoPorProduto: { "Imersão": 1, Combo: 1 },
    linhasConvertidas: 0,
    adsComSpendSuspeito: [],
    destaques: null,
  };
}

/** Status de um invariante no resultado. */
function status(m: LaunchReportMetrics, codigo: CodigoInvariante) {
  return validateLaunchReport(m).invariantes.find((i) => i.codigo === codigo)!;
}

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

describe("fixture coerente", () => {
  it("os 9 invariantes passam (A6 skipped, que é o correto sem destaques)", () => {
    const r = validateLaunchReport(metrica());
    expect(r.bloqueado).toBe(false);
    expect(r.violacoes).toHaveLength(0);
    expect(r.invariantes).toHaveLength(9);
    const falhas = r.invariantes.filter((i) => i.status === "failed");
    expect(falhas).toEqual([]);
    expect(status(metrica(), "A6").status).toBe("skipped");
  });

  it("não gera alerta nenhum", () => {
    expect(validateLaunchReport(metrica()).alertas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A1..A9 — positivo e negativo
// ---------------------------------------------------------------------------

describe("A1 — INV_QUENTE + INV_FRIO == INV", () => {
  it("positivo", () => expect(status(metrica(), "A1").status).toBe("passed"));

  it("negativo: campanha sem hot/cold sumiu do split", () => {
    const m = metrica();
    m.investimento.frio = 300; // some R$ 100
    const r = status(m, "A1");
    expect(r.status).toBe("failed");
    expect(r.detalhe).toContain("900,00");
    expect(r.detalhe).toContain("1.000,00");
    expect(r.acao).toContain("hot/cold");
  });

  it("tolerância de 0,01 é respeitada nos dois lados", () => {
    const dentro = metrica();
    dentro.investimento.frio = 400 - TOLERANCIAS.A1;
    expect(status(dentro, "A1").status).toBe("passed");

    const fora = metrica();
    fora.investimento.frio = 400 - TOLERANCIAS.A1 * 2;
    expect(status(fora, "A1").status).toBe("failed");
  });
});

describe("A2 — Σ ingressos por origem == únicos", () => {
  it("positivo", () => expect(status(metrica(), "A2").status).toBe("passed"));

  it("negativo: comprador contado em dois baldes", () => {
    const m = metrica();
    m.ingressos.porOrigem.Pago = 41;
    const r = status(m, "A2");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("dois baldes");
  });

  it("é comparação EXATA — 1 de diferença já falha", () => {
    const m = metrica();
    m.ingressos.unicos = 101;
    expect(status(m, "A2").status).toBe("failed");
  });
});

describe("A3 — Σ faturamento por origem == total", () => {
  it("positivo", () => expect(status(metrica(), "A3").status).toBe("passed"));

  it("negativo: linha órfã de atribuição", () => {
    const m = metrica();
    m.faturamento.porOrigem["Sem Track"] = 439.16;
    const r = status(m, "A3");
    expect(r.status).toBe("failed");
    expect(r.detalhe).toContain("diferença de");
    expect(r.acao).toContain("origem");
  });
});

describe("A4 — captação + order bump == total", () => {
  it("positivo", () => expect(status(metrica(), "A4").status).toBe("passed"));

  it("negativo: produto fora das duas listas", () => {
    const m = metrica();
    m.faturamento.orderBump = 900;
    const r = status(m, "A4");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("wizard de order bumps");
  });
});

describe("A5 — dedupe por e-mail", () => {
  it("positivo", () => expect(status(metrica(), "A5").status).toBe("passed"));

  it("positivo com avulsos sem e-mail somando", () => {
    const m = metrica();
    m.ingressos.emailsDistintos = 95;
    m.ingressos.avulsosSemEmail = 5;
    expect(status(m, "A5").status).toBe("passed");
  });

  it("negativo: dedupe furado", () => {
    const m = metrica();
    m.ingressos.emailsDistintos = 98;
    const r = status(m, "A5");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("lowercase");
  });
});

describe("A6 — reescala de spend dos ads", () => {
  it("skipped sem destaques — nunca 'passed', porque não rodou", () => {
    const r = status(metrica(), "A6");
    expect(r.status).toBe("skipped");
    expect(r.status).not.toBe("passed");
    expect(r.detalhe).toContain("41.4");
  });

  it("positivo quando as visões fecham (tol. R$ 1,00)", () => {
    const m = metrica();
    m.destaques = {
      visoes: [
        { nome: "Quente", invVisao: 600, somaSpendAjustado: 600 },
        { nome: "Frio", invVisao: 400, somaSpendAjustado: 400.5 },
      ],
    };
    expect(status(m, "A6").status).toBe("passed");
  });

  it("negativo: reescala usou o INV errado", () => {
    const m = metrica();
    m.destaques = { visoes: [{ nome: "Quente", invVisao: 600, somaSpendAjustado: 1000 }] };
    const r = status(m, "A6");
    expect(r.status).toBe("failed");
    expect(r.detalhe).toContain("Quente");
    expect(r.acao).toContain("INV_visao");
  });
});

describe("A7 — quente + frio <= pagos", () => {
  it("positivo", () => expect(status(metrica(), "A7").status).toBe("passed"));

  it("positivo quando é MENOR (pago sem temperatura é legítimo)", () => {
    const m = metrica();
    m.ingressos.pagoQuente = 20;
    m.ingressos.pagoFrio = 10; // 30 < 40
    expect(status(m, "A7").status).toBe("passed");
  });

  it("negativo: double-count de temperatura", () => {
    const m = metrica();
    m.ingressos.pagoQuente = 30;
    m.ingressos.pagoFrio = 20; // 50 > 40
    const r = status(m, "A7");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("Double-count");
  });
});

describe("A8 — produto em exatamente uma categoria", () => {
  it("positivo", () => expect(status(metrica(), "A8").status).toBe("passed"));

  it("negativo: mesmo produto nas DUAS categorias", () => {
    const m = metrica();
    m.produtos.push({
      nome: "Imersão", categoria: "order_bump", vendas: 0, faturamento: 0,
      pctFaturamento: 0, precoMin: 0, precoMax: 0,
    });
    const r = status(m, "A8");
    expect(r.status).toBe("failed");
    expect(r.detalhe).toContain("Imersão");
  });

  it("negativo: venda que não entrou em nenhum produto", () => {
    const m = metrica();
    m.ingressos.totais = 125; // 5 vendas sem produto agregado
    const r = status(m, "A8");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("sem nome de produto");
  });
});

describe("A9 — identidade do ROAS pago", () => {
  it("positivo — a identidade fecha no fixture", () => {
    const r = status(metrica(), "A9");
    expect(r.status).toBe("passed");
  });

  it("negativo: CTR com link_click e conversão com cliques totais", () => {
    // O caso concreto que a spec descreve. CTR cai para 1,2% (link clicks)
    // enquanto a conversão segue sobre os 2.000 cliques totais — os dois lados
    // deixam de fechar e o A9 tem de pegar.
    const m = metrica();
    m.midia.ctr.valor = 1.2;
    const r = status(m, "A9");
    expect(r.status).toBe("failed");
    expect(r.acao).toContain("MESMOS cliques");
    expect(r.detalhe).toContain("vs ROAS pago");
  });

  it("negativo: ticket exibido não é o dos ingressos pagos únicos", () => {
    const m = metrica();
    m.ticket.pago.valor = 41.7; // ticket total no lugar do ticket pago
    expect(status(m, "A9").status).toBe("failed");
  });

  it("negativo: ROAS pago que não corresponde aos fatores exibidos", () => {
    const m = metrica();
    m.roas.pago.valor = 1.5;
    expect(status(m, "A9").status).toBe("failed");
  });

  it("NÃO é tautologia — mexer num fator do catálogo tem de quebrar", () => {
    // Se o A9 recalculasse tudo dos crus, este teste passaria (e o invariante
    // seria inútil): a identidade seria algebricamente sempre verdadeira.
    const m = metrica();
    m.midia.cpm.valor = 20; // o dobro do real
    expect(status(m, "A9").status).toBe("failed");
  });

  it("skipped quando um dos fatores é zero — não é falha, é inavaliável", () => {
    const m = metrica();
    m.midia.cliques = 0;
    const r = status(m, "A9");
    expect(r.status).toBe("skipped");
    expect(r.status).not.toBe("failed");
  });

  it("skipped com investimento zero", () => {
    const m = metrica();
    m.investimento.comImposto = 0;
    expect(status(m, "A9").status).toBe("skipped");
  });

  it("skipped quando o CPM do catálogo é zero — sem divisão por zero", () => {
    const m = metrica();
    m.midia.cpm.valor = 0;
    expect(status(m, "A9").status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Bloqueio
// ---------------------------------------------------------------------------

describe("bloqueio (AC2)", () => {
  it("assertLaunchReport lança 422 com código, detalhe numérico e ação", () => {
    const m = metrica();
    m.faturamento.orderBump = 900;
    expect(() => assertLaunchReport(m)).toThrow(InvarianteVioladoError);
    try {
      assertLaunchReport(m);
    } catch (e) {
      const r = (e as InvarianteVioladoError).toResponse();
      expect(r.erro).toBe("INVARIANTE_VIOLADO");
      expect(r.codigo).toBe("A4");
      expect(r.detalhe).toMatch(/\d/);
      expect(r.acao.length).toBeGreaterThan(20);
      expect(r.violacoes).toHaveLength(1);
    }
  });

  it("com múltiplas falhas, reporta a PRIMEIRA na ordem A1→A9 e lista todas", () => {
    const m = metrica();
    m.investimento.frio = 300; // A1
    m.faturamento.orderBump = 900; // A4
    const r = validateLaunchReport(m);
    expect(r.violacoes.map((v) => v.codigo)).toEqual(["A1", "A4"]);
    try {
      assertLaunchReport(m);
    } catch (e) {
      expect((e as InvarianteVioladoError).codigo).toBe("A1");
      expect((e as InvarianteVioladoError).violacoes).toHaveLength(2);
    }
  });

  it("cada invariante tem ação PRÓPRIA — nenhuma genérica", () => {
    const acoes = new Set<string>();
    const quebras: [CodigoInvariante, (m: LaunchReportMetrics) => void][] = [
      ["A1", (m) => { m.investimento.frio = 300; }],
      ["A2", (m) => { m.ingressos.porOrigem.Pago = 41; }],
      ["A3", (m) => { m.faturamento.porOrigem.Pago = 2100; }],
      ["A4", (m) => { m.faturamento.orderBump = 900; }],
      ["A5", (m) => { m.ingressos.emailsDistintos = 98; }],
      ["A7", (m) => { m.ingressos.pagoQuente = 90; }],
    ];
    for (const [codigo, quebrar] of quebras) {
      const m = metrica();
      quebrar(m);
      const r = status(m, codigo);
      expect(r.status).toBe("failed");
      expect(r.acao).not.toMatch(/verifique os dados/i);
      acoes.add(r.acao);
    }
    expect(acoes.size).toBe(quebras.length); // todas distintas
  });

  it("invariante que passa não carrega ação", () => {
    expect(status(metrica(), "A1").acao).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Alertas — nunca bloqueiam (AC3)
// ---------------------------------------------------------------------------

describe("alertas W1..W8", () => {
  it("W1 — divergência campaign × ad, com os valores concretos", () => {
    const m = metrica();
    m.divergencias = [
      { campaignId: "1", campaignName: "camp-a", spendCampanha: 14.96, spendAds: 900, diferenca: 885.04 },
    ];
    const r = validateLaunchReport(m);
    const w = r.alertas.find((a) => a.codigo === "W1")!;
    expect(w.mensagem).toContain("camp-a");
    expect(w.mensagem).toContain("14,96");
    expect(r.bloqueado).toBe(false);
  });

  it("W2 — campanha fora da convenção", () => {
    const m = metrica();
    m.campanhas.naoPadrao = [{ campaignId: "9", campaignName: "campanha_estranha" }];
    const w = validateLaunchReport(m).alertas.find((a) => a.codigo === "W2")!;
    expect(w.mensagem).toContain("campanha_estranha");
  });

  it("W3 — anúncio com spend corrompido", () => {
    const m = metrica();
    m.adsComSpendSuspeito = [{ adName: "ad-x", spend: 14.96, impressoes: 27_035 }];
    const w = validateLaunchReport(m).alertas.find((a) => a.codigo === "W3")!;
    expect(w.mensagem).toContain("ad-x");
    expect(w.mensagem).toContain("27.035");
  });

  it("W4 — coluna de preço contaminada, com o limite exclusivo", () => {
    const noLimite = metrica();
    noLimite.precoDistintoPorProduto = { Imersão: LIMIARES_ALERTA.precosDistintos };
    expect(validateLaunchReport(noLimite).alertas.find((a) => a.codigo === "W4")).toBeUndefined();

    const acima = metrica();
    acima.precoDistintoPorProduto = { Imersão: LIMIARES_ALERTA.precosDistintos + 1 };
    const w = validateLaunchReport(acima).alertas.find((a) => a.codigo === "W4")!;
    expect(w.mensagem).toContain("Imersão");
  });

  it("W4 NÃO bloqueia, apesar de a §2.4 dizer 'bloquear'", () => {
    // Contradição interna da spec: §2.4 manda bloquear, §8.2 e a Story 41.3
    // tratam como alerta. Seguimos a 41.3 — decisão registrada.
    const m = metrica();
    m.precoDistintoPorProduto = { Imersão: 99 };
    expect(validateLaunchReport(m).bloqueado).toBe(false);
  });

  it("W5 — taxa de resposta baixa", () => {
    const m = metrica();
    m.pesquisa.taxaResposta.valor = 63.3;
    m.pesquisa.respondentes = 890;
    m.ingressos.unicos = 1410;
    m.ingressos.porOrigem = { Pago: 1410, "Orgânico": 0, "Sem Track": 0 };
    m.ingressos.emailsDistintos = 1410;
    const w = validateLaunchReport(m).alertas.find((a) => a.codigo === "W5")!;
    expect(w.mensagem).toContain("63,3");
    expect(w.mensagem).toContain("890");
  });

  it("W5 não dispara exatamente no limiar de 75%", () => {
    const m = metrica();
    m.pesquisa.taxaResposta.valor = LIMIARES_ALERTA.taxaResposta;
    expect(validateLaunchReport(m).alertas.find((a) => a.codigo === "W5")).toBeUndefined();
  });

  it("W6 — vendas pagas sem ad_name; não avaliado enquanto o campo não existir", () => {
    const semCampo = metrica();
    expect(validateLaunchReport(semCampo).alertas.find((a) => a.codigo === "W6")).toBeUndefined();

    const m = metrica();
    m.pctVendasPagasSemAdName = 34.5;
    const w = validateLaunchReport(m).alertas.find((a) => a.codigo === "W6")!;
    expect(w.mensagem).toContain("34,5");
  });

  it("W7 — linhas de moeda estrangeira convertidas", () => {
    const m = metrica();
    m.linhasConvertidas = 7;
    const w = validateLaunchReport(m).alertas.find((a) => a.codigo === "W7")!;
    expect(w.mensagem).toContain("7");
  });

  it("W8 — lote da Meta no limite de paginação", () => {
    const w = validateLaunchReport(metrica(), { loteNoLimite: true }).alertas.find(
      (a) => a.codigo === "W8",
    )!;
    expect(w.mensagem).toContain("limite de paginação");
  });

  it("oito alertas ao mesmo tempo não bloqueiam nada", () => {
    const m = metrica();
    m.divergencias = [{ campaignId: "1", campaignName: "c", spendCampanha: 1, spendAds: 900, diferenca: 899 }];
    m.campanhas.naoPadrao = [{ campaignId: "2", campaignName: "x" }];
    m.adsComSpendSuspeito = [{ adName: "a", spend: 1, impressoes: 5000 }];
    m.precoDistintoPorProduto = { Imersão: 99 };
    m.pesquisa.taxaResposta.valor = 10;
    m.pctVendasPagasSemAdName = 90;
    m.linhasConvertidas = 3;
    const r = validateLaunchReport(m, { loteNoLimite: true });
    expect(r.alertas).toHaveLength(8);
    expect(r.bloqueado).toBe(false);
    expect(() => assertLaunchReport(m, { loteNoLimite: true })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Conferência externa (AC4)
// ---------------------------------------------------------------------------

describe("conferência externa (§8.3)", () => {
  it("sem investimentoOficial → skipped, nunca derivado de outra fonte", () => {
    const c = validateLaunchReport(metrica()).conferencia;
    expect(c.status).toBe("skipped");
    expect(c.investimentoOficial).toBeNull();
    expect(c.delta).toBeNull();
  });

  it("delta <= 0,05% → passa em silêncio", () => {
    const c = validateLaunchReport(metrica(), { investimentoOficial: 1000.3 }).conferencia;
    expect(c.status).toBe("passed");
  });

  it("0,05% < delta <= 0,5% → alerta, sem bloquear", () => {
    // 1.000 vs 1.002 = 0,2%
    const r = validateLaunchReport(metrica(), { investimentoOficial: 1002 });
    expect(r.conferencia.status).toBe("alerta");
    expect(r.bloqueado).toBe(false);
    expect(r.conferencia.detalhe).toContain("drift");
  });

  it("delta > 0,5% → bloqueia", () => {
    const r = validateLaunchReport(metrica(), { investimentoOficial: 1100 });
    expect(r.conferencia.status).toBe("failed");
    expect(r.bloqueado).toBe(true);
    expect(() => assertLaunchReport(metrica(), { investimentoOficial: 1100 })).toThrow(
      ConferenciaExternaError,
    );
  });

  it("o erro de conferência traz os dois valores e o delta em %", () => {
    try {
      assertLaunchReport(metrica(), { investimentoOficial: 1100 });
    } catch (e) {
      const r = (e as ConferenciaExternaError).toResponse();
      expect(r.erro).toBe("CONFERENCIA_EXTERNA");
      expect(r.detalhe).toContain("1.000,00");
      expect(r.detalhe).toContain("1.100,00");
      expect(r.conferencia.delta).toBeCloseTo(0.0909, 4);
    }
  });

  it("os limiares são exatamente os da spec", () => {
    expect(LIMIAR_CONFERENCIA.bloqueio).toBe(0.005);
    expect(LIMIAR_CONFERENCIA.alerta).toBe(0.0005);
  });

  it("oficial zero ou negativo → skipped, sem dividir por zero", () => {
    expect(validateLaunchReport(metrica(), { investimentoOficial: 0 }).conferencia.status).toBe("skipped");
    expect(validateLaunchReport(metrica(), { investimentoOficial: -5 }).conferencia.status).toBe("skipped");
  });

  it("a conferência NÃO vira um alerta de código emprestado", () => {
    const r = validateLaunchReport(metrica(), { investimentoOficial: 1002 });
    expect(r.alertas).toEqual([]);
    expect(r.conferencia.status).toBe("alerta");
  });
});

// ---------------------------------------------------------------------------
// Ponto flutuante
// ---------------------------------------------------------------------------

describe("comparação de ponto flutuante", () => {
  it("não arredonda antes de comparar — centavos acumulados são detectados", () => {
    const m = metrica();
    // 0,004 arredondaria para 0,00 em 2 casas e passaria despercebido se o
    // código usasse toFixed(2). Está DENTRO da tolerância de 0,01, então passa —
    // mas por tolerância explícita, não por mascaramento.
    m.faturamento.captacao = 4000.004;
    expect(status(m, "A4").status).toBe("passed");

    // 0,02 está fora e precisa falhar.
    m.faturamento.captacao = 4000.02;
    expect(status(m, "A4").status).toBe("failed");
  });

  it("soma de floats típica não gera falso negativo", () => {
    const m = metrica();
    m.investimento.quente = 0.1 + 0.2;
    m.investimento.frio = 0.7;
    m.investimento.comImposto = 1.0;
    expect(status(m, "A1").status).toBe("passed");
  });
});
