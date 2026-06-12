"use client";

/**
 * Story 18.44: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Busca dados de creative-performance endpoint que já traz utm_term via planilha
 * Identifica LPs via regex /lp([a-z])/i no utm_term
 * Agrupa por LP: uma linha com dados totais por LP
 *
 * Leads contados da planilha n8n-leads-lp-cap-grat (Story 18.43 pattern)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useCrossReferenceLeads } from "@/lib/hooks/useCrossReferenceLeads";

interface LpDaily {
  date: string;
  lpName: string; // "LPA", "LPB", "LPC", etc.
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  leads?: number;
}

interface LpPerformanceResponse {
  lpsByName: Record<
    string,
    {
      name: string;
      data: LpDaily[];
    }
  >;
  isLoading: boolean;
  error?: string;
}

interface UseLpPerformanceDataOptions {
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
}

export function useLpPerformanceData({
  projectId,
  funnelId,
  stageId,
  days = 30,
}: UseLpPerformanceDataOptions): LpPerformanceResponse {
  const apiClient = useApiClient();

  // Fetch creative performance data which includes utm_term from spreadsheet
  const creativesQuery = useQuery({
    queryKey: ["lp-performance-data", funnelId, stageId, days],
    queryFn: () =>
      apiClient(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch leads count by LP from spreadsheet (Story 18.43 pattern)
  const leadsQuery = useCrossReferenceLeads({
    projectId,
    funnelId,
    stageId,
    days,
  });

  // Process and aggregate LPs from creative data
  const result = useMemo(() => {
    const lpsByName: Record<
      string,
      {
        name: string;
        data: LpDaily[];
      }
    > = {};

    if (!creativesQuery.data?.creatives || creativesQuery.data.creatives.length === 0) {
      return { lpsByName, isLoading: false };
    }

    // Build leads count map by LP from termsMapping (ad_id → lp identifier)
    const leadsByLp: Record<string, number> = {};
    if (leadsQuery.termsMapping) {
      for (const [, utmTerm] of Object.entries(leadsQuery.termsMapping)) {
        const lpMatch = (utmTerm as string).match(/lp([a-z])/i);
        if (lpMatch) {
          const lpName = `lp${lpMatch[1].toLowerCase()}`;
          leadsByLp[lpName] = (leadsByLp[lpName] ?? 0) + 1;
        }
      }
    }

    // Aggregate creatives by LP
    const lpTotals: Record<string, LpDaily> = {};

    for (const creative of creativesQuery.data.creatives) {
      const utmTermFromSpreadsheet = leadsQuery.termsMapping?.[creative.adId];
      const utmTerm = (utmTermFromSpreadsheet || creative.utmTerm)?.toLowerCase();

      if (!utmTerm) continue;

      const lpMatch = utmTerm.match(/lp([a-z])/);
      if (!lpMatch) continue;

      const lpName = `LP${lpMatch[1].toUpperCase()}`;
      const key = lpName.toLowerCase();

      if (!lpTotals[key]) {
        lpTotals[key] = {
          date: lpName,
          lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: 0,
          lpViews: 0,
          leads: 0,
        };
      }

      // Aggregate metrics
      lpTotals[key].investimento += creative.spend ?? 0;
      lpTotals[key].cliques += creative.clicks ?? 0;
      lpTotals[key].impressoes += creative.impressions ?? 0;
      lpTotals[key].conversoes += creative.clicks ?? 0; // Conversions = Clicks
      lpTotals[key].lpViews += 0; // TODO: puxar da API
      lpTotals[key].leads = (leadsByLp[key] ?? 0);
    }

    // Fill lpsByName
    for (const [key, lpDaily] of Object.entries(lpTotals)) {
      lpsByName[key] = {
        name: lpDaily.lpName,
        data: [lpDaily],
      };
    }

    return { lpsByName, isLoading: false };
  }, [creativesQuery.data, leadsQuery.termsMapping]);

  return {
    lpsByName: result.lpsByName,
    isLoading: creativesQuery.isLoading || leadsQuery.isLoading,
    error: creativesQuery.error?.message || leadsQuery.error,
  };
}
