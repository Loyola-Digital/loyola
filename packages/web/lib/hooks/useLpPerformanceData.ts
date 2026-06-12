"use client";

/**
 * Story 18.44: Hook para agregação de performance de Landing Pages (LPs)
 *
 * Busca dados de Meta Ads API + planilha de cruzamento (utm_term),
 * identifica LPs via regex /lp([a-z])/i, agrupa por (data + LP),
 * e calcula métricas (CPM, CPC, CTR, CPL, etc.)
 *
 * Padrão: usa useCrossReferenceLeads (Story 18.43) para extrair utm_term da planilha
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
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
  publicoFilter?: "hot" | "cold" | "todos"; // Filtro de temperatura
}

export function useLpPerformanceData({
  projectId,
  funnelId,
  stageId,
  days = 30,
  publicoFilter = "todos",
}: UseLpPerformanceDataOptions): LpPerformanceResponse {
  const apiClient = useApiClient();

  // Fetch creative performance metrics (spend, impressions, clicks, etc)
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

  // Fetch utm_term mapping from spreadsheet (Story 18.43 pattern)
  // Returns: { termsMapping: { adId: "lpa-hot-...", ... }, ... }
  const crossRefQuery = useCrossReferenceLeads({
    projectId,
    funnelId,
    stageId,
    days,
  });

  // Process and aggregate LPs (combine creative metrics + utm_term from spreadsheet)
  const result = useMemo(() => {
    const lpsByName: Record<
      string,
      {
        name: string;
        data: LpDaily[];
      }
    > = {};

    console.log(
      "[useLpPerformanceData] Raw creatives:",
      baseQuery.data?.creatives?.length,
    );
    console.log("[useLpPerformanceData] Terms mapping:", crossRefQuery.termsMapping);

    if (!baseQuery.data?.creatives || baseQuery.data.creatives.length === 0) {
      console.log("[useLpPerformanceData] No creatives found");
      return { lpsByName, isLoading: false };
    }

    // Agrupar por (date + LP)
    const grouped: Record<string, LpDaily> = {};

    for (const creative of baseQuery.data.creatives) {
      // Pega utm_term da planilha de cruzamento (não do endpoint que vem undefined)
      const utmTermFromSpreadsheet = crossRefQuery.termsMapping?.[creative.adId];
      const utmTerm = (
        utmTermFromSpreadsheet || creative.utmTerm
      )?.toLowerCase();

      console.log(
        `[useLpPerformanceData] Creative: ${creative.adName} (${creative.adId}), utmTerm: ${utmTerm}`,
      );

      if (!utmTerm) {
        console.log(
          `[useLpPerformanceData] Skipping ${creative.adName} - no utmTerm found`,
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
      grouped[groupKey].conversoes += (creative.clicks ?? 0) * 0.1; // TODO: conversões reais da API
      grouped[groupKey].lpViews = 0; // TODO: puxar lpView real da API Meta Ads

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

    // Agrupar por LP: agregar TODOS os dias de cada LP em UMA ÚNICA linha
    const lpTotals: Record<string, LpDaily> = {};

    for (const lpDaily of Object.values(grouped)) {
      const lpName = lpDaily.lpName;
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
          ...(lpDaily.vendas !== undefined && { vendas: 0, faturamento: 0 }),
          ...(lpDaily.leads !== undefined && { leads: 0 }),
        };
      }

      // Somar todas as métricas
      lpTotals[key].investimento += lpDaily.investimento;
      lpTotals[key].cliques += lpDaily.cliques;
      lpTotals[key].impressoes += lpDaily.impressoes;
      lpTotals[key].conversoes += lpDaily.conversoes;
      lpTotals[key].lpViews += lpDaily.lpViews;

      if (lpDaily.vendas !== undefined) {
        lpTotals[key].vendas = (lpTotals[key].vendas ?? 0) + lpDaily.vendas;
        lpTotals[key].faturamento =
          (lpTotals[key].faturamento ?? 0) + lpDaily.faturamento;
      }

      if (lpDaily.leads !== undefined) {
        lpTotals[key].leads = (lpTotals[key].leads ?? 0) + lpDaily.leads;
      }
    }

    // Preencher lpsByName com uma única linha (total) por LP
    for (const [key, lpDaily] of Object.entries(lpTotals)) {
      lpsByName[key] = {
        name: lpDaily.lpName,
        data: [lpDaily],
      };
    }

    console.log("[useLpPerformanceData] LPs found:", Object.keys(lpsByName));
    console.log("[useLpPerformanceData] LP Totals:", lpTotals);
    console.log("[useLpPerformanceData] All LP data by name:", lpsByName);
    return { lpsByName, isLoading: false };
  }, [baseQuery.data, crossRefQuery.termsMapping, publicoFilter]);

  return {
    lpsByName: result.lpsByName,
    isLoading: baseQuery.isLoading || crossRefQuery.isLoading,
    error: baseQuery.error?.message || crossRefQuery.error,
  };
}
