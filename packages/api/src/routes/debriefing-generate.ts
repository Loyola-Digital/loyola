/**
 * Story 49.6 — `POST …/stages/:stageId/debriefing/generate` (AC1).
 *
 *   200 { id, html, payload, alertas, substituiuParcial }
 *   403 guest · 404 etapa fora do funil/projeto da URL
 *   422 ETAPA_NAO_E_DEBRIEFING · TIPO_DE_FUNIL_NAO_SUPORTADO · COMBINACAO_NAO_VALIDADA ·
 *       CONFIG_INCOMPLETA · COMPARACAO_SEM_CONFIG · DADO_INDISPONIVEL ·
 *       INVARIANTE_VIOLADO · CONFERENCIA_EXTERNA   (corpo `{ erro, detalhe, acao, … }`)
 *       Story 49.12 (lançamento em andamento): SEM_DIA_FECHADO · CARRINHO_JA_ABERTO ·
 *       MIDIA_DO_CORTE_NAO_SINCRONIZADA · COMPARACAO_EM_ANDAMENTO
 *   413 PAYLOAD_TOO_LARGE
 *
 * Sem corpo de gates: a config vem da 49.1. O corpo aceita só o investimento
 * oficial opcional da conferência externa (49.5 AC5). A orquestração (e a
 * ordem dos portões) mora em `services/debriefing-generate.ts`.
 */

import { z } from "zod";
import fp from "fastify-plugin";
import type { Database } from "../db/client.js";
import { dependenciasReais, gerarDebriefing, type DependenciasDaGeracao } from "../services/debriefing-generate.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const bodySchema = z
  .object({ investimentoOficial: z.number().positive().nullable().optional() })
  .strict();

export interface DebriefingGenerateRoutesOptions {
  /** Testes injetam dependências sem banco/planilha; produção usa as reais. */
  dependencias?: (db: Database) => DependenciasDaGeracao;
}

export default fp<DebriefingGenerateRoutesOptions>(async function debriefingGenerateRoutes(fastify, opts) {
  fastify.post("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/debriefing/generate", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = bodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });

    const deps = (opts.dependencias ?? dependenciasReais)(fastify.db);
    const r = await gerarDebriefing(deps, {
      ...params.data,
      userId: request.userId,
      userRole: request.userRole,
      investimentoOficial: body.data.investimentoOficial ?? null,
    });
    return reply.code(r.status).send(r.body);
  });
});
