import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSpreadsheets,
  useFunnelSpreadsheetData,
} from "@/lib/hooks/use-funnel-spreadsheets";
import { useSurveyAggregation } from "@/lib/hooks/use-survey-aggregation";
import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { Funnel } from "@loyola-x/shared";
import { filterSheetRowsByDays } from "@/lib/utils/spreadsheet-filters";
import {
  aggregateMetaDailyByDate,
  aggregateSpreadsheetByDate,
  buildDailyRows,
  computeTotals,
  type DailyRow,
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

  /**
   * Taxa de Resposta = (Respostas Pesquisa / Leads Totais Dedup) × 100
   * Capped a 100%. Null se sem surveys vinculadas.
   */
  surveyResponseRate: number | null;

  /**
   * Match Pesquisa x Leads — count de respostas que fizeram match com leads
   * Null se sem surveys vinculadas.
   */
  surveyMatchedResponses: number | null;
  surveyUnmatchedResponses: number | null;

  /**
   * Linhas diárias da tabela cruzada (Story 18.3).
   * Vazio se não houver dados no período ou sem planilha vinculada.
   * Ordenado por data ascendente.
   */
  rows: DailyRow[];
  /**
   * Linha de total agregada — espelha os campos escalares acima mas no formato `DailyRow`
   * pra uso direto no footer da `CrossedFunnelDailyTable`.
   */
  totals: DailyRow;

  isLoading: boolean;
  hasLinkedSheet: boolean;
}

/**
 * Hook compartilhado que cruza insights diários do Meta Ads com dados da planilha de leads
 * vinculada ao funil, aplicando janela de `days` em ambas as fontes.
 *
 * É a fonte única de verdade pras métricas do LaunchDashboard.
 *
 * Metodologia (alinhada com Story 18.1):
 * - Cliques = actions[link_click] (NÃO total clicks do Meta)
 * - Leads contados por linha da planilha, categorizados por utm_source
 * - CTR/CPC/CPM recalculados no frontend com link_clicks
 * - CPL Pago = spend / leads_pagos; CPL Geral = spend / total_leads
 *
 * Story 18.3 estendeu o retorno pra incluir `rows: DailyRow[]` e `totals: DailyRow`
 * pra alimentar a tabela "Dados diários" (e qualquer outro consumidor que precise
 * do breakdown dia-a-dia).
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

  const { totalResponses, matchedResponses, unmatchedResponses, isLoading: surveyLoading } =
    useSurveyAggregation(projectId, funnel.id);

  const hasLinkedSheet = !!linkedSheet;
  const isLoading = metaLoading || sheetsListLoading || sheetDataLoading || surveyLoading;

  return useMemo<CrossedFunnelMetrics>(() => {
    const metaMap = aggregateMetaDailyByDate(metaData);

    const filteredSheetRows = sheetData ? filterSheetRowsByDays(sheetData, days) : [];
    const dateMapped = !!sheetData?.mapping.date;
    const utmSourceMapped = !!sheetData?.mapping.utm_source;
    const sheetMap = aggregateSpreadsheetByDate(filteredSheetRows, utmSourceMapped, dateMapped);

    const rows = buildDailyRows(metaMap, sheetMap);
    const totals = computeTotals(rows);

    const totalLeads = totals.leadsPagos + totals.leadsOrg + totals.leadsSemTrack;
    const surveyResponseRate =
      totalResponses > 0 && totalLeads > 0
        ? Math.min((totalResponses / totalLeads) * 100, 100)
        : null;

    return {
      spend: totals.spend,
      linkClicks: totals.linkClicks,
      impressions: totals.impressions,
      lpViews: totals.lpView,
      leadsPagos: totals.leadsPagos,
      leadsOrg: totals.leadsOrg,
      leadsSemTrack: totals.leadsSemTrack,
      totalLeads,
      cpm: totals.cpm,
      cpc: totals.cpc,
      ctr: totals.ctr,
      connectRate: totals.connectRate,
      cplPago: totals.cplPg,
      cplGeral: totals.cplG,
      surveyResponseRate,
      surveyMatchedResponses: matchedResponses > 0 ? matchedResponses : null,
      surveyUnmatchedResponses: unmatchedResponses > 0 ? unmatchedResponses : null,
      rows,
      totals,
      isLoading,
      hasLinkedSheet,
    };
  }, [metaData, sheetData, days, isLoading, hasLinkedSheet, totalResponses, matchedResponses, unmatchedResponses]);
}
