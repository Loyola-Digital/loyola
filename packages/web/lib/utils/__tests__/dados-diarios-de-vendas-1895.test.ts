/**
 * Story 18.95 — "Dados diários" da etapa de Vendas.
 *
 * Cada teste diz a mutação que derruba.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StageSalesData } from "@loyola-x/shared";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import { montarDadosDiariosDeVendas } from "@/lib/utils/dados-diarios-de-vendas";

function insight(date: string, spend: number, impressions: number, linkClicks: number, campaign = "c1"): CampaignDailyInsight {
  return {
    date_start: date,
    date_stop: date,
    impressions: String(impressions),
    reach: "0",
    clicks: String(linkClicks * 2),
    spend: String(spend),
    ctr: "0",
    cpc: "0",
    cpm: "0",
    actions: [
      { action_type: "link_click", value: String(linkClicks) },
      { action_type: "landing_page_view", value: String(Math.floor(linkClicks / 2)) },
      { action_type: campaign === "c1" ? "initiate_checkout" : "offsite_conversion.fb_pixel_initiate_checkout", value: "1" },
    ],
  };
}

// Duas campanhas no dia 01 (o dia soma as duas), uma no dia 02, nada no 03.
const meta = [
  insight("2026-10-01", 100, 1000, 20),
  insight("2026-10-01", 50, 500, 10, "c2"),
  insight("2026-10-02", 200, 4000, 40),
];

const dia = (pago: number, org: number, semTrack: number, manual: number, faturamento: number, faturamentoPago: number) => ({
  pago, org, semTrack, manual, faturamento, faturamentoPago,
});

const vendasNovas = {
  diarioDeVendas: {
    dias: {
      "2026-10-01": dia(1, 1, 0, 0, 1500, 1000),
      "2026-10-03": dia(0, 0, 0, 1, 400, 0),
    },
    semData: dia(0, 0, 1, 0, 120, 0),
  },
  ingressosByDay: { "2026-10-01": { pago: 99, org: 0, semTrack: 0 } },
} as unknown as StageSalesData;

const d = montarDadosDiariosDeVendas({ meta, temCampanha: true, vendas: vendasNovas, ordem: "asc" });
const porDia = (k: string) => d.dias.find((r) => r.date === k)!;

describe("uma linha por dia com investimento ou venda (AC2/AC4)", () => {
  it("dia com os dois, só investimento e só venda; ordenado", () => {
    expect(d.dias.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("o dia soma as campanhas, com o imposto Meta", () => {
    // Mutação: pegar só a primeira campanha do dia → 100 em vez de 150.
    expect(porDia("2026-10-01").investimento).toBeCloseTo(applyMetaAdsTax(150, "2026-10-01"), 6);
    expect(porDia("2026-10-01").impressoes).toBe(1500);
    expect(porDia("2026-10-01").cliques).toBe(30);
    expect(porDia("2026-10-01").checkouts).toBe(2);
  });

  it("vendas por origem, manual em coluna própria (P4)", () => {
    expect(porDia("2026-10-01")).toMatchObject({ vendas: 2, vendasPago: 1, vendasOrg: 1, vendasManual: 0 });
    expect(porDia("2026-10-03")).toMatchObject({ vendas: 1, vendasManual: 1, vendasSemTrack: 0 });
  });
});

describe("fórmulas do card, por dia", () => {
  const r = porDia("2026-10-01");
  const inv = applyMetaAdsTax(150, "2026-10-01");

  it("ROAS = faturamento PAGO ÷ investimento", () => {
    // Mutação: faturamento total ÷ investimento → 1500/inv.
    expect(r.roas).toBeCloseTo(1000 / inv, 6);
  });

  it("CPV = investimento ÷ vendas PAGAS", () => {
    // Mutação: ÷ vendas totais → inv/2.
    expect(r.cpv).toBeCloseTo(inv / 1, 6);
  });

  it("ticket = faturamento ÷ vendas; CTR em %; CPM e CPC pelo clique no link", () => {
    expect(r.ticketMedio).toBe(750);
    expect(r.ctr).toBeCloseTo(2, 6);
    expect(r.cpm).toBeCloseTo((inv * 1000) / 1500, 6);
    expect(r.cpc).toBeCloseTo(inv / 30, 6);
  });

  it("denominador zero dá null ('—')", () => {
    const so = porDia("2026-10-02");
    expect(so.cpv).toBeNull();
    expect(so.ticketMedio).toBeNull();
    expect(so.roas).toBe(0);
    expect(porDia("2026-10-03").roas).toBeNull();
  });
});

describe("Sem data e Total (AC5/AC5b)", () => {
  it("a linha 'Sem data' aparece com a venda sem data, sem Meta", () => {
    expect(d.semData).toMatchObject({ vendas: 1, vendasSemTrack: 1, faturamento: 120, investimento: null });
  });

  it("o Total soma dias + sem data e recalcula as derivadas (não média)", () => {
    // Mutação: deixar a linha 'Sem data' fora do Total → 1900 em vez de 2020.
    const inv = applyMetaAdsTax(150, "2026-10-01") + applyMetaAdsTax(200, "2026-10-02");
    expect(d.total).toMatchObject({ vendas: 4, faturamento: 2020, vendasManual: 1 });
    expect(d.total!.investimento).toBeCloseTo(inv, 6);
    expect(d.total!.roas).toBeCloseTo(1000 / inv, 6);
    expect(d.total!.cpv).toBeCloseTo(inv, 6);
    expect(d.total!.ticketMedio).toBeCloseTo(2020 / 4, 6);
  });

  it("sem venda sem data, a linha não existe", () => {
    const sem = montarDadosDiariosDeVendas({
      meta,
      temCampanha: true,
      vendas: { diarioDeVendas: { dias: {}, semData: dia(0, 0, 0, 0, 0, 0) } } as unknown as StageSalesData,
    });
    expect(sem.semData).toBeNull();
  });

  it("sem venda e sem investimento: nada (AC7)", () => {
    expect(montarDadosDiariosDeVendas({ meta: [], temCampanha: true, vendas: null })).toEqual({ dias: [], semData: null, total: null });
  });
});

describe("sem campanha vinculada (P5) e API anterior (AC9)", () => {
  it("sem campanha, as colunas Meta ficam null e as vendas aparecem", () => {
    const s = montarDadosDiariosDeVendas({ meta, temCampanha: false, vendas: vendasNovas, ordem: "asc" });
    expect(s.dias.map((r) => r.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(s.dias[0]).toMatchObject({ investimento: null, cpv: null, roas: null, impressoes: null, vendas: 2 });
  });

  it("API anterior: vendas pelo ingressosByDay, faturamento pelo faturamentoTotalByDay, ROAS null, sem 'Sem data'", () => {
    const antiga = {
      ingressosByDay: { "2026-10-01": { pago: 1, org: 0, semTrack: 0, manual: 1 } },
      faturamentoTotalByDay: { "2026-10-01": 900 },
    } as unknown as StageSalesData;
    const a = montarDadosDiariosDeVendas({ meta, temCampanha: true, vendas: antiga, ordem: "asc" });
    expect(a.dias[0]).toMatchObject({ date: "2026-10-01", vendas: 2, vendasManual: 1, faturamento: 900, roas: null });
    expect(a.semData).toBeNull();
    expect(a.total!.roas).toBeNull();
  });
});

describe("o fio — a tela de Vendas monta a tabela acima de 'Vendas por dia'", () => {
  const fonte = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf-8");

  it("SalesDailyTable vem antes do SalesDailyComparisonChart (AC1)", () => {
    const view = fonte("components/funnels/sales-stage-view.tsx");
    const tabela = view.indexOf("<SalesDailyTable");
    expect(tabela).toBeGreaterThan(view.indexOf("<SalesConversionCard"));
    expect(tabela).toBeLessThan(view.indexOf("<SalesDailyComparisonChart"));
  });

  it("a tabela usa as MESMAS queries do card, com main_product,tmb e o fallback sales (AC3)", () => {
    const comp = fonte("components/funnels/sales-daily-table.tsx");
    expect(comp).toMatch(/useCampaignDailyInsightsBulk\(/);
    expect(comp).toMatch(/useStageSalesData\(projectId, funnelId, stageId, "main_product,tmb", days\)/);
    expect(comp).toMatch(/useStageSalesData\(projectId, funnelId, stageId, "sales", days\)/);
    expect(comp).toMatch(/montarDadosDiariosDeVendas\(/);
  });
});
