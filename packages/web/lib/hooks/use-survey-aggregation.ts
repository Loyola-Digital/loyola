import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSurveys,
  type SheetData,
} from "@/lib/hooks/use-google-sheets";
import {
  SURVEY_QUESTION_MAP,
  SURVEY_FALLBACK_THRESHOLD,
  SURVEY_TIMESTAMP_MATCHERS,
  SURVEY_UTM_CONTENT_MATCHERS,
  SURVEY_EMAIL_MATCHERS,
  SURVEY_PHONE_MATCHERS,
  type SurveyQuestionKey,
} from "@/lib/constants/survey-questions";
import { normalizeAnswer, mostCommonRaw, normalizeEmail, getLast8DigitsPhone } from "@/lib/utils/normalize-answer";
import { normaliseDate } from "@/lib/utils/spreadsheet-filters";
import { useFunnelSpreadsheets, useFunnelSpreadsheetData } from "@/lib/hooks/use-funnel-spreadsheets";

// ============================================================
// Tipos exportados
// ============================================================

export interface SurveyQuestionAggregation {
  label: string;
  count: number;
  pct: number;
}

export interface SurveyAdData {
  faturamento: Array<{ label: string; count: number }>;
  profissao: Array<{ label: string; count: number }>;
  funcionarios: Array<{ label: string; count: number }>;
  voce_e: Array<{ label: string; count: number }>;
}

export type SurveyDataByAdId = Record<string, SurveyAdData>;

export interface UseSurveyAggregationResult {
  byQuestion: Record<SurveyQuestionKey, SurveyQuestionAggregation[]>;
  byAdId: SurveyDataByAdId;
  totalResponses: number;
  usingFallback: boolean;
  fallbackReason?: string;
  isLoading: boolean;
  matchedLeadIds: Set<string>;
  matchedResponses: number;
  unmatchedResponses: number;
}

const EMPTY_BY_QUESTION: Record<SurveyQuestionKey, SurveyQuestionAggregation[]> = {
  faturamento: [],
  profissao: [],
  funcionarios: [],
  voce_e: [],
};

// ============================================================
// Helpers internos
// ============================================================

/**
 * Normaliza string pra comparação robusta: lowercase + trim + remove acentos +
 * colapsa whitespace. Permite que matcher "voce e" pegue header "Você é:" e
 * outras variações de acento/case.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Encontra o índice da coluna cujo header bate com algum dos matchers.
 * Compara com normalização que remove acentos e unifica case/whitespace —
 * tolerante a variações ("Você é:" casa com matcher "voce e").
 */
function findHeaderIndex(headers: string[], matchers: readonly string[]): number {
  const normalized = headers.map(normalizeForMatch);
  const normalizedMatchers = matchers.map(normalizeForMatch);
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    if (normalizedMatchers.some((m) => h.includes(m))) {
      return i;
    }
  }
  return -1;
}

interface ColumnIndexMap {
  questions: Partial<Record<SurveyQuestionKey, number>>;
  timestamp: number;
  utmContent: number;
  email: number;
  phone: number;
}

function mapHeaders(headers: string[]): ColumnIndexMap {
  const questions: Partial<Record<SurveyQuestionKey, number>> = {};
  for (const [key, def] of Object.entries(SURVEY_QUESTION_MAP)) {
    const idx = findHeaderIndex(headers, def.matchers);
    if (idx >= 0) questions[key as SurveyQuestionKey] = idx;
  }
  return {
    questions,
    timestamp: findHeaderIndex(headers, SURVEY_TIMESTAMP_MATCHERS),
    utmContent: findHeaderIndex(headers, SURVEY_UTM_CONTENT_MATCHERS),
    email: findHeaderIndex(headers, SURVEY_EMAIL_MATCHERS),
    phone: findHeaderIndex(headers, SURVEY_PHONE_MATCHERS),
  };
}

/**
 * Filtra linhas de SheetData pela janela retroativa de `days` dias baseada
 * na coluna de timestamp. Se timestampIdx < 0, retorna todas.
 */
function filterRowsByDays(
  rows: string[][],
  timestampIdx: number,
  days: number,
): string[][] {
  if (timestampIdx < 0) return rows;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  return rows.filter((row) => {
    const raw = row[timestampIdx];
    const normalized = normaliseDate(raw);
    if (!normalized) return false;
    return normalized >= cutoffIso && normalized <= todayIso;
  });
}

// ============================================================
// Hook principal
// ============================================================

/**
 * Agrega respostas da(s) pesquisa(s) Tally vinculada(s) ao funil pra alimentar:
 *
 * 1. Seção "Resultados da Pesquisa" no fim do dash (3.a) — via `byQuestion`
 *    com breakdown percentual das 3 perguntas (faturamento, profissão,
 *    nº funcionários)
 * 2. Cards do Top Criativos (3.b) — via `byAdId` com top-1 de faturamento
 *    e profissão por `ad_id` cruzado via `utm_content`
 *
 * Fallback: se menos de `SURVEY_FALLBACK_THRESHOLD` respostas caírem no
 * período selecionado, usa o histórico completo da planilha + `usingFallback: true`
 * pra UI exibir badge amarelo.
 *
 * Multi-survey: se o funil tem N surveys vinculadas, TODAS são processadas e
 * as respostas são concatenadas antes da agregação.
 */
export function useSurveyAggregation(
  projectId: string,
  funnelId: string,
  days: number,
): UseSurveyAggregationResult {
  const apiClient = useApiClient();
  const { data: surveysData, isLoading: surveysLoading } = useFunnelSurveys(
    projectId,
    funnelId,
  );
  const surveys = surveysData?.surveys ?? [];

  // Carregar lista de spreadsheets para encontrar a planilha de Leads
  const { data: spreadsheetsData } = useFunnelSpreadsheets(projectId, funnelId);
  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const leadsSpreadsheet = spreadsheets.find((s) => s.type === "leads");

  // Carregar dados da planilha de Leads
  const { data: leadsData } = useFunnelSpreadsheetData(
    projectId,
    funnelId,
    leadsSpreadsheet?.id,
  );

  const sheetQueries = useQueries({
    queries: surveys.map((s) => ({
      queryKey: ["google-sheets-data", s.spreadsheetId, s.sheetName] as const,
      queryFn: () =>
        apiClient<SheetData>(
          `/api/google-sheets/spreadsheets/${s.spreadsheetId}/sheets/${encodeURIComponent(s.sheetName)}/data`,
        ),
      staleTime: 5 * 60 * 1000,
      enabled: !!s.spreadsheetId && !!s.sheetName,
    })),
  });

  const sheetsLoading = sheetQueries.some((q) => q.isLoading);
  const isLoading = surveysLoading || sheetsLoading;

  // Cálculo direto (sem useMemo explícito — ops são O(rows × queries) e queries
  // já cacheadas pelo react-query; overhead de recomputa por render é irrelevante)
  const result: UseSurveyAggregationResult = (() => {
    if (isLoading || sheetQueries.length === 0) {
      return {
        byQuestion: { ...EMPTY_BY_QUESTION },
        byAdId: {},
        totalResponses: 0,
        usingFallback: false,
        isLoading,
        matchedLeadIds: new Set(),
        matchedResponses: 0,
        unmatchedResponses: 0,
      };
    }

    type CombinedRow = {
      row: string[];
      questionIndexes: Partial<Record<SurveyQuestionKey, number>>;
      timestampIdx: number;
      utmContentIdx: number;
    };
    const allRows: CombinedRow[] = [];
    for (const q of sheetQueries) {
      const data = q.data;
      if (!data) continue;
      const colMap = mapHeaders(data.headers);
      for (const row of data.rows) {
        allRows.push({
          row,
          questionIndexes: colMap.questions,
          timestampIdx: colMap.timestamp,
          utmContentIdx: colMap.utmContent,
        });
      }
    }

    if (allRows.length === 0) {
      return {
        byQuestion: { ...EMPTY_BY_QUESTION },
        byAdId: {},
        totalResponses: 0,
        usingFallback: false,
        fallbackReason: "Sem respostas nas pesquisas vinculadas",
        isLoading: false,
        matchedLeadIds: new Set(),
        matchedResponses: 0,
        unmatchedResponses: 0,
      };
    }

    // Construir mapa de leads para match rápido
    type LeadMatch = { leadId: string; createdDate: string };
    const leadsByEmail = new Map<string, LeadMatch>();
    const leadsByPhone = new Map<string, LeadMatch>();
    if (leadsData?.rows) {
      for (let i = 0; i < leadsData.rows.length; i++) {
        const row = leadsData.rows[i];
        const email = row.named.email || "";
        const phone = row.named.phone || "";
        const createdDate = row.named.date || "";
        const leadId = String(i); // Use row index as lead ID

        if (email) {
          const normalizedEmail = normalizeEmail(email);
          if (!leadsByEmail.has(normalizedEmail)) {
            leadsByEmail.set(normalizedEmail, { leadId, createdDate });
          }
        }
        if (phone) {
          const normalizedPhone = getLast8DigitsPhone(phone);
          if (normalizedPhone && !leadsByPhone.has(normalizedPhone)) {
            leadsByPhone.set(normalizedPhone, { leadId, createdDate });
          }
        }
      }
    }

    // Função para verificar se uma resposta tem match com os leads
    function findLeadMatch(surveyEmail: string, surveyPhone: string): LeadMatch | null {
      if (surveyEmail) {
        const normalizedEmail = normalizeEmail(surveyEmail);
        const match = leadsByEmail.get(normalizedEmail);
        if (match) return match;
      }
      if (surveyPhone) {
        const normalizedPhone = getLast8DigitsPhone(surveyPhone);
        if (normalizedPhone) {
          const match = leadsByPhone.get(normalizedPhone);
          if (match) return match;
        }
      }
      return null;
    }

    // Filtro por data — faz por-survey pra usar o timestampIdx correto
    const filteredPerSurvey: string[][][] = [];
    let totalFiltered = 0;
    let someSurveyHasTimestamp = false;
    for (const q of sheetQueries) {
      const data = q.data;
      if (!data) continue;
      const colMap = mapHeaders(data.headers);
      if (colMap.timestamp >= 0) someSurveyHasTimestamp = true;
      const filtered = filterRowsByDays(data.rows, colMap.timestamp, days);
      filteredPerSurvey.push(filtered);
      totalFiltered += filtered.length;
    }

    // Fallback: se poucas respostas OU nenhuma survey tem coluna de data
    const useFallback = !someSurveyHasTimestamp || totalFiltered < SURVEY_FALLBACK_THRESHOLD;
    let fallbackReason: string | undefined;
    if (useFallback) {
      if (!someSurveyHasTimestamp) {
        fallbackReason = "Sem coluna de data — usando histórico total";
      } else {
        fallbackReason = `Apenas ${totalFiltered} respostas no período — usando histórico total`;
      }
    }

    // Processa rows efetivas: se fallback, usa dados crus; senão, usa filtrados
    // Ainda precisa ser por-survey pra respeitar os indexes de cada planilha
    const byQuestion: Record<SurveyQuestionKey, SurveyQuestionAggregation[]> = {
      faturamento: [],
      profissao: [],
      funcionarios: [],
      voce_e: [],
    };
    const byAdId: SurveyDataByAdId = {};
    let totalResponses = 0;
    const matchedLeadIds = new Set<string>();
    let matchedResponses = 0;
    let unmatchedResponses = 0;

    const bucketsPerQuestion: Record<SurveyQuestionKey, Map<string, { rawValues: string[]; count: number }>> = {
      faturamento: new Map(),
      profissao: new Map(),
      funcionarios: new Map(),
      voce_e: new Map(),
    };
    const byAdBuckets: Record<string, {
      faturamento: Map<string, { rawValues: string[]; count: number }>;
      profissao: Map<string, { rawValues: string[]; count: number }>;
      funcionarios: Map<string, { rawValues: string[]; count: number }>;
      voce_e: Map<string, { rawValues: string[]; count: number }>;
    }> = {};

    for (let i = 0; i < sheetQueries.length; i++) {
      const data = sheetQueries[i].data;
      if (!data) continue;
      const colMap = mapHeaders(data.headers);
      const effectiveRows = useFallback ? data.rows : filteredPerSurvey[i];
      totalResponses += effectiveRows.length;

      // Contar matches de leads pra cada resposta
      const emailIdx = colMap.email;
      const phoneIdx = colMap.phone;
      for (const row of effectiveRows) {
        const surveyEmail = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : "";
        const surveyPhone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() : "";
        const leadMatch = findLeadMatch(surveyEmail, surveyPhone);
        if (leadMatch) {
          matchedLeadIds.add(leadMatch.leadId);
          matchedResponses += 1;
        } else {
          unmatchedResponses += 1;
        }
      }

      // byQuestion: pra cada pergunta mapeada, agregar respostas
      for (const [key, idx] of Object.entries(colMap.questions)) {
        if (idx == null || idx < 0) continue;
        const bucket = bucketsPerQuestion[key as SurveyQuestionKey];
        for (const row of effectiveRows) {
          const raw = (row[idx] ?? "").trim();
          if (!raw) continue;
          const normKey = normalizeAnswer(raw);
          const existing = bucket.get(normKey);
          if (existing) {
            existing.rawValues.push(raw);
            existing.count += 1;
          } else {
            bucket.set(normKey, { rawValues: [raw], count: 1 });
          }
        }
      }

      // byAdId: só pra faturamento + profissao
      const utmIdx = colMap.utmContent;
      if (utmIdx >= 0) {
        for (const row of effectiveRows) {
          const adId = (row[utmIdx] ?? "").trim();
          if (!adId) continue;
          const adBucket = byAdBuckets[adId] ?? { faturamento: new Map(), profissao: new Map(), funcionarios: new Map(), voce_e: new Map() };
          for (const questionKey of ["faturamento", "profissao", "funcionarios", "voce_e"] as const) {
            const qIdx = colMap.questions[questionKey];
            if (qIdx == null || qIdx < 0) continue;
            const raw = (row[qIdx] ?? "").trim();
            if (!raw) continue;
            const normKey = normalizeAnswer(raw);
            const existing = adBucket[questionKey].get(normKey);
            if (existing) {
              existing.rawValues.push(raw);
              existing.count += 1;
            } else {
              adBucket[questionKey].set(normKey, { rawValues: [raw], count: 1 });
            }
          }
          byAdBuckets[adId] = adBucket;
        }
      }
    }

    // Finaliza byQuestion — converte buckets em Array com top-8 + "Outros"
    for (const key of Object.keys(bucketsPerQuestion) as SurveyQuestionKey[]) {
      const bucket = bucketsPerQuestion[key];
      if (bucket.size === 0) continue;
      const entries = Array.from(bucket.values())
        .map((b) => ({
          label: mostCommonRaw(b.rawValues),
          count: b.count,
          pct: totalResponses > 0 ? (b.count / totalResponses) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);
      if (entries.length <= 8) {
        byQuestion[key] = entries;
      } else {
        const top = entries.slice(0, 8);
        const rest = entries.slice(8);
        const restCount = rest.reduce((s, e) => s + e.count, 0);
        top.push({
          label: `Outros (${rest.length})`,
          count: restCount,
          pct: totalResponses > 0 ? (restCount / totalResponses) * 100 : 0,
        });
        byQuestion[key] = top;
      }
    }

    // Finaliza byAdId
    for (const [adId, bucket] of Object.entries(byAdBuckets)) {
      byAdId[adId] = {
        faturamento: Array.from(bucket.faturamento.values())
          .map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count }))
          .sort((a, b) => b.count - a.count),
        profissao: Array.from(bucket.profissao.values())
          .map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count }))
          .sort((a, b) => b.count - a.count),
        funcionarios: Array.from(bucket.funcionarios.values())
          .map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count }))
          .sort((a, b) => b.count - a.count),
        voce_e: Array.from(bucket.voce_e.values())
          .map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count }))
          .sort((a, b) => b.count - a.count),
      };
    }

    return {
      byQuestion,
      byAdId,
      totalResponses,
      usingFallback: useFallback,
      fallbackReason,
      isLoading: false,
      matchedLeadIds,
      matchedResponses,
      unmatchedResponses,
    };
  })();

  return result;
}
