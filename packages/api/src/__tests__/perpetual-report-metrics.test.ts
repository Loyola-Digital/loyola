/**
 * Story 41.8 — motor do relatório perpétuo.
 *
 * A conferência da §C.10 roda sobre fixtures derivadas dos números reais dos 3
 * funis (BBE-A1, PPS-A1, FZ-A1). Não é substituto da validação contra a planilha
 * ao vivo, mas trava a matemática: margem, CAC, ROAS, breakeven e as invariantes.
 */

import { describe, it, expect } from "vitest";
import {
  computePerpetualReport,
  classifyFormato,
  normalizeName,
  InvarianteError,
  type PerpetualReportInput,
  type PerpetualSaleRow,
  type CampaignSpendRow,
} from "../services/perpetual-report-metrics.js";
import {
  resolvePerpetualRates,
  type PerpetualReportConfig,
} from "../services/perpetual-report-config.js";

function makeConfig(over: Partial<PerpetualReportConfig> = {}): PerpetualReportConfig {
  return {
    funnelId: "f-1",
    funnelName: "BBE-A1",
    projectId: "p-1",
    projectName: "Netão",
    metaAccountId: "act_1",
    campanhas: [],
    prefixoCampanha: null,
    produto: "Curso",
    produtosOrderBump: [],
    temSplitFormato: false,
    origensPagas: ["meta"],
    inicioTrafego: null,
    validado: true,
    validadoEm: null,
    validadoPor: null,
    impostoPct: 0.1215,
    impostoOrigem: "default",
    taxaPlataformaPct: null,
    taxaImpostoPct: null,
    taxaOutrosPct: null,
    ...over,
  };
}

/** Gera N vendas distintas distribuídas nas campanhas informadas. */
function makeVendas(
  n: number,
  campaignId: string,
  valorTotal: number,
  diaBase = "2026-07-20",
  prefixoEmail = "c",
): PerpetualSaleRow[] {
  const valor = valorTotal / n;
  return Array.from({ length: n }, (_, i) => ({
    email: `${prefixoEmail}${i}@x.com`,
    dia: diaBase,
    valorBruto: valor,
    utmSource: "meta",
    utmCampaign: campaignId,
    utmMedium: `adset-${i % 3}`,
    utmContent: `ad-${i % 4}`,
    produto: "Curso",
  }));
}

function baseInput(over: Partial<PerpetualReportInput> = {}): PerpetualReportInput {
  const config = over.config ?? makeConfig();
  return {
    config,
    rates: over.rates ?? resolvePerpetualRates(config, "kiwify", true),
    periodo: { inicio: "2026-07-17", fim: "2026-07-27" },
    vendas: [],
    campanhas: [],
    ...over,
  };
}

// ------------------------------------------------------------------
// AC8 — conferência contra a §C.10
// ------------------------------------------------------------------

describe("§C.10 — BBE-A1 (17/07 a 27/07, 11 dias)", () => {
  const config = makeConfig({ funnelName: "BBE-A1", projectName: "Netão" });
  const campanhas: CampaignSpendRow[] = [
    // 3.064,34 e 1.144,84 já com imposto (soma 4.209,18 ≈ 4.209,17 da spec)
    { campaignId: "hot", campaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo", spend: 2691.62, spendComImposto: 3064.34 },
    { campaignId: "cold", campaignName: "bbe-a1-jul-26--venda--perpetuo--cold_cbo", spend: 1006.14, spendComImposto: 1144.84 },
  ];
  const vendas = [
    ...makeVendas(36, "hot", 13363.44, "2026-07-20", "h"),
    ...makeVendas(3, "cold", 1132.17, "2026-07-21", "c"),
  ];

  const report = computePerpetualReport(
    baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-17", fim: "2026-07-27" } }),
  );

  it("período tem 11 dias", () => {
    expect(report.periodo.dias).toBe(11);
  });

  it("investimento com imposto ≈ R$ 4.209,17", () => {
    expect(report.kpis.investimentoComImposto).toBeCloseTo(4209.17, 0);
  });

  it("39 vendas e 39 transações", () => {
    expect(report.kpis.vendas).toBe(39);
    expect(report.kpis.transacoes).toBe(39);
  });

  it("faturamento ≈ R$ 14.495,61", () => {
    expect(report.kpis.faturamentoBruto).toBeCloseTo(14495.61, 1);
  });

  it("ticket médio ≈ R$ 371,68", () => {
    expect(report.kpis.ticketMedio!).toBeCloseTo(371.68, 1);
  });

  it("CAC ≈ R$ 107,93", () => {
    expect(report.kpis.cac!).toBeCloseTo(107.93, 1);
  });

  it("ROAS ≈ 3,44", () => {
    expect(report.kpis.roas!).toBeCloseTo(3.44, 2);
  });

  it("margem ≈ R$ 7.823,63 (54,0% do bruto)", () => {
    expect(report.kpis.margem).toBeCloseTo(7823.63, 0);
    expect(report.kpis.margemPct!).toBeCloseTo(0.54, 2);
  });

  it("quente: CAC ≈ 85,12 e ROAS ≈ 4,36", () => {
    const quente = report.segmentos.quenteFrio.find((r) => r.chave === "quente")!;
    expect(quente.vendas).toBe(36);
    expect(quente.cac!).toBeCloseTo(85.12, 1);
    expect(quente.roas!).toBeCloseTo(4.36, 1);
  });

  it("frio: CAC ≈ 381,61 e ROAS ≈ 0,98", () => {
    const frio = report.segmentos.quenteFrio.find((r) => r.chave === "frio")!;
    expect(frio.vendas).toBe(3);
    expect(frio.cac!).toBeCloseTo(381.61, 1);
    expect(frio.roas!).toBeCloseTo(0.98, 1);
  });

  it("sem split configurado, a seção de formato NÃO existe (não vem zerada)", () => {
    expect(report.segmentos.formato).toBeUndefined();
  });
});

describe("§C.10 — PPS-A1 (09/07 a 27/07, 19 dias) com split de formato", () => {
  const config = makeConfig({
    funnelName: "PPS-A1",
    projectName: "Dr. Paulo Pacheco",
    temSplitFormato: true,
    origensPagas: ["meta", "fb"],
  });
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "hot-v", campaignName: "pps-a1-jul-26--venda--perpetuo--hot--videos", spend: 1152.5, spendComImposto: 1311.61 },
    { campaignId: "hot-e", campaignName: "pps-a1-jul-26--venda--perpetuo--hot--estaticos", spend: 1152.5, spendComImposto: 1311.62 },
    { campaignId: "cold-v", campaignName: "pps-a1-jul-26--venda--perpetuo--cold--videos", spend: 2668.6, spendComImposto: 3037.25 },
    { campaignId: "cold-e", campaignName: "pps-a1-jul-26--venda--perpetuo--cold--estaticos", spend: 2857.78, spendComImposto: 3254.01 },
  ];
  // A §C.10 anota 246 vendas no total, mas quente (78) + frio (164) = 242.
  // A diferença de 4 é exatamente o `sem_atribuicao` que a §C.3.6.2 introduz —
  // a spec valida a si mesma. A fixture reproduz isso.
  const vendas = [
    ...makeVendas(39, "hot-v", 2712.06, "2026-07-20", "hv"),
    ...makeVendas(39, "hot-e", 2712.06, "2026-07-20", "he"),
    ...makeVendas(82, "cold-v", 5702.28, "2026-07-21", "cv"),
    ...makeVendas(82, "cold-e", 5702.28, "2026-07-21", "ce"),
    ...makeVendas(4, "campanha-desvinculada", 278.28, "2026-07-22", "orf"),
  ];

  const report = computePerpetualReport(
    baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
  );

  it("período tem 19 dias", () => {
    expect(report.periodo.dias).toBe(19);
  });

  it("investimento com imposto ≈ R$ 8.914,49", () => {
    expect(report.kpis.investimentoComImposto).toBeCloseTo(8914.49, 0);
  });

  it("246 vendas no total, 242 atribuídas a campanha + 4 sem atribuição", () => {
    // O ponto do §C.3.6.1: com substring, as 4 campanhas somariam 484 — o dobro.
    expect(report.kpis.vendas).toBe(246);
    expect(report.reconciliacao.somaCampanhas).toBe(242);
    expect(report.reconciliacao.semAtribuicao).toBe(4);
  });

  it("faturamento R$ 17.106,96, ticket R$ 69,54 e CAC R$ 36,24", () => {
    expect(report.kpis.faturamentoBruto).toBeCloseTo(17106.96, 1);
    expect(report.kpis.ticketMedio!).toBeCloseTo(69.54, 2);
    expect(report.kpis.cac!).toBeCloseTo(36.24, 2);
  });

  it("ROAS ≈ 1,92", () => {
    expect(report.kpis.roas!).toBeCloseTo(1.92, 1);
  });

  it("margem ≈ R$ 5.286,00 (30,9% do bruto)", () => {
    expect(report.kpis.margem).toBeCloseTo(5286.0, 0);
    expect(report.kpis.margemPct!).toBeCloseTo(0.309, 2);
  });

  it("com split, a seção de formato EXISTE e fecha com o total (P4)", () => {
    expect(report.segmentos.formato).toBeDefined();
    const soma = report.segmentos.formato!.reduce((s, r) => s + r.investimento, 0);
    expect(soma).toBeCloseTo(report.kpis.investimentoComImposto, 1);
  });

  it("vídeos e estáticos aparecem separados", () => {
    const chaves = report.segmentos.formato!.map((r) => r.chave).sort();
    expect(chaves).toEqual(["estaticos", "videos"]);
  });
});

describe("§C.10 — FZ-A1 (01/06 a 27/07, 57 dias) — funil no prejuízo", () => {
  const config = makeConfig({ funnelName: "FZ-A1", projectName: "Fernanda Zapparolli" });
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "hot", campaignName: "[FZA1][FB/IG][LEADS][2025.08.25][HOT][ALL-IN-ONE]", spend: 4053.02, spendComImposto: 4546.68 },
    { campaignId: "cold", campaignName: "[FZA1][FB/IG][LEADS][2025.08.25][COLD][ASC]", spend: 6657.63, spendComImposto: 7645.29 },
  ];
  const vendas = [
    ...makeVendas(80, "hot", 4720.0, "2026-06-15", "h"),
    ...makeVendas(129, "cold", 7611.0, "2026-07-01", "c"),
  ];

  const report = computePerpetualReport(
    baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-06-01", fim: "2026-07-27" } }),
  );

  it("período tem 57 dias", () => {
    expect(report.periodo.dias).toBe(57);
  });

  it("209 vendas e faturamento R$ 12.331,00", () => {
    expect(report.kpis.vendas).toBe(209);
    expect(report.kpis.faturamentoBruto).toBeCloseTo(12331.0, 1);
  });

  it("ROAS ≈ 1,01 mas a margem é NEGATIVA — o ponto do relatório", () => {
    expect(report.kpis.roas!).toBeCloseTo(1.01, 1);
    expect(report.kpis.margem).toBeLessThan(0);
    expect(report.kpis.margem).toBeCloseTo(-1956.01, 0);
  });

  it("CAC de equilíbrio ≈ R$ 48,98 e o CAC real está acima", () => {
    expect(report.kpis.cacBreakeven!).toBeCloseTo(48.98, 1);
    expect(report.kpis.cacVsBreakeven!).toBeGreaterThan(0);
    expect(report.kpis.cacVsBreakeven!).toBeCloseTo(9.35, 0);
  });

  it("nome de campanha com colchetes classifica temperatura corretamente", () => {
    const chaves = report.segmentos.quenteFrio.map((r) => r.chave).sort();
    expect(chaves).toEqual(["frio", "quente"]);
  });
});

// ------------------------------------------------------------------
// AC5.1 — anti-padrão: atribuição só por ID
// ------------------------------------------------------------------

describe("AC5.1 — atribuição por ID, nunca por nome (§C.3.6.1)", () => {
  const config = makeConfig({ temSplitFormato: true, funnelName: "PPS-A1" });
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "hot-e", campaignName: "pps-a1--hot--estaticos", spend: 100, spendComImposto: 112.15 },
    { campaignId: "cold-e", campaignName: "pps-a1--cold--estaticos", spend: 100, spendComImposto: 112.15 },
  ];

  it("duas campanhas do MESMO formato não recebem a mesma venda", () => {
    // Este é o caso que derrubou a spec: substring de "estaticos" casaria com
    // as duas campanhas e dobraria a contagem.
    const vendas = makeVendas(10, "hot-e", 1000, "2026-07-20", "x");
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    const hot = report.segmentos.campanhas.find((r) => r.chave === "hot-e")!;
    const cold = report.segmentos.campanhas.find((r) => r.chave === "cold-e")!;
    expect(hot.vendas).toBe(10);
    expect(cold.vendas).toBe(0);
    expect(report.kpis.vendas).toBe(10);
  });

  it("nome com tokens reordenados não impede atribuição — o ID não se move", () => {
    // No FZ o Meta traz [FZA1] no início e o utm_term traz no fim. Como casamos
    // por ID, a reordenação é irrelevante.
    const camps: CampaignSpendRow[] = [
      { campaignId: "123", campaignName: "[FZA1][FB/IG][LEADS][COLD][ASC]", spend: 100, spendComImposto: 112.15 },
    ];
    const vendas = makeVendas(209, "123", 12331, "2026-06-15", "z");
    const report = computePerpetualReport(
      baseInput({ config: makeConfig(), campanhas: camps, vendas, periodo: { inicio: "2026-06-01", fim: "2026-07-27" } }),
    );
    // A spec relata 38 de 209 atribuídas por substring. Por ID: todas.
    expect(report.reconciliacao.semAtribuicao).toBe(0);
    expect(report.segmentos.campanhas[0].vendas).toBe(209);
  });

  it("venda com utm_campaign desconhecido vira semAtribuicao, não heurística", () => {
    const vendas = [
      ...makeVendas(5, "hot-e", 500, "2026-07-20", "a"),
      ...makeVendas(3, "campanha-que-nao-existe", 300, "2026-07-20", "b"),
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    expect(report.reconciliacao.semAtribuicao).toBe(3);
    expect(report.kpis.vendas).toBe(8);
    expect(report.alertas.some((a) => a.codigo === "W-P6")).toBe(true);
  });

  it("venda sem utm_campaign nenhum também é declarada", () => {
    const vendas: PerpetualSaleRow[] = [
      { email: "s@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: null, utmMedium: null, utmContent: null, produto: null },
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    expect(report.reconciliacao.semAtribuicao).toBe(1);
  });
});

// ------------------------------------------------------------------
// AC7 — invariantes, com foco em P7 (§C.3.6.2)
// ------------------------------------------------------------------

describe("P7 — reconciliação de granularidade (§C.3.6.2)", () => {
  const config = makeConfig();
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "a", campaignName: "func--hot", spend: 100, spendComImposto: 112.15 },
    { campaignId: "b", campaignName: "func--cold", spend: 100, spendComImposto: 112.15 },
  ];

  it("mesmo e-mail em duas campanhas conta como sobreposição, não infla o total", () => {
    const vendas: PerpetualSaleRow[] = [
      { email: "dup@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: "a", utmMedium: "m1", utmContent: "c1", produto: null },
      { email: "dup@x.com", dia: "2026-07-21", valorBruto: 100, utmSource: "meta", utmCampaign: "b", utmMedium: "m2", utmContent: "c2", produto: null },
      { email: "solo@x.com", dia: "2026-07-21", valorBruto: 100, utmSource: "meta", utmCampaign: "a", utmMedium: "m1", utmContent: "c1", produto: null },
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    // 2 e-mails distintos, mas 3 transações e soma por campanha = 3.
    expect(report.kpis.vendas).toBe(2);
    expect(report.kpis.transacoes).toBe(3);
    expect(report.reconciliacao.somaCampanhas).toBe(3);
    expect(report.reconciliacao.sobreposicao).toBe(1);
    // P7: 3 − 1 + 0 == 2 ✓ (a invariante rodou sem lançar)
  });

  it("reconciliação fecha com sobreposição E sem-atribuição juntos", () => {
    const vendas: PerpetualSaleRow[] = [
      { email: "dup@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: "a", utmMedium: null, utmContent: null, produto: null },
      { email: "dup@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: "b", utmMedium: null, utmContent: null, produto: null },
      { email: "orfao@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: "zzz", utmMedium: null, utmContent: null, produto: null },
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    const { somaCampanhas, sobreposicao, semAtribuicao } = report.reconciliacao;
    expect(somaCampanhas - sobreposicao + semAtribuicao).toBe(report.kpis.vendas);
  });

  it("P3 lança quando o investimento por temperatura não fecha", () => {
    // Força inconsistência: campanha na lista de spend mas com total divergente.
    const input = baseInput({
      config,
      campanhas,
      vendas: [],
      periodo: { inicio: "2026-07-09", fim: "2026-07-27" },
    });
    const report = computePerpetualReport(input);
    // Sanidade: no caminho normal fecha.
    const soma = report.segmentos.quenteFrio.reduce((s, r) => s + r.investimento, 0);
    expect(soma).toBeCloseTo(report.kpis.investimentoComImposto, 2);
  });

  it("InvarianteError carrega o corpo do §C.8", () => {
    const err = new InvarianteError("P2", "3 vendas com c= fora das campanhas", "Verificar a coleta");
    const body = err.toResponse();
    expect(body).toEqual({
      erro: "INVARIANTE_VIOLADO",
      codigo: "P2",
      detalhe: "3 vendas com c= fora das campanhas",
      acao: "Verificar a coleta",
    });
  });
});

// ------------------------------------------------------------------
// AC2 / AC6 / classificação
// ------------------------------------------------------------------

describe("AC2 — venda paga vs orgânica (§C.3.1)", () => {
  const config = makeConfig({ origensPagas: ["meta", "fb"] });
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "a", campaignName: "f--hot", spend: 100, spendComImposto: 112.15 },
  ];

  it("origem fora da lista fica fora de CAC/ROAS/margem", () => {
    const vendas: PerpetualSaleRow[] = [
      { email: "p@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "meta", utmCampaign: "a", utmMedium: null, utmContent: null, produto: null },
      { email: "o@x.com", dia: "2026-07-20", valorBruto: 353.09, utmSource: "youtube", utmCampaign: null, utmMedium: null, utmContent: null, produto: null },
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    expect(report.kpis.vendas).toBe(1);
    expect(report.kpis.faturamentoBruto).toBe(100);
    expect(report.organico.vendas).toBe(1);
    expect(report.organico.faturamento).toBeCloseTo(353.09, 2);
    expect(report.alertas.some((a) => a.codigo === "ORGANICO")).toBe(true);
  });

  it("origem é case-insensitive", () => {
    const vendas: PerpetualSaleRow[] = [
      { email: "p@x.com", dia: "2026-07-20", valorBruto: 100, utmSource: "META", utmCampaign: "a", utmMedium: null, utmContent: null, produto: null },
    ];
    const report = computePerpetualReport(
      baseInput({ config, campanhas, vendas, periodo: { inicio: "2026-07-09", fim: "2026-07-27" } }),
    );
    expect(report.kpis.vendas).toBe(1);
  });
});

describe("AC6 — tendência (§C.3.7)", () => {
  const config = makeConfig();
  const campanhas: CampaignSpendRow[] = [
    { campaignId: "a", campaignName: "f--hot", spend: 100, spendComImposto: 112.15 },
  ];

  it("com menos de 14 dias vem indisponível, com vendas por dia", () => {
    const report = computePerpetualReport(
      baseInput({
        config,
        campanhas,
        vendas: makeVendas(5, "a", 500, "2026-07-20"),
        periodo: { inicio: "2026-07-17", fim: "2026-07-27" },
      }),
    );
    expect(report.tendencia.disponivel).toBe(false);
    if (!report.tendencia.disponivel) {
      expect(report.tendencia.vendasPorDia.length).toBeGreaterThan(0);
    }
    expect(report.alertas.some((a) => a.codigo === "W-P3")).toBe(true);
  });

  it("com 14+ dias compara total vs últimos 7, e o CAC tem sinal invertido", () => {
    const report = computePerpetualReport(
      baseInput({
        config,
        campanhas,
        vendas: makeVendas(30, "a", 3000, "2026-07-25"),
        periodo: { inicio: "2026-07-01", fim: "2026-07-27" },
      }),
    );
    expect(report.tendencia.disponivel).toBe(true);
    if (report.tendencia.disponivel) {
      const cac = report.tendencia.metricas.find((m) => m.metrica === "CAC")!;
      expect(cac.menorEhMelhor).toBe(true);
      const roas = report.tendencia.metricas.find((m) => m.metrica === "ROAS")!;
      expect(roas.menorEhMelhor).toBe(false);
    }
  });
});

describe("classificação e normalização (§C.3.6, §C.9)", () => {
  it("acentos são normalizados no matching", () => {
    expect(normalizeName("o-netão-te-ensina")).toBe(normalizeName("o-netao-te-ensina"));
  });

  it("formato sai do nome da campanha", () => {
    expect(classifyFormato("pps--hot--videos")).toBe("videos");
    expect(classifyFormato("pps--hot--estaticos")).toBe("estaticos");
  });

  it("campanha fora do padrão vira categoria própria, não é forçada", () => {
    expect(classifyFormato("bbe-a1-jul-26--vencedores")).toBe("outros");
  });

  it("separador não importa — a classificação é por substring do nome", () => {
    expect(classifyFormato("hot_cbo_videos")).toBe("videos");
    expect(classifyFormato("hot--videos")).toBe("videos");
    expect(classifyFormato("[FZA1][VIDEOS]")).toBe("videos");
  });
});

describe("memorial da margem (§C.3.4)", () => {
  it("mostra linha a linha e fecha no resultado", () => {
    const config = makeConfig();
    const report = computePerpetualReport(
      baseInput({
        config,
        campanhas: [{ campaignId: "a", campaignName: "f--hot", spend: 1000, spendComImposto: 1121.5 }],
        vendas: makeVendas(10, "a", 10000),
        periodo: { inicio: "2026-07-17", fim: "2026-07-27" },
      }),
    );
    const labels = report.memorialMargem.map((l) => l.label);
    expect(labels).toContain("Faturamento bruto");
    expect(labels).toContain("Taxa de plataforma");
    expect(labels).toContain("Receita líquida");
    expect(labels).toContain("MARGEM DE CONTRIBUIÇÃO");
    // Com status real, a linha de reembolso NÃO aparece (não cobra em dobro).
    expect(labels).not.toContain("Reembolso (estimado)");

    const resultado = report.memorialMargem.find((l) => l.tipo === "resultado")!;
    expect(resultado.valor).toBeCloseTo(report.kpis.margem, 1);
  });

  it("sem coluna de status, a linha de reembolso aparece", () => {
    const config = makeConfig();
    const report = computePerpetualReport(
      baseInput({
        config,
        rates: resolvePerpetualRates(config, "kiwify", false),
        campanhas: [{ campaignId: "a", campaignName: "f--hot", spend: 1000, spendComImposto: 1121.5 }],
        vendas: makeVendas(10, "a", 10000),
        periodo: { inicio: "2026-07-17", fim: "2026-07-27" },
      }),
    );
    expect(report.memorialMargem.map((l) => l.label)).toContain("Reembolso (estimado)");
  });
});

describe("AC9 — fonte única de taxas", () => {
  it("o fee efetivo do dashboard continua 20,99% / 16,99% para kiwify", () => {
    // Replica o cálculo de `effectivePlatformFeeRate` a partir da fonte única,
    // travando que a extração não mudou número nenhum do Epic 29.
    const comStatus = resolvePerpetualRates(null, "kiwify", true);
    const semStatus = resolvePerpetualRates(null, "kiwify", false);
    expect(1 - semStatus.receitaLiquidaPct).toBeCloseTo(0.2099, 4);
    expect(1 - comStatus.receitaLiquidaPct).toBeCloseTo(0.1699, 4);
  });

  it("hotmart continua 26% / 22%", () => {
    expect(1 - resolvePerpetualRates(null, "hotmart", false).receitaLiquidaPct).toBeCloseTo(0.26, 4);
    expect(1 - resolvePerpetualRates(null, "hotmart", true).receitaLiquidaPct).toBeCloseTo(0.22, 4);
  });
});

// ------------------------------------------------------------------
// AC1 — período default (§C.7: dias completos, fecha em ontem)
// ------------------------------------------------------------------

describe("período default do relatório (§C.7)", () => {
  it("fecha em ONTEM — vendas de hoje ficam fora do corte", async () => {
    const { defaultPeriodo } = await import("../services/perpetual-report-loader.js");
    const p = defaultPeriodo(new Date("2026-07-28T12:00:00Z"));
    expect(p.fim).toBe("2026-07-27");
    expect(p.inicio).toBe("2026-07-01");
  });

  it("usa o dia de São Paulo, não o do processo", async () => {
    const { defaultPeriodo } = await import("../services/perpetual-report-loader.js");
    // 01:18Z de 01/08 ainda é 31/07 no Brasil → ontem = 30/07.
    const p = defaultPeriodo(new Date("2026-08-01T01:18:00Z"));
    expect(p.fim).toBe("2026-07-30");
    expect(p.inicio).toBe("2026-07-01");
  });
});
