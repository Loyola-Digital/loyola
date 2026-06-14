import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageLeadScoringSchemas,
  funnelSurveys,
  funnelStages,
  funnels,
  projects,
  projectMembers,
  metaAdsAccountProjects,
  metaAdsAccounts,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { fetchCampaignInsights, fetchAllAdSetInsights, fetchAllAdInsights, decryptAccountToken } from "../services/meta-ads.js";
import { applyMetaTax } from "../utils/meta-tax.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const putBodySchema = z.object({
  surveyId: z.string().uuid().nullable().optional(),
  schemaJson: z.record(z.string(), z.unknown()),
});

// ============================================================
// TYPES (espelham o schema JSON v2 enriquecido)
// ============================================================

export type AnswerStatic = { value: string; points: number; aliases?: string[] };
export type AnswerConditional = {
  value: string;
  aliases?: string[];
  points_conditional: {
    if_q4_filled: number;
    if_q4_empty: number;
    rule?: string;
  };
};
export type Answer = AnswerStatic | AnswerConditional;

export type ScoringQuestion = {
  id: string;
  label?: string;
  new_survey_column?: string;
  /**
   * Variações do header da planilha que devem casar com a coluna desta pergunta.
   * Match é case-insensitive, accent-insensitive e ignora pontuação final
   * (`?`, `!`, `.`). O primeiro alias que existir nos headers é usado.
   */
  column_aliases?: string[];
  weight?: number;
  max_points?: number;
  answers: Answer[];
  unmapped_default?: number;
};

export type Band = {
  id: string;
  range: { min: number; max: number };
  cpl_ideal?: number;
  cpl_breakeven?: number;
  recommended_action: string;
  description?: string;
};

export type LeadScoringSchema = {
  schema_version?: string;
  project?: { name?: string; ticket?: number; roas?: number; cpa_ceiling?: number };
  scoring_model?: { max_possible_score?: number; questions?: ScoringQuestion[] };
  bands?: Band[];
  cpl_ideal?: {
    global?: number;
    weighted_factor?: number;
    per_band?: Record<string, { cpl: number; breakeven: number }>;
    conversion_rates?: Record<string, number>; // Conv.A, Conv.B, Conv.C, Conv.D (0-1)
  };
  /**
   * Story 18.17: nome da coluna na planilha que já contém a faixa pré-calculada
   * (A/B/C/D). Use quando o lead scoring é calculado FORA do app (ex: workflow n8n
   * grava a faixa na planilha). Quando setado, computeBands LÊ a célula direto e
   * pula o recálculo via scoring_model — fonte de verdade vira a planilha.
   *
   * Pode ser passado em qualquer um dos formatos abaixo (todos suportados):
   *   - precomputed_band_column: "faixa"
   *   - band_column: "faixa"          (alias)
   *   - faixa_column: "faixa"          (alias pt-BR)
   */
  precomputed_band_column?: string;
  band_column?: string;
  faixa_column?: string;
};

/**
 * Story 18.17: encontra a coluna de faixa pré-calculada.
 * Ordem de prioridade:
 *   1. schema.precomputed_band_column (JSON do scoring tab)
 *   2. schema.band_column (alias)
 *   3. schema.faixa_column (alias pt-BR)
 *   4. survey.columnMapping.faixa (Survey Mapping dialog)
 * Retorna null se nenhuma fonte configurada.
 */
export function resolvePrecomputedBandColumn(
  schema: LeadScoringSchema,
  surveyMapping: unknown,
): string | null {
  const fromSchema =
    schema.precomputed_band_column ??
    schema.band_column ??
    schema.faixa_column;
  if (fromSchema && fromSchema.trim().length > 0) return fromSchema.trim();
  const m = surveyMapping as { faixa?: string } | null | undefined;
  if (m?.faixa && m.faixa.trim().length > 0) return m.faixa.trim();
  return null;
}

/**
 * Story 18.17: classifica 1 lead lendo da coluna de faixa pré-calculada.
 * Retorna o bandId (uppercase) ou null se inválido/vazio.
 */
function classifyLeadFromPrecomputed(
  row: string[],
  faixaIdx: number,
  validBandIds: Set<string>,
): string | null {
  if (faixaIdx === -1) return null;
  const raw = (row[faixaIdx] ?? "").trim().toUpperCase();
  return raw && validBandIds.has(raw) ? raw : null;
}

function normalizeText(s: string): string {
  // NFC + lowercase + trim + colapsa whitespace múltiplo (inclui NBSP)
  return s
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

interface BandBreakdown {
  count: number;
  pct: number;
  cplFaixa: number | null;
}

interface CampaignBandRow {
  utmCampaign: string;
  campaignName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

interface CampaignBandBreakdownResponse {
  rows: CampaignBandRow[];
  semDados: boolean;
}

interface AdsetBandRow {
  utmMedium: string;
  adsetName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

interface AdsetBandBreakdownResponse {
  rows: AdsetBandRow[];
  semDados: boolean;
}

interface AdBandRow {
  utmContent: string;
  adName: string;
  spend: number;
  totalLeads: number;
  cpl: number | null;
  cplIdeal: number | null;
  bands: Record<string, BandBreakdown>;
}

interface AdBandBreakdownResponse {
  rows: AdBandRow[];
  semDados: boolean;
}
// ============================================================
// SCORING ALGORITHM (função pura)
// ============================================================

/**
 * Normalização "forte" pra match de header de planilha vs aliases do schema.
 * Remove acentos (NFD + strip combining marks), pontuação final típica
 * (`?`, `!`, `.`, `:`), colapsa whitespace e lowercase.
 *
 * Necessário porque o schema costuma listar variações tipo:
 *   "Qual é o seu nível de escolaridade?"
 *   "Qual e o seu nivel de escolaridade?"
 *   "Qual o seu nível de escolaridade?"
 * — e o header da planilha pode ter qualquer uma dessas formas.
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[?!.:;]+$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Resolve o índice da coluna na planilha para uma question:
 * 1) tenta `new_survey_column` (campo legacy de schemas antigos);
 * 2) tenta cada item de `column_aliases[]` (schema v2);
 * 3) tenta `label` como fallback.
 * Retorna `{ idx, matchedAlias }` — `matchedAlias` é o candidato exato que
 * casou (útil pra debug diagnostic). Se idx === -1, matchedAlias é null.
 */
export function findQuestionColumn(
  headers: string[],
  q: ScoringQuestion,
): { idx: number; matchedAlias: string | null } {
  const candidates: string[] = [];
  if (q.new_survey_column) candidates.push(q.new_survey_column);
  if (q.column_aliases?.length) candidates.push(...q.column_aliases);
  if (q.label) candidates.push(q.label);
  if (candidates.length === 0) return { idx: -1, matchedAlias: null };

  // 1º pass: exact normalizado (acentos/pontuação final tolerantes)
  const normalizedHeaders = headers.map(normalizeForMatch);
  for (const candidate of candidates) {
    const target = normalizeForMatch(candidate);
    const idx = normalizedHeaders.indexOf(target);
    if (idx !== -1) return { idx, matchedAlias: candidate };
  }

  // 2º pass: contains bidirecional via normalizeStrong (resolve variações
  // sutis tipo NBSP, zero-width, pontuação interna, aspas curly). Tie-break
  // pelo maior overlap — alias mais específico vence ambiguidade.
  type Cand = { idx: number; alias: string; overlap: number; len: number };
  const strongHeaders = headers.map(normalizeStrong);
  const matches: Cand[] = [];
  for (const candidate of candidates) {
    const cs = normalizeStrong(candidate);
    if (!cs) continue;
    for (let i = 0; i < strongHeaders.length; i++) {
      const hs = strongHeaders[i];
      if (!hs) continue;
      if (hs.includes(cs) || cs.includes(hs)) {
        matches.push({
          idx: i,
          alias: candidate,
          overlap: Math.min(cs.length, hs.length),
          len: cs.length,
        });
      }
    }
  }
  if (matches.length === 0) return { idx: -1, matchedAlias: null };
  matches.sort((x, y) => y.overlap - x.overlap || y.len - x.len);
  return { idx: matches[0].idx, matchedAlias: matches[0].alias };
}

/** Retorna só o índice — atalho usado pelos paths que não precisam do alias. */
function findQuestionColumnIndex(headers: string[], q: ScoringQuestion): number {
  return findQuestionColumn(headers, q).idx;
}

/**
 * Normalização "muito forte" pra fuzzy match de respostas. Remove TUDO que não
 * é alfanumérico ou espaço (incluindo `+`, `$`, `/`, `.`, vírgulas, hifens).
 * Usada no 2º pass de findAnswerMatch quando o exact normalizado falha.
 *
 * Ex.: "+R$ 20.000" → "r 20 000"
 *      "Mais de R$ 20.000" → "mais de r 20 000"
 *      "Graduação/Curso superior completo" → "graduacao curso superior completo"
 */
function normalizeStrong(s: string): string {
  return s
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Procura o `Answer` cujo `value` ou algum dos `aliases[]` casa com a resposta
 * lida da planilha.
 *
 * 1º pass: exact match via `normalizeForMatch` (acentos/pontuação final).
 * 2º pass: contains bidirecional via `normalizeStrong` (pontuação interna
 * removida) — resolve variações tipo "Graduação/Curso superior completo" vs
 * "Curso Superior completo" e "Mais de R$ 20.000" vs "+R$ 20.000". Tie-break
 * pelo maior overlap (answer mais específico vence — ex.: "completo" vs
 * "incompleto" não conflita porque o overlap difere).
 */
export function findAnswerMatch(answers: Answer[], rawValue: string): Answer | undefined {
  const target = normalizeForMatch(rawValue);

  // 1º pass: exact normalizado
  const exact = answers.find((a) => {
    if (normalizeForMatch(a.value) === target) return true;
    if (a.aliases?.length) {
      return a.aliases.some((alias) => normalizeForMatch(alias) === target);
    }
    return false;
  });
  if (exact) return exact;

  // 2º pass: contains bidirecional + tie-break por overlap (maior = mais específico)
  const targetStrong = normalizeStrong(rawValue);
  if (!targetStrong) return undefined;

  type Cand = { answer: Answer; overlap: number; len: number };
  const candidates: Cand[] = [];

  const consider = (answer: Answer, candidate: string) => {
    const c = normalizeStrong(candidate);
    if (!c) return;
    if (targetStrong.includes(c) || c.includes(targetStrong)) {
      candidates.push({
        answer,
        overlap: Math.min(c.length, targetStrong.length),
        len: c.length,
      });
    }
  };

  for (const a of answers) {
    consider(a, a.value);
    if (a.aliases?.length) {
      for (const alias of a.aliases) consider(a, alias);
    }
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((x, y) => y.overlap - x.overlap || y.len - x.len);
  return candidates[0].answer;
}

const NO_ANSWER_SENTINEL = "(sem resposta)";

// Conforme equivalence_notes do schema (Q4): NAN/vazio = "(sem resposta)".
// Células de planilha vazias devem mapear para o sentinel antes do matching.
function resolveAnswerCellValue(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (v === "" || v.toLowerCase() === "nan" || v === "-" || v === "—") {
    return NO_ANSWER_SENTINEL;
  }
  return v;
}

function isAnswerConditional(a: Answer): a is AnswerConditional {
  return (a as AnswerConditional).points_conditional !== undefined;
}

/**
 * Story 19.8: Resolve faixa por lead (chave = email lowercase normalizado).
 *
 * Estratégia idêntica a computeBands, mas em vez de agregar contagens,
 * retorna um Map<email, bandId>. Permite que consumers (ex: sellers-breakdown)
 * cruzem vendas com lead profile via email.
 *
 * Path 1 (preferred): faixa pré-calculada — lê direto da coluna A/B/C/D.
 * Path 2 (legacy): recalcula score lead-a-lead via scoring_model.
 *
 * Retorna Map vazio se: sem coluna de email, sem bandas configuradas, ou
 * sheet vazio. Caller deve tratar Map vazio como "sem perfil disponível".
 */
export function computeLeadBandMap(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  emailColumnName: string,
  faixaColumnName?: string | null,
): Map<string, string> {
  const result = new Map<string, string>();
  const { headers, rows } = sheet;
  if (!emailColumnName || rows.length === 0) return result;

  const emailIdx = headers.findIndex(
    (h) => normalizeForMatch(h) === normalizeForMatch(emailColumnName),
  );
  if (emailIdx === -1) return result;

  const bands = schema.bands ?? [];
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));
  if (validBandIds.size === 0) return result;

  // Path 1: faixa pré-calculada
  const faixaIdx = faixaColumnName
    ? headers.findIndex(
        (h) => normalizeForMatch(h) === normalizeForMatch(faixaColumnName),
      )
    : -1;
  const useDirectFaixa = faixaIdx !== -1;

  const questions = schema.scoring_model?.questions ?? [];
  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) colMap.set(q.id, findQuestionColumnIndex(headers, q));
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  for (const row of rows) {
    const email = (row[emailIdx] ?? "").trim().toLowerCase();
    if (!email) continue;

    if (useDirectFaixa) {
      const raw = (row[faixaIdx] ?? "").trim().toUpperCase();
      if (raw && validBandIds.has(raw)) result.set(email, raw);
      continue;
    }

    // Path 2: recalcula score
    let totalScore = 0;
    const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
    const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;

    for (const q of questions) {
      const colIdx = colMap.get(q.id) ?? -1;
      const fallback = q.unmapped_default ?? 0;
      if (colIdx === -1) {
        totalScore += fallback;
        continue;
      }
      const answer = resolveAnswerCellValue(row[colIdx]);
      const match = findAnswerMatch(q.answers, answer);
      if (!match) {
        totalScore += fallback;
        continue;
      }
      if (isAnswerConditional(match)) {
        const rule = match.points_conditional;
        totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
      } else {
        totalScore += match.points;
      }
    }

    let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
    if (!band) band = bands.find((b) => totalScore === b.range.max);
    if (band) result.set(email, band.id.toUpperCase());
  }

  return result;
}

function computeBands(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  /** Story 18.17: nome da coluna com faixa pré-calculada (A/B/C/D).
   * Quando passado, computeBands lê direto da célula em vez de recalcular. */
  faixaColumnName?: string | null,
) {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  // Story 18.17: se faixa pré-calculada está mapeada, encontra o índice da coluna
  const faixaIdx = faixaColumnName
    ? headers.findIndex((h) => h.trim().toLowerCase() === faixaColumnName.trim().toLowerCase())
    : -1;
  const useDirectFaixa = faixaIdx !== -1;
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));

  // Mapa: questionId -> índice da coluna na planilha (só usado no fallback)
  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) {
      colMap.set(q.id, findQuestionColumnIndex(headers, q));
    }
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  const bandCounts = new Map<string, number>();
  for (const b of bands) bandCounts.set(b.id, 0);
  let unclassified = 0;

  for (const row of rows) {
    // Path 1 (Story 18.17): faixa pré-calculada — lê direto da planilha
    if (useDirectFaixa) {
      const raw = (row[faixaIdx] ?? "").trim().toUpperCase();
      if (raw && validBandIds.has(raw)) {
        bandCounts.set(raw, (bandCounts.get(raw) ?? 0) + 1);
      } else {
        unclassified++;
      }
      continue;
    }

    // Path 2 (legacy): recalcula score do zero rodando o scoring_model no CSV
    let totalScore = 0;
    // Q4 "filled" = lead respondeu (tem funcionários). Vazio ou "(sem resposta)" = não-filled.
    const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
    const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;

    for (const q of questions) {
      const colIdx = colMap.get(q.id) ?? -1;
      const fallback = q.unmapped_default ?? 0;
      if (colIdx === -1) {
        totalScore += fallback;
        continue;
      }
      const answer = resolveAnswerCellValue(row[colIdx]);
      const match = findAnswerMatch(q.answers, answer);
      if (!match) {
        totalScore += fallback;
        continue;
      }
      if (isAnswerConditional(match)) {
        const rule = match.points_conditional;
        totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
      } else {
        totalScore += match.points;
      }
    }

    // Classificar (range: min <= score < max). Caso especial pra última banda inclusiva.
    let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
    if (!band) {
      band = bands.find((b) => totalScore === b.range.max);
    }
    if (band) {
      bandCounts.set(band.id, (bandCounts.get(band.id) ?? 0) + 1);
    } else {
      unclassified++;
    }
  }

  const total = rows.length;
  const totalScored = total - unclassified;
  const perBand = schema.cpl_ideal?.per_band ?? {};

  const bandResults = bands.map((b) => {
    const count = bandCounts.get(b.id) ?? 0;
    const cpl = perBand[b.id]?.cpl ?? b.cpl_ideal ?? null;
    const breakeven = perBand[b.id]?.breakeven ?? b.cpl_breakeven ?? null;
    return {
      id: b.id,
      description: b.description ?? "",
      leads_scored: count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      cpl_ideal: cpl,
      cpl_breakeven: breakeven,
      recommended_action: b.recommended_action,
    };
  });

  return {
    project: schema.project ?? null,
    total_leads_scored: totalScored,
    unclassified,
    bands: bandResults,
    cpl_global: schema.cpl_ideal?.global ?? null,
    semDados: false as const,
  };
}

// ============================================================
// UTM TERM PARSER (Epic Lead Scoring Origins)
// ============================================================
//
// Exemplo de utm_term observado:
//   Instagram_Feed_dg-pg02-abr-26--vendas-captacao--2026-04-18—cold--cbo--estaticos - estatico
//
// Heurísticas (não estruturais — robustas a variações):
//   placement   = primeiro padrão tipo "X_Y" (ex: Instagram_Feed, Facebook_Stories)
//   temperatura = match (cold | hot | warm)
//   estrategia  = match (cbo | abo)
//   criativo    = match (estaticos | videos[-...] | imagens | carrossel | reels[-...])

interface ParsedUtmTerm {
  placement: string | null;
  temperatura: string | null;
  estrategia: string | null;
  criativo: string | null;
}

function parseUtmTerm(raw: string): ParsedUtmTerm {
  const t = (raw ?? "").trim();
  if (!t) return { placement: null, temperatura: null, estrategia: null, criativo: null };

  // Normaliza separadores especiais (em-dash, en-dash) pra hyphen-hyphen
  const normalized = t.replace(/—/g, "--").replace(/–/g, "--");
  const lower = normalized.toLowerCase();

  // Placement: primeiro padrão "Word_Word" (ex: Instagram_Feed)
  const placementMatch = normalized.match(/([A-Za-z]+_[A-Za-z]+)/);
  const placement = placementMatch ? placementMatch[1] : null;

  const tempMatch = lower.match(/\b(cold|hot|warm)\b/);
  const temperatura = tempMatch ? tempMatch[1] : null;

  const stratMatch = lower.match(/\b(cbo|abo)\b/);
  const estrategia = stratMatch ? stratMatch[1] : null;

  const creativeMatch = lower.match(/\b(estatico[s]?|videos?[-\w]*|reels?[-\w]*|imagen[s]?|carrossel\w*)\b/);
  const criativo = creativeMatch ? creativeMatch[1] : null;

  return { placement, temperatura, estrategia, criativo };
}

interface DimensionCount {
  name: string;
  count: number;
}

interface BandOriginBreakdown {
  bandId: string;
  bandDescription: string;
  total: number;
  byPlacement: DimensionCount[];
  byTemperatura: DimensionCount[];
  byEstrategia: DimensionCount[];
  byCriativo: DimensionCount[];
  topUtmTerms: DimensionCount[];
  /** Quantos leads desta banda têm utm_term vazio/ausente */
  withoutTerm: number;
}

function findUtmTermColumn(headers: string[]): number {
  // Detecta coluna utm_term automaticamente — case-insensitive, várias variações
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (h === "utm_term" || h === "utm term" || h === "term" || h.endsWith("_term") || h.includes("utm_term")) {
      return i;
    }
  }
  return -1;
}

function findUtmCampaignColumn(headers: string[]): number {
  // Detecta coluna utm_campaign automaticamente — case-insensitive, várias variações
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (h === "utm_campaign" || h === "utm campaign" || h === "campaign" || h.endsWith("_campaign") || h.includes("utm_campaign")) {
      return i;
    }
  }
  return -1;
}

function findUtmSourceColumn(headers: string[]): number {
  // Detecta coluna utm_source automaticamente — case-insensitive, várias variações
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (h === "utm_source" || h === "utm source" || h === "source" || h.endsWith("_source") || h.includes("utm_source")) {
      return i;
    }
  }
  return -1;
}

function aggregateDimension(
  termsByBand: Map<string, string[]>,
  bandId: string,
  pick: (parsed: ParsedUtmTerm) => string | null,
): DimensionCount[] {
  const counts = new Map<string, number>();
  for (const term of termsByBand.get(bandId) ?? []) {
    const parsed = parseUtmTerm(term);
    const v = pick(parsed);
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function computeOriginsByBand(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  /** Story 18.17: nome da coluna com faixa pré-calculada */
  faixaColumnName?: string | null,
): { byBand: Record<string, BandOriginBreakdown>; semDados: false } {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  const utmTermIdx = findUtmTermColumn(headers);

  // Story 18.17: detecta coluna de faixa pré-calculada
  const faixaIdx = faixaColumnName
    ? headers.findIndex((h) => h.trim().toLowerCase() === faixaColumnName.trim().toLowerCase())
    : -1;
  const useDirectFaixa = faixaIdx !== -1;
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));

  // Reusa o mapeamento de colunas do scoring (só usado no fallback de recálculo)
  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) {
      colMap.set(q.id, findQuestionColumnIndex(headers, q));
    }
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  // Pra cada banda, lista de utm_terms (vazios entram como "")
  const termsByBand = new Map<string, string[]>();
  const withoutTermByBand = new Map<string, number>();
  for (const b of bands) {
    termsByBand.set(b.id, []);
    withoutTermByBand.set(b.id, 0);
  }

  for (const row of rows) {
    // Path 1 (Story 18.17): faixa pré-calculada — pula recálculo do score
    let bandId: string | null = null;
    if (useDirectFaixa) {
      const raw = (row[faixaIdx] ?? "").trim().toUpperCase();
      if (raw && validBandIds.has(raw)) bandId = raw;
    } else {
      // Path 2 (legacy): recalcula via scoring_model
      let totalScore = 0;
      const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
      const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;
      for (const q of questions) {
        const colIdx = colMap.get(q.id) ?? -1;
        const fallback = q.unmapped_default ?? 0;
        if (colIdx === -1) { totalScore += fallback; continue; }
        const answer = resolveAnswerCellValue(row[colIdx]);
        const match = findAnswerMatch(q.answers, answer);
        if (!match) { totalScore += fallback; continue; }
        if (isAnswerConditional(match)) {
          const rule = match.points_conditional;
          totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
        } else {
          totalScore += match.points;
        }
      }
      let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
      if (!band) band = bands.find((b) => totalScore === b.range.max);
      bandId = band?.id ?? null;
    }

    if (!bandId) continue; // unclassified — skip

    const term = utmTermIdx === -1 ? "" : (row[utmTermIdx] ?? "").trim();
    if (term) {
      termsByBand.get(bandId)!.push(term);
    } else {
      withoutTermByBand.set(bandId, (withoutTermByBand.get(bandId) ?? 0) + 1);
    }
  }

  // Agrega por banda
  const byBand: Record<string, BandOriginBreakdown> = {};
  for (const b of bands) {
    const terms = termsByBand.get(b.id) ?? [];
    const utmCounts = new Map<string, number>();
    for (const t of terms) utmCounts.set(t, (utmCounts.get(t) ?? 0) + 1);
    const topUtmTerms = Array.from(utmCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b2) => b2.count - a.count)
      .slice(0, 20);

    byBand[b.id] = {
      bandId: b.id,
      bandDescription: b.description ?? "",
      total: terms.length + (withoutTermByBand.get(b.id) ?? 0),
      byPlacement: aggregateDimension(termsByBand, b.id, (p) => p.placement),
      byTemperatura: aggregateDimension(termsByBand, b.id, (p) => p.temperatura),
      byEstrategia: aggregateDimension(termsByBand, b.id, (p) => p.estrategia),
      byCriativo: aggregateDimension(termsByBand, b.id, (p) => p.criativo),
      topUtmTerms,
      withoutTerm: withoutTermByBand.get(b.id) ?? 0,
    };
  }

  return { byBand, semDados: false };
}

async function computeCampaignBandBreakdown(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  campaignInsights: { campaign_id: string; campaign_name: string; spend: string }[] | null,
  faixaColumnName?: string | null,
): Promise<CampaignBandBreakdownResponse> {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  const utmCampaignIdx = findUtmCampaignColumn(headers);
  const utmSourceIdx = findUtmSourceColumn(headers);

  if (utmCampaignIdx === -1 || utmSourceIdx === -1) {
    return { rows: [], semDados: true };
  }

  // Story 18.17: faixa pré-calculada (skipa recálculo)
  const faixaIdx = faixaColumnName
    ? headers.findIndex((h) => h.trim().toLowerCase() === faixaColumnName.trim().toLowerCase())
    : -1;
  const useDirectFaixa = faixaIdx !== -1;
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));

  // Mapeamento de colunas (só pro fallback de recálculo)
  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) {
      if (!q.new_survey_column) {
        colMap.set(q.id, -1);
        continue;
      }
      const target = normalizeText(q.new_survey_column);
      const idx = headers.findIndex((h) => normalizeText(h) === target);
      colMap.set(q.id, idx);
    }
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  // Estrutura: Map<utm_campaign, Map<bandId, count>>
  // Apenas leads com utm_source = "meta" (case-insensitive)
  const leadsByUtmCampaignBand = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const utmSource = (row[utmSourceIdx] ?? "").trim();
    const utmCampaign = (row[utmCampaignIdx] ?? "").trim();

    // Filtrar: apenas utm_source = "meta"
    if (normalizeText(utmSource) !== normalizeText("meta")) {
      continue;
    }

    if (!utmCampaign) continue;

    // Path 1 (Story 18.17): faixa pré-calculada
    let bandId: string | null = null;
    if (useDirectFaixa) {
      bandId = classifyLeadFromPrecomputed(row, faixaIdx, validBandIds);
    } else {
      // Path 2 (legacy): recalcula via scoring_model
      let totalScore = 0;
      const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
      const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;
      for (const q of questions) {
        const colIdx = colMap.get(q.id) ?? -1;
        const fallback = q.unmapped_default ?? 0;
        if (colIdx === -1) { totalScore += fallback; continue; }
        const answer = resolveAnswerCellValue(row[colIdx]);
        const match = q.answers.find((a) => normalizeText(a.value) === normalizeText(answer));
        if (!match) { totalScore += fallback; continue; }
        if (isAnswerConditional(match)) {
          const rule = match.points_conditional;
          totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
        } else {
          totalScore += match.points;
        }
      }
      let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
      if (!band) band = bands.find((b) => totalScore === b.range.max);
      bandId = band?.id ?? null;
    }

    if (!bandId) continue;

    if (!leadsByUtmCampaignBand.has(utmCampaign)) {
      leadsByUtmCampaignBand.set(utmCampaign, new Map());
    }
    const bandCounts = leadsByUtmCampaignBand.get(utmCampaign)!;
    bandCounts.set(bandId, (bandCounts.get(bandId) ?? 0) + 1);
  }

  // Map campaign_id (from Meta Ads) → { campaign_name, spend }
  // utm_campaign in spreadsheet is the campaign_id from Meta Ads
  const campaignDataByCampaignId = new Map<string, { campaign_name: string; spend: number }>();
  if (campaignInsights) {
    for (const insight of campaignInsights) {
      const spend = applyMetaTax(parseFloat(insight.spend || "0"), new Date().toISOString().slice(0, 10)); // imposto Meta 12,15% (2026+)
      const existing = campaignDataByCampaignId.get(insight.campaign_id);
      if (existing) {
        existing.spend += spend;
      } else {
        campaignDataByCampaignId.set(insight.campaign_id, {
          campaign_name: insight.campaign_name,
          spend,
        });
      }
    }
  }

  // Build response rows
  const rows_data: CampaignBandRow[] = [];
  for (const [utmCampaign, bandCounts] of leadsByUtmCampaignBand) {
    const totalLeads = Array.from(bandCounts.values()).reduce((a, b) => a + b, 0);

    // utm_campaign is campaign_id from Meta Ads
    // Look up campaign_name and spend using campaign_id (utm_campaign) as key
    const campaignData = campaignDataByCampaignId.get(utmCampaign);
    const campaignName = campaignData?.campaign_name ?? utmCampaign; // Fallback to utm_campaign if not found
    const spend = campaignData?.spend ?? 0;

    const cpl = totalLeads > 0 ? spend / totalLeads : null;

    // CPL Ideal = (Ticket / ROAS) × Fator de conversão ponderado
    // Fator = Conv.A × %A + Conv.B × %B + Conv.C × %C + Conv.D × %D
    let cplIdeal: number | null = null;
    const project = schema.project;
    const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};

    if (project?.ticket && project?.roas && project.roas > 0) {
      const ticketPerRoas = project.ticket / project.roas; // Usually = 2
      let ponderatedFactor = 0;

      for (const band of bands) {
        const convRate = conversionRates[band.id] ?? 0;
        const bandPct = (bandCounts.get(band.id) ?? 0) / Math.max(totalLeads, 1);
        ponderatedFactor += convRate * bandPct;
      }

      cplIdeal = ticketPerRoas * ponderatedFactor;
    }

    const bandBreakdown: Record<string, BandBreakdown> = {};
    for (const band of bands) {
      const count = bandCounts.get(band.id) ?? 0;
      const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
      const cplFaixa = count > 0 ? spend / count : null;
      bandBreakdown[band.id] = { count, pct, cplFaixa };
    }

    rows_data.push({
      utmCampaign,
      campaignName, // Meta Ads campaign_name, não utm_campaign
      spend,
      totalLeads,
      cpl,
      cplIdeal,
      bands: bandBreakdown,
    });
  }

  // Group by campaign name (consolidate duplicates)
  const groupedByName = new Map<string, CampaignBandRow>();
  for (const row of rows_data) {
    const existing = groupedByName.get(row.campaignName);
    if (existing) {
      existing.spend += row.spend;
      existing.totalLeads += row.totalLeads;
      existing.cpl = existing.totalLeads > 0 ? existing.spend / existing.totalLeads : null;
      for (const band of bands) {
        const bandId = band.id;
        const count = (row.bands[bandId]?.count ?? 0) + (existing.bands[bandId]?.count ?? 0);
        const pct = existing.totalLeads > 0 ? (count / existing.totalLeads) * 100 : 0;
        const cplFaixa = count > 0 ? existing.spend / count : null;
        existing.bands[bandId] = { count, pct, cplFaixa };
      }
      // Recalculate CPL Ideal with aggregated data
      let cplIdeal: number | null = null;
      const project = schema.project;
      const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};
      if (project?.ticket && project?.roas && project.roas > 0) {
        const ticketPerRoas = project.ticket / project.roas;
        let ponderatedFactor = 0;
        for (const band of bands) {
          const convRate = conversionRates[band.id] ?? 0;
          const bandPct = (existing.bands[band.id]?.count ?? 0) / Math.max(existing.totalLeads, 1);
          ponderatedFactor += convRate * bandPct;
        }
        cplIdeal = ticketPerRoas * ponderatedFactor;
      }
      existing.cplIdeal = cplIdeal;
    } else {
      groupedByName.set(row.campaignName, row);
    }
  }

  const finalRows = Array.from(groupedByName.values());
  // Sort by total leads descending
  finalRows.sort((a, b) => b.totalLeads - a.totalLeads);

  return { rows: finalRows, semDados: finalRows.length === 0 };
}

function findUtmMediumColumn(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (h === "utm_medium" || h === "utm medium" || h === "medium" || h.endsWith("_medium") || h.includes("utm_medium")) {
      return i;
    }
  }
  return -1;
}

function findUtmContentColumn(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? "").toLowerCase().trim();
    if (h === "utm_content" || h === "utm content" || h === "content" || h.endsWith("_content") || h.includes("utm_content")) {
      return i;
    }
  }
  return -1;
}

async function computeAdsetBandBreakdown(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  adsetInsights: { adset_id: string; adset_name: string; spend: string }[] | null,
  faixaColumnName?: string | null,
): Promise<AdsetBandBreakdownResponse> {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  const utmMediumIdx = findUtmMediumColumn(headers);
  const utmSourceIdx = findUtmSourceColumn(headers);

  if (utmMediumIdx === -1 || utmSourceIdx === -1) {
    return { rows: [], semDados: true };
  }

  const faixaIdx = faixaColumnName
    ? headers.findIndex((h) => h.trim().toLowerCase() === faixaColumnName.trim().toLowerCase())
    : -1;
  const useDirectFaixa = faixaIdx !== -1;
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));

  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) {
      if (!q.new_survey_column) {
        colMap.set(q.id, -1);
        continue;
      }
      const target = normalizeText(q.new_survey_column);
      const idx = headers.findIndex((h) => normalizeText(h) === target);
      colMap.set(q.id, idx);
    }
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  const leadsByUtmMediumBand = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const utmSource = (row[utmSourceIdx] ?? "").trim();
    const utmMedium = (row[utmMediumIdx] ?? "").trim();

    if (normalizeText(utmSource) !== normalizeText("meta")) {
      continue;
    }

    if (!utmMedium) continue;

    let bandId: string | null = null;
    if (useDirectFaixa) {
      bandId = classifyLeadFromPrecomputed(row, faixaIdx, validBandIds);
    } else {
      let totalScore = 0;
      const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
      const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;
      for (const q of questions) {
        const colIdx = colMap.get(q.id) ?? -1;
        const fallback = q.unmapped_default ?? 0;
        if (colIdx === -1) { totalScore += fallback; continue; }
        const answer = resolveAnswerCellValue(row[colIdx]);
        const match = q.answers.find((a) => normalizeText(a.value) === normalizeText(answer));
        if (!match) { totalScore += fallback; continue; }
        if (isAnswerConditional(match)) {
          const rule = match.points_conditional;
          totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
        } else {
          totalScore += match.points;
        }
      }
      let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
      if (!band) band = bands.find((b) => totalScore === b.range.max);
      bandId = band?.id ?? null;
    }

    if (!bandId) continue;

    if (!leadsByUtmMediumBand.has(utmMedium)) {
      leadsByUtmMediumBand.set(utmMedium, new Map());
    }
    const bandCounts = leadsByUtmMediumBand.get(utmMedium)!;
    bandCounts.set(bandId, (bandCounts.get(bandId) ?? 0) + 1);
  }

  const adsetDataByAdsetId = new Map<string, { adset_name: string; spend: number }>();
  if (adsetInsights) {
    for (const insight of adsetInsights) {
      const spend = applyMetaTax(parseFloat(insight.spend || "0"), new Date().toISOString().slice(0, 10)); // imposto Meta 12,15% (2026+)
      const existing = adsetDataByAdsetId.get(insight.adset_id);
      if (existing) {
        existing.spend += spend;
      } else {
        adsetDataByAdsetId.set(insight.adset_id, {
          adset_name: insight.adset_name,
          spend,
        });
      }
    }
  }

  const rows_data: AdsetBandRow[] = [];
  for (const [utmMedium, bandCounts] of leadsByUtmMediumBand) {
    const totalLeads = Array.from(bandCounts.values()).reduce((a, b) => a + b, 0);

    const adsetData = adsetDataByAdsetId.get(utmMedium);
    const adsetName = adsetData?.adset_name ?? utmMedium;
    const spend = adsetData?.spend ?? 0;

    const cpl = totalLeads > 0 ? spend / totalLeads : null;

    let cplIdeal: number | null = null;
    const project = schema.project;
    const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};

    if (project?.ticket && project?.roas && project.roas > 0) {
      const ticketPerRoas = project.ticket / project.roas;
      let ponderatedFactor = 0;

      for (const band of bands) {
        const convRate = conversionRates[band.id] ?? 0;
        const bandPct = (bandCounts.get(band.id) ?? 0) / Math.max(totalLeads, 1);
        ponderatedFactor += convRate * bandPct;
      }

      cplIdeal = ticketPerRoas * ponderatedFactor;
    }

    const bandBreakdown: Record<string, BandBreakdown> = {};
    for (const band of bands) {
      const count = bandCounts.get(band.id) ?? 0;
      const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
      const cplFaixa = count > 0 ? spend / count : null;
      bandBreakdown[band.id] = { count, pct, cplFaixa };
    }

    rows_data.push({
      utmMedium,
      adsetName,
      spend,
      totalLeads,
      cpl,
      cplIdeal,
      bands: bandBreakdown,
    });
  }

  // Group by adset name (consolidate duplicates)
  const groupedByName = new Map<string, AdsetBandRow>();
  for (const row of rows_data) {
    const existing = groupedByName.get(row.adsetName);
    if (existing) {
      existing.spend += row.spend;
      existing.totalLeads += row.totalLeads;
      existing.cpl = existing.totalLeads > 0 ? existing.spend / existing.totalLeads : null;
      for (const band of bands) {
        const bandId = band.id;
        const count = (row.bands[bandId]?.count ?? 0) + (existing.bands[bandId]?.count ?? 0);
        const pct = existing.totalLeads > 0 ? (count / existing.totalLeads) * 100 : 0;
        const cplFaixa = count > 0 ? existing.spend / count : null;
        existing.bands[bandId] = { count, pct, cplFaixa };
      }
      // Recalculate CPL Ideal with aggregated data
      let cplIdeal: number | null = null;
      const project = schema.project;
      const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};
      if (project?.ticket && project?.roas && project.roas > 0) {
        const ticketPerRoas = project.ticket / project.roas;
        let ponderatedFactor = 0;
        for (const band of bands) {
          const convRate = conversionRates[band.id] ?? 0;
          const bandPct = (existing.bands[band.id]?.count ?? 0) / Math.max(existing.totalLeads, 1);
          ponderatedFactor += convRate * bandPct;
        }
        cplIdeal = ticketPerRoas * ponderatedFactor;
      }
      existing.cplIdeal = cplIdeal;
    } else {
      groupedByName.set(row.adsetName, row);
    }
  }

  const finalRows = Array.from(groupedByName.values());
  finalRows.sort((a, b) => b.totalLeads - a.totalLeads);

  return { rows: finalRows, semDados: finalRows.length === 0 };
}

async function computeAdBandBreakdown(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
  adInsights: { ad_id: string; ad_name: string; spend: string }[] | null,
  faixaColumnName?: string | null,
): Promise<AdBandBreakdownResponse> {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  const utmContentIdx = findUtmContentColumn(headers);
  const utmSourceIdx = findUtmSourceColumn(headers);

  if (utmContentIdx === -1 || utmSourceIdx === -1) {
    return { rows: [], semDados: true };
  }

  const faixaIdx = faixaColumnName
    ? headers.findIndex((h) => h.trim().toLowerCase() === faixaColumnName.trim().toLowerCase())
    : -1;
  const useDirectFaixa = faixaIdx !== -1;
  const validBandIds = new Set(bands.map((b) => b.id.toUpperCase()));

  const colMap = new Map<string, number>();
  if (!useDirectFaixa) {
    for (const q of questions) {
      if (!q.new_survey_column) {
        colMap.set(q.id, -1);
        continue;
      }
      const target = normalizeText(q.new_survey_column);
      const idx = headers.findIndex((h) => normalizeText(h) === target);
      colMap.set(q.id, idx);
    }
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  const leadsByUtmContentBand = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const utmSource = (row[utmSourceIdx] ?? "").trim();
    const utmContent = (row[utmContentIdx] ?? "").trim();

    if (normalizeText(utmSource) !== normalizeText("meta")) {
      continue;
    }

    if (!utmContent) continue;

    let bandId: string | null = null;
    if (useDirectFaixa) {
      bandId = classifyLeadFromPrecomputed(row, faixaIdx, validBandIds);
    } else {
      let totalScore = 0;
      const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
      const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;
      for (const q of questions) {
        const colIdx = colMap.get(q.id) ?? -1;
        const fallback = q.unmapped_default ?? 0;
        if (colIdx === -1) { totalScore += fallback; continue; }
        const answer = resolveAnswerCellValue(row[colIdx]);
        const match = q.answers.find((a) => normalizeText(a.value) === normalizeText(answer));
        if (!match) { totalScore += fallback; continue; }
        if (isAnswerConditional(match)) {
          const rule = match.points_conditional;
          totalScore += q4Filled ? rule.if_q4_filled : rule.if_q4_empty;
        } else {
          totalScore += match.points;
        }
      }
      let band = bands.find((b) => totalScore >= b.range.min && totalScore < b.range.max);
      if (!band) band = bands.find((b) => totalScore === b.range.max);
      bandId = band?.id ?? null;
    }

    if (!bandId) continue;

    if (!leadsByUtmContentBand.has(utmContent)) {
      leadsByUtmContentBand.set(utmContent, new Map());
    }
    const bandCounts = leadsByUtmContentBand.get(utmContent)!;
    bandCounts.set(bandId, (bandCounts.get(bandId) ?? 0) + 1);
  }

  const adDataByAdId = new Map<string, { ad_name: string; spend: number }>();
  if (adInsights) {
    for (const insight of adInsights) {
      const spend = applyMetaTax(parseFloat(insight.spend || "0"), new Date().toISOString().slice(0, 10)); // imposto Meta 12,15% (2026+)
      const existing = adDataByAdId.get(insight.ad_id);
      if (existing) {
        existing.spend += spend;
      } else {
        adDataByAdId.set(insight.ad_id, {
          ad_name: insight.ad_name,
          spend,
        });
      }
    }
  }

  const rows_data: AdBandRow[] = [];
  for (const [utmContent, bandCounts] of leadsByUtmContentBand) {
    const totalLeads = Array.from(bandCounts.values()).reduce((a, b) => a + b, 0);

    const adData = adDataByAdId.get(utmContent);
    const adName = adData?.ad_name ?? utmContent;
    const spend = adData?.spend ?? 0;

    const cpl = totalLeads > 0 ? spend / totalLeads : null;

    let cplIdeal: number | null = null;
    const project = schema.project;
    const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};

    if (project?.ticket && project?.roas && project.roas > 0) {
      const ticketPerRoas = project.ticket / project.roas;
      let ponderatedFactor = 0;

      for (const band of bands) {
        const convRate = conversionRates[band.id] ?? 0;
        const bandPct = (bandCounts.get(band.id) ?? 0) / Math.max(totalLeads, 1);
        ponderatedFactor += convRate * bandPct;
      }

      cplIdeal = ticketPerRoas * ponderatedFactor;
    }

    const bandBreakdown: Record<string, BandBreakdown> = {};
    for (const band of bands) {
      const count = bandCounts.get(band.id) ?? 0;
      const pct = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
      const cplFaixa = count > 0 ? spend / count : null;
      bandBreakdown[band.id] = { count, pct, cplFaixa };
    }

    rows_data.push({
      utmContent,
      adName,
      spend,
      totalLeads,
      cpl,
      cplIdeal,
      bands: bandBreakdown,
    });
  }

  // Group by ad name (consolidate duplicates)
  const groupedByName = new Map<string, AdBandRow>();
  for (const row of rows_data) {
    const existing = groupedByName.get(row.adName);
    if (existing) {
      existing.spend += row.spend;
      existing.totalLeads += row.totalLeads;
      existing.cpl = existing.totalLeads > 0 ? existing.spend / existing.totalLeads : null;
      for (const band of bands) {
        const bandId = band.id;
        const count = (row.bands[bandId]?.count ?? 0) + (existing.bands[bandId]?.count ?? 0);
        const pct = existing.totalLeads > 0 ? (count / existing.totalLeads) * 100 : 0;
        const cplFaixa = count > 0 ? existing.spend / count : null;
        existing.bands[bandId] = { count, pct, cplFaixa };
      }
      // Recalculate CPL Ideal with aggregated data
      let cplIdeal: number | null = null;
      const project = schema.project;
      const conversionRates = schema.cpl_ideal?.conversion_rates ?? {};
      if (project?.ticket && project?.roas && project.roas > 0) {
        const ticketPerRoas = project.ticket / project.roas;
        let ponderatedFactor = 0;
        for (const band of bands) {
          const convRate = conversionRates[band.id] ?? 0;
          const bandPct = (existing.bands[band.id]?.count ?? 0) / Math.max(existing.totalLeads, 1);
          ponderatedFactor += convRate * bandPct;
        }
        cplIdeal = ticketPerRoas * ponderatedFactor;
      }
      existing.cplIdeal = cplIdeal;
    } else {
      groupedByName.set(row.adName, row);
    }
  }

  const finalRows = Array.from(groupedByName.values());
  finalRows.sort((a, b) => b.totalLeads - a.totalLeads);

  return { rows: finalRows, semDados: finalRows.length === 0 };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function leadScoringRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  async function getStage(stageId: string, funnelId: string, projectId: string) {
    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return stage ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [row] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      return row ?? null;
    },
  );

  // PUT /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = putBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Body inválido" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const now = new Date();
      const [row] = await fastify.db
        .insert(stageLeadScoringSchemas)
        .values({
          stageId: params.data.stageId,
          surveyId: body.data.surveyId ?? null,
          schemaJson: body.data.schemaJson,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: stageLeadScoringSchemas.stageId,
          set: {
            surveyId: body.data.surveyId ?? null,
            schemaJson: body.data.schemaJson,
            updatedAt: now,
          },
        })
        .returning();

      return reply.code(200).send(row);
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/debug
  // Diagnóstico: headers, mapping de colunas, % matched/unmapped por questão, leads sample.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/debug",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);
      if (!scoringRow || !scoringRow.surveyId) {
        return reply.code(404).send({ error: "Schema ou survey não configurado" });
      }

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);
      if (!survey) return reply.code(404).send({ error: "Survey não encontrado" });

      const sheet = await readSheetData(survey.spreadsheetId, survey.sheetName);
      const schema = scoringRow.schemaJson as LeadScoringSchema;
      const questions = schema.scoring_model?.questions ?? [];

      // Mapping headers — guarda alias matchado pra debug
      const colMap = new Map<string, number>();
      const aliasMap = new Map<string, string | null>();
      for (const q of questions) {
        const resolved = findQuestionColumn(sheet.headers, q);
        colMap.set(q.id, resolved.idx);
        aliasMap.set(q.id, resolved.matchedAlias);
      }

      // Estatísticas por questão
      const perQuestion = questions.map((q) => {
        const idx = colMap.get(q.id) ?? -1;
        const matchedAlias = aliasMap.get(q.id) ?? null;
        const matchedAnswers = new Map<string, number>();
        const unmappedAnswers = new Map<string, number>();
        let matchedCount = 0;
        let unmappedCount = 0;
        for (const row of sheet.rows) {
          if (idx === -1) {
            unmappedCount++;
            continue;
          }
          const answer = resolveAnswerCellValue(row[idx]);
          const match = findAnswerMatch(q.answers, answer);
          if (match) {
            matchedCount++;
            matchedAnswers.set(answer, (matchedAnswers.get(answer) ?? 0) + 1);
          } else {
            unmappedCount++;
            unmappedAnswers.set(answer, (unmappedAnswers.get(answer) ?? 0) + 1);
          }
        }
        return {
          id: q.id,
          label: q.label,
          new_survey_column: q.new_survey_column,
          matched_alias: matchedAlias,
          column_index: idx,
          column_found: idx !== -1,
          matched_count: matchedCount,
          unmapped_count: unmappedCount,
          unmapped_default: q.unmapped_default ?? 0,
          unmapped_unique_values: Array.from(unmappedAnswers.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([value, count]) => ({ value, count })),
        };
      });

      // Sample de 5 leads com breakdown
      const q4Idx = colMap.get("Q4") ?? -1;
      const sampleSize = Math.min(5, sheet.rows.length);
      const sample: unknown[] = [];
      for (let i = 0; i < sampleSize; i++) {
        const row = sheet.rows[i];
        const q4Raw = q4Idx === -1 ? "" : (row[q4Idx] ?? "").trim();
        const q4Filled = q4Raw !== "" && q4Raw.toLowerCase() !== NO_ANSWER_SENTINEL;
        let total = 0;
        const breakdown = questions.map((q) => {
          const idx = colMap.get(q.id) ?? -1;
          if (idx === -1) {
            total += q.unmapped_default ?? 0;
            return { id: q.id, raw: null, points: q.unmapped_default ?? 0, matched: false };
          }
          const answer = resolveAnswerCellValue(row[idx]);
          const match = findAnswerMatch(q.answers, answer);
          if (!match) {
            total += q.unmapped_default ?? 0;
            return { id: q.id, raw: answer, points: q.unmapped_default ?? 0, matched: false };
          }
          let pts: number;
          if (isAnswerConditional(match)) {
            pts = q4Filled ? match.points_conditional.if_q4_filled : match.points_conditional.if_q4_empty;
          } else {
            pts = match.points;
          }
          total += pts;
          return { id: q.id, raw: answer, points: pts, matched: true };
        });
        sample.push({ row_idx: i, q4_filled: q4Filled, total_score: total, breakdown });
      }

      return {
        sheet_info: {
          spreadsheet_id: survey.spreadsheetId,
          sheet_name: survey.sheetName,
          total_rows: sheet.rows.length,
          total_headers: sheet.headers.length,
        },
        headers: sheet.headers,
        per_question: perQuestion,
        sample_leads: sample,
      };
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/origins
  // Retorna breakdown de origem (utm_term parseado) dos leads agrupados por banda.
  // Útil pra ver de onde os leads "A" estão vindo: placement, temperatura, criativo, etc.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/origins",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const EMPTY_ORIGINS = { byBand: {} as Record<string, BandOriginBreakdown>, semDados: true as const };

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      if (!scoringRow || !scoringRow.surveyId) return EMPTY_ORIGINS;

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);

      if (!survey) return EMPTY_ORIGINS;

      let sheetData: { headers: string[]; rows: string[][] };
      try {
        const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
        sheetData = { headers: res.headers, rows: res.rows };
      } catch {
        return EMPTY_ORIGINS;
      }

      if (sheetData.rows.length === 0) return EMPTY_ORIGINS;

      const schema = scoringRow.schemaJson as LeadScoringSchema;
      const faixaCol = resolvePrecomputedBandColumn(schema, survey.columnMapping);
      return computeOriginsByBand(schema, sheetData, faixaCol);
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/results
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/results",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const EMPTY = {
        project: null,
        total_leads_scored: 0,
        unclassified: 0,
        bands: [],
        cpl_global: null,
        semDados: true as const,
      };

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      if (!scoringRow || !scoringRow.surveyId) return EMPTY;

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);

      if (!survey) return EMPTY;

      let sheetData: { headers: string[]; rows: string[][] };
      try {
        const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
        sheetData = { headers: res.headers, rows: res.rows };
      } catch {
        return EMPTY;
      }

      if (sheetData.rows.length === 0) return EMPTY;

      const schema = scoringRow.schemaJson as LeadScoringSchema;
      // Story 18.17: prioriza coluna de faixa pré-calculada (n8n grava na planilha).
      // Fontes em ordem: 1) JSON do scoring (precomputed_band_column / band_column /
      // faixa_column), 2) survey.columnMapping.faixa (dialog Mapping).
      const faixaCol = resolvePrecomputedBandColumn(schema, survey.columnMapping);
      return computeBands(schema, sheetData, faixaCol);
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/campaign-breakdown?days=30
  // Breakdown de leads por campanha (via utm_campaign) × banda de scoring (A/B/C/D)
  // Cruzamento: utm_campaign da planilha → campaign_name do Meta Ads API
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/campaign-breakdown",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const EMPTY = { rows: [], semDados: true };

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      if (!scoringRow || !scoringRow.surveyId) return EMPTY;

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);

      if (!survey) return EMPTY;

      let sheetData: { headers: string[]; rows: string[][] };
      try {
        const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
        sheetData = { headers: res.headers, rows: res.rows };
      } catch {
        return EMPTY;
      }

      if (sheetData.rows.length === 0) return EMPTY;

      // Get Meta Ads account linked to this project (if exists)
      let campaignInsights: { campaign_id: string; campaign_name: string; spend: string }[] | null = null;

      try {
        const [accountLink] = await fastify.db
          .select()
          .from(metaAdsAccountProjects)
          .where(eq(metaAdsAccountProjects.projectId, params.data.projectId))
          .limit(1);

        if (accountLink) {
          const [account] = await fastify.db
            .select()
            .from(metaAdsAccounts)
            .where(eq(metaAdsAccounts.id, accountLink.accountId))
            .limit(1);

          if (account) {
            const decryptedToken = decryptAccountToken(
              account.accessTokenEncrypted,
              account.accessTokenIv,
            );

            try {
              const insights = await fetchCampaignInsights(
                account.metaAccountId,
                decryptedToken,
                query.data.days,
              );
              // Map insights to format used by computeCampaignBandBreakdown
              campaignInsights = insights.map((i) => ({
                campaign_id: i.campaign_id,
                campaign_name: i.campaign_name,
                spend: i.spend ?? "0",
              }));
            } catch {
              // If campaign insights fetch fails, continue without spend data
              campaignInsights = null;
            }
          }
        }
      } catch {
        // If database lookup fails, continue without campaign spend data
        campaignInsights = null;
      }

      const schema = scoringRow.schemaJson as LeadScoringSchema;
      const faixaCol = resolvePrecomputedBandColumn(schema, survey.columnMapping);
      return computeCampaignBandBreakdown(schema, sheetData, campaignInsights, faixaCol);
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/adset-breakdown?days=30
  // Breakdown de leads por adset (via utm_medium) × banda de scoring (A/B/C/D)
  // Cruzamento: utm_medium da planilha → adset_name do Meta Ads API
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/adset-breakdown",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const EMPTY = { rows: [], semDados: true };

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      if (!scoringRow || !scoringRow.surveyId) return EMPTY;

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);

      if (!survey) return EMPTY;

      let sheetData: { headers: string[]; rows: string[][] };
      try {
        const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
        sheetData = { headers: res.headers, rows: res.rows };
      } catch {
        return EMPTY;
      }

      if (sheetData.rows.length === 0) return EMPTY;

      // Get Meta Ads account linked to this project (if exists)
      let adsetInsights: { adset_id: string; adset_name: string; spend: string }[] | null = null;

      try {
        const [accountLink] = await fastify.db
          .select()
          .from(metaAdsAccountProjects)
          .where(eq(metaAdsAccountProjects.projectId, params.data.projectId))
          .limit(1);

        if (accountLink) {
          const [account] = await fastify.db
            .select()
            .from(metaAdsAccounts)
            .where(eq(metaAdsAccounts.id, accountLink.accountId))
            .limit(1);

          if (account) {
            const decryptedToken = decryptAccountToken(
              account.accessTokenEncrypted,
              account.accessTokenIv,
            );

            try {
              const insights = await fetchAllAdSetInsights(
                account.metaAccountId,
                decryptedToken,
                query.data.days,
              );
              adsetInsights = insights.map((i: { adset_id: string; adset_name: string; spend?: string }) => ({
                adset_id: i.adset_id,
                adset_name: i.adset_name,
                spend: i.spend ?? "0",
              }));
            } catch {
              adsetInsights = null;
            }
          }
        }
      } catch {
        adsetInsights = null;
      }

      const schema = scoringRow.schemaJson as LeadScoringSchema;
      const faixaCol = resolvePrecomputedBandColumn(schema, survey.columnMapping);
      return computeAdsetBandBreakdown(schema, sheetData, adsetInsights, faixaCol);
    },
  );

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/ad-breakdown?days=30
  // Breakdown de leads por ad (via utm_content) × banda de scoring (A/B/C/D)
  // Cruzamento: utm_content da planilha → ad_name do Meta Ads API
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-scoring/ad-breakdown",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(
        params.data.stageId,
        params.data.funnelId,
        params.data.projectId,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const EMPTY = { rows: [], semDados: true };

      const [scoringRow] = await fastify.db
        .select()
        .from(stageLeadScoringSchemas)
        .where(eq(stageLeadScoringSchemas.stageId, params.data.stageId))
        .limit(1);

      if (!scoringRow || !scoringRow.surveyId) return EMPTY;

      const [survey] = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.id, scoringRow.surveyId))
        .limit(1);

      if (!survey) return EMPTY;

      let sheetData: { headers: string[]; rows: string[][] };
      try {
        const res = await readSheetData(survey.spreadsheetId, survey.sheetName);
        sheetData = { headers: res.headers, rows: res.rows };
      } catch {
        return EMPTY;
      }

      if (sheetData.rows.length === 0) return EMPTY;

      // Get Meta Ads account linked to this project (if exists)
      let adInsights: { ad_id: string; ad_name: string; spend: string }[] | null = null;

      try {
        const [accountLink] = await fastify.db
          .select()
          .from(metaAdsAccountProjects)
          .where(eq(metaAdsAccountProjects.projectId, params.data.projectId))
          .limit(1);

        if (accountLink) {
          const [account] = await fastify.db
            .select()
            .from(metaAdsAccounts)
            .where(eq(metaAdsAccounts.id, accountLink.accountId))
            .limit(1);

          if (account) {
            const decryptedToken = decryptAccountToken(
              account.accessTokenEncrypted,
              account.accessTokenIv,
            );

            try {
              const insights = await fetchAllAdInsights(
                account.metaAccountId,
                decryptedToken,
                query.data.days,
              );
              adInsights = insights.map((i: { ad_id: string; ad_name: string; spend?: string }) => ({
                ad_id: i.ad_id,
                ad_name: i.ad_name,
                spend: i.spend ?? "0",
              }));
            } catch {
              adInsights = null;
            }
          }
        }
      } catch {
        adInsights = null;
      }

      const schema = scoringRow.schemaJson as LeadScoringSchema;
      const faixaCol = resolvePrecomputedBandColumn(schema, survey.columnMapping);
      return computeAdBandBreakdown(schema, sheetData, adInsights, faixaCol);
    },
  );
});
