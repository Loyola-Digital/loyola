import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelSpreadsheets,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "../services/sales-status.js";
import { computeUpsellCrossSell, type HtPurchase } from "../services/upsell-crosssell.js";

// ============================================================
// Epic 29 Story 29.22 — Cross-sell Upsell High Ticket do perpétuo.
// Cruza a planilha de vendas do perpétuo (perpetual_sales) com a de
// upsell high ticket (perpetual_upsell) por EMAIL. Uma compra HT conta
// como upsell quando existe ao menos UMA compra perpétua ANTES dela
// (data HT > data da 1ª compra perpétua). Reembolsos saem dos dois lados.
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

// ---- helpers (mesmo padrão de perpetual-sales-data) ----
function parseNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
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

type SheetMapping = {
  email: string;
  transactionId?: string;
  customerName?: string;
  valorBruto?: string;
  dataVenda?: string;
  status?: string;
};

const EMPTY = {
  basePerpetuo: 0,
  upsells: 0,
  upsellTransacoes: 0,
  taxaUpsell: 0,
  faturamentoHighTicket: 0,
  ticketMedioHighTicket: 0,
  compradores: [] as {
    email: string;
    nome: string | null;
    dataPerpetuo: string | null;
    dataHighTicket: string | null;
    valorHighTicket: number;
    comprasHighTicket: number;
  }[],
  semPerpetuo: false,
  semUpsell: false,
  semDados: true,
};

export default fp(async function perpetualUpsellDataRoutes(fastify) {
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

  async function loadSheet(funnelId: string, type: "perpetual_sales" | "perpetual_upsell") {
    const [row] = await fastify.db
      .select()
      .from(funnelSpreadsheets)
      .where(and(eq(funnelSpreadsheets.funnelId, funnelId), eq(funnelSpreadsheets.type, type)))
      .limit(1);
    return row ?? null;
  }

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual-upsell/data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const perpSheet = await loadSheet(params.data.funnelId, "perpetual_sales");
      const upsellSheet = await loadSheet(params.data.funnelId, "perpetual_upsell");
      if (!perpSheet) return { ...EMPTY, semPerpetuo: true };
      if (!upsellSheet) return { ...EMPTY, semUpsell: true };

      // ---- lê o perpétuo: base de compradores + 1ª data por email (excl. reembolso) ----
      const perpMap = perpSheet.columnMapping as SheetMapping;
      const perpetualEmails = new Set<string>();
      const earliestPerpByEmail = new Map<string, Date>();
      try {
        const { headers, rows } = await readSheetData(perpSheet.spreadsheetId, perpSheet.sheetName);
        const idx = (f?: string) => (f ? headers.indexOf(f) : -1);
        const emailI = idx(perpMap.email);
        const dataI = idx(perpMap.dataVenda);
        const statusI = idx(perpMap.status);
        const hasStatus = statusI !== -1;
        if (emailI !== -1) {
          for (const row of rows) {
            const email = (row[emailI] ?? "").trim().toLowerCase();
            if (!email) continue;
            if (hasStatus && isRefundBucket(classifyRefundStatus(row[statusI], true))) continue;
            perpetualEmails.add(email);
            const dt = dataI !== -1 ? parseDate(row[dataI]) : null;
            if (dt) {
              const cur = earliestPerpByEmail.get(email);
              if (!cur || dt < cur) earliestPerpByEmail.set(email, dt);
            }
          }
        }
      } catch {
        return { ...EMPTY, semDados: true };
      }

      // ---- lê o high ticket: monta as compras (deduped, sem reembolso) ----
      const htMap = upsellSheet.columnMapping as SheetMapping;
      const htPurchases: HtPurchase[] = [];
      try {
        const { headers, rows } = await readSheetData(upsellSheet.spreadsheetId, upsellSheet.sheetName);
        const idx = (f?: string) => (f ? headers.indexOf(f) : -1);
        const emailI = idx(htMap.email);
        const txI = idx(htMap.transactionId);
        const brutoI = idx(htMap.valorBruto);
        const dataI = idx(htMap.dataVenda);
        const statusI = idx(htMap.status);
        const nomeI = idx(htMap.customerName);
        const hasStatus = statusI !== -1;

        if (emailI !== -1) {
          // Reembolsos HT saem: coleta ids reembolsados p/ excluir a compra pareada.
          const refundedTxIds = new Set<string>();
          if (hasStatus && txI !== -1) {
            for (const row of rows) {
              if (isRefundBucket(classifyRefundStatus(row[statusI], true))) {
                const t = (row[txI] ?? "").trim();
                if (t) refundedTxIds.add(t);
              }
            }
          }

          const seenTx = new Set<string>();
          for (const row of rows) {
            const email = (row[emailI] ?? "").trim().toLowerCase();
            if (!email) continue;
            // Exclui a própria linha de reembolso.
            if (hasStatus && isRefundBucket(classifyRefundStatus(row[statusI], true))) continue;
            const txId = txI !== -1 ? (row[txI] ?? "").trim() : "";
            // Compra reembolsada (id na lista) não conta como upsell.
            if (txId && refundedTxIds.has(txId)) continue;
            // Dedup de retry do gateway (mesmo id já visto).
            if (txId) {
              if (seenTx.has(txId)) continue;
              seenTx.add(txId);
            }

            htPurchases.push({
              email,
              date: dataI !== -1 ? parseDate(row[dataI]) : null,
              value: parseNumber(row[brutoI] ?? ""),
              name: nomeI !== -1 ? (row[nomeI] ?? "").trim() || null : null,
            });
          }
        }
      } catch {
        return { ...EMPTY, semDados: true };
      }

      // Cruzamento (regra "nunca antes") delegado à função pura testável.
      const result = computeUpsellCrossSell(perpetualEmails, earliestPerpByEmail, htPurchases);

      return {
        ...result,
        semPerpetuo: false,
        semUpsell: false,
        semDados: false,
      };
    },
  );
});
