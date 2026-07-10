/**
 * Story 38.3 — Alerta diário de pagamentos (Evento Presencial) no ClickUp.
 *
 * Config por etapa de evento: canal de chat + colaboradores mencionados.
 * O envio em si é do scheduler (plugins/payment-alerts-scheduler.ts); aqui
 * fica o CRUD da config, os pickers (canais/membros) e o teste manual.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnels,
  funnelStages,
  projects,
  projectMembers,
  stageEventPaymentAlerts,
} from "../db/schema.js";
import {
  buildAlertMessage,
  getDuePayments,
  todaySaoPaulo,
} from "../services/event-payment-alerts.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const upsertSchema = z.object({
  enabled: z.boolean().default(true),
  channelId: z.string().min(1),
  channelName: z.string().max(255).nullable().optional(),
  mentionUsers: z
    .array(z.object({ id: z.string().min(1), username: z.string().min(1).max(255) }))
    .max(10)
    .default([]),
});

function shapeAlert(row: typeof stageEventPaymentAlerts.$inferSelect) {
  return {
    stageId: row.stageId,
    enabled: row.enabled,
    channelId: row.channelId,
    channelName: row.channelName,
    mentionUsers: row.mentionUsers,
    lastSentDate: row.lastSentDate,
  };
}

export default fp(async function eventPaymentAlertsRoutes(fastify) {
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
      .select({ id: funnelStages.id, name: funnelStages.name, stageType: funnelStages.stageType })
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

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/payment-alert";

  // ---- GET config ----
  fastify.get(base, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId,
      params.data.funnelId,
      params.data.stageId,
      request.userId,
      request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [row] = await fastify.db
      .select()
      .from(stageEventPaymentAlerts)
      .where(eq(stageEventPaymentAlerts.stageId, params.data.stageId))
      .limit(1);

    return {
      clickupConfigured: fastify.clickupService.isConfigured(),
      alert: row ? shapeAlert(row) : null,
    };
  });

  // ---- PUT config (upsert) ----
  fastify.put(base, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = upsertSchema.safeParse(request.body);
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
    if (stage.stageType !== "event") {
      return reply.code(400).send({ error: "Alerta de pagamentos é exclusivo da etapa de Evento Presencial" });
    }

    const values = {
      enabled: body.data.enabled,
      channelId: body.data.channelId,
      channelName: body.data.channelName ?? null,
      mentionUsers: body.data.mentionUsers,
      updatedAt: new Date(),
    };

    const [row] = await fastify.db
      .insert(stageEventPaymentAlerts)
      .values({ stageId: params.data.stageId, createdBy: request.userId, ...values })
      .onConflictDoUpdate({ target: stageEventPaymentAlerts.stageId, set: values })
      .returning();

    return shapeAlert(row);
  });

  // ---- DELETE config ----
  fastify.delete(base, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId,
      params.data.funnelId,
      params.data.stageId,
      request.userId,
      request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    await fastify.db
      .delete(stageEventPaymentAlerts)
      .where(eq(stageEventPaymentAlerts.stageId, params.data.stageId));
    return { ok: true };
  });

  // ---- POST /test — envia o alerta de HOJE agora (valida canal/menções) ----
  fastify.post(`${base}/test`, async (request, reply) => {
    const params = stageParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const stage = await getStageContext(
      params.data.projectId,
      params.data.funnelId,
      params.data.stageId,
      request.userId,
      request.userRole,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [alert] = await fastify.db
      .select()
      .from(stageEventPaymentAlerts)
      .where(eq(stageEventPaymentAlerts.stageId, params.data.stageId))
      .limit(1);
    if (!alert) return reply.code(404).send({ error: "Configure o alerta antes de testar" });

    const today = todaySaoPaulo();
    const payments = await getDuePayments(fastify.db, params.data.stageId, today);
    const message =
      payments.length > 0
        ? buildAlertMessage(stage.name, today, payments, alert.mentionUsers)
        : `🧪 **Teste do alerta de pagamentos — ${stage.name}**\nNenhuma parcela vence hoje (${today.split("-").reverse().join("/")}). Quando houver, a mensagem lista quem paga, valores e o total do dia.` +
          (alert.mentionUsers.length > 0
            ? `\n${alert.mentionUsers.map((u) => `<@${u.id}>`).join(" ")}`
            : "");

    try {
      await fastify.clickupService.sendChatMessage(
        alert.channelId,
        message,
        alert.mentionUsers.map((u) => u.id),
      );
    } catch (err) {
      return reply.code(502).send({
        error: "Falha ao enviar no ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
    return { ok: true, paymentsToday: payments.length };
  });

  // ---- Pickers (nível projeto — exigem membership; dados vêm do workspace) ----
  fastify.get("/api/projects/:projectId/clickup/chat-channels", async (request, reply) => {
    const params = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(409).send({ error: "ClickUp não configurado no servidor" });
    }
    try {
      return { channels: await fastify.clickupService.getChatChannels() };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao listar canais do ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  fastify.get("/api/projects/:projectId/clickup/members", async (request, reply) => {
    const params = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!fastify.clickupService.isConfigured()) {
      return reply.code(409).send({ error: "ClickUp não configurado no servidor" });
    }
    try {
      return { members: await fastify.clickupService.getWorkspaceMembers() };
    } catch (err) {
      return reply.code(502).send({
        error: "Erro ao listar membros do ClickUp",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
