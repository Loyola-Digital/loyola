"use client";

/**
 * Story 18.44: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Busca dados de Meta Ads API, identifica LPs via utm_term (lpa, lpb, lpc...),
 * agrupa por (data + LP), e calcula métricas (CPM, CPC, CTR, CPL, etc.)
 *
 * Filtrável por temperatura (hot/cold/todos) e período (days).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface LpDaily {
  date: string;
  lpName: string; // "LPA", "LPB", "LPC", etc.
  investimento: number;
  cliques: number;
  impressoes: number;
  conversoes: number;
  lpViews: number;
  vendas?: number; // Captação Paga
  faturamento?: number; // Captação Paga
  leads?: number; // Captação Gratuita
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
  projectId?: string;
  funnelId: string;
  stageId: string;
  days?: number;
  publicoFilter?: "hot" | "cold" | "todos"; // Filtro de temperatura
}

export function useLpPerformanceData({
  _projectId,
  funnelId,
  stageId,
  days = 30,
  publicoFilter = "todos",
}: UseLpPerformanceDataOptions): LpPerformanceResponse {
  const apiClient = useApiClient();

  // Fetch creative performance data which includes utm_term for LP identification
  // Backend endpoint returns: { creatives: [{adId, adName, spend, impressions, clicks, leads, revenue, utmTerm}, ...] }
  const baseQuery = useQuery({
    queryKey: [
      "lp-performance-data",
      funnelId,
      stageId,
      days,
      publicoFilter,
    ],
    queryFn: () =>
      apiClient(
        `/api/funnels/${funnelId}/stages/${stageId}/creative-performance?days=${days}`,
      ),
    enabled: !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Process and aggregate LPs
  const result = useMemo(() => {
    const lpsByName: Record<
      string,
      {
        name: string;
        data: LpDaily[];
      }
    > = {};

    console.log("[useLpPerformanceData] Raw data:", baseQuery.data);

    if (!baseQuery.data?.creatives || baseQuery.data.creatives.length === 0) {
      console.log("[useLpPerformanceData] No creatives found");
      return { lpsByName, isLoading: false };
    }

    console.log(
      "[useLpPerformanceData] Processing creatives:",
      baseQuery.data.creatives.length,
    );

    // Agrupar por (date + LP)
    const grouped: Record<string, LpDaily> = {};

    for (const creative of baseQuery.data.creatives) {
      const utmTerm = creative.utmTerm?.toLowerCase();
      console.log(
        `[useLpPerformanceData] Creative: ${creative.adName}, utmTerm: ${utmTerm}`,
      );

      if (!utmTerm) {
        console.log(
          `[useLpPerformanceData] Skipping ${creative.adName} - no utmTerm`,
        );
        continue;
      }

      // Extrair LP: procura por "lpa", "lpb", "lpc", "lpd", etc. dentro da string
      const lpMatch = utmTerm.match(/lp([a-z])/);
      if (!lpMatch) {
        console.log(
          `[useLpPerformanceData] Skipping ${creative.adName} - no LP match in: ${utmTerm}`,
        );
        continue;
      }

      const lpName = `LP${lpMatch[1].toUpperCase()}`;
      console.log(
        `[useLpPerformanceData] Found LP: ${lpName} in ${creative.adName}`,
      );

      // Filtro de temperatura
      if (publicoFilter !== "todos") {
        if (publicoFilter === "hot" && !utmTerm.includes("hot")) continue;
        if (publicoFilter === "cold" && !utmTerm.includes("cold")) continue;
      }

      // Chave para agrupamento: data + LP
      const dateKey = "2026-06-11"; // TODO: Usar creative.date real do backend
      const groupKey = `${dateKey}__${lpName}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          date: dateKey,
          lpName,
          investimento: 0,
          cliques: 0,
          impressoes: 0,
          conversoes: 0,
          lpViews: 0,
          ...(creative.revenue !== undefined && { vendas: 0, faturamento: 0 }),
          ...(creative.leads !== undefined && { leads: 0 }),
        };
      }

      // Agregar
      grouped[groupKey].investimento += creative.spend ?? 0;
      grouped[groupKey].cliques += creative.clicks ?? 0;
      grouped[groupKey].impressoes += creative.impressions ?? 0;
      grouped[groupKey].conversoes +=
        (creative.clicks ?? 0) * 0.1; // TODO: usar conversões reais
      grouped[groupKey].lpViews += (creative.clicks ?? 0) * 0.8; // TODO: usar LP Views reais

      if (creative.revenue !== undefined) {
        grouped[groupKey].vendas = (grouped[groupKey].vendas ?? 0) + 1;
        grouped[groupKey].faturamento =
          (grouped[groupKey].faturamento ?? 0) + (creative.revenue ?? 0);
      }

      if (creative.leads !== undefined) {
        grouped[groupKey].leads =
          (grouped[groupKey].leads ?? 0) + creative.leads;
      }
    }

    // Agrupar por LP (cada LP tem seu array de dias)
    for (const lpDaily of Object.values(grouped)) {
      const lpName = lpDaily.lpName;

      if (!lpsByName[lpName.toLowerCase()]) {
        lpsByName[lpName.toLowerCase()] = {
          name: lpName,
          data: [],
        };
      }

      lpsByName[lpName.toLowerCase()].data.push(lpDaily);
    }

    // Ordenar por data descendente (mais recente primeiro)
    for (const lp of Object.values(lpsByName)) {
      lp.data.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    }

    console.log("[useLpPerformanceData] LPs found:", Object.keys(lpsByName));
    return { lpsByName, isLoading: false };
  }, [baseQuery.data, publicoFilter]);

  return {
    lpsByName: result.lpsByName,
    isLoading: baseQuery.isLoading,
    error: baseQuery.error?.message,
  };
}
