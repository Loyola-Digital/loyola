/**
 * Story 41.5 — geração, histórico e leitura do Resumão (§9.1).
 *
 * Contrato:
 *   POST → 200 { id, html, metricas, alertas }
 *        → 422 COMBINACAO_NAO_VALIDADA  (gate da 41.1)
 *        → 422 DADO_INDISPONIVEL        (planilha/período faltando)
 *        → 422 INVARIANTE_VIOLADO       (guardas da 41.3)
 *        → 422 CONFERENCIA_EXTERNA      (§8.3)
 *        → 413 PAYLOAD_TOO_LARGE
 *
 * A ordem importa e é testada: **gate → dados → guardas → render → persistir**.
 * Nada é gravado quando a geração falha — persistir um relatório que não passou
 * nos invariantes seria exatamente o "número errado em silêncio" que o §8 existe
 * para impedir.
 *
 * Cada geração é uma linha nova; regenerar não sobrescreve.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  launchReports,
  metaAdsAccounts,
  projects,
} from "../db/schema.js";
import { decryptAccountToken } from "../services/meta-ads.js";
import { ReportScopeError } from "../services/launch-report-config.js";
import {
  loadLaunchReport,
  LaunchReportDataError,
} from "../services/launch-report-loader.js";
import {
  assertLaunchReport,
  ConferenciaExternaError,
  InvarianteVioladoError,
} from "../services/launch-report-guards.js";
import { renderResumao, renderComparativo } from "../services/launch-report-render.js";
import { compararLancamentos } from "../services/launch-report-compare.js";
import type { LaunchReportMetrics } from "../services/launch-report-engine.js";
import type { LaunchReportGuardResult } from "../services/launch-report-guards.js";

/** Mesmo teto de `sprint_reports` (R-E4 do epic). */
const MAX_HTML_BYTES = 5 * 1024 * 1024;
/** Mesmo limite de listagem de `sprint-reports.ts`. */
const MAX_HISTORICO = 200;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  dataInicio: isoDate.nullable().optional(),
  dataFim: isoDate.nullable().optional(),
  /** §8.3 — opcional. Sem ele a conferência externa é pulada, nunca derivada. */
  investimentoOficial: z.number().positive().nullable().optional(),
  formato: z.enum(["html", "json"]).optional(),
});

export default fp(async function launchReportsRoutes(fastify) {
  /** Confere que a etapa pertence mesmo ao funil e ao projeto da URL. */
  async function resolveStage(projectId: string, funnelId: string, stageId: string) {
    const [row] = await fastify.db
      .select({
        stageId: funnelStages.id,
        stageName: funnelStages.name,
        projectName: projects.name,
      })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .innerJoin(projects, eq(projects.id, funnels.projectId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function accessTokenFor(accountRowId: string): Promise<string | null> {
    const [acc] = await fastify.db
      .select({
        enc: metaAdsAccounts.accessTokenEncrypted,
        iv: metaAdsAccounts.accessTokenIv,
      })
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, accountRowId))
      .limit(1);
    if (!acc) return null;
    try {
      return decryptAccountToken(acc.enc, acc.iv);
    } catch {
      return null;
    }
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/reports";

  // ---- POST /resumao ----
  fastify.post(`${base}/resumao`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = bodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    const stage = await resolveStage(
      params.data.projectId,
      params.data.funnelId,
      params.data.stageId,
    );
    if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

    // 1 e 2 — gate (dentro de loadReportConfig) e carga dos dados.
    let metricas;
    try {
      metricas = await loadLaunchReport(fastify.db, accessTokenFor, {
        stageId: params.data.stageId,
        dataInicio: body.data.dataInicio ?? null,
        dataFim: body.data.dataFim ?? null,
      });
    } catch (err) {
      // Corpos distintos de propósito: o usuário precisa saber se falta validar
      // a combinação ou se falta dado.
      if (err instanceof ReportScopeError) return reply.code(422).send(err.toResponse());
      if (err instanceof LaunchReportDataError) return reply.code(422).send(err.toResponse());
      throw err;
    }

    // 3 — guardas ANTES de renderizar.
    let guardas;
    try {
      guardas = assertLaunchReport(metricas, {
        investimentoOficial: body.data.investimentoOficial ?? null,
      });
    } catch (err) {
      if (err instanceof InvarianteVioladoError) return reply.code(422).send(err.toResponse());
      if (err instanceof ConferenciaExternaError) return reply.code(422).send(err.toResponse());
      throw err;
    }

    // 4 — render.
    const html = renderResumao({
      metricas,
      guardas,
      projeto: stage.projectName,
      etapa: stage.stageName,
    });
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return reply.code(413).send({ error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" });
    }

    // 5 — persistir (só aqui, e só em sucesso).
    const title =
      `Resumão ${stage.projectName} ${stage.stageName} — ` +
      `${metricas.periodo.inicio} a ${metricas.periodo.fim}`;

    const [saved] = await fastify.db
      .insert(launchReports)
      .values({
        projectId: params.data.projectId,
        funnelId: params.data.funnelId,
        stageId: params.data.stageId,
        kind: "resumao",
        title: title.slice(0, 255),
        dataInicio: metricas.periodo.inicio,
        dataFim: metricas.periodo.fim,
        html,
        metricas: metricas as unknown as Record<string, unknown>,
        alertas: guardas.alertas,
        geradoPor: request.userId ?? null,
      })
      .returning({ id: launchReports.id, createdAt: launchReports.createdAt });

    return {
      id: saved!.id,
      createdAt: saved!.createdAt,
      // `formato: "json"` omite o HTML — para quem quer só os números.
      ...(body.data.formato === "json" ? {} : { html }),
      metricas,
      alertas: guardas.alertas,
      invariantes: guardas.invariantes,
      conferencia: guardas.conferencia,
    };
  });

  // ---- GET — histórico da etapa, sem HTML para a lista não pesar ----
  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await resolveStage(params.data.projectId, params.data.funnelId, params.data.stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const rows = await fastify.db
      .select({
        id: launchReports.id,
        kind: launchReports.kind,
        title: launchReports.title,
        dataInicio: launchReports.dataInicio,
        dataFim: launchReports.dataFim,
        alertas: launchReports.alertas,
        createdAt: launchReports.createdAt,
      })
      .from(launchReports)
      .where(eq(launchReports.stageId, params.data.stageId))
      .orderBy(desc(launchReports.createdAt))
      .limit(MAX_HISTORICO);

    return { reports: rows };
  });

  // ---- GET /:reportId — linha completa, com HTML ----
  fastify.get(`${base}/:reportId`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema
      .extend({ reportId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await resolveStage(params.data.projectId, params.data.funnelId, params.data.stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const [row] = await fastify.db
      .select()
      .from(launchReports)
      .where(
        and(
          eq(launchReports.id, params.data.reportId),
          eq(launchReports.stageId, params.data.stageId),
        ),
      )
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Relatório não encontrado" });
    return row;
  });

  // ---- DELETE /:reportId ----
  fastify.delete(`${base}/:reportId`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema
      .extend({ reportId: z.string().uuid() })
      .safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await resolveStage(params.data.projectId, params.data.funnelId, params.data.stageId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const deleted = await fastify.db
      .delete(launchReports)
      .where(
        and(
          eq(launchReports.id, params.data.reportId),
          eq(launchReports.stageId, params.data.stageId),
        ),
      )
      .returning({ id: launchReports.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "Relatório não encontrado" });
    return { ok: true };
  });
});

/**
 * Story 41.6 — POST /api/projects/:projectId/reports/comparativo (§9.2).
 *
 * Plugin separado porque a rota é **por projeto**, não por etapa: os dois lados
 * podem estar em funis diferentes.
 *
 * Regra explícita da spec: violação em **qualquer** lado **aborta os dois**. Um
 * comparativo com um lado inconsistente é pior que nenhum — parece confiável.
 */
export const comparativoRoutes = fp(async function comparativoRoutes(fastify) {
  const ladoSchema = z.object({
    funnelId: z.string().uuid(),
    stageId: z.string().uuid(),
    dataInicio: isoDate.nullable().optional(),
    dataFim: isoDate.nullable().optional(),
  });
  const compBody = z.object({
    a: ladoSchema,
    b: ladoSchema,
    formato: z.enum(["html", "json"]).optional(),
  });

  async function accessTokenFor(accountRowId: string): Promise<string | null> {
    const [acc] = await fastify.db
      .select({
        enc: metaAdsAccounts.accessTokenEncrypted,
        iv: metaAdsAccounts.accessTokenIv,
      })
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.id, accountRowId))
      .limit(1);
    if (!acc) return null;
    try {
      return decryptAccountToken(acc.enc, acc.iv);
    } catch {
      return null;
    }
  }

  fastify.post("/api/projects/:projectId/reports/comparativo", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = z.object({ projectId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = compBody.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    async function resolveLado(lado: z.infer<typeof ladoSchema>) {
      const [row] = await fastify.db
        .select({
          stageName: funnelStages.name,
          projectName: projects.name,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .innerJoin(projects, eq(projects.id, funnels.projectId))
        .where(
          and(eq(funnelStages.id, lado.stageId), eq(funnelStages.funnelId, lado.funnelId)),
        )
        .limit(1);
      return row ?? null;
    }

    const infoA = await resolveLado(body.data.a);
    const infoB = await resolveLado(body.data.b);
    if (!infoA) return reply.code(404).send({ error: "Etapa do lado A não encontrada", lado: "a" });
    if (!infoB) return reply.code(404).send({ error: "Etapa do lado B não encontrada", lado: "b" });

    // Gate + carga dos DOIS lados. O 422 identifica qual lado falhou.
    const carregado: LaunchReportMetrics[] = [];
    for (const [lado, cfg] of [["a", body.data.a], ["b", body.data.b]] as const) {
      try {
        carregado.push(
          await loadLaunchReport(fastify.db, accessTokenFor, {
            stageId: cfg.stageId,
            dataInicio: cfg.dataInicio ?? null,
            dataFim: cfg.dataFim ?? null,
          }),
        );
      } catch (err) {
        if (err instanceof ReportScopeError) {
          return reply.code(422).send({ ...err.toResponse(), lado });
        }
        if (err instanceof LaunchReportDataError) {
          return reply.code(422).send({ ...err.toResponse(), lado });
        }
        throw err;
      }
    }
    const [ma, mb] = carregado as [LaunchReportMetrics, LaunchReportMetrics];

    // Guardas nos dois — violação em qualquer um aborta ambos (§9.2).
    const guardas: LaunchReportGuardResult[] = [];
    for (const [lado, m] of [["a", ma], ["b", mb]] as const) {
      try {
        guardas.push(assertLaunchReport(m));
      } catch (err) {
        if (err instanceof InvarianteVioladoError) {
          return reply.code(422).send({ ...err.toResponse(), lado });
        }
        if (err instanceof ConferenciaExternaError) {
          return reply.code(422).send({ ...err.toResponse(), lado });
        }
        throw err;
      }
    }
    const [ga, gb] = guardas as [LaunchReportGuardResult, LaunchReportGuardResult];

    const comparativo = compararLancamentos(ma, mb);
    const html = renderComparativo({
      a: { metricas: ma, projeto: infoA.projectName, etapa: infoA.stageName },
      b: { metricas: mb, projeto: infoB.projectName, etapa: infoB.stageName },
      comparativo,
      guardasA: ga,
      guardasB: gb,
    });
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return reply.code(413).send({ error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" });
    }

    const title =
      `Comparativo ${infoA.projectName} ${infoA.stageName} × ${infoB.projectName} ${infoB.stageName}`;

    // Persiste no MESMO histórico da etapa A, com kind = "comparativo".
    const [saved] = await fastify.db
      .insert(launchReports)
      .values({
        projectId: params.data.projectId,
        funnelId: body.data.a.funnelId,
        stageId: body.data.a.stageId,
        kind: "comparativo",
        title: title.slice(0, 255),
        dataInicio: ma.periodo.inicio,
        dataFim: ma.periodo.fim,
        html,
        // As duas referências vivem em `metricas` — é o que dispensa colunas b_*.
        metricas: {
          a: { ...body.data.a, periodo: ma.periodo, metricas: ma },
          b: { ...body.data.b, periodo: mb.periodo, metricas: mb },
          deltas: comparativo.deltas,
          decomposicao: comparativo.decomposicao,
          cenarios: comparativo.cenarios,
          recuperacoes: comparativo.recuperacoes,
        } as unknown as Record<string, unknown>,
        alertas: [...ga.alertas, ...gb.alertas],
        geradoPor: request.userId ?? null,
      })
      .returning({ id: launchReports.id, createdAt: launchReports.createdAt });

    return {
      id: saved!.id,
      createdAt: saved!.createdAt,
      ...(body.data.formato === "json" ? {} : { html }),
      metricas: {
        a: ma,
        b: mb,
        deltas: comparativo.deltas,
        decomposicao: comparativo.decomposicao,
        cenarios: comparativo.cenarios,
        recuperacoes: comparativo.recuperacoes,
      },
      alertas: { a: ga.alertas, b: gb.alertas },
    };
  });
});
