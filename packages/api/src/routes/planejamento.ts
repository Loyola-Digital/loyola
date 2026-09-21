/**
 * Story 48.1 — Painel de Planejamento: Inputs Financeiros do funil de
 * lançamento (aba 1 da planilha).
 *
 *   GET /api/projects/:projectId/funnels/:funnelId/planejamento/inputs
 *   PUT /api/projects/:projectId/funnels/:funnelId/planejamento/inputs
 *
 * Caminho escopado por PROJETO (PO-01 da story): o `guest-guard` global só
 * valida membership sob `/api/projects/:id/*`. Permissão = a do funil (AC13):
 * quem vê o projeto lê; `guest` não escreve (403). A checagem de acesso é a
 * mesma `getProjectAccess` das rotas de funil, copiada no repositório (A4).
 *
 * Zero cálculo aqui: a derivação vive em
 * `@loyola-x/shared` (`derivarInputsFinanceiros`) e roda na tela. A API
 * guarda e devolve SÓ as 26 entradas escalares (AC1/AC2, E5 do epic).
 *
 * Validação (AC11, D3): frações em [0, 1]; moeda ≥ 0; ticket > 0; margem-alvo
 * dos pagos em (0, 1]; bases inteiras ≥ 0; texto em campo numérico → 400;
 * campo desconhecido → 400 (`.strict()`); `null` sempre aceito (vazio).
 */

import { z } from "zod";
import fp from "fastify-plugin";
import { CAMPOS_DOS_INPUTS_FINANCEIROS } from "@loyola-x/shared";
import {
  criarRepositorioDePlanejamento,
  inputsVazios,
  type InputsPersistidos,
  type RepositorioDePlanejamento,
} from "../services/planejamento-repositorio.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Só para teste: um repositório em memória no lugar do Drizzle. */
    planejamentoRepo?: RepositorioDePlanejamento;
  }
}

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
});

/** Fração da receita/meta/verba: 0 … 1. Vazio permitido. */
const fracao = z.number().min(0).max(1).nullable();
/** Moeda em reais, ≥ 0. */
const moeda = z.number().min(0).nullable();
/** Contagem inteira ≥ 0. */
const contagem = z.number().int().min(0).nullable();

/**
 * As 26 entradas, cada uma OBRIGATÓRIA no payload (pode ser `null`): o `PUT`
 * grava o conjunto inteiro (AC13), então um campo esquecido não é "mantém o
 * anterior" — é erro. `.strict()` recusa campo desconhecido (convenção do
 * repo: campo escrito errado sairia silenciosamente).
 */
const bodySchema = z
  .object({
    pctReembolso: fracao,
    pctMarketplace: fracao,
    pctImposto: fracao,
    pctCustoProduto: fracao,
    pctComissoes: fracao,
    pctOutrosCustos: fracao,
    metaMargemTotal: moeda,
    pctMargemPagos: fracao,
    /** Ticket > 0: zero não é "sem ticket", é divisão por zero em toda a grade. */
    ticketMedio: z.number().positive().nullable(),
    /** Margem-alvo dos pagos em (0, 1]: zero deixaria toda receita paga sem base. */
    mcAlvoPagos: z.number().gt(0).max(1).nullable(),
    investimentoAnuncios: moeda,
    pctInvestMeta: fracao,
    pctMetaQuente: fracao,
    pctGoogleQuente: fracao,
    pctOrgWhatsapp: fracao,
    pctOrgEmail: fracao,
    pctOrgInstagram: fracao,
    pctOrgTelegram: fracao,
    pctOrgYoutube: fracao,
    pctOrgAreaMembros: fracao,
    baseWhatsapp: contagem,
    baseEmail: contagem,
    baseInstagram: contagem,
    baseTelegram: contagem,
    baseYoutube: contagem,
    baseAreaMembros: contagem,
  } satisfies Record<(typeof CAMPOS_DOS_INPUTS_FINANCEIROS)[number], z.ZodTypeAny>)
  .strict();

export default fp(async function planejamentoRoutes(fastify) {
  const repo = (): RepositorioDePlanejamento => fastify.planejamentoRepo ?? criarRepositorioDePlanejamento(fastify.db);

  const base = "/api/projects/:projectId/funnels/:funnelId/planejamento/inputs";

  /**
   * Resolve projeto + funil de LANÇAMENTO ou devolve o `reply` já respondido.
   * Funil `perpetual`/`mobile` é 404 (AC1): a aba não existe para eles.
   */
  async function resolverContexto(
    request: { params: unknown; userId: string; userRole: string },
    reply: { code: (c: number) => { send: (b: unknown) => unknown } },
  ): Promise<{ projectId: string; funnelId: string } | null> {
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send({ error: "Parâmetros inválidos" });
      return null;
    }
    const { projectId, funnelId } = parsed.data;
    const r = repo();
    if (!(await r.acessoAoProjeto(projectId, request.userId, request.userRole))) {
      reply.code(404).send({ error: "Projeto não encontrado" });
      return null;
    }
    const funnel = await r.resolverFunil(projectId, funnelId);
    if (!funnel || funnel.type !== "launch") {
      reply.code(404).send({ error: "Funil de lançamento não encontrado" });
      return null;
    }
    return { projectId, funnelId };
  }

  // ---- GET — as 26 entradas (null quando nunca salvas) ----
  fastify.get(base, async (request, reply) => {
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const lido = await repo().lerInputs(ctx.funnelId);
    return {
      funnelId: ctx.funnelId,
      inputs: lido?.inputs ?? inputsVazios(),
      updatedAt: lido?.updatedAt ?? null,
    };
  });

  // ---- PUT — grava o conjunto inteiro (upsert por funil) ----
  fastify.put(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const body = bodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const gravado = await repo().gravarInputs(ctx.funnelId, body.data as InputsPersistidos, request.userId || null);
    return { ok: true, funnelId: ctx.funnelId, inputs: gravado.inputs, updatedAt: gravado.updatedAt };
  });
});
