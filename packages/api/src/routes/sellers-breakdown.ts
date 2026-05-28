/**
 * Story 19.8 — Sellers Breakdown by Lead Profile.
 *
 * Cruza vendas do stage (planilha sales) com perfil/banda do lead (planilha
 * survey) via match por email. Agrega por utm_source (= nome do vendedor no
 * padrão Loyola) com distribuição de bandas (A/B/C/D/no_profile) por vendedor.
 *
 * Endpoint: GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sellers-breakdown
 */

import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageSalesSpreadsheets,
  stageLeadScoringSchemas,
  funnelSurveys,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import {
  computeLeadBandMap,
  resolvePrecomputedBandColumn,
  type LeadScoringSchema,
} from "./lead-scoring.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subtype: z.enum(["capture", "main_product", "sales"]).default("sales"),
  /** Quando `1`, response inclui `_debug` com diagnóstico de match (survey/scoring
   * encontrados, tamanho do leadBandMap, samples de emails dos 2 lados). */
  debug: z.coerce.boolean().optional(),
});

// ============================================================
// HELPERS
// ============================================================

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return parseFloat(normalized) || 0;
}

function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

const BAND_KEYS = ["A", "B", "C", "D", "no_profile"] as const;
type BandKey = (typeof BAND_KEYS)[number];

const NO_SELLER = "Sem origem";

interface SellerAgg {
  utmSource: string;
  totalSales: number;
  totalRevenue: number;
  bands: Record<BandKey, number>;
}

interface SellersBreakdownResponse {
  sellers: Array<{
    utmSource: string;
    totalSales: number;
    totalRevenue: number;
    avgTicket: number;
    dominantBand: BandKey;
    bands: Record<BandKey, number>;
    bandsPct: Record<BandKey, number>;
  }>;
  coverage: { matched: number; total: number; pct: number };
  hasScoringConfig: boolean;
  semDados: boolean;
}

function emptyResponse(reason: "no_data" | "no_scoring"): SellersBreakdownResponse {
  return {
    sellers: [],
    coverage: { matched: 0, total: 0, pct: 0 },
    hasScoringConfig: reason !== "no_scoring",
    semDados: true,
  };
}

// Empate de banda dominante: ordem A > B > C > D > no_profile (banda melhor vence).
function pickDominantBand(bands: Record<BandKey, number>): BandKey {
  let best: BandKey = "no_profile";
  let bestCount = -1;
  for (const k of BAND_KEYS) {
    const v = bands[k];
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}

// ============================================================
// ROUTE
// ============================================================

export default fp(async function sellersBreakdownRoutes(fastify) {
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

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sellers-breakdown",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(
        params.data.projectId,
        request.userId,
        request.userRole,
      );
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // Confirma stage pertence a esse funnel/projeto
      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId),
          ),
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // 1. Planilhas de venda do stage
      const salesSheets = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, query.data.subtype),
          ),
        );

      if (salesSheets.length === 0) return emptyResponse("no_data");

      // 2. Survey — busca em qualquer stage do funnel (lead scoring tipicamente
      // vive na etapa Captação Paga, não na etapa Vendas).
      // Prioridade: stage atual > qualquer stage do funnel com email mapeado.
      const fSurveys = await fastify.db
        .select()
        .from(funnelSurveys)
        .where(eq(funnelSurveys.funnelId, params.data.funnelId));

      const surveyToUse =
        fSurveys.find((s) => s.stageId === params.data.stageId && s.columnMapping?.email) ??
        fSurveys.find((s) => s.columnMapping?.email) ??
        fSurveys[0];

      // 3. Scoring schema — busca em qualquer stage do funnel.
      // Prioridade: stage atual > scoring associado ao mesmo stage da survey escolhida >
      // qualquer scoring do funnel.
      const funnelStageIds = (
        await fastify.db
          .select({ id: funnelStages.id })
          .from(funnelStages)
          .where(eq(funnelStages.funnelId, params.data.funnelId))
      ).map((r) => r.id);

      const allScoring =
        funnelStageIds.length > 0
          ? await fastify.db
              .select()
              .from(stageLeadScoringSchemas)
              .where(inArray(stageLeadScoringSchemas.stageId, funnelStageIds))
          : [];

      const scoringRow =
        allScoring.find((r) => r.stageId === params.data.stageId) ??
        (surveyToUse?.stageId
          ? allScoring.find((r) => r.stageId === surveyToUse.stageId)
          : undefined) ??
        allScoring[0];

      const scoringSchema = (scoringRow?.schemaJson ?? null) as LeadScoringSchema | null;
      const hasScoringConfig = !!surveyToUse && !!scoringSchema;

      // 3. Build lead profile map (email_lower → bandId | "no_profile")
      let leadBandMap = new Map<string, string>();
      const debugInfo: Record<string, unknown> = {
        surveyFound: !!surveyToUse,
        surveyStageId: surveyToUse?.stageId ?? null,
        surveyMatchesQueryStage: surveyToUse?.stageId === params.data.stageId,
        emailColumn: surveyToUse?.columnMapping?.email ?? null,
        faixaColumn: null as string | null,
        scoringFound: !!scoringSchema,
        scoringStageId: scoringRow?.stageId ?? null,
        bandsCount: scoringSchema?.bands?.length ?? 0,
        surveyHeaders: [] as string[],
        leadBandMapSize: 0,
        leadEmailsSample: [] as string[],
      };
      if (surveyToUse && scoringSchema) {
        try {
          const surveySheet = await readSheetData(
            surveyToUse.spreadsheetId,
            surveyToUse.sheetName,
          );
          debugInfo.surveyHeaders = surveySheet.headers;
          const emailCol = surveyToUse.columnMapping?.email;
          if (emailCol) {
            const faixaCol = resolvePrecomputedBandColumn(
              scoringSchema,
              surveyToUse.columnMapping,
            );
            debugInfo.faixaColumn = faixaCol;
            leadBandMap = computeLeadBandMap(scoringSchema, surveySheet, emailCol, faixaCol);
            debugInfo.leadBandMapSize = leadBandMap.size;
            debugInfo.leadEmailsSample = Array.from(leadBandMap.keys()).slice(0, 5);
          }
        } catch (err) {
          debugInfo.surveyReadError = err instanceof Error ? err.message : String(err);
          fastify.log.warn(
            { err, surveyId: surveyToUse.id },
            "Falha ao ler planilha de survey — segue sem leadBandMap",
          );
        }
      }

      // 4. Itera vendas, agrega por utm_source
      const startDate = query.data.startDate ? new Date(query.data.startDate + "T00:00:00") : null;
      const endDate = query.data.endDate ? new Date(query.data.endDate + "T23:59:59") : null;

      const sellerMap = new Map<string, SellerAgg>();
      const seenDedupKeys = new Set<string>();
      let totalSalesGlobal = 0;
      let matchedGlobal = 0;
      const saleEmailsSample: string[] = [];
      const saleEmailsUnmatched: string[] = [];

      for (const spreadsheet of salesSheets) {
        const mapping = spreadsheet.columnMapping as {
          email: string;
          transactionId?: string;
          valorBruto?: string;
          utm_source?: string;
          dataVenda?: string;
        };

        let sheetData;
        try {
          sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
        } catch {
          continue;
        }

        const { headers, rows } = sheetData;
        if (rows.length === 0) continue;

        const colIdx = (name: string | undefined) =>
          name ? headers.indexOf(name) : -1;

        const emailIdx = colIdx(mapping.email);
        if (emailIdx === -1) continue;

        const txIdx = colIdx(mapping.transactionId);
        const brutoIdx = colIdx(mapping.valorBruto);
        const utmSourceIdx = colIdx(mapping.utm_source);
        const dataIdx = colIdx(mapping.dataVenda);

        for (const row of rows) {
          const email = (row[emailIdx] ?? "").trim().toLowerCase();
          if (!email) continue;

          if (dataIdx !== -1 && (startDate || endDate)) {
            const dt = parseDate(row[dataIdx]);
            if (!dt) continue;
            if (startDate && dt < startDate) continue;
            if (endDate && dt > endDate) continue;
          }

          // Dedup (Story 28.4): tx_id quando preenchido, senão email
          const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
          const dedupKey = txId
            ? `${spreadsheet.id}|tx|${txId}`
            : `${spreadsheet.id}|email|${email}`;
          if (seenDedupKeys.has(dedupKey)) continue;
          seenDedupKeys.add(dedupKey);

          const bruto = parseNumber(row[brutoIdx] ?? "");
          const utmSourceRaw = utmSourceIdx >= 0 ? (row[utmSourceIdx] ?? "").trim() : "";
          const utmSource = utmSourceRaw || NO_SELLER;

          const bandId = leadBandMap.get(email);
          const bandKey: BandKey =
            bandId === "A" || bandId === "B" || bandId === "C" || bandId === "D"
              ? bandId
              : "no_profile";

          totalSalesGlobal += 1;
          if (bandKey !== "no_profile") matchedGlobal += 1;
          if (saleEmailsSample.length < 5) saleEmailsSample.push(email);
          if (bandKey === "no_profile" && saleEmailsUnmatched.length < 5) {
            saleEmailsUnmatched.push(email);
          }

          let agg = sellerMap.get(utmSource);
          if (!agg) {
            agg = {
              utmSource,
              totalSales: 0,
              totalRevenue: 0,
              bands: { A: 0, B: 0, C: 0, D: 0, no_profile: 0 },
            };
            sellerMap.set(utmSource, agg);
          }
          agg.totalSales += 1;
          agg.totalRevenue += bruto;
          agg.bands[bandKey] += 1;
        }
      }

      if (sellerMap.size === 0) return emptyResponse("no_data");

      const sellers = Array.from(sellerMap.values())
        .map((s) => {
          const avgTicket = s.totalSales > 0 ? s.totalRevenue / s.totalSales : 0;
          const bandsPct = {} as Record<BandKey, number>;
          for (const k of BAND_KEYS) {
            bandsPct[k] = s.totalSales > 0
              ? Math.round((s.bands[k] / s.totalSales) * 1000) / 10
              : 0;
          }
          return {
            utmSource: s.utmSource,
            totalSales: s.totalSales,
            totalRevenue: s.totalRevenue,
            avgTicket,
            dominantBand: pickDominantBand(s.bands),
            bands: s.bands,
            bandsPct,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      const coverage = {
        matched: matchedGlobal,
        total: totalSalesGlobal,
        pct: totalSalesGlobal > 0
          ? Math.round((matchedGlobal / totalSalesGlobal) * 1000) / 10
          : 0,
      };

      const response: SellersBreakdownResponse & { _debug?: Record<string, unknown> } = {
        sellers,
        coverage,
        hasScoringConfig,
        semDados: false,
      };
      if (query.data.debug) {
        debugInfo.saleEmailsSample = saleEmailsSample;
        debugInfo.saleEmailsUnmatched = saleEmailsUnmatched;
        debugInfo.totalSales = totalSalesGlobal;
        debugInfo.matched = matchedGlobal;
        response._debug = debugInfo;
      }
      return response;
    },
  );
});
