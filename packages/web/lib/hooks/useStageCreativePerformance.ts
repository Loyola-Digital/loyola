"use client";

/**
 * Story 18.24: Hook para fetch de dados de criativos
 * Usa React Query para cache e refetch automático.
 *
 * Usa useApiClient (Clerk JWT + NEXT_PUBLIC_API_URL) em vez de fetch raw —
 * caso contrário em prod a Vercel bloqueia o request (DNS_HOSTNAME_RESOLVED_PRIVATE)
 * porque o backend mora em outro hostname.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useCrossReferenceLeads } from "@/lib/hooks/useCrossReferenceLeads";

export interface CreativePerformanceData {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
  utmTerm: string | null;
}

export interface StageCreativePerformanceResponse {
  stageId: string;
  stageType: string;
  days: number;
  creatives: CreativePerformanceData[];
  summary: {
    totalSpend: number;
    totalLeads: number;
    totalRevenue: number;
  };
  /**
   * Transparencia: filtro de campanha aplicado pelo backend.
   * - `source: 'stage'` -> usou funnelStages.campaigns
   * - `source: 'funnel'` -> stage estava vazio, caiu pra funnels.campaigns
   * - `source: 'none'` -> nem stage nem funnel tem campanha (resposta vazia)
   */
  appliedFilter?: {
    source: "stage" | "funnel" | "none";
    campaigns: { id: string; name: string }[];
  };
}

interface UseStageCreativePerformanceOptions {
  projectId?: string;
  funnelId: string;
  stageId: string;
  days?: number;
  enabled?: boolean;
}

export function useStageCreativePerformance({
  projectId,
  funnelId,
  stageId,
  days = 30,
  enabled = true,
}: UseStageCreativePerformanceOptions) {
  const apiClient = useApiClient();

  // Fetch base creative performance data
  const baseQuery = useQuery<StageCreativePerformanceResponse, Error>({
    queryKey: ["stage-creative-performance", funnelId, stageId, days],
    queryFn: () =>
      apiClient<StageCreativePerformanceResponse>(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: enabled && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Story 18.43: For free stages, enrich leads via crossref
  const crossrefQuery = useCrossReferenceLeads({
    projectId: projectId || "",
    funnelId,
    stageId,
    days,
  });

  // Combine base data with crossref leads
  const enrichedData = useMemo(() => {
    if (!baseQuery.data) return baseQuery.data;

    // If no crossref data or error, return base data as-is
    if (!crossrefQuery.leads || Object.keys(crossrefQuery.leads).length === 0) {
      return baseQuery.data;
    }

    // Enrich creatives with crossref leads
    const enrichedCreatives = baseQuery.data.creatives.map((creative) => {
      const crossrefLeads = crossrefQuery.leads[creative.adId] ?? creative.leads;
      return {
        ...creative,
        leads: crossrefLeads, // Update leads from crossref
      };
    });

    // Recalculate summary totals
    const totalLeads = enrichedCreatives.reduce((sum, c) => sum + c.leads, 0);

    return {
      ...baseQuery.data,
      creatives: enrichedCreatives,
      summary: {
        ...baseQuery.data.summary,
        totalLeads,
      },
    };
  }, [baseQuery.data, crossrefQuery.leads]);

  return {
    ...baseQuery,
    data: enrichedData,
    isLoading: baseQuery.isLoading || crossrefQuery.isLoading,
    error: baseQuery.error || (crossrefQuery.error ? new Error(crossrefQuery.error) : undefined),
  };
}
