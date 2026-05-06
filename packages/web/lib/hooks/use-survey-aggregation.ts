import { useQueries } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useFunnelSurveys,
  type FunnelSurvey,
  type SheetData,
  type SurveyColumnMapping,
} from "@/lib/hooks/use-google-sheets";
import {
  SURVEY_QUESTION_MAP,
  SURVEY_UTM_CONTENT_MATCHERS,
  SURVEY_UTM_SOURCE_MATCHERS,
  SURVEY_EMAIL_MATCHERS,
  SURVEY_PHONE_MATCHERS,
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

/**
 * Metadata de uma pergunta dinâmica vinda do mapping da survey.
 * `key` é o nome da coluna na planilha (usado como chave em `byQuestion`).
 * `label` é o texto custom que o usuário definiu pra exibir no dashboard.
 */
export interface SurveyQuestionMeta {
  key: string;
  label: string;
}

/**
 * Legacy: top-creatives-gallery ainda usa 4 perguntas hardcoded.
 * Migração pra dinâmico fica pra story futura.
 */
export interface SurveyAdData {
  faturamento: Array<{ label: string; count: number }>;
  profissao: Array<{ label: string; count: number }>;
  funcionarios: Array<{ label: string; count: number }>;
  voce_e: Array<{ label: string; count: number }>;
}

export type SurveyDataByAdId = Record<string, SurveyAdData>;

export type SurveyOrigin = "total" | "pago" | "organico";

export interface UseSurveyAggregationResult {
  /**
   * Agregação total por pergunta. Chaves são `columnName` quando vindo de mapping
   * customizado, ou as keys legacy (`faturamento`, `profissao`, etc) quando
   * fallback pra matchers hardcoded.
   */
  byQuestion: Record<string, SurveyQuestionAggregation[]>;
  /**
   * Mesma agregação separada por origem (total/pago/organico).
   * `pago` se utm_source ∈ PAID_SOURCES, senão `organico`.
   */
  byQuestionByOrigin: Record<SurveyOrigin, Record<string, SurveyQuestionAggregation[]>>;
  /**
   * Metadata das perguntas exibidas no dashboard (key + label).
   * Vem do mapping de cada survey filtrado por `showInDashboard: true`.
   * Se nenhuma survey tem mapping, deriva das 5 perguntas legacy.
   */
  questions: SurveyQuestionMeta[];
  /** Legacy — top-creatives-gallery ainda consome */
  byAdId: SurveyDataByAdId;
  totalResponses: number;
  matchedResponses: number;
  unmatchedResponses: number;
  matchedLeadIds: Set<string>;
  isLoading: boolean;
  /** True quando alguma survey caiu em fallback pros matchers legacy. */
  usingFallback: boolean;
  fallbackReason?: string;
}

// ============================================================
// Helpers internos
// ============================================================

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/\s+/g, " ");
}

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

/**
 * Resolve o índice de uma coluna pelo nome exato (do mapping). Case-insensitive
 * e tolerante a whitespace, mas não usa fuzzy match — o nome vem do select da UI
 * que lista os headers reais.
 */
function findHeaderIndexByName(headers: string[], columnName: string | undefined): number {
  if (!columnName) return -1;
  const normalized = normalizeForMatch(columnName);
  for (let i = 0; i < headers.length; i++) {
    if (normalizeForMatch(headers[i]) === normalized) return i;
  }
  return -1;
}

interface SurveyColumnIndexes {
  /** Map de questionKey → columnIndex. questionKey é columnName (mapping custom) ou key legacy. */
  questions: Map<string, number>;
  /** Labels customizados pelo user — quando ausente, usa o columnName/legacy label. */
  questionLabels: Map<string, string>;
  timestamp: number;
  utmContent: number;
  utmSource: number;
  email: number;
  phone: number;
}

/**
 * Resolve column indexes pra UMA survey. Estratégia:
 * - Se `survey.columnMapping.questions` existe e tem itens → usa mapping custom
 *   (chaves dinâmicas, label custom).
 * - Senão → fallback pra matchers hardcoded em SURVEY_QUESTION_MAP (5 perguntas
 *   legacy: faturamento, profissao, funcionarios, voce_e, renda_mensal).
 *
 * UTMs e email/phone/timestamp seguem mesma lógica (mapping primeiro, fallback
 * pros matchers).
 */
function resolveColumnIndexes(
  headers: string[],
  mapping: SurveyColumnMapping | undefined,
): { indexes: SurveyColumnIndexes; usedFallback: boolean } {
  const questions = new Map<string, number>();
  const questionLabels = new Map<string, string>();
  let usedFallback = false;

  // Perguntas: mapping custom > fallback matchers
  const mappedQuestions = mapping?.questions?.filter((q) => q.showInDashboard) ?? [];
  if (mappedQuestions.length > 0) {
    for (const q of mappedQuestions) {
      const idx = findHeaderIndexByName(headers, q.columnName);
      if (idx >= 0) {
        questions.set(q.columnName, idx);
        questionLabels.set(q.columnName, q.label);
      }
    }
  } else {
    usedFallback = true;
    // Fallback legacy — 5 perguntas hardcoded
    for (const [key, def] of Object.entries(SURVEY_QUESTION_MAP)) {
      const idx = findHeaderIndex(headers, def.matchers);
      if (idx >= 0) {
        questions.set(key, idx);
        questionLabels.set(key, def.label);
      }
    }
  }

  // UTMs e identificadores: mapping > matcher
  const utmContent = mapping?.utm_content
    ? findHeaderIndexByName(headers, mapping.utm_content)
    : findHeaderIndex(headers, SURVEY_UTM_CONTENT_MATCHERS);
  const utmSource = mapping?.utm_source
    ? findHeaderIndexByName(headers, mapping.utm_source)
    : findHeaderIndex(headers, SURVEY_UTM_SOURCE_MATCHERS);
  const email = mapping?.email
    ? findHeaderIndexByName(headers, mapping.email)
    : findHeaderIndex(headers, SURVEY_EMAIL_MATCHERS);
  const phone = mapping?.phone
    ? findHeaderIndexByName(headers, mapping.phone)
    : findHeaderIndex(headers, SURVEY_PHONE_MATCHERS);

  return {
    indexes: {
      questions,
      questionLabels,
      timestamp: -1,
      utmContent,
      utmSource,
      email,
      phone,
    },
    usedFallback,
  };
}

function classifyOrigin(utmSource: string | undefined | null): "pago" | "organico" {
  const normalized = (utmSource ?? "").trim().toLowerCase();
  return PAID_SOURCES.has(normalized) ? "pago" : "organico";
}

// Legacy keys que `byAdId` usa — mantido pra compat com top-creatives-gallery
const LEGACY_AD_ID_KEYS = ["faturamento", "profissao", "funcionarios", "voce_e"] as const;

// ============================================================
// Hook principal
// ============================================================

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
    "paid",
  );
  const surveys: FunnelSurvey[] = surveysData?.surveys ?? [];

  // Carrega planilha de Leads pra match de respostas → leads
  const { data: spreadsheetsData } = useFunnelSpreadsheets(projectId, funnelId, stageId);
  const spreadsheets = spreadsheetsData?.spreadsheets ?? [];
  const leadsSpreadsheet = spreadsheets.find((s) => s.type === "leads");
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

  const result: UseSurveyAggregationResult = (() => {
    const emptyByQuestion: Record<string, SurveyQuestionAggregation[]> = {};
    const emptyByOrigin: Record<SurveyOrigin, Record<string, SurveyQuestionAggregation[]>> = {
      total: {},
      pago: {},
      organico: {},
    };

    if (isLoading || sheetQueries.length === 0) {
      return {
        byQuestion: emptyByQuestion,
        byQuestionByOrigin: emptyByOrigin,
        questions: [],
        byAdId: {},
        totalResponses: 0,
        usingFallback: false,
        isLoading,
        matchedLeadIds: new Set(),
        matchedResponses: 0,
        unmatchedResponses: 0,
      };
    }

    // Pré-resolve column indexes por survey
    const perSurveyIndexes = sheetQueries.map((q, i) => {
      const data = q.data;
      if (!data) return null;
      const survey = surveys[i];
      return resolveColumnIndexes(data.headers, survey.columnMapping);
    });

    // Build mapa de leads pra match
    type LeadMatch = { leadId: string; createdDate: string };
    const leadsByEmail = new Map<string, LeadMatch>();
    const leadsByPhone = new Map<string, LeadMatch>();
    if (leadsData?.rows) {
      for (let i = 0; i < leadsData.rows.length; i++) {
        const row = leadsData.rows[i];
        const email = row.named.email || "";
        const phone = row.named.phone || "";
        const createdDate = row.named.date || "";
        const leadId = String(i);

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

    // Aggregation buckets — chaves dinâmicas
    type Bucket = Map<string, { rawValues: string[]; count: number }>;
    const bucketsByOrigin: Record<SurveyOrigin, Map<string, Bucket>> = {
      total: new Map(),
      pago: new Map(),
      organico: new Map(),
    };
    const totalResponsesByOrigin: Record<SurveyOrigin, number> = {
      total: 0,
      pago: 0,
      organico: 0,
    };

    function getBucket(origin: SurveyOrigin, questionKey: string): Bucket {
      let map = bucketsByOrigin[origin].get(questionKey);
      if (!map) {
        map = new Map();
        bucketsByOrigin[origin].set(questionKey, map);
      }
      return map;
    }

    // Legacy byAdId (4 keys hardcoded — mantido pra top-creatives)
    const byAdBuckets: Record<string, Record<typeof LEGACY_AD_ID_KEYS[number], Bucket>> = {};

    let totalResponses = 0;
    const matchedLeadIds = new Set<string>();
    let anyFallback = false;

    // Coleta meta de questions (key, label) — uniao de todos os surveys
    const questionsMeta = new Map<string, string>(); // key → label

    for (let i = 0; i < sheetQueries.length; i++) {
      const data = sheetQueries[i].data;
      if (!data) continue;
      const resolved = perSurveyIndexes[i];
      if (!resolved) continue;
      const { indexes, usedFallback } = resolved;
      if (usedFallback) anyFallback = true;

      // Atualiza meta global de perguntas
      for (const [key, label] of indexes.questionLabels) {
        if (!questionsMeta.has(key)) questionsMeta.set(key, label);
      }

      const effectiveRows = data.rows;
      totalResponses += effectiveRows.length;

      // Match leads
      for (const row of effectiveRows) {
        const surveyEmail = indexes.email >= 0 ? (row[indexes.email] ?? "").trim() : "";
        const surveyPhone = indexes.phone >= 0 ? (row[indexes.phone] ?? "").trim() : "";
        const leadMatch = findLeadMatch(surveyEmail, surveyPhone);
        if (leadMatch) matchedLeadIds.add(leadMatch.leadId);
      }

      // Origem por linha (pago/organico)
      const rowOrigins: Array<"pago" | "organico"> = [];
      for (const row of effectiveRows) {
        const utmSource = indexes.utmSource >= 0 ? row[indexes.utmSource] : "";
        rowOrigins.push(classifyOrigin(utmSource));
      }

      // Aggregate por pergunta
      for (const [questionKey, columnIdx] of indexes.questions) {
        if (columnIdx < 0) continue;
        for (let r = 0; r < effectiveRows.length; r++) {
          const raw = (effectiveRows[r][columnIdx] ?? "").trim();
          if (!raw) continue;
          const normKey = normalizeAnswer(raw);
          const origin = rowOrigins[r];
          for (const bucketOrigin of ["total", origin] as const) {
            const bucket = getBucket(bucketOrigin, questionKey);
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

      // Total responses por origem
      for (const origin of rowOrigins) {
        totalResponsesByOrigin.total += 1;
        totalResponsesByOrigin[origin] += 1;
      }

      // Legacy byAdId — só funciona se os 4 questionKeys legacy existirem nos indexes
      if (indexes.utmContent >= 0) {
        for (const row of effectiveRows) {
          const adId = normalizeNumericId((row[indexes.utmContent] ?? "").trim());
          if (!adId) continue;
          const adBucket = byAdBuckets[adId] ?? {
            faturamento: new Map(),
            profissao: new Map(),
            funcionarios: new Map(),
            voce_e: new Map(),
          };
          for (const legacyKey of LEGACY_AD_ID_KEYS) {
            const qIdx = indexes.questions.get(legacyKey);
            if (qIdx == null || qIdx < 0) continue;
            const raw = (row[qIdx] ?? "").trim();
            if (!raw) continue;
            const normKey = normalizeAnswer(raw);
            const existing = adBucket[legacyKey].get(normKey);
            if (existing) {
              existing.rawValues.push(raw);
              existing.count += 1;
            } else {
              adBucket[legacyKey].set(normKey, { rawValues: [raw], count: 1 });
            }
          }
          byAdBuckets[adId] = adBucket;
        }
      }
    }

    // Finaliza byQuestionByOrigin com top-8 + Outros
    const byQuestionByOrigin: Record<SurveyOrigin, Record<string, SurveyQuestionAggregation[]>> = {
      total: {},
      pago: {},
      organico: {},
    };
    for (const origin of ["total", "pago", "organico"] as const) {
      const buckets = bucketsByOrigin[origin];
      const denom = totalResponsesByOrigin[origin];
      for (const [key, bucket] of buckets) {
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

    const byQuestion = byQuestionByOrigin.total;

    // Finaliza byAdId
    const byAdId: SurveyDataByAdId = {};
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

    const questions: SurveyQuestionMeta[] = Array.from(questionsMeta.entries()).map(
      ([key, label]) => ({ key, label }),
    );

    return {
      byQuestion,
      byQuestionByOrigin,
      questions,
      byAdId,
      totalResponses,
      usingFallback: anyFallback,
      fallbackReason: anyFallback
        ? "Pesquisa sem mapping configurado — usando detecção automática legada. Configure o mapping em Pesquisas → Mapear pra usar perguntas custom."
        : undefined,
      isLoading: false,
      matchedLeadIds,
      matchedResponses,
      unmatchedResponses,
    };
  })();

  return result;
}
