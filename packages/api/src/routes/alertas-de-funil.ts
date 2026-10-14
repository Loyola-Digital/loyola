/**
 * Regras de alerta por projeto e os projetos que cada pessoa segue.
 *
 * O envio em si é do agendador (`plugins/alertas-de-funil-scheduler.ts`); aqui
 * fica o cadastro e o "testar agora", que existe para calibrar o limiar sem
 * esperar o ciclo — ele devolve o número de hoje e diz se dispararia.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import { alertRules, notificationFollows, projectMembers, projects } from "../db/schema.js";
import { lerPreferencias } from "../services/resumo-diario.js";
import { notificationPrefs } from "../db/schema.js";
import {
  METRICAS,
  ROTULO_DA_METRICA,
  hojeSaoPaulo,
  julgar,
  lerMetrica,
  seguidoresDoProjeto,
  textoDoAlerta,
  type Metrica,
  type Regra,
} from "../services/alertas-de-funil.js";

const regraSchema = z.object({
  metrica: z.enum(METRICAS),
  comparador: z.enum(["menor", "maior"]).default("menor"),
  /** Connect rate em razão (0,6 = 60%); ROAS em múltiplo; o resto em reais. */
  valor: z.number().finite(),
  gastoMinimo: z.number().finite().nonnegative().nullable().default(null),
  janelaDias: z.number().int().min(1).max(30).default(1),
  ativo: z.boolean().default(true),
});

function shape(r: typeof alertRules.$inferSelect) {
  return {
    id: r.id,
    metrica: r.metrica,
    rotulo: ROTULO_DA_METRICA[r.metrica as Metrica] ?? r.metrica,
    comparador: r.comparador,
    valor: Number(r.valor),
    gastoMinimo: r.gastoMinimo == null ? null : Number(r.gastoMinimo),
    janelaDias: r.janelaDias,
    ativo: r.ativo,
    lastSentDate: r.lastSentDate,
  };
}

export default fp(async function alertasDeFunilRoutes(fastify) {
  /** Convidado só enxerga projeto de que é membro; o resto enxerga tudo. */
  async function podeVerProjeto(projectId: string, userId: string, role: string) {
    if (role === "guest") {
      const [m] = await fastify.db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!m) return false;
    }
    const [p] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return Boolean(p);
  }

  const base = "/api/projects/:projectId/alertas";

  fastify.get(base, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const linhas = await fastify.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.projectId, projectId));
    return {
      regras: linhas.map(shape),
      // Quantas pessoas receberiam: regra sem seguidor não avisa ninguém, e
      // isso não aparece em lugar nenhum se a tela não disser.
      seguidores: (await seguidoresDoProjeto(fastify.db, projectId)).length,
    };
  });

  fastify.post(base, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const corpo = regraSchema.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "REGRA_INVALIDA" });

    const [criada] = await fastify.db
      .insert(alertRules)
      .values({
        projectId,
        metrica: corpo.data.metrica,
        comparador: corpo.data.comparador,
        valor: String(corpo.data.valor),
        gastoMinimo: corpo.data.gastoMinimo == null ? null : String(corpo.data.gastoMinimo),
        janelaDias: corpo.data.janelaDias,
        ativo: corpo.data.ativo,
        createdBy: request.userId,
      })
      .returning();
    return { regra: shape(criada) };
  });

  fastify.put(`${base}/:id`, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const corpo = regraSchema.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "REGRA_INVALIDA" });

    const [atualizada] = await fastify.db
      .update(alertRules)
      .set({
        metrica: corpo.data.metrica,
        comparador: corpo.data.comparador,
        valor: String(corpo.data.valor),
        gastoMinimo: corpo.data.gastoMinimo == null ? null : String(corpo.data.gastoMinimo),
        janelaDias: corpo.data.janelaDias,
        ativo: corpo.data.ativo,
        // Mexer na regra limpa o "já avisou hoje": quem acabou de mudar o
        // limiar quer ver o efeito hoje, não amanhã.
        lastSentDate: null,
        updatedAt: new Date(),
      })
      .where(and(eq(alertRules.id, id), eq(alertRules.projectId, projectId)))
      .returning();
    if (!atualizada) return reply.code(404).send({ error: "Regra não encontrada" });
    return { regra: shape(atualizada) };
  });

  fastify.delete(`${base}/:id`, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    await fastify.db
      .delete(alertRules)
      .where(and(eq(alertRules.id, id), eq(alertRules.projectId, projectId)));
    return { ok: true };
  });

  /** Avalia a regra AGORA e devolve o número — sem enviar nada. */
  fastify.post(`${base}/:id/testar`, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const [regra] = await fastify.db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.id, id), eq(alertRules.projectId, projectId)))
      .limit(1);
    if (!regra) return reply.code(404).send({ error: "Regra não encontrada" });

    try {
      const leitura = await lerMetrica(
        fastify.db,
        projectId,
        regra.metrica as Metrica,
        regra.janelaDias,
      );
      // `lastSentDate` zerado no teste: senão a resposta seria sempre "já
      // avisou hoje" justamente no dia em que a regra disparou.
      const veredito = julgar({ ...(regra as Regra), lastSentDate: null }, leitura, hojeSaoPaulo());
      const [p] = await fastify.db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      return {
        ...veredito,
        previa: textoDoAlerta({ ...(regra as Regra) }, leitura, p?.name ?? "Projeto"),
      };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "Não consegui ler a métrica." });
    }
  });

  // ---- os projetos que a pessoa segue ----

  fastify.get("/api/notificacoes/projetos", async (request) => {
    const seguidos = await fastify.db
      .select({ projectId: notificationFollows.projectId })
      .from(notificationFollows)
      .where(eq(notificationFollows.userId, request.userId));
    return { projectIds: seguidos.map((s) => s.projectId) };
  });

  // ---- preferências de resumo ----

  fastify.get("/api/notificacoes/preferencias", async (request) =>
    lerPreferencias(fastify, request.userId),
  );

  fastify.put("/api/notificacoes/preferencias", async (request, reply) => {
    const corpo = z
      .object({
        resumoAtivo: z.boolean(),
        // 8–21 porque o agendador só roda de 8h às 22h: hora fora da janela
        // nunca chegaria, e a tela prometeria o que não acontece.
        horaDoResumo: z.number().int().min(8).max(21),
      })
      .safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "PREFERENCIA_INVALIDA" });

    await fastify.db
      .insert(notificationPrefs)
      .values({ userId: request.userId, ...corpo.data })
      .onConflictDoUpdate({
        target: notificationPrefs.userId,
        set: { ...corpo.data, updatedAt: new Date() },
      });
    return lerPreferencias(fastify, request.userId);
  });

  fastify.put("/api/notificacoes/projetos", async (request, reply) => {
    const corpo = z
      .object({ projectIds: z.array(z.string().uuid()).max(100) })
      .safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "LISTA_INVALIDA" });

    // Troca a lista inteira: a tela manda o estado final, não o que mudou.
    await fastify.db
      .delete(notificationFollows)
      .where(eq(notificationFollows.userId, request.userId));
    if (corpo.data.projectIds.length > 0) {
      const existentes = await fastify.db
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.id, corpo.data.projectIds));
      if (existentes.length > 0) {
        await fastify.db
          .insert(notificationFollows)
          .values(existentes.map((p) => ({ userId: request.userId, projectId: p.id })));
      }
    }
    return { ok: true };
  });
});
