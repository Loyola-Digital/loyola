import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStageZoomConnections,
  funnelStageZoomMeetings,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import {
  decryptZoomConnection,
  fetchAllParticipants,
  getServerToServerToken,
  listPastMeetings,
  resolveMeetingUuids,
} from "../services/zoom.js";
import { encrypt } from "../services/encryption.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

export default fp(async function zoomStageRoutes(fastify) {
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

  async function checkStage(projectId: string, funnelId: string, stageId: string) {
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

  async function getConnection(stageId: string) {
    const [row] = await fastify.db
      .select()
      .from(funnelStageZoomConnections)
      .where(eq(funnelStageZoomConnections.stageId, stageId))
      .limit(1);
    return row ?? null;
  }

  // ------------ GET connection ------------
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/connection", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await checkStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const conn = await getConnection(params.data.stageId);
    if (!conn) return { connected: false };
    return {
      connected: true,
      accountId: conn.accountId,
      clientId: conn.clientId,
      createdAt: conn.createdAt.toISOString(),
      updatedAt: conn.updatedAt.toISOString(),
    };
  });

  // ------------ POST connection (create or update) ------------
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const bodySchema = z.object({
      accountId: z.string().min(1),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Body inválido", details: body.error.flatten() });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const stage = await checkStage(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // Valida credenciais antes de salvar
    try {
      await getServerToServerToken(body.data.accountId, body.data.clientId, body.data.clientSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: "Credenciais Zoom inválidas", details: message });
    }

    const enc = encrypt(body.data.clientSecret);
    await fastify.db
      .insert(funnelStageZoomConnections)
      .values({
        stageId: params.data.stageId,
        accountId: body.data.accountId,
        clientId: body.data.clientId,
        clientSecretEncrypted: enc.encrypted,
        clientSecretIv: enc.iv,
      })
      .onConflictDoUpdate({
        target: funnelStageZoomConnections.stageId,
        set: {
          accountId: body.data.accountId,
          clientId: body.data.clientId,
          clientSecretEncrypted: enc.encrypted,
          clientSecretIv: enc.iv,
          updatedAt: new Date(),
        },
      });

    return { connected: true };
  });

  // ------------ DELETE connection ------------
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    await fastify.db.delete(funnelStageZoomConnections).where(eq(funnelStageZoomConnections.stageId, params.data.stageId));
    return reply.code(204).send();
  });

  // ------------ GET past meetings (lista do Zoom) ------------
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/past-meetings", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const conn = await getConnection(params.data.stageId);
    if (!conn) return reply.code(404).send({ error: "Conexão Zoom não configurada" });

    try {
      const decrypted = decryptZoomConnection(conn);
      const token = await getServerToServerToken(decrypted.accountId, decrypted.clientId, decrypted.clientSecret);
      const meetings = await listPastMeetings(token);
      return {
        meetings: meetings.map((m) => ({
          id: String(m.id),
          uuid: m.uuid,
          topic: m.topic,
          startTime: m.start_time,
          durationMinutes: m.duration,
        })),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: "Erro Zoom", details: message });
    }
  });

  // ------------ GET linked meetings (vinculadas à stage) ------------
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/meetings", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const rows = await fastify.db
      .select()
      .from(funnelStageZoomMeetings)
      .where(eq(funnelStageZoomMeetings.stageId, params.data.stageId));
    return {
      meetings: rows.map((r) => ({
        id: r.id,
        meetingId: r.meetingId,
        meetingUuid: r.meetingUuid,
        topic: r.topic,
        label: r.label,
        startTime: r.startTime?.toISOString() ?? null,
        durationMinutes: r.durationMinutes,
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
      })),
    };
  });

  // ------------ POST link meeting ------------
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/meetings", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const bodySchema = z.object({
      meetingId: z.string().min(1),
      label: z.string().max(255).optional(),
    });
    const body = bodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Body inválido", details: body.error.flatten() });

    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const conn = await getConnection(params.data.stageId);
    if (!conn) return reply.code(404).send({ error: "Conexão Zoom não configurada" });

    try {
      const decrypted = decryptZoomConnection(conn);
      const token = await getServerToServerToken(decrypted.accountId, decrypted.clientId, decrypted.clientSecret);
      const uuids = await resolveMeetingUuids(token, body.data.meetingId);
      const targetUuid = uuids[uuids.length - 1];

      // Pega metadata do past_meetings pra ter topic/start_time
      const pastUrl = `https://api.zoom.us/v2/past_meetings/${body.data.meetingId.replace(/^\d/, body.data.meetingId.charAt(0))}`;
      let topic: string | null = null;
      let startTime: Date | null = null;
      let durationMinutes: number | null = null;
      try {
        const meta = await fetch(`https://api.zoom.us/v2/past_meetings/${body.data.meetingId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meta.ok) {
          const m = (await meta.json()) as { topic?: string; start_time?: string; duration?: number };
          topic = m.topic ?? null;
          startTime = m.start_time ? new Date(m.start_time) : null;
          durationMinutes = m.duration ?? null;
        }
      } catch {
        // metadata é opcional
      }
      void pastUrl;

      await fastify.db
        .insert(funnelStageZoomMeetings)
        .values({
          stageId: params.data.stageId,
          meetingId: body.data.meetingId,
          meetingUuid: targetUuid,
          topic,
          label: body.data.label,
          startTime,
          durationMinutes,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [funnelStageZoomMeetings.stageId, funnelStageZoomMeetings.meetingUuid],
          set: { label: body.data.label, lastSyncedAt: new Date() },
        });

      return { success: true, meetingUuid: targetUuid };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: "Erro ao vincular reunião", details: message });
    }
  });

  // ------------ DELETE linked meeting ------------
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/meetings/:meetingRowId", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const extParams = paramsSchema.extend({ meetingRowId: z.string().uuid() });
    const params = extParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    await fastify.db
      .delete(funnelStageZoomMeetings)
      .where(
        and(
          eq(funnelStageZoomMeetings.id, params.data.meetingRowId),
          eq(funnelStageZoomMeetings.stageId, params.data.stageId),
        ),
      );
    return reply.code(204).send();
  });

  // ------------ GET participants of linked meeting ------------
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/meetings/:meetingRowId/participants", async (request, reply) => {
    const extParams = paramsSchema.extend({ meetingRowId: z.string().uuid() });
    const params = extParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const conn = await getConnection(params.data.stageId);
    if (!conn) return reply.code(404).send({ error: "Conexão Zoom não configurada" });

    const [meetingRow] = await fastify.db
      .select()
      .from(funnelStageZoomMeetings)
      .where(
        and(
          eq(funnelStageZoomMeetings.id, params.data.meetingRowId),
          eq(funnelStageZoomMeetings.stageId, params.data.stageId),
        ),
      )
      .limit(1);
    if (!meetingRow) return reply.code(404).send({ error: "Reunião não vinculada" });

    try {
      const decrypted = decryptZoomConnection(conn);
      const token = await getServerToServerToken(decrypted.accountId, decrypted.clientId, decrypted.clientSecret);
      const { participants, source, attempts } = await fetchAllParticipants(
        token,
        meetingRow.meetingId,
        meetingRow.meetingUuid,
      );
      // Log das tentativas pra debug — aparece no console do API server
      fastify.log.info({ msg: "Zoom participants fetch attempts", meetingId: meetingRow.meetingId, attempts });
      return {
        source,
        attempts,
        participants: participants.map((p) => ({
          id: p.id ?? null,
          name: p.name ?? "",
          email: p.user_email ?? null,
          joinTime: p.join_time ?? null,
          leaveTime: p.leave_time ?? null,
          durationSeconds: p.duration ?? 0,
          status: p.status ?? null,
        })),
        total: participants.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: "Erro ao consultar Zoom", details: message });
    }
  });
});
