import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  googleSheetsConnections,
  googleSheetsTabMappings,
  projects,
} from "../db/schema.js";
import {
  extractSpreadsheetId,
  validateSpreadsheetAccess,
  getTabPreview,
  getTabData,
  getServiceAccountEmail,
} from "../services/google-sheets.js";

// ============================================================
// SCHEMAS
// ============================================================

const createConnectionSchema = z.object({
  projectId: z.string().uuid(),
  spreadsheetUrl: z
    .string()
    .url()
    .refine((url) => url.includes("docs.google.com/spreadsheets"), {
      message: "URL deve ser de uma planilha do Google Sheets",
    }),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

const tabParamSchema = z.object({
  id: z.string().uuid(),
  tabName: z.string().min(1),
});

const tabMappingItemSchema = z.object({
  tabName: z.string().min(1),
  tabType: z.enum(["leads", "survey", "sales"]),
  columnMapping: z.record(z.string(), z.string()),
});

const updateTabMappingsSchema = z.object({
  mappings: z.array(tabMappingItemSchema).min(1),
});

// ============================================================
// ROUTES
// ============================================================

export default fp(async function googleSheetsRoutes(fastify) {
  // Helper: verify admin/manager role
  function requireAdminOrManager(
    userRole: string,
    reply: { code: (c: number) => { send: (b: unknown) => unknown } }
  ) {
    if (userRole !== "admin" && userRole !== "manager") {
      reply.code(403).send({ error: "Acesso negado" });
      return false;
    }
    return true;
  }

  // ---- POST /api/google-sheets/connections ----
  fastify.post("/api/google-sheets/connections", async (request, reply) => {
    if (!requireAdminOrManager(request.userRole, reply)) return;

    const parseResult = createConnectionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: "Dados invalidos",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { projectId, spreadsheetUrl } = parseResult.data;

    // Verify project exists
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) {
      return reply.code(404).send({ error: "Projeto nao encontrado" });
    }

    // Check if project already has a connection
    const [existing] = await fastify.db
      .select({ id: googleSheetsConnections.id })
      .from(googleSheetsConnections)
      .where(eq(googleSheetsConnections.projectId, projectId))
      .limit(1);
    if (existing) {
      return reply
        .code(409)
        .send({ error: "Projeto ja possui uma planilha conectada" });
    }

    // Extract spreadsheet ID from URL
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return reply.code(400).send({
        error: "URL invalida — nao foi possivel extrair o ID da planilha",
      });
    }

    // Validate access via Google Sheets API
    let info;
    try {
      info = await validateSpreadsheetAccess(spreadsheetId);
    } catch (err) {
      return reply.code(400).send({
        error: "Erro ao acessar planilha",
        details: err instanceof Error ? err.message : String(err),
        serviceAccountEmail: getServiceAccountEmail(),
      });
    }

    // Insert connection
    const [connection] = await fastify.db
      .insert(googleSheetsConnections)
      .values({
        projectId,
        spreadsheetId,
        spreadsheetUrl,
        spreadsheetName: info.name,
        createdBy: request.userId,
      })
      .returning();

    return reply.code(201).send({
      id: connection.id,
      projectId: connection.projectId,
      spreadsheetId: connection.spreadsheetId,
      spreadsheetUrl: connection.spreadsheetUrl,
      spreadsheetName: connection.spreadsheetName,
      isActive: connection.isActive,
      createdAt: connection.createdAt,
      tabs: info.tabs,
    });
  });

  // ---- GET /api/google-sheets/connections/:projectId ----
  fastify.get(
    "/api/google-sheets/connections/:projectId",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = projectIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "projectId invalido" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(
          eq(googleSheetsConnections.projectId, paramResult.data.projectId)
        )
        .limit(1);

      if (!connection) {
        return reply
          .code(404)
          .send({ error: "Nenhuma planilha conectada a este projeto" });
      }

      // Fetch tab mappings
      const mappings = await fastify.db
        .select()
        .from(googleSheetsTabMappings)
        .where(eq(googleSheetsTabMappings.connectionId, connection.id));

      return {
        ...connection,
        tabMappings: mappings,
      };
    }
  );

  // ---- GET /api/google-sheets/connections/:id/available-tabs ----
  fastify.get(
    "/api/google-sheets/connections/:id/available-tabs",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      try {
        const info = await validateSpreadsheetAccess(connection.spreadsheetId);
        return { tabs: info.tabs };
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao listar abas da planilha",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- DELETE /api/google-sheets/connections/:id ----
  fastify.delete(
    "/api/google-sheets/connections/:id",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const [connection] = await fastify.db
        .select({ id: googleSheetsConnections.id })
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // CASCADE will delete tab mappings too
      await fastify.db
        .delete(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id));

      return reply.code(204).send();
    }
  );

  // ---- PUT /api/google-sheets/connections/:id/tabs ----
  fastify.put(
    "/api/google-sheets/connections/:id/tabs",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = idParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "ID invalido" });
      }

      const bodyResult = updateTabMappingsSchema.safeParse(request.body);
      if (!bodyResult.success) {
        return reply.code(400).send({
          error: "Dados invalidos",
          details: bodyResult.error.flatten().fieldErrors,
        });
      }

      // Verify connection exists
      const [connection] = await fastify.db
        .select({ id: googleSheetsConnections.id })
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // Delete existing mappings and insert new ones (replace strategy)
      await fastify.db
        .delete(googleSheetsTabMappings)
        .where(eq(googleSheetsTabMappings.connectionId, connection.id));

      const newMappings = await fastify.db
        .insert(googleSheetsTabMappings)
        .values(
          bodyResult.data.mappings.map((m) => ({
            connectionId: connection.id,
            tabName: m.tabName,
            tabType: m.tabType,
            columnMapping: m.columnMapping,
          }))
        )
        .returning();

      return newMappings;
    }
  );

  // ---- GET /api/google-sheets/connections/:id/tabs/:tabName/preview ----
  fastify.get(
    "/api/google-sheets/connections/:id/tabs/:tabName/preview",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = tabParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      try {
        const preview = await getTabPreview(
          connection.spreadsheetId,
          decodeURIComponent(paramResult.data.tabName)
        );
        return preview;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar preview da aba",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // ---- GET /api/google-sheets/connections/:id/tabs/:tabName/data ----
  fastify.get(
    "/api/google-sheets/connections/:id/tabs/:tabName/data",
    async (request, reply) => {
      if (!requireAdminOrManager(request.userRole, reply)) return;

      const paramResult = tabParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return reply.code(400).send({ error: "Parametros invalidos" });
      }

      const [connection] = await fastify.db
        .select()
        .from(googleSheetsConnections)
        .where(eq(googleSheetsConnections.id, paramResult.data.id))
        .limit(1);

      if (!connection) {
        return reply.code(404).send({ error: "Conexao nao encontrada" });
      }

      // Check if tab has a mapping
      const tabNameDecoded = decodeURIComponent(paramResult.data.tabName);
      const [mapping] = await fastify.db
        .select()
        .from(googleSheetsTabMappings)
        .where(
          and(
            eq(googleSheetsTabMappings.connectionId, connection.id),
            eq(googleSheetsTabMappings.tabName, tabNameDecoded)
          )
        )
        .limit(1);

      try {
        const data = await getTabData(
          connection.spreadsheetId,
          tabNameDecoded,
          mapping
            ? (mapping.columnMapping as Record<string, string>)
            : undefined
        );
        return data;
      } catch (err) {
        return reply.code(502).send({
          error: "Erro ao buscar dados da aba",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );
});
