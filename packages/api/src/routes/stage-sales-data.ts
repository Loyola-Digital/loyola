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
import { readSheetData } from "../services/google-sheets.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  subtype: z.enum(["capture", "main_product"]).default("capture"),
  days: z.coerce.number().int().positive().optional(),
});

// ============================================================
// HELPERS
// ============================================================

function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = val.trim();
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const dt = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

const EMPTY_RESPONSE = {
  totalVendas: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  ticketMedioBruto: 0,
  ticketMedioLiquido: 0,
  porCanal: [] as { canal: string; vendas: number; bruto: number; liquido: number }[],
  porFormaPagamento: [] as { forma: string; vendas: number; bruto: number; liquido: number }[],
  semDados: true,
};

// ============================================================
// ROUTE
// ============================================================

export default fp(async function stageSalesDataRoutes(fastify) {
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

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/sales-data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [stage] = await fastify.db
        .select({ id: funnelStages.id, stageType: funnelStages.stageType })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      if (stage.stageType !== "paid") {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      const [spreadsheet] = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, query.data.subtype)
          )
        )
        .limit(1);

      if (!spreadsheet) {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      const mapping = spreadsheet.columnMapping as {
        email: string;
        valorBruto?: string;
        valorLiquido?: string;
        formaPagamento?: string;
        canalOrigem?: string;
        dataVenda?: string;
      };

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      const { headers, rows } = sheetData;

      if (rows.length === 0) {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      function colIdx(fieldName: string | undefined): number {
        if (!fieldName) return -1;
        return headers.indexOf(fieldName);
      }

      const emailIdx = colIdx(mapping.email);
      const brutoIdx = colIdx(mapping.valorBruto);
      const liquidoIdx = colIdx(mapping.valorLiquido);
      const formaIdx = colIdx(mapping.formaPagamento);
      const canalIdx = colIdx(mapping.canalOrigem);
      const dataIdx = colIdx(mapping.dataVenda);

      if (emailIdx === -1) {
        return { ...EMPTY_RESPONSE, semDados: true };
      }

      let cutoffDate: Date | null = null;
      if (query.data.days && dataIdx !== -1) {
        cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - query.data.days);
      }

      const emailMap = new Map<
        string,
        { bruto: number; liquido: number; forma: string; canal: string; lastDate: Date | null }
      >();

      for (const row of rows) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;

        if (cutoffDate && dataIdx !== -1) {
          const dt = parseDate(row[dataIdx]);
          if (!dt || dt < cutoffDate) continue;
        }

        const bruto = parseNumber(row[brutoIdx] ?? "");
        const liquido = parseNumber(row[liquidoIdx] ?? "");
        const forma = (row[formaIdx] ?? "Não informado").trim() || "Não informado";
        const canal = (row[canalIdx] ?? "Não informado").trim() || "Não informado";
        const rowDate = dataIdx !== -1 ? parseDate(row[dataIdx]) : null;

        const existing = emailMap.get(email);
        if (existing) {
          existing.bruto += bruto;
          existing.liquido += liquido;
          if (rowDate && (!existing.lastDate || rowDate > existing.lastDate)) {
            existing.forma = forma;
            existing.canal = canal;
            existing.lastDate = rowDate;
          }
        } else {
          emailMap.set(email, { bruto, liquido, forma, canal, lastDate: rowDate });
        }
      }

      if (emailMap.size === 0) {
        return { ...EMPTY_RESPONSE, semDados: false };
      }

      let totalBruto = 0;
      let totalLiquido = 0;
      const canalMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const formaMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();

      for (const { bruto, liquido, forma, canal } of emailMap.values()) {
        totalBruto += bruto;
        totalLiquido += liquido;

        const canalEntry = canalMap.get(canal) ?? { vendas: 0, bruto: 0, liquido: 0 };
        canalEntry.vendas += 1;
        canalEntry.bruto += bruto;
        canalEntry.liquido += liquido;
        canalMap.set(canal, canalEntry);

        const formaEntry = formaMap.get(forma) ?? { vendas: 0, bruto: 0, liquido: 0 };
        formaEntry.vendas += 1;
        formaEntry.bruto += bruto;
        formaEntry.liquido += liquido;
        formaMap.set(forma, formaEntry);
      }

      const totalVendas = emailMap.size;

      return {
        totalVendas,
        faturamentoBruto: totalBruto,
        faturamentoLiquido: totalLiquido,
        ticketMedioBruto: totalVendas > 0 ? totalBruto / totalVendas : 0,
        ticketMedioLiquido: totalVendas > 0 ? totalLiquido / totalVendas : 0,
        porCanal: Array.from(canalMap.entries())
          .map(([canal, v]) => ({ canal, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        porFormaPagamento: Array.from(formaMap.entries())
          .map(([forma, v]) => ({ forma, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        semDados: false,
      };
    }
  );
});
