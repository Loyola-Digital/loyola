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
import {
  CAMPOS_DOS_INPUTS_FINANCEIROS,
  CENARIOS,
  NIVEIS_ORGANICOS,
  NIVEIS_PAGOS,
  ROTULOS_DO_CENARIO,
  organicosVazios,
  pagosVazios,
  rotulosVazios,
  type OrganicosDoSimulador,
  type PagosDoSimulador,
  type RotulosDoSimulador,
} from "@loyola-x/shared";
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

// ---- Story 48.3 — aba 2: blocos por canal orgânico e cinco combinações ----
//
//   GET /api/projects/:projectId/funnels/:funnelId/planejamento/organicos
//   PUT /api/projects/:projectId/funnels/:funnelId/planejamento/organicos
//
// Mesma permissão e mesma guarda de tipo da rota de inputs. O GET devolve
// SEMPRE os seis canais e as cinco combinações (índices 1…5), com `null` no
// que nunca foi salvo, sem criar linha (PO-02). O PUT grava o conjunto inteiro
// e exige que os Inputs Financeiros já tenham sido salvos — as tabelas-filhas
// pendem de `plan_simulators` (AC1) e um simulador criado às escondidas pelo
// PUT da aba 2 faria o GET de inputs dizer "salvo" para um formulário vazio
// (quebraria o critério objetivo da PO-03). Sem simulador: 409.

/** Nível assumido da escada (radio, D12): inteiro 1…8 ou vazio. */
const nivelOrganico = z.number().int().min(1).max(NIVEIS_ORGANICOS).nullable();
/** Cenário escolhido (RN-038): inteiro 1…10 ou vazio. `1,5` e `11` são 400 — na planilha eram `#N/A` em cascata. */
const selecao = z.number().int().min(1).max(CENARIOS).nullable();

const blocoOrganicoSchema = z
  .object({
    conversaoMedia: fracao,
    variacaoConversao: fracao,
    variacaoReceita: fracao,
    taxaCaptacao: fracao,
    faixaVariacao: fracao,
    fracaoCenario1: fracao,
    nivelAssumido: nivelOrganico,
  })
  .strict();

const selecoesSchema = z
  .object({
    whatsapp: selecao,
    email: selecao,
    instagram: selecao,
    telegram: selecao,
    youtube: selecao,
    area_membros: selecao,
  })
  .strict();

const organicosBodySchema = z
  .object({
    blocos: z
      .object({
        whatsapp: blocoOrganicoSchema,
        email: blocoOrganicoSchema,
        instagram: blocoOrganicoSchema,
        telegram: blocoOrganicoSchema,
        youtube: blocoOrganicoSchema,
        area_membros: blocoOrganicoSchema,
      })
      .strict(),
    combinacoes: z
      .array(z.object({ indice: z.number().int().min(1).max(5), selecoes: selecoesSchema }).strict())
      .length(5)
      .refine((cs) => new Set(cs.map((c) => c.indice)).size === 5, { message: "índices 1…5 sem repetição" }),
  })
  .strict();

// ---- Story 48.4 — aba 3: blocos por fonte paga e cinco combinações ----
//
//   GET /api/projects/:projectId/funnels/:funnelId/planejamento/pagos
//   PUT /api/projects/:projectId/funnels/:funnelId/planejamento/pagos
//
// Mesma semântica da aba 2 (48.3): GET sempre com as QUATRO fontes e as cinco
// combinações, `null` no que nunca foi salvo, sem criar linha (PO-02); PUT
// grava o conjunto inteiro e exige os Inputs Financeiros salvos (409).

/** Nível assumido da escada dos pagos (radio, D12): inteiro 1…10 ou vazio. */
const nivelPago = z.number().int().min(1).max(NIVEIS_PAGOS).nullable();

const blocoPagoSchema = z
  .object({
    pctCaptacao: fracao,
    conversaoMedia: fracao,
    variacaoConversao: fracao,
    variacaoReceita: fracao,
    /** CPL médio histórico em reais, ≥ 0 (referência das faixas). */
    cplMedioHistorico: moeda,
    faixaVariacao: fracao,
    fracaoCenario1: fracao,
    nivelAssumido: nivelPago,
  })
  .strict();

const selecoesPagasSchema = z
  .object({
    meta_quente: selecao,
    meta_frio: selecao,
    google_quente: selecao,
    google_frio: selecao,
  })
  .strict();

const pagosBodySchema = z
  .object({
    blocos: z
      .object({
        meta_quente: blocoPagoSchema,
        meta_frio: blocoPagoSchema,
        google_quente: blocoPagoSchema,
        google_frio: blocoPagoSchema,
      })
      .strict(),
    combinacoes: z
      .array(z.object({ indice: z.number().int().min(1).max(5), selecoes: selecoesPagasSchema }).strict())
      .length(5)
      .refine((cs) => new Set(cs.map((c) => c.indice)).size === 5, { message: "índices 1…5 sem repetição" }),
  })
  .strict();

// ---- Story 48.5 — aba 4: rótulos dos cinco cenários (DV-017 = A) ----
//
//   GET /api/projects/:projectId/funnels/:funnelId/planejamento/resumo
//   PUT /api/projects/:projectId/funnels/:funnelId/planejamento/resumo
//
// A aba 4 é consolidação das abas 1–3 e roda na tela; a única entrada é o
// rótulo por cenário (META PISO / META BOA / META SUPER ou vazio). Mesma
// semântica das abas 2 e 3: GET sempre com os cinco cenários, sem criar linha;
// PUT grava o conjunto inteiro e exige os Inputs Financeiros salvos (409).

const rotuloSchema = z.enum(ROTULOS_DO_CENARIO).nullable();

const resumoBodySchema = z
  .object({
    cenarios: z
      .array(z.object({ indice: z.number().int().min(1).max(5), rotulo: rotuloSchema }).strict())
      .length(5)
      .refine((cs) => new Set(cs.map((c) => c.indice)).size === 5, { message: "índices 1…5 sem repetição" }),
  })
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

  // ---- Story 48.3 — GET/PUT …/planejamento/organicos ----
  const baseOrganicos = "/api/projects/:projectId/funnels/:funnelId/planejamento/organicos";

  fastify.get(baseOrganicos, async (request, reply) => {
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const lido = await repo().lerOrganicos(ctx.funnelId);
    const vazio = organicosVazios();
    return {
      funnelId: ctx.funnelId,
      blocos: lido?.blocos ?? vazio.blocos,
      combinacoes: lido?.combinacoes ?? vazio.combinacoes,
      updatedAt: lido?.updatedAt ?? null,
    };
  });

  fastify.put(baseOrganicos, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const body = organicosBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const simulatorId = await repo().idDoSimulador(ctx.funnelId);
    if (simulatorId === null) {
      return reply.code(409).send({ error: "Salve os Inputs Financeiros antes de salvar os cenários dos canais orgânicos" });
    }
    const gravado = await repo().gravarOrganicos(simulatorId, body.data as OrganicosDoSimulador);
    return { ok: true, funnelId: ctx.funnelId, blocos: gravado.blocos, combinacoes: gravado.combinacoes, updatedAt: gravado.updatedAt };
  });

  // ---- Story 48.4 — GET/PUT …/planejamento/pagos ----
  const basePagos = "/api/projects/:projectId/funnels/:funnelId/planejamento/pagos";

  fastify.get(basePagos, async (request, reply) => {
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const lido = await repo().lerPagos(ctx.funnelId);
    const vazio = pagosVazios();
    return {
      funnelId: ctx.funnelId,
      blocos: lido?.blocos ?? vazio.blocos,
      combinacoes: lido?.combinacoes ?? vazio.combinacoes,
      updatedAt: lido?.updatedAt ?? null,
    };
  });

  fastify.put(basePagos, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const body = pagosBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const simulatorId = await repo().idDoSimulador(ctx.funnelId);
    if (simulatorId === null) {
      return reply.code(409).send({ error: "Salve os Inputs Financeiros antes de salvar os cenários das fontes pagas" });
    }
    const gravado = await repo().gravarPagos(simulatorId, body.data as PagosDoSimulador);
    return { ok: true, funnelId: ctx.funnelId, blocos: gravado.blocos, combinacoes: gravado.combinacoes, updatedAt: gravado.updatedAt };
  });

  // ---- Story 48.5 — GET/PUT …/planejamento/resumo (rótulos) ----
  const baseResumo = "/api/projects/:projectId/funnels/:funnelId/planejamento/resumo";

  fastify.get(baseResumo, async (request, reply) => {
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const lido = await repo().lerRotulos(ctx.funnelId);
    return {
      funnelId: ctx.funnelId,
      cenarios: lido?.cenarios ?? rotulosVazios().cenarios,
      updatedAt: lido?.updatedAt ?? null,
    };
  });

  fastify.put(baseResumo, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const ctx = await resolverContexto(request, reply);
    if (!ctx) return;
    const body = resumoBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const simulatorId = await repo().idDoSimulador(ctx.funnelId);
    if (simulatorId === null) {
      return reply.code(409).send({ error: "Salve os Inputs Financeiros antes de rotular os cenários do Resumo Final" });
    }
    const gravado = await repo().gravarRotulos(simulatorId, body.data as RotulosDoSimulador);
    return { ok: true, funnelId: ctx.funnelId, cenarios: gravado.cenarios, updatedAt: gravado.updatedAt };
  });
});
