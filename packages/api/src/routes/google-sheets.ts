import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelSurveys, funnels, youtubeChannels, googleAdsAccounts } from "../db/schema.js";
import { decrypt } from "../services/encryption.js";
import {
  getSheetsAccessToken,
  listSpreadsheets,
  getSpreadsheetSheets,
  readSheetData,
  clearSheetDataCache,
} from "../services/google-sheets.js";

// ============================================================
// HELPERS
// ============================================================

/** Find a refresh token from any connected Google account (YouTube or Google Ads) */
async function findGoogleRefreshToken(db: Parameters<Parameters<typeof fp>[0]>[0]["db"]): Promise<string | null> {
  // Try YouTube channels first
  const [ytCh] = await db
    .select({ enc: youtubeChannels.refreshTokenEncrypted, iv: youtubeChannels.refreshTokenIv })
    .from(youtubeChannels)
    .limit(1);
  if (ytCh) return decrypt(ytCh.enc, ytCh.iv);

  // Try Google Ads accounts
  const [gAds] = await db
    .select({ enc: googleAdsAccounts.refreshTokenEncrypted, iv: googleAdsAccounts.refreshTokenIv })
    .from(googleAdsAccounts)
    .limit(1);
  if (gAds) return decrypt(gAds.enc, gAds.iv);

  return null;
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function googleSheetsRoutes(fastify) {

  // ---- GET /api/google-sheets/spreadsheets ----
  fastify.get("/api/google-sheets/spreadsheets", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const refreshToken = await findGoogleRefreshToken(fastify.db);
    if (!refreshToken) {
      return reply.code(400).send({ error: "Nenhuma conta Google conectada. Conecte YouTube ou Google Ads primeiro." });
    }

    try {
      const accessToken = await getSheetsAccessToken(refreshToken, "sheets-list");
      const spreadsheets = await listSpreadsheets(accessToken);
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

    const refreshToken = await findGoogleRefreshToken(fastify.db);
    if (!refreshToken) return reply.code(400).send({ error: "Nenhuma conta Google conectada" });

    try {
      const accessToken = await getSheetsAccessToken(refreshToken, "sheets-detail");
      const result = await getSpreadsheetSheets(accessToken, spreadsheetId);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: "Erro ao listar abas", details: err instanceof Error ? err.message : String(err) });
    }
  });

  // ---- GET /api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/data ----
  fastify.get("/api/google-sheets/spreadsheets/:spreadsheetId/sheets/:sheetName/data", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const { spreadsheetId, sheetName } = request.params as { spreadsheetId: string; sheetName: string };

    const refreshToken = await findGoogleRefreshToken(fastify.db);
    if (!refreshToken) return reply.code(400).send({ error: "Nenhuma conta Google conectada" });

    try {
      const accessToken = await getSheetsAccessToken(refreshToken, "sheets-data");
      const data = await readSheetData(accessToken, spreadsheetId, decodeURIComponent(sheetName));
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

    // Verify funnel exists
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

    const refreshToken = await findGoogleRefreshToken(fastify.db);
    if (!refreshToken) return { totalResponses: 0, surveys: surveys.map((s) => ({ ...s, responses: 0 })), responseRate: null };

    try {
      const accessToken = await getSheetsAccessToken(refreshToken, "sheets-summary");
      let totalResponses = 0;
      const surveyDetails = [];

      for (const survey of surveys) {
        try {
          const data = await readSheetData(accessToken, survey.spreadsheetId, survey.sheetName);
          totalResponses += data.totalRows;
          surveyDetails.push({ ...survey, responses: data.totalRows });
        } catch {
          surveyDetails.push({ ...survey, responses: 0 });
        }
      }

      return { totalResponses, surveys: surveyDetails, responseRate: null };
    } catch {
      return { totalResponses: 0, surveys: surveys.map((s) => ({ ...s, responses: 0 })), responseRate: null };
    }
  });
});
