import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSurveys,
  type FunnelSurvey,
  type SheetData,
} from "@/lib/hooks/use-google-sheets";
import {
  SURVEY_EMAIL_MATCHERS,
  SURVEY_PHONE_MATCHERS,
  SURVEY_TIMESTAMP_MATCHERS,
} from "@/lib/constants/survey-questions";
import { normaliseDate } from "@/lib/utils/spreadsheet-filters";
import { normalizeEmail, getLast8DigitsPhone } from "@/lib/utils/normalize-answer";

export interface OrganicLeadsByDayResult {
  /** Map de YYYY-MM-DD para count de leads orgânicos novos no dia. */
  byDay: Record<string, number>;
  /** Total de leads orgânicos no período (já deduplicado). */
  totalLeads: number;
  /** True quando ainda carregando dados das pesquisas. */
  isLoading: boolean;
  /** Indica se há ao menos uma pesquisa orgânica vinculada. */
  hasOrganicSurveys: boolean;
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/\s+/g, " ");
}

function findHeaderIndexByName(headers: string[], columnName: string | undefined): number {
  if (!columnName) return -1;
  const target = normalizeForMatch(columnName);
  for (let i = 0; i < headers.length; i++) {
    if (normalizeForMatch(headers[i]) === target) return i;
  }
  return -1;
}

function findHeaderIndexByMatcher(headers: string[], matchers: readonly string[]): number {
  const normalized = headers.map(normalizeForMatch);
  const normalizedMatchers = matchers.map(normalizeForMatch);
  for (let i = 0; i < normalized.length; i++) {
    if (normalizedMatchers.some((m) => normalized[i].includes(m))) return i;
  }
  return -1;
}

/**
 * Conta respostas das pesquisas orgânicas vinculadas ao funil agrupadas por dia.
 * Usado pra renderizar a linha "Leads Gratuitos" no gráfico de Leads Acumulados.
 *
 * Estratégia de mapping (ver `useSurveyAggregation` pra mesma logica):
 * - timestamp: usa `survey.columnMapping.timestamp` se mapeado, senão fallback
 *   pros matchers ("submitted at", "data", etc).
 * - email/phone: deduplicação opcional. Se uma das colunas estiver mapeada,
 *   contagens deduplicadas (mesmo email/phone aparecendo em vários dias conta
 *   só no PRIMEIRO dia).
 *
 * Caso a planilha não tenha timestamp mapeado nem matcheável, todas as linhas
 * são ignoradas pra evitar contagem fantasma sem data.
 */
export function useOrganicLeadsByDay(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
): OrganicLeadsByDayResult {
  const apiClient = useApiClient();
  const { data: surveysData, isLoading: surveysLoading } = useFunnelSurveys(
    projectId,
    funnelId,
    stageId,
    "organic",
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

  const sheetsLoading = sheetQueries.some((q) => q.isLoading);
  const isLoading = surveysLoading || sheetsLoading;
  const hasOrganicSurveys = surveys.length > 0;

  if (isLoading || !hasOrganicSurveys) {
    return { byDay: {}, totalLeads: 0, isLoading, hasOrganicSurveys };
  }

  const byDay: Record<string, number> = {};
  const seenIdentifiers = new Set<string>();
  let totalLeads = 0;

  for (let i = 0; i < sheetQueries.length; i++) {
    const data = sheetQueries[i].data;
    if (!data) continue;
    const survey = surveys[i];
    const mapping = survey.columnMapping ?? {};

    const timestampIdx = mapping.timestamp
      ? findHeaderIndexByName(data.headers, mapping.timestamp)
      : findHeaderIndexByMatcher(data.headers, SURVEY_TIMESTAMP_MATCHERS);
    if (timestampIdx < 0) continue;

    const emailIdx = mapping.email
      ? findHeaderIndexByName(data.headers, mapping.email)
      : findHeaderIndexByMatcher(data.headers, SURVEY_EMAIL_MATCHERS);
    const phoneIdx = mapping.phone
      ? findHeaderIndexByName(data.headers, mapping.phone)
      : findHeaderIndexByMatcher(data.headers, SURVEY_PHONE_MATCHERS);

    for (let r = 0; r < data.rows.length; r++) {
      const row = data.rows[r];
      const dateRaw = row[timestampIdx] ?? "";
      const date = normaliseDate(dateRaw);
      if (!date) continue;

      // Identificador para dedupe: prioriza email, depois phone, fallback row index
      let identifier: string | null = null;
      if (emailIdx >= 0) {
        const email = (row[emailIdx] ?? "").trim();
        if (email) identifier = `e:${normalizeEmail(email)}`;
      }
      if (!identifier && phoneIdx >= 0) {
        const phone = (row[phoneIdx] ?? "").trim();
        if (phone) {
          const normPhone = getLast8DigitsPhone(phone);
          if (normPhone) identifier = `p:${normPhone}`;
        }
      }
      if (!identifier) {
        identifier = `s${i}:r${r}`;
      }

      if (seenIdentifiers.has(identifier)) continue;
      seenIdentifiers.add(identifier);

      byDay[date] = (byDay[date] ?? 0) + 1;
      totalLeads += 1;
    }
  }

  return { byDay, totalLeads, isLoading: false, hasOrganicSurveys };
}
