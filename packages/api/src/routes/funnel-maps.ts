/**
 * Mapa do funil — o desenho de blocos e conectores sobre o lançamento.
 *
 * Guarda e devolve o documento inteiro: o canvas edita tudo junto e salva
 * tudo junto, então rota de bloco individual só criaria oportunidade de o
 * desenho ficar meio salvo.
 *
 * Quando o mapa ainda não existe, a resposta vem com um rascunho montado a
 * partir das ETAPAS do funil — em vez de uma tela em branco. O time já
 * cadastrou "Captação Paga → Vendas → Debriefing"; obrigá-lo a redesenhar isso
 * à mão seria pedir o mesmo trabalho duas vezes.
 */

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnelMaps, funnels, funnelStages, projects, projectMembers } from "../db/schema.js";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const boxSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(40),
  label: z.string().max(120),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(2000),
  height: z.number().positive().max(2000),
  color: z.string().max(24),
  status: z.enum(["ativo", "construcao", "otimizar", "pausado"]),
  stageId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  url: z.string().max(2048).nullable().optional(),
  // Zod descarta chave fora do schema em silêncio: campo novo do bloco PRECISA
  // entrar aqui, senão o canvas grava e o dado some sem erro nenhum.
  /** Nota adesiva e bloco de texto guardam o conteúdo aqui, não no `label`. */
  texto: z.string().max(4000).nullable().optional(),
  /** Hierarquia do bloco de texto. */
  estilo: z.enum(["h1", "h2", "h3", "corpo"]).nullable().optional(),
  negrito: z.boolean().optional(),
  italico: z.boolean().optional(),
  /** Tamanho da fonte em px, quando a pessoa ajusta à mão. */
  fonte: z.number().min(8).max(96).nullable().optional(),
  /** Emoji do bloco genérico. */
  emoji: z.string().max(8).nullable().optional(),
});

const connectorSchema = z.object({
  id: z.string().min(1).max(64),
  fromBox: z.string().min(1).max(64),
  fromPoint: z.enum(["top", "right", "bottom", "left"]),
  toBox: z.string().min(1).max(64),
  toPoint: z.enum(["top", "right", "bottom", "left"]),
  type: z.enum(["solid", "dashed"]),
  label: z.string().max(80).nullable().optional(),
});

const tabsSchema = z.array(
  z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(60),
    boxes: z.array(boxSchema).max(300),
    connectors: z.array(connectorSchema).max(600),
  }),
).max(12);

/** Cor de cada etapa no rascunho — a mesma família da paleta do editor. */
const COR_POR_TIPO: Record<string, string> = {
  paid: "#6366f1",
  event_capture: "#6366f1",
  free: "#8b5cf6",
  cpl: "#ec4899",
  sales: "#10b981",
  comercial: "#ef4444",
  event: "#06b6d4",
  debriefing: "#64748b",
};

/** Tipo de bloco equivalente a cada tipo de etapa. */
const TIPO_POR_ETAPA: Record<string, string> = {
  paid: "meta_ads",
  event_capture: "meta_ads",
  free: "captura",
  cpl: "webinar",
  sales: "checkout",
  comercial: "sdr",
  event: "entrega",
  debriefing: "analytics",
};

export default fp(async function funnelMapRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  /** A etapa é deste funil, e o funil é deste projeto? */
  async function etapaDoProjeto(projectId: string, funnelId: string, stageId: string) {
    const [linha] = await fastify.db
      .select({ id: funnelStages.id, funnelProject: funnels.projectId })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(and(eq(funnelStages.id, stageId), eq(funnelStages.funnelId, funnelId)))
      .limit(1);
    return linha && linha.funnelProject === projectId ? linha : null;
  }

  /**
   * Rascunho a partir das etapas já cadastradas.
   *
   * Uma linha da esquerda para a direita, ligada em sequência — que é como o
   * funil de fato acontece. É ponto de partida, não resultado: a partir daí o
   * time arrasta, adiciona LP, order bump, e-mail e o que mais existir.
   */
  async function rascunhoDasEtapas(funnelId: string) {
    const etapas = (
      await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          stageType: funnelStages.stageType,
        })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId))
        .orderBy(asc(funnelStages.createdAt))
    )
      // A própria etapa de mapa não vira bloco: ela é o quadro, não uma peça
      // do funil.
      .filter((e) => e.stageType !== "mapa");

    const boxes = etapas.map((e, i) => ({
      id: `etapa-${e.id.slice(0, 8)}`,
      type: TIPO_POR_ETAPA[e.stageType] ?? "landing_page",
      label: e.name,
      // 280px de passo: 160 de bloco e 120 de respiro para a seta caber.
      x: 100 + i * 280,
      y: 160,
      width: 160,
      height: 80,
      color: COR_POR_TIPO[e.stageType] ?? "#8b5cf6",
      status: "ativo" as const,
      stageId: e.id,
    }));

    const connectors = boxes.slice(0, -1).map((b, i) => ({
      id: `c-${i + 1}`,
      fromBox: b.id,
      fromPoint: "right" as const,
      toBox: boxes[i + 1].id,
      toPoint: "left" as const,
      type: "solid" as const,
    }));

    return [{ id: "tab1", name: "Principal", boxes, connectors }];
  }

  /**
   * Todos os mapas visíveis, para a tela global.
   *
   * Lista as ETAPAS do tipo `mapa`, não os desenhos: etapa criada e ainda em
   * branco também precisa aparecer, senão a única forma de chegar até ela é
   * navegando projeto por projeto — que é justamente o que esta tela evita.
   *
   * Devolve uma prévia enxuta (retângulos e cores) em vez do documento
   * inteiro: a lista desenha miniaturas, e mandar rótulo, nota e conector de
   * cada mapa faria o payload crescer sem nada aparecer na miniatura.
   */
  fastify.get("/api/funnel-maps", async (request) => {
    const ehGuest = request.userRole === "guest";

    const linhas = await fastify.db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        projectColor: projects.color,
        funnelId: funnels.id,
        funnelName: funnels.name,
        funnelArchivedAt: funnels.archivedAt,
        stageId: funnelStages.id,
        stageName: funnelStages.name,
        tabs: funnelMaps.tabs,
        updatedAt: funnelMaps.updatedAt,
      })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .innerJoin(projects, eq(projects.id, funnels.projectId))
      .leftJoin(funnelMaps, eq(funnelMaps.stageId, funnelStages.id))
      .where(eq(funnelStages.stageType, "mapa"))
      .orderBy(asc(projects.name), asc(funnels.name), asc(funnelStages.sortOrder));

    // Guest só enxerga projeto onde é membro — mesma regra de /api/projects.
    let permitidos: Set<string> | null = null;
    if (ehGuest) {
      const membros = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, request.userId));
      permitidos = new Set(membros.map((m) => m.projectId));
    }

    const mapas = linhas
      .filter((l) => !permitidos || permitidos.has(l.projectId))
      .map((l) => {
        const abas = l.tabs ?? [];
        const primeira = abas[0];
        return {
          projectId: l.projectId,
          projectName: l.projectName,
          projectColor: l.projectColor,
          funnelId: l.funnelId,
          funnelName: l.funnelName,
          arquivado: l.funnelArchivedAt !== null,
          stageId: l.stageId,
          stageName: l.stageName,
          updatedAt: l.updatedAt?.toISOString() ?? null,
          abas: abas.length,
          blocos: abas.reduce((n, a) => n + (a.boxes?.length ?? 0), 0),
          conectores: abas.reduce((n, a) => n + (a.connectors?.length ?? 0), 0),
          previa: (primeira?.boxes ?? []).slice(0, 80).map((b) => ({
            x: b.x, y: b.y, width: b.width, height: b.height, color: b.color, type: b.type,
          })),
        };
      });

    return { mapas };
  });

  // ---- GET mapa ----
  fastify.get("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/map", async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const etapa = await etapaDoProjeto(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!etapa) return reply.code(404).send({ error: "Etapa não encontrada" });

    const [mapa] = await fastify.db
      .select()
      .from(funnelMaps)
      .where(eq(funnelMaps.stageId, params.data.stageId))
      .limit(1);

    if (mapa && (mapa.tabs ?? []).length > 0) {
      return { tabs: mapa.tabs, rascunho: false, updatedAt: mapa.updatedAt.toISOString() };
    }

    // `rascunho: true` diz à tela que isto ainda não foi salvo por ninguém — o
    // desenho é sugestão, e some se o time preferir começar do zero.
    return { tabs: await rascunhoDasEtapas(params.data.funnelId), rascunho: true, updatedAt: null };
  });

  // ---- PUT mapa ----
  fastify.put("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/map", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = z.object({ tabs: tabsSchema }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Mapa inválido", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
    const etapa = await etapaDoProjeto(params.data.projectId, params.data.funnelId, params.data.stageId);
    if (!etapa) return reply.code(404).send({ error: "Etapa não encontrada" });

    const agora = new Date();
    await fastify.db
      .insert(funnelMaps)
      .values({
        stageId: params.data.stageId,
        tabs: body.data.tabs,
        updatedBy: request.userId,
        updatedAt: agora,
      })
      .onConflictDoUpdate({
        target: funnelMaps.stageId,
        set: { tabs: body.data.tabs, updatedBy: request.userId, updatedAt: agora },
      });

    return { ok: true, updatedAt: agora.toISOString() };
  });

  /** Apaga o desenho — o mapa volta ao rascunho das etapas. */
  fastify.delete("/api/projects/:projectId/funnels/:funnelId/stages/:stageId/map", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db.delete(funnelMaps).where(eq(funnelMaps.stageId, params.data.stageId));
    return { ok: true };
  });
});
