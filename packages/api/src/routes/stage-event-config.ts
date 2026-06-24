// Story 19.12 — Config da etapa de Evento Presencial: produtos (com turma
// MemberKit cada) e closers cadastrados. PUT substitui a lista inteira.

import { z } from "zod";
import { eq, and, asc, ne, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  stageEventProducts,
  stageEventClosers,
  stageEventMirroredSheets,
  stageSalesSpreadsheets,
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

const funnelParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const mirrorBodySchema = z.object({
  sourceSpreadsheetIds: z.array(z.string().uuid()).max(100),
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

  // ---- PLANILHAS DO FUNIL (para o evento escolher quais espelhar) ----
  // Lista todas as planilhas de vendas conectadas em qualquer etapa do funil,
  // exceto as do tipo event_sales (legado) — com o nome da etapa de origem.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/sales-spreadsheets-all",
    async (request, reply) => {
      const params = funnelParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // Confirma que o funil pertence ao projeto (evita IDOR cross-projeto).
      const [funnel] = await fastify.db
        .select({ id: funnels.id })
        .from(funnels)
        .where(and(eq(funnels.id, params.data.funnelId), eq(funnels.projectId, params.data.projectId)))
        .limit(1);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });

      const rows = await fastify.db
        .select({
          id: stageSalesSpreadsheets.id,
          stageId: stageSalesSpreadsheets.stageId,
          stageName: funnelStages.name,
          subtype: stageSalesSpreadsheets.subtype,
          spreadsheetName: stageSalesSpreadsheets.spreadsheetName,
          sheetName: stageSalesSpreadsheets.sheetName,
        })
        .from(stageSalesSpreadsheets)
        .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
        .where(eq(funnelStages.funnelId, params.data.funnelId))
        .orderBy(asc(funnelStages.sortOrder), asc(stageSalesSpreadsheets.subtype));

      return {
        spreadsheets: rows
          .filter((r) => r.subtype !== "event_sales")
          .map((r) => ({
            id: r.id,
            stageId: r.stageId,
            stageName: r.stageName,
            subtype: r.subtype,
            spreadsheetName: r.spreadsheetName,
            sheetName: r.sheetName,
          })),
      };
    },
  );

  // ---- ESPELHAMENTO (quais planilhas do funil aparecem no evento) ----
  fastify.get(`${base}/event-mirrored-sheets`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const rows = await fastify.db
      .select({ sourceSpreadsheetId: stageEventMirroredSheets.sourceSpreadsheetId })
      .from(stageEventMirroredSheets)
      .where(eq(stageEventMirroredSheets.eventStageId, params.data.stageId));

    return { sourceSpreadsheetIds: rows.map((r) => r.sourceSpreadsheetId) };
  });

  fastify.put(`${base}/event-mirrored-sheets`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = mirrorBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Valida que as planilhas escolhidas pertencem ao MESMO funil (segurança).
    const ids = Array.from(new Set(body.data.sourceSpreadsheetIds));
    let validIds: string[] = [];
    if (ids.length > 0) {
      const valid = await fastify.db
        .select({ id: stageSalesSpreadsheets.id })
        .from(stageSalesSpreadsheets)
        .innerJoin(funnelStages, eq(funnelStages.id, stageSalesSpreadsheets.stageId))
        .where(
          and(
            eq(funnelStages.funnelId, params.data.funnelId),
            inArray(stageSalesSpreadsheets.id, ids),
            // Não espelhar planilhas event_sales (alinha com o filtro do GET).
            ne(stageSalesSpreadsheets.subtype, "event_sales"),
          ),
        );
      validIds = valid.map((v) => v.id);
    }

    await fastify.db.transaction(async (tx) => {
      await tx.delete(stageEventMirroredSheets).where(eq(stageEventMirroredSheets.eventStageId, params.data.stageId));
      if (validIds.length > 0) {
        await tx.insert(stageEventMirroredSheets).values(
          validIds.map((sid) => ({ eventStageId: params.data.stageId, sourceSpreadsheetId: sid })),
        );
      }
    });

    return { sourceSpreadsheetIds: validIds };
  });
});
