"use client";

/**
 * Story 18.64: índice de respostas de Pesquisa por CONTATO (e-mail / telefone).
 *
 * Diferente de `useCrossReferenceLeads` — que cruza por `utm_content` → Ad Name
 * (ou seja, por criativo) — este hook indexa cada respondente da pesquisa por
 * e-mail E por telefone normalizados, guardando a Faixa (A/B/C/D). Assim, dado um
 * lead, dá pra responder: "respondeu a pesquisa?" (presença na chave) e "qual a
 * faixa?".
 *
 * REUSE: `useFunnelSurveys` (todas as pesquisas do stage — paga + orgânica),
 * `normalizeEmail` / `getLast8DigitsPhone` (mesma normalização do match de leads
 * em `use-survey-aggregation`), matchers de header (`survey-questions`) e o padrão
 * de leitura de faixa de `useCrossReferenceLeads` (mapping > "faixa 1" > começa
 * com "faixa").
 */

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSurveys,
  type FunnelSurvey,
  type SheetData,
  type SurveyColumnMapping,
} from "@/lib/hooks/use-google-sheets";
import { normalizeEmail, getLast8DigitsPhone } from "@/lib/utils/normalize-answer";
import {
  SURVEY_EMAIL_MATCHERS,
  SURVEY_PHONE_MATCHERS,
} from "@/lib/constants/survey-questions";

export interface SurveyContactInfo {
  /** Faixa lida da pesquisa (A/B/C/D…), em maiúsculas; null se a pesquisa não tem coluna de faixa. */
  faixa: string | null;
}

export interface SurveyBandByContact {
  /** normalizedEmail → info */
  byEmail: Map<string, SurveyContactInfo>;
  /** últimos 8 dígitos do telefone → info */
  byPhone: Map<string, SurveyContactInfo>;
  /** faixas distintas encontradas (A/B/C/D…), ordenadas */
  bandLabels: string[];
  /** nº de pesquisas vinculadas ao stage (0 = sem pesquisa) */
  surveysLinked: number;
  isLoading: boolean;
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** Igualdade exata normalizada (mapping-first). */
function findByName(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const target = norm(name);
  return headers.findIndex((h) => norm(h) === target);
}

/** Substring case-insensitive (fallback por matcher). */
function findByMatchers(headers: string[], matchers: readonly string[]): number {
  return headers.findIndex((h) => matchers.some((m) => norm(h).includes(norm(m))));
}

/** Coluna de faixa: mapping.faixa > "faixa 1" > 1º header começando com "faixa". */
function findFaixaIndex(headers: string[], mapping: SurveyColumnMapping): number {
  const mapped = findByName(headers, mapping.faixa);
  if (mapped !== -1) return mapped;
  let idx = headers.findIndex((h) => norm(h) === "faixa 1");
  if (idx === -1) idx = headers.findIndex((h) => norm(h).startsWith("faixa"));
  return idx;
}

export function useSurveyBandByContact(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
): SurveyBandByContact {
  const apiClient = useApiClient();
  // surveyType null → traz pesquisas paga + orgânica vinculadas ao stage
  const { data: surveysData, isLoading: surveysLoading } = useFunnelSurveys(
    projectId,
    funnelId,
    stageId ?? null,
    null,
  );
  const surveys: FunnelSurvey[] = surveysData?.surveys ?? [];

  const sheetQueries = useQueries({
    queries: surveys.map((s) => ({
      queryKey: ["google-sheets-data", s.spreadsheetId, s.sheetName] as const,
      queryFn: () =>
        apiClient<SheetData>(
          `/api/google-sheets/spreadsheets/${s.spreadsheetId}/sheets/${encodeURIComponent(s.sheetName)}/data`,
        ),
      staleTime: 30 * 1000,
      enabled: !!s.spreadsheetId && !!s.sheetName,
    })),
  });

  const isLoading = surveysLoading || sheetQueries.some((q) => q.isLoading);
  // Referência estável p/ o useMemo (mesmo padrão de useCrossReferenceLeads).
  const sheetsData = sheetQueries.map((q) => q.data);
  const sheetsKey = sheetQueries.map((q) => q.dataUpdatedAt).join(",");

  return useMemo<SurveyBandByContact>(() => {
    const byEmail = new Map<string, SurveyContactInfo>();
    const byPhone = new Map<string, SurveyContactInfo>();
    const labels = new Set<string>();

    for (let i = 0; i < sheetsData.length; i++) {
      const data = sheetsData[i];
      const survey = surveys[i];
      if (!data?.rows || !data?.headers || !survey) continue;
      const headers = data.headers;

      const mappedEmail = findByName(headers, survey.columnMapping.email);
      const emailIdx = mappedEmail !== -1 ? mappedEmail : findByMatchers(headers, SURVEY_EMAIL_MATCHERS);
      const mappedPhone = findByName(headers, survey.columnMapping.phone);
      const phoneIdx = mappedPhone !== -1 ? mappedPhone : findByMatchers(headers, SURVEY_PHONE_MATCHERS);
      const faixaIdx = findFaixaIndex(headers, survey.columnMapping);

      // Sem forma de identificar o respondente → aba não contribui.
      if (emailIdx === -1 && phoneIdx === -1) continue;

      for (const row of data.rows) {
        const email = emailIdx !== -1 ? (row[emailIdx] ?? "").trim() : "";
        const phone = phoneIdx !== -1 ? (row[phoneIdx] ?? "").trim() : "";
        if (!email && !phone) continue;

        const faixa = faixaIdx !== -1 ? (row[faixaIdx] ?? "").trim().toUpperCase() : "";
        if (faixa) labels.add(faixa);
        const info: SurveyContactInfo = { faixa: faixa || null };

        if (email) {
          const k = normalizeEmail(email);
          // primeira ocorrência vence (respostas duplicadas do mesmo contato)
          if (k && !byEmail.has(k)) byEmail.set(k, info);
        }
        if (phone) {
          const k = getLast8DigitsPhone(phone);
          if (k && !byPhone.has(k)) byPhone.set(k, info);
        }
      }
    }

    return {
      byEmail,
      byPhone,
      bandLabels: Array.from(labels).sort(),
      surveysLinked: surveys.length,
      isLoading,
    };
    // deps: sheetsKey muda quando qualquer aba recarrega; surveys.length cobre vínculo/desvínculo
  }, [sheetsKey, surveys.length, isLoading]);
}
