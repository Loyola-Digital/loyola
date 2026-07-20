"use client";

/**
 * Story 18.44 / 18.46: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Story 18.46:
 * - Usa o corte `lpBreakdown` do endpoint creative-performance (agregado por LP ×
 *   temperatura sobre os ads BRUTOS, sem o colapso por ad_name). Cada LP vira 1 linha.
 *   Identificação da LP pelo Campaign Name (sem lpX → LPA, decisão Danilo).
 * - LP View real = landing_page_view da API (somado por LP no backend).
 * - Leads contados da planilha n8n-leads-lp-cap-grat (utm_term/utm_content contém lpX),
 *   quebrados por temperatura para o filtro de público.
 * - Filtro de público (hot/cold/todos) efetivo via a temperatura do breakdown.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useCrossReferenceLeads } from "@/lib/hooks/useCrossReferenceLeads";
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";
import type { StageCreativePerformanceResponse } from "@/lib/hooks/useStageCreativePerformance";

export interface LpRow {
  lpName: string; // "LPA", "LPB", "LPC", etc.
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  leads: number;
  vendas?: number;
  faturamento?: number;
  // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP (Captação Paga)
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueUnico?: number;
  revenueTotal?: number;
}

interface LpPerformanceResult {
  lps: LpRow[];
  isLoading: boolean;
  error?: string;
}

interface UseLpPerformanceDataOptions {
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
  publicoFilter?: "hot" | "cold" | "todos";
}

export function useLpPerformanceData({
  projectId,
  funnelId,
  stageId,
  days = 30,
  publicoFilter = "todos",
}: UseLpPerformanceDataOptions): LpPerformanceResult {
  const apiClient = useApiClient();

  // creative-performance traz `lpBreakdown` (Story 18.46): agregado por LP × temperatura
  const creativesQuery = useQuery<StageCreativePerformanceResponse, Error>({
    queryKey: ["lp-performance-data", funnelId, stageId, days],
    queryFn: () =>
      apiClient<StageCreativePerformanceResponse>(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Mesmo endpoint do creative-performance (pode custar ~25s no 1º compute).
    // Cap o retry pra falha não virar minutos de "loading".
    retry: 1,
  });

  // Leads por LP (via planilha n8n), quebrados por temperatura
  const leadsQuery = useCrossReferenceLeads({
    projectId,
    funnelId,
    stageId,
    days,
  });

  const result = useMemo(() => {
    const breakdown = creativesQuery.data?.lpBreakdown;
    if (!breakdown || breakdown.length === 0) {
      return { lps: [] as LpRow[], isLoading: false };
    }

    const lpTotals: Record<string, LpRow> = {};

    // Imposto Meta aplica a partir de 2026; o breakdown é agregado no período,
    // sem data por linha — usamos a data atual (lançamentos correntes são 2026+).
    const taxDate = new Date().toISOString().slice(0, 10);

    for (const entry of breakdown) {
      // Story 18.46 (AC7): filtro de público pela temperatura do breakdown
      if (publicoFilter !== "todos" && entry.temperature !== publicoFilter) continue;

      const key = entry.lpName.toLowerCase();
      if (!lpTotals[key]) {
        lpTotals[key] = {
          lpName: entry.lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: 0,
          lpViews: 0,
          leads: 0,
          vendas: 0,
          faturamento: 0,
          ingressosUnicos: 0,
          ingressosTotais: 0,
          revenueUnico: 0,
          revenueTotal: 0,
        };
      }
      // Imposto Meta Ads de 12,15% (2026+): o spend cru da API não inclui. Aplica
      // pra bater com o card de Investimento / Dados Diários (que já usam applyMetaAdsTax).
      lpTotals[key].investimento += applyMetaAdsTax(entry.spend, taxDate);
      lpTotals[key].cliques += entry.clicks;
      lpTotals[key].impressoes += entry.impressions;
      lpTotals[key].conversoes += entry.clicks; // conversão = clique (chegada à LP)
      lpTotals[key].lpViews += entry.landingPageViews;
      // Story 18.50: vendas/faturamento por LP (atribuídos no backend via co= →
      // campanha). Somados respeitando o mesmo filtro de público do spend, já que
      // cada entry é LP×temperatura — o ROAS por LP fica consistente com o gasto.
      lpTotals[key].vendas = (lpTotals[key].vendas ?? 0) + (entry.vendas ?? 0);
      lpTotals[key].faturamento = (lpTotals[key].faturamento ?? 0) + (entry.faturamento ?? 0);
      // Story 18.60: Ing. Únicos/Totais + Fat. Único/Total por LP — somados sob o
      // mesmo filtro de público (cada entry é LP×temperatura, já filtrado acima).
      lpTotals[key].ingressosUnicos = (lpTotals[key].ingressosUnicos ?? 0) + (entry.ingressosUnicos ?? 0);
      lpTotals[key].ingressosTotais = (lpTotals[key].ingressosTotais ?? 0) + (entry.ingressosTotais ?? 0);
      lpTotals[key].revenueUnico = (lpTotals[key].revenueUnico ?? 0) + (entry.revenueUnico ?? 0);
      lpTotals[key].revenueTotal = (lpTotals[key].revenueTotal ?? 0) + (entry.revenueTotal ?? 0);
    }

    // Story 18.46 (AC6/AC7): leads por LP, respeitando o filtro de público
    for (const key of Object.keys(lpTotals)) {
      const lpLeads = leadsQuery.leadsByLp?.[key];
      if (lpLeads) {
        lpTotals[key].leads =
          publicoFilter === "hot"
            ? lpLeads.hot
            : publicoFilter === "cold"
              ? lpLeads.cold
              : lpLeads.total;
      } else {
        lpTotals[key].leads = 0;
      }
    }

    // Story 18.46 (AC2): uma linha por LP, ordenado por investimento desc
    const lps = Object.values(lpTotals).sort(
      (a, b) => b.investimento - a.investimento,
    );

    return { lps, isLoading: false };
  }, [creativesQuery.data, leadsQuery.leadsByLp, publicoFilter]);

  return {
    lps: result.lps,
    isLoading: creativesQuery.isLoading || leadsQuery.isLoading,
    error: creativesQuery.error?.message || leadsQuery.error,
  };
}
