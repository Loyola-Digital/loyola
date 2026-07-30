import { describe, it, expect } from "vitest";
import { renderResumao, CSS_RELATORIO, JS_SUBABAS } from "../services/launch-report-render";
import { validateLaunchReport } from "../services/launch-report-guards";
import type { LaunchReportMetrics } from "../services/launch-report-engine";
import type { DestaquesPorAnuncio } from "../services/launch-report-ads";

/** Story 41.5 — §4 (estrutura), §6 (zero literal narrativo), AC6 (formatação BR). */

function metrica(over: Partial<LaunchReportMetrics> = {}): LaunchReportMetrics {
  const mem = (valor: number) => ({ valor, memoria: `memória de ${valor}` });
  return {
    periodo: { inicio: "2026-04-17", fim: "2026-05-09", dias: 23 },
    campanhas: { total: 2, comInvestimento: 2, porFase: {}, naoPadrao: [] },
    investimento: {
      bruto: 878.5, comImposto: 1000, quente: 600, frio: 400,
      pctQuente: 60, pctFrio: 40, impostoPct: 0.1215,
      impostoOrigem: "stage", impostoAplicadoPor: "fonte",
    },
    midia: { impressoes: 100_000, cliques: 2000, ctr: mem(2), cpc: mem(0.5), cpm: mem(10) },
    ingressos: {
      unicos: 100, totais: 120, captacao: 100, orderBump: 20,
      porOrigem: { Pago: 40, "Orgânico": 50, "Sem Track": 10 },
      pagos: 40, pagoQuente: 25, pagoFrio: 15, emailsDistintos: 100, avulsosSemEmail: 0,
    },
    faturamento: {
      total: 5000, captacao: 4000, orderBump: 1000,
      porOrigem: { Pago: 2000, "Orgânico": 2500, "Sem Track": 500 },
      pago: 2000, pagoQuente: 1300, pagoFrio: 700, organico: 2500,
    },
    roas: { pago: mem(2), pagoQuente: mem(2.17), pagoFrio: mem(1.75), total: mem(5) },
    cpv: { geral: mem(10), pago: mem(25), quente: mem(24), frio: mem(26.7) },
    ticket: { captacao: mem(40), total: mem(41.7), pago: mem(50) },
    orderBump: {
      attachRateGeral: mem(20), attachRatePago: mem(20),
      pctFatObGeral: mem(20), pctFatObPago: mem(20), ticketOb: mem(50),
    },
    conversao: { cliqueVenda: mem(2) },
    pesquisa: { taxaResposta: mem(80), respondentes: 80 },
    produtos: [
      { nome: "Imersão", categoria: "captacao", vendas: 100, faturamento: 4000, pctFaturamento: 80, precoMin: 40, precoMax: 40 },
      { nome: "Combo", categoria: "order_bump", vendas: 20, faturamento: 1000, pctFaturamento: 20, precoMin: 50, precoMax: 50 },
    ],
    notas: ["nota do §3.2"],
    divergencias: [], pendencias: [],
    precoDistintoPorProduto: {}, linhasConvertidas: 0,
    adsComSpendSuspeito: [], destaques: null,
    ...over,
  };
}

function render(m: LaunchReportMetrics, serieDiaria?: { dia: string; faturamento: number; ingressos: number }[]) {
  return renderResumao({
    metricas: m,
    guardas: validateLaunchReport(m),
    projeto: "DG & CPDF",
    etapa: "Captação Paga",
    serieDiaria,
  });
}

describe("AC3 — as seções do §4, na ordem", () => {
  const html = render(metrica());

  it("contém todas as seções", () => {
    for (const s of [
      "Classificação de produtos", "1. Geral", "2. ROAS por origem", "3. Tendência",
      "4. Qualificação", "5. Split quente / frio", "6. Order bump", "7. Anúncios",
      "Memorial de cálculo",
    ]) {
      expect(html).toContain(s);
    }
  });

  it("na ordem certa", () => {
    const ordem = [
      "Classificação de produtos", "1. Geral", "2. ROAS por origem", "3. Tendência",
      "4. Qualificação", "5. Split quente / frio", "6. Order bump", "7. Anúncios",
      "Memorial de cálculo",
    ].map((s) => html.indexOf(s));
    for (let i = 1; i < ordem.length; i += 1) {
      expect(ordem[i]).toBeGreaterThan(ordem[i - 1]!);
    }
  });

  it("cabeçalho traz projeto, etapa e período formatados", () => {
    expect(html).toContain("17/04/26");
    expect(html).toContain("09/05/26");
    expect(html).toContain("Captação Paga");
  });

  it("as 5 linhas de ROAS por origem", () => {
    for (const l of ["Pago Quente", "Pago Frio", "Pago Total", "Orgânico", "Total"]) {
      expect(html).toContain(l);
    }
  });
});

describe("AC4 — zero literal narrativo (§6)", () => {
  it("nenhum adjetivo de magnitude fixo no documento", () => {
    const html = render(metrica());
    for (const proibido of ["quase dobrou", "despencou", "disparou", "explodiu", "derreteu"]) {
      expect(html.toLowerCase()).not.toContain(proibido);
    }
  });

  it("REGRESSÃO: dois datasets de direções OPOSTAS geram textos diferentes", () => {
    const crescendo = [
      { dia: "2026-04-17", faturamento: 100, ingressos: 5 },
      { dia: "2026-04-18", faturamento: 100, ingressos: 5 },
      { dia: "2026-04-19", faturamento: 900, ingressos: 40 },
      { dia: "2026-04-20", faturamento: 900, ingressos: 40 },
    ];
    const caindo = [...crescendo].reverse().map((d, i) => ({ ...d, dia: crescendo[i]!.dia }));

    const htmlSobe = render(metrica(), crescendo);
    const htmlCai = render(metrica(), caindo);

    expect(htmlSobe).toContain("subiu");
    expect(htmlCai).toContain("caiu");
    expect(htmlSobe).not.toBe(htmlCai);
  });

  it("o percentual da leitura acompanha a direção", () => {
    const crescendo = [
      { dia: "2026-04-17", faturamento: 100, ingressos: 5 },
      { dia: "2026-04-18", faturamento: 200, ingressos: 9 },
    ];
    const html = render(metrica(), crescendo);
    expect(html).toContain("+");
  });
});

describe("AC6 — formatação BR", () => {
  const html = render(metrica());

  it("moeda em formato BR", () => {
    expect(html).toContain("R$ 1.000,00");
  });

  it("nenhum valor em formato US", () => {
    expect(html).not.toMatch(/R\$ \d{1,3},\d{3}\.\d{2}/);
  });

  it("percentual com vírgula", () => {
    expect(html).toMatch(/\d+,\d+%/);
  });
});

describe("escape de conteúdo dinâmico", () => {
  it("nome de produto malicioso não injeta script", () => {
    const m = metrica({
      produtos: [{
        nome: `<script>alert(1)</script>`, categoria: "captacao",
        vendas: 1, faturamento: 10, pctFaturamento: 100, precoMin: 10, precoMax: 10,
      }],
    });
    const html = render(m);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("nome de campanha com & é escapado no banner de divergência", () => {
    const m = metrica({
      divergencias: [{
        campaignId: "1", campaignName: "camp & <b>x</b>",
        spendCampanha: 10, spendAds: 900, diferenca: 890,
      }],
    });
    const html = render(m);
    expect(html).toContain("camp &amp; &lt;b&gt;x&lt;/b&gt;");
  });

  it("o projeto e a etapa também são escapados", () => {
    expect(render(metrica())).toContain("DG &amp; CPDF");
  });
});

describe("degradação sem quebrar (AC RN3/RN5)", () => {
  it("sem série diária, a seção 3 explica e o resto continua", () => {
    const html = render(metrica());
    expect(html).toContain("Série diária indisponível");
    expect(html).toContain("Memorial de cálculo");
  });

  it("sem destaques, a seção 7 explica e o A6 aparece como skipped", () => {
    const html = render(metrica());
    expect(html).toContain("Sem dados por anúncio");
    expect(html).toContain("⏭️");
  });

  it("com destaques, monta as 3 sub-abas com escopo local", () => {
    const destaques: DestaquesPorAnuncio = {
      pctVendasPagasSemAdName: 0,
      adsComSpendSuspeito: [],
      visoes: (["Quente", "Frio", "Total"] as const).map((visao) => ({
        visao, invVisao: 1000, fator: 1, somaSpendAjustado: 1000, motivoSkip: null,
        maiorEscala: {
          adName: "criativo-A", spendAjustado: 1000, pctInvest: 100, impressoes: 1000,
          cliques: 50, ctr: 5, cpc: 20, cpm: 1000, vendas: 2, faturamento: 3000,
          cpv: 500, roas: 3, match: 10, pctA: 40, pctAB: 70,
        },
        maiorCtr: [], menorCpc: [], menorCpm: [], menorCpv: [],
        maiorRoas: [], maiorPctA: [], maiorPctAB: [],
        zerados: 0, totalAds: 1, escalaveis: 1, tabela: [],
      })),
    };
    const html = render(metrica({ destaques }));
    expect(html).toContain("🔥 Quente");
    expect(html).toContain("❄️ Frio");
    expect(html).toContain("🌗 Total");
    expect(html).toContain("criativo-A");
    // Escopo LOCAL das abas — o Comparativo (41.6) reusa o documento.
    expect(JS_SUBABAS).toContain("b.parentElement");
    expect(JS_SUBABAS).not.toContain("document.querySelectorAll('.sb')");
  });
});

describe("memorial (AC5)", () => {
  const html = render(metrica());

  it("traz a procedência do imposto", () => {
    expect(html).toContain("stage");
    expect(html).toContain("12,15%");
  });

  it("traz as notas do §3.2", () => {
    expect(html).toContain("nota do §3.2");
  });

  it("lista os 9 invariantes", () => {
    for (const c of ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9"]) {
      expect(html).toContain(c);
    }
  });

  it("reporta a conferência externa como pulada quando não informada", () => {
    expect(html).toContain("conferência externa pulada");
  });

  it("pendências aparecem quando existem", () => {
    const html2 = render(metrica({ pendencias: ["campanha X fora da convenção"] }));
    expect(html2).toContain("campanha X fora da convenção");
  });
});

describe("banners", () => {
  it("reconciliação verde quando não há divergência", () => {
    expect(render(metrica())).toContain("sem divergência acima de");
  });

  it("alertas contam e listam, sem bloquear", () => {
    const m = metrica({ linhasConvertidas: 3 });
    const html = render(m);
    expect(html).toContain("W7");
    expect(html).toContain("sinaliza"); // "1 sinalização" / "N sinalizações"
  });

  it("plural da contagem é derivado, não fixo", () => {
    const uma = render(metrica({ linhasConvertidas: 3 }));
    expect(uma).toContain("1 sinalização");
    const duas = render(metrica({ linhasConvertidas: 3, campanhas: { total: 1, comInvestimento: 1, porFase: {}, naoPadrao: [{ campaignId: "x", campaignName: "y" }] } }));
    expect(duas).toContain("2 sinalizações");
  });
});

describe("documento autocontido", () => {
  const html = render(metrica());

  it("CSS e JS embutidos", () => {
    expect(html).toContain(CSS_RELATORIO.slice(0, 40));
    expect(html).toContain(JS_SUBABAS.slice(0, 40));
  });

  it("a única dependência externa é o Chart.js por CDN", () => {
    const externos = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? [];
    expect(externos).toHaveLength(1);
    expect(externos[0]).toContain("chart.js");
  });

  it("o gráfico degrada quando o Chart.js não carrega", () => {
    const comSerie = render(metrica(), [
      { dia: "2026-04-17", faturamento: 100, ingressos: 5 },
      { dia: "2026-04-18", faturamento: 200, ingressos: 9 },
    ]);
    expect(comSerie).toContain("typeof Chart==='undefined'");
  });

  it("fica muito abaixo do teto de 5MB", () => {
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(5 * 1024 * 1024);
  });
});
