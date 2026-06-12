"use client";

/**
 * Story 18.44: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Busca Campaigns da Meta Ads API que contêm "lpa", "lpb", "lpc" no Campaign Name
 * Dados: spend, link_clicks, impressions, landing_page_views
 * Métricas calculadas: CPM, CPC, CTR, Connect Rate
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
  leads?: number; // Contados da planilha por LP
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

  // Fetch LP campaigns from Meta Ads API
  // Returns campaigns with campaign_name containing "lpa", "lpb", "lpc"
  const campaignsQuery = useQuery({
    queryKey: ["lp-campaigns", funnelId, stageId, days],
    queryFn: () =>
      apiClient(
        `/api/funnels/${funnelId}/stages/${stageId}/lp-campaigns?days=${days}`,
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

  // Process and aggregate LPs
  // Combine: Campaign metrics from Meta Ads + Leads count from spreadsheet
  const result = useMemo(() => {
    const lpsByName: Record<
      string,
      {
        name: string;
        data: LpDaily[];
      }
    > = {};

    console.log("[useLpPerformanceData] campaignsQuery.data:", campaignsQuery.data);
    console.log("[useLpPerformanceData] campaignsQuery.error:", campaignsQuery.error);
    console.log("[useLpPerformanceData] leadsQuery.termsMapping:", leadsQuery.termsMapping);

    if (!campaignsQuery.data?.campaigns || campaignsQuery.data.campaigns.length === 0) {
      console.log("[useLpPerformanceData] No campaigns found or data is empty");
      return { lpsByName, isLoading: false };
    }

    // Build leads count map by LP (from spreadsheet)
    const leadsByLp: Record<string, number> = {};
    if (leadsQuery.termsMapping) {
      for (const [adId, utmTerm] of Object.entries(leadsQuery.termsMapping)) {
        const lpMatch = (utmTerm as string).match(/lp([a-z])/i);
        if (lpMatch) {
          const lpName = `lp${lpMatch[1].toLowerCase()}`;
          leadsByLp[lpName] = (leadsByLp[lpName] ?? 0) + 1;
        }
      }
    }

    // Aggregate campaigns by LP (one row per LP with totals)
    const lpTotals: Record<string, LpDaily> = {};

    for (const campaign of campaignsQuery.data.campaigns) {
      const lpName = campaign.lpName;
      const key = lpName.toLowerCase();

      if (!lpTotals[key]) {
        lpTotals[key] = {
          date: lpName,
          lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: campaign.linkClicks, // Connect Rate = (linkClicks / linkClicks) * 100 = conversions
          lpViews: 0,
          leads: 0,
        };
      }

      // Aggregate metrics from campaign
      lpTotals[key].investimento += campaign.spend;
      lpTotals[key].cliques += campaign.linkClicks;
      lpTotals[key].impressoes += campaign.impressions;
      lpTotals[key].conversoes = campaign.linkClicks; // Conversions = Link Clicks (users who clicked to LP)
      lpTotals[key].lpViews += campaign.lpViews;
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
  }, [campaignsQuery.data, leadsQuery.termsMapping]);

  return {
    lpsByName: result.lpsByName,
    isLoading: campaignsQuery.isLoading || leadsQuery.isLoading,
    error: campaignsQuery.error?.message || leadsQuery.error,
  };
}
