import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { clearSheetDataCache } from "../services/google-sheets.js";

// ============================================================
// Epic 29 Story 29.1 — Perpetual Spreadsheet (1 por funil, sem stage)
// Reusa a tabela funnel_spreadsheets com type='perpetual_sales' e
// stage_id NULL. Mapper espelha o de stage_sales_spreadsheets.
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

// Story 29.11: schema espelha o tipo canônico SaleColumnMapping (shared).
// Antes faltavam `dataVenda` e `transactionId` (e havia um `date` fantasma que
// ninguém lê) — como o Zod descarta chaves não declaradas, o mapeamento de
// "Data da Venda" e "ID da Transação" era SILENCIOSAMENTE perdido no save.
// Isso impossibilitava o filtro por período (dataVenda nunca chegava ao DB) e
// causava os KPIs "all-time" inflados no dashboard do perpétuo.
const columnMappingSchema = z.object({
  email: z.string().min(1),
  transactionId: z.string().optional(),
  customerName: z.string().optional(),
  productName: z.string().optional(),
  valorBruto: z.string().optional(),
  valorLiquido: z.string().optional(),
  formaPagamento: z.string().optional(),
  canalOrigem: z.string().optional(),
  dataVenda: z.string().optional(),
  status: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
});

const platformSchema = z.enum(["kiwify", "hotmart", "other"]);

const upsertSchema = z.object({
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
  columnMapping: columnMappingSchema,
  platform: platformSchema.nullable().optional(),
});

function shapeRow(row: typeof funnelSpreadsheets.$inferSelect) {
  return {
    id: row.id,
    funnelId: row.funnelId,
    spreadsheetId: row.spreadsheetId,
    spreadsheetName: row.spreadsheetName,
    sheetName: row.sheetName,
    columnMapping: row.columnMapping as z.infer<typeof columnMappingSchema>,
    platform: (row.platform ?? null) as "kiwify" | "hotmart" | "other" | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default fp(async function perpetualSpreadsheetsRoutes(fastify) {
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

  async function getFunnel(funnelId: string, projectId: string) {
    const [funnel] = await fastify.db
      .select({ id: funnels.id })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return funnel ?? null;
  }

  // ---- GET ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [row] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      return row ? shapeRow(row) : null;
    },
  );

  // ---- POST (upsert) ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const bodyResult = upsertSchema.safeParse(request.body);
      if (!bodyResult.success)
        return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.flatten() });

      const body = bodyResult.data;

      // Invalida cache da planilha nova
      clearSheetDataCache(body.spreadsheetId, body.sheetName);

      // Se já existe planilha pra esse funil, invalida cache antigo e atualiza
      const [existing] = await fastify.db
        .select({
          id: funnelSpreadsheets.id,
          spreadsheetId: funnelSpreadsheets.spreadsheetId,
          sheetName: funnelSpreadsheets.sheetName,
        })
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      if (existing) {
        clearSheetDataCache(existing.spreadsheetId, existing.sheetName);
        const [row] = await fastify.db
          .update(funnelSpreadsheets)
          .set({
            spreadsheetId: body.spreadsheetId,
            spreadsheetName: body.spreadsheetName,
            sheetName: body.sheetName,
            columnMapping: body.columnMapping,
            platform: body.platform ?? null,
            updatedAt: new Date(),
          })
          .where(eq(funnelSpreadsheets.id, existing.id))
          .returning();
        return reply.code(200).send(shapeRow(row));
      }

      const [row] = await fastify.db
        .insert(funnelSpreadsheets)
        .values({
          funnelId: params.data.funnelId,
          stageId: null,
          label: "Vendas do Perpétuo",
          type: "perpetual_sales",
          spreadsheetId: body.spreadsheetId,
          spreadsheetName: body.spreadsheetName,
          sheetName: body.sheetName,
          columnMapping: body.columnMapping,
          platform: body.platform ?? null,
          createdBy: request.userId,
        })
        .returning();

      return reply.code(201).send(shapeRow(row));
    },
  );

  // ---- DELETE ----
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-spreadsheet",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const [existing] = await fastify.db
        .select({
          spreadsheetId: funnelSpreadsheets.spreadsheetId,
          sheetName: funnelSpreadsheets.sheetName,
        })
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        )
        .limit(1);

      if (existing) {
        clearSheetDataCache(existing.spreadsheetId, existing.sheetName);
      }

      await fastify.db
        .delete(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.funnelId, params.data.funnelId),
            eq(funnelSpreadsheets.type, "perpetual_sales"),
          ),
        );

      return reply.code(204).send();
    },
  );
});
