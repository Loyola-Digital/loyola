/**
 * Brief v5 #2 (Evento Presencial) — Custos operacionais da etapa.
 *
 * CRUD interno (dashboard) + endpoint PÚBLICO (MCP/API key) com agregados.
 * É o denominador que faltava pro ROAS REAL do evento: spend Meta sozinho
 * ignora venue, staff, logística, hospedagem etc.
 */

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageOperationalCosts,
  funnelStages,
  funnels,
  projectMembers,
} from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import { PUBLIC_READ_SCOPE } from "./public-discovery.js";

export const COST_CATEGORIES = [
  "venue",
  "staff",
  "logistica",
  "hospedagem",
  "alimentacao",
  "marketing",
  "outros",
] as const;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const costBodySchema = z.object({
  category: z.enum(COST_CATEGORIES),
  description: z.string().trim().max(255).optional().nullable(),
  amount: z.number().positive(),
  incurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

const updateBodySchema = costBodySchema.partial();

export default fp(async function stageOperationalCostsRoutes(fastify) {
  /** Valida a cadeia project→funnel→stage e o acesso de guest ao projeto. */
  async function resolveStage(
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
    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
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

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/operational-costs";

  // ---- GET — lista custos + total ----
  fastify.get(base, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId, stageId } = parsed.data;
    const stage = await resolveStage(projectId, funnelId, stageId, request.userId, request.userRole);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select()
      .from(stageOperationalCosts)
      .where(eq(stageOperationalCosts.stageId, stageId))
      .orderBy(asc(stageOperationalCosts.createdAt));

    const items = rows.map((r) => ({
      id: r.id,
      category: r.category,
      description: r.description,
      amount: parseFloat(r.amount),
      incurredAt: r.incurredAt,
      createdAt: r.createdAt,
    }));
    const totalCosts = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    return { items, totalCosts };
  });

  // ---- POST — cria custo ----
  fastify.post(base, async (request, reply) => {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = costBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const { projectId, funnelId, stageId } = parsed.data;
    const stage = await resolveStage(projectId, funnelId, stageId, request.userId, request.userRole);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [created] = await fastify.db
      .insert(stageOperationalCosts)
      .values({
        stageId,
        category: body.data.category,
        description: body.data.description ?? null,
        amount: String(body.data.amount),
        incurredAt: body.data.incurredAt ?? null,
        createdBy: request.userId,
      })
      .returning();
    return reply.code(201).send({ ...created, amount: parseFloat(created.amount) });
  });

  // ---- PATCH /:costId — edita custo ----
  fastify.patch(`${base}/:costId`, async (request, reply) => {
    const parsed = paramsSchema.extend({ costId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = updateBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const { projectId, funnelId, stageId, costId } = parsed.data;
    const stage = await resolveStage(projectId, funnelId, stageId, request.userId, request.userRole);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.category !== undefined) set.category = body.data.category;
    if (body.data.description !== undefined) set.description = body.data.description ?? null;
    if (body.data.amount !== undefined) set.amount = String(body.data.amount);
    if (body.data.incurredAt !== undefined) set.incurredAt = body.data.incurredAt ?? null;

    const [updated] = await fastify.db
      .update(stageOperationalCosts)
      .set(set)
      .where(and(eq(stageOperationalCosts.id, costId), eq(stageOperationalCosts.stageId, stageId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Custo não encontrado" });
    return { ...updated, amount: parseFloat(updated.amount) };
  });

  // ---- DELETE /:costId ----
  fastify.delete(`${base}/:costId`, async (request, reply) => {
    const parsed = paramsSchema.extend({ costId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId, stageId, costId } = parsed.data;
    const stage = await resolveStage(projectId, funnelId, stageId, request.userId, request.userRole);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [deleted] = await fastify.db
      .delete(stageOperationalCosts)
      .where(and(eq(stageOperationalCosts.id, costId), eq(stageOperationalCosts.stageId, stageId)))
      .returning({ id: stageOperationalCosts.id });
    if (!deleted) return reply.code(404).send({ error: "Custo não encontrado" });
    return { ok: true };
  });

  // ---------------------------------------------------------------
  // PÚBLICO (MCP/API key) — GET .../stages/:stageId/operational-costs
  // Leitura AO VIVO da tabela (sem cache — dado pequeno). Zero PII.
  // ---------------------------------------------------------------
  fastify.get<{ Params: { projectId: string; stageId: string } }>(
    "/api/public/v1/projects/:projectId/stages/:stageId/operational-costs",
    { preHandler: requireScope(PUBLIC_READ_SCOPE) },
    async (request, reply) => {
      const parsed = z
        .object({ projectId: z.string().uuid(), stageId: z.string().uuid() })
        .safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Parâmetros inválidos", code: "BAD_REQUEST" });
      }
      const { projectId, stageId } = parsed.data;

      const rows = await fastify.db
        .select({
          category: stageOperationalCosts.category,
          description: stageOperationalCosts.description,
          amount: stageOperationalCosts.amount,
          incurredAt: stageOperationalCosts.incurredAt,
        })
        .from(stageOperationalCosts)
        .innerJoin(funnelStages, eq(funnelStages.id, stageOperationalCosts.stageId))
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(and(eq(stageOperationalCosts.stageId, stageId), eq(funnels.projectId, projectId)))
        .orderBy(asc(stageOperationalCosts.createdAt));

      if (rows.length === 0) {
        return {
          projectId,
          stageId,
          semDados: true,
          message: "Nenhum custo operacional lançado nesta etapa.",
        };
      }

      const items = rows.map((r) => ({
        category: r.category,
        description: r.description,
        amount: parseFloat(r.amount),
        incurredAt: r.incurredAt,
      }));
      const byCategory = new Map<string, { total: number; itens: number }>();
      for (const i of items) {
        const e = byCategory.get(i.category) ?? { total: 0, itens: 0 };
        e.total += i.amount;
        e.itens += 1;
        byCategory.set(i.category, e);
      }
      return {
        projectId,
        stageId,
        totalCosts: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100,
        byCategory: [...byCategory.entries()].map(([category, e]) => ({
          category,
          total: Math.round(e.total * 100) / 100,
          itens: e.itens,
        })),
        items,
      };
    },
  );
});
