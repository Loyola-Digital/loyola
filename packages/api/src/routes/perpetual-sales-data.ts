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

// ============================================================
// Epic 29 Story 29.3 — agregação de vendas do perpétuo
// porUtmSource é BRUTO (sem normalização Pago/Orgânico)
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ---- helpers (copiados de stage-sales-data — refactor DRY pode esperar) ----

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

function sanitizeUtmValue(val: string | undefined | null): string | null {
  if (val == null) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "-" || lower === "n/a" || lower === "na") return null;
  return trimmed;
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

// Story 29.7: fee rates por plataforma (Kiwify=20.99% / Hotmart=26% / Other=0%)
const PLATFORM_FEE_RATES: Record<string, number> = {
  kiwify: 0.2099,
  hotmart: 0.26,
  other: 0,
};

// Componente de reembolso ESTIMADO embutido nas taxas acima (Kiwify/Hotmart).
// Quando a planilha tem coluna de status, o reembolso é medido de verdade e já
// sai do bruto — então removemos esta estimativa pra não descontar em dobro.
const REFUND_FEE_ESTIMATE = 0.04;

/**
 * Fee efetivo da plataforma. Se a planilha traz status real de reembolso
 * (hasStatusCol), remove o componente estimado de 4% — o reembolso real já
 * foi subtraído do bruto.
 */
function effectivePlatformFeeRate(platform: string | null, hasStatusCol: boolean): number {
  if (!platform) return 0;
  const rate = PLATFORM_FEE_RATES[platform] ?? 0;
  if (hasStatusCol && rate > 0) return Math.max(0, rate - REFUND_FEE_ESTIMATE);
  return rate;
}

const EMPTY_SALES_DATA = {
  totalVendas: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  faturamentoLiquidoCalculado: 0,
  // Reembolsos (refunded + chargeback) — já descontados do faturamento acima.
  reembolsoBruto: 0,
  reembolsoLiquido: 0,
  vendasReembolsadas: 0,
  // true quando a planilha tem coluna de status → reembolso medido de verdade
  // (e o 4% estimado da plataforma é removido da Margem).
  reembolsoReal: false,
  platform: null as string | null,
  feeRate: 0,
  ticketMedioBruto: 0,
  ticketMedioLiquido: 0,
  porUtmSource: [] as { source: string; vendas: number; bruto: number; liquido: number }[],
  porUtmMedium: [] as { medium: string; vendas: number; bruto: number; liquido: number }[],
  porUtmContent: [] as { content: string; vendas: number; bruto: number; liquido: number }[],
  porUtmCampaign: [] as { campaign: string; vendas: number; bruto: number; liquido: number }[],
  porFormaPagamento: [] as { forma: string; vendas: number; bruto: number; liquido: number }[],
  semDados: true,
};

const SEM_ORIGEM_LABEL = "(sem origem)";

// ============================================================
// ROUTES
// ============================================================

export default fp(async function perpetualSalesDataRoutes(fastify) {
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

  async function loadPerpetualSpreadsheet(funnelId: string) {
    const [row] = await fastify.db
      .select()
      .from(funnelSpreadsheets)
      .where(
        and(
          eq(funnelSpreadsheets.funnelId, funnelId),
          eq(funnelSpreadsheets.type, "perpetual_sales"),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  // ---- GET /perpetual/sales-data ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const spreadsheet = await loadPerpetualSpreadsheet(params.data.funnelId);
      if (!spreadsheet) return EMPTY_SALES_DATA;

      const mapping = spreadsheet.columnMapping as {
        email: string;
        transactionId?: string;
        valorBruto?: string;
        valorLiquido?: string;
        formaPagamento?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_content?: string;
        utm_campaign?: string;
        dataVenda?: string;
        status?: string;
      };

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { ...EMPTY_SALES_DATA, semDados: true };
      }

      const { headers, rows } = sheetData;
      if (rows.length === 0) return { ...EMPTY_SALES_DATA, semDados: true };

      const colIdx = (fieldName: string | undefined): number =>
        fieldName ? headers.indexOf(fieldName) : -1;

      const emailIdx = colIdx(mapping.email);
      const txIdx = colIdx(mapping.transactionId);
      const brutoIdx = colIdx(mapping.valorBruto);
      const liquidoIdx = colIdx(mapping.valorLiquido);
      const formaIdx = colIdx(mapping.formaPagamento);
      const utmSourceIdx = colIdx(mapping.utm_source);
      const utmMediumIdx = colIdx(mapping.utm_medium);
      const utmContentIdx = colIdx(mapping.utm_content);
      const utmCampaignIdx = colIdx(mapping.utm_campaign);
      const dataIdx = colIdx(mapping.dataVenda);
      const statusIdx = colIdx(mapping.status);
      const hasStatusCol = statusIdx !== -1;

      if (emailIdx === -1) return { ...EMPTY_SALES_DATA, semDados: true };

      // Fix 1 (29.8): suporta startDate/endDate explicitos (custom range no passado)
      // OU days retroativos (presets). Sem nenhum dos dois = todos os dados.
      let cutoffStart: Date | null = null;
      let cutoffEnd: Date | null = null;
      if (query.data.startDate && query.data.endDate && dataIdx !== -1) {
        cutoffStart = new Date(query.data.startDate + "T00:00:00");
        cutoffEnd = new Date(query.data.endDate + "T23:59:59");
      } else if (query.data.days && dataIdx !== -1) {
        cutoffStart = new Date();
        cutoffStart.setDate(cutoffStart.getDate() - query.data.days);
      }

      // Dedup por transactionId quando mapeado, senão por email (Story 28.4 pattern)
      const dedupMap = new Map<
        string,
        {
          bruto: number;
          liquido: number;
          forma: string;
          utmSource: string;
          utmMedium: string;
          utmContent: string;
          utmCampaign: string;
          status: string;
          lastDate: Date | null;
        }
      >();

      for (const row of rows) {
        const email = (row[emailIdx] ?? "").trim().toLowerCase();
        if (!email) continue;

        if ((cutoffStart || cutoffEnd) && dataIdx !== -1) {
          const dt = parseDate(row[dataIdx]);
          if (!dt) continue;
          if (cutoffStart && dt < cutoffStart) continue;
          if (cutoffEnd && dt > cutoffEnd) continue;
        }

        const bruto = parseNumber(row[brutoIdx] ?? "");
        const liquido = parseNumber(row[liquidoIdx] ?? "");
        const forma = (row[formaIdx] ?? "").trim() || "Não informado";
        const utmSource = sanitizeUtmValue(row[utmSourceIdx]) ?? SEM_ORIGEM_LABEL;
        const utmMedium = sanitizeUtmValue(row[utmMediumIdx]) ?? SEM_ORIGEM_LABEL;
        const utmContent = sanitizeUtmValue(row[utmContentIdx]) ?? SEM_ORIGEM_LABEL;
        const utmCampaign = sanitizeUtmValue(row[utmCampaignIdx]) ?? SEM_ORIGEM_LABEL;
        const rowDate = dataIdx !== -1 ? parseDate(row[dataIdx]) : null;
        const status = hasStatusCol ? (row[statusIdx] ?? "").trim() : "";

        const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
        const dedupKey = txId ? `tx|${txId}` : `email|${email}`;

        const existing = dedupMap.get(dedupKey);
        if (existing) {
          existing.bruto += bruto;
          existing.liquido += liquido;
          if (rowDate && (!existing.lastDate || rowDate > existing.lastDate)) {
            existing.forma = forma;
            existing.utmSource = utmSource;
            existing.utmMedium = utmMedium;
            existing.utmContent = utmContent;
            existing.utmCampaign = utmCampaign;
            // Status vale o da linha mais recente da transação (paid → refunded).
            existing.status = status;
            existing.lastDate = rowDate;
          } else if (!existing.lastDate && !existing.status && status) {
            // Sem datas para desempatar: preserva o primeiro status não-vazio.
            existing.status = status;
          }
        } else {
          dedupMap.set(dedupKey, { bruto, liquido, forma, utmSource, utmMedium, utmContent, utmCampaign, status, lastDate: rowDate });
        }
      }

      if (dedupMap.size === 0) return { ...EMPTY_SALES_DATA, semDados: false };

      let totalBruto = 0;
      let totalLiquido = 0;
      let reembolsoBruto = 0;
      let reembolsoLiquido = 0;
      let vendasReembolsadas = 0;
      let totalVendas = 0;
      const utmSourceMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmMediumMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmContentMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const utmCampaignMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();
      const formaMap = new Map<string, { vendas: number; bruto: number; liquido: number }>();

      const addToMap = (
        m: Map<string, { vendas: number; bruto: number; liquido: number }>,
        key: string,
        bruto: number,
        liquido: number,
      ) => {
        const e = m.get(key) ?? { vendas: 0, bruto: 0, liquido: 0 };
        e.vendas += 1;
        e.bruto += bruto;
        e.liquido += liquido;
        m.set(key, e);
      };

      for (const { bruto, liquido, forma, utmSource, utmMedium, utmContent, utmCampaign, status } of dedupMap.values()) {
        // Reembolso/chargeback saem do faturamento e vão para o balde de reembolso.
        // Não entram nos rankings de UTM/forma (não são receita realizada).
        if (isRefundBucket(classifyRefundStatus(status, hasStatusCol))) {
          reembolsoBruto += bruto;
          reembolsoLiquido += liquido;
          vendasReembolsadas += 1;
          continue;
        }
        totalVendas += 1;
        totalBruto += bruto;
        totalLiquido += liquido;
        addToMap(utmSourceMap, utmSource, bruto, liquido);
        addToMap(utmMediumMap, utmMedium, bruto, liquido);
        addToMap(utmContentMap, utmContent, bruto, liquido);
        addToMap(utmCampaignMap, utmCampaign, bruto, liquido);
        addToMap(formaMap, forma, bruto, liquido);
      }

      const platform = spreadsheet.platform;
      const feeRate = effectivePlatformFeeRate(platform, hasStatusCol);
      const faturamentoLiquidoCalculado = totalBruto * (1 - feeRate);

      return {
        totalVendas,
        faturamentoBruto: totalBruto,
        faturamentoLiquido: totalLiquido,
        faturamentoLiquidoCalculado,
        reembolsoBruto,
        reembolsoLiquido,
        vendasReembolsadas,
        reembolsoReal: hasStatusCol,
        platform,
        feeRate,
        ticketMedioBruto: totalVendas > 0 ? totalBruto / totalVendas : 0,
        ticketMedioLiquido: totalVendas > 0 ? totalLiquido / totalVendas : 0,
        porUtmSource: Array.from(utmSourceMap.entries())
          .map(([source, v]) => ({ source, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmMedium: Array.from(utmMediumMap.entries())
          .map(([medium, v]) => ({ medium, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmContent: Array.from(utmContentMap.entries())
          .map(([content, v]) => ({ content, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porUtmCampaign: Array.from(utmCampaignMap.entries())
          .map(([campaign, v]) => ({ campaign, ...v }))
          .sort((a, b) => b.bruto - a.bruto),
        porFormaPagamento: Array.from(formaMap.entries())
          .map(([forma, v]) => ({ forma, ...v }))
          .sort((a, b) => b.vendas - a.vendas),
        semDados: false,
      };
    },
  );

  // ---- GET /perpetual/sales-data-daily ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/perpetual/sales-data-daily",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const funnel = await getFunnel(params.data.funnelId, params.data.projectId);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const spreadsheet = await loadPerpetualSpreadsheet(params.data.funnelId);
      if (!spreadsheet) return { byDay: {} as Record<string, number>, semDados: true };

      const mapping = spreadsheet.columnMapping as {
        email: string;
        valorBruto?: string;
        dataVenda?: string;
        status?: string;
      };

      let sheetData;
      try {
        sheetData = await readSheetData(spreadsheet.spreadsheetId, spreadsheet.sheetName);
      } catch {
        return { byDay: {} as Record<string, number>, semDados: true };
      }

      const { headers, rows } = sheetData;
      if (rows.length === 0) return { byDay: {} as Record<string, number>, semDados: true };

      const colIdx = (fieldName: string | undefined): number =>
        fieldName ? headers.indexOf(fieldName) : -1;

      const emailIdx = colIdx(mapping.email);
      const brutoIdx = colIdx(mapping.valorBruto);
      const dataIdx = colIdx(mapping.dataVenda);
      const statusIdx = colIdx(mapping.status);
      const hasStatusCol = statusIdx !== -1;

      if (dataIdx === -1) return { byDay: {} as Record<string, number>, semDados: true };

      // Fix 1 (29.8): suporta startDate/endDate ou days retroativos
      let cutoffStart: Date | null = null;
      let cutoffEnd: Date | null = null;
      if (query.data.startDate && query.data.endDate) {
        cutoffStart = new Date(query.data.startDate + "T00:00:00");
        cutoffEnd = new Date(query.data.endDate + "T23:59:59");
      } else if (query.data.days) {
        cutoffStart = new Date();
        cutoffStart.setDate(cutoffStart.getDate() - query.data.days);
      }

      const byDay: Record<string, number> = {};
      let counted = 0;

      for (const row of rows) {
        const rowDate = parseDate(row[dataIdx]);
        if (!rowDate) continue;
        if (cutoffStart && rowDate < cutoffStart) continue;
        if (cutoffEnd && rowDate > cutoffEnd) continue;

        if (emailIdx !== -1) {
          const email = (row[emailIdx] ?? "").trim();
          if (!email) continue;
        }

        // Reembolso/chargeback não entram na série de receita no tempo.
        if (hasStatusCol && isRefundBucket(classifyRefundStatus(row[statusIdx], hasStatusCol))) continue;

        const bruto = parseNumber(row[brutoIdx] ?? "");
        if (bruto <= 0) continue;

        const y = rowDate.getFullYear();
        const m = String(rowDate.getMonth() + 1).padStart(2, "0");
        const d = String(rowDate.getDate()).padStart(2, "0");
        const key = `${y}-${m}-${d}`;
        byDay[key] = (byDay[key] ?? 0) + bruto;
        counted++;
      }

      return counted > 0
        ? { byDay, semDados: false }
        : { byDay: {} as Record<string, number>, semDados: false };
    },
  );
});
