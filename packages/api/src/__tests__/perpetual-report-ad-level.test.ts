/**
 * Story 29.58 — verificação por reversão.
 *
 * A tabela do "🧪 Verificação por reversão" da story, uma linha por `describe`.
 * Cada teste tem que FALHAR com o defeito de volta.
 *
 * O motor é uma função pura: estes testes o exercitam de verdade, com o mesmo
 * `PerpetualReportInput` que o loader monta. Nada é re-implementado aqui.
 */

import { describe, it, expect } from "vitest";
import {
  computePerpetualReport,
  normalizeName,
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
  {
    campaignId: "camp-1",
    campaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo",
    spend: 1000,
    spendComImposto: 1138.37,
  },
];

/**
 * 10 vendas, todas com `utm_medium` (adset) e `utm_content` (ad) preenchidos —
 * a cobertura precisa passar de 50% ou o gate W-P4 esconde as duas seções e o
 * teste não teria o que olhar.
 */
function vendas(n = 10): PerpetualSaleRow[] {
  return Array.from({ length: n }, (_, i) => ({
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
    ...over,
  };
}

/** Cobertura de 100%: a soma dos anúncios bate com a da campanha. */
const ANUNCIOS_COMPLETOS: AdSpendRow[] = [
  { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 600, spendComImposto: 683.02 },
  { adId: "ad-2", adsetId: "adset-B", campaignId: "camp-1", spend: 400, spendComImposto: 455.35 },
];

const NOMES = {
  ads: { "ad-1": "CR-01 vídeo depoimento", "ad-2": "CR-02 estático prova" },
  adsets: { "adset-A": "LAL 1% compradores", "adset-B": "Interesses — pais" },
};

function linhaPorLabel(rows: SegmentoRow[] | undefined, label: string) {
  return rows?.find((r) => r.label === label);
}

describe("nome do conjunto e do criativo (AC1)", () => {
  const r = computePerpetualReport(input({ anuncios: ANUNCIOS_COMPLETOS, nomes: NOMES }));

  it("a seção de conjuntos mostra o nome, não o adset_id", () => {
    const labels = r.segmentos.publicos!.map((x) => x.label);
    expect(labels).toContain("LAL 1% compradores");
    expect(labels).toContain("Interesses — pais");
    expect(labels).not.toContain("adset-A");
  });

  it("a seção de criativos mostra o nome, não o ad_id", () => {
    const labels = r.segmentos.criativos!.map((x) => x.label);
    expect(labels).toContain("CR-01 vídeo depoimento");
    expect(labels).not.toContain("ad-1");
  });
});

describe("investimento por conjunto (AC3)", () => {
  const r = computePerpetualReport(input({ anuncios: ANUNCIOS_COMPLETOS, nomes: NOMES }));

  it("cada conjunto tem o investimento dos anúncios dele", () => {
    // Sem o AC3 esta seção sai com R$ 0,00 em toda linha — nunca existiu
    // caminho de investimento por adset no motor.
    expect(linhaPorLabel(r.segmentos.publicos, "LAL 1% compradores")!.investimento).toBeCloseTo(683.02, 2);
    expect(linhaPorLabel(r.segmentos.publicos, "Interesses — pais")!.investimento).toBeCloseTo(455.35, 2);
  });

  it("com investimento, o CAC do conjunto deixa de ser zero", () => {
    const lal = linhaPorLabel(r.segmentos.publicos, "LAL 1% compradores")!;
    expect(lal.vendas).toBe(5);
    expect(lal.cac).toBeCloseTo(683.02 / 5, 2);
    // CAC zero e ROAS infinito eram o sintoma na reunião.
    expect(lal.cac).not.toBe(0);
    expect(lal.roas).toBeCloseTo(2500 / 683.02, 3);
  });

  it("a soma dos conjuntos fecha com o investimento do relatório", () => {
    const soma = r.segmentos.publicos!.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(r.kpis.investimentoComImposto, 1);
  });
});

describe("investimento não depende do nome (AC4)", () => {
  it("anúncio sem nome resolvido soma assim mesmo, com o ID de rótulo", () => {
    // O código anterior fazia `if (!nome) continue`: o dinheiro deste anúncio
    // sumia do total da dimensão, sem nada declarar.
    const r = computePerpetualReport(
      input({
        anuncios: ANUNCIOS_COMPLETOS,
        nomes: { ads: { "ad-1": "CR-01 vídeo depoimento" }, adsets: {} },
      }),
    );
    const semNome = linhaPorLabel(r.segmentos.criativos, "ad-2");
    expect(semNome).toBeDefined();
    expect(semNome!.investimento).toBeCloseTo(455.35, 2);
    const soma = r.segmentos.criativos!.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(r.kpis.investimentoComImposto, 1);
  });

  it("anúncio que gastou e não vendeu aparece na tabela", () => {
    // É a linha que o gestor procura quando abre a tabela para cortar algo — e
    // que o código anterior escondia, porque só somava em bucket criado por
    // uma venda.
    const comOrfao: AdSpendRow[] = [
      ...ANUNCIOS_COMPLETOS.map((a) => ({ ...a, spend: a.spend / 2, spendComImposto: a.spendComImposto / 2 })),
      { adId: "ad-3", adsetId: "adset-C", campaignId: "camp-1", spend: 500, spendComImposto: 569.19 },
    ];
    const r = computePerpetualReport(
      input({
        anuncios: comOrfao,
        nomes: { ...NOMES, ads: { ...NOMES.ads, "ad-3": "CR-03 queimou verba" } },
      }),
    );
    const orfao = linhaPorLabel(r.segmentos.criativos, "CR-03 queimou verba")!;
    expect(orfao.investimento).toBeCloseTo(569.19, 2);
    expect(orfao.vendas).toBe(0);
  });
});

describe("a cauda não coberta é declarada (AC5)", () => {
  /**
   * ⚠️ Cobertura INCOMPLETA de propósito: R$ 800 de spend bruto contra R$ 1.000
   * da campanha. Com dados que fecham em 100% — como os do BBE no período que
   * motivou a story — esta linha nunca aparece e o teste não provaria nada.
   */
  const PARCIAIS: AdSpendRow[] = [
    { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 500, spendComImposto: 569.19 },
    { adId: "ad-2", adsetId: "adset-B", campaignId: "camp-1", spend: 300, spendComImposto: 341.51 },
  ];
  const r = computePerpetualReport(input({ anuncios: PARCIAIS, nomes: NOMES }));

  it("a linha de não atribuído aparece nas duas dimensões", () => {
    expect(linhaPorLabel(r.segmentos.publicos, SEM_ATRIBUICAO_AD_LABEL)).toBeDefined();
    expect(linhaPorLabel(r.segmentos.criativos, SEM_ATRIBUICAO_AD_LABEL)).toBeDefined();
  });

  it("e ela vale exatamente a diferença", () => {
    const naoAtribuido = linhaPorLabel(r.segmentos.criativos, SEM_ATRIBUICAO_AD_LABEL)!;
    expect(naoAtribuido.investimento).toBeCloseTo(1138.37 - 569.19 - 341.51, 2);
  });

  it("com ela, a seção fecha com o total — sem ela, apresentaria 80% como 100%", () => {
    for (const dim of [r.segmentos.publicos!, r.segmentos.criativos!]) {
      const soma = dim.reduce((s, x) => s + x.investimento, 0);
      expect(soma).toBeCloseTo(r.kpis.investimentoComImposto, 1);
    }
  });

  it("o alerta P1-CAUDA sai junto, com o valor", () => {
    expect(r.alertas.some((a) => a.codigo === "P1-CAUDA")).toBe(true);
  });

  it("cobertura de 100% NÃO cria a linha", () => {
    const completo = computePerpetualReport(input({ anuncios: ANUNCIOS_COMPLETOS, nomes: NOMES }));
    expect(linhaPorLabel(completo.segmentos.criativos, SEM_ATRIBUICAO_AD_LABEL)).toBeUndefined();
    expect(completo.alertas.some((a) => a.codigo === "P1-CAUDA")).toBe(false);
  });
});

describe("as dimensões novas ficam fora de P3/P4 (AC6)", () => {
  it("cobertura parcial ALERTA, não lança InvarianteError", () => {
    // P3 e P4 comparam temperatura e formato com o total, e as duas vêm do
    // grão de CAMPANHA — 100% por construção. Incluir conjunto e criativo ali
    // faria o relatório travar por uma diferença que a P1 já declara normal.
    const PARCIAIS: AdSpendRow[] = [
      { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 500, spendComImposto: 569.19 },
    ];
    expect(() =>
      computePerpetualReport(
        input({ anuncios: PARCIAIS, nomes: NOMES, config: makeConfig({ temSplitFormato: true }) }),
      ),
    ).not.toThrow();
  });

  it("temperatura continua fechando com o total", () => {
    const r = computePerpetualReport(input({ anuncios: ANUNCIOS_COMPLETOS, nomes: NOMES }));
    const soma = r.segmentos.quenteFrio.reduce((s, x) => s + x.investimento, 0);
    expect(soma).toBeCloseTo(r.kpis.investimentoComImposto, 1);
  });
});

describe("o gate W-P4 continua valendo (AC7)", () => {
  it("vendas sem o ID na UTM escondem a seção, mesmo com investimento resolvido", () => {
    // Investimento correto e vendas pela metade seria uma mentira nova.
    const semUtm = vendas().map((v, i) =>
      i < 8 ? { ...v, utmMedium: null, utmContent: null } : v,
    );
    const r = computePerpetualReport(
      input({ vendas: semUtm, anuncios: ANUNCIOS_COMPLETOS, nomes: NOMES }),
    );
    expect(r.segmentos.publicos).toBeUndefined();
    expect(r.segmentos.criativos).toBeUndefined();
    expect(r.alertas.some((a) => a.codigo === "W-P4")).toBe(true);
  });
});

describe("agrupamento por nome, não por id", () => {
  it("o mesmo conjunto em campanhas diferentes vira UMA linha", () => {
    // Em CBO o mesmo público existe em vários conjuntos, com IDs distintos.
    // Separá-los fatiaria o público em linhas incomparáveis.
    const dois: AdSpendRow[] = [
      { adId: "ad-1", adsetId: "adset-A", campaignId: "camp-1", spend: 600, spendComImposto: 683.02 },
      { adId: "ad-2", adsetId: "adset-A2", campaignId: "camp-1", spend: 400, spendComImposto: 455.35 },
    ];
    const r = computePerpetualReport(
      input({
        anuncios: dois,
        nomes: { ads: NOMES.ads, adsets: { "adset-A": "LAL 1%", "adset-A2": "LAL 1%" } },
      }),
    );
    const lal = r.segmentos.publicos!.filter((x) => normalizeName(x.label) === normalizeName("LAL 1%"));
    expect(lal).toHaveLength(1);
    expect(lal[0]!.investimento).toBeCloseTo(1138.37, 2);
  });
});
