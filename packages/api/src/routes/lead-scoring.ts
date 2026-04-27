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
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

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

type AnswerStatic = { value: string; points: number };
type AnswerConditional = {
  value: string;
  points_conditional: {
    if_q4_filled: number;
    if_q4_empty: number;
    rule?: string;
  };
};
type Answer = AnswerStatic | AnswerConditional;

type ScoringQuestion = {
  id: string;
  label?: string;
  new_survey_column?: string;
  weight?: number;
  max_points?: number;
  answers: Answer[];
  unmapped_default?: number;
};

type Band = {
  id: string;
  range: { min: number; max: number };
  cpl_ideal?: number;
  cpl_breakeven?: number;
  recommended_action: string;
  description?: string;
};

type LeadScoringSchema = {
  schema_version?: string;
  project?: { name?: string; ticket?: number; roas?: number; cpa_ceiling?: number };
  scoring_model?: { max_possible_score?: number; questions?: ScoringQuestion[] };
  bands?: Band[];
  cpl_ideal?: {
    global?: number;
    weighted_factor?: number;
    per_band?: Record<string, { cpl: number; breakeven: number }>;
  };
};

// ============================================================
// SCORING ALGORITHM (função pura)
// ============================================================

function normalizeText(s: string): string {
  // NFC + lowercase + trim + colapsa whitespace múltiplo (inclui NBSP)
  return s
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
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

function computeBands(
  schema: LeadScoringSchema,
  sheet: { headers: string[]; rows: string[][] },
) {
  const questions = schema.scoring_model?.questions ?? [];
  const bands = schema.bands ?? [];
  const { headers, rows } = sheet;

  // Mapa: questionId -> índice da coluna na planilha
  const colMap = new Map<string, number>();
  for (const q of questions) {
    if (!q.new_survey_column) {
      colMap.set(q.id, -1);
      continue;
    }
    const target = normalizeText(q.new_survey_column);
    const idx = headers.findIndex((h) => normalizeText(h) === target);
    colMap.set(q.id, idx);
  }
  const q4Idx = colMap.get("Q4") ?? -1;

  const bandCounts = new Map<string, number>();
  for (const b of bands) bandCounts.set(b.id, 0);
  let unclassified = 0;

  for (const row of rows) {
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
      const match = q.answers.find((a) => normalizeText(a.value) === normalizeText(answer));
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

      // Mapping headers
      const colMap = new Map<string, number>();
      for (const q of questions) {
        const target = q.new_survey_column ? normalizeText(q.new_survey_column) : "";
        const idx = target ? sheet.headers.findIndex((h) => normalizeText(h) === target) : -1;
        colMap.set(q.id, idx);
      }

      // Estatísticas por questão
      const perQuestion = questions.map((q) => {
        const idx = colMap.get(q.id) ?? -1;
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
          const match = q.answers.find(
            (a) => normalizeText(a.value) === normalizeText(answer),
          );
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
          const match = q.answers.find(
            (a) => normalizeText(a.value) === normalizeText(answer),
          );
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
      return computeBands(schema, sheetData);
    },
  );
});
