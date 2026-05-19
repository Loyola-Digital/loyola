"use client";

/**
 * Story 18.24: Hook para fetch de dados de criativos
 * Usa React Query para cache e refetch automático
 */

import { useQuery } from "@tanstack/react-query";

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
}

interface UseStageCreativePerformanceOptions {
  funnelId: string;
  stageId: string;
  days?: number;
  enabled?: boolean;
}

/**
 * Fetch dados de desempenho de criativos para um stage
 */
async function fetchStageCreativePerformance(
  funnelId: string,
  stageId: string,
  days: number = 30
): Promise<StageCreativePerformanceResponse> {
  const params = new URLSearchParams({ days: String(days) });
  const response = await fetch(
    `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?${params}`,
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Erro ao buscar desempenho de criativos (status ${response.status})`
    );
  }

  return response.json();
}

/**
 * Hook para buscar e cachear dados de criativos
 * @example
 * const { data, isLoading, error } = useStageCreativePerformance({
 *   funnelId: "abc-123",
 *   stageId: "def-456",
 *   days: 30,
 * });
 */
export function useStageCreativePerformance({
  funnelId,
  stageId,
  days = 30,
  enabled = true,
}: UseStageCreativePerformanceOptions) {
  return useQuery<StageCreativePerformanceResponse, Error>({
    queryKey: ["stage-creative-performance", funnelId, stageId, days],
    queryFn: () => fetchStageCreativePerformance(funnelId, stageId, days),
    enabled: enabled && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos (anteriormente cacheTime)
  });
}
