/**
 * Match de origem — diagnóstico das aplicações sem `utm_source` e as regras
 * que as recuperam.
 *
 * Três endpoints, um por pergunta:
 *
 *   diagnostico   quantas aplicações não têm origem, e quanto disso já é regra
 *   orfas         como as que sobraram se distribuem por um campo qualquer
 *   regras        CRUD do que recupera
 *
 * A separação existe porque as duas primeiras leem a planilha inteira (caro) e
 * a terceira não (barato). Juntas num endpoint só, editar uma regra custaria
 * uma releitura de planilha a cada clique.
 */

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelStages, funnels, stageSourceRules } from "../db/schema.js";
import {
  agruparOrfaos,
  agruparParaClassificar,
  diagnosticar,
  type LinhaDeAplicacao,
  type RegraDeOrigem,
} from "../services/source-rules.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const regraSchema = z.object({
  campo: z.string().trim().min(1).max(120),
  operador: z.enum(["igual", "contem", "comeca_com", "vazio"]),
  valor: z.string().max(500).default(""),
  origem: z.string().trim().min(1).max(120),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativa: z.boolean().optional(),
});

/** O nome da coluna que carrega a origem declarada nas planilhas de aplicação. */
const CAMPO_DA_ORIGEM = "utm_source";

export default fp(async function stageSourceRulesRoutes(fastify) {
  /**
   * Prova que etapa, funil e projeto são a mesma cadeia.
   *
   * Sem isto, alguém do projeto A passaria o funnelId do projeto B na própria
   * URL de A e receberia dados de B — a membership conferida seria a de A, que
   * ele tem. Mesmo cuidado da rota de aplicações.
   */
  async function contexto(p: z.infer<typeof paramsSchema>) {
    const [ctx] = await fastify.db
      .select({ stageId: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, p.stageId),
          eq(funnelStages.funnelId, p.funnelId),
          eq(funnels.projectId, p.projectId),
        ),
      )
      .limit(1);
    return ctx ?? null;
  }

  async function regrasDaEtapa(stageId: string): Promise<RegraDeOrigem[]> {
    const linhas = await fastify.db
      .select()
      .from(stageSourceRules)
      .where(eq(stageSourceRules.stageId, stageId))
      .orderBy(asc(stageSourceRules.ordem), asc(stageSourceRules.createdAt));
    return linhas.map((r) => ({
      id: r.id,
      campo: r.campo,
      operador: r.operador,
      valor: r.valor,
      origem: r.origem,
      ordem: r.ordem,
      ativa: r.ativa,
    }));
  }

  /**
   * As linhas cruas das planilhas da etapa.
   *
   * Cru de propósito: a regra pode observar QUALQUER coluna, então reduzir a
   * linha aos campos que a tela de aplicações usa tiraria justamente os campos
   * que servem para recuperar a origem.
   */
  async function linhasDaEtapa(
    funnelId: string,
  ): Promise<{ linhas: LinhaDeAplicacao[]; colunas: string[]; semPlanilha: boolean }> {
    const { carregarLinhasBrutas } = await import("../services/application-sheets.js");
    return carregarLinhasBrutas(fastify, funnelId);
  }

  // ---- Diagnóstico ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/source-match/diagnostico",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await contexto(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [{ linhas, colunas, semPlanilha }, regras] = await Promise.all([
        linhasDaEtapa(p.data.funnelId),
        regrasDaEtapa(p.data.stageId),
      ]);
      if (semPlanilha) {
        return { semPlanilha: true, diagnostico: null, colunas: [], aClassificar: [], regras };
      }

      return {
        semPlanilha: false,
        diagnostico: diagnosticar(linhas, CAMPO_DA_ORIGEM, regras),
        // As origens que existem e não dizem se são pagas ou orgânicas. Nesta
        // base é o grupo GRANDE — bem maior que o das sem origem.
        aClassificar: agruparParaClassificar(linhas, CAMPO_DA_ORIGEM, regras),
        // Colunas com algum conteúdo — as vazias não servem para analisar nada
        // e só alongam o seletor.
        colunas: colunas.filter((c) => c !== CAMPO_DA_ORIGEM),
        regras,
      };
    },
  );

  // ---- Órfãs agrupadas por um campo ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/source-match/orfas",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      const q = z.object({ campo: z.string().trim().min(1).max(120) }).safeParse(request.query);
      if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await contexto(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [{ linhas, semPlanilha }, regras] = await Promise.all([
        linhasDaEtapa(p.data.funnelId),
        regrasDaEtapa(p.data.stageId),
      ]);
      if (semPlanilha) return { grupos: [] };

      return { grupos: agruparOrfaos(linhas, CAMPO_DA_ORIGEM, q.data.campo, regras) };
    },
  );

  // ---- Regras ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/source-match/regras",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.safeParse(request.params);
      // Aceita uma ou várias: a tela cria um grupo inteiro de uma vez, e mandar
      // N requests deixaria a atribuição pela metade se uma falhasse.
      const body = z.union([regraSchema, z.array(regraSchema).max(200)]).safeParse(request.body);
      if (!p.success || !body.success) {
        return reply.code(400).send({
          error: "Dados inválidos",
          details: body.success ? undefined : body.error.flatten(),
        });
      }
      if (!(await contexto(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

      const novas = Array.isArray(body.data) ? body.data : [body.data];
      const invalida = novas.find((r) => r.operador !== "vazio" && !r.valor.trim());
      if (invalida) {
        return reply.code(400).send({
          error: `A regra sobre "${invalida.campo}" precisa de um valor — só o operador "vazio" dispensa.`,
        });
      }

      const criadas = await fastify.db
        .insert(stageSourceRules)
        .values(
          novas.map((r, i) => ({
            stageId: p.data.stageId,
            campo: r.campo,
            operador: r.operador,
            valor: r.operador === "vazio" ? "" : r.valor.trim(),
            origem: r.origem.trim(),
            ordem: r.ordem ?? i,
            ativa: r.ativa ?? true,
            createdBy: request.userId,
          })),
        )
        .returning();

      return reply.code(201).send({ regras: criadas });
    },
  );

  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/source-match/regras/:regraId",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.extend({ regraId: z.string().uuid() }).safeParse(request.params);
      const body = regraSchema.partial().safeParse(request.body);
      if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });
      if (!(await contexto(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [linha] = await fastify.db
        .update(stageSourceRules)
        .set({ ...body.data, updatedAt: new Date() })
        .where(
          and(
            eq(stageSourceRules.id, p.data.regraId),
            // A etapa entra no WHERE: sem ela, o id de uma regra de outra etapa
            // seria editável por quem tem acesso a esta.
            eq(stageSourceRules.stageId, p.data.stageId),
          ),
        )
        .returning();
      if (!linha) return reply.code(404).send({ error: "Regra não encontrada" });
      return { regra: linha };
    },
  );

  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/source-match/regras/:regraId",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const p = paramsSchema.extend({ regraId: z.string().uuid() }).safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await contexto(p.data))) return reply.code(404).send({ error: "Etapa não encontrada" });

      await fastify.db
        .delete(stageSourceRules)
        .where(
          and(
            eq(stageSourceRules.id, p.data.regraId),
            eq(stageSourceRules.stageId, p.data.stageId),
          ),
        );
      return reply.code(204).send();
    },
  );
});
