import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelSpreadsheets } from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

// ============================================================
// SCHEMAS
// ============================================================

const funnelParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const spreadsheetParamSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  id: z.string().uuid(),
});

const columnMappingSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    date: z.string().optional(),
    status: z.string().optional(),
    value: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
  })
  .refine(
    (m) => Object.values(m).some((v) => typeof v === "string" && v.trim().length > 0),
    { message: "columnMapping deve ter pelo menos um campo preenchido" },
  );

const createSpreadsheetSchema = z.object({
  label: z.string().min(1).max(255),
  type: z.enum(["leads", "sales", "custom"]),
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
  columnMapping: columnMappingSchema,
});

const updateSpreadsheetSchema = z.object({
  label: z.string().min(1).max(255).optional(),
  type: z.enum(["leads", "sales", "custom"]).optional(),
  spreadsheetId: z.string().min(1).optional(),
  spreadsheetName: z.string().min(1).optional(),
  sheetName: z.string().min(1).optional(),
  columnMapping: columnMappingSchema.optional(),
});

type ColumnMapping = z.infer<typeof columnMappingSchema>;

// ============================================================
// HELPERS
// ============================================================

function spreadsheetShape(s: typeof funnelSpreadsheets.$inferSelect) {
  return {
    id: s.id,
    funnelId: s.funnelId,
    label: s.label,
    type: s.type,
    spreadsheetId: s.spreadsheetId,
    spreadsheetName: s.spreadsheetName,
    sheetName: s.sheetName,
    columnMapping: s.columnMapping,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function funnelSpreadsheetsRoutes(fastify) {
  // Helper: ensure funnel belongs to the project
  async function getFunnelInProject(projectId: string, funnelId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id, projectId: funnels.projectId })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---- GET /api/projects/:projectId/funnels/:funnelId/spreadsheets ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/spreadsheets",
    async (request, reply) => {
      const p = funnelParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const funnel = await getFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

      const rows = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(eq(funnelSpreadsheets.funnelId, p.data.funnelId));

      return { spreadsheets: rows.map(spreadsheetShape) };
    },
  );

  // ---- POST /api/projects/:projectId/funnels/:funnelId/spreadsheets ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/spreadsheets",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = funnelParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const body = createSpreadsheetSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "Dados invalidos",
          details: body.error.flatten().fieldErrors,
        });
      }

      const funnel = await getFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

      const [created] = await fastify.db
        .insert(funnelSpreadsheets)
        .values({
          funnelId: p.data.funnelId,
          label: body.data.label,
          type: body.data.type,
          spreadsheetId: body.data.spreadsheetId,
          spreadsheetName: body.data.spreadsheetName,
          sheetName: body.data.sheetName,
          columnMapping: body.data.columnMapping,
          createdBy: request.userId!,
        })
        .returning();

      return reply.code(201).send(spreadsheetShape(created));
    },
  );

  // ---- PUT /api/projects/:projectId/funnels/:funnelId/spreadsheets/:id ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/spreadsheets/:id",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = spreadsheetParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const body = updateSpreadsheetSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "Dados invalidos",
          details: body.error.flatten().fieldErrors,
        });
      }

      const funnel = await getFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

      // Ensure the spreadsheet belongs to this funnel
      const [existing] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.id, p.data.id),
            eq(funnelSpreadsheets.funnelId, p.data.funnelId),
          ),
        )
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "Planilha nao encontrada" });

      const patch: Partial<typeof funnelSpreadsheets.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.data.label !== undefined) patch.label = body.data.label;
      if (body.data.type !== undefined) patch.type = body.data.type;
      if (body.data.spreadsheetId !== undefined) patch.spreadsheetId = body.data.spreadsheetId;
      if (body.data.spreadsheetName !== undefined) patch.spreadsheetName = body.data.spreadsheetName;
      if (body.data.sheetName !== undefined) patch.sheetName = body.data.sheetName;
      if (body.data.columnMapping !== undefined) patch.columnMapping = body.data.columnMapping;

      const [updated] = await fastify.db
        .update(funnelSpreadsheets)
        .set(patch)
        .where(eq(funnelSpreadsheets.id, p.data.id))
        .returning();

      if (!updated) return reply.code(404).send({ error: "Planilha nao encontrada" });
      return spreadsheetShape(updated);
    },
  );

  // ---- DELETE /api/projects/:projectId/funnels/:funnelId/spreadsheets/:id ----
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/spreadsheets/:id",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const p = spreadsheetParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const funnel = await getFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

      const deleted = await fastify.db
        .delete(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.id, p.data.id),
            eq(funnelSpreadsheets.funnelId, p.data.funnelId),
          ),
        )
        .returning();

      if (deleted.length === 0) return reply.code(404).send({ error: "Planilha nao encontrada" });
      return { success: true };
    },
  );

  // ---- GET /api/projects/:projectId/funnels/:funnelId/spreadsheets/:id/data ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/spreadsheets/:id/data",
    async (request, reply) => {
      const p = spreadsheetParamSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parametros invalidos" });

      const funnel = await getFunnelInProject(p.data.projectId, p.data.funnelId);
      if (!funnel) return reply.code(404).send({ error: "Funil nao encontrado" });

      const [sheet] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.id, p.data.id),
            eq(funnelSpreadsheets.funnelId, p.data.funnelId),
          ),
        )
        .limit(1);
      if (!sheet) return reply.code(404).send({ error: "Planilha nao encontrada" });

      try {
        const data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
        const mapping = (sheet.columnMapping ?? {}) as ColumnMapping;

        // Build header index map (trim + case-insensitive)
        function findCol(name: string | undefined): number {
          if (!name) return -1;
          const normalized = name.trim().toLowerCase();
          return data.headers.findIndex((h) => h.trim().toLowerCase() === normalized);
        }

        const mappingKeys = [
          "name",
          "email",
          "phone",
          "date",
          "status",
          "value",
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
        ] as const;

        const colIndex: Partial<Record<(typeof mappingKeys)[number], number>> = {};
        for (const key of mappingKeys) {
          const idx = findCol(mapping[key]);
          if (idx >= 0) colIndex[key] = idx;
        }

        // Enrich rows with named fields based on mapping
        const enrichedRows = data.rows.map((row) => {
          const named: Record<string, string> = {};
          for (const key of mappingKeys) {
            const idx = colIndex[key];
            if (idx !== undefined && idx >= 0) {
              named[key] = row[idx] ?? "";
            }
          }
          return { values: row, named };
        });

        return {
          headers: data.headers,
          rows: enrichedRows,
          mapping,
          totalRows: data.totalRows,
        };
      } catch (err) {
        fastify.log.error({ err, spreadsheetId: sheet.spreadsheetId }, "[funnel-spreadsheets] failed to read sheet");
        return reply.code(502).send({ error: "Falha ao ler planilha" });
      }
    },
  );
});
