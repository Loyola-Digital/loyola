import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageSalesSpreadsheets,
  funnelSpreadsheets,
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
  days: z.coerce.number().int().positive().optional(),
});

// ============================================================
// HELPERS (duplicados localmente pra não criar dependência circular com
// stage-sales-data.ts — mesma semântica)
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
    const dd = parseInt(d, 10);
    const mm = parseInt(m, 10);
    const yy = parseInt(y, 10);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normaliza ID numérico removendo underscore de prefixo quando o restante é
 * só dígitos. Espelho do helper do frontend (normalizeNumericId) —
 * necessário aqui pra cruzar utm_content da planilha de leads (que às vezes
 * vem com `_12345` do Google Sheets formatado como texto) com ad_id do Meta.
 */
function normalizeNumericId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("_")) {
    const rest = trimmed.slice(1);
    if (/^\d+$/.test(rest)) return rest;
  }
  return trimmed;
}

const EMPTY_RESPONSE = {
  byAdId: {} as Record<string, { faturamentoBruto: number; faturamentoLiquido: number; vendas: number; emails: string[] }>,
  totalVendas: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  semDados: true,
};

// ============================================================
// ROUTE
// ============================================================

export default fp(async function creativeRevenueRoutes(fastify) {
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

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/creative-revenue
  // Story 21.7 — retorna map byAdId com faturamento cruzado ad_id → utm_content
  // → email → venda.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/creative-revenue",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // 1. Valida que o stage existe dentro do funil/projeto
      const [stage] = await fastify.db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId),
          ),
        )
        .limit(1);

      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // 2. Planilha de leads do stage (funnel_spreadsheets type=leads, stage_id=X)
      const [leadsSheet] = await fastify.db
        .select()
        .from(funnelSpreadsheets)
        .where(
          and(
            eq(funnelSpreadsheets.stageId, params.data.stageId),
            eq(funnelSpreadsheets.type, "leads"),
          ),
        )
        .limit(1);

      // 3. Planilha de vendas do stage (stage_sales_spreadsheets subtype=capture)
      const [salesSheet] = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(
          and(
            eq(stageSalesSpreadsheets.stageId, params.data.stageId),
            eq(stageSalesSpreadsheets.subtype, "capture"),
          ),
        )
        .limit(1);

      if (!leadsSheet || !salesSheet) {
        return EMPTY_RESPONSE;
      }

      // 4. Lê ambas (cache 5min no readSheetData)
      let leadsData, salesData;
      try {
        [leadsData, salesData] = await Promise.all([
          readSheetData(leadsSheet.spreadsheetId, leadsSheet.sheetName),
          readSheetData(salesSheet.spreadsheetId, salesSheet.sheetName),
        ]);
      } catch {
        return EMPTY_RESPONSE;
      }

      // Mapeamento de colunas
      const leadsMapping = (leadsSheet.columnMapping ?? {}) as {
        email?: string;
        utm_content?: string;
        date?: string;
      };
      const salesMapping = salesSheet.columnMapping as {
        email: string;
        transactionId?: string;
        valorBruto?: string;
        valorLiquido?: string;
        utm_content?: string;
        dataVenda?: string;
      };

      function findCol(headers: string[], name: string | undefined): number {
        if (!name) return -1;
        const normalized = name.trim().toLowerCase();
        return headers.findIndex((h) => h.trim().toLowerCase() === normalized);
      }

      const leadEmailIdx = findCol(leadsData.headers, leadsMapping.email);
      const leadUtmIdx = findCol(leadsData.headers, leadsMapping.utm_content);
      const leadDateIdx = findCol(leadsData.headers, leadsMapping.date);
      const saleEmailIdx = findCol(salesData.headers, salesMapping.email);
      const saleBrutoIdx = findCol(salesData.headers, salesMapping.valorBruto);
      const saleLiquidoIdx = findCol(salesData.headers, salesMapping.valorLiquido);
      const saleDateIdx = findCol(salesData.headers, salesMapping.dataVenda);
      // Story 18.49: utm_content (co=) e transactionId da própria VENDA
      const saleUtmContentIdx = findCol(salesData.headers, salesMapping.utm_content);
      const saleTxIdx = findCol(salesData.headers, salesMapping.transactionId);

      // Story 18.49: usamos atribuição direta por `co=` da venda quando a
      // planilha de vendas tem utm_content. Senão, fallback pro cruzamento
      // legacy por email do lead (que falha na Paga — comprador != lead popup).
      const useSaleContent = saleUtmContentIdx !== -1;

      // Sem colunas críticas → nada a cruzar.
      // - Caminho sale-content: precisa de co= + email/valor da venda.
      // - Caminho legacy: precisa de email+utm_content do lead + email da venda.
      if (useSaleContent) {
        if (saleEmailIdx === -1 && saleTxIdx === -1) return EMPTY_RESPONSE;
      } else if (leadEmailIdx === -1 || leadUtmIdx === -1 || saleEmailIdx === -1) {
        return EMPTY_RESPONSE;
      }

      // Cutoff de data (se days passado) — aplicado na planilha de vendas
      let cutoff: Date | null = null;
      if (query.data.days) {
        cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - query.data.days);
      }

      // Para cada ad, mantém um Set de identidades de dedup. O frontend
      // deduplica de novo entre ad_ids do mesmo criativo (AC-4/AC-8) usando
      // essas strings (legacy: email; sale-content: tx/email da venda).
      type AdAgg = { faturamentoBruto: number; faturamentoLiquido: number; vendas: number; emails: Set<string> };
      const byAdIdMap = new Map<string, AdAgg>();
      let totalBruto = 0;
      let totalLiquido = 0;
      let totalVendas = 0;

      if (useSaleContent) {
        // 5+6 (Story 18.49). Atribuição DIRETA por `co=` (utm_content) da
        // própria VENDA → ad_id. Resolve revenue zerado na Paga (o comprador
        // frequentemente não é lead popup → cruzamento por email falhava).
        // Dedup por transactionId (preferido) ou email — espelha a 18.48
        // (recompras acumulam no mesmo registro, contam 1 venda).
        const saleDedup = new Map<string, { adId: string; bruto: number; liquido: number }>();
        let noKeyCounter = 0;
        for (const row of salesData.rows) {
          const adId = normalizeNumericId(row[saleUtmContentIdx] ?? "");
          if (!adId) continue;
          if (cutoff && saleDateIdx !== -1) {
            const dt = parseDate(row[saleDateIdx]);
            if (!dt || dt < cutoff) continue;
          }
          const bruto = parseNumber(row[saleBrutoIdx] ?? "");
          const liquido = parseNumber(row[saleLiquidoIdx] ?? "");
          if (bruto <= 0 && liquido <= 0) continue;

          const email = saleEmailIdx !== -1 ? normalizeEmail(row[saleEmailIdx] ?? "") : "";
          const txId = saleTxIdx !== -1 ? (row[saleTxIdx] ?? "").trim() : "";
          let dedupKey = txId ? `tx:${txId}` : email ? `email:${email}` : "";
          if (!dedupKey) dedupKey = `row:${noKeyCounter++}`;

          const existing = saleDedup.get(dedupKey);
          if (existing) {
            existing.bruto += bruto;
            existing.liquido += liquido;
            existing.adId = adId; // last-write do ad (espelha lastDate da 18.48)
          } else {
            saleDedup.set(dedupKey, { adId, bruto, liquido });
          }
        }
        for (const [identity, { adId, bruto, liquido }] of saleDedup.entries()) {
          const ad = byAdIdMap.get(adId) ?? {
            faturamentoBruto: 0,
            faturamentoLiquido: 0,
            vendas: 0,
            emails: new Set<string>(),
          };
          ad.emails.add(identity);
          ad.faturamentoBruto += bruto;
          ad.faturamentoLiquido += liquido;
          ad.vendas += 1;
          byAdIdMap.set(adId, ad);
          totalBruto += bruto;
          totalLiquido += liquido;
          totalVendas += 1;
        }
      } else {
        // 5. (Legacy) Agrega vendas por email (dedup + soma)
        type SaleAgg = { bruto: number; liquido: number };
        const salesByEmail = new Map<string, SaleAgg>();
        for (const row of salesData.rows) {
          const email = normalizeEmail(row[saleEmailIdx] ?? "");
          if (!email) continue;
          if (cutoff && saleDateIdx !== -1) {
            const dt = parseDate(row[saleDateIdx]);
            if (!dt || dt < cutoff) continue;
          }
          const bruto = parseNumber(row[saleBrutoIdx] ?? "");
          const liquido = parseNumber(row[saleLiquidoIdx] ?? "");
          const existing = salesByEmail.get(email);
          if (existing) {
            existing.bruto += bruto;
            existing.liquido += liquido;
          } else {
            salesByEmail.set(email, { bruto, liquido });
          }
        }

        // 6. (Legacy) Cruza leads → vendas e agrega por adId (cruzamento por email)
        for (const row of leadsData.rows) {
          const email = normalizeEmail(row[leadEmailIdx] ?? "");
          if (!email) continue;

          // Filtro de data no LEAD também (se tem coluna de data mapeada).
          if (cutoff && leadDateIdx !== -1) {
            const dt = parseDate(row[leadDateIdx]);
            if (!dt || dt < cutoff) continue;
          }

          const sale = salesByEmail.get(email);
          if (!sale) continue;

          const adId = normalizeNumericId(row[leadUtmIdx] ?? "");
          if (!adId) continue;

          const ad = byAdIdMap.get(adId) ?? {
            faturamentoBruto: 0,
            faturamentoLiquido: 0,
            vendas: 0,
            emails: new Set<string>(),
          };
          if (!ad.emails.has(email)) {
            ad.emails.add(email);
            ad.faturamentoBruto += sale.bruto;
            ad.faturamentoLiquido += sale.liquido;
            ad.vendas += 1;
          }
          byAdIdMap.set(adId, ad);
        }

        // Totais globais legacy (dedup por email independente do ad)
        const globalEmails = new Set<string>();
        for (const ad of byAdIdMap.values()) {
          for (const email of ad.emails) {
            if (globalEmails.has(email)) continue;
            globalEmails.add(email);
            const sale = salesByEmail.get(email)!;
            totalBruto += sale.bruto;
            totalLiquido += sale.liquido;
          }
        }
        totalVendas = globalEmails.size;
      }

      // 7. Serializa byAdId (Set → array)
      const byAdId: Record<string, { faturamentoBruto: number; faturamentoLiquido: number; vendas: number; emails: string[] }> = {};
      for (const [adId, ad] of byAdIdMap.entries()) {
        byAdId[adId] = {
          faturamentoBruto: ad.faturamentoBruto,
          faturamentoLiquido: ad.faturamentoLiquido,
          vendas: ad.vendas,
          emails: Array.from(ad.emails),
        };
      }

      return {
        byAdId,
        totalVendas,
        faturamentoBruto: totalBruto,
        faturamentoLiquido: totalLiquido,
        semDados: false,
      };
    },
  );
});
