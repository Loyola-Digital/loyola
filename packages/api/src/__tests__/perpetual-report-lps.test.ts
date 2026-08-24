/**
 * Story 29.59 — verificação por reversão.
 *
 * A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
 * Cada teste tem que FALHAR com o defeito de volta.
 */

import { describe, it, expect } from "vitest";
import {
  computePerpetualReport,
  LP_NAO_RESOLVIDA_LABEL,
  SEM_ATRIBUICAO_AD_LABEL,
  type PerpetualReportInput,
  type PerpetualSaleRow,
  type CampaignSpendRow,
  type AdSpendRow,
  type SegmentoRow,
} from "../services/perpetual-report-metrics.js";
import {
  resolvePerpetualRates,
  type PerpetualReportConfig,
} from "../services/perpetual-report-config.js";

function makeConfig(over: Partial<PerpetualReportConfig> = {}): PerpetualReportConfig {
  return {
    funnelId: "f-1", funnelName: "BBE-A1", projectId: "p-1", projectName: "Netão",
    metaAccountId: "act_1", campanhas: [], prefixoCampanha: null, produto: "Curso",
    produtosOrderBump: [], temSplitFormato: false, origensPagas: ["meta"],
    inicioTrafego: null, validado: true, validadoEm: null, validadoPor: null,
    impostoPct: 0.1215, impostoOrigem: "default", taxaPlataformaPct: null,
    taxaImpostoPct: null, taxaOutrosPct: null, margemDesejadaPct: null, cmv: null,
    gatewayPctVar: null, funnelArchitecture: null, chainDefectReading: null,
    manualRates: {}, ceilings: {},
    ...over,
  };
}

const CAMPANHAS: CampaignSpendRow[] = [
  { campaignId: "camp-1", campaignName: "bbe--venda--perpetuo--hot_cbo", spend: 1000, spendComImposto: 1138.37 },
];

const ANUNCIOS: AdSpendRow[] = [
  { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 600, spendComImposto: 683.02 },
  { adId: "ad-2", adsetId: "adset-B", campaignId: "camp-1", spend: 400, spendComImposto: 455.35 },
];

/** 10 compradores distintos, 5 por anúncio. */
function vendas(): PerpetualSaleRow[] {
  return Array.from({ length: 10 }, (_, i) => ({
    email: `c${i}@x.com`,
    dia: "2026-07-20",
    valorBruto: 500,
    utmSource: "meta",
    utmCampaign: "camp-1",
    utmMedium: i % 2 === 0 ? "adset-A" : "adset-B",
    utmContent: i % 2 === 0 ? "ad-1" : "ad-2",
    produto: "Curso",
  }));
}

function input(over: Partial<PerpetualReportInput> = {}): PerpetualReportInput {
  const config = over.config ?? makeConfig();
  return {
    config,
    rates: resolvePerpetualRates(config, "kiwify", true),
    periodo: { inicio: "2026-07-17", fim: "2026-07-27" },
    vendas: vendas(),
    campanhas: CAMPANHAS,
    anuncios: ANUNCIOS,
    ...over,
  };
}

function linha(rows: SegmentoRow[] | undefined, label: string) {
  return rows?.find((r) => r.label === label);
}

describe("a identidade de LP é a mesma do dashboard (AC1)", () => {
  it("duas URLs que só diferem em UTM caem na MESMA linha", () => {
    // É o caso medido no AC0 da 29.40: uma macro da Meta não expandida
    // (`{{adset.name}}`) apontando para a mesma página de outros 29 anúncios.
    // Com uma segunda implementação na API, ela viraria uma LP própria — com
    // investimento próprio e CAC próprio — competindo contra a página da qual
    // é apenas uma variante de rastreio.
    const r = computePerpetualReport(
      input({
        linkUrlPorAd: {
          "ad-1": "https://exemplo.com.br/inscricao/?utm_source=meta&utm_medium={{adset.name}}",
          "ad-2": "https://www.exemplo.com.br/inscricao",
        },
      }),
    );
    const lps = r.segmentos.lps!.filter((x) => x.label !== SEM_ATRIBUICAO_AD_LABEL);
    expect(lps).toHaveLength(1);
    expect(lps[0]!.label).toBe("exemplo.com.br/inscricao");
    expect(lps[0]!.investimento).toBeCloseTo(1138.37, 2);
  });

  it("paths diferentes continuam LPs diferentes — é o teste que o gestor quer ler", () => {
    const r = computePerpetualReport(
      input({
        linkUrlPorAd: {
          "ad-1": "https://exemplo.com.br/inscricao",
          "ad-2": "https://exemplo.com.br/inscricao-b",
        },
      }),
    );
    expect(linha(r.segmentos.lps, "exemplo.com.br/inscricao")!.investimento).toBeCloseTo(683.02, 2);
    expect(linha(r.segmentos.lps, "exemplo.com.br/inscricao-b")!.investimento).toBeCloseTo(455.35, 2);
  });
});

describe("vendas por LP via utm_content (AC3)", () => {
  const r = computePerpetualReport(
    input({
      linkUrlPorAd: {
        "ad-1": "https://exemplo.com.br/lp-a",
        "ad-2": "https://exemplo.com.br/lp-b",
      },
    }),
  );

  it("cada LP recebe as vendas dos anúncios dela", () => {
    expect(linha(r.segmentos.lps, "exemplo.com.br/lp-a")!.vendas).toBe(5);
    expect(linha(r.segmentos.lps, "exemplo.com.br/lp-b")!.vendas).toBe(5);
  });

  it("CAC e ROAS por LP saem dos dois lados", () => {
    const a = linha(r.segmentos.lps, "exemplo.com.br/lp-a")!;
    expect(a.faturamento).toBeCloseTo(2500, 2);
    expect(a.cac).toBeCloseTo(683.02 / 5, 2);
    expect(a.roas).toBeCloseTo(2500 / 683.02, 3);
  });

  it("order bump não conta como venda nova (regra da 29.53)", () => {
    // Duas linhas da planilha, mesmo comprador: é UMA venda. Contar linhas
    // inflaria a LP que vende o combo.
    const comBump: PerpetualSaleRow[] = [
      ...vendas(),
      { email: "c0@x.com", dia: "2026-07-20", valorBruto: 97, utmSource: "meta",
        utmCampaign: "camp-1", utmMedium: "adset-A", utmContent: "ad-1", produto: "Order bump" },
    ];
    const comOrderBump = computePerpetualReport(
      input({
        vendas: comBump,
        linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a", "ad-2": "https://exemplo.com.br/lp-b" },
      }),
    );
    const a = linha(comOrderBump.segmentos.lps, "exemplo.com.br/lp-a")!;
    expect(a.vendas).toBe(5);
    // O faturamento SOMA o bump — é receita real; o que não pode duplicar é o
    // comprador.
    expect(a.faturamento).toBeCloseTo(2597, 2);
  });
});

describe("a linha não resolvida entra, e a soma fecha (AC4)", () => {
  const r = computePerpetualReport(
    input({ linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a", "ad-2": null } }),
  );

  it("o anúncio sem URL vira a linha 'Sem link resolvido'", () => {
    const naoResolvida = linha(r.segmentos.lps, LP_NAO_RESOLVIDA_LABEL)!;
    expect(naoResolvida.investimento).toBeCloseTo(455.35, 2);
    expect(naoResolvida.vendas).toBe(5);
  });

  it("a soma da seção fecha com o investimento do relatório", () => {
    // Sem a linha, a seção mostraria 60% do dinheiro como se fosse o total —
    // e no relatório o leitor não tem como conferir clicando.
    const soma = r.segmentos.lps!.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(r.kpis.investimentoComImposto, 1);
  });

  it("ad_id ausente do mapa é tratado como não resolvido, não some", () => {
    const semMapa = computePerpetualReport(
      input({ linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a" } }),
    );
    const soma = semMapa.segmentos.lps!.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(semMapa.kpis.investimentoComImposto, 1);
    expect(linha(semMapa.segmentos.lps, LP_NAO_RESOLVIDA_LABEL)!.investimento).toBeCloseTo(455.35, 2);
  });

  it("a cauda do grão de anúncio também entra, e é uma linha SEPARADA", () => {
    // Duas causas diferentes de dinheiro sem LP: anúncio sem URL e gasto que
    // nenhum anúncio explica. Fundi-las mandaria o gestor procurar no lugar
    // errado — o mesmo raciocínio das três causas da 29.43.
    const parcial = computePerpetualReport(
      input({
        anuncios: [{ adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 500, spendComImposto: 569.19 }],
        linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a" },
      }),
    );
    expect(linha(parcial.segmentos.lps, SEM_ATRIBUICAO_AD_LABEL)).toBeDefined();
    const soma = parcial.segmentos.lps!.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(parcial.kpis.investimentoComImposto, 1);
  });
});

describe("ausente ≠ zerado (AC6)", () => {
  it("sem nenhuma LP resolvida a seção SOME, com alerta", () => {
    const r = computePerpetualReport(input({ linkUrlPorAd: { "ad-1": null, "ad-2": null } }));
    // Uma tabela com uma linha "Sem link resolvido" de 100% e nada mais não é
    // uma tabela de LPs: é uma tabela vazia com cara de resposta.
    expect(r.segmentos.lps).toBeUndefined();
    expect(r.alertas.some((a) => a.codigo === "W-LP")).toBe(true);
  });

  it("uma LP resolvida já basta para a seção existir", () => {
    const r = computePerpetualReport(
      input({ linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a", "ad-2": null } }),
    );
    expect(r.segmentos.lps).toBeDefined();
    expect(r.alertas.some((a) => a.codigo === "W-LP")).toBe(false);
  });

  it("sem `linkUrlPorAd` nenhum, a seção some e não trava o relatório", () => {
    const r = computePerpetualReport(input({}));
    expect(r.segmentos.lps).toBeUndefined();
    expect(r.kpis.investimentoComImposto).toBeCloseTo(1138.37, 2);
  });
});

describe("ordenação: investimento desc, cauda no fim (AC7)", () => {
  it("a LP de maior investimento é a primeira", () => {
    const r = computePerpetualReport(
      input({
        anuncios: [
          { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 200, spendComImposto: 227.67 },
          { adId: "ad-2", adsetId: "adset-B", campaignId: "camp-1", spend: 800, spendComImposto: 910.70 },
        ],
        linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a", "ad-2": "https://exemplo.com.br/lp-b" },
      }),
    );
    expect(r.segmentos.lps![0]!.label).toBe("exemplo.com.br/lp-b");
  });
});

// ============================================================================
// AC7 — a ordenação da CAUDA acontece no renderer, não em `toRows`.
// `toRows` ordena por investimento; é o `segTable` que empurra as linhas que
// não são entidades para o fim. Testar só o motor deixaria essa metade do AC
// sem prova.
// ============================================================================

describe("o renderer põe a cauda no fim e a marca (AC7)", () => {
  it("'Sem link resolvido' vai por último mesmo com o MAIOR investimento", async () => {
    const { renderPerpetualReportHtml } = await import(
      "../services/perpetual-report-html.js"
    );
    // ad-2 (sem URL) gasta o dobro de ad-1. Se competisse no ranking, ficaria
    // no topo — uma linha sobre a qual não há ação possível ocupando o lugar
    // da LP que o gestor precisa ver.
    const r = computePerpetualReport(
      input({
        anuncios: [
          { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 300, spendComImposto: 341.51 },
          { adId: "ad-2", adsetId: "adset-B", campaignId: "camp-1", spend: 700, spendComImposto: 796.86 },
        ],
        linkUrlPorAd: { "ad-1": "https://exemplo.com.br/lp-a", "ad-2": null },
      }),
    );
    const html = renderPerpetualReportHtml(r);

    const secao = html.slice(html.indexOf("Landing pages"));
    const posLp = secao.indexOf("exemplo.com.br/lp-a");
    const posCauda = secao.indexOf(LP_NAO_RESOLVIDA_LABEL);
    expect(posLp).toBeGreaterThan(-1);
    expect(posCauda).toBeGreaterThan(posLp);
  });

  it("a seção só existe no HTML quando o relatório a traz", async () => {
    const { renderPerpetualReportHtml } = await import(
      "../services/perpetual-report-html.js"
    );
    const semLp = renderPerpetualReportHtml(
      computePerpetualReport(input({ linkUrlPorAd: { "ad-1": null, "ad-2": null } })),
    );
    expect(semLp).not.toContain("Landing pages");
  });
});
