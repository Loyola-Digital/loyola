"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

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
  _debug?: Record<string, unknown>;
}

export function useSellersBreakdown(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  options?: { startDate?: string; endDate?: string; subtype?: string },
) {
  const apiClient = useApiClient();
  const { startDate, endDate, subtype = "sales" } = options ?? {};
  const query = useQuery({
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
      // Story 19.10 — debug=1 hardcoded pra diagnosticar cobertura de perfil.
      // Backend devolve `_debug` com sample de emails matched/não, coluna FAIXA
      // detectada, headers da pesquisa, etc.
      const qs = new URLSearchParams({ subtype, debug: "1" });
      if (startDate) qs.set("startDate", startDate);
      if (endDate) qs.set("endDate", endDate);
      return apiClient<SellersBreakdownData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sellers-breakdown?${qs}`,
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });

  useEffect(() => {
    if (query.data?._debug) {
      console.log(
        `[sellers-breakdown] stage=${stageId} subtype=${subtype} ` +
          `cobertura=${query.data.coverage.matched}/${query.data.coverage.total} (${query.data.coverage.pct}%)`,
        query.data._debug,
      );
    }
  }, [query.data, stageId, subtype]);

  return query;
}
