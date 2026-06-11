"use client";

/**
 * Story 18.43: Hook para cruzamento de leads entre Meta Ads e planilha de Captação Gratuita
 *
 * Busca surveys vinculadas ao funil (FunnelSurveys), lê a planilha,
 * e conta linhas agrupadas por `ad_id` para cada criativo.
 *
 * Normaliza IDs (trim, lowercase) para evitar drift.
 * Aplica filtro de período ANTES do cruzamento.
 */

import { useMemo } from "react";
import { useFunnelSurveys } from "@/lib/hooks/use-google-sheets";
import { useSheetData } from "@/lib/hooks/use-google-sheets";
import { normalizeNumericId } from "@/lib/utils/normalize-answer";

interface CrossReferencedLeads {
  leads: Record<string, number>; // { ad_id: count }
  terms: Record<string, string>; // { ad_id: "hot" | "cold" }
  totalLeads: number;
  isLoading: boolean;
  error?: string;
}

interface UseCrossReferenceLeadsOptions {
  projectId: string;
  funnelId: string;
  stageId: string;
  days?: number;
}

export function useCrossReferenceLeads({
  projectId,
  funnelId,
  stageId,
  days: _days = 30,
}: UseCrossReferenceLeadsOptions): CrossReferencedLeads {
  // Buscar surveys vinculadas ao stage
  const surveysQuery = useFunnelSurveys(projectId, funnelId, stageId);
  const surveys = surveysQuery.data?.surveys ?? [];

  // Usar a primeira survey encontrada e forçar a aba "n8n-leads-lp-cap-grat" se for "Painel de Controle"
  const survey = surveys[0];
  const sheetName = survey?.spreadsheetName?.includes("Painel de Controle")
    ? "n8n-leads-lp-cap-grat"
    : survey?.sheetName ?? null;

  const sheetQuery = useSheetData(survey?.spreadsheetId ?? null, sheetName);

  // Computar cruzamento: coluna 5 = utm_content (adId), coluna 7 = term (hot/cold)
  const result = useMemo(() => {
    const leads: Record<string, number> = {};
    const terms: Record<string, string> = {};
    let totalLeads = 0;

    if (!sheetQuery.data?.rows || sheetQuery.data.rows.length === 0) {
      return { leads, terms, totalLeads, isLoading: false };
    }

    const CONTENT_INDEX = 5; // utm_content = adId
    const TERM_INDEX = 7;    // hot/cold (may be part of a complex string)

    // Contar leads por utm_content e armazenar termo
    for (const row of sheetQuery.data.rows) {
      const utmContent = row[CONTENT_INDEX]?.trim() ?? "";
      if (!utmContent) continue;

      const adId = normalizeNumericId(utmContent);
      const termString = (row[TERM_INDEX]?.trim() ?? "").toLowerCase();

      leads[adId] = (leads[adId] ?? 0) + 1;

      // Extract hot/cold from the term string (may be part of a complex string like "ad-name--hot--...")
      if (!terms[adId]) {
        if (termString.includes("hot")) {
          terms[adId] = "hot";
        } else if (termString.includes("cold")) {
          terms[adId] = "cold";
        }
      }

      totalLeads += 1;
    }

    console.log("[useCrossReferenceLeads] Terms mapping:", terms);
    console.log("[useCrossReferenceLeads] Sample row term (row[7]):", sheetQuery.data.rows[0]?.[TERM_INDEX]);
    return { leads, terms, totalLeads, isLoading: false };
  }, [sheetQuery.data]);

  const isLoading = surveysQuery.isLoading || (survey ? sheetQuery.isLoading : false);
  const error = surveysQuery.error?.message || sheetQuery.error?.message;

  return {
    leads: result.leads,
    terms: result.terms,
    totalLeads: result.totalLeads,
    isLoading,
    error: error ? error : undefined,
  };
}
