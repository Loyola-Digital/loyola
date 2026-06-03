import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageSalesSpreadsheets,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { clearSheetDataCache } from "../services/google-sheets.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const saleColumnMappingSchema = z.object({
  email: z.string().min(1),
  /** Story 28.4 */
  transactionId: z.string().optional(),
  /** Story 19.9 ext: nome do cliente e do produto pra exibir na tabela unificada */
  customerName: z.string().optional(),
  productName: z.string().optional(),
  valorBruto: z.string().optional(),
  valorLiquido: z.string().optional(),
  formaPagamento: z.string().optional(),
  canalOrigem: z.string().optional(),
  dataVenda: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
});

const createSchema = z.object({
  subtype: z.enum(["capture", "main_product", "sales"]),
  spreadsheetId: z.string().min(1),
  spreadsheetName: z.string().min(1),
  sheetName: z.string().min(1),
  columnMapping: saleColumnMappingSchema,
});

const deleteParamsSchema = paramsSchema.extend({
  subtype: z.enum(["capture", "main_product", "sales"]),
});

// ============================================================
// SHAPE
// ============================================================

function shapeRow(row: typeof stageSalesSpreadsheets.$inferSelect) {
  return {
    id: row.id,
    stageId: row.stageId,
    subtype: row.subtype as "capture" | "main_product" | "sales",
    spreadsheetId: row.spreadsheetId,
    spreadsheetName: row.spreadsheetName,
    sheetName: row.sheetName,
    columnMapping: row.columnMapping as {
      email: string;
      valorBruto?: string;
      valorLiquido?: string;
      formaPagamento?: string;
      canalOrigem?: string;
      dataVenda?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
    },
    createdAt: row.createdAt.toISOString(),
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function stageSalesSpreadsheetsRoutes(fastify) {
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
      .select({ id: funnelStages.id, stageType: funnelStages.stageType })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId)
        )
      )
      .limit(1);
    return stage ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(params.data.stageId, params.data.funnelId, params.data.projectId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const rows = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(eq(stageSalesSpreadsheets.stageId, params.data.stageId));

      return rows.map(shapeRow);
    }
  );

  // POST /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(params.data.stageId, params.data.funnelId, params.data.projectId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const bodyResult = createSchema.safeParse(request.body);
      if (!bodyResult.success)
        return reply.code(400).send({ error: "Dados inválidos", details: bodyResult.error.flatten() });

      const body = bodyResult.data;

      // Invalida cache da planilha NOVA (se já tem dado em cache de outro lugar)
      clearSheetDataCache(body.spreadsheetId, body.sheetName);

      // Subtype 'sales' permite N planilhas por stage (etapa do tipo Vendas).
      // Capture/main_product seguem comportamento de upsert (1 por subtype).
      if (body.subtype !== "sales") {
        // Pega planilha antiga pra invalidar cache dela também (caso usuário
        // esteja trocando de planilha — o cache antigo ainda retornaria dados
        // velhos por até 30s)
        const [oldSheet] = await fastify.db
          .select({ spreadsheetId: stageSalesSpreadsheets.spreadsheetId, sheetName: stageSalesSpreadsheets.sheetName })
          .from(stageSalesSpreadsheets)
          .where(
            and(
              eq(stageSalesSpreadsheets.stageId, params.data.stageId),
              eq(stageSalesSpreadsheets.subtype, body.subtype)
            )
          )
          .limit(1);
        if (oldSheet) {
          clearSheetDataCache(oldSheet.spreadsheetId, oldSheet.sheetName);
        }

        await fastify.db
          .delete(stageSalesSpreadsheets)
          .where(
            and(
              eq(stageSalesSpreadsheets.stageId, params.data.stageId),
              eq(stageSalesSpreadsheets.subtype, body.subtype)
            )
          );
      }

      const [row] = await fastify.db
        .insert(stageSalesSpreadsheets)
        .values({
          stageId: params.data.stageId,
          subtype: body.subtype,
          spreadsheetId: body.spreadsheetId,
          spreadsheetName: body.spreadsheetName,
          sheetName: body.sheetName,
          columnMapping: body.columnMapping,
        })
        .returning();

      return reply.code(201).send(shapeRow(row));
    }
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets/:subtype
  // Deleta TODAS as planilhas do subtype (legado — capture/main_product têm só 1).
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets/:subtype",
    async (request, reply) => {
      const params = deleteParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(params.data.stageId, params.data.funnelId, params.data.projectId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      await fastify.db
        .delete(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, params.data.subtype)
          )
        );

      return reply.code(204).send();
    }
  );

  // DELETE /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets/by-id/:id
  // Deleta uma planilha específica por id (necessário pra etapa Vendas que tem N).
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-spreadsheets/by-id/:id",
    async (request, reply) => {
      const byIdParamsSchema = paramsSchema.extend({ id: z.string().uuid() });
      const params = byIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const stage = await getStage(params.data.stageId, params.data.funnelId, params.data.projectId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      await fastify.db
        .delete(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.id, params.data.id),
            eq(stageSalesSpreadsheets.stageId, params.data.stageId)
          )
        );

      return reply.code(204).send();
    }
  );
});
