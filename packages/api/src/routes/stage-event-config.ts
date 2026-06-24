// Story 19.12 — Config da etapa de Evento Presencial: produtos (com turma
// MemberKit cada) e closers cadastrados. PUT substitui a lista inteira.

import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageEventProducts,
  stageEventClosers,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const productsBodySchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        memberkitClassroomId: z.number().int().positive().nullable().optional(),
        memberkitClassroomName: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .max(200),
});

const closersBodySchema = z.object({
  closers: z.array(z.object({ name: z.string().trim().min(1).max(255) })).max(200),
});

export default fp(async function stageEventConfigRoutes(fastify) {
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

  async function getStage(projectId: string, funnelId: string, stageId: string) {
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

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId";

  // ---- PRODUTOS ----
  fastify.get(`${base}/event-products`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select()
      .from(stageEventProducts)
      .where(eq(stageEventProducts.stageId, params.data.stageId))
      .orderBy(asc(stageEventProducts.sortOrder), asc(stageEventProducts.name));

    return {
      products: rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        name: r.name,
        memberkitClassroomId: r.memberkitClassroomId,
        memberkitClassroomName: r.memberkitClassroomName,
        sortOrder: r.sortOrder,
      })),
    };
  });

  fastify.put(`${base}/event-products`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = productsBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Dedup por nome (case-insensitive) mantendo a 1ª ocorrência — o lookup de
    // turma na matrícula casa por nome, então nomes duplicados tornariam a turma
    // ambígua.
    const seenNames = new Set<string>();
    const dedupedProducts = body.data.products.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // PUT substitui a lista inteira (delete + insert) numa transação.
    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventProducts).where(eq(stageEventProducts.stageId, params.data.stageId));
      if (dedupedProducts.length > 0) {
        await tx.insert(stageEventProducts).values(
          dedupedProducts.map((p, i) => ({
            stageId: params.data.stageId,
            name: p.name,
            memberkitClassroomId: p.memberkitClassroomId ?? null,
            memberkitClassroomName: p.memberkitClassroomName ?? null,
            sortOrder: i,
          })),
        );
      }
    });

    const rows = await fastify.db
      .select()
      .from(stageEventProducts)
      .where(eq(stageEventProducts.stageId, params.data.stageId))
      .orderBy(asc(stageEventProducts.sortOrder), asc(stageEventProducts.name));

    return {
      products: rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        name: r.name,
        memberkitClassroomId: r.memberkitClassroomId,
        memberkitClassroomName: r.memberkitClassroomName,
        sortOrder: r.sortOrder,
      })),
    };
  });

  // ---- CLOSERS ----
  fastify.get(`${base}/event-closers`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select()
      .from(stageEventClosers)
      .where(eq(stageEventClosers.stageId, params.data.stageId))
      .orderBy(asc(stageEventClosers.sortOrder), asc(stageEventClosers.name));

    return { closers: rows.map((r) => ({ id: r.id, stageId: r.stageId, name: r.name, sortOrder: r.sortOrder })) };
  });

  fastify.put(`${base}/event-closers`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = closersBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Dedup por nome (case-insensitive) mantendo a 1ª ocorrência.
    const seenCloserNames = new Set<string>();
    const dedupedClosers = body.data.closers.filter((cl) => {
      const key = cl.name.trim().toLowerCase();
      if (seenCloserNames.has(key)) return false;
      seenCloserNames.add(key);
      return true;
    });

    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventClosers).where(eq(stageEventClosers.stageId, params.data.stageId));
      if (dedupedClosers.length > 0) {
        await tx.insert(stageEventClosers).values(
          dedupedClosers.map((cl, i) => ({ stageId: params.data.stageId, name: cl.name, sortOrder: i })),
        );
      }
    });

    const rows = await fastify.db
      .select()
      .from(stageEventClosers)
      .where(eq(stageEventClosers.stageId, params.data.stageId))
      .orderBy(asc(stageEventClosers.sortOrder), asc(stageEventClosers.name));

    return { closers: rows.map((r) => ({ id: r.id, stageId: r.stageId, name: r.name, sortOrder: r.sortOrder })) };
  });
});
