import { eq, and, isNotNull, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnelSurveys, funnels, publicMetricsCache } from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";

/**
 * Story 36.7 (Buraco 1): agregação da PESQUISA DE QUALIFICAÇÃO no backend —
 * réplica FIEL de `packages/web/lib/hooks/use-survey-aggregation.ts` (mesmos
 * números). Lê a(s) planilha(s) de survey do stage, classifica origem (Pago/
 * Orgânico) e agrega as respostas por pergunta (top-8 + "Outros") e por criativo
 * (utm_content → ad_id). ZERO PII — só distribuições agregadas.
 *
 * Mantém os dois modos do front: mapping custom (columnMapping.questions com
 * showInDashboard) OU fallback legado (SURVEY_QUESTION_MAP por matchers).
 */

// PAID_SOURCES — espelha funnel-metrics.ts (NÃO o PAID_UTM_SOURCES de vendas).
const PAID_SOURCES = new Set(["meta", "meta-ads", "google-ads"]);

// SURVEY_QUESTION_MAP — espelha constants/survey-questions.ts (fallback legado).
const SURVEY_QUESTION_MAP: Record<string, { matchers: string[]; label: string }> = {
  faturamento: { matchers: ["faturamento mensal", "faturamento"], label: "Faturamento mensal" },
  profissao: { matchers: ["profissão", "profissao", "ocupação", "ocupacao"], label: "Profissão" },
  funcionarios: { matchers: ["funcionários", "funcionarios", "colaboradores", "equipe"], label: "Nº de funcionários" },
  voce_e: { matchers: ["você é", "voce e", "você e"], label: "Você é" },
  renda_mensal: { matchers: ["renda mensal", "renda", "salário", "salario"], label: "Renda mensal" },
};
const UTM_CONTENT_MATCHERS = ["utm_content"];
const UTM_SOURCE_MATCHERS = ["utm_source", "utm source", "s=", "source"];
const UTM_TERM_MATCHERS = ["utm_term", "utm term", "t=", "termo"];

// Resumão v4 #2: classificação em 5 blocos (Pago Quente/Frio/Total, Orgânico,
// Total) pela regra do CLAUDE.md do gestor. Fontes pagas incluem as variantes
// vistas nas planilhas reais.
const PAID_SOURCES_TERM = new Set([
  "meta", "meta-ads", "meta_ads", "metaads", "facebook", "fb", "google", "google-ads",
]);
export type TermBucket = "pagoHot" | "pagoCold" | "pagoTotal" | "organico" | "total";
/**
 * Buckets de uma resposta (sempre inclui "total"). Regras, em ordem:
 * 1. utm_term contém hot/quente → pagoHot (+pagoTotal)
 * 2. utm_term contém cold/frio → pagoCold (+pagoTotal)
 * 3. utm_source pago sem hot/cold → só pagoTotal (por isso pagoTotal ≠ hot+cold)
 * 4. utm_source outro não-vazio OU utm_term contém captura|alunos|captacao → organico
 * 5. tudo vazio → semTrack (só "total")
 */
function classifyTermBuckets(sourceRaw: string, termRaw: string): TermBucket[] {
  const s = normalizeForMatch(sourceRaw ?? "");
  const t = normalizeForMatch(termRaw ?? "");
  const out: TermBucket[] = ["total"];
  if (t.includes("hot") || t.includes("quente")) return [...out, "pagoHot", "pagoTotal"];
  if (t.includes("cold") || t.includes("frio")) return [...out, "pagoCold", "pagoTotal"];
  if (/captura|alunos|captacao/.test(t)) return [...out, "organico"];
  if (PAID_SOURCES_TERM.has(s)) return [...out, "pagoTotal"];
  if (s) return [...out, "organico"];
  return out; // semTrack
}

// ---- utils (espelham normalize-answer.ts / use-survey-aggregation.ts) ----
function normalizeAnswer(raw: string): string {
  return raw.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
function mostCommonRaw(rawValues: string[]): string {
  if (rawValues.length === 0) return "";
  const counts = new Map<string, number>();
  for (const r of rawValues) counts.set(r, (counts.get(r) ?? 0) + 1);
  let best = rawValues[0];
  let bestCount = 0;
  for (const [r, c] of counts) if (c > bestCount) { best = r; bestCount = c; }
  return best;
}
function normalizeNumericId(id: string): string {
  const t = id.trim();
  if (t.startsWith("_") && /^\d+$/.test(t.slice(1))) return t.slice(1);
  return t;
}
/**
 * Auditoria Epic 39: byAdId deve conter SÓ ad ids reais da Meta (numéricos,
 * longos). utm_content com rótulos agregados ("org", "link_in_bio") ou macro
 * não resolvida ("{{ad.id}}") não é criativo — fica fora do byAdId.
 */
function isLikelyAdId(id: string): boolean {
  return /^\d{10,}$/.test(id);
}
function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}
function findHeaderIndex(headers: string[], matchers: string[]): number {
  const norm = headers.map(normalizeForMatch);
  const nm = matchers.map(normalizeForMatch);
  for (let i = 0; i < norm.length; i++) if (nm.some((m) => norm[i].includes(m))) return i;
  return -1;
}
function findHeaderIndexByName(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const n = normalizeForMatch(name);
  for (let i = 0; i < headers.length; i++) if (normalizeForMatch(headers[i]) === n) return i;
  return -1;
}
function classifyOrigin(utmSource: string | undefined | null): "pago" | "organico" {
  return PAID_SOURCES.has((utmSource ?? "").trim().toLowerCase()) ? "pago" : "organico";
}

type Mapping = typeof funnelSurveys.$inferSelect["columnMapping"];

interface ColumnIndexes {
  questions: Map<string, number>;
  questionLabels: Map<string, string>;
  utmContent: number;
  utmSource: number;
  utmTerm: number;
}
function resolveColumnIndexes(headers: string[], mapping: Mapping): { indexes: ColumnIndexes; usedFallback: boolean } {
  const questions = new Map<string, number>();
  const questionLabels = new Map<string, string>();
  let usedFallback = false;

  const mapped = mapping?.questions?.filter((q) => q.showInDashboard) ?? [];
  if (mapped.length > 0) {
    for (const q of mapped) {
      const idx = findHeaderIndexByName(headers, q.columnName);
      if (idx >= 0) { questions.set(q.columnName, idx); questionLabels.set(q.columnName, q.label); }
    }
  } else {
    usedFallback = true;
    for (const [key, def] of Object.entries(SURVEY_QUESTION_MAP)) {
      const idx = findHeaderIndex(headers, def.matchers);
      if (idx >= 0) { questions.set(key, idx); questionLabels.set(key, def.label); }
    }
  }
  // Story 39.7 (auditoria Tier 4.1): a coluna Faixa (lead score A→D) já existia
  // no columnMapping (Story 18.17) mas não era agregada — sem ela a Fase 9 da
  // metodologia não roda. Entra como "pergunta" extra e ganha origem/byAdId de graça.
  // Dedup SEMÂNTICO (QA jul/13): planilhas reais têm DUAS colunas de faixa (ex.:
  // pergunta "Faixa" com buracos + "Faixa 1" completa no mapping.faixa). Com
  // mapping.faixa configurado, ele é a fonte CANÔNICA — qualquer pergunta cujo
  // nome/label normalize pra "faixa" sai, e só a chave "faixa" fica.
  if (mapping?.faixa) {
    const idx = findHeaderIndexByName(headers, mapping.faixa);
    if (idx >= 0) {
      for (const key of [...questions.keys()]) {
        const label = questionLabels.get(key) ?? key;
        if (normalizeForMatch(key) === "faixa" || normalizeForMatch(label) === "faixa") {
          questions.delete(key);
          questionLabels.delete(key);
        }
      }
      questions.set("faixa", idx);
      questionLabels.set("faixa", "Faixa (lead score)");
    }
  }
  const utmContent = mapping?.utm_content ? findHeaderIndexByName(headers, mapping.utm_content) : findHeaderIndex(headers, UTM_CONTENT_MATCHERS);
  const utmSource = mapping?.utm_source ? findHeaderIndexByName(headers, mapping.utm_source) : findHeaderIndex(headers, UTM_SOURCE_MATCHERS);
  // utm_term não existe no columnMapping — detecção só por matcher.
  const utmTerm = findHeaderIndex(headers, UTM_TERM_MATCHERS);
  return { indexes: { questions, questionLabels, utmContent, utmSource, utmTerm }, usedFallback };
}

type Origin = "total" | "pago" | "organico";
export interface SurveyDist { label: string; count: number; pct: number }
export interface SurveyPayload {
  totalResponses: number;
  usingFallback: boolean;
  questions: { key: string; label: string }[];
  byQuestion: Record<string, SurveyDist[]>;
  byQuestionByOrigin: Record<Origin, Record<string, SurveyDist[]>>;
  /** Resumão v4 #2: 5 blocos (🔥 pagoHot · ❄️ pagoCold · 🟢 pagoTotal · 🟡 organico
   * · ⚪ total). ATENÇÃO: pagoTotal ≠ pagoHot + pagoCold — inclui Pago sem split. */
  byQuestionByTerm: Record<TermBucket, Record<string, SurveyDist[]>>;
  /** Denominadores (nº de respostas) de cada bloco do byQuestionByTerm. */
  termDenominators: Record<TermBucket, number>;
  byAdId: Record<string, Record<string, { label: string; count: number }[]>>;
}

/** Top-8 + "Outros (N)", igual ao front. */
function finalize(bucket: Map<string, { rawValues: string[]; count: number }>, denom: number): SurveyDist[] {
  const entries = [...bucket.values()]
    .map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count, pct: denom > 0 ? (b.count / denom) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
  if (entries.length <= 8) return entries;
  const top = entries.slice(0, 8);
  const rest = entries.slice(8);
  const restCount = rest.reduce((s, e) => s + e.count, 0);
  top.push({ label: `Outros (${rest.length})`, count: restCount, pct: denom > 0 ? (restCount / denom) * 100 : 0 });
  return top;
}

export async function computeSurveyForStage(db: Database, stageId: string): Promise<SurveyPayload | null> {
  const surveys = await db
    .select({ spreadsheetId: funnelSurveys.spreadsheetId, sheetName: funnelSurveys.sheetName, columnMapping: funnelSurveys.columnMapping })
    .from(funnelSurveys)
    .where(eq(funnelSurveys.stageId, stageId));
  if (surveys.length === 0) return null;

  type Bucket = Map<string, { rawValues: string[]; count: number }>;
  const bucketsByOrigin: Record<Origin, Map<string, Bucket>> = { total: new Map(), pago: new Map(), organico: new Map() };
  const denom: Record<Origin, number> = { total: 0, pago: 0, organico: 0 };
  const TERM_KEYS: TermBucket[] = ["pagoHot", "pagoCold", "pagoTotal", "organico", "total"];
  const bucketsByTerm: Record<TermBucket, Map<string, Bucket>> = {
    pagoHot: new Map(), pagoCold: new Map(), pagoTotal: new Map(), organico: new Map(), total: new Map(),
  };
  const termDenominators: Record<TermBucket, number> = {
    pagoHot: 0, pagoCold: 0, pagoTotal: 0, organico: 0, total: 0,
  };
  const byAdBuckets: Record<string, Map<string, Bucket>> = {};
  const questionsMeta = new Map<string, string>();
  let totalResponses = 0;
  let usingFallback = false;

  const getBucket = (origin: Origin, key: string): Bucket => {
    let m = bucketsByOrigin[origin].get(key);
    if (!m) { m = new Map(); bucketsByOrigin[origin].set(key, m); }
    return m;
  };
  const add = (bucket: Bucket, raw: string) => {
    const k = normalizeAnswer(raw);
    const e = bucket.get(k);
    if (e) { e.rawValues.push(raw); e.count += 1; } else bucket.set(k, { rawValues: [raw], count: 1 });
  };

  for (const survey of surveys) {
    let sheet: { headers: string[]; rows: string[][] };
    try {
      const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
      sheet = { headers: res.headers, rows: res.rows };
    } catch {
      continue;
    }
    const { indexes, usedFallback } = resolveColumnIndexes(sheet.headers, survey.columnMapping);
    if (usedFallback) usingFallback = true;
    for (const [key, label] of indexes.questionLabels) if (!questionsMeta.has(key)) questionsMeta.set(key, label);

    totalResponses += sheet.rows.length;
    for (const row of sheet.rows) {
      const origin = classifyOrigin(indexes.utmSource >= 0 ? row[indexes.utmSource] : "");
      denom.total += 1;
      denom[origin] += 1;
      // Resumão v4 #2: blocos por temperatura (utm_term).
      const termBuckets = classifyTermBuckets(
        indexes.utmSource >= 0 ? row[indexes.utmSource] ?? "" : "",
        indexes.utmTerm >= 0 ? row[indexes.utmTerm] ?? "" : "",
      );
      for (const tb of termBuckets) termDenominators[tb] += 1;
      for (const [qKey, colIdx] of indexes.questions) {
        if (colIdx < 0) continue;
        const raw = (row[colIdx] ?? "").trim();
        if (!raw) continue;
        add(getBucket("total", qKey), raw);
        add(getBucket(origin, qKey), raw);
        for (const tb of termBuckets) {
          let m = bucketsByTerm[tb].get(qKey);
          if (!m) { m = new Map(); bucketsByTerm[tb].set(qKey, m); }
          add(m, raw);
        }
      }
      if (indexes.utmContent >= 0) {
        const adId = normalizeNumericId((row[indexes.utmContent] ?? "").trim());
        if (adId && isLikelyAdId(adId)) {
          let perQ = byAdBuckets[adId];
          if (!perQ) { perQ = new Map(); byAdBuckets[adId] = perQ; }
          for (const [qKey, colIdx] of indexes.questions) {
            if (colIdx < 0) continue;
            const raw = (row[colIdx] ?? "").trim();
            if (!raw) continue;
            let b = perQ.get(qKey);
            if (!b) { b = new Map(); perQ.set(qKey, b); }
            add(b, raw);
          }
        }
      }
    }
  }

  const byQuestionByOrigin: Record<Origin, Record<string, SurveyDist[]>> = { total: {}, pago: {}, organico: {} };
  for (const origin of ["total", "pago", "organico"] as const) {
    for (const [key, bucket] of bucketsByOrigin[origin]) {
      if (bucket.size > 0) byQuestionByOrigin[origin][key] = finalize(bucket, denom[origin]);
    }
  }
  const byQuestionByTerm: Record<TermBucket, Record<string, SurveyDist[]>> = {
    pagoHot: {}, pagoCold: {}, pagoTotal: {}, organico: {}, total: {},
  };
  for (const tb of TERM_KEYS) {
    for (const [key, bucket] of bucketsByTerm[tb]) {
      if (bucket.size > 0) byQuestionByTerm[tb][key] = finalize(bucket, termDenominators[tb]);
    }
  }

  const byAdId: SurveyPayload["byAdId"] = {};
  for (const [adId, perQ] of Object.entries(byAdBuckets)) {
    const o: Record<string, { label: string; count: number }[]> = {};
    for (const [qKey, bucket] of perQ) {
      o[qKey] = [...bucket.values()].map((b) => ({ label: mostCommonRaw(b.rawValues), count: b.count })).sort((a, b) => b.count - a.count);
    }
    byAdId[adId] = o;
  }

  return {
    totalResponses,
    usingFallback,
    questions: [...questionsMeta.entries()].map(([key, label]) => ({ key, label })),
    byQuestion: byQuestionByOrigin.total,
    byQuestionByOrigin,
    byQuestionByTerm,
    termDenominators,
    byAdId,
  };
}

export const SURVEY_SCOPE = "survey";

export async function upsertSurveyCache(db: Database, projectId: string, stageId: string, payload: SurveyPayload): Promise<void> {
  await db
    .insert(publicMetricsCache)
    .values({ projectId, scope: SURVEY_SCOPE, key: stageId, payload, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [publicMetricsCache.projectId, publicMetricsCache.scope, publicMetricsCache.key],
      set: { payload, computedAt: new Date() },
    });
}

export interface SurveySyncSummary {
  stagesProcessed: number;
  stagesSkipped: number;
  errors: { stageId: string; error: string }[];
}

/** Job: recomputa o cache de survey para todos os stages com pesquisa conectada. */
export async function syncSurvey(
  db: Database,
  opts: { projectIds?: string[]; log?: (msg: string) => void } = {},
): Promise<SurveySyncSummary> {
  const log = opts.log ?? (() => {});
  const summary: SurveySyncSummary = { stagesProcessed: 0, stagesSkipped: 0, errors: [] };

  const baseWhere = isNotNull(funnelSurveys.stageId);
  const rows = await db
    .selectDistinct({ stageId: funnelSurveys.stageId, projectId: funnels.projectId })
    .from(funnelSurveys)
    .innerJoin(funnels, eq(funnels.id, funnelSurveys.funnelId))
    .where(
      opts.projectIds && opts.projectIds.length > 0
        ? and(baseWhere, inArray(funnels.projectId, opts.projectIds))
        : baseWhere,
    );

  for (const { stageId, projectId } of rows) {
    if (!stageId) continue;
    try {
      const payload = await computeSurveyForStage(db, stageId);
      if (!payload || payload.totalResponses === 0) {
        summary.stagesSkipped++;
        continue;
      }
      await upsertSurveyCache(db, projectId, stageId, payload);
      summary.stagesProcessed++;
      log(`[survey] stage ${stageId}: ${payload.totalResponses} respostas, ${payload.questions.length} perguntas${payload.usingFallback ? " (legado)" : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ stageId, error: msg });
      log(`[survey] ERRO stage ${stageId}: ${msg}`);
    }
  }
  return summary;
}
