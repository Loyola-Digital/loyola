/**
 * CRUD dos dashboards de BI.
 *
 * O `PUT` é **parcial** de propósito, e isso não é conforto de API: o canvas
 * salva só `widgets` a cada arrasto e a barra de período salva só `dateRange`.
 * Se cada um mandasse o documento inteiro, dois salvamentos concorrentes se
 * sobrescreveriam — o arrasto apagaria a troca de período feita no segundo antes.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { biDashboards, projectMembers, projects } from "../db/schema.js";
import {
  LIMITE_DE_WIDGETS,
  dateRangeSchema,
  duplicarWidgets,
  nomeDaCopia,
  resolverPeriodo,
  widgetSchema,
  widgetsGuardados,
  type DateRange,
} from "../services/bi/dashboard.js";

const paramsSchema = z.object({ projectId: z.string().uuid() });
const paramsComIdSchema = paramsSchema.extend({ id: z.string().uuid() });

const criarSchema = z.object({
  nome: z.string().min(1).max(200).default("Novo dashboard"),
  dateRange: dateRangeSchema.optional(),
});

/**
 * O patch. Todo campo é opcional, e o que não veio **não é tocado**.
 *
 * `.strict()` porque campo escrito errado (`widget` em vez de `widgets`) sairia
 * como sucesso sem salvar nada — o pior tipo de falha, a que parece funcionar.
 */
const patchSchema = z
  .object({
    nome: z.string().min(1).max(200).optional(),
    dateRange: dateRangeSchema.optional(),
    widgets: z.array(widgetSchema).optional(),
  })
  .strict();

export default fp(async function biDashboardsRoutes(fastify) {
  /**
   * Guest não entra no BI: o construtor lê o funil inteiro, não a fatia que o
   * convidado enxerga. `null` significa sem acesso — e vira 404, nunca 403, para
   * não confirmar que o projeto existe.
   */
  async function temAcesso(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") return false;
    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projeto) return false;
    // Admin vê todo projeto; os demais precisam ser membros.
    if (userRole === "admin") return true;
    const [membro] = await fastify.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(membro);
  }

  function paraApi(linha: typeof biDashboards.$inferSelect) {
    const { widgets, ilegiveis } = widgetsGuardados(linha.widgets);
    const dateRange = linha.dateRange as DateRange;
    return {
      id: linha.id,
      projectId: linha.projectId,
      nome: linha.nome,
      widgets,
      // A contagem sobe junto: widget que não abre precisa aparecer como aviso
      // na tela, não como espaço vazio no canvas.
      widgetsIlegiveis: ilegiveis,
      dateRange,
      // O período já resolvido evita que o cliente recalcule "últimos 30 dias" e
      // chegue num dia diferente do servidor por causa do fuso do navegador.
      periodo: resolverPeriodo(dateRange),
      createdBy: linha.createdBy,
      createdAt: linha.createdAt.toISOString(),
      updatedAt: linha.updatedAt.toISOString(),
    };
  }

  async function carregar(projectId: string, id: string) {
    const [linha] = await fastify.db
      .select()
      .from(biDashboards)
      .where(and(eq(biDashboards.id, id), eq(biDashboards.projectId, projectId)))
      .limit(1);
    return linha ?? null;
  }

  fastify.get("/api/projects/:projectId/bi/dashboards", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Projeto inválido" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const linhas = await fastify.db
      .select()
      .from(biDashboards)
      .where(eq(biDashboards.projectId, p.data.projectId))
      .orderBy(desc(biDashboards.updatedAt));

    return { dashboards: linhas.map(paraApi) };
  });

  fastify.post("/api/projects/:projectId/bi/dashboards", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Projeto inválido" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const corpo = criarSchema.safeParse(request.body ?? {});
    if (!corpo.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [criado] = await fastify.db
      .insert(biDashboards)
      .values({
        projectId: p.data.projectId,
        nome: corpo.data.nome,
        widgets: [],
        dateRange: corpo.data.dateRange ?? { preset: "last_30d" },
        createdBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(paraApi(criado!));
  });

  fastify.get("/api/projects/:projectId/bi/dashboards/:id", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });
    return paraApi(linha);
  });

  fastify.put("/api/projects/:projectId/bi/dashboards/:id", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const corpo = patchSchema.safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({
        error: "Alteração inválida",
        detalhes: corpo.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`),
      });
    }
    const campos = corpo.data;
    if (Object.keys(campos).length === 0) {
      // Patch vazio devolveria 200 sem mudar nada, e a tela mostraria "salvo".
      return reply.code(400).send({ error: "Nada para alterar" });
    }
    if (campos.widgets && campos.widgets.length > LIMITE_DE_WIDGETS) {
      return reply.code(400).send({
        error: `Um dashboard cabe até ${LIMITE_DE_WIDGETS} widgets. Divida em dois.`,
      });
    }

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    // Só o que veio no corpo entra no UPDATE. É isto que impede o salvamento do
    // canvas de apagar o nome que alguém acabou de trocar.
    const [atualizado] = await fastify.db
      .update(biDashboards)
      .set({
        ...(campos.nome !== undefined ? { nome: campos.nome } : {}),
        ...(campos.dateRange !== undefined ? { dateRange: campos.dateRange } : {}),
        ...(campos.widgets !== undefined ? { widgets: campos.widgets } : {}),
        updatedAt: new Date(),
      })
      .where(eq(biDashboards.id, p.data.id))
      .returning();

    return paraApi(atualizado!);
  });

  fastify.post("/api/projects/:projectId/bi/dashboards/:id/duplicate", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    const { widgets } = widgetsGuardados(linha.widgets);
    const [copia] = await fastify.db
      .insert(biDashboards)
      .values({
        projectId: linha.projectId,
        nome: nomeDaCopia(linha.nome),
        // Ids novos: dois widgets com o mesmo id fariam o canvas salvar a
        // geometria de um por cima do outro. Nada de resultado é copiado porque
        // resultado nunca foi salvo.
        widgets: duplicarWidgets(widgets),
        dateRange: linha.dateRange,
        createdBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(paraApi(copia!));
  });

  fastify.delete("/api/projects/:projectId/bi/dashboards/:id", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const apagados = await fastify.db
      .delete(biDashboards)
      .where(and(eq(biDashboards.id, p.data.id), eq(biDashboards.projectId, p.data.projectId)))
      .returning({ id: biDashboards.id });

    if (apagados.length === 0) return reply.code(404).send({ error: "Dashboard não encontrado" });
    return { ok: true };
  });
});
