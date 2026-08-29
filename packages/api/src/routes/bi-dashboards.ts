/**
 * CRUD dos dashboards de BI.
 *
 * O `PUT` é **parcial** de propósito, e isso não é conforto de API: o canvas
 * salva só `widgets` a cada arrasto e a barra de período salva só `dateRange`.
 * Se cada um mandasse o documento inteiro, dois salvamentos concorrentes se
 * sobrescreveriam — o arrasto apagaria a troca de período feita no segundo antes.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { biDashboards, projectMembers, projects } from "../db/schema.js";
import {
  LIMITE_DE_WIDGETS,
  PADRAO_POR_TIPO,
  dateRangeSchema,
  duplicarWidgets,
  nomeDaCopia,
  primeiroEspacoLivre,
  resolverPeriodo,
  widgetSchema,
  widgetsGuardados,
  type DateRange,
  type Widget,
} from "../services/bi/dashboard.js";
import {
  aplicarContexto,
  slicerSchema,
  slicersGuardados,
  type ContextoDoDashboard,
  type Slicer,
} from "../services/bi/contexto.js";
import { aplicarDerivadas, validarDerivadas } from "../services/bi/derivadas.js";
import { comPeriodo, preset } from "../services/bi/presets.js";
import { ErroDeQuery, executarQuery, type ResultadoDaQuery } from "../services/bi/query.js";

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
    slicers: z.array(slicerSchema).max(20).optional(),
  })
  .strict();

/**
 * O que impede um widget de ser salvo.
 *
 * A validação das derivadas roda na ESCRITA, não só na leitura: uma expressão
 * que aponta para `q3` num widget de duas consultas precisa ser recusada na hora
 * de salvar — senão vira coluna vazia todo dia, sem ninguém saber por quê.
 */
function problemasDoWidget(w: Widget): string[] {
  const quantidade = 1 + (w.specsExtras?.length ?? 0);
  return validarDerivadas(w.derivadas ?? [], quantidade, w.mergeKey).map(
    (p) => `${w.titulo}: ${p}`,
  );
}

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
      slicers: slicersGuardados(linha.slicers),
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
    const problemas = (campos.widgets ?? []).flatMap(problemasDoWidget);
    if (problemas.length > 0) {
      return reply.code(400).send({ error: problemas[0], detalhes: problemas });
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
        ...(campos.slicers !== undefined ? { slicers: campos.slicers } : {}),
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
        slicers: linha.slicers,
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

  // ============================================================
  // Widgets e execução
  // ============================================================

  /**
   * Executa vários widgets sem afogar o pool de conexões.
   *
   * Sessenta widgets num `Promise.all` abrem sessenta consultas de uma vez — e o
   * dashboard passa a ser o que derruba a API para todo mundo.
   */
  type ResultadoDoWidget = ResultadoDaQuery | { erro: string; campo?: string };

  /**
   * Executa UM widget já com o contexto do dashboard aplicado.
   *
   * Um widget pode ter até quatro consultas — `spec` é a q0 e `specsExtras` são
   * as demais. Elas existem justamente para poder ter **filtros diferentes**, e
   * as colunas derivadas as combinam depois.
   */
  async function executarWidget(
    widget: Widget,
    projectId: string,
    ctx: ContextoDoDashboard,
  ): Promise<ResultadoDoWidget> {
    try {
      const todas = [widget.spec, ...(widget.specsExtras ?? [])];
      const avisos: string[] = [];
      const resultados: ResultadoDaQuery[] = [];
      for (const bruta of todas) {
        const preparada = aplicarContexto(bruta, ctx);
        avisos.push(...preparada.avisos);
        resultados.push(
          await executarQuery(preparada.spec, { db: fastify.db as never, projectId }),
        );
      }
      const r = aplicarDerivadas(resultados, widget.derivadas ?? [], widget.mergeKey);
      // Os avisos do contexto entram junto com os da execução: um filtro que a
      // pessoa acha que aplicou e não aplicou é número errado com cara de certo.
      return { ...r, avisos: [...avisos, ...r.avisos] };
    } catch (erro) {
      // Um widget que falha não pode apagar os outros 59: o erro vira o conteúdo
      // daquele card, e o resto do dashboard continua de pé.
      if (erro instanceof ErroDeQuery) return { erro: erro.message, campo: erro.campo };
      fastify.log.error({ erro }, "widget falhou");
      return { erro: "Não foi possível carregar este widget" };
    }
  }

  async function executarEmLotes(
    widgets: Widget[],
    projectId: string,
    ctx: ContextoDoDashboard,
    tamanhoDoLote = 6,
  ): Promise<Record<string, ResultadoDoWidget>> {
    const saida: Record<string, ResultadoDoWidget> = {};
    for (let i = 0; i < widgets.length; i += tamanhoDoLote) {
      const lote = widgets.slice(i, i + tamanhoDoLote);
      await Promise.all(
        lote.map(async (w) => {
          saida[w.id] = await executarWidget(w, projectId, ctx);
        }),
      );
    }
    return saida;
  }

  /** O contexto salvo no dashboard, opcionalmente sobreposto pelo corpo. */
  function contextoDe(
    linha: typeof biDashboards.$inferSelect,
    sobreposicao?: { dateRange?: DateRange; slicers?: Slicer[] },
  ): ContextoDoDashboard {
    return {
      periodo: resolverPeriodo(sobreposicao?.dateRange ?? (linha.dateRange as DateRange)),
      slicers: sobreposicao?.slicers ?? slicersGuardados(linha.slicers),
    };
  }

  /**
   * A sobreposição de contexto para uma execução.
   *
   * Existe para a tela poder **pré-visualizar** um recorte antes de salvá-lo —
   * mexer no seletor de período não deveria gravar nada até a pessoa parar de
   * mexer.
   */
  const contextoSchema = z
    .object({
      dateRange: dateRangeSchema.optional(),
      slicers: z.array(slicerSchema).max(20).optional(),
    })
    .strict();

  const inserirSchema = z.union([
    z.object({
      presetId: z.string().min(1).max(80),
      geometria: widgetSchema.shape.geometria.partial().optional(),
      titulo: z.string().min(1).max(120).optional(),
    }),
    z.object({ widget: widgetSchema.omit({ id: true }) }),
  ]);

  fastify.post("/api/projects/:projectId/bi/dashboards/:id/widgets", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const corpo = inserirSchema.safeParse(request.body);
    if (!corpo.success) return reply.code(400).send({ error: "Widget inválido" });

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    const { widgets } = widgetsGuardados(linha.widgets);
    if (widgets.length >= LIMITE_DE_WIDGETS) {
      return reply
        .code(400)
        .send({ error: `Um dashboard cabe até ${LIMITE_DE_WIDGETS} widgets. Divida em dois.` });
    }

    const periodo = resolverPeriodo(linha.dateRange as DateRange);
    let novo: Widget;

    if ("presetId" in corpo.data) {
      const escolhido = preset(corpo.data.presetId);
      if (!escolhido) return reply.code(400).send({ error: "Preset desconhecido" });
      if (escolhido.bloqueado) {
        // Recusar aqui, em vez de deixar o widget entrar para falhar depois: um
        // card que erra toda vez que carrega é pior que um botão desabilitado.
        return reply.code(400).send({ error: escolhido.bloqueado });
      }
      const tamanho = {
        w: corpo.data.geometria?.w ?? PADRAO_POR_TIPO[escolhido.tipo].w,
        h: corpo.data.geometria?.h ?? PADRAO_POR_TIPO[escolhido.tipo].h,
      };
      // Soltou num lugar? Vai para lá. Clicou? Vai para o primeiro espaço livre.
      const canto =
        corpo.data.geometria?.x !== undefined && corpo.data.geometria?.y !== undefined
          ? { x: corpo.data.geometria.x, y: corpo.data.geometria.y }
          : primeiroEspacoLivre(
              widgets.map((w) => w.geometria),
              tamanho,
            );
      novo = {
        id: randomUUID(),
        tipo: escolhido.tipo,
        titulo: corpo.data.titulo ?? escolhido.nome,
        spec: comPeriodo(escolhido.spec, periodo),
        // Preset é sempre uma consulta só: multi-query nasce no editor.
        specsExtras: [],
        derivadas: [],
        geometria: { ...canto, w: tamanho.w, h: tamanho.h },
        opcoes: escolhido.opcoes ?? {},
      };
    } else {
      novo = { ...corpo.data.widget, id: randomUUID() };
      const problemas = problemasDoWidget(novo);
      if (problemas.length > 0) {
        return reply.code(400).send({ error: problemas[0], detalhes: problemas });
      }
    }

    const atualizados = [...widgets, novo];
    await fastify.db
      .update(biDashboards)
      .set({ widgets: atualizados, updatedAt: new Date() })
      .where(eq(biDashboards.id, p.data.id));

    // O resultado volta junto: sem isto a inserção precisaria de um segundo
    // request, e o widget nasceria vazio por um instante.
    let resultado: ResultadoDaQuery | { erro: string };
    try {
      resultado = await executarQuery(novo.spec, {
        db: fastify.db as never,
        projectId: p.data.projectId,
      });
    } catch (erro) {
      resultado = { erro: erro instanceof ErroDeQuery ? erro.message : "Falha ao calcular" };
    }

    return reply.code(201).send({ widget: novo, resultado });
  });

  fastify.delete(
    "/api/projects/:projectId/bi/dashboards/:id/widgets/:widgetId",
    async (request, reply) => {
      const p = paramsComIdSchema.extend({ widgetId: z.string().min(1) }).safeParse(request.params);
      if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
        return reply.code(404).send({ error: "Projeto não encontrado" });
      }

      const linha = await carregar(p.data.projectId, p.data.id);
      if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

      const { widgets } = widgetsGuardados(linha.widgets);
      const restantes = widgets.filter((w) => w.id !== p.data.widgetId);
      if (restantes.length === widgets.length) {
        return reply.code(404).send({ error: "Widget não encontrado" });
      }

      await fastify.db
        .update(biDashboards)
        .set({ widgets: restantes, updatedAt: new Date() })
        .where(eq(biDashboards.id, p.data.id));

      return { ok: true };
    },
  );

  fastify.post("/api/projects/:projectId/bi/dashboards/:id/execute", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const sobreposicao = contextoSchema.safeParse(request.body ?? {});
    if (!sobreposicao.success) return reply.code(400).send({ error: "Contexto inválido" });

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    const { widgets } = widgetsGuardados(linha.widgets);
    const ctx = contextoDe(linha, sobreposicao.data);
    return { resultados: await executarEmLotes(widgets, p.data.projectId, ctx), periodo: ctx.periodo };
  });

  /**
   * A mesma execução, em NDJSON — uma linha por widget, conforme cada uma sai.
   *
   * O painel pinta widget a widget em vez de esperar o mais lento. É a primeira
   * otimização que o dossiê recomenda, e antes de qualquer cache: num dashboard
   * com uma consulta pesada, é a diferença entre "cinco segundos de tela vazia" e
   * "quase tudo na hora, e um card enchendo depois".
   */
  fastify.post("/api/projects/:projectId/bi/dashboards/:id/refresh-all", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const sobreposicao = contextoSchema.safeParse(request.body ?? {});
    if (!sobreposicao.success) return reply.code(400).send({ error: "Contexto inválido" });

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    const { widgets } = widgetsGuardados(linha.widgets);
    const ctx = contextoDe(linha, sobreposicao.data);

    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Sem isto o proxy segura tudo e entrega no fim — o que anularia a
      // atualização progressiva sem nenhum sinal de que anulou.
      "X-Accel-Buffering": "no",
    });

    const escrever = (linhaJson: unknown) => {
      if (!reply.raw.writableEnded) reply.raw.write(`${JSON.stringify(linhaJson)}\n`);
    };

    // O cabeçalho vem primeiro: a tela precisa do período resolvido antes do
    // primeiro widget, para já rotular o eixo.
    escrever({ tipo: "inicio", total: widgets.length, periodo: ctx.periodo });

    let cancelado = false;
    request.raw.on("close", () => {
      // Quem fechou a aba não precisa das consultas restantes.
      cancelado = true;
    });

    const LOTE = 6;
    for (let i = 0; i < widgets.length && !cancelado; i += LOTE) {
      const lote = widgets.slice(i, i + LOTE);
      await Promise.all(
        lote.map(async (w) => {
          const resultado = await executarWidget(w, p.data.projectId, ctx);
          if (!cancelado) escrever({ tipo: "widget", widgetId: w.id, resultado });
        }),
      );
    }

    if (!cancelado) escrever({ tipo: "fim" });
    reply.raw.end();
    // `hijack` para o Fastify não tentar serializar uma resposta que já saiu.
    return reply.hijack();
  });
});
