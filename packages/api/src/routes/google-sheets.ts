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

  fastify.get("/api/projects/:projectId/funnels/:funnelId/surveys", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = funnelParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

    const surveys = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(eq(funnelSurveys.funnelId, p.data.funnelId));

    return { surveys };
  });

  // ---- POST /api/projects/:projectId/funnels/:funnelId/surveys ----
  const createSurveySchema = z.object({
    spreadsheetId: z.string().min(1),
    spreadsheetName: z.string().min(1),
    sheetName: z.string().min(1),
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
      .values({ funnelId: p.data.funnelId, ...body.data })
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

  // ---- POST /api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/refresh ----
  fastify.post("/api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/refresh", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId, sheetName } = request.params as { spreadsheetId: string; sheetName: string };
    clearSheetDataCache(spreadsheetId, decodeURIComponent(sheetName));
    return { success: true };
  });

  // ---- GET /api/projects/:projectId/funnels/:funnelId/surveys/summary ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/surveys/summary", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const p = funnelParamSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

    const surveys = await fastify.db
      .select()
      .from(funnelSurveys)
      .where(eq(funnelSurveys.funnelId, p.data.funnelId));

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
