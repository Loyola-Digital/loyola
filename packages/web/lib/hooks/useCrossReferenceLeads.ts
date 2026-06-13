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
import { useFunnelSpreadsheets } from "@/lib/hooks/use-funnel-spreadsheets";
import { normalizeNumericId } from "@/lib/utils/normalize-answer";

interface CrossReferencedLeads {
  leads: Record<string, number>; // { ad_id: count }
  // Story 18.47: contagem de leads por Ad Name (soma TODOS os ad_ids/utm_content
  // daquele criativo). Corrige o bug de contar só 1 ad_id por ad_name. A planilha
  // n8n-leads-lp-cap-grat já traz a coluna "Ad Name".
  leadsByAdName: Record<string, number>; // { adName: count }
  // Story 18.47: mapa ad_id (utm_content) → Ad Name, lido da aba de leads.
  // Usado para dar nome de criativo às respostas da pesquisa (que só têm utm_content).
  adNameByContent: Record<string, string>;
  // Story 18.47: faixas (A/B/C/D…) por Ad Name, vindas da aba de PESQUISA
  // (coluna "Faixa N"), cruzadas via utm_content → Ad Name. + labels dinâmicos.
  bandsByAdName: Record<string, Record<string, number>>; // { adName: { faixa: count } }
  bandLabels: string[];
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

  // Story 18.47: usa as planilhas/abas VINCULADAS por etapa (sem hardcode de nome).
  // Generaliza para qualquer etapa (free/paid): cada uma vincula suas próprias abas.
  // - LEADS: "Planilhas vinculadas" (funnelSpreadsheets, type=leads) → content + Ad Name.
  // - PESQUISA: "Pesquisas vinculadas" (funnelSurveys) → utm_content + Faixa.
  const spreadsheetsQuery = useFunnelSpreadsheets(projectId, funnelId, stageId);
  const leadsSheet = spreadsheetsQuery.data?.spreadsheets?.find((s) => s.type === "leads");

  const survey = surveys[0];

  const sheetQuery = useSheetData(
    leadsSheet?.spreadsheetId ?? null,
    leadsSheet?.sheetName ?? null,
  );
  const surveyQuery = useSheetData(
    survey?.spreadsheetId ?? null,
    survey?.sheetName ?? null,
  );

  // Computar cruzamento: coluna 5 = utm_content (adId), coluna 7 = utm_term (lpa/hot/cold/etc)
  const result = useMemo(() => {
    const leads: Record<string, number> = {};
    const leadsByAdName: Record<string, number> = {};
    const adNameByContent: Record<string, string> = {};
    const terms: Record<string, string> = {};
    const termsMapping: Record<string, string> = {};
    const leadsByLp: Record<string, { hot: number; cold: number; total: number }> = {};
    let totalLeads = 0;

    if (!sheetQuery.data?.rows || sheetQuery.data.rows.length === 0) {
      return { leads, leadsByAdName, adNameByContent, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
    }

    const headers = (sheetQuery.data as unknown as { headers?: string[] }).headers ?? [];
    // Story 18.47: localiza colunas por CABEÇALHO (robusto entre abas de etapas
    // diferentes); cai pras posições legadas (5/7) quando o header não existe.
    const findCol = (names: string[], fallback: number): number => {
      const idx = headers.findIndex((h) => names.includes((h ?? "").trim().toLowerCase()));
      return idx >= 0 ? idx : fallback;
    };
    const CONTENT_INDEX = findCol(["content", "utm_content"], 5); // utm_content = adId
    const TERM_INDEX = findCol(["utm_term", "term"], 7);          // utm_term (lpX/hot/cold)

    // Story 18.46: localiza a coluna `source` (utm_source) pelo cabeçalho.
    // Lead pago = source ∈ {meta, google}; o resto (ig, etc.) é orgânico.
    const SOURCE_INDEX = headers.findIndex((h) => {
      const n = (h ?? "").trim().toLowerCase();
      return n === "source" || n === "utm_source";
    });
    // Story 18.47: coluna "Ad Name" da planilha — agrupar leads por nome do
    // criativo (soma todos os ad_ids). Localiza por cabeçalho (robusto).
    const AD_NAME_INDEX = headers.findIndex((h) => {
      const n = (h ?? "").trim().toLowerCase();
      return n === "ad name" || n === "ad_name" || n === "adname" || n === "nome do anúncio" || n === "nome do anuncio";
    });
    const PAID_SOURCES = new Set(["meta", "google"]);
    const isPaidRow = (row: string[]): boolean => {
      if (SOURCE_INDEX < 0) return true; // sem coluna source → não filtra (fallback)
      const src = (row[SOURCE_INDEX] ?? "").trim().toLowerCase();
      return PAID_SOURCES.has(src);
    };

    // Contar leads por utm_content e armazenar termo
    for (const row of sheetQuery.data.rows) {
      const termString = (row[TERM_INDEX]?.trim() ?? "").toLowerCase();
      const utmContentRaw = (row[CONTENT_INDEX]?.trim() ?? "").toLowerCase();

      // Story 18.47: conta leads por Ad Name (TODAS as linhas daquele criativo,
      // somando os vários ad_ids). Corrige a contagem que antes usava 1 só ad_id.
      if (AD_NAME_INDEX >= 0) {
        const adName = (row[AD_NAME_INDEX] ?? "").trim();
        if (adName) leadsByAdName[adName] = (leadsByAdName[adName] ?? 0) + 1;
      }

      // Story 18.46 (AC6): identificar a LP e a temperatura do lead.
      // Os dados reais mostram que lpX/hot/cold vivem no utm_term (col 7), mas
      // procuramos em ambas as colunas (5 e 7) para robustez.
      // Conta APENAS leads pagos (source = meta/google) — Tx Conv usa esse número.
      const haystack = `${utmContentRaw} ${termString}`;
      const lpMatch = haystack.match(/lp([a-z])/);
      if (lpMatch && isPaidRow(row)) {
        const lpKey = `lp${lpMatch[1]}`;
        if (!leadsByLp[lpKey]) leadsByLp[lpKey] = { hot: 0, cold: 0, total: 0 };
        leadsByLp[lpKey].total += 1;
        if (haystack.includes("hot")) leadsByLp[lpKey].hot += 1;
        else if (haystack.includes("cold")) leadsByLp[lpKey].cold += 1;
      }

      const utmContent = row[CONTENT_INDEX]?.trim() ?? "";
      if (!utmContent) continue;

      const adId = normalizeNumericId(utmContent);

      leads[adId] = (leads[adId] ?? 0) + 1;

      // Story 18.47: mapeia ad_id → Ad Name (primeiro não-vazio) para nomear
      // as respostas da pesquisa (que só têm utm_content).
      if (AD_NAME_INDEX >= 0 && !adNameByContent[adId]) {
        const adName = (row[AD_NAME_INDEX] ?? "").trim();
        if (adName) adNameByContent[adId] = adName;
      }

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

      totalLeads += 1;
    }

    return { leads, leadsByAdName, adNameByContent, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
  }, [sheetQuery.data]);

  // Story 18.47: faixas por Ad Name a partir da aba de PESQUISA.
  // Cada linha = um respondente, com utm_content (ad_id) + "Faixa N".
  // Filtra pago (utm_source = meta), cruza utm_content → Ad Name (aba de leads),
  // e agrupa a contagem de faixas por criativo.
  const bandsResult = useMemo(() => {
    const bandsByAdName: Record<string, Record<string, number>> = {};
    const labels = new Set<string>();

    const rows = surveyQuery.data?.rows;
    const headers = (surveyQuery.data as unknown as { headers?: string[] })?.headers;
    if (!rows || !headers || rows.length === 0) {
      return { bandsByAdName, bandLabels: [] as string[] };
    }

    const norm = (s: string) => (s ?? "").trim().toLowerCase();
    const utmContentIdx = headers.findIndex((h) => norm(h) === "utm_content");
    const utmSourceIdx = headers.findIndex((h) => norm(h) === "utm_source" || norm(h) === "source");
    // Coluna de faixa: prefere "Faixa 1" (existe nas duas etapas); senão a 1ª
    // coluna que começa com "faixa" (a Paga tem "Faixa" e "Faixa 1").
    let faixaIdx = headers.findIndex((h) => norm(h) === "faixa 1");
    if (faixaIdx === -1) faixaIdx = headers.findIndex((h) => norm(h).startsWith("faixa"));

    if (utmContentIdx === -1 || faixaIdx === -1) {
      return { bandsByAdName, bandLabels: [] as string[] };
    }

    const adNameByContent = result.adNameByContent;

    for (const row of rows) {
      // Só leads pagos do Meta (utm_content = ad_id). ig/orgânico fora.
      if (utmSourceIdx !== -1 && norm(row[utmSourceIdx] ?? "") !== "meta") continue;

      const adId = normalizeNumericId(row[utmContentIdx] ?? "");
      if (!adId) continue;

      const faixa = (row[faixaIdx] ?? "").trim().toUpperCase();
      if (!faixa) continue;

      // Nome do criativo via cruzamento com a aba de leads (utm_content → Ad Name).
      const adName = adNameByContent[adId];
      if (!adName) continue;

      labels.add(faixa);
      if (!bandsByAdName[adName]) bandsByAdName[adName] = {};
      bandsByAdName[adName][faixa] = (bandsByAdName[adName][faixa] ?? 0) + 1;
    }

    return { bandsByAdName, bandLabels: Array.from(labels).sort() };
  }, [surveyQuery.data, result.adNameByContent]);

  const isLoading =
    surveysQuery.isLoading ||
    spreadsheetsQuery.isLoading ||
    (leadsSheet ? sheetQuery.isLoading : false);
  const error = surveysQuery.error?.message || sheetQuery.error?.message;

  return {
    leads: result.leads,
    leadsByAdName: result.leadsByAdName,
    adNameByContent: result.adNameByContent,
    bandsByAdName: bandsResult.bandsByAdName,
    bandLabels: bandsResult.bandLabels,
    terms: result.terms,
    termsMapping: result.termsMapping,
    leadsByLp: result.leadsByLp,
    totalLeads: result.totalLeads,
    isLoading,
    error: error ? error : undefined,
  };
}
