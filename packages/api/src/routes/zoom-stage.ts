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
  fetchMeetingChat,
  getServerToServerToken,
  listAllPastMeetings,
  resolveMeetingUuids,
  type ZoomChatMessage,
  type ZoomParticipantRaw,
} from "../services/zoom.js";
import { encrypt } from "../services/encryption.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

// Estado de sync ativo em memória (true = sincronizando agora, false/missing
// = idle). Persistente entre requests do mesmo processo. Reset em restart.
const syncingMeetings = new Set<string>();

// Nomes genéricos do Zoom — quando aparecem sem email, são placeholders pra
// múltiplas pessoas distintas. NÃO podem ser deduplicados (cada sessão = uma
// pessoa diferente).
const GENERIC_ZOOM_NAMES = [
  /^usu[aá]rio do zoom$/i,
  /^zoom user$/i,
  /^convidado$/i,
  /^guest$/i,
  /^anonymous$/i,
  /^an[oô]nimo$/i,
  /^participant\s*\d*$/i,
  /^attendee\s*\d*$/i,
  /^iphone$/i,
  /^ipad$/i,
  /^android$/i,
  /^iphone\s+de.*$/i,
];

function isGenericName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return GENERIC_ZOOM_NAMES.some((re) => re.test(trimmed));
}

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
      const meetings = await listAllPastMeetings(token);
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

  // ============================================================
  // Sync helper — paraleliza instâncias e salva cached_data no DB
  // ============================================================
  async function syncMeetingParticipants(
    accountId: string,
    clientId: string,
    clientSecret: string,
    meetingRowId: string,
    meetingNumericId: string,
  ): Promise<void> {
    if (syncingMeetings.has(meetingRowId)) return;
    syncingMeetings.add(meetingRowId);
    try {
      const token = await getServerToServerToken(accountId, clientId, clientSecret);
      const allUuids = await resolveMeetingUuids(token, meetingNumericId);

      // CRÍTICO: a Report API do Zoom é "Heavy" rate-limited. Buscar todas as
      // instâncias em PARALELO estourava o limite → 429 silencioso → instâncias
      // cheias (ex: CPL com 300+ pessoas) eram descartadas. Por isso buscamos
      // SEQUENCIALMENTE. O source detectado na 1ª instância com dados memoiza as
      // demais (preferSource) pra cortar chamadas pela metade.
      const allInstanceResults: Array<{ participants: ZoomParticipantRaw[]; source: "webinar" | "meeting" }> = [];
      let detectedSource: "webinar" | "meeting" | undefined;
      for (const uuid of allUuids) {
        const res = await fetchAllParticipants(token, meetingNumericId, uuid, detectedSource);
        if (!detectedSource && res.participants.length > 0) detectedSource = res.source;
        allInstanceResults.push(res);
      }
      const resolvedSource: "webinar" | "meeting" = detectedSource ?? "meeting";

      // Story 28.6: chat de TODAS instâncias, também SEQUENCIAL (mesmo motivo de
      // rate limit). Graceful — se chat não estiver disponível, ignora a
      // instância e segue. Mescla resultados (Large Meetings agregadas).
      const chatMap = new Map<string, ZoomChatMessage>();
      for (const uuid of allUuids) {
        try {
          const msgs = await fetchMeetingChat(token, meetingNumericId, uuid);
          for (const msg of msgs) {
            // Dedup por (sender + dateTime + message) — instâncias podem repetir
            const key = `${msg.sender}|${msg.dateTime}|${msg.message}`;
            if (!chatMap.has(key)) chatMap.set(key, msg);
          }
        } catch {
          // chat indisponível nesta instância — segue (não quebra o sync)
        }
      }
      const chat = Array.from(chatMap.values()).sort((a, b) =>
        a.dateTime.localeCompare(b.dateTime),
      );

      const allSessions: ZoomParticipantRaw[] = [];
      for (const inst of allInstanceResults) {
        const seen = new Set<string>();
        for (const p of inst.participants) {
          const key = `${p.name ?? ""}|${p.join_time ?? ""}|${p.leave_time ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allSessions.push(p);
        }
      }

      // Dedup por pessoa
      interface AggregatedPerson {
        id: string | null;
        name: string;
        email: string | null;
        joinTime: string | null;
        leaveTime: string | null;
        durationSeconds: number;
        sessions: number;
        status: string | null;
      }
      const personMap = new Map<string, AggregatedPerson>();
      // Sessões genéricas (sem email + nome placeholder) NÃO são deduplicadas.
      // Cada uma vira uma "pessoa" separada na lista. Usa contador pra chave
      // única.
      let genericCounter = 0;
      for (const s of allSessions) {
        const email = (s.user_email ?? "").trim().toLowerCase();
        const name = (s.name ?? "").trim();

        // Estratégia de dedup:
        // - Email existe → dedup por email (mais confiável)
        // - Email vazio + nome NÃO genérico → dedup por nome
        // - Email vazio + nome genérico ("Usuário do Zoom" etc) → NÃO dedup
        let key: string;
        if (email) {
          key = `email:${email}`;
        } else if (name && !isGenericName(name)) {
          key = `name:${name.toLowerCase()}`;
        } else {
          // Nome genérico ou ausente: cada sessão é tratada como pessoa única
          genericCounter++;
          key = `generic:${genericCounter}`;
        }

        const existing = personMap.get(key);
        if (existing) {
          existing.durationSeconds += s.duration ?? 0;
          existing.sessions += 1;
          if (s.join_time && (!existing.joinTime || s.join_time < existing.joinTime)) existing.joinTime = s.join_time;
          if (s.leave_time && (!existing.leaveTime || s.leave_time > existing.leaveTime)) existing.leaveTime = s.leave_time;
        } else {
          personMap.set(key, {
            id: s.id ?? null,
            name: name || email || "Sem nome",
            email: email || null,
            joinTime: s.join_time ?? null,
            leaveTime: s.leave_time ?? null,
            durationSeconds: s.duration ?? 0,
            sessions: 1,
            status: s.status ?? null,
          });
        }
      }
      const persons = Array.from(personMap.values()).sort((a, b) => b.durationSeconds - a.durationSeconds);

      // Sessions raw (mínimo necessário pra reconstruir curvas temporais).
      // Mantém só joinTime/leaveTime/duration — sem nome/email/etc.
      const rawSessions = allSessions
        .filter((s) => s.join_time && s.leave_time)
        .map((s) => ({
          joinTime: s.join_time as string,
          leaveTime: s.leave_time as string,
          durationSeconds: s.duration ?? 0,
        }));

      const cachedData = {
        source: resolvedSource,
        instancesFound: allUuids.length,
        totalSessions: allSessions.length,
        participants: persons,
        total: persons.length,
        rawSessions,
        // Story 28.6: chat persistido pra sobreviver ao corte da API em 22/05
        chat,
      };

      await fastify.db
        .update(funnelStageZoomMeetings)
        .set({ cachedData, lastSyncedAt: new Date(), syncError: null })
        .where(eq(funnelStageZoomMeetings.id, meetingRowId));

      fastify.log.info({
        msg: "Zoom sync done",
        meetingId: meetingNumericId,
        instances: allUuids.length,
        sessions: allSessions.length,
        persons: persons.length,
        chatMessages: chat.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error({ msg: "Zoom sync failed", meetingId: meetingNumericId, error: message });
      await fastify.db
        .update(funnelStageZoomMeetings)
        .set({ syncError: message })
        .where(eq(funnelStageZoomMeetings.id, meetingRowId));
    } finally {
      syncingMeetings.delete(meetingRowId);
    }
  }

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

      const [insertedRow] = await fastify.db
        .insert(funnelStageZoomMeetings)
        .values({
          stageId: params.data.stageId,
          meetingId: body.data.meetingId,
          meetingUuid: targetUuid,
          topic,
          label: body.data.label,
          startTime,
          durationMinutes,
        })
        .onConflictDoUpdate({
          target: [funnelStageZoomMeetings.stageId, funnelStageZoomMeetings.meetingUuid],
          set: { label: body.data.label },
        })
        .returning();

      // Dispara sync em background — não-bloqueante
      const meetingRowId = insertedRow.id;
      void syncMeetingParticipants(
        decrypted.accountId,
        decrypted.clientId,
        decrypted.clientSecret,
        meetingRowId,
        body.data.meetingId,
      );

      return { success: true, meetingUuid: targetUuid, meetingRowId, syncing: true };
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

    const isSyncing = syncingMeetings.has(meetingRow.id);
    const cached = meetingRow.cachedData as Record<string, unknown> | null;

    // Cache hit no DB → retorna direto (instantâneo)
    if (cached) {
      return {
        ...cached,
        syncing: isSyncing,
        lastSyncedAt: meetingRow.lastSyncedAt?.toISOString() ?? null,
        syncError: null,
      };
    }

    // Sem cache: dispara sync em background se ainda não está rolando
    if (!isSyncing) {
      const decrypted = decryptZoomConnection(conn);
      void syncMeetingParticipants(
        decrypted.accountId,
        decrypted.clientId,
        decrypted.clientSecret,
        meetingRow.id,
        meetingRow.meetingId,
      );
    }

    // Retorna 202 (accepted) com info de "sincronizando"
    return reply.code(202).send({
      syncing: true,
      participants: [],
      total: 0,
      message: "Sincronizando dados do Zoom — pode levar até 30s. Recarregue em alguns segundos.",
      syncError: meetingRow.syncError,
    });
  });

  // ------------ POST manual sync ------------
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/zoom/meetings/:meetingRowId/sync", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
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

    if (syncingMeetings.has(meetingRow.id)) {
      return { syncing: true, alreadyRunning: true };
    }

    const decrypted = decryptZoomConnection(conn);
    void syncMeetingParticipants(
      decrypted.accountId,
      decrypted.clientId,
      decrypted.clientSecret,
      meetingRow.id,
      meetingRow.meetingId,
    );
    return { syncing: true };
  });
});
