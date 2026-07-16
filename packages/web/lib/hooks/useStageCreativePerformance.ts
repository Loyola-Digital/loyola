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
import { applyMetaAdsTax } from "@/lib/utils/funnel-metrics";

export interface CreativePerformanceData {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  revenue: number;
  utmTerm: string | null;
  // Story 18.46: identificação de LP por Campaign Name (AC3) + LP View real (AC4)
  campaignName?: string | null;
  landingPageViews?: number;
  // Story 18.55: Único/Total por criativo (vendas atribuídas via co= da venda;
  // presentes só quando o backend atribuiu por sale_content)
  ingressosUnicos?: number;
  ingressosTotais?: number;
  revenueTotal?: number;
  revenueUnico?: number;
}

// Story 18.46: corte por LP × temperatura (para a tabela de Testes de LPs)
export interface LpBreakdownRow {
  lpName: string; // "LPA"
  temperature: "hot" | "cold" | "unknown";
  spend: number;
  clicks: number;
  impressions: number;
  landingPageViews: number;
  // Story 18.50: vendas/faturamento por LP (atribuídos via co= → campanha)
  vendas?: number;
  faturamento?: number;
}

export interface StageCreativePerformanceResponse {
  stageId: string;
  stageType: string;
  days: number;
  creatives: CreativePerformanceData[];
  lpBreakdown?: LpBreakdownRow[];
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

  // Story 18.43: For free stages, enrich leads via crossref.
  // Hooks NÃO podem ser chamados condicionalmente (regras do React), então
  // chamamos sempre. Quando não há projectId passamos "" e os queries internos
  // ficam desabilitados (ver guard `enabled` em useFunnelSurveys).
  const crossrefQuery = useCrossReferenceLeads({
    projectId: projectId ?? "",
    funnelId,
    stageId,
    days,
  });

  // Combine base data with crossref leads
  const enrichedData = useMemo(() => {
    if (!baseQuery.data) return baseQuery.data;

    // Imposto Meta Ads de 12,15% (2026+): o spend cru da API não inclui. Aplica ao
    // spend de cada criativo + summary pra bater com o card "Investimento" e a
    // Dados Diários (que já usam applyMetaAdsTax). Como o spend é agregado no
    // período, usamos a data atual (lançamentos correntes são 2026+).
    const taxDate = new Date().toISOString().slice(0, 10);
    const taxed: StageCreativePerformanceResponse = {
      ...baseQuery.data,
      creatives: baseQuery.data.creatives.map((c) => ({
        ...c,
        spend: applyMetaAdsTax(c.spend, taxDate),
      })),
      summary: {
        ...baseQuery.data.summary,
        totalSpend: applyMetaAdsTax(baseQuery.data.summary.totalSpend, taxDate),
      },
    };

    // If no projectId or no crossref data, return taxed base data as-is
    if (!projectId || !crossrefQuery.leads || Object.keys(crossrefQuery.leads).length === 0) {
      return taxed;
    }

    // Story 18.47: prioriza leads por Ad Name (soma TODOS os ad_ids daquele
    // criativo) — corrige o bug que contava só 1 ad_id. Normaliza nos 2 lados
    // (trim+lowercase) pra casar o ad_name do Meta com "Ad Name" da planilha.
    // Fallback: leads por ad_id (legado) e por fim o valor do backend.
    const norm = (s: string) => s.trim().toLowerCase();
    const leadsByAdNameNorm: Record<string, number> = {};
    for (const [k, v] of Object.entries(crossrefQuery.leadsByAdName ?? {})) {
      leadsByAdNameNorm[norm(k)] = v;
    }

    // Enrich creatives with crossref leads and term (spend já com imposto via `taxed`)
    const enrichedCreatives = taxed.creatives.map((creative) => {
      const crossrefLeads =
        leadsByAdNameNorm[norm(creative.adName)] ??
        crossrefQuery.leads[creative.adId] ??
        creative.leads;
      const crossrefTerm = crossrefQuery.terms[creative.adId] ?? creative.utmTerm;
      return {
        ...creative,
        leads: crossrefLeads, // Update leads from crossref
        utmTerm: crossrefTerm, // Update term from crossref (hot/cold)
      };
    });

    // Recalculate summary totals
    const totalLeads = enrichedCreatives.reduce((sum, c) => sum + c.leads, 0);

    return {
      ...taxed,
      creatives: enrichedCreatives,
      summary: {
        ...taxed.summary,
        totalLeads,
      },
    };
  }, [baseQuery.data, projectId, crossrefQuery.leads, crossrefQuery.leadsByAdName]);

  return {
    ...baseQuery,
    data: enrichedData,
    // Story 18.47: faixas por Ad Name (da aba de pesquisa) + labels dinâmicos.
    bandsByAdName: crossrefQuery.bandsByAdName,
    bandLabels: crossrefQuery.bandLabels,
    isLoading: projectId ? (baseQuery.isLoading || crossrefQuery.isLoading) : baseQuery.isLoading,
    error: baseQuery.error || (projectId && crossrefQuery.error ? new Error(crossrefQuery.error) : undefined),
  };
}
