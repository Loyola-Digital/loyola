/**
 * Regras de alerta e as preferências de notificação de cada pessoa.
 *
 * A regra vive numa lista só, não dentro de um projeto: `projectId` nulo vale
 * para TODOS os projetos que alguém siga, que é como a maioria das regras
 * nasce ("ROAS abaixo de 1" vale em qualquer funil). Projeto preenchido é a
 * exceção, para quando um expert tem número próprio.
 *
 * O envio em si é do agendador (`plugins/alertas-de-funil-scheduler.ts`); aqui
 * fica o cadastro e o "testar agora", que existe para calibrar o limiar sem
 * esperar o ciclo — ele devolve o número de hoje e diz se dispararia.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  alertRuleState,
  alertRules,
  notificationFollows,
  notificationPrefs,
  projectMembers,
  projects,
} from "../db/schema.js";
import { lerPreferencias } from "../services/resumo-diario.js";
import {
  METRICAS,
  ROTULO_DA_METRICA,
  hojeSaoPaulo,
  julgar,
  lerMetricaPorFunil,
  textoDoAlerta,
  type Metrica,
  type Regra,
} from "../services/alertas-de-funil.js";

const regraSchema = z.object({
  /** Ausente ou nulo = todos os projetos. */
  projectId: z.string().uuid().nullable().default(null),
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
    projectId: r.projectId,
    metrica: r.metrica,
    rotulo: ROTULO_DA_METRICA[r.metrica as Metrica] ?? r.metrica,
    comparador: r.comparador,
    valor: Number(r.valor),
    gastoMinimo: r.gastoMinimo == null ? null : Number(r.gastoMinimo),
    janelaDias: r.janelaDias,
    ativo: r.ativo,
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

  /** Regra global mexe no que todo mundo recebe — convidado não cria. */
  function podeMexerEmRegraGlobal(role: string) {
    return role !== "guest";
  }

  const base = "/api/notificacoes/alertas";

  fastify.get(base, async () => {
    const regras = await fastify.db.select().from(alertRules);
    const nomes = new Map(
      (await fastify.db.select({ id: projects.id, name: projects.name }).from(projects)).map((p) => [
        p.id,
        p.name,
      ]),
    );
    // Quantas pessoas receberiam: regra sem seguidor nenhum não avisa ninguém,
    // e isso não aparece em lugar nenhum se a tela não disser.
    const seguidos = await fastify.db
      .select({ userId: notificationFollows.userId, projectId: notificationFollows.projectId })
      .from(notificationFollows);

    return {
      regras: regras.map((r) => ({
        ...shape(r),
        projeto: r.projectId ? (nomes.get(r.projectId) ?? "Projeto") : null,
        alcance: r.projectId
          ? seguidos.filter((s) => s.projectId === r.projectId).length
          : new Set(seguidos.map((s) => s.userId)).size,
      })),
      projetosSeguidos: new Set(seguidos.map((s) => s.projectId)).size,
    };
  });

  fastify.post(base, async (request, reply) => {
    const corpo = regraSchema.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "REGRA_INVALIDA" });
    if (!corpo.data.projectId && !podeMexerEmRegraGlobal(request.userRole)) {
      return reply.code(403).send({ error: "Regra para todos os projetos exige conta do time." });
    }
    if (
      corpo.data.projectId &&
      !(await podeVerProjeto(corpo.data.projectId, request.userId, request.userRole))
    ) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [criada] = await fastify.db
      .insert(alertRules)
      .values({
        projectId: corpo.data.projectId,
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
    const { id } = request.params as { id: string };
    const corpo = regraSchema.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "REGRA_INVALIDA" });
    if (!corpo.data.projectId && !podeMexerEmRegraGlobal(request.userRole)) {
      return reply.code(403).send({ error: "Regra para todos os projetos exige conta do time." });
    }

    const [atualizada] = await fastify.db
      .update(alertRules)
      .set({
        projectId: corpo.data.projectId,
        metrica: corpo.data.metrica,
        comparador: corpo.data.comparador,
        valor: String(corpo.data.valor),
        gastoMinimo: corpo.data.gastoMinimo == null ? null : String(corpo.data.gastoMinimo),
        janelaDias: corpo.data.janelaDias,
        ativo: corpo.data.ativo,
        updatedAt: new Date(),
      })
      .where(eq(alertRules.id, id))
      .returning();
    if (!atualizada) return reply.code(404).send({ error: "Regra não encontrada" });

    // Mexer na regra limpa o "já avisou hoje" de todos os projetos: quem
    // acabou de mudar o limiar quer ver o efeito hoje, não amanhã.
    await fastify.db.delete(alertRuleState).where(eq(alertRuleState.ruleId, id));
    return { regra: shape(atualizada) };
  });

  fastify.delete(`${base}/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [regra] = await fastify.db
      .select({ projectId: alertRules.projectId })
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .limit(1);
    if (!regra) return reply.code(404).send({ error: "Regra não encontrada" });
    if (!regra.projectId && !podeMexerEmRegraGlobal(request.userRole)) {
      return reply.code(403).send({ error: "Regra para todos os projetos exige conta do time." });
    }
    await fastify.db.delete(alertRules).where(eq(alertRules.id, id));
    return { ok: true };
  });

  /**
   * Avalia a regra AGORA e devolve o número — sem enviar nada.
   *
   * Regra global precisa de um projeto para ter número: a tela manda em qual
   * conferir, e sem isso usa o primeiro projeto seguido.
   */
  fastify.post(`${base}/:id/testar`, async (request, reply) => {
    const { id } = request.params as { id: string };
    const corpo = z
      .object({ projectId: z.string().uuid().optional() })
      .safeParse(request.body ?? {});
    const [regra] = await fastify.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.id, id))
      .limit(1);
    if (!regra) return reply.code(404).send({ error: "Regra não encontrada" });

    const projectId =
      regra.projectId ??
      (corpo.success ? corpo.data.projectId : undefined) ??
      (
        await fastify.db
          .select({ projectId: notificationFollows.projectId })
          .from(notificationFollows)
          .limit(1)
      )[0]?.projectId;
    if (!projectId) {
      return reply
        .code(409)
        .send({ error: "Siga pelo menos um projeto para conferir uma regra que vale para todos." });
    }
    if (!(await podeVerProjeto(projectId, request.userId, request.userRole))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    try {
      const [p] = await fastify.db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const nomeDoProjeto = p?.name ?? "Projeto";
      const itens = await lerMetricaPorFunil(
        fastify.db,
        projectId,
        nomeDoProjeto,
        regra.metrica as Metrica,
        regra.janelaDias,
      );
      // Um veredito por funil, porque é funil a funil que a regra julga. Sem o
      // "já avisou hoje" de propósito: senão a resposta seria sempre "já
      // avisou" justamente no dia em que a regra disparou.
      return {
        projeto: nomeDoProjeto,
        funis: itens.map((i) => ({
          chave: i.chave,
          nome: i.nome,
          ...julgar(regra as Regra, i.leitura, hojeSaoPaulo(), null),
          previa: textoDoAlerta(
            regra as Regra,
            i.leitura,
            i.nome,
            i.chave === "" ? undefined : nomeDoProjeto,
          ),
        })),
      };
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : "Não consegui ler a métrica." });
    }
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

  // ---- os projetos que a pessoa segue ----

  fastify.get("/api/notificacoes/projetos", async (request) => {
    const seguidos = await fastify.db
      .select({ projectId: notificationFollows.projectId })
      .from(notificationFollows)
      .where(eq(notificationFollows.userId, request.userId));
    return { projectIds: seguidos.map((s) => s.projectId) };
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
