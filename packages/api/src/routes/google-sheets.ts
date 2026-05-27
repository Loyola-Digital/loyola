import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelSurveys, funnels } from "../db/schema.js";
import {
  listSpreadsheets,
  getSpreadsheetSheets,
  readSheetData,
  clearSheetDataCache,
  clearAllSheetDataCache,
} from "../services/google-sheets.js";

export default fp(async function googleSheetsRoutes(fastify) {

  // ---- GET /api/google-sheets/spreadsheets ----
  fastify.get("/api/google-sheets/spreadsheets", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    try {
      const spreadsheets = await listSpreadsheets();
      return { spreadsheets };
    } catch (err) {
      fastify.log.error({ err }, "[google-sheets] list spreadsheets failed");
      return reply.code(502).send({ error: "Erro ao listar planilhas", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET /api/google-sheets/spreadsheets/:spreadsheetId/sheets ----
  fastify.get("/api/google-sheets/spreadsheets/:spreadsheetId/sheets", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId } = request.params as { spreadsheetId: string };

    try {
      const result = await getSpreadsheetSheets(spreadsheetId);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao listar abas", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- POST /api/google-sheets/invalidate-cache ----
  // Limpa o cache in-memory de readSheetData. Usado pelo botão "Atualizar"
  // do dashboard pra forçar refetch de dados frescos da Google Sheets API.
  fastify.post("/api/google-sheets/invalidate-cache", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const cleared = clearAllSheetDataCache();
    fastify.log.info({ cleared }, "[google-sheets] cache invalidated");
    return { cleared };
  });

  // ---- GET /api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/data ----
  fastify.get("/api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/data", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId, sheetName } = request.params as { spreadsheetId: string; sheetName: string };

    try {
      const data = await readSheetData(spreadsheetId, decodeURIComponent(sheetName));
      return data;
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao ler dados", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET /api/projects/:projectId/funnels/:funnelId/surveys ----
  const funnelParamSchema = z.object({ projectId: z.string().uuid(), funnelId: z.string().uuid() });
  const surveyTypeSchema = z.enum(["paid", "organic"]);
  const surveyListQuerySchema = z.object({
    stageId: z.string().uuid().optional(),
    surveyType: surveyTypeSchema.optional(),
  });

  fastify.get("/api/projects/:projectId/funnels/:funnelId/surveys", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = funnelParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    const q = surveyListQuerySchema.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Query invalida" });

    const filters = [eq(funnelSurveys.funnelId, p.data.funnelId)];
    if (q.data.stageId) filters.push(eq(funnelSurveys.stageId, q.data.stageId));
    if (q.data.surveyType) filters.push(eq(funnelSurveys.surveyType, q.data.surveyType));
    const whereClause = and(...filters);

    let surveys = await fastify.db.select().from(funnelSurveys).where(whereClause);

    // Defesa em profundidade — garante isolamento entre funil/etapa/tipo
    // mesmo se o filtro SQL falhar por qualquer motivo (cache, build stale, etc).
    surveys = surveys.filter((s) => {
      if (s.funnelId !== p.data.funnelId) return false;
      if (q.data.stageId && s.stageId !== q.data.stageId) return false;
      if (q.data.surveyType && s.surveyType !== q.data.surveyType) return false;
      return true;
    });

    return { surveys };
  });

  // ---- POST /api/projects/:projectId/funnels/:funnelId/surveys ----
  // stageId opcional — quando passado, pesquisa fica escopada à stage.
  // surveyType: "paid" (padrão) ou "organic" (alunos / não captados via tráfego).
  const createSurveySchema = z.object({
    stageId: z.string().uuid().optional(),
    spreadsheetId: z.string().min(1),
    spreadsheetName: z.string().min(1),
    sheetName: z.string().min(1),
    surveyType: surveyTypeSchema.optional(),
  });

  fastify.post("/api/projects/:projectId/funnels/:funnelId/surveys", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = funnelParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    const body = createSurveySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados invalidos" });

    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)))
      .limit(1);
    if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

    const [survey] = await fastify.db
      .insert(funnelSurveys)
      .values({
        funnelId: p.data.funnelId,
        stageId: body.data.stageId ?? null,
        spreadsheetId: body.data.spreadsheetId,
        spreadsheetName: body.data.spreadsheetName,
        sheetName: body.data.sheetName,
        surveyType: body.data.surveyType ?? "paid",
      })
      .returning();

    return reply.code(201).send(survey);
  });

  // ---- DELETE /api/projects/:projectId/funnels/:funnelId/surveys/:surveyId ----
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/surveys/:surveyId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { surveyId } = request.params as { surveyId: string };

    const deleted = await fastify.db
      .delete(funnelSurveys)
      .where(eq(funnelSurveys.id, surveyId))
      .returning({ id: funnelSurveys.id });

    if (deleted.length === 0) return reply.code(404).send({ error: "Pesquisa nao encontrada" });
    return { success: true };
  });

  // ---- PATCH /api/projects/:projectId/funnels/:funnelId/surveys/:surveyId/mapping ----
  // Atualiza o columnMapping da survey: utm_*, email, phone, timestamp, questions[].
  // Substitui o mapping inteiro (não faz merge parcial).
  const surveyQuestionSchema = z.object({
    columnName: z.string().min(1),
    label: z.string().min(1),
    showInDashboard: z.boolean(),
  });
  const surveyMappingSchema = z.object({
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    timestamp: z.string().optional(),
    // Story 18.17: coluna com faixa pré-calculada do lead (A/B/C/D)
    faixa: z.string().optional(),
    questions: z.array(surveyQuestionSchema).optional(),
  });

  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/surveys/:surveyId/mapping",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const { surveyId } = request.params as { surveyId: string };
      const body = surveyMappingSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Dados invalidos", details: body.error.format() });

      const [updated] = await fastify.db
        .update(funnelSurveys)
        .set({ columnMapping: body.data })
        .where(eq(funnelSurveys.id, surveyId))
        .returning();

      if (!updated) return reply.code(404).send({ error: "Pesquisa nao encontrada" });
      return updated;
    },
  );

  // ---- POST /api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/refresh ----
  fastify.post("/api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/refresh", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId, sheetName } = request.params as { spreadsheetId: string; sheetName: string };
    clearSheetDataCache(spreadsheetId, decodeURIComponent(sheetName));
    return { success: true };
  });

  // ---- GET /api/projects/:projectId/funnels/:funnelId/surveys/summary ----
  // Aceita ?stageId=X pra agregar só as pesquisas daquela stage.
  // Aceita ?surveyType=paid|organic pra filtrar por tipo.
  fastify.get("/api/projects/:projectId/funnels/:funnelId/surveys/summary", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = funnelParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });
    const q = surveyListQuerySchema.safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Query invalida" });

    const filters = [eq(funnelSurveys.funnelId, p.data.funnelId)];
    if (q.data.stageId) filters.push(eq(funnelSurveys.stageId, q.data.stageId));
    if (q.data.surveyType) filters.push(eq(funnelSurveys.surveyType, q.data.surveyType));
    const whereClause = and(...filters);

    let surveys = await fastify.db.select().from(funnelSurveys).where(whereClause);

    // Defesa em profundidade — garante isolamento entre funil/etapa/tipo
    surveys = surveys.filter((s) => {
      if (s.funnelId !== p.data.funnelId) return false;
      if (q.data.stageId && s.stageId !== q.data.stageId) return false;
      if (q.data.surveyType && s.surveyType !== q.data.surveyType) return false;
      return true;
    });

    if (surveys.length === 0) return { totalResponses: 0, surveys: [], responseRate: null };

    let totalResponses = 0;
    const surveyDetails = [];

    for (const survey of surveys) {
      try {
        const data = await readSheetData(survey.spreadsheetId, survey.sheetName);
        totalResponses += data.totalRows;
        surveyDetails.push({ ...survey, responses: data.totalRows });
      } catch {
        surveyDetails.push({ ...survey, responses: 0 });
      }
    }

    return { totalResponses, surveys: surveyDetails, responseRate: null };
  });
});
