import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSurveys,
  type SheetData,
} from "@/lib/hooks/use-google-sheets";
import {
  SURVEY_QUESTION_MAP,
  SURVEY_UTM_CONTENT_MATCHERS,
  SURVEY_UTM_SOURCE_MATCHERS,
  SURVEY_EMAIL_MATCHERS,
  SURVEY_PHONE_MATCHERS,
  type SurveyQuestionKey,
} from "@/lib/constants/survey-questions";
import { normalizeAnswer, mostCommonRaw, normalizeEmail, getLast8DigitsPhone, normalizeNumericId } from "@/lib/utils/normalize-answer";
import { PAID_SOURCES } from "@/lib/utils/funnel-metrics";
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

export type SurveyOrigin = "total" | "pago" | "organico";

export interface UseSurveyAggregationResult {
  /** Agregação total (todas as respostas) — mantida para retrocompatibilidade. */
  byQuestion: Record<SurveyQuestionKey, SurveyQuestionAggregation[]>;
  /**
   * Agregações separadas por origem da resposta (Story 21.6).
   * Uma resposta é `pago` se seu `utm_source` pertence a PAID_SOURCES
   * (match exato). Caso contrário (incluindo vazio/null), é `organico`.
   * `total` contém todas as respostas — equivalente a `byQuestion`.
   */
  byQuestionByOrigin: Record<SurveyOrigin, Record<SurveyQuestionKey, SurveyQuestionAggregation[]>>;
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
  renda_mensal: [],
};

const EMPTY_BY_QUESTION_BY_ORIGIN: Record<SurveyOrigin, Record<SurveyQuestionKey, SurveyQuestionAggregation[]>> = {
  total: EMPTY_BY_QUESTION,
  pago: EMPTY_BY_QUESTION,
  organico: EMPTY_BY_QUESTION,
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
  utmSource: number;
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
    timestamp: -1,
    utmContent: findHeaderIndex(headers, SURVEY_UTM_CONTENT_MATCHERS),
    utmSource: findHeaderIndex(headers, SURVEY_UTM_SOURCE_MATCHERS),
    email: findHeaderIndex(headers, SURVEY_EMAIL_MATCHERS),
    phone: findHeaderIndex(headers, SURVEY_PHONE_MATCHERS),
  };
}

/**
 * Classifica uma resposta como "pago" ou "organico" com base no utm_source.
 * Match exato contra PAID_SOURCES (consistente com dashboard — Story 21.6).
 * Usa como fallback o utm_source do lead matched (se existir) quando a
 * planilha de pesquisa não tem coluna de utm_source própria.
 */
function classifyOrigin(utmSource: string | undefined | null): "pago" | "organico" {
  const normalized = (utmSource ?? "").trim().toLowerCase();
  return PAID_SOURCES.has(normalized) ? "pago" : "organico";
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
  stageId?: string | null,
): UseSurveyAggregationResult {
  const apiClient = useApiClient();
  const { data: surveysData, isLoading: surveysLoading } = useFunnelSurveys(
    projectId,
    funnelId,
    stageId,
  );
  const surveys = surveysData?.surveys ?? [];

  // Carregar lista de spreadsheets para encontrar a planilha de Leads
  const { data: spreadsheetsData } = useFunnelSpreadsheets(projectId, funnelId, stageId);
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
      staleTime: 30 * 1000,
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
        byQuestionByOrigin: EMPTY_BY_QUESTION_BY_ORIGIN,
        byAdId: {},
        totalResponses: 0,
        usingFallback: false,
        isLoading,
        matchedLeadIds: new Set(),
        matchedResponses: 0,
        unmatchedResponses: 0,
      } satisfies UseSurveyAggregationResult;
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
        byQuestionByOrigin: EMPTY_BY_QUESTION_BY_ORIGIN,
        byAdId: {},
        totalResponses: 0,
        usingFallback: false,
        fallbackReason: "Sem respostas nas pesquisas vinculadas",
        isLoading: false,
        matchedLeadIds: new Set(),
        matchedResponses: 0,
        unmatchedResponses: 0,
      } satisfies UseSurveyAggregationResult;
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

    // Pesquisa NÃO usa filtro de data — sempre histórico completo
    // Meta Ads sim, mas pesquisa é sobre leads/qualificação, não sobre período de gasto
    const filteredPerSurvey: (string[][] | null)[] = [];
    for (const q of sheetQueries) {
      const data = q.data;
      if (!data) {
        filteredPerSurvey.push(null);
        continue;
      }
      // Sem filtro de data para pesquisa — sempre usa histórico completo
      filteredPerSurvey.push(data.rows);
    }

    // Fallback nunca é necessário agora (sempre histórico completo)
    const useFallback = false;

    // Processa rows efetivas: se fallback, usa dados crus; senão, usa filtrados
    // Ainda precisa ser por-survey pra respeitar os indexes de cada planilha
    const byQuestion: Record<SurveyQuestionKey, SurveyQuestionAggregation[]> = {
      faturamento: [],
      profissao: [],
      funcionarios: [],
      voce_e: [],
      renda_mensal: [],
    };
    const byAdId: SurveyDataByAdId = {};
    let totalResponses = 0;
    const matchedLeadIds = new Set<string>();

    // Story 21.6 — buckets por origem (total/pago/organico) em paralelo pra
    // evitar re-agregação custosa no componente quando o filtro muda.
    function newBuckets(): Record<SurveyQuestionKey, Map<string, { rawValues: string[]; count: number }>> {
      return {
        faturamento: new Map(),
        profissao: new Map(),
        funcionarios: new Map(),
        voce_e: new Map(),
        renda_mensal: new Map(),
      };
    }
    const bucketsByOrigin: Record<SurveyOrigin, ReturnType<typeof newBuckets>> = {
      total: newBuckets(),
      pago: newBuckets(),
      organico: newBuckets(),
    };
    const totalResponsesByOrigin: Record<SurveyOrigin, number> = {
      total: 0,
      pago: 0,
      organico: 0,
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
      const filtered = filteredPerSurvey[i];
      const effectiveRows = useFallback ? data.rows : (filtered || []);
      totalResponses += effectiveRows.length;
      const matchesBefore = matchedLeadIds.size;

      // Contar matches de leads pra cada resposta
      const emailIdx = colMap.email;
      const phoneIdx = colMap.phone;
      for (const row of effectiveRows) {
        const surveyEmail = emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : "";
        const surveyPhone = phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() : "";
        const leadMatch = findLeadMatch(surveyEmail, surveyPhone);
        if (leadMatch) {
          matchedLeadIds.add(leadMatch.leadId);
        }
      }

      console.log(`🔍 [Survey ${i}] rows: ${effectiveRows.length}, matched: ${matchedLeadIds.size - matchesBefore}/${effectiveRows.length}, emailIdx: ${emailIdx}, phoneIdx: ${phoneIdx}`);

      // Story 21.6 — agrega cada resposta em 3 buckets paralelos (total sempre;
      // pago ou organico conforme utm_source da linha). Classifica fora do loop
      // das perguntas pra evitar recomputar a origem por pergunta.
      const utmSourceIdx = colMap.utmSource;
      const rowOrigins: Array<"pago" | "organico"> = [];
      for (const row of effectiveRows) {
        const utmSource = utmSourceIdx >= 0 ? row[utmSourceIdx] : "";
        rowOrigins.push(classifyOrigin(utmSource));
      }

      // byQuestion: pra cada pergunta mapeada, agregar respostas em 3 buckets
      for (const [key, idx] of Object.entries(colMap.questions)) {
        if (idx == null || idx < 0) continue;
        const questionKey = key as SurveyQuestionKey;
        for (let r = 0; r < effectiveRows.length; r++) {
          const raw = (effectiveRows[r][idx] ?? "").trim();
          if (!raw) continue;
          const normKey = normalizeAnswer(raw);
          const origin = rowOrigins[r];
          // Incrementa no bucket total E no bucket da origem (pago ou organico)
          for (const bucketOrigin of ["total", origin] as const) {
            const bucket = bucketsByOrigin[bucketOrigin][questionKey];
            const existing = bucket.get(normKey);
            if (existing) {
              existing.rawValues.push(raw);
              existing.count += 1;
            } else {
              bucket.set(normKey, { rawValues: [raw], count: 1 });
            }
          }
        }
      }

      // Contagem de respostas por origem (usada pra calcular pct por bucket)
      for (const origin of rowOrigins) {
        totalResponsesByOrigin.total += 1;
        totalResponsesByOrigin[origin] += 1;
      }

      // byAdId: só pra faturamento + profissao
      const utmIdx = colMap.utmContent;
      if (utmIdx >= 0) {
        for (const row of effectiveRows) {
          const adId = normalizeNumericId((row[utmIdx] ?? "").trim());
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

    // Finaliza byQuestionByOrigin — converte cada bucket (total/pago/organico)
    // em Array com top-8 + "Outros". Story 21.6.
    const byQuestionByOrigin: Record<SurveyOrigin, Record<SurveyQuestionKey, SurveyQuestionAggregation[]>> = {
      total: { faturamento: [], profissao: [], funcionarios: [], voce_e: [], renda_mensal: [] },
      pago: { faturamento: [], profissao: [], funcionarios: [], voce_e: [], renda_mensal: [] },
      organico: { faturamento: [], profissao: [], funcionarios: [], voce_e: [], renda_mensal: [] },
    };
    for (const origin of ["total", "pago", "organico"] as const) {
      const buckets = bucketsByOrigin[origin];
      const denom = totalResponsesByOrigin[origin];
      for (const key of Object.keys(buckets) as SurveyQuestionKey[]) {
        const bucket = buckets[key];
        if (bucket.size === 0) continue;
        const entries = Array.from(bucket.values())
          .map((b) => ({
            label: mostCommonRaw(b.rawValues),
            count: b.count,
            pct: denom > 0 ? (b.count / denom) * 100 : 0,
          }))
          .sort((a, b) => b.count - a.count);
        if (entries.length <= 8) {
          byQuestionByOrigin[origin][key] = entries;
        } else {
          const top = entries.slice(0, 8);
          const rest = entries.slice(8);
          const restCount = rest.reduce((s, e) => s + e.count, 0);
          top.push({
            label: `Outros (${rest.length})`,
            count: restCount,
            pct: denom > 0 ? (restCount / denom) * 100 : 0,
          });
          byQuestionByOrigin[origin][key] = top;
        }
      }
    }
    // byQuestion mantém comportamento legacy (= total) pra retrocompat
    for (const key of Object.keys(byQuestion) as SurveyQuestionKey[]) {
      byQuestion[key] = byQuestionByOrigin.total[key];
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

    const matchedResponses = matchedLeadIds.size;
    const unmatchedResponses = totalResponses - matchedResponses;

    console.log("🔍 [useSurveyAggregation DEBUG]", {
      totalResponses,
      matchedLeadIds_size: matchedLeadIds.size,
      matchedResponses,
      unmatchedResponses,
      useFallback,
      sheetQueries_length: sheetQueries.length,
      allRows_length: allRows?.length,
    });

    return {
      byQuestion,
      byQuestionByOrigin,
      byAdId,
      totalResponses,
      usingFallback: useFallback,
      isLoading: false,
      matchedLeadIds,
      matchedResponses,
      unmatchedResponses,
    };
  })();

  return result;
}
