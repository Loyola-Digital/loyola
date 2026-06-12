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
  termsMapping: Record<string, string>; // { ad_id: full utm_term string }
  // Story 18.46 (AC6/AC7): contagem de leads por LP via utm_content, quebrada
  // por temperatura (hot/cold) para o filtro de público.
  // { "lpa": { hot: N, cold: M, total: N+M } }
  leadsByLp: Record<string, { hot: number; cold: number; total: number }>;
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

  // Computar cruzamento: coluna 5 = utm_content (adId), coluna 7 = utm_term (lpa/hot/cold/etc)
  const result = useMemo(() => {
    const leads: Record<string, number> = {};
    const terms: Record<string, string> = {};
    const termsMapping: Record<string, string> = {};
    const leadsByLp: Record<string, { hot: number; cold: number; total: number }> = {};
    let totalLeads = 0;

    if (!sheetQuery.data?.rows || sheetQuery.data.rows.length === 0) {
      return { leads, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
    }

    const CONTENT_INDEX = 5; // utm_content = adId / identificador da LP (contém lpa/lpb/...)
    const TERM_INDEX = 7;    // utm_term (full string: "lpa-hot-...", "lpb-cold-...", etc)

    // Contar leads por utm_content e armazenar termo
    for (const row of sheetQuery.data.rows) {
      const utmContent = row[CONTENT_INDEX]?.trim() ?? "";
      if (!utmContent) continue;

      const adId = normalizeNumericId(utmContent);
      const termString = (row[TERM_INDEX]?.trim() ?? "").toLowerCase();

      leads[adId] = (leads[adId] ?? 0) + 1;

      // Store full utm_term for LP identification (Story 18.44)
      if (!termsMapping[adId]) {
        termsMapping[adId] = termString;
      }

      // Extract hot/cold from the term string (Story 18.43)
      if (!terms[adId]) {
        if (termString.includes("hot")) {
          terms[adId] = "hot";
        } else if (termString.includes("cold")) {
          terms[adId] = "cold";
        }
      }

      // Story 18.46 (AC6): identificar a LP do lead pelo utm_content (contém lpX),
      // e quebrar por temperatura (utm_term contém hot/cold) para o filtro (AC7).
      const lpMatch = utmContent.toLowerCase().match(/lp([a-z])/);
      if (lpMatch) {
        const lpKey = `lp${lpMatch[1].toLowerCase()}`;
        if (!leadsByLp[lpKey]) leadsByLp[lpKey] = { hot: 0, cold: 0, total: 0 };
        leadsByLp[lpKey].total += 1;
        if (termString.includes("hot")) leadsByLp[lpKey].hot += 1;
        else if (termString.includes("cold")) leadsByLp[lpKey].cold += 1;
      }

      totalLeads += 1;
    }

    return { leads, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
  }, [sheetQuery.data]);

  const isLoading = surveysQuery.isLoading || (survey ? sheetQuery.isLoading : false);
  const error = surveysQuery.error?.message || sheetQuery.error?.message;

  return {
    leads: result.leads,
    terms: result.terms,
    termsMapping: result.termsMapping,
    leadsByLp: result.leadsByLp,
    totalLeads: result.totalLeads,
    isLoading,
    error: error ? error : undefined,
  };
}
