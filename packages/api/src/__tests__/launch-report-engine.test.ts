import { describe, it, expect } from "vitest";
import {
  computeLaunchReportMetrics,
  LIMIAR_DIVERGENCIA_RECONCILIACAO,
  type CampanhaInput,
  type VendaInput,
  type ComputeLaunchReportInput,
} from "../services/launch-report-engine";

/**
 * Story 41.2 — conferência contra a §10
 * (`docs/specs/epic-41-valores-conferencia.md`).
 *
 * A estratégia: construir um fixture cujos **agregados** são exatamente os da
 * §10 e verificar que as métricas derivadas saem nos valores conferidos. Isso
 * valida os denominadores do §3 — que é onde a spec mais insiste e onde um erro
 * viraria número errado em dois dashboards.
 *
 * A conferência ponta a ponta (contra o banco real) é a task da 41.5 AC9; aqui
 * a matemática é isolada e roda sem credencial nenhuma.
 */

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function campanha(over: Partial<CampanhaInput> & { campaignName: string }): CampanhaInput {
  const spendBruto = over.spendBruto ?? 0;
  return {
    campaignId: over.campaignId ?? over.campaignName,
    campaignName: over.campaignName,
    spendBruto,
    spendAdsBruto: over.spendAdsBruto ?? null,
    impressoes: over.impressoes ?? 0,
    cliques: over.cliques ?? 0,
    spendComImposto: over.spendComImposto ?? spendBruto,
  };
}

/**
 * Gera `n` compradores distintos, cada um com uma linha de captação, somando
 * exatamente `faturamento`. O resto da divisão vai na primeira linha para a
 * soma fechar no centavo.
 */
function compradores(
  n: number,
  faturamento: number,
  opts: { prefixo: string; utmSource: string | null; utmTerm: string | null },
): VendaInput[] {
  if (n === 0) return [];
  const base = Math.round((faturamento / n) * 100) / 100;
  const linhas: VendaInput[] = [];
  for (let i = 0; i < n; i += 1) {
    linhas.push({
      email: `${opts.prefixo}${i}@teste.com`,
      txId: `tx-${opts.prefixo}${i}`,
      produto: "Imersão",
      valorBrl: base,
      dia: "2026-04-20",
      utmSource: opts.utmSource,
      utmTerm: opts.utmTerm,
      utmContent: null,
      isOrderBump: false,
    });
  }
  const soma = base * n;
  const ajuste = Math.round((faturamento - soma) * 100) / 100;
  linhas[0]!.valorBrl = Math.round((linhas[0]!.valorBrl + ajuste) * 100) / 100;
  return linhas;
}

const INPUT_BASE: Omit<ComputeLaunchReportInput, "campanhas" | "vendas"> = {
  periodo: { inicio: "2026-04-17", fim: "2026-05-09" },
  impostoPct: 0.1215,
  impostoOrigem: "stage",
  impostoJaAplicado: true,
};

// ---------------------------------------------------------------------------
// §10 — DG-PG02-ABR26
// ---------------------------------------------------------------------------

describe("§10 — DG-PG02-ABR26 (17/04 a 09/05)", () => {
  // Investimento com imposto: quente 73.453,36 + frio 53.112,77.
  // A §10 registra o total como 126.566,14; a soma das partes dá 126.566,13 —
  // 1 centavo de arredondamento da própria spec, absorvido na tolerância.
  const INV_QUENTE = 73_453.36;
  const INV_FRIO = 53_112.77;
  const IMPRESSOES = 2_391_255;
  const CLIQUES = 43_932;

  const FAT_PAGO = 122_089.47;
  const FAT_ORGANICO = 105_128.2;
  const FAT_TOTAL = 233_572.94;
  const ING_PAGOS = 766;
  const ING_ORGANICOS = 612;
  const ING_UNICOS = 1410;

  const campanhas: CampanhaInput[] = [
    campanha({
      campaignName: "dg-pg02-abr-26--vendas-captacao--2026-04-17—hot--cbo--videos",
      spendBruto: INV_QUENTE * (1 - 0.1215),
      spendComImposto: INV_QUENTE,
      impressoes: Math.round(IMPRESSOES * 0.58),
      cliques: Math.round(CLIQUES * 0.58),
    }),
    campanha({
      campaignName: "dg-pg02-abr-26--vendas-captacao--2026-04-17—cold--cbo--videos",
      spendBruto: INV_FRIO * (1 - 0.1215),
      spendComImposto: INV_FRIO,
      impressoes: IMPRESSOES - Math.round(IMPRESSOES * 0.58),
      cliques: CLIQUES - Math.round(CLIQUES * 0.58),
    }),
  ];

  // 766 pagos + 612 orgânicos + 32 sem track = 1.410 ingressos únicos.
  // Faturamento sem track = 233.572,94 − 122.089,47 − 105.128,20 = 6.355,27.
  const vendas: VendaInput[] = [
    ...compradores(ING_PAGOS, FAT_PAGO, {
      prefixo: "pago",
      utmSource: "meta",
      utmTerm: "Instagram_Feed_dg-pg02--vendas-captacao--hot|adset|ad",
    }),
    ...compradores(ING_ORGANICOS, FAT_ORGANICO, {
      prefixo: "org",
      utmSource: "youtube",
      utmTerm: null,
    }),
    ...compradores(ING_UNICOS - ING_PAGOS - ING_ORGANICOS, 6_355.27, {
      prefixo: "semtrack",
      utmSource: null,
      utmTerm: null,
    }),
  ];

  const m = computeLaunchReportMetrics({ ...INPUT_BASE, campanhas, vendas });

  it("investimento: total, split quente/frio e percentuais", () => {
    expect(m.investimento.comImposto).toBeCloseTo(126_566.13, 1);
    expect(m.investimento.quente).toBeCloseTo(INV_QUENTE, 2);
    expect(m.investimento.frio).toBeCloseTo(INV_FRIO, 2);
    expect(m.investimento.pctQuente).toBeCloseTo(58.0, 1);
    expect(m.investimento.pctFrio).toBeCloseTo(42.0, 1);
  });

  it("A1 por construção: INV_QUENTE + INV_FRIO === INV", () => {
    expect(m.investimento.quente + m.investimento.frio).toBeCloseTo(m.investimento.comImposto, 2);
  });

  it("mídia: impressões, cliques, CTR 1,84% e CPM R$ 52,93", () => {
    expect(m.midia.impressoes).toBe(IMPRESSOES);
    expect(m.midia.cliques).toBe(CLIQUES);
    expect(m.midia.ctr.valor).toBeCloseTo(1.84, 2);
    expect(m.midia.cpm.valor).toBeCloseTo(52.93, 2);
  });

  it("CTR NÃO leva imposto — é razão de cliques por impressões", () => {
    // Se o imposto entrasse no CTR, o valor mudaria; a conta é pura contagem.
    expect(m.midia.ctr.valor).toBeCloseTo((CLIQUES / IMPRESSOES) * 100, 6);
  });

  it("ingressos: 1.410 únicos, 766 pagos, 612 orgânicos", () => {
    expect(m.ingressos.unicos).toBe(ING_UNICOS);
    expect(m.ingressos.pagos).toBe(ING_PAGOS);
    expect(m.ingressos.porOrigem["Orgânico"]).toBe(ING_ORGANICOS);
    expect(m.ingressos.porOrigem["Sem Track"]).toBe(32);
  });

  it("A2 por construção: Σ ingressos por origem === únicos", () => {
    const soma =
      m.ingressos.porOrigem.Pago +
      m.ingressos.porOrigem["Orgânico"] +
      m.ingressos.porOrigem["Sem Track"];
    expect(soma).toBe(m.ingressos.unicos);
  });

  it("faturamento: total, pago e orgânico", () => {
    expect(m.faturamento.total).toBeCloseTo(FAT_TOTAL, 2);
    expect(m.faturamento.pago).toBeCloseTo(FAT_PAGO, 2);
    expect(m.faturamento.organico).toBeCloseTo(FAT_ORGANICO, 2);
  });

  it("A3 por construção: Σ faturamento por origem === total", () => {
    const soma =
      m.faturamento.porOrigem.Pago +
      m.faturamento.porOrigem["Orgânico"] +
      m.faturamento.porOrigem["Sem Track"];
    expect(soma).toBeCloseTo(m.faturamento.total, 2);
  });

  it("ROAS pago 0,96 — sobre o INV TOTAL, não a fatia rastreada", () => {
    expect(m.roas.pago.valor).toBeCloseTo(0.9646, 3);
    // A prova de que o denominador é o INV total: refazer com o INV quente daria
    // 1,66, e é justamente o erro que o §3.2 quer evitar.
    expect(m.roas.pago.valor).not.toBeCloseTo(FAT_PAGO / INV_QUENTE, 2);
  });

  it("ROAS total 1,85", () => {
    expect(m.roas.total.valor).toBeCloseTo(1.8455, 3);
  });

  it("CPV pago R$ 165,23 — INV total ÷ ingressos pagos", () => {
    expect(m.cpv.pago.valor).toBeCloseTo(165.23, 1);
  });

  it("ticket pago R$ 159,39", () => {
    expect(m.ticket.pago.valor).toBeCloseTo(159.39, 2);
  });

  it("conversão clique→venda 1,744%", () => {
    expect(m.conversao.cliqueVenda.valor).toBeCloseTo(1.744, 3);
  });

  it("A9 — a identidade do ROAS pago fecha com 3 casas", () => {
    // (1000/CPM) × CTR × conversão × ticket == roas_pago
    const reconstruido =
      (1000 / m.midia.cpm.valor) *
      (m.midia.ctr.valor / 100) *
      (m.conversao.cliqueVenda.valor / 100) *
      m.ticket.pago.valor;
    expect(reconstruido).toBeCloseTo(m.roas.pago.valor, 3);
  });

  it("toda métrica carrega memória de cálculo com os valores dentro", () => {
    expect(m.roas.pago.memoria).toContain("122.089,47");
    expect(m.roas.pago.memoria).toContain("INV total");
    expect(m.cpv.pago.memoria).toContain("não a fatia rastreada");
    expect(m.midia.cpm.memoria).toContain("2.391.255");
  });

  it("carrega as notas obrigatórias do §3.2 no memorial", () => {
    const juntas = m.notas.join(" ");
    expect(juntas).toContain("INV total");
    expect(juntas).toContain("Quente + Frio ≠ Pago Total");
  });
});

// ---------------------------------------------------------------------------
// §10 — DG-PG04-JUL26
// ---------------------------------------------------------------------------

describe("§10 — DG-PG04-JUL26 (09/07 a 27/07)", () => {
  const INV_QUENTE = 29_980.57;
  const INV_FRIO = 13_320.8;
  const IMPRESSOES = 559_250;
  const CLIQUES = 11_086;
  const FAT_PAGO = 19_298.36;
  const FAT_TOTAL = 69_951.86;
  const ING_PAGOS = 220;
  const ING_UNICOS = 732;

  const campanhas: CampanhaInput[] = [
    campanha({
      campaignName: "dg-pg04-ago-26--vendas-captacao--2026-07-09--hot--cbo--videos",
      spendComImposto: INV_QUENTE,
      spendBruto: INV_QUENTE * (1 - 0.1215),
      impressoes: Math.round(IMPRESSOES * 0.692),
      cliques: Math.round(CLIQUES * 0.692),
    }),
    campanha({
      campaignName: "dg-pg04-ago-26--vendas-captacao--2026-07-09--cold--cbo--videos",
      spendComImposto: INV_FRIO,
      spendBruto: INV_FRIO * (1 - 0.1215),
      impressoes: IMPRESSOES - Math.round(IMPRESSOES * 0.692),
      cliques: CLIQUES - Math.round(CLIQUES * 0.692),
    }),
  ];

  const vendas: VendaInput[] = [
    ...compradores(ING_PAGOS, FAT_PAGO, {
      prefixo: "pago",
      utmSource: "meta",
      utmTerm: "Instagram_Feed_dg-pg04--vendas-captacao--hot|adset|ad",
    }),
    ...compradores(ING_UNICOS - ING_PAGOS, FAT_TOTAL - FAT_PAGO, {
      prefixo: "org",
      utmSource: "youtube",
      utmTerm: null,
    }),
  ];

  const m = computeLaunchReportMetrics({
    ...INPUT_BASE,
    periodo: { inicio: "2026-07-09", fim: "2026-07-27" },
    campanhas,
    vendas,
  });

  it("investimento com imposto R$ 43.301,37 e split 69,2% / 30,8%", () => {
    expect(m.investimento.comImposto).toBeCloseTo(43_301.37, 2);
    expect(m.investimento.pctQuente).toBeCloseTo(69.2, 1);
    expect(m.investimento.pctFrio).toBeCloseTo(30.8, 1);
  });

  it("CTR 1,98% e CPM R$ 77,43", () => {
    expect(m.midia.ctr.valor).toBeCloseTo(1.98, 2);
    expect(m.midia.cpm.valor).toBeCloseTo(77.43, 2);
  });

  it("ROAS pago 0,45 e ROAS total 1,62", () => {
    expect(m.roas.pago.valor).toBeCloseTo(0.4457, 3);
    expect(m.roas.total.valor).toBeCloseTo(1.6154, 3);
  });

  it("CPV pago R$ 196,82 e ticket pago R$ 87,72", () => {
    expect(m.cpv.pago.valor).toBeCloseTo(196.82, 1);
    expect(m.ticket.pago.valor).toBeCloseTo(87.72, 2);
  });

  it("conversão clique→venda 1,984%", () => {
    expect(m.conversao.cliqueVenda.valor).toBeCloseTo(1.984, 3);
  });

  it("A9 fecha aqui também", () => {
    const reconstruido =
      (1000 / m.midia.cpm.valor) *
      (m.midia.ctr.valor / 100) *
      (m.conversao.cliqueVenda.valor / 100) *
      m.ticket.pago.valor;
    expect(reconstruido).toBeCloseTo(m.roas.pago.valor, 3);
  });

  it("período de 19 dias", () => {
    expect(m.periodo.dias).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// Comportamento do pipeline
// ---------------------------------------------------------------------------

describe("reconciliação campaign × ad (§2.3b)", () => {
  const base = { ...INPUT_BASE, impostoJaAplicado: false, vendas: [] as VendaInput[] };

  it("usa max(campaign, Σ ads)", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({
          campaignName: "x--vendas-captacao--hot",
          spendBruto: 100,
          spendAdsBruto: 250,
          spendComImposto: 100,
        }),
      ],
    });
    expect(m.investimento.bruto).toBe(250);
  });

  it("registra divergência acima de R$ 50 com os dois lados", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({
          campaignName: "x--vendas-captacao--hot",
          spendBruto: 14.96,
          spendAdsBruto: 900,
          spendComImposto: 14.96,
        }),
      ],
    });
    expect(m.divergencias).toHaveLength(1);
    expect(m.divergencias[0]).toMatchObject({ spendCampanha: 14.96, spendAds: 900 });
    expect(m.divergencias[0]!.diferenca).toBeCloseTo(885.04, 2);
  });

  it("não registra divergência dentro do limiar", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({
          campaignName: "x--vendas-captacao--hot",
          spendBruto: 1000,
          spendAdsBruto: 1000 - LIMIAR_DIVERGENCIA_RECONCILIACAO,
          spendComImposto: 1000,
        }),
      ],
    });
    expect(m.divergencias).toHaveLength(0);
  });

  it("sem ad-level (null) não reconcilia nem divergе", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({ campaignName: "x--vendas-captacao--hot", spendBruto: 500, spendComImposto: 500 }),
      ],
    });
    expect(m.investimento.bruto).toBe(500);
    expect(m.divergencias).toHaveLength(0);
  });
});

describe("imposto aplicado exatamente uma vez (risco R1)", () => {
  it("fonte já com gross-up → impostoAplicadoPor = fonte e não reaplica", () => {
    const m = computeLaunchReportMetrics({
      ...INPUT_BASE,
      impostoJaAplicado: true,
      campanhas: [
        campanha({
          campaignName: "x--vendas-captacao--hot",
          spendBruto: 38_040.25,
          spendComImposto: 43_301.37,
        }),
      ],
      vendas: [],
    });
    expect(m.investimento.impostoAplicadoPor).toBe("fonte");
    expect(m.investimento.comImposto).toBeCloseTo(43_301.37, 2);
    // A prova de que não houve dupla aplicação: 43.301,37 / (1 − 0,1215) = 49.290,92.
    expect(m.investimento.comImposto).not.toBeCloseTo(49_290.92, 0);
  });

  it("motor aplica quando a reconciliação escolhe o ad-level", () => {
    const m = computeLaunchReportMetrics({
      ...INPUT_BASE,
      impostoJaAplicado: false,
      campanhas: [
        campanha({
          campaignName: "x--vendas-captacao--hot",
          spendBruto: 100,
          spendAdsBruto: 1000,
          spendComImposto: 100,
        }),
      ],
      vendas: [],
    });
    expect(m.investimento.impostoAplicadoPor).toBe("motor");
    expect(m.investimento.comImposto).toBeCloseTo(1000 / (1 - 0.1215), 2);
  });
});

describe("classificação de campanha (§2.2) e pendências", () => {
  const base = { ...INPUT_BASE, impostoJaAplicado: false, vendas: [] as VendaInput[] };

  it("campanha NAO_PADRAO vai para pendencias, não é descartada", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({ campaignName: "campanha_sem_convencao_hot", spendBruto: 500, spendComImposto: 500 }),
      ],
    });
    expect(m.campanhas.naoPadrao).toHaveLength(1);
    expect(m.pendencias.some((p) => p.includes("fora dos 5 prefixos"))).toBe(true);
    // Descartar mudaria o investimento — o teste garante que ela ainda soma.
    expect(m.investimento.bruto).toBe(500);
  });

  it("campanha sem hot/cold soma no Frio e registra pendência (protege A1)", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({ campaignName: "x--vendas-captacao--cbo--videos", spendBruto: 300, spendComImposto: 300 }),
      ],
    });
    expect(m.investimento.frio).toBe(300);
    expect(m.investimento.quente).toBe(0);
    expect(m.investimento.quente + m.investimento.frio).toBe(m.investimento.comImposto);
    expect(m.pendencias.some((p) => p.includes("sem hot/cold"))).toBe(true);
  });

  it("conta campanhas com investimento separado do total", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [
        campanha({ campaignName: "a--vendas-captacao--hot", spendBruto: 100, spendComImposto: 100 }),
        campanha({ campaignName: "b--vendas-captacao--cold", spendBruto: 0, spendComImposto: 0 }),
      ],
    });
    expect(m.campanhas.total).toBe(2);
    expect(m.campanhas.comInvestimento).toBe(1);
  });

  it("registra no memorial quando o mapping de preço divergiu", () => {
    const m = computeLaunchReportMetrics({
      ...base,
      campanhas: [],
      mappingPrecoDivergente: { colunaDoMapping: "Valor oferta", colunaUsada: "Preço" },
    });
    expect(m.pendencias.some((p) => p.includes("Valor oferta"))).toBe(true);
  });
});

describe("atribuição propagada (§2.9)", () => {
  const campanhas = [
    campanha({ campaignName: "x--vendas-captacao--hot", spendBruto: 1000, spendComImposto: 1000 }),
  ];
  const base = { ...INPUT_BASE, impostoJaAplicado: true, campanhas };

  it("a compra MAIS RECENTE define origem e público do comprador", () => {
    const vendas: VendaInput[] = [
      {
        email: "a@x.com",
        txId: "1",
        produto: "Imersão",
        valorBrl: 100,
        dia: "2026-04-18",
        utmSource: "youtube",
        utmTerm: null,
        utmContent: null,
        isOrderBump: false,
      },
      {
        email: "a@x.com",
        txId: "2",
        produto: "Imersão",
        valorBrl: 200,
        dia: "2026-04-20",
        utmSource: "meta",
        utmTerm: "x--hot|a|ad",
        utmContent: null,
        isOrderBump: false,
      },
    ];
    const m = computeLaunchReportMetrics({ ...base, vendas });
    // As DUAS linhas viram faturamento pago, não só a mais recente.
    expect(m.faturamento.pago).toBe(300);
    expect(m.faturamento.organico).toBe(0);
    expect(m.ingressos.unicos).toBe(1);
    expect(m.ingressos.pagos).toBe(1);
  });

  it("order bump herda a atribuição do comprador — receita paga por consequência", () => {
    const vendas: VendaInput[] = [
      {
        email: "a@x.com",
        txId: "1",
        produto: "Imersão",
        valorBrl: 100,
        dia: "2026-04-20",
        utmSource: "meta",
        utmTerm: "x--hot|a|ad",
        utmContent: null,
        isOrderBump: false,
      },
      {
        email: "a@x.com",
        txId: "2",
        produto: "Combo",
        valorBrl: 500,
        dia: "2026-04-20",
        utmSource: null, // o OB não carrega UTM
        utmTerm: null,
        utmContent: null,
        isOrderBump: true,
      },
    ];
    const m = computeLaunchReportMetrics({ ...base, vendas });
    expect(m.faturamento.pago).toBe(600);
    expect(m.faturamento.orderBump).toBe(500);
    expect(m.faturamento.captacao).toBe(100);
    expect(m.ingressos.unicos).toBe(1);
  });

  it("A4 por construção: captação + order bump === total", () => {
    const vendas: VendaInput[] = [
      {
        email: "a@x.com", txId: "1", produto: "Imersão", valorBrl: 100, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: false,
      },
      {
        email: "a@x.com", txId: "2", produto: "Combo", valorBrl: 500, dia: "2026-04-20",
        utmSource: null, utmTerm: null, utmContent: null, isOrderBump: true,
      },
    ];
    const m = computeLaunchReportMetrics({ ...base, vendas });
    expect(m.faturamento.captacao + m.faturamento.orderBump).toBeCloseTo(m.faturamento.total, 2);
  });

  it("linha sem e-mail conta como ingresso avulso e não colapsa", () => {
    const vendas: VendaInput[] = [
      {
        email: null, txId: "1", produto: "Imersão", valorBrl: 50, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: false,
      },
      {
        email: null, txId: "2", produto: "Imersão", valorBrl: 50, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: false,
      },
    ];
    const m = computeLaunchReportMetrics({ ...base, vendas });
    expect(m.ingressos.unicos).toBe(2);
  });

  it("e-mail que só comprou order bump NÃO conta como ingresso único", () => {
    const vendas: VendaInput[] = [
      {
        email: "ob@x.com", txId: "1", produto: "Combo", valorBrl: 500, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: true,
      },
    ];
    const m = computeLaunchReportMetrics({ ...base, vendas });
    expect(m.ingressos.unicos).toBe(0);
    expect(m.faturamento.orderBump).toBe(500);
  });
});

describe("guardas de divisão por zero", () => {
  it("etapa sem investimento e sem venda não explode nem devolve NaN", () => {
    const m = computeLaunchReportMetrics({
      ...INPUT_BASE,
      impostoJaAplicado: false,
      campanhas: [],
      vendas: [],
    });
    for (const v of [
      m.midia.ctr.valor, m.midia.cpc.valor, m.midia.cpm.valor,
      m.roas.pago.valor, m.roas.total.valor, m.cpv.geral.valor,
      m.ticket.pago.valor, m.conversao.cliqueVenda.valor, m.pesquisa.taxaResposta.valor,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
  });
});

describe("produtos e destaques", () => {
  it("agrupa produtos por categoria com faixa de preço e % do faturamento", () => {
    const vendas: VendaInput[] = [
      {
        email: "a@x.com", txId: "1", produto: "Imersão", valorBrl: 100, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: false,
      },
      {
        email: "b@x.com", txId: "2", produto: "Imersão", valorBrl: 300, dia: "2026-04-20",
        utmSource: "meta", utmTerm: "x--hot|a|ad", utmContent: null, isOrderBump: false,
      },
    ];
    const m = computeLaunchReportMetrics({
      ...INPUT_BASE, impostoJaAplicado: true, campanhas: [], vendas,
    });
    const imersao = m.produtos.find((p) => p.nome === "Imersão")!;
    expect(imersao.vendas).toBe(2);
    expect(imersao.faturamento).toBe(400);
    expect(imersao.pctFaturamento).toBeCloseTo(100, 2);
    expect(imersao.precoMin).toBe(100);
    expect(imersao.precoMax).toBe(300);
    expect(imersao.categoria).toBe("captacao");
  });

  it("destaques nasce null — mantém o invariante A6 como skipped até a 41.4", () => {
    const m = computeLaunchReportMetrics({
      ...INPUT_BASE, impostoJaAplicado: false, campanhas: [], vendas: [],
    });
    expect(m.destaques).toBeNull();
  });
});
