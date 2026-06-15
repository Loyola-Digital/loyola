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
import { useQueries } from "@tanstack/react-query";
import { useFunnelSurveys } from "@/lib/hooks/use-google-sheets";
import { useSheetData } from "@/lib/hooks/use-google-sheets";
import type { SheetData } from "@/lib/hooks/use-google-sheets";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useFunnelSpreadsheets } from "@/lib/hooks/use-funnel-spreadsheets";
import { normalizeNumericId } from "@/lib/utils/normalize-answer";

// Story 18.47: extrai um mapa ad_id (content/utm_content) → Ad Name de uma aba
// (leads OU sales). Usado para nomear as respostas da pesquisa (que só têm
// utm_content). Localiza colunas por cabeçalho (robusto entre etapas).
function extractAdNamesFromSheet(
  data: { headers?: string[]; rows?: string[][] } | null | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  const rows = data?.rows;
  const headers = data?.headers;
  if (!rows || !headers) return map;
  const norm = (s: string) => (s ?? "").trim().toLowerCase();
  // utm_content aparece como "content", "utm_content" ou "co=" (decisão Danilo).
  const contentIdx = headers.findIndex((h) => ["content", "utm_content", "co="].includes(norm(h)));
  const adNameIdx = headers.findIndex((h) =>
    ["ad name", "ad_name", "adname", "nome do anúncio", "nome do anuncio"].includes(norm(h)),
  );
  if (contentIdx === -1 || adNameIdx === -1) return map;
  for (const row of rows) {
    const adId = normalizeNumericId(row[contentIdx] ?? "");
    const adName = (row[adNameIdx] ?? "").trim();
    if (adId && adName && !map[adId]) map[adId] = adName;
  }
  return map;
}

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
  // Gratuita vincula a contagem como `leads` (n8n-leads-lp-cap-grat); a etapa
  // Paga vincula como `sales` (n8n-kiwify-captação — mesma estrutura content +
  // Ad Name, com faturamento extra). Pega o que existir.
  const leadsSheet =
    spreadsheetsQuery.data?.spreadsheets?.find((s) => s.type === "leads") ??
    spreadsheetsQuery.data?.spreadsheets?.find((s) => s.type === "sales");
  // Story 18.47: a aba que tem content + Ad Name varia por etapa — na Gratuita é
  // a de `leads`; na Paga é a de `sales` (n8n-kiwify-captação, a de leads é popup).
  // Lemos as duas e combinamos o mapa ad_id → Ad Name.
  const salesSheet = spreadsheetsQuery.data?.spreadsheets?.find((s) => s.type === "sales");

  const sheetQuery = useSheetData(
    leadsSheet?.spreadsheetId ?? null,
    leadsSheet?.sheetName ?? null,
  );
  const salesSheetQuery = useSheetData(
    salesSheet?.spreadsheetId ?? null,
    salesSheet?.sheetName ?? null,
  );

  // Story 18.50: processa TODAS as pesquisas vinculadas (não só surveys[0]).
  // Um stage pode vincular mais de uma aba de pesquisa (ex.: "Pesquisa-Captação"
  // + "Pesquisa-Captação - Alunos"); usar só a primeira fazia as Faixas sumirem
  // quando a 1ª aba (ordem do endpoint não é garantida) não tinha respostas
  // pagas. Buscamos todas e agregamos as faixas das que tiverem dados válidos.
  const apiClient = useApiClient();
  const surveyResults = useQueries({
    queries: surveys.map((s) => ({
      queryKey: ["google-sheets-data", s.spreadsheetId, s.sheetName],
      queryFn: () =>
        apiClient<SheetData>(
          `/api/google-sheets/spreadsheets/${s.spreadsheetId}/sheets/${encodeURIComponent(s.sheetName)}/data`,
        ),
      enabled: !!s.spreadsheetId && !!s.sheetName,
      staleTime: 30 * 1000,
    })),
  });

  // Story 18.47: mapa ad_id → Ad Name combinando a aba de leads E a de sales
  // (a que tiver content + Ad Name preenche). Cobre Gratuita e Paga.
  const adNameByContent = useMemo<Record<string, string>>(() => {
    return {
      ...extractAdNamesFromSheet(salesSheetQuery.data),
      ...extractAdNamesFromSheet(sheetQuery.data),
    };
  }, [sheetQuery.data, salesSheetQuery.data]);

  // Computar cruzamento: coluna 5 = utm_content (adId), coluna 7 = utm_term (lpa/hot/cold/etc)
  const result = useMemo(() => {
    const leads: Record<string, number> = {};
    const leadsByAdName: Record<string, number> = {};
    const terms: Record<string, string> = {};
    const termsMapping: Record<string, string> = {};
    const leadsByLp: Record<string, { hot: number; cold: number; total: number }> = {};
    let totalLeads = 0;

    if (!sheetQuery.data?.rows || sheetQuery.data.rows.length === 0) {
      return { leads, leadsByAdName, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
    }

    const headers = (sheetQuery.data as unknown as { headers?: string[] }).headers ?? [];
    // Story 18.47: localiza colunas por CABEÇALHO (robusto entre abas de etapas
    // diferentes); cai pras posições legadas (5/7) quando o header não existe.
    const findCol = (names: string[], fallback: number): number => {
      const idx = headers.findIndex((h) => names.includes((h ?? "").trim().toLowerCase()));
      return idx >= 0 ? idx : fallback;
    };
    const CONTENT_INDEX = findCol(["content", "utm_content", "co="], 5); // utm_content = adId
    const TERM_INDEX = findCol(["utm_term", "term", "t="], 7);           // utm_term (lpX/hot/cold)

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

    return { leads, leadsByAdName, terms, termsMapping, leadsByLp, totalLeads, isLoading: false };
  }, [sheetQuery.data]);

  // Story 18.47: faixas por Ad Name a partir da aba de PESQUISA.
  // Cada linha = um respondente, com utm_content (ad_id) + "Faixa N".
  // Filtra pago (utm_source = meta), cruza utm_content → Ad Name (aba de leads),
  // e agrupa a contagem de faixas por criativo.
  // Story 18.50: dados de todas as pesquisas (referência estável p/ o useMemo).
  const surveysData = surveyResults.map((r) => r.data);
  const surveysDataKey = surveyResults.map((r) => r.dataUpdatedAt).join(",");

  const bandsResult = useMemo(() => {
    const bandsByAdName: Record<string, Record<string, number>> = {};
    const labels = new Set<string>();
    const norm = (s: string) => (s ?? "").trim().toLowerCase();

    // Story 18.50: agrega as faixas de TODAS as pesquisas vinculadas. Abas sem
    // colunas válidas (utm_content/faixa) ou sem respostas pagas contribuem 0,
    // então somar todas é seguro e robusto à ordem de vínculo.
    for (const data of surveysData) {
      const rows = data?.rows;
      const headers = (data as unknown as { headers?: string[] })?.headers;
      if (!rows || !headers || rows.length === 0) continue;

      const utmContentIdx = headers.findIndex((h) => ["utm_content", "content", "co="].includes(norm(h)));
      const utmSourceIdx = headers.findIndex((h) => ["utm_source", "source", "s="].includes(norm(h)));
      // Coluna de faixa: prefere "Faixa 1" (existe nas duas etapas); senão a 1ª
      // coluna que começa com "faixa" (a Paga tem "Faixa" e "Faixa 1").
      let faixaIdx = headers.findIndex((h) => norm(h) === "faixa 1");
      if (faixaIdx === -1) faixaIdx = headers.findIndex((h) => norm(h).startsWith("faixa"));

      if (utmContentIdx === -1 || faixaIdx === -1) continue;

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
    }

    return { bandsByAdName, bandLabels: Array.from(labels).sort() };
  }, [surveysDataKey, adNameByContent]);


  const isLoading =
    surveysQuery.isLoading ||
    spreadsheetsQuery.isLoading ||
    (leadsSheet ? sheetQuery.isLoading : false) ||
    (salesSheet ? salesSheetQuery.isLoading : false) ||
    surveyResults.some((r) => r.isLoading);
  const error = surveysQuery.error?.message || sheetQuery.error?.message;

  return {
    leads: result.leads,
    leadsByAdName: result.leadsByAdName,
    adNameByContent,
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
