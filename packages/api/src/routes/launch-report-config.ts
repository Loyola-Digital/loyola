/**
 * Story 41.1 — CRUD da config do gerador de Resumão/Comparativo.
 *
 * Config por ETAPA (tipo/etapa/entidade/período/imposto/validado) e por PROJETO
 * (imposto do expert + mapa de campos canônicos da pesquisa).
 *
 * Guest é bloqueado em todos: configurar relatório é operação de equipe interna,
 * e o flag `validado` é uma afirmação de que alguém conferiu os números contra o
 * painel — não é algo que um convidado deva poder marcar.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  launchReportConfigs,
  expertReportConfigs,
  funnelStages,
  funnels,
  users,
  LAUNCH_REPORT_TIPOS,
  LAUNCH_REPORT_ETAPAS,
  LAUNCH_REPORT_ENTIDADES,
  SURVEY_CANONICAL_FIELDS,
} from "../db/schema.js";
import {
  loadReportConfigRaw,
  resolveImpostoPct,
  assertReportScope,
  ReportScopeError,
  SCOPE_VALIDADO,
} from "../services/launch-report-config.js";
import { computeSurveyForStage } from "../services/survey-aggregation.js";

const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const stageConfigBodySchema = z.object({
  tipo: z.enum(LAUNCH_REPORT_TIPOS),
  etapa: z.enum(LAUNCH_REPORT_ETAPAS),
  entidadeCaptura: z.enum(LAUNCH_REPORT_ENTIDADES),
  dataInicio: isoDate.nullable().optional(),
  dataFim: isoDate.nullable().optional(),
  /** Alíquota como fração (0.1215 = 12,15%). */
  impostoPct: z.number().min(0).max(0.99).nullable().optional(),
});

const expertConfigBodySchema = z.object({
  impostoPct: z.number().min(0).max(0.99).nullable().optional(),
  camposPesquisa: z
    .record(z.enum(SURVEY_CANONICAL_FIELDS), z.string().trim().min(1))
    .optional(),
});

export default fp(async function launchReportConfigRoutes(fastify) {
  /** Valida a cadeia project→funnel→stage. Guest nunca passa (config é interna). */
  async function resolveStage(projectId: string, funnelId: string, stageId: string) {
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

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/report-config";

  // ---- GET — config do stage + do expert + imposto resolvido + estado do gate ----
  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = stageParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId, stageId } = parsed.data;
    if (!(await resolveStage(projectId, funnelId, stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const [expert] = await fastify.db
      .select()
      .from(expertReportConfigs)
      .where(eq(expertReportConfigs.projectId, projectId))
      .limit(1);

    const cfg = await loadReportConfigRaw(fastify.db, stageId);

    // Sem config, o imposto ainda é resolvível (projeto → default) — a UI mostra
    // qual alíquota valeria antes mesmo de a etapa ser configurada.
    const imposto = cfg
      ? { valor: cfg.impostoPct, origem: cfg.impostoOrigem }
      : resolveImpostoPct(null, expert?.impostoPct);

    let bloqueio: { erro: string; detalhe: string; acao: string } | null = null;
    if (!cfg) {
      bloqueio = new ReportScopeError(
        `stage=${stageId} não tem configuração de relatório cadastrada — ` +
          `sem config não há como afirmar tipo/etapa/entidade de captura`,
      ).toResponse();
    } else {
      try {
        assertReportScope(cfg);
      } catch (err) {
        if (!(err instanceof ReportScopeError)) throw err;
        bloqueio = err.toResponse();
      }
    }

    let validadoPorNome: string | null = null;
    if (cfg?.validadoPor) {
      const [u] = await fastify.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, cfg.validadoPor))
        .limit(1);
      validadoPorNome = u?.name ?? null;
    }

    return {
      stage: cfg
        ? {
            tipo: cfg.tipo,
            etapa: cfg.etapa,
            entidadeCaptura: cfg.entidadeCaptura,
            dataInicio: cfg.dataInicio,
            dataFim: cfg.dataFim,
            validado: cfg.validado,
            validadoEm: cfg.validadoEm,
            validadoPor: cfg.validadoPor,
            validadoPorNome,
          }
        : null,
      expert: {
        impostoPct: expert?.impostoPct != null ? Number(expert.impostoPct) : null,
        camposPesquisa: expert?.camposPesquisa ?? {},
      },
      /** Alíquota efetiva + de onde veio (stage | project | default). */
      resolvido: { impostoPct: imposto.valor, impostoOrigem: imposto.origem },
      /** null = gerador liberado. Preenchido = motivo do bloqueio (§12.2). */
      bloqueio,
      escopoValidado: SCOPE_VALIDADO,
    };
  });

  // ---- PUT — grava/atualiza a config do stage ----
  fastify.put(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = stageParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = stageConfigBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const { projectId, funnelId, stageId } = parsed.data;
    if (!(await resolveStage(projectId, funnelId, stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const [existing] = await fastify.db
      .select()
      .from(launchReportConfigs)
      .where(eq(launchReportConfigs.stageId, stageId))
      .limit(1);

    // Mudou a premissa (tipo/etapa/entidade) → a conferência anterior não vale
    // mais. Resetar `validado` é o que impede um carimbo antigo de liberar uma
    // combinação nova que ninguém conferiu.
    const premissaMudou =
      !!existing &&
      (existing.tipo !== body.data.tipo ||
        existing.etapa !== body.data.etapa ||
        existing.entidadeCaptura !== body.data.entidadeCaptura);

    const values = {
      tipo: body.data.tipo,
      etapa: body.data.etapa,
      entidadeCaptura: body.data.entidadeCaptura,
      dataInicio: body.data.dataInicio ?? null,
      dataFim: body.data.dataFim ?? null,
      impostoPct: body.data.impostoPct != null ? String(body.data.impostoPct) : null,
    };

    if (!existing) {
      await fastify.db.insert(launchReportConfigs).values({ stageId, ...values });
    } else {
      await fastify.db
        .update(launchReportConfigs)
        .set({
          ...values,
          updatedAt: new Date(),
          ...(premissaMudou ? { validado: false, validadoEm: null, validadoPor: null } : {}),
        })
        .where(eq(launchReportConfigs.stageId, stageId));
    }

    return { ok: true, validacaoResetada: premissaMudou };
  });

  // ---- POST /validate — marca a combinação como conferida ----
  fastify.post(`${base}/validate`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = stageParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId, stageId } = parsed.data;
    if (!(await resolveStage(projectId, funnelId, stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const [updated] = await fastify.db
      .update(launchReportConfigs)
      .set({ validado: true, validadoEm: new Date(), validadoPor: request.userId, updatedAt: new Date() })
      .where(eq(launchReportConfigs.stageId, stageId))
      .returning({ id: launchReportConfigs.id, validadoEm: launchReportConfigs.validadoEm });

    if (!updated) {
      return reply
        .code(404)
        .send({ error: "Configuração não encontrada — salve a config antes de validar" });
    }
    return { ok: true, validadoEm: updated.validadoEm };
  });

  // ---- GET /survey-questions — perguntas reais da pesquisa da etapa ----
  // Alimenta o mapa de campos canônicos (AC5): o gerador não pode depender do
  // TEXTO da pergunta (cada expert tem formulário próprio), então o time liga
  // "renda" à chave real daquele formulário. Fonte = a MESMA agregação que o
  // Resumão vai consumir, não uma leitura paralela da planilha.
  fastify.get(`${base}/survey-questions`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = stageParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const { projectId, funnelId, stageId } = parsed.data;
    if (!(await resolveStage(projectId, funnelId, stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    try {
      const payload = await computeSurveyForStage(fastify.db, stageId);
      if (!payload) return { questions: [], semPesquisa: true };
      return { questions: payload.questions, semPesquisa: false };
    } catch (err) {
      // Planilha fora do ar / sem permissão não pode derrubar a tela de config.
      request.log.warn({ err, stageId }, "[report-config] falha ao ler perguntas da pesquisa");
      return { questions: [], semPesquisa: true };
    }
  });

  // ---- PUT projeto — config do expert (imposto + mapa de campos da pesquisa) ----
  fastify.put("/api/projects/:projectId/report-config", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const parsed = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = expertConfigBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const { projectId } = parsed.data;

    const [existing] = await fastify.db
      .select({ id: expertReportConfigs.id })
      .from(expertReportConfigs)
      .where(eq(expertReportConfigs.projectId, projectId))
      .limit(1);

    const values = {
      ...(body.data.impostoPct !== undefined
        ? { impostoPct: body.data.impostoPct != null ? String(body.data.impostoPct) : null }
        : {}),
      ...(body.data.camposPesquisa !== undefined
        ? { camposPesquisa: body.data.camposPesquisa }
        : {}),
    };

    if (!existing) {
      await fastify.db.insert(expertReportConfigs).values({ projectId, ...values });
    } else {
      await fastify.db
        .update(expertReportConfigs)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(expertReportConfigs.projectId, projectId));
    }

    return { ok: true };
  });
});
