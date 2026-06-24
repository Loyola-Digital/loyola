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
  memberkitConnections,
  stageMemberkitEnrollment,
  stageEventProducts,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { enrollMember, decryptMemberkitKey } from "../services/memberkit.js";
import type { MemberkitEnrollmentStatus, MemberkitMemberStatus } from "@loyola-x/shared";

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

/** Shape único de venda manual pra todos os endpoints (GET/POST/PATCH). */
function shapeManualSale(r: typeof manualSales.$inferSelect) {
  return {
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
    // Story 19.10 / 19.11
    valorRecebido: r.valorRecebido != null ? Number(r.valorRecebido) : null,
    negociacao: r.negociacao,
    memberkitStatus: r.memberkitStatus as MemberkitEnrollmentStatus | null,
    memberkitSyncedAt: r.memberkitSyncedAt ? r.memberkitSyncedAt.toISOString() : null,
    memberkitUserId: r.memberkitUserId,
  };
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

// Objeto base (sem refine) — reusado pelo updateSaleSchema via .partial().
const baseSaleObject = z.object({
  customerName: z.string().trim().min(2).max(255),
  customerEmail: z.string().trim().email().max(255).optional().or(z.literal("").transform(() => undefined)),
  customerPhone: z.string().trim().max(50).optional().or(z.literal("").transform(() => undefined)),
  value: z.number().positive().finite(),
  // Story 19.10: vendedor da plataforma (etapas sales/paid) — OPCIONAL. Na etapa
  // de Evento Presencial o vendedor é o Closer (texto livre via `sellerName`).
  sellerUserId: z.string().uuid().optional(),
  sellerName: z.string().trim().min(2).max(255).optional().or(z.literal("").transform(() => undefined)),
  saleDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  product: z.string().trim().max(255).optional().or(z.literal("").transform(() => undefined)),
  invoiceStatus: z.enum(["emitida", "pendente"]).nullable().optional(),
  // Story 19.10 — Evento Presencial
  valorRecebido: z.number().positive().finite().nullable().optional(),
  // nullable pra permitir LIMPAR a negociação numa edição (PATCH).
  negociacao: z.string().trim().max(2000).nullable().optional().or(z.literal("").transform(() => null)),
});

const createSaleSchema = baseSaleObject.refine(
  (d) => Boolean(d.sellerUserId) || Boolean(d.sellerName),
  { message: "Informe o vendedor (sellerUserId) ou o closer (sellerName)", path: ["sellerUserId"] },
);

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

  /** Grava o status MemberKit numa venda manual (efeito colateral, nunca lança). */
  async function setMemberkitStatus(
    saleId: string,
    status: MemberkitEnrollmentStatus,
    syncedAt: Date | null,
    memberkitUserId: string | null,
  ): Promise<void> {
    try {
      await fastify.db
        .update(manualSales)
        .set({ memberkitStatus: status, memberkitSyncedAt: syncedAt, memberkitUserId })
        .where(eq(manualSales.id, saleId));
    } catch {
      fastify.log.error("Falha ao gravar status MemberKit da venda");
    }
  }

  /**
   * Story 19.11 — matricula o comprador no MemberKit (efeito colateral da venda
   * na etapa de Evento Presencial). NUNCA lança: a venda não pode falhar por
   * causa do MemberKit. Decisão de produto: email é obrigatório na venda de
   * evento, então `pending` aqui só ocorre em caminho defensivo.
   * Retorna o status final pra refletir na resposta imediata da venda.
   */
  async function runMemberkitEnrollment(
    projectId: string,
    sale: typeof manualSales.$inferSelect,
  ): Promise<MemberkitEnrollmentStatus> {
    try {
      if (!sale.customerEmail) {
        await setMemberkitStatus(sale.id, "pending", null, null);
        return "pending";
      }
      const [conn] = await fastify.db
        .select()
        .from(memberkitConnections)
        .where(eq(memberkitConnections.projectId, projectId))
        .limit(1);
      const [cfg] = await fastify.db
        .select()
        .from(stageMemberkitEnrollment)
        .where(eq(stageMemberkitEnrollment.stageId, sale.stageId))
        .limit(1);

      if (!conn || !cfg || !cfg.autoEnroll) {
        await setMemberkitStatus(sale.id, "skipped", null, null);
        return "skipped";
      }

      // Story 19.12: a turma vem do PRODUTO vendido (cada produto tem a sua).
      // - Produto CADASTRADO: honra exatamente a turma dele. classroomId null =
      //   "sem matrícula" intencional → [] → skipped (não cai no fallback).
      // - Produto NÃO cadastrado (ex: venda legada / fora da lista): usa a turma
      //   default da etapa (cfg.classroomIds) como fallback.
      let classroomIds: number[] = cfg.classroomIds ?? [];
      if (sale.product) {
        const [prod] = await fastify.db
          .select({ classroomId: stageEventProducts.memberkitClassroomId })
          .from(stageEventProducts)
          .where(
            and(
              eq(stageEventProducts.stageId, sale.stageId),
              eq(stageEventProducts.name, sale.product),
            ),
          )
          .orderBy(asc(stageEventProducts.sortOrder))
          .limit(1);
        if (prod) {
          // Produto cadastrado encontrado → turma dele é a verdade (null = skip).
          classroomIds = prod.classroomId != null ? [prod.classroomId] : [];
        }
      }

      if (classroomIds.length === 0) {
        await setMemberkitStatus(sale.id, "skipped", null, null);
        return "skipped";
      }

      let apiKey: string;
      try {
        apiKey = decryptMemberkitKey(conn.apiKeyEncrypted, conn.apiKeyIv);
      } catch {
        await setMemberkitStatus(sale.id, "failed", null, null);
        return "failed";
      }

      const result = await enrollMember(apiKey, {
        fullName: sale.customerName,
        email: sale.customerEmail,
        status: cfg.status as MemberkitMemberStatus,
        classroomIds,
      });

      if (result.ok) {
        await setMemberkitStatus(sale.id, "enrolled", new Date(), result.memberkitUserId ?? null);
        return "enrolled";
      }
      fastify.log.error("Matrícula MemberKit falhou (resposta de erro da API)");
      await setMemberkitStatus(sale.id, "failed", null, null);
      return "failed";
    } catch {
      fastify.log.error("Matrícula MemberKit falhou (exceção)");
      await setMemberkitStatus(sale.id, "failed", null, null);
      return "failed";
    }
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

      const sales = rows.map(shapeManualSale);

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

      // Story 19.10: venda manual permitida em etapas "sales" e "event".
      const isEvent = stage.stageType === "event";
      if (stage.stageType !== "sales" && !isEvent) {
        return reply
          .code(400)
          .send({ error: "Vendas manuais só podem ser lançadas em etapas do tipo Vendas ou Evento Presencial" });
      }

      // Story 19.10/19.11: na etapa de Evento Presencial o email é OBRIGATÓRIO
      // (necessário para matricular o comprador no MemberKit).
      if (isEvent && !body.data.customerEmail) {
        return reply.code(400).send({
          error: "Email do cliente é obrigatório na etapa de Evento Presencial (necessário para matrícula no MemberKit)",
        });
      }

      // Vendedor: usuário da plataforma (sellerUserId) OU closer texto livre (sellerName).
      let resolvedSellerUserId: string | null = null;
      let resolvedSellerName: string;
      if (body.data.sellerUserId) {
        const [sellerUser] = await fastify.db
          .select({ id: users.id, name: users.name, email: users.email, status: users.status })
          .from(users)
          .where(eq(users.id, body.data.sellerUserId))
          .limit(1);
        if (!sellerUser || sellerUser.status === "blocked") {
          return reply.code(403).send({ error: "Vendedor não é um usuário válido" });
        }
        resolvedSellerUserId = sellerUser.id;
        resolvedSellerName = displayUserName(sellerUser.name, sellerUser.email);
      } else {
        // Closer texto livre (etapa de Evento Presencial).
        resolvedSellerName = (body.data.sellerName ?? "").trim();
        if (resolvedSellerName.length < 2) {
          return reply.code(400).send({ error: "Informe o vendedor ou o closer" });
        }
      }

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
          sellerUserId: resolvedSellerUserId,
          sellerName: resolvedSellerName,
          saleDate,
          createdBy: request.userId,
          product: body.data.product ?? null,
          invoiceStatus: body.data.invoiceStatus ?? null,
          valorRecebido: body.data.valorRecebido != null ? body.data.valorRecebido.toFixed(2) : null,
          negociacao: body.data.negociacao ?? null,
          memberkitStatus: isEvent ? "pending" : null,
        })
        .returning();

      // Story 19.11: dispara matrícula MemberKit (efeito colateral) na etapa de
      // evento. NUNCA derruba a venda — runMemberkitEnrollment trata o erro e
      // grava o status. Re-lê a linha pra refletir o status na resposta.
      let finalRow = created;
      if (isEvent) {
        await runMemberkitEnrollment(params.data.projectId, created);
        const [refreshed] = await fastify.db
          .select()
          .from(manualSales)
          .where(eq(manualSales.id, created.id))
          .limit(1);
        if (refreshed) finalRow = refreshed;
      }

      return reply.code(201).send(shapeManualSale(finalRow));
    },
  );

  // ---------------------------------------------------------------
  // PATCH — edita venda manual (parcial)
  // ---------------------------------------------------------------
  const updateSaleSchema = baseSaleObject.partial();

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

      // Story 19.10/19.11: na etapa de evento o email não pode ficar vazio
      // (matrícula MemberKit depende dele). Valida o email FINAL (novo ou existente).
      if (stage.stageType === "event") {
        const finalEmail =
          body.data.customerEmail !== undefined ? body.data.customerEmail : existing.customerEmail;
        if (!finalEmail) {
          return reply.code(400).send({
            error: "Email é obrigatório na etapa de Evento Presencial (necessário para matrícula no MemberKit)",
          });
        }
      }

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
      } else if (body.data.sellerName !== undefined && body.data.sellerName) {
        // Story 19.10: closer texto livre (etapa de evento) — sem usuário da plataforma.
        updates.sellerName = body.data.sellerName.trim();
        updates.sellerUserId = null;
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
      // Story 19.10 — Evento Presencial
      if (body.data.valorRecebido !== undefined) {
        updates.valorRecebido = body.data.valorRecebido != null ? body.data.valorRecebido.toFixed(2) : null;
      }
      if (body.data.negociacao !== undefined) updates.negociacao = body.data.negociacao ?? null;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({ error: "Nenhum campo pra atualizar" });
      }

      const [updated] = await fastify.db
        .update(manualSales)
        .set(updates)
        .where(eq(manualSales.id, params.data.saleId))
        .returning();

      return shapeManualSale(updated);
    },
  );

  // ---------------------------------------------------------------
  // GET /all-sales — Story 19.9 ext: vendas manuais + planilha unificadas
  // ---------------------------------------------------------------
  // Subtypes válidos de planilha de venda. 'all' = todos. Também aceita lista
  // CSV (ex: "main_product,tmb") pra a tabela unificada puxar só fontes
  // específicas. Vendas manuais SEMPRE entram, independente do subtype.
  const VALID_SALE_SUBTYPES = ["capture", "main_product", "sales", "tmb", "event_sales"] as const;
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
        /** Story 19.10 — valor recebido (Caixa) e negociação (evento). */
        valorRecebido: number | null;
        negociacao: string | null;
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
        valorRecebido: r.valorRecebido != null ? Number(r.valorRecebido) : null,
        negociacao: r.negociacao,
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
          closer?: string;
          telefone?: string;
          caixa?: string;
          negociacao?: string;
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

        // Story 19.10 — planilha de Evento Presencial: SEM email. Cada linha com
        // nome OU valor = 1 venda; chave por índice de linha. Closer = vendedor;
        // Telefone = telefone do cliente. Badge "Presencial".
        if (sheet.subtype === "event_sales") {
          const closerIdx = idxOf(mapping.closer);
          const telefoneIdx = idxOf(mapping.telefone);
          const caixaIdx = idxOf(mapping.caixa);
          const negociacaoIdx = idxOf(mapping.negociacao);
          let evRowIndex = -1;
          for (const row of rows) {
            evRowIndex++;
            const nome = nameIdx !== -1 ? (row[nameIdx] ?? "").trim() : "";
            const valorRaw = brutoIdx !== -1 ? row[brutoIdx] : undefined;
            const value = parseBrNumber(valorRaw);
            // Pula linhas vazias (sem nome E sem valor).
            if (!nome && value <= 0) continue;

            const dt = dataIdx !== -1 ? parseSheetDate(row[dataIdx]) : null;
            if (dt && dt < cutoff) continue;

            const closer = closerIdx !== -1 ? (row[closerIdx] ?? "").trim() : "";
            const telefone = telefoneIdx !== -1 ? (row[telefoneIdx] ?? "").trim() : "";
            const produto = productIdx !== -1 ? (row[productIdx] ?? "").trim() : "";
            const caixa = caixaIdx !== -1 ? parseBrNumber(row[caixaIdx]) : 0;
            const negociacao = negociacaoIdx !== -1 ? (row[negociacaoIdx] ?? "").trim() : "";

            out.push({
              id: `sheet:${sheet.id}:row|${evRowIndex}`,
              source: "spreadsheet",
              customerName: nome || null,
              customerEmail: null,
              customerPhone: telefone || null,
              product: produto || null,
              value,
              sellerName: closer || null,
              saleDate: dt ? dt.toISOString() : null,
              invoiceStatus: null,
              manualSaleId: null,
              sourceLabel: "Presencial",
              valorRecebido: caixaIdx !== -1 ? caixa : null,
              negociacao: negociacao || null,
            });
          }
          continue;
        }

        if (emailIdx === -1) continue;

        let rowIndex = -1;
        for (const row of rows) {
          rowIndex++;
          const email = (row[emailIdx] ?? "").trim().toLowerCase();
          if (!email) continue;

          const dt = dataIdx !== -1 ? parseSheetDate(row[dataIdx]) : null;
          if (dt && dt < cutoff) continue;

          // Dash de Vendas: dedup por (transaction_id + produto). Order bumps —
          // mesmo pedido (mesmo ID) com produtos diferentes, ex: Basic + Advanced
          // — contam como vendas separadas; só retry literal (mesmo pedido +
          // mesmo produto) é colapsado. Sem txId, cada linha é uma venda distinta.
          const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
          const explicitProduct = productIdx !== -1 ? (row[productIdx] ?? "").trim() : "";
          if (txId) {
            const dedupKey = `${sheet.id}|tx|${txId}|${explicitProduct.toLowerCase()}`;
            if (seenDedup.has(dedupKey)) continue;
            seenDedup.add(dedupKey);
          }
          const rowId = txId ? `tx|${txId}|${explicitProduct}` : `row|${rowIndex}`;

          const value = parseBrNumber(row[brutoIdx]);
          const canal = canalIdx !== -1 ? (row[canalIdx] ?? "").trim() : "";
          const utm = utmSourceIdx !== -1 ? (row[utmSourceIdx] ?? "").trim() : "";
          const explicitName = nameIdx !== -1 ? (row[nameIdx] ?? "").trim() : "";

          out.push({
            id: `sheet:${sheet.id}:${rowId}`,
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
            valorRecebido: null,
            negociacao: null,
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

  // ---------------------------------------------------------------
  // POST /:saleId/memberkit-enroll — Story 19.11: matrícula manual/retry
  // ---------------------------------------------------------------
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/manual-sales/:saleId/memberkit-enroll",
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

      const [sale] = await fastify.db
        .select()
        .from(manualSales)
        .where(and(eq(manualSales.id, params.data.saleId), eq(manualSales.stageId, params.data.stageId)))
        .limit(1);
      if (!sale) return reply.code(404).send({ error: "Venda não encontrada" });

      if (!sale.customerEmail) {
        return reply.code(400).send({ error: "Venda sem email — preencha o email do cliente antes de matricular" });
      }

      const status = await runMemberkitEnrollment(params.data.projectId, sale);
      const [refreshed] = await fastify.db
        .select()
        .from(manualSales)
        .where(eq(manualSales.id, sale.id))
        .limit(1);

      if (status !== "enrolled") {
        return reply.code(502).send({ error: "Matrícula no MemberKit não concluída", status, sale: refreshed ? shapeManualSale(refreshed) : null });
      }
      return { status, sale: refreshed ? shapeManualSale(refreshed) : null };
    },
  );
});
