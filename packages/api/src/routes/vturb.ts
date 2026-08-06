/**
 * VTurb Analytics — conexão do projeto, vínculo de VSL na etapa e o dashboard.
 *
 * O endpoint `overview` faz UMA chamada e devolve tudo que a aba precisa
 * (números, série diária, curva de retenção, cliques no tempo). Motivo: o VTurb
 * tem rate limit por minuto (60 no plano Basic) e quatro chamadas paralelas do
 * browser, multiplicadas por gente do time abrindo a aba, queimariam a cota.
 * Aqui elas saem em paralelo NO SERVIDOR, uma vez, e o front recebe pronto.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, funnelStages, vturbConnections, vturbPlayers } from "../db/schema.js";
import { decrypt, encrypt } from "../services/encryption.js";
import {
  VturbError, clicksTimed, listPlayers, quotaUsage, sessionStats, sessionStatsByDay,
  userEngagement, validateToken,
} from "../services/vturb.js";
import { ProtocolViolation, derivarCadeia, fonteVturb } from "../services/vturb-chain.js";

const projectParam = z.object({ projectId: z.string().uuid() });
const stageParam = z.object({ projectId: z.string().uuid(), stageId: z.string().uuid() });
const funnelParam = z.object({ projectId: z.string().uuid(), funnelId: z.string().uuid() });

const connectBody = z.object({
  apiToken: z.string().trim().min(10).max(500),
  timezone: z.string().trim().max(60).optional(),
});

const linkBody = z.object({
  playerId: z.string().trim().min(1).max(64),
  playerName: z.string().trim().min(1).max(300),
  duration: z.coerce.number().int().min(0).optional(),
  pitchTime: z.coerce.number().int().min(0).optional(),
});

const rangeQuery = z.object({
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Erro do VTurb → status HTTP correspondente, com a mensagem já em português. */
function replyVturbError(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof VturbError) {
    // 401 do VTurb vira 502 pra não confundir com "você não está logado no
    // Loyola X" — o problema é a credencial DELES, não a sessão do usuário.
    const status = err.status === 401 ? 502 : err.status === 429 ? 429 : 502;
    return reply.code(status).send({ error: err.message, code: "VTURB_ERROR" });
  }
  return reply.code(500).send({ error: "Falha ao consultar o VTurb" });
}

export default fp(async function vturbRoutes(fastify) {
  /** Token descriptografado do projeto, ou null se não há conexão. */
  async function tokenFor(projectId: string): Promise<{ token: string; timezone: string } | null> {
    const [conn] = await fastify.db
      .select({
        enc: vturbConnections.apiTokenEncrypted,
        iv: vturbConnections.apiTokenIv,
        timezone: vturbConnections.timezone,
      })
      .from(vturbConnections)
      .where(eq(vturbConnections.projectId, projectId))
      .limit(1);
    if (!conn) return null;
    return { token: decrypt(conn.enc, conn.iv), timezone: conn.timezone };
  }

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  // ---- GET /connection — status da conexão (nunca devolve o token) ----
  fastify.get("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [conn] = await fastify.db
      .select({ timezone: vturbConnections.timezone, createdAt: vturbConnections.createdAt })
      .from(vturbConnections)
      .where(eq(vturbConnections.projectId, p.data.projectId))
      .limit(1);

    return { connected: !!conn, timezone: conn?.timezone ?? null, connectedAt: conn?.createdAt ?? null };
  });

  // ---- PUT /connection — salva/atualiza o token ----
  fastify.put("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    const body = connectBody.safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });

    // Valida ANTES de gravar: token errado salvo silenciosamente vira um
    // dashboard vazio sem explicação depois.
    const check = await validateToken(body.data.apiToken);
    if (!check.ok) return reply.code(400).send({ error: check.error, code: "INVALID_TOKEN" });

    const { encrypted, iv } = encrypt(body.data.apiToken);
    await fastify.db
      .insert(vturbConnections)
      .values({
        projectId: p.data.projectId,
        apiTokenEncrypted: encrypted,
        apiTokenIv: iv,
        timezone: body.data.timezone || "America/Sao_Paulo",
        createdBy: request.userId,
      })
      .onConflictDoUpdate({
        target: vturbConnections.projectId,
        set: {
          apiTokenEncrypted: encrypted,
          apiTokenIv: iv,
          timezone: body.data.timezone || "America/Sao_Paulo",
          updatedAt: new Date(),
        },
      });

    return { ok: true };
  });

  // ---- DELETE /connection ----
  fastify.delete("/api/projects/:projectId/vturb/connection", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    await fastify.db.delete(vturbConnections).where(eq(vturbConnections.projectId, p.data.projectId));
    return { ok: true };
  });

  // ---- GET /players — lista as VSLs da conta (pro picker) ----
  fastify.get("/api/projects/:projectId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const conn = await tokenFor(p.data.projectId);
    if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

    const q = z.object({ name: z.string().trim().max(128).optional() }).safeParse(request.query);
    try {
      const players = await listPlayers(conn.token, {
        name: q.success ? q.data.name : undefined,
        timezone: conn.timezone,
      });
      return { players };
    } catch (err) {
      return replyVturbError(reply, err);
    }
  });

  // ---- GET /quota — quanto sobrou da cota ----
  fastify.get("/api/projects/:projectId/vturb/quota", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = projectParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const conn = await tokenFor(p.data.projectId);
    if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });
    try {
      return await quotaUsage(conn.token);
    } catch (err) {
      return replyVturbError(reply, err);
    }
  });

  // ---- Vínculo VSL ↔ etapa ----
  fastify.get("/api/projects/:projectId/stages/:stageId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = stageParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const rows = await fastify.db
      .select()
      .from(vturbPlayers)
      .where(eq(vturbPlayers.stageId, p.data.stageId));
    return { players: rows };
  });

  fastify.post("/api/projects/:projectId/stages/:stageId/vturb/players", async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = stageParam.safeParse(request.params);
    const body = linkBody.safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [stage] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.id, p.data.stageId))
      .limit(1);
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [created] = await fastify.db
      .insert(vturbPlayers)
      .values({
        projectId: p.data.projectId,
        stageId: p.data.stageId,
        playerId: body.data.playerId,
        playerName: body.data.playerName,
        duration: body.data.duration ?? null,
        pitchTime: body.data.pitchTime ?? null,
        createdBy: request.userId,
      })
      .onConflictDoUpdate({
        target: [vturbPlayers.stageId, vturbPlayers.playerId],
        set: {
          playerName: body.data.playerName,
          duration: body.data.duration ?? null,
          pitchTime: body.data.pitchTime ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: vturbPlayers.id });

    return reply.code(201).send(created);
  });

  fastify.delete(
    "/api/projects/:projectId/stages/:stageId/vturb/players/:id",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.extend({ id: z.string().uuid() }).safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      await fastify.db
        .delete(vturbPlayers)
        .where(and(eq(vturbPlayers.id, p.data.id), eq(vturbPlayers.stageId, p.data.stageId)));
      return { ok: true };
    },
  );

  // ---- GET /overview — tudo do dashboard numa chamada ----
  fastify.get(
    "/api/projects/:projectId/stages/:stageId/vturb/players/:id/overview",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = stageParam.extend({ id: z.string().uuid() }).safeParse(request.params);
      const q = rangeQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const conn = await tokenFor(p.data.projectId);
      if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

      const [link] = await fastify.db
        .select()
        .from(vturbPlayers)
        .where(and(eq(vturbPlayers.id, p.data.id), eq(vturbPlayers.stageId, p.data.stageId)))
        .limit(1);
      if (!link) return reply.code(404).send({ error: "VSL não vinculada a esta etapa" });

      const range = {
        startDate: q.data.startDate,
        endDate: q.data.endDate,
        timezone: conn.timezone,
      };
      const base = { ...range, playerId: link.playerId };

      try {
        // Em paralelo no servidor: 4 chamadas, uma vez, em vez de 4 por aba
        // aberta. A curva de retenção só é pedida quando há duration — sem ele
        // a API não sabe normalizar o eixo e devolveria erro.
        const [stats, byDay, engagement, clicks] = await Promise.all([
          sessionStats(conn.token, { ...base, videoDuration: link.duration, pitchTime: link.pitchTime }),
          sessionStatsByDay(conn.token, { ...base, videoDuration: link.duration, pitchTime: link.pitchTime }),
          link.duration
            ? userEngagement(conn.token, { ...base, videoDuration: link.duration })
            : Promise.resolve(null),
          clicksTimed(conn.token, base),
        ]);

        return {
          player: {
            id: link.id,
            playerId: link.playerId,
            name: link.playerName,
            duration: link.duration,
            pitchTime: link.pitchTime,
          },
          range: { startDate: q.data.startDate, endDate: q.data.endDate, timezone: conn.timezone },
          stats,
          byDay,
          engagement,
          clicks,
        };
      } catch (err) {
        return replyVturbError(reply, err);
      }
    },
  );

  // ---- GET /funnels/:funnelId/vturb/chain ---- (Story 29.41, AC3/AC4/AC5)
  /**
   * A cadeia de conversão da VSL medida, para a aba Análise MVP do perpétuo.
   *
   * Por que uma rota por FUNIL e não por etapa: a aba MVP raciocina sobre o
   * funil inteiro. O vínculo do player continua sendo por `stage_id` — a
   * medição de 2026-08-06 confirmou que essa âncora já funciona com funil
   * perpétuo real, então não foi preciso tornar `stage_id` anulável nem criar
   * `funnel_id`, que era a alternativa prevista no AC1.
   *
   * UMA chamada ao VTurb por (player, janela). O rate limit é de 60/min no
   * plano Basic, e já derrubou a integração em 2026-07-16 — o cache do React
   * Query no cliente evita repetir a cada render.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/vturb/chain",
    async (request, reply) => {
      if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
      const p = funnelParam.safeParse(request.params);
      const q = rangeQuery.safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      // O funil tem que pertencer ao projeto — sem isso, um funnelId de outro
      // projeto leria dados que não são dele.
      const [funnel] = await fastify.db
        .select({ id: funnels.id })
        .from(funnels)
        .where(and(eq(funnels.id, p.data.funnelId), eq(funnels.projectId, p.data.projectId)))
        .limit(1);
      if (!funnel) return reply.code(404).send({ error: "Funil não encontrado neste projeto" });

      const conn = await tokenFor(p.data.projectId);
      if (!conn) return reply.code(409).send({ error: "VTurb não conectado", code: "NOT_CONNECTED" });

      // Player vinculado a qualquer etapa deste funil. Um por funil (AC1).
      const [link] = await fastify.db
        .select({
          id: vturbPlayers.id,
          playerId: vturbPlayers.playerId,
          playerName: vturbPlayers.playerName,
          duration: vturbPlayers.duration,
          pitchTime: vturbPlayers.pitchTime,
        })
        .from(vturbPlayers)
        .innerJoin(funnelStages, eq(funnelStages.id, vturbPlayers.stageId))
        .where(eq(funnelStages.funnelId, p.data.funnelId))
        .limit(1);
      // 404 aqui não é erro: é o estado normal de um funil sem VSL vinculada.
      // O front usa isso para oferecer o seletor de player.
      if (!link) return reply.code(404).send({ error: "Nenhuma VSL vinculada a este funil", code: "NO_PLAYER" });

      try {
        const stats = await sessionStats(conn.token, {
          playerId: link.playerId,
          startDate: q.data.startDate,
          endDate: q.data.endDate,
          timezone: conn.timezone,
          videoDuration: link.duration,
          pitchTime: link.pitchTime,
        });

        const cadeia = derivarCadeia(stats, link.pitchTime);

        return {
          player: {
            id: link.id,
            playerId: link.playerId,
            name: link.playerName,
            duration: link.duration,
            pitchTime: link.pitchTime,
          },
          cadeia,
          // AC5: proveniência preenchida automaticamente. A janela devolvida é
          // a EFETIVAMENTE enviada à API — não a pedida — para que o AC6 possa
          // comparar com a janela do resto da aba sem depender de confiança.
          proveniencia: {
            source: fonteVturb(link.playerName, link.playerId),
            windowStart: q.data.startDate,
            windowEnd: q.data.endDate,
            timezone: conn.timezone,
          },
          // Brutos no response para o memorial poder mostrar a conta em vez de
          // só o resultado — é o que torna a taxa conferível contra o painel.
          brutos: {
            viewedUniq: stats.total_viewed_device_uniq,
            startedUniq: stats.total_started_device_uniq,
            overPitch: stats.total_over_pitch,
          },
        };
      } catch (err) {
        // Violação de protocolo é defeito de definição, não falha do VTurb —
        // 502 mandaria investigar o lado errado.
        if (err instanceof ProtocolViolation) {
          return reply.code(422).send({ error: err.message, code: "PROTOCOL_VIOLATION" });
        }
        return replyVturbError(reply, err);
      }
    },
  );
});
