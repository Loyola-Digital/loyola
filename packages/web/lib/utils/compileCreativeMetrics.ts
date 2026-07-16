/**
 * Story 18.28: Compilação de criativos em modo "Todos"
 * Agrupa por ad_name e compila métricas (soma + média ponderada)
 */

import { type CalculatedMetrics } from "./creative-metrics-calculator";

export interface CompiledCreativeMetric extends Omit<CalculatedMetrics, 'temperature' | 'roi'> {
  compiled: true;
  originalCount: number; // Quantos criativos foram compilados neste
  temperature: 'all'; // Temperature fixo para modo compilado
  roi: number; // ROI = (revenue - spend) / spend * 100
  cvr: number; // CVR = leads / impressions
  totalSpend?: number; // Para cálculos de percentual
}

/**
 * Compila métricas por ad_name (soma + média ponderada)
 * - Soma simples: spend, impressions, clicks, conversions, leads, revenue
 * - Média ponderada (por impressões): ctr, cvr
 * - Média aritmética: cpc, cpm, roi
 * - ROAS compilado: sum(revenue) / sum(spend)
 */
export function compileCreativeMetricsByName(
  metrics: CalculatedMetrics[]
): CompiledCreativeMetric[] {
  const groups = new Map<string, CalculatedMetrics[]>();

  // Agrupar por ad_name
  for (const metric of metrics) {
    const name = metric.adName;
    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name)!.push(metric);
  }

  // Compilar cada grupo
  const compiled: CompiledCreativeMetric[] = [];
  for (const [adName, group] of groups) {
    if (group.length === 0) continue;

    // Somas simples
    const sumSpend = group.reduce((sum, m) => sum + m.spend, 0);
    const sumImpressions = group.reduce((sum, m) => sum + m.impressions, 0);
    const sumClicks = group.reduce((sum, m) => sum + m.clicks, 0);
    const sumLeads = group.reduce((sum, m) => sum + m.leads, 0);
    const sumRevenue = group.reduce((sum, m) => sum + m.revenue, 0);

    // Story 18.55 (Captação Paga): soma Único/Total e recalcula CPL/ROAS
    // sobre os somados — mesmo padrão do spendPercent (recalculado depois).
    const isPaidMode = group.some((m) => m.ingressosUnicos != null);
    const sumIngressosUnicos = group.reduce((sum, m) => sum + (m.ingressosUnicos ?? 0), 0);
    const sumIngressosTotais = group.reduce((sum, m) => sum + (m.ingressosTotais ?? 0), 0);
    const sumRevenueTotal = group.reduce((sum, m) => sum + (m.revenueTotal ?? 0), 0);
    const sumRevenueUnico = group.reduce((sum, m) => sum + (m.revenueUnico ?? 0), 0);

    // Porcentagens: será recalculado pela tabela
    // Usamos 0 como placeholder, será recalculado baseado no contexto total
    const spendPercent = 0;

    // Médias ponderadas (por impressões)
    const ctr = sumImpressions > 0 ? sumClicks / sumImpressions : 0;
    const cvr = sumImpressions > 0 ? sumLeads / sumImpressions : 0;

    // Médias aritméticas
    const cpc = sumClicks > 0 ? sumSpend / sumClicks : 0;
    const cpm = sumImpressions > 0 ? (sumSpend / sumImpressions) * 1000 : 0;

    // CPL: cost per lead (Paga: cost per ingresso único)
    const cpl = isPaidMode
      ? (sumIngressosUnicos > 0 ? sumSpend / sumIngressosUnicos : 0)
      : (sumLeads > 0 ? sumSpend / sumLeads : 0);

    // ROAS: revenue / spend (Paga: Fat. Total / spend)
    const roas = isPaidMode
      ? (sumSpend > 0 ? sumRevenueTotal / sumSpend : 0)
      : (sumSpend > 0 ? sumRevenue / sumSpend : 0);

    // ROI: (revenue - spend) / spend * 100
    const roi = sumSpend > 0 ? ((sumRevenue - sumSpend) / sumSpend) * 100 : 0;

    compiled.push({
      adId: `compiled_${adName}`, // ID fake para ser único
      adName,
      spend: sumSpend,
      spendPercent,
      impressions: sumImpressions,
      clicks: sumClicks,
      ctr,
      cpc,
      cpm,
      leads: sumLeads,
      cpl,
      revenue: sumRevenue,
      roas,
      roi,
      cvr,
      utmTerm: group[0].utmTerm ?? null, // Usar primeira
      temperature: 'all' as const, // Temperature fixo para modo compilado
      compiled: true,
      originalCount: group.length,
      totalSpend: sumSpend, // Será usado para recalcular percentual na tabela
      // Story 18.55: Único/Total somados por Ad Name (só na Paga)
      ...(isPaidMode
        ? {
            ingressosUnicos: sumIngressosUnicos,
            ingressosTotais: sumIngressosTotais,
            revenueTotal: sumRevenueTotal,
            revenueUnico: sumRevenueUnico,
          }
        : {}),
    });
  }

  return compiled;
}

/**
 * Detecta se todos os 3 filtros estão selecionados como "Todos"
 * Para esta story, consideramos que quando o filtro de temperatura é "all",
 * estamos no modo "compilação"
 *
 * Nota: A requisição original menciona "3 filtros selecionáveis" mas o componente
 * atual tem apenas 1 (temperatura). Essa função pode ser estendida no futuro
 * para suportar mais filtros.
 */
export function isAllFiltersSelected(
  temperatureFilter: string,
  // Placeholder para futuros filtros
  _filter2?: string,
  _filter3?: string
): boolean {
  // Por enquanto: "Todos" é quando temperatureFilter === "all"
  return temperatureFilter === "all";
}
