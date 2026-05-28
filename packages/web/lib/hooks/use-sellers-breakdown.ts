"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

const STALE_TIME = 30 * 1000;

export type SellerBandKey = "A" | "B" | "C" | "D" | "no_profile";

export interface SellerRow {
  utmSource: string;
  totalSales: number;
  totalRevenue: number;
  avgTicket: number;
  dominantBand: SellerBandKey;
  bands: Record<SellerBandKey, number>;
  bandsPct: Record<SellerBandKey, number>;
}

export interface SellersBreakdownData {
  sellers: SellerRow[];
  coverage: { matched: number; total: number; pct: number };
  hasScoringConfig: boolean;
  semDados: boolean;
}

export function useSellersBreakdown(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  options?: { startDate?: string; endDate?: string; subtype?: string },
) {
  const apiClient = useApiClient();
  const { startDate, endDate, subtype = "sales" } = options ?? {};
  return useQuery({
    queryKey: [
      "sellers-breakdown",
      projectId,
      funnelId,
      stageId,
      subtype,
      startDate ?? null,
      endDate ?? null,
    ],
    queryFn: () => {
      const qs = new URLSearchParams({ subtype });
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      return apiClient<SellersBreakdownData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sellers-breakdown?${qs}`,
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
