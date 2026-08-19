/**
 * Agregador de linhas de insight da Meta — o balde e o acumulador.
 *
 * Story 44.8 (AC2): estes quatro eram privados de `routes/public-meta.ts`.
 * Saíram de lá **sem mudar uma linha de comportamento**, porque o serviço de
 * série diária por campanha (`services/meta-campaign-daily.ts`) precisa dos
 * mesmos, e duas rotas montando a mesma série de dois jeitos é a semente da
 * próxima divergência do `connectRate` (Story 44.2 — 18 a 35 p.p. errados por
 * mais de um ano, não por bug, por duas implementações).
 *
 * ⚠️ **`accumulate` já aplica o gross-up de imposto Meta** (`applyMetaTax`,
 * 12,15% para datas ≥ 2026-01-01). Quem consome daqui recebe `spend`
 * TRIBUTADO e **não pode reaplicar** — foi o bug da 29.24, corrigido na 29.27.
 */

import { applyMetaTax } from "./meta-tax.js";
import { parseLeads, parsePurchases, parsePurchaseRevenue, parseActionCount } from "./meta-metrics.js";

export interface MetricAgg {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
  purchases: number;
  revenue: number;
  lpViews: number;
  checkouts: number;
  lastSyncedAt: Date | null;
}

export function emptyAgg(): MetricAgg {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    leads: 0,
    purchases: 0,
    revenue: 0,
    lpViews: 0,
    checkouts: 0,
    lastSyncedAt: null,
  };
}

export type InsightRow = {
  dateStart: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  actions: { action_type: string; value: string }[] | null;
  actionValues: { action_type: string; value: string }[] | null;
  lastSyncedAt: Date;
};

export function accumulate(agg: MetricAgg, row: InsightRow): void {
  agg.spend += applyMetaTax(parseFloat(row.spend || "0"), row.dateStart);
  agg.impressions += parseFloat(row.impressions || "0");
  agg.reach += parseFloat(row.reach || "0");
  agg.clicks += parseFloat(row.clicks || "0");
  // Auditoria 6.2/39.9: `clicks` da Meta são cliques TOTAIS — link_click é a
  // métrica de tráfego real (a que o dashboard interno usa no Detalhamento).
  agg.linkClicks += parseActionCount(row.actions, "link_click");
  agg.leads += parseLeads(row.actions);
  agg.purchases += parsePurchases(row.actions);
  agg.revenue += parsePurchaseRevenue(row.actionValues);
  agg.lpViews += parseActionCount(row.actions, "landing_page_view");
  // Resumão v4 #7: funil de checkout (initiate_checkout do pixel).
  agg.checkouts += parseActionCount(row.actions, "initiate_checkout");
  if (!agg.lastSyncedAt || row.lastSyncedAt > agg.lastSyncedAt) {
    agg.lastSyncedAt = row.lastSyncedAt;
  }
}
