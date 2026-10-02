/**
 * A volta da faixa para o Meta: configuração e envio.
 *
 * O cálculo de quem é de cada faixa é o mesmo que a tela mostra
 * (`classificarLeads`, em `lead-scoring.ts`) — um caminho só, para a tela e o
 * Meta nunca discordarem sobre quem é lead A.
 *
 * Ver `services/meta-capi.ts` para o que sai daqui (hash, nunca PII em claro) e
 * por que o `event_id` é determinístico.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  metaAdsAccounts,
  projectMembers,
  projects,
  stageLeadCapi,
  stageLeadCapiEnviados,
} from "../db/schema.js";
import { MetaCapiError } from "../services/meta-capi.js";
import { EnvioImpossivel, enviarLeadsDaEtapa } from "../services/lead-capi-envio.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const configSchema = z.object({
  datasetId: z.string().trim().min(5).max(50),
  metaAccountId: z.string().uuid().nullable().optional(),
  eventName: z.string().trim().min(1).max(60).default("LeadQualificado"),
  bands: z.array(z.string().trim().min(1).max(10)).max(10).default([]),
  testEventCode: z.string().trim().max(40).nullable().optional(),
  ativo: z.boolean().default(false),
});


export default fp(async function leadCapiRoutes(fastify) {
  async function temAcesso(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") return false;
    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projeto) return false;
    if (userRole === "admin") return true;
    const [membro] = await fastify.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(membro);
  }

  async function etapaExiste(stageId: string, funnelId: string, projectId: string) {
    const [linha] = await fastify.db
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
    return Boolean(linha);
  }

  const base = "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/lead-capi";

  // ---- Configuração --------------------------------------------------------

  fastify.get(base, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [config] = await fastify.db
      .select()
      .from(stageLeadCapi)
      .where(eq(stageLeadCapi.stageId, p.data.stageId))
      .limit(1);

    // As contas de anúncio vão junto: a tela precisa saber de onde pode sair o
    // token, e pedir isso numa segunda chamada só atrasaria a mesma tela.
    const contas = await fastify.db
      .select({ id: metaAdsAccounts.id, nome: metaAdsAccounts.accountName })
      .from(metaAdsAccounts)
      .where(eq(metaAdsAccounts.isActive, true));

    return { config: config ?? null, contas };
  });

  fastify.put(base, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const corpo = configSchema.safeParse(request.body);
    if (!p.success || !corpo.success) {
      return reply.code(400).send({ error: "Dados inválidos", detalhes: corpo.error?.issues });
    }
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    if (!(await etapaExiste(p.data.stageId, p.data.funnelId, p.data.projectId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    const valores = {
      datasetId: corpo.data.datasetId,
      metaAccountId: corpo.data.metaAccountId ?? null,
      eventName: corpo.data.eventName,
      bands: corpo.data.bands.map((b) => b.toUpperCase()),
      testEventCode: corpo.data.testEventCode || null,
      ativo: corpo.data.ativo,
      updatedAt: new Date(),
    };

    const [linha] = await fastify.db
      .insert(stageLeadCapi)
      .values({ stageId: p.data.stageId, ...valores })
      .onConflictDoUpdate({ target: stageLeadCapi.stageId, set: valores })
      .returning();

    return linha;
  });

  // ---- Envio ---------------------------------------------------------------

  /**
   * Manda para o Meta os leads das faixas configuradas que ainda não foram.
   *
   * A conta mora em `services/lead-capi-envio.ts`, compartilhada com o
   * agendador: fossem dois códigos, um dia um mandaria um lote que o outro não
   * mandaria, e a diferença só apareceria no Gerenciador semanas depois.
   */
  fastify.post(`${base}/enviar`, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const q = z.object({ simular: z.coerce.boolean().default(false) }).safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    if (!(await etapaExiste(p.data.stageId, p.data.funnelId, p.data.projectId))) {
      return reply.code(404).send({ error: "Etapa não encontrada" });
    }

    try {
      return await enviarLeadsDaEtapa(fastify.db, p.data.stageId, p.data.projectId, {
        simular: q.data.simular,
      });
    } catch (erro) {
      // Configuração faltando é 409 e vai inteira para a tela: é o usuário que
      // resolve, e a mensagem diz o quê.
      if (erro instanceof EnvioImpossivel) return reply.code(409).send({ error: erro.message });
      if (erro instanceof MetaCapiError) {
        fastify.log.error({ erro }, "o Meta recusou o envio");
        return reply.code(502).send({ error: erro.message });
      }
      fastify.log.error({ erro }, "falha no envio ao Meta");
      return reply.code(500).send({ error: "Não consegui enviar ao Meta." });
    }
  });

  /** Quantos leads já foram, por faixa — o histórico que a tela mostra. */
  fastify.get(`${base}/enviados`, async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const linhas = await fastify.db
      .select({ faixa: stageLeadCapiEnviados.faixa })
      .from(stageLeadCapiEnviados)
      .where(eq(stageLeadCapiEnviados.stageId, p.data.stageId));
    const porFaixa = new Map<string, number>();
    for (const l of linhas) porFaixa.set(l.faixa, (porFaixa.get(l.faixa) ?? 0) + 1);
    return {
      total: linhas.length,
      porFaixa: [...porFaixa.entries()].map(([faixa, total]) => ({ faixa, total })),
    };
  });
});
