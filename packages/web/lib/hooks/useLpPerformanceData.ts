"use client";

/**
 * Story 18.44 / 18.46: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Story 18.46:
 * - Identifica a LP pelo Campaign Name da API Meta Ads (contém lpa/lpb/...).
 *   Gasto sem lpX no Campaign Name → atribuído a LPA (decisão Danilo 2026-06-12).
 * - LP View real = landing_page_view da API (campo landingPageViews do endpoint).
 * - Leads contados da planilha n8n-leads-lp-cap-grat via utm_content (leadsByLp).
 * - Filtro de público (hot/cold/todos) efetivo, classificando por Campaign Name + utm_term.
 * - Retorna uma lista plana `lps` (uma linha por LP) para renderização em tabela única.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useCrossReferenceLeads } from "@/lib/hooks/useCrossReferenceLeads";
import { calculateTemperature } from "@/lib/utils/creative-metrics-calculator";
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

/**
 * Story 18.46 (AC3): extrai a LP do Campaign Name (contém lpa/lpb/...).
 * Default: LPA quando o Campaign Name não contém nenhum lpX (decisão Danilo).
 */
function extractLpKey(campaignName: string | null | undefined): string {
  const match = campaignName?.toLowerCase().match(/lp([a-z])/);
  return match ? `lp${match[1]}` : "lpa";
}

export function useLpPerformanceData({
  projectId,
  funnelId,
  stageId,
  days = 30,
  publicoFilter = "todos",
}: UseLpPerformanceDataOptions): LpPerformanceResult {
  const apiClient = useApiClient();

  // Creative performance traz spend/clicks/impressions + campaignName + landingPageViews (Story 18.46)
  const creativesQuery = useQuery<StageCreativePerformanceResponse, Error>({
    queryKey: ["lp-performance-data", funnelId, stageId, days],
    queryFn: () =>
      apiClient<StageCreativePerformanceResponse>(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Leads por LP (via utm_content) quebrados por temperatura — Story 18.43/18.46
  const leadsQuery = useCrossReferenceLeads({
    projectId,
    funnelId,
    stageId,
    days,
  });

  const result = useMemo(() => {
    const creatives = creativesQuery.data?.creatives;
    if (!creatives || creatives.length === 0) {
      return { lps: [] as LpRow[], isLoading: false };
    }

    const lpTotals: Record<string, LpRow> = {};

    for (const creative of creatives) {
      // Story 18.46 (AC7): filtro de público por Campaign Name + utm_term
      if (publicoFilter !== "todos") {
        const temp = calculateTemperature(creative.utmTerm, creative.campaignName);
        if (temp !== publicoFilter) continue;
      }

      // Story 18.46 (AC3): LP identificada pelo Campaign Name (default LPA)
      const key = extractLpKey(creative.campaignName);
      const lpName = key.toUpperCase();

      if (!lpTotals[key]) {
        lpTotals[key] = {
          lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: 0,
          lpViews: 0,
          leads: 0,
          faturamento: 0,
        };
      }

      lpTotals[key].investimento += creative.spend ?? 0;
      lpTotals[key].cliques += creative.clicks ?? 0;
      lpTotals[key].impressoes += creative.impressions ?? 0;
      lpTotals[key].conversoes += creative.clicks ?? 0; // conversão = clique (chegada à LP)
      lpTotals[key].lpViews += creative.landingPageViews ?? 0; // Story 18.46 (AC4): LP View real
      lpTotals[key].faturamento = (lpTotals[key].faturamento ?? 0) + (creative.revenue ?? 0);
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
