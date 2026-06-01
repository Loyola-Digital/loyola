/**
 * Story 19.9 — Manual Sales (Vendas PIX Direto)
 *
 * Persiste vendas lançadas manualmente no app (fora da planilha Sheets) pra
 * etapas tipo `sales`. Endpoint segrega essas vendas em seção própria no
 * dashboard — não soma com as vendas da planilha.
 */

import { z } from "zod";
import { eq, and, gte, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  manualSales,
  funnelStages,
  funnels,
  projects,
  projectMembers,
  users,
} from "../db/schema.js";

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
   * Lista os usuários elegíveis pra vendedor em um projeto:
   * owner (projects.createdBy) + todos os project_members.
   * Dedup por userId — owner que também é member aparece uma vez.
   */
  async function getEligibleSellers(projectId: string) {
    const [project] = await fastify.db
      .select({ id: projects.id, ownerId: projects.createdBy })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return [];

    const memberRows = await fastify.db
      .select({
        userId: projectMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));

    const memberMap = new Map(memberRows.map((r) => [r.userId, r]));

    if (!memberMap.has(project.ownerId)) {
      const [owner] = await fastify.db
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, project.ownerId))
        .limit(1);
      if (owner) memberMap.set(owner.userId, owner);
    }

    return Array.from(memberMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
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

      const sellers = await getEligibleSellers(projectId);
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

      // Vendedor deve ser elegível: owner do projeto OU member
      const eligibleSellers = await getEligibleSellers(params.data.projectId);
      const sellerMembership = eligibleSellers.find(
        (s) => s.userId === body.data.sellerUserId,
      );

      if (!sellerMembership) {
        return reply.code(403).send({ error: "Vendedor não é elegível neste projeto" });
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
          sellerUserId: sellerMembership.userId,
          sellerName: sellerMembership.name,
          saleDate,
          createdBy: request.userId,
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
      });
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
