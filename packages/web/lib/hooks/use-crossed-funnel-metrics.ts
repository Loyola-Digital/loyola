import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { Funnel } from "@loyola-x/shared";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import {
  categorizeLeads,
  safeDivide,
  sumMetaInsights,
} from "@/lib/utils/funnel-metrics";

export interface CrossedFunnelMetrics {
  spend: number;
  linkClicks: number;
  impressions: number;
  lpViews: number;

  leadsPagos: number;
  leadsOrg: number;
  leadsSemTrack: number;
  totalLeads: number;

  cpm: number;
  cpc: number;
  ctr: number;
  connectRate: number | null;
  cplPago: number | null;
  cplGeral: number | null;

  isLoading: boolean;
  hasLinkedSheet: boolean;
}

/**
 * Hook compartilhado que cruza insights diários do Meta Ads com dados da planilha de leads
 * vinculada ao funil, aplicando janela de `days` em ambas as fontes.
 *
 * É a fonte única de verdade pras métricas do LaunchDashboard e do MetaAdsSpreadsheetTab (Story 18.1).
 *
 * Metodologia (alinhada com Story 18.1):
 * - Cliques = actions[link_click] (NÃO total clicks do Meta)
 * - Leads contados por linha da planilha, categorizados por utm_source
 * - CTR/CPC/CPM recalculados no frontend com link_clicks
 * - CPL Pago = spend / leads_pagos; CPL Geral = spend / total_leads
 */
export function useCrossedFunnelMetrics(
  projectId: string,
  funnel: Funnel,
  days: number,
): CrossedFunnelMetrics {
  const apiClient = useApiClient();

  const campaignQueries = useQueries({
    queries: funnel.campaigns.map((c) => ({
      queryKey: ["traffic-campaign-daily", projectId, c.id, days] as const,
      queryFn: () =>
        apiClient<CampaignDailyInsight[]>(
          `/api/traffic/analytics/${projectId}/campaign-daily?campaignId=${c.id}&days=${days}`,
        ),
      staleTime: 5 * 60 * 1000,
      enabled: funnel.campaigns.length > 0,
    })),
  });

  const metaLoading = campaignQueries.some((q) => q.isLoading);
  const metaData = campaignQueries
    .map((q) => q.data)
    .filter((d): d is CampaignDailyInsight[] => !!d);

  const { data: spreadsheetsData, isLoading: sheetsListLoading } =
    useFunnelSpreadsheets(projectId, funnel.id);

  const linkedSheet = useMemo(() => {
    if (!spreadsheetsData?.spreadsheets) return null;
    return (
      spreadsheetsData.spreadsheets.find((s) => s.type === "leads") ??
      spreadsheetsData.spreadsheets[0] ??
      null
    );
  }, [spreadsheetsData]);

  const { data: sheetData, isLoading: sheetDataLoading } =
    useFunnelSpreadsheetData(projectId, funnel.id, linkedSheet?.id);

  const hasLinkedSheet = !!linkedSheet;
  const isLoading = metaLoading || sheetsListLoading || sheetDataLoading;

  return useMemo<CrossedFunnelMetrics>(() => {
    const meta = sumMetaInsights(metaData);

    const filteredRows = sheetData ? filterSheetRowsByDays(sheetData, days) : [];
    const utmSourceMapped = !!sheetData?.mapping.utm_source;
    const { leadsPagos, leadsOrg, leadsSemTrack } = categorizeLeads(
      filteredRows,
      utmSourceMapped,
    );
    const totalLeads = leadsPagos + leadsOrg + leadsSemTrack;

    const cpm =
      meta.impressions > 0 ? (meta.spend / meta.impressions) * 1000 : 0;
    const cpc = safeDivide(meta.spend, meta.linkClicks) ?? 0;
    const ctr =
      meta.impressions > 0 ? (meta.linkClicks / meta.impressions) * 100 : 0;
    const connectRate =
      meta.linkClicks > 0 ? (meta.lpViews / meta.linkClicks) * 100 : null;
    const cplPago = safeDivide(meta.spend, leadsPagos);
    const cplGeral = safeDivide(meta.spend, totalLeads);

    return {
      spend: meta.spend,
      linkClicks: meta.linkClicks,
      impressions: meta.impressions,
      lpViews: meta.lpViews,
      leadsPagos,
      leadsOrg,
      leadsSemTrack,
      totalLeads,
      cpm,
      cpc,
      ctr,
      connectRate,
      cplPago,
      cplGeral,
      isLoading,
      hasLinkedSheet,
    };
  }, [metaData, sheetData, days, isLoading, hasLinkedSheet]);
}
