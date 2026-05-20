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
import { useApiClient } from "@/lib/hooks/use-api-client";

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
  funnelId: string;
  stageId: string;
  days?: number;
  enabled?: boolean;
}

export function useStageCreativePerformance({
  funnelId,
  stageId,
  days = 30,
  enabled = true,
}: UseStageCreativePerformanceOptions) {
  const apiClient = useApiClient();

  return useQuery<StageCreativePerformanceResponse, Error>({
    queryKey: ["stage-creative-performance", funnelId, stageId, days],
    queryFn: () =>
      apiClient<StageCreativePerformanceResponse>(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: enabled && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
