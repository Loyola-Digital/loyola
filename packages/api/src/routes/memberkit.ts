// Story 19.11 — Rotas MemberKit (integração nativa de matrícula).
//
// - Connection CRUD por projeto (API key cifrada AES; GET retorna só {connected}).
// - Pickers de turmas/cursos (para a UI escolher onde matricular).
// - Config de matrícula por etapa (classroom_ids + status + autoEnroll).
//
// SEGURANÇA: GET connection NUNCA retorna a key. A key vai na query string da
// API do MemberKit (service) — nunca logar a URL crua.

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  memberkitConnections,
  stageMemberkitEnrollment,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import {
  encryptMemberkitKey,
  decryptMemberkitKey,
  testMemberkitConnection,
  listClassrooms,
  listCourses,
} from "../services/memberkit.js";

const projectParamsSchema = z.object({ projectId: z.string().uuid() });

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const connectionBodySchema = z.object({
  apiKey: z.string().trim().min(1),
});

const enrollmentBodySchema = z.object({
  classroomIds: z.array(z.number().int().positive()).default([]),
  status: z.enum(["active", "inactive", "pending", "expired"]).default("active"),
  autoEnroll: z.boolean().default(true),
});

export default fp(async function memberkitRoutes(fastify) {
  // Acesso ao projeto (espelho de hotmart.ts/mautic.ts): guest sem vínculo -> 404.
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

  async function getConnectionRow(projectId: string) {
    const [row] = await fastify.db
      .select()
      .from(memberkitConnections)
      .where(eq(memberkitConnections.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  /** API key decifrada do projeto, ou null se não conectado/decifra falhar. */
  async function getApiKey(projectId: string): Promise<string | null> {
    const row = await getConnectionRow(projectId);
    if (!row) return null;
    try {
      return decryptMemberkitKey(row.apiKeyEncrypted, row.apiKeyIv);
    } catch {
      return null;
    }
  }

  /** Confirma que a etapa pertence ao funil/projeto. */
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

  // ---- GET connection (status, sem credenciais) ----
  fastify.get("/api/projects/:projectId/memberkit/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const row = await getConnectionRow(params.data.projectId);
    return { connected: Boolean(row) };
  });

  // ---- PUT connection (valida a key, criptografa e salva) ----
  fastify.put("/api/projects/:projectId/memberkit/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Valida a key ANTES de persistir.
    try {
      await testMemberkitConnection(body.data.apiKey);
    } catch (err) {
      request.log.error("MemberKit connection validation failed");
      return reply.code(502).send({
        error: "Falha ao conectar no MemberKit. Verifique a API key.",
        details: err instanceof Error ? err.message : "erro desconhecido",
      });
    }

    const enc = encryptMemberkitKey(body.data.apiKey);
    const now = new Date();
    await fastify.db
      .insert(memberkitConnections)
      .values({
        projectId: params.data.projectId,
        apiKeyEncrypted: enc.encrypted,
        apiKeyIv: enc.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: memberkitConnections.projectId,
        set: { apiKeyEncrypted: enc.encrypted, apiKeyIv: enc.iv, updatedAt: now },
      });

    return { connected: true };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/memberkit/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(memberkitConnections)
      .where(eq(memberkitConnections.projectId, params.data.projectId));
    return { connected: false };
  });

  // ---- GET classrooms (picker de turma) ----
  fastify.get("/api/projects/:projectId/memberkit/classrooms", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const apiKey = await getApiKey(params.data.projectId);
    if (!apiKey) return reply.code(409).send({ error: "MemberKit não conectado neste projeto" });

    try {
      const rows = await listClassrooms(apiKey);
      return {
        classrooms: rows.map((c) => ({
          id: c.id,
          name: c.name,
          courseName: c.course_name ?? null,
        })),
      };
    } catch (err) {
      request.log.error("Erro ao listar turmas do MemberKit");
      return reply.code(502).send({
        error: "Erro ao listar turmas do MemberKit",
        details: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  });

  // ---- GET courses (exibição/agrupamento) ----
  fastify.get("/api/projects/:projectId/memberkit/courses", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const apiKey = await getApiKey(params.data.projectId);
    if (!apiKey) return reply.code(409).send({ error: "MemberKit não conectado neste projeto" });

    try {
      const rows = await listCourses(apiKey);
      return { courses: rows.map((c) => ({ id: c.id, name: c.name })) };
    } catch (err) {
      request.log.error("Erro ao listar cursos do MemberKit");
      return reply.code(502).send({
        error: "Erro ao listar cursos do MemberKit",
        details: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  });

  // ---- GET stage enrollment config ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/memberkit-enrollment",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [row] = await fastify.db
        .select()
        .from(stageMemberkitEnrollment)
        .where(eq(stageMemberkitEnrollment.stageId, params.data.stageId))
        .limit(1);

      if (!row) {
        return { stageId: params.data.stageId, classroomIds: [], status: "active", autoEnroll: true };
      }
      return {
        stageId: row.stageId,
        classroomIds: row.classroomIds,
        status: row.status,
        autoEnroll: row.autoEnroll,
      };
    },
  );

  // ---- PUT stage enrollment config ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/memberkit-enrollment",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = enrollmentBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const now = new Date();
      await fastify.db
        .insert(stageMemberkitEnrollment)
        .values({
          stageId: params.data.stageId,
          classroomIds: body.data.classroomIds,
          status: body.data.status,
          autoEnroll: body.data.autoEnroll,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: stageMemberkitEnrollment.stageId,
          set: {
            classroomIds: body.data.classroomIds,
            status: body.data.status,
            autoEnroll: body.data.autoEnroll,
            updatedAt: now,
          },
        });

      return {
        stageId: params.data.stageId,
        classroomIds: body.data.classroomIds,
        status: body.data.status,
        autoEnroll: body.data.autoEnroll,
      };
    },
  );
});
