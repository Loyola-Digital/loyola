/**
 * Story 41.9 — render HTML (§C.4). Foco na estrutura e no que NÃO deve aparecer.
 */
import { describe, it, expect } from "vitest";
import { renderPerpetualReportHtml } from "../services/perpetual-report-html.js";
import { computePerpetualReport } from "../services/perpetual-report-metrics.js";
import { resolvePerpetualRates, type PerpetualReportConfig } from "../services/perpetual-report-config.js";

function cfg(over: Partial<PerpetualReportConfig> = {}): PerpetualReportConfig {
  return {
    funnelId: "f", funnelName: "FZ-A1", projectId: "p", projectName: "Fernanda",
    metaAccountId: "a", campanhas: [], prefixoCampanha: "fza1", produto: "Curso",
    produtosOrderBump: [], temSplitFormato: false, origensPagas: ["meta"],
    inicioTrafego: null, validado: true, validadoEm: null, validadoPor: null,
    impostoPct: 0.1215, impostoOrigem: "default",
    taxaPlataformaPct: null, taxaImpostoPct: null, taxaOutrosPct: null, ...over,
  };
}

function build(over: { margem?: "neg" | "pos"; split?: boolean } = {}) {
  const config = cfg({ temSplitFormato: over.split ?? false });
  const rates = resolvePerpetualRates(config, "kiwify", true);
  const fat = over.margem === "neg" ? 12331 : 40000;
  const report = computePerpetualReport({
    config, rates,
    periodo: { inicio: "2026-06-01", fim: "2026-07-27" },
    campanhas: [
      { campaignId: "h", campaignName: "[FZA1][HOT][VIDEOS]", spend: 4053.02, spendComImposto: 4546.68 },
      { campaignId: "c", campaignName: "[FZA1][COLD][ESTATICOS]", spend: 6657.63, spendComImposto: 7645.29 },
    ],
    vendas: Array.from({ length: 209 }, (_, i) => ({
      email: `v${i}@x.com`, dia: "2026-06-15", valorBruto: fat / 209,
      utmSource: "meta", utmCampaign: i % 2 ? "h" : "c",
      utmMedium: `adset-${i % 3}`, utmContent: `ad-${i % 5}`, produto: null,
    })),
  });
  return { report, html: renderPerpetualReportHtml(report) };
}

describe("estrutura do HTML (§C.4)", () => {
  const { html } = build();

  it("é autocontido — sem script e sem recurso externo", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("<style>");
  });

  it("traz cabeçalho com funil, período, dias e produto", () => {
    expect(html).toContain("FZ-A1");
    expect(html).toContain("01/06/2026 a 27/07/2026");
    expect(html).toContain("57 dias");
    expect(html).toContain("Curso");
  });

  it("traz as seções obrigatórias na ordem do §C.4", () => {
    const ordem = ["Memorial da margem", "Fontes", "Campanhas", "Tendência", "Leituras", "Notas de dado"];
    let pos = -1;
    for (const s of ordem) {
      const i = html.indexOf(s);
      expect(i, `seção "${s}" ausente`).toBeGreaterThan(-1);
      expect(i, `seção "${s}" fora de ordem`).toBeGreaterThan(pos);
      pos = i;
    }
  });

  it("Fontes cita o prefixo do ciclo — não é decoração", () => {
    expect(html).toContain("Prefixo do ciclo");
    expect(html).toContain("fza1");
  });

  it("tabelas micro rolam sozinhas (não estouram a página)", () => {
    expect(html).toContain('class="scroll"');
  });
});

describe("margem verde/vermelha (§C.4)", () => {
  it("margem negativa usa a classe vermelha no card", () => {
    const { report, html } = build({ margem: "neg" });
    expect(report.kpis.margem).toBeLessThan(0);
    expect(html).toContain('class="kpi neg"');
  });

  it("margem positiva usa a classe verde", () => {
    const { report, html } = build();
    expect(report.kpis.margem).toBeGreaterThan(0);
    expect(html).toContain('class="kpi pos"');
  });
});

describe("seção ausente some — não vira tabela vazia (§C.9)", () => {
  it("sem split, não existe tabela de Formato", () => {
    const { report, html } = build({ split: false });
    expect(report.segmentos.formato).toBeUndefined();
    expect(html).not.toContain("<h2>Formato</h2>");
    // ...mas a limitação é explicada nas notas.
    expect(html).toContain("não se aplica a este funil");
  });

  it("com split, a tabela de Formato existe", () => {
    const { html } = build({ split: true });
    expect(html).toContain("<h2>Formato</h2>");
  });
});

describe("segurança do render", () => {
  it("nome de campanha com HTML é escapado, não injetado", () => {
    const config = cfg();
    const rates = resolvePerpetualRates(config, "kiwify", true);
    const report = computePerpetualReport({
      config, rates, periodo: { inicio: "2026-07-01", fim: "2026-07-27" },
      campanhas: [{ campaignId: "x", campaignName: '<img src=x onerror="alert(1)">', spend: 10, spendComImposto: 11 }],
      vendas: [],
    });
    const html = renderPerpetualReportHtml(report);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
