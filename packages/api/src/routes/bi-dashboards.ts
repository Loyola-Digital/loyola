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
import { montarWidgets } from "../services/bi/agente.js";
import { aplicarDerivadas, validarDerivadas } from "../services/bi/derivadas.js";
import { comPeriodo, preset } from "../services/bi/presets.js";
import { ErroDeQuery, executarQuery, type ResultadoDaQuery } from "../services/bi/query.js";

const paramsSchema = z.object({ projectId: z.string().uuid() });
const paramsComIdSchema = paramsSchema.extend({ id: z.string().uuid() });

/** `projeto` = só o daqui; `todos` = todos os que quem olha enxerga. */
const escopoSchema = z.enum(["projeto", "todos"]);

const criarSchema = z.object({
  nome: z.string().min(1).max(200).default("Novo dashboard"),
  dateRange: dateRangeSchema.optional(),
  escopo: escopoSchema.optional(),
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
    escopo: escopoSchema.optional(),
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

  /**
   * Os projetos que a consulta pode ler.
   *
   * Sai da SESSÃO, nunca do documento: um dashboard salvo com escopo `todos` não
   * pode virar uma forma de ver projeto que a pessoa não enxerga. Admin vê
   * todos; os demais, só onde são membros.
   */
  async function projetosVisiveis(userId: string, userRole: string): Promise<string[]> {
    if (userRole === "admin") {
      const todos = await fastify.db.select({ id: projects.id }).from(projects);
      return todos.map((p) => p.id);
    }
    const meus = await fastify.db
      .select({ id: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    return meus.map((m) => m.id);
  }

  /** A lista de projetos que este dashboard consulta, dado quem está olhando. */
  async function escopoDe(
    linha: typeof biDashboards.$inferSelect,
    userId: string,
    userRole: string,
  ): Promise<string[]> {
    if (linha.escopo !== "todos") return [linha.projectId];
    const visiveis = await projetosVisiveis(userId, userRole);
    // O projeto de origem sempre entra: quem consegue abrir o dashboard já
    // provou acesso a ele.
    return visiveis.includes(linha.projectId) ? visiveis : [...visiveis, linha.projectId];
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
      escopo: linha.escopo === "todos" ? ("todos" as const) : ("projeto" as const),
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
        escopo: corpo.data.escopo ?? "projeto",
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
        ...(campos.escopo !== undefined ? { escopo: campos.escopo } : {}),
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
        escopo: linha.escopo,
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
    projectIds: string[],
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
          await executarQuery(preparada.spec, {
            db: fastify.db as never,
            projectIds,
            log: fastify.log,
          }),
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
    projectIds: string[],
    ctx: ContextoDoDashboard,
    tamanhoDoLote = 6,
  ): Promise<Record<string, ResultadoDoWidget>> {
    const saida: Record<string, ResultadoDoWidget> = {};
    for (let i = 0; i < widgets.length; i += tamanhoDoLote) {
      const lote = widgets.slice(i, i + tamanhoDoLote);
      await Promise.all(
        lote.map(async (w) => {
          saida[w.id] = await executarWidget(w, projectIds, ctx);
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
        projectIds: await escopoDe(linha, request.userId!, request.userRole!),
        log: fastify.log,
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
    const alcance = await escopoDe(linha, request.userId!, request.userRole!);
    return {
      resultados: await executarEmLotes(widgets, alcance, ctx),
      periodo: ctx.periodo,
      projetosNoEscopo: alcance.length,
    };
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

    // `hijack` ANTES de escrever: a partir daqui o Fastify não toca mais na
    // resposta, e é este handler que fala com o socket.
    reply.hijack();

    // Os headers que o Fastify já tinha acumulado precisam ir JUNTO.
    //
    // Escrever direto no socket pula o `onSend`, que é onde o `@fastify/cors`
    // põe o `Access-Control-Allow-Origin`. Sem esta cópia a resposta sai 200 e o
    // navegador a descarta por CORS — um erro que não aparece em teste de
    // servidor nem em log de aplicação, só no console de quem está usando.
    reply.raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, number | string | string[]>),
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
    const alcance = await escopoDe(linha, request.userId!, request.userRole!);
    escrever({
      tipo: "inicio",
      total: widgets.length,
      periodo: ctx.periodo,
      projetosNoEscopo: alcance.length,
    });

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
          const resultado = await executarWidget(w, alcance, ctx);
          if (!cancelado) escrever({ tipo: "widget", widgetId: w.id, resultado });
        }),
      );
    }

    if (!cancelado) escrever({ tipo: "fim" });
    reply.raw.end();
  });

  /**
   * Monta widget a partir de uma pergunta em português.
   *
   * O modelo escolhe chaves do catálogo; o `validarSpec`/`planejar` de sempre
   * decide o que entra. Uma chave inventada vira aviso, nunca consulta.
   */
  fastify.post("/api/projects/:projectId/bi/dashboards/:id/agente", async (request, reply) => {
    const p = paramsComIdSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const corpo = z
      .object({ pergunta: z.string().min(3).max(1000) })
      .safeParse(request.body);
    if (!corpo.success) {
      return reply.code(400).send({ error: "Escreva a pergunta com pelo menos 3 caracteres." });
    }

    const linha = await carregar(p.data.projectId, p.data.id);
    if (!linha) return reply.code(404).send({ error: "Dashboard não encontrado" });

    const { widgets } = widgetsGuardados(linha.widgets);
    if (widgets.length >= LIMITE_DE_WIDGETS) {
      return reply
        .code(400)
        .send({ error: `Um dashboard cabe até ${LIMITE_DE_WIDGETS} widgets. Divida em dois.` });
    }

    let resposta;
    try {
      resposta = await montarWidgets(corpo.data.pergunta, {
        cliente: fastify.claude.client,
        ocupados: widgets.map((w) => w.geometria),
      });
    } catch (erro) {
      fastify.log.error({ erro }, "agente de BI falhou");
      return reply.code(502).send({ error: "A IA não respondeu agora. Tente de novo." });
    }

    // Cabe o que sobra: o teto vale igual para quem pede à IA.
    const cabem = resposta.widgets.slice(0, LIMITE_DE_WIDGETS - widgets.length);
    const avisos = [...resposta.avisos];
    if (cabem.length < resposta.widgets.length) {
      avisos.push(`Só coube ${cabem.length} widget(s): o dashboard está perto do limite.`);
    }

    if (cabem.length > 0) {
      await fastify.db
        .update(biDashboards)
        .set({ widgets: [...widgets, ...cabem], updatedAt: new Date() })
        .where(eq(biDashboards.id, p.data.id));
    }

    // Os resultados voltam junto: o widget que a IA montou nasce preenchido, e
    // é vendo o número que a pessoa julga se a pergunta foi bem entendida.
    const ctx = contextoDe(linha);
    const alcance = await escopoDe(linha, request.userId!, request.userRole!);
    const resultados = await executarEmLotes(cabem, alcance, ctx);

    return {
      explicacao: resposta.explicacao,
      widgets: cabem,
      resultados,
      avisos,
    };
  });
});
