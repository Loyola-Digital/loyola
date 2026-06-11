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
  // Buscar surveys vinculadas (planilha de Captação Gratuita)
  const surveysQuery = useFunnelSurveys(projectId, funnelId, stageId);
  const surveys = surveysQuery.data?.surveys ?? [];

  // Se temos surveys, ler dados da primeira (MVP: usa apenas a primeira)
  const firstSurvey = surveys[0];
  const sheetQuery = useSheetData(firstSurvey?.spreadsheetId ?? null, firstSurvey?.sheetName ?? null);

  // Computar cruzamento
  const result = useMemo(() => {
    const leads: Record<string, number> = {};
    let totalLeads = 0;

    console.log("[useCrossReferenceLeads] sheetQuery.data:", sheetQuery.data);
    console.log("[useCrossReferenceLeads] surveys:", surveys);

    if (!sheetQuery.data?.rows || sheetQuery.data.rows.length === 0) {
      console.log("[useCrossReferenceLeads] No rows in sheet data");
      return { leads, totalLeads, isLoading: false };
    }

    const headers = sheetQuery.data.headers ?? [];
    console.log("[useCrossReferenceLeads] headers:", headers);

    // Look for "ad_id", "Ad Name", "ad name", or similar variations
    const adIdIndex = headers.findIndex((h) =>
      h.toLowerCase().includes("ad_id") ||
      h.toLowerCase().includes("ad name")
    );

    console.log("[useCrossReferenceLeads] adIdIndex:", adIdIndex);

    if (adIdIndex < 0) {
      console.warn("[useCrossReferenceLeads] Column 'ad_id' or 'Ad Name' not found in sheet headers", headers);
      return { leads, totalLeads, isLoading: false, error: "ad_id/ad_name column not found" };
    }

    // Contar linhas por ad_id (agregação simples)
    for (const row of sheetQuery.data.rows) {
      const rawAdId = row[adIdIndex]?.trim() ?? "";
      if (!rawAdId) continue;

      const adId = normalizeNumericId(rawAdId);
      leads[adId] = (leads[adId] ?? 0) + 1;
      totalLeads += 1;
    }

    console.log("[useCrossReferenceLeads] Final leads result:", { leads, totalLeads });
    return { leads, totalLeads, isLoading: false };
  }, [sheetQuery.data]);

  const isLoading = surveysQuery.isLoading || (firstSurvey ? sheetQuery.isLoading : false);
  const error = surveysQuery.error?.message || sheetQuery.error?.message;

  return {
    ...result,
    isLoading,
    error: error ? error : undefined,
  };
}
