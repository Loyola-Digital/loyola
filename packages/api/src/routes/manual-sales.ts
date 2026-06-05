/**
 * Story 19.9 — Manual Sales (Vendas PIX Direto)
 *
 * Persiste vendas lançadas manualmente no app (fora da planilha Sheets) pra
 * etapas tipo `sales`. Endpoint segrega essas vendas em seção própria no
 * dashboard — não soma com as vendas da planilha.
 */

import { z } from "zod";
import { eq, and, gte, desc, asc, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  manualSales,
  funnelStages,
  funnels,
  projects,
  projectMembers,
  users,
  stageSalesSpreadsheets,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";

function parseBrNumber(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return parseFloat(normalized) || 0;
}

function parseSheetDate(val: string | undefined): Date | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const d = new Date(parseInt(br[3]), parseInt(br[2]) - 1, parseInt(br[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Normaliza nome do usuário pra exibição: detecta Clerk ID literal
 * ("user_xxx") e converte usando o local-part do email; senão devolve
 * o nome real. Mesma lógica do funnel-stages.ts.
 */
function displayUserName(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const looksLikeClerkId = typeof name === "string" && /^user_[A-Za-z0-9]+$/.test(name);
  const nameIsEmail = name && email && name === email;
  if (name && !looksLikeClerkId && !nameIsEmail) return name;

  if (email) {
    const local = email.split("@")[0].split("+")[0];
    return local
      .replace(/[._-]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "Usuário";
}

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const saleParamsSchema = stageParamsSchema.extend({
  saleId: z.string().uuid(),
});

const listQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(3650).default(30),
});

const createSaleSchema = z.object({
  customerName: z.string().trim().min(2).max(255),
  customerEmail: z.string().trim().email().max(255).optional().or(z.literal("").transform(() => undefined)),
  customerPhone: z.string().trim().max(50).optional().or(z.literal("").transform(() => undefined)),
  value: z.number().positive().finite(),
  sellerUserId: z.string().uuid(),
  saleDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  product: z.string().trim().max(255).optional().or(z.literal("").transform(() => undefined)),
  invoiceStatus: z.enum(["emitida", "pendente"]).nullable().optional(),
});

export default fp(async function manualSalesRoutes(fastify) {
  async function getStageContext(
    projectId: string,
    funnelId: string,
    stageId: string,
    userId: string,
    userRole: string,
  ) {
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
    if (!project) return null;

    const [stage] = await fastify.db
      .select({ id: funnelStages.id, stageType: funnelStages.stageType })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return stage ?? null;
  }

  /**
   * Story 19.9 — Lista TODOS os usuários da plataforma como possíveis
   * vendedores. Filtra status `blocked`. Aplica `displayUserName` pra
   * normalizar entradas onde `users.name` é literalmente o Clerk ID
   * (ex: "user_2abc...") ou cópia do email.
   */
  async function getEligibleSellers() {
    const rows = await fastify.db
      .select({
        userId: users.id,
        rawName: users.name,
        email: users.email,
        status: users.status,
      })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(asc(users.name));

    return rows
      .map((r) => ({
        userId: r.userId,
        name: displayUserName(r.rawName, r.email),
        email: r.email,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  // ---------------------------------------------------------------
  // GET /sellers — lista vendedores elegíveis (owner + members) do projeto
  // ---------------------------------------------------------------
  fastify.get(
    "/api/projects/:projectId/manual-sales/sellers",
    async (request, reply) => {
      const paramsResult = z
        .object({ projectId: z.string().uuid() })
        .safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos" });
      }
      const { projectId } = paramsResult.data;

      if (request.userRole === "guest") {
        const [member] = await fastify.db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, request.userId),
            ),
          )
          .limit(1);
        if (!member) return reply.code(403).send({ error: "Acesso negado" });
      }

      const sellers = await getEligibleSellers();
      return sellers;
    },
  );

  // ---------------------------------------------------------------
  // GET — lista vendas manuais do stage + agregação
  // ---------------------------------------------------------------
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/manual-sales",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = listQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const stage = await getStageContext(
        params.data.projectId,
        params.data.funnelId,
        params.data.stageId,
        request.userId,
        request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const since = new Date(Date.now() - query.data.days * 24 * 60 * 60 * 1000);

      const rows = await fastify.db
        .select()
        .from(manualSales)
        .where(
          and(
            eq(manualSales.stageId, params.data.stageId),
            gte(manualSales.saleDate, since),
          ),
        )
        .orderBy(desc(manualSales.saleDate));

      const sales = rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        value: Number(r.value),
        sellerUserId: r.sellerUserId,
        sellerName: r.sellerName,
        saleDate: r.saleDate.toISOString(),
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        product: r.product,
        invoiceStatus: r.invoiceStatus as "emitida" | "pendente" | null,
      }));

      const totalSales = sales.length;
      const totalRevenue = sales.reduce((acc, s) => acc + s.value, 0);
      const avgTicket = totalSales > 0 ? totalRevenue / totalSales : 0;

      const sellerMap = new Map<
        string,
        { sellerUserId: string | null; sellerName: string; totalSales: number; totalRevenue: number }
      >();
      for (const s of sales) {
        const key = s.sellerUserId ?? `name:${s.sellerName}`;
        const entry = sellerMap.get(key) ?? {
          sellerUserId: s.sellerUserId,
          sellerName: s.sellerName,
          totalSales: 0,
          totalRevenue: 0,
        };
        entry.totalSales += 1;
        entry.totalRevenue += s.value;
        sellerMap.set(key, entry);
      }
      const sellersRanking = Array.from(sellerMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue,
      );

      return {
        sales,
        summary: { totalSales, totalRevenue, avgTicket, sellersRanking },
      };
    },
  );

  // ---------------------------------------------------------------
  // POST — cria venda manual
  // ---------------------------------------------------------------
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/manual-sales",
    async (request, reply) => {
      if (request.userRole === "guest") {
        // Guest pode visualizar (membership check no GET) mas não criar.
        const [member] = await fastify.db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, (request.params as { projectId: string }).projectId),
              eq(projectMembers.userId, request.userId),
            ),
          )
          .limit(1);
        if (!member) return reply.code(403).send({ error: "Acesso negado" });
      }

      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = createSaleSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const stage = await getStageContext(
        params.data.projectId,
        params.data.funnelId,
        params.data.stageId,
        request.userId,
        request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      if (stage.stageType !== "sales") {
        return reply
          .code(400)
          .send({ error: "Vendas manuais só podem ser lançadas em etapas do tipo Vendas" });
      }

      // Vendedor: qualquer usuário ativo da plataforma
      const [sellerUser] = await fastify.db
        .select({ id: users.id, name: users.name, email: users.email, status: users.status })
        .from(users)
        .where(eq(users.id, body.data.sellerUserId))
        .limit(1);

      if (!sellerUser || sellerUser.status === "blocked") {
        return reply.code(403).send({ error: "Vendedor não é um usuário válido" });
      }
      const sellerMembership = {
        userId: sellerUser.id,
        name: displayUserName(sellerUser.name, sellerUser.email),
        email: sellerUser.email,
      };

      // Parse saleDate — aceita ISO completo ou YYYY-MM-DD
      const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(body.data.saleDate)
        ? new Date(body.data.saleDate + "T12:00:00")
        : new Date(body.data.saleDate);

      if (isNaN(saleDate.getTime())) {
        return reply.code(400).send({ error: "Data de venda inválida" });
      }

      const [created] = await fastify.db
        .insert(manualSales)
        .values({
          stageId: params.data.stageId,
          customerName: body.data.customerName,
          customerEmail: body.data.customerEmail ?? null,
          customerPhone: body.data.customerPhone ?? null,
          value: body.data.value.toFixed(2),
          sellerUserId: sellerMembership.userId,
          sellerName: sellerMembership.name,
          saleDate,
          createdBy: request.userId,
          product: body.data.product ?? null,
          invoiceStatus: body.data.invoiceStatus ?? null,
        })
        .returning();

      return reply.code(201).send({
        id: created.id,
        stageId: created.stageId,
        customerName: created.customerName,
        customerEmail: created.customerEmail,
        customerPhone: created.customerPhone,
        value: Number(created.value),
        sellerUserId: created.sellerUserId,
        sellerName: created.sellerName,
        saleDate: created.saleDate.toISOString(),
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
        product: created.product,
        invoiceStatus: created.invoiceStatus,
      });
    },
  );

  // ---------------------------------------------------------------
  // PATCH — edita venda manual (parcial)
  // ---------------------------------------------------------------
  const updateSaleSchema = createSaleSchema.partial();

  fastify.patch(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/manual-sales/:saleId",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const params = saleParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = updateSaleSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }

      const stage = await getStageContext(
        params.data.projectId,
        params.data.funnelId,
        params.data.stageId,
        request.userId,
        request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // Confirma que venda existe e pertence ao stage
      const [existing] = await fastify.db
        .select()
        .from(manualSales)
        .where(
          and(
            eq(manualSales.id, params.data.saleId),
            eq(manualSales.stageId, params.data.stageId),
          ),
        )
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "Venda não encontrada" });

      // Monta SET parcial — só campos presentes no body
      const updates: Partial<typeof manualSales.$inferInsert> = {};

      if (body.data.customerName !== undefined) updates.customerName = body.data.customerName;
      if (body.data.customerEmail !== undefined) {
        updates.customerEmail = body.data.customerEmail ?? null;
      }
      if (body.data.customerPhone !== undefined) {
        updates.customerPhone = body.data.customerPhone ?? null;
      }
      if (body.data.value !== undefined) updates.value = body.data.value.toFixed(2);

      if (body.data.sellerUserId !== undefined) {
        const [sellerUser] = await fastify.db
          .select({ id: users.id, name: users.name, email: users.email, status: users.status })
          .from(users)
          .where(eq(users.id, body.data.sellerUserId))
          .limit(1);
        if (!sellerUser || sellerUser.status === "blocked") {
          return reply.code(403).send({ error: "Vendedor não é um usuário válido" });
        }
        updates.sellerUserId = sellerUser.id;
        updates.sellerName = displayUserName(sellerUser.name, sellerUser.email);
      }

      if (body.data.saleDate !== undefined) {
        const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(body.data.saleDate)
          ? new Date(body.data.saleDate + "T12:00:00")
          : new Date(body.data.saleDate);
        if (isNaN(saleDate.getTime())) {
          return reply.code(400).send({ error: "Data de venda inválida" });
        }
        updates.saleDate = saleDate;
      }

      if (body.data.product !== undefined) updates.product = body.data.product ?? null;
      if (body.data.invoiceStatus !== undefined) updates.invoiceStatus = body.data.invoiceStatus ?? null;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "Nenhum campo pra atualizar" });
      }

      const [updated] = await fastify.db
        .update(manualSales)
        .set(updates)
        .where(eq(manualSales.id, params.data.saleId))
        .returning();

      return {
        id: updated.id,
        stageId: updated.stageId,
        customerName: updated.customerName,
        customerEmail: updated.customerEmail,
        customerPhone: updated.customerPhone,
        value: Number(updated.value),
        sellerUserId: updated.sellerUserId,
        sellerName: updated.sellerName,
        saleDate: updated.saleDate.toISOString(),
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        product: updated.product,
        invoiceStatus: updated.invoiceStatus,
      };
    },
  );

  // ---------------------------------------------------------------
  // GET /all-sales — Story 19.9 ext: vendas manuais + planilha unificadas
  // ---------------------------------------------------------------
  // Subtypes válidos de planilha de venda. 'all' = todos. Também aceita lista
  // CSV (ex: "main_product,tmb") pra a tabela unificada puxar só fontes
  // específicas. Vendas manuais SEMPRE entram, independente do subtype.
  const VALID_SALE_SUBTYPES = ["capture", "main_product", "sales", "tmb"] as const;
  const allSalesQuerySchema = z.object({
    // Default ALL. Cliente pode forçar subtypes específicos mandando
    // ?subtype=main_product ou ?subtype=main_product,tmb (CSV).
    subtype: z.string().default("all"),
    days: z.coerce.number().int().positive().max(3650).default(90),
  });

  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/all-sales",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = allSalesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const stage = await getStageContext(
        params.data.projectId,
        params.data.funnelId,
        params.data.stageId,
        request.userId,
        request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const cutoff = new Date(Date.now() - query.data.days * 24 * 60 * 60 * 1000);

      type UnifiedSale = {
        id: string;
        source: "manual" | "spreadsheet";
        customerName: string | null;
        customerEmail: string | null;
        customerPhone: string | null;
        product: string | null;
        value: number;
        sellerName: string | null;
        saleDate: string | null;
        invoiceStatus: "emitida" | "pendente" | null;
        manualSaleId: string | null;
        /** Rótulo da fonte da venda (ex: "TMB"). null = sem rótulo especial. */
        sourceLabel: string | null;
      };

      // 1. Vendas manuais
      const manualRows = await fastify.db
        .select()
        .from(manualSales)
        .where(
          and(
            eq(manualSales.stageId, params.data.stageId),
            gte(manualSales.saleDate, cutoff),
          ),
        )
        .orderBy(desc(manualSales.saleDate));

      const out: UnifiedSale[] = manualRows.map((r) => ({
        id: `manual:${r.id}`,
        source: "manual",
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        product: r.product,
        value: Number(r.value) || 0,
        sellerName: r.sellerName,
        saleDate: r.saleDate.toISOString(),
        invoiceStatus: r.invoiceStatus as "emitida" | "pendente" | null,
        manualSaleId: r.id,
        sourceLabel: null,
      }));

      // 2. Vendas da planilha — 'all' pega todos os subtypes; CSV
      // (ex: "main_product,tmb") restringe às fontes pedidas. A tabela
      // unificada do dash usa "main_product,tmb" pra NÃO incluir Captação
      // nem "Outras planilhas".
      const requestedSubtypes =
        query.data.subtype === "all"
          ? [...VALID_SALE_SUBTYPES]
          : query.data.subtype
              .split(",")
              .map((s) => s.trim())
              .filter((s): s is (typeof VALID_SALE_SUBTYPES)[number] =>
                (VALID_SALE_SUBTYPES as readonly string[]).includes(s),
              );

      const sheets =
        requestedSubtypes.length === 0
          ? []
          : await fastify.db
              .select()
              .from(stageSalesSpreadsheets)
              .where(
                and(
                  eq(stageSalesSpreadsheets.stageId, params.data.stageId),
                  inArray(stageSalesSpreadsheets.subtype, requestedSubtypes),
                ),
              );

      const seenDedup = new Set<string>();
      for (const sheet of sheets) {
        const mapping = sheet.columnMapping as {
          email?: string;
          transactionId?: string;
          customerName?: string;
          productName?: string;
          valorBruto?: string;
          canalOrigem?: string;
          dataVenda?: string;
          utm_source?: string;
        };
        let data;
        try {
          data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
        } catch {
          continue;
        }
        const { headers, rows } = data;
        const idxOf = (n: string | undefined) => (n ? headers.indexOf(n) : -1);
        // Rótulo da fonte: planilha do slot 'tmb' marca cada venda com badge
        // "TMB" na tabela unificada. Demais subtypes ficam sem rótulo especial.
        const sheetSourceLabel = sheet.subtype === "tmb" ? "TMB" : null;

        const emailIdx = idxOf(mapping.email);
        const txIdx = idxOf(mapping.transactionId);
        const nameIdx = idxOf(mapping.customerName);
        const productIdx = idxOf(mapping.productName);
        const brutoIdx = idxOf(mapping.valorBruto);
        const canalIdx = idxOf(mapping.canalOrigem);
        const dataIdx = idxOf(mapping.dataVenda);
        const utmSourceIdx = idxOf(mapping.utm_source);

        if (emailIdx === -1) continue;

        for (const row of rows) {
          const email = (row[emailIdx] ?? "").trim().toLowerCase();
          if (!email) continue;

          const dt = dataIdx !== -1 ? parseSheetDate(row[dataIdx]) : null;
          if (dt && dt < cutoff) continue;

          const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
          const dedupKey = txId
            ? `${sheet.id}|tx|${txId}`
            : `${sheet.id}|email|${email}|${row[brutoIdx] ?? ""}`;
          if (seenDedup.has(dedupKey)) continue;
          seenDedup.add(dedupKey);

          const value = parseBrNumber(row[brutoIdx]);
          const canal = canalIdx !== -1 ? (row[canalIdx] ?? "").trim() : "";
          const utm = utmSourceIdx !== -1 ? (row[utmSourceIdx] ?? "").trim() : "";
          const explicitName = nameIdx !== -1 ? (row[nameIdx] ?? "").trim() : "";
          const explicitProduct = productIdx !== -1 ? (row[productIdx] ?? "").trim() : "";

          out.push({
            id: `sheet:${sheet.id}:${dedupKey}`,
            source: "spreadsheet",
            // Story 19.9 ext: usa coluna customerName quando mapeada, senão email
            customerName: explicitName || email,
            customerEmail: email,
            customerPhone: null,
            // Story 19.9 ext: productName mapeada > canal de origem como fallback
            product: explicitProduct || canal || null,
            value,
            sellerName: utm || null,
            saleDate: dt ? dt.toISOString() : null,
            invoiceStatus: null,
            manualSaleId: null,
            sourceLabel: sheetSourceLabel,
          });
        }
      }

      out.sort((a, b) => {
        if (!a.saleDate) return 1;
        if (!b.saleDate) return -1;
        return b.saleDate.localeCompare(a.saleDate);
      });

      const totalRevenue = out.reduce((s, x) => s + x.value, 0);
      const manualRevenue = out
        .filter((x) => x.source === "manual")
        .reduce((s, x) => s + x.value, 0);
      const spreadsheetRevenue = totalRevenue - manualRevenue;

      return {
        sales: out,
        summary: {
          totalSales: out.length,
          totalRevenue,
          manualSales: manualRows.length,
          manualRevenue,
          spreadsheetSales: out.length - manualRows.length,
          spreadsheetRevenue,
        },
      };
    },
  );

  // ---------------------------------------------------------------
  // DELETE — remove venda manual
  // ---------------------------------------------------------------
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/manual-sales/:saleId",
    async (request, reply) => {
      if (request.userRole === "guest") {
        return reply.code(403).send({ error: "Acesso negado" });
      }

      const params = saleParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const stage = await getStageContext(
        params.data.projectId,
        params.data.funnelId,
        params.data.stageId,
        request.userId,
        request.userRole,
      );
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const result = await fastify.db
        .delete(manualSales)
        .where(and(eq(manualSales.id, params.data.saleId), eq(manualSales.stageId, params.data.stageId)))
        .returning({ id: manualSales.id });

      if (result.length === 0) {
        return reply.code(404).send({ error: "Venda não encontrada" });
      }

      return { success: true };
    },
  );
});
