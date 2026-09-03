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
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { Readable } from "node:stream";
import { funnelMaps, funnels, funnelStages, projects, projectMembers } from "../db/schema.js";
import { abaEmBranco, comAoMenosUmaAba } from "../services/funnel-map-abas.js";
import {
  MAX_UPLOAD_BYTES,
  isAllowedMime,
  isStorageConfigured,
  pareceplaceholder,
  uploadDireto,
} from "../services/object-storage.js";

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
  /** Emoji do bloco genérico — só nos criados antes da troca por ícone. */
  emoji: z.string().max(8).nullable().optional(),
  /** Nome do ícone lucide do bloco genérico. */
  icone: z.string().max(40).nullable().optional(),
  /** Bloco `imagem`: o arquivo no bucket. `imageKey` permite apagá-lo depois. */
  imageUrl: z.string().max(2048).nullable().optional(),
  imageKey: z.string().max(500).nullable().optional(),
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
          // `null` aqui é o que diz à tela que este mapa mora numa etapa e
          // deve ser aberto pelo caminho do funil, não pelo id.
          mapId: null as string | null,
          projectId: l.projectId as string | null,
          projectName: l.projectName as string | null,
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

    /**
     * Os mapas SEM etapa entram por uma segunda consulta.
     *
     * A de cima parte de `funnel_stages` — quem não tem etapa não aparece lá
     * de jeito nenhum. Unir com SQL exigiria um LEFT JOIN partindo de
     * `funnel_maps` e refazer o filtro de guest para linhas sem projeto; duas
     * consultas somadas dizem a mesma coisa e continuam legíveis.
     */
    const soltos = await fastify.db
      .select({
        id: funnelMaps.id,
        name: funnelMaps.name,
        projectId: funnelMaps.projectId,
        projectName: projects.name,
        projectColor: projects.color,
        tabs: funnelMaps.tabs,
        updatedAt: funnelMaps.updatedAt,
      })
      .from(funnelMaps)
      .leftJoin(projects, eq(projects.id, funnelMaps.projectId))
      .where(isNull(funnelMaps.stageId))
      .orderBy(asc(funnelMaps.name));

    const avulsos = soltos
      // Guest não vê mapa avulso: a regra de acesso é "membro do projeto", e o
      // mapa sem projeto não tem a quem perguntar. Com projeto, vale a regra.
      .filter((m) => !ehGuest && (!m.projectId || !permitidos || permitidos.has(m.projectId)))
      .map((m) => {
        const abas = m.tabs ?? [];
        const primeira = abas[0];
        return {
          mapId: m.id,
          projectId: m.projectId,
          projectName: m.projectName,
          projectColor: m.projectColor,
          funnelId: null as string | null,
          funnelName: null as string | null,
          arquivado: false,
          stageId: null as string | null,
          stageName: m.name ?? "Mapa sem nome",
          updatedAt: m.updatedAt?.toISOString() ?? null,
          abas: abas.length,
          blocos: abas.reduce((n, a) => n + (a.boxes?.length ?? 0), 0),
          conectores: abas.reduce((n, a) => n + (a.connectors?.length ?? 0), 0),
          previa: (primeira?.boxes ?? []).slice(0, 80).map((b) => ({
            x: b.x, y: b.y, width: b.width, height: b.height, color: b.color, type: b.type,
          })),
        };
      });

    // Avulsos primeiro: é onde está o rascunho recém-criado, e quem acabou de
    // criá-lo não deveria procurá-lo no fim de uma lista de trinta.
    return { mapas: [...avulsos, ...mapas] };
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

  // ============================================================
  // Mapa avulso — criado do Global, com ou sem funil
  // ============================================================
  //
  // As rotas acima endereçam o mapa pelo caminho projeto/funil/etapa. Um mapa
  // sem funil não tem esse caminho, então precisa ser endereçado pelo próprio
  // id. As duas formas convivem: o editor de dentro do funil não muda.

  /** Interno = não-guest. Mapa sem projeto não tem membro para conferir. */
  function ehInterno(request: { userRole?: string }): boolean {
    return request.userRole !== "guest";
  }

  fastify.post("/api/funnel-maps", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });
    const b = z
      .object({
        name: z.string().trim().min(1).max(160),
        projectId: z.string().uuid().nullable().optional(),
        funnelId: z.string().uuid().nullable().optional(),
      })
      .safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: "Dados inválidos" });

    /**
     * Com funil, o mapa nasce como ETAPA — igual aos que já existem.
     *
     * Criar um mapa solto e "pendurá-lo" no funil por um campo faria dois
     * caminhos para a mesma coisa: um mapa que aparece na lista de etapas e
     * outro que não, ambos dizendo pertencer ao mesmo lançamento.
     */
    if (b.data.funnelId) {
      const [funil] = await fastify.db
        .select({ id: funnels.id, projectId: funnels.projectId })
        .from(funnels)
        .where(eq(funnels.id, b.data.funnelId))
        .limit(1);
      if (!funil) return reply.code(404).send({ error: "Funil não encontrado" });

      const [{ ultimo }] = await fastify.db
        .select({ ultimo: sql<number>`coalesce(max(${funnelStages.sortOrder}), -1)::int` })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funil.id));

      const [etapa] = await fastify.db
        .insert(funnelStages)
        .values({
          funnelId: funil.id,
          name: b.data.name,
          stageType: "mapa",
          sortOrder: (ultimo ?? -1) + 1,
        })
        .returning({ id: funnelStages.id });

      const [mapa] = await fastify.db
        .insert(funnelMaps)
        .values({ stageId: etapa!.id, tabs: [], updatedBy: request.userId ?? null })
        .returning();
      // Com funil, `tabs: []` é seguro: a rota do funil monta o rascunho das
      // etapas quando o desenho está vazio, e ele sempre traz uma aba.

      return reply.code(201).send({
        ...mapa,
        projectId: funil.projectId,
        funnelId: funil.id,
        stageId: etapa!.id,
      });
    }

    const [mapa] = await fastify.db
      .insert(funnelMaps)
      .values({
        stageId: null,
        name: b.data.name,
        projectId: b.data.projectId ?? null,
        // Nasce COM uma aba. Sem funil não há etapas de onde montar um
        // rascunho, e um mapa de zero abas não abre — o canvas exige
        // `abas[abaAtiva]` para sair do carregamento.
        tabs: [abaEmBranco()],
        updatedBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(mapa);
  });

  /** Um mapa avulso pelo id. Os que têm etapa seguem pelas rotas de funil. */
  fastify.get("/api/funnel-maps/:id", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [mapa] = await fastify.db
      .select()
      .from(funnelMaps)
      .where(eq(funnelMaps.id, p.data.id))
      .limit(1);
    if (!mapa) return reply.code(404).send({ error: "Mapa não encontrado" });

    /**
     * Mesmo contrato da rota do funil: `{ tabs, rascunho, updatedAt }`.
     *
     * Devolver o registro do banco cru foi o defeito: faltava `rascunho`,
     * `updatedAt` vinha como `Date` em vez de texto, e — o que travava a tela
     * — `tabs` podia ser uma lista VAZIA. O canvas monta a partir de
     * `abas[abaAtiva]` e fica no esqueleto de carregamento enquanto essa aba
     * não existe, sem erro nenhum para investigar.
     */
    return {
      tabs: comAoMenosUmaAba(mapa.tabs),
      rascunho: (mapa.tabs ?? []).length === 0,
      updatedAt: mapa.updatedAt?.toISOString() ?? null,
    };
  });

  fastify.put("/api/funnel-maps/:id", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        projectId: z.string().uuid().nullable().optional(),
        tabs: tabsSchema.optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [atualizado] = await fastify.db
      .update(funnelMaps)
      .set({ ...b.data, updatedBy: request.userId ?? null, updatedAt: new Date() })
      .where(eq(funnelMaps.id, p.data.id))
      .returning();

    if (!atualizado) return reply.code(404).send({ error: "Mapa não encontrado" });
    return atualizado;
  });

  /**
   * Liga um mapa avulso a um funil.
   *
   * Cria a etapa `mapa` no funil e aponta o desenho para ela — a partir daí o
   * mapa aparece na lista de etapas como qualquer outro, e o `name` próprio
   * deixa de ser usado.
   */
  fastify.put("/api/funnel-maps/:id/vincular", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const b = z.object({ funnelId: z.string().uuid() }).safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [mapa] = await fastify.db
      .select()
      .from(funnelMaps)
      .where(eq(funnelMaps.id, p.data.id))
      .limit(1);
    if (!mapa) return reply.code(404).send({ error: "Mapa não encontrado" });
    if (mapa.stageId) return reply.code(409).send({ error: "Este mapa já está num funil." });

    const [funil] = await fastify.db
      .select({ id: funnels.id, projectId: funnels.projectId })
      .from(funnels)
      .where(eq(funnels.id, b.data.funnelId))
      .limit(1);
    if (!funil) return reply.code(404).send({ error: "Funil não encontrado" });

    const [{ ultimo }] = await fastify.db
      .select({ ultimo: sql<number>`coalesce(max(${funnelStages.sortOrder}), -1)::int` })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, funil.id));

    const [etapa] = await fastify.db
      .insert(funnelStages)
      .values({
        funnelId: funil.id,
        name: mapa.name ?? "Mapa",
        stageType: "mapa",
        sortOrder: (ultimo ?? -1) + 1,
      })
      .returning({ id: funnelStages.id });

    const [ligado] = await fastify.db
      .update(funnelMaps)
      .set({
        stageId: etapa!.id,
        projectId: funil.projectId,
        updatedBy: request.userId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(funnelMaps.id, p.data.id))
      .returning();

    return { ...ligado, funnelId: funil.id };
  });

  fastify.delete("/api/funnel-maps/:id", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const apagados = await fastify.db
      .delete(funnelMaps)
      .where(and(eq(funnelMaps.id, p.data.id), isNull(funnelMaps.stageId)))
      .returning({ id: funnelMaps.id });

    // Mapa COM etapa sai pela rota do funil: apagá-lo aqui deixaria a etapa
    // órfã na lista, apontando para um desenho que não existe mais.
    if (apagados.length === 0) {
      return reply.code(404).send({ error: "Mapa avulso não encontrado" });
    }
    return { ok: true };
  });

  /**
   * Sobe uma imagem para dentro do mapa.
   *
   * ## NÃO passa pelo Swipe Files
   *
   * Mesmo bucket, prefixo `mapa/`, e nenhuma linha em `swipe_files` — a
   * biblioteca lista da tabela, nunca do bucket, então um print de página
   * colado num mapa não aparece no acervo de referências do time. Também não
   * dispara o aviso no ClickUp.
   */
  fastify.post("/api/funnel-maps/imagem", async (request, reply) => {
    if (!ehInterno(request)) return reply.code(403).send({ error: "Acesso negado" });

    const cfg = {
      endpoint: fastify.config.STORAGE_ENDPOINT,
      accessKeyId: fastify.config.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: fastify.config.STORAGE_SECRET_ACCESS_KEY,
      bucket: fastify.config.STORAGE_BUCKET,
      publicUrl: fastify.config.STORAGE_PUBLIC_URL,
      region: fastify.config.STORAGE_REGION,
      forcePathStyle: fastify.config.STORAGE_FORCE_PATH_STYLE === "true",
    };
    if (!isStorageConfigured(cfg) || pareceplaceholder(cfg.publicUrl)) {
      return reply.code(503).send({ error: "Storage não configurado no servidor." });
    }

    const arquivo = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!arquivo) return reply.code(400).send({ error: "Envie a imagem." });
    /**
     * Imagem ou PDF — os dois tipos que o mapa desenha.
     *
     * Vídeo fica de fora: um bloco que toca vídeo dentro de um quadro que se
     * arrasta e amplia é uma tela dentro de outra, e o mapa deixa de ser um
     * mapa. Quem precisa disso põe o link.
     */
    const ehImagem = arquivo.mimetype.startsWith("image/");
    const ehPdf = arquivo.mimetype === "application/pdf";
    if ((!ehImagem && !ehPdf) || !isAllowedMime(arquivo.mimetype)) {
      return reply.code(400).send({ error: `Tipo não permitido: ${arquivo.mimetype}` });
    }

    try {
      const buffer = await arquivo.toBuffer();
      if (buffer.length === 0) return reply.code(400).send({ error: "Arquivo vazio." });

      const r = await uploadDireto(cfg, {
        corpo: Readable.from(buffer),
        mime: arquivo.mimetype,
        prefix: "mapa",
      });
      return { url: r.publicUrl, key: r.key, bytes: buffer.length, mime: arquivo.mimetype };
    } catch (err) {
      fastify.log.error({ err }, "upload de imagem do mapa falhou");
      return reply.code(502).send({ error: "Não consegui subir a imagem." });
    }
  });
});
