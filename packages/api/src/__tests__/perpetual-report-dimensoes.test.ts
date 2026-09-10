/**
 * Story 47.6 — tabelas por dimensão do dicionário no relatório perpétuo.
 *
 * Duas coisas se provam: (1) SEM o mapa nada muda — o report não ganha campo e
 * a suíte antiga (147 casos) segue idêntica; (2) COM o mapa, cada campo do
 * nome vira uma tabela, campanha sem vínculo cai em "Não classificada" (nunca
 * some, nunca é rateada), e a cobertura é declarada com o alerta W-VINCULO
 * abaixo de 50%.
 */
import { describe, expect, it } from "vitest";
import { NAO_CLASSIFICADA_KEY, computePerpetualReport, type PerpetualReportInput, type PerpetualSaleRow } from "../services/perpetual-report-metrics.js";
import { resolvePerpetualRates, type PerpetualReportConfig } from "../services/perpetual-report-config.js";

const config = {
  funnelId: "f-1", funnelName: "BBE-A1", projectId: "p-1", projectName: "Netão", metaAccountId: "act_1", campanhas: [],
  prefixoCampanha: null, produto: "Curso", produtosOrderBump: [], temSplitFormato: false, origensPagas: ["meta"], inicioTrafego: null,
  validado: true, validadoEm: null, validadoPor: null, impostoPct: 0.1215, impostoOrigem: "default", taxaPlataformaPct: 0, taxaImpostoPct: 0, taxaOutrosPct: 0,
  margemDesejadaPct: null, funnelArchitecture: null,
} as unknown as PerpetualReportConfig;

function venda(i: number, campaignId: string, valor = 100): PerpetualSaleRow {
  return { email: `c${i}@x.com`, data: "2026-08-10", valorBruto: valor, status: "paid", utmSource: "meta", utmCampaign: campaignId, utmMedium: null, utmContent: null, produto: "Curso" } as unknown as PerpetualSaleRow;
}

function input(over: Partial<PerpetualReportInput> = {}): PerpetualReportInput {
  return {
    config,
    rates: resolvePerpetualRates(config, null, true),
    periodo: { inicio: "2026-08-01", fim: "2026-08-31" },
    campanhas: [
      { campaignId: "111", campaignName: "bbe-a1-jul-26--venda--perpetuo--hot_cbo", spend: 600, spendComImposto: 600 },
      { campaignId: "222", campaignName: "bbe-a1-jul-26--venda--perpetuo--cold_cbo", spend: 400, spendComImposto: 400 },
    ],
    vendas: [venda(1, "111"), venda(2, "111"), venda(3, "222"), venda(4, "sem-campanha")],
    ...over,
  };
}

const dimensoes = {
  "111": { expert: "bbe", product: "churrasco", funnel: "a01", offer: "of01", year: "2026", temperature: "hot", auction: "cbo", format: "videos", lp: "lpa", origin: "legado" as const },
};

describe("Story 47.6 — sem mapa, nada muda", () => {
  it("report não ganha porDimensao nem coberturaVinculo", () => {
    const r = computePerpetualReport(input());
    expect(r.segmentos.porDimensao).toBeUndefined();
    expect(r.coberturaVinculo).toBeUndefined();
    expect(r.alertas.some((a) => a.codigo === "W-VINCULO")).toBe(false);
  });
  it("teste diferencial: o report com mapa é o report sem mapa + os campos novos", () => {
    const sem = computePerpetualReport(input());
    const com = computePerpetualReport(input({ dimensoes }));
    const segCom: Partial<typeof com.segmentos> = { ...com.segmentos };
    delete segCom.porDimensao;
    const { alertas: alertasCom, ...restoComTudo } = com;
    const restoCom: Partial<typeof restoComTudo> = { ...restoComTudo };
    delete restoCom.coberturaVinculo;
    const { alertas: alertasSem, ...restoSem } = sem;
    expect({ ...restoCom, segmentos: segCom }).toEqual({ ...restoSem, segmentos: sem.segmentos });
    // a única diferença nos alertas é o W-VINCULO
    expect(alertasCom.filter((a) => a.codigo !== "W-VINCULO")).toEqual(alertasSem);
  });
});

describe("Story 47.6 — com mapa", () => {
  it("nove tabelas; a campanha sem vínculo cai em Não classificada com o investimento e as vendas dela", () => {
    const r = computePerpetualReport(input({ dimensoes }));
    const pd = r.segmentos.porDimensao!;
    expect(Object.keys(pd)).toEqual(["expert", "product", "funnel", "offer", "year", "temperature", "auction", "format", "lp"]);
    const funil = Object.fromEntries(pd.funnel.map((x) => [x.chave, x]));
    expect(funil.a01.investimento).toBe(600);
    expect(funil.a01.vendas).toBe(2);
    expect(funil[NAO_CLASSIFICADA_KEY]).toMatchObject({ label: "Não classificada", investimento: 400, vendas: 1 });
    // soma das linhas = investimento total (nada rateado, nada perdido)
    expect(pd.temperature.reduce((s, x) => s + x.investimento, 0)).toBe(1000);
  });
  it("cobertura: 60% do gasto e 2 de 3 vendas atribuídas com vínculo; W-VINCULO não dispara (≥ 50%)", () => {
    const r = computePerpetualReport(input({ dimensoes }));
    expect(r.coberturaVinculo).toEqual({
      gasto: { comVinculo: 600, semVinculo: 400, pct: 0.6 },
      vendas: { comVinculo: 2, semVinculo: 1, pct: 2 / 3 },
      campanhas: { total: 2, comVinculo: 1 },
    });
    expect(r.alertas.some((a) => a.codigo === "W-VINCULO")).toBe(false);
  });
  it("mapa vazio (AC0 de hoje): tudo Não classificada, cobertura 0% e W-VINCULO", () => {
    const r = computePerpetualReport(input({ dimensoes: {} }));
    expect(r.coberturaVinculo?.gasto.pct).toBe(0);
    expect(r.segmentos.porDimensao!.expert).toHaveLength(1);
    expect(r.segmentos.porDimensao!.expert[0]).toMatchObject({ chave: NAO_CLASSIFICADA_KEY, investimento: 1000 });
    const w = r.alertas.find((a) => a.codigo === "W-VINCULO");
    expect(w?.mensagem).toContain("0%");
  });
});
