/**
 * Story 41.9 — geração e leitura do relatório perpétuo (botão 3).
 *
 * Contrato do §C.8:
 *   POST → 200 { html, metricas, alertas }
 *        → 422 COMBINACAO_NAO_VALIDADA (gate da 41.7)
 *        → 422 INVARIANTE_VIOLADO { codigo, detalhe, acao }
 *
 * O relatório é persistido: o HTML é um retrato do período, e regerar depois
 * pode dar número diferente (a planilha muda). O antigo continua sendo o que foi
 * conferido na época.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import { perpetualReports, funnels, metaAdsAccounts } from "../db/schema.js";
import { decryptAccountToken } from "../services/meta-ads.js";
import { ReportScopeError } from "../services/perpetual-report-config.js";
import { InvarianteError } from "../services/perpetual-report-metrics.js";
import {
  loadPerpetualReport,
  PerpetualReportDataError,
} from "../services/perpetual-report-loader.js";
import { renderPerpetualReportHtml } from "../services/perpetual-report-html.js";

/** Mesmo teto de `sprint_reports` (R-E4 do epic). */
const MAX_HTML_BYTES = 5 * 1024 * 1024;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  dataInicio: isoDate.nullable().optional(),
  dataFim: isoDate.nullable().optional(),
  formato: z.literal("html").optional(),
});

export default fp(async function perpetualReportRoutes(fastify) {
  async function resolveFunnel(projectId: string, funnelId: string) {
    const [f] = await fastify.db
      .select({ id: funnels.id, type: funnels.type })
      .from(funnels)
      .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      .limit(1);
    return f ?? null;
  }

  /** Token da conta Meta, decriptado sob demanda. */
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

  const base = "/api/projects/:projectId/funnels/:funnelId/perpetual-report";

  // ---- POST — gera, persiste e devolve ----
  fastify.post(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = bodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    const funnel = await resolveFunnel(params.data.projectId, params.data.funnelId);
    if (!funnel) return reply.code(404).send({ error: "Funil não encontrado" });
    if (funnel.type !== "perpetual") {
      return reply.code(400).send({
        error: "O relatório do botão 3 só se aplica a funis perpétuos",
        code: "FUNNEL_NOT_PERPETUAL",
      });
    }

    let report;
    try {
      report = await loadPerpetualReport(fastify.db, accessTokenFor, {
        funnelId: params.data.funnelId,
        dataInicio: body.data.dataInicio ?? null,
        dataFim: body.data.dataFim ?? null,
      });
    } catch (err) {
      // Os três erros do §C.8 têm corpos distintos de propósito: o usuário
      // precisa saber se falta validar, se falta dado, ou se o número não fecha.
      if (err instanceof ReportScopeError) return reply.code(422).send(err.toResponse());
      if (err instanceof InvarianteError) return reply.code(422).send(err.toResponse());
      if (err instanceof PerpetualReportDataError) return reply.code(422).send(err.toResponse());
      throw err;
    }

    const html = renderPerpetualReportHtml(report);
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return reply.code(413).send({ error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" });
    }

    const [saved] = await fastify.db
      .insert(perpetualReports)
      .values({
        funnelId: params.data.funnelId,
        dataInicio: report.periodo.inicio,
        dataFim: report.periodo.fim,
        html,
        metricas: report.kpis as unknown as Record<string, unknown>,
        alertas: report.alertas,
        geradoPor: request.userId ?? null,
      })
      .returning({ id: perpetualReports.id, createdAt: perpetualReports.createdAt });

    return {
      id: saved.id,
      createdAt: saved.createdAt,
      html,
      metricas: report.kpis,
      alertas: report.alertas,
    };
  });

  // ---- GET — histórico (sem HTML, para a lista não pesar) ----
  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await resolveFunnel(params.data.projectId, params.data.funnelId))) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    const rows = await fastify.db
      .select({
        id: perpetualReports.id,
        dataInicio: perpetualReports.dataInicio,
        dataFim: perpetualReports.dataFim,
        metricas: perpetualReports.metricas,
        alertas: perpetualReports.alertas,
        createdAt: perpetualReports.createdAt,
      })
      .from(perpetualReports)
      .where(eq(perpetualReports.funnelId, params.data.funnelId))
      .orderBy(desc(perpetualReports.createdAt))
      .limit(50);

    return { reports: rows };
  });

  // ---- GET /:reportId — HTML de um relatório salvo ----
  fastify.get(`${base}/:reportId`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.extend({ reportId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await resolveFunnel(params.data.projectId, params.data.funnelId))) {
      return reply.code(404).send({ error: "Funil não encontrado" });
    }

    const [row] = await fastify.db
      .select()
      .from(perpetualReports)
      .where(
        and(
          eq(perpetualReports.id, params.data.reportId),
          eq(perpetualReports.funnelId, params.data.funnelId),
        ),
      )
      .limit(1);
    if (!row) return reply.code(404).send({ error: "Relatório não encontrado" });

    return {
      id: row.id,
      dataInicio: row.dataInicio,
      dataFim: row.dataFim,
      html: row.html,
      metricas: row.metricas,
      alertas: row.alertas,
      createdAt: row.createdAt,
    };
  });
});
