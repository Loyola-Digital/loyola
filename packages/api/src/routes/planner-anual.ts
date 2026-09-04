/**
 * Calendário anual — esteiras e células.
 *
 * Arquivo próprio, e não mais rotas em `planner.ts`, porque a feature entra em
 * teste e pode sair: remover é apagar este arquivo, o serviço, o componente e
 * duas tabelas.
 *
 * ## Gravar célula é upsert
 *
 * O banco guarda só o que alguém preencheu. A tela manda a célula inteira ao
 * sair do campo, e aqui ela é criada ou atualizada pelo índice único
 * `(track_id, ano, mes)` — sem um `GET` antes para descobrir se já existia, que
 * é uma ida ao banco por tecla.
 *
 * Célula que ficou sem nada é APAGADA. Guardar quatro nulos deixaria a matriz
 * enchendo de linhas conforme o time limpa planos que não vão acontecer.
 */

import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  plannerAnnualCells,
  plannerAnnualGroups,
  plannerAnnualTracks,
} from "../db/schema.js";
import {
  CATEGORIAS,
  ESTEIRAS_INICIAIS,
  FUNIS,
  GRUPOS,
  celulaVazia,
  ehGrupo,
  gruposDoProjeto,
  limparCelula,
  limparCor,
  limparRotulo,
  montarMatriz,
} from "../services/planner-anual.js";

const ID = z.string().uuid();

/** Janela de anos aceita. Serve para barrar `ano=0` e `ano=99999`, não para planejar. */
const ANO = z.coerce.number().int().min(2020).max(2100);

const celulaSchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  frequencia: z.string().max(120).nullable().optional(),
  produto: z.string().max(160).nullable().optional(),
  categoria: z.string().max(20).nullable().optional(),
  funil: z.string().max(60).nullable().optional(),
});

export default fp(async function plannerAnualRoutes(fastify) {
  const base = "/api/planner/anual";

  function denyGuest(request: { userRole?: string }): boolean {
    return request.userRole === "guest";
  }

  /** O vocabulário dos dropdowns, para a tela não duplicar as listas. */
  fastify.get(`${base}/vocabulario`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    return { grupos: GRUPOS, categorias: CATEGORIAS, funis: FUNIS };
  });

  /**
   * A matriz de uma empresa num ano.
   *
   * Devolve as doze colunas por esteira, preenchidas ou não — ver
   * `montarMatriz`. Sem esteira nenhuma, devolve lista vazia e a tela oferece
   * criar as iniciais; criar sozinho na leitura faria um `GET` gravar.
   */
  fastify.get(`${base}/:projectId/:ano`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ projectId: ID, ano: ANO }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    // As duas em paralelo: a personalizacao da faixa nao depende das esteiras,
    // e a tela precisa dos rotulos ate quando nao ha linha nenhuma — sao eles
    // que nomeiam os botoes de criar esteira.
    const [esteiras, personalizacoes] = await Promise.all([
      fastify.db
        .select({
          id: plannerAnnualTracks.id,
          grupo: plannerAnnualTracks.grupo,
          nome: plannerAnnualTracks.nome,
          sortOrder: plannerAnnualTracks.sortOrder,
        })
        .from(plannerAnnualTracks)
        .where(eq(plannerAnnualTracks.projectId, p.data.projectId))
        .orderBy(asc(plannerAnnualTracks.sortOrder)),
      fastify.db
        .select({
          grupo: plannerAnnualGroups.grupo,
          rotulo: plannerAnnualGroups.rotulo,
          cor: plannerAnnualGroups.cor,
        })
        .from(plannerAnnualGroups)
        .where(eq(plannerAnnualGroups.projectId, p.data.projectId)),
    ]);

    const grupos = gruposDoProjeto(personalizacoes);

    if (esteiras.length === 0) return { esteiras: [], grupos };

    const celulas = await fastify.db
      .select({
        trackId: plannerAnnualCells.trackId,
        ano: plannerAnnualCells.ano,
        mes: plannerAnnualCells.mes,
        frequencia: plannerAnnualCells.frequencia,
        produto: plannerAnnualCells.produto,
        categoria: plannerAnnualCells.categoria,
        funil: plannerAnnualCells.funil,
      })
      .from(plannerAnnualCells)
      .where(
        and(
          inArray(
            plannerAnnualCells.trackId,
            esteiras.map((e) => e.id),
          ),
          eq(plannerAnnualCells.ano, p.data.ano),
        ),
      );

    return { esteiras: montarMatriz(esteiras, celulas), grupos };
  });

  /**
   * Renomeia e recolore a faixa de um grupo, por empresa.
   *
   * Upsert: a linha nasce na primeira vez que alguem mexe. Campo vazio grava
   * `null` e volta ao padrao do codigo — e e assim que a personalizacao se
   * desfaz, sem um botao "restaurar" a mais no painel.
   */
  fastify.put(`${base}/:projectId/grupos/:grupo`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z
      .object({ projectId: ID, grupo: z.string().refine(ehGrupo, "Grupo inválido") })
      .safeParse(request.params);
    const b = z
      .object({
        rotulo: z.string().max(60).nullable().optional(),
        cor: z.string().max(30).nullable().optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    // O que a tela nao mandou fica como estava; o que veio passa pela limpeza,
    // que e quem decide o que e ausencia (e volta ao padrao).
    const patch: { rotulo?: string | null; cor?: string | null } = {};
    if ("rotulo" in b.data) patch.rotulo = limparRotulo(b.data.rotulo);
    if ("cor" in b.data) patch.cor = limparCor(b.data.cor);

    await fastify.db
      .insert(plannerAnnualGroups)
      .values({
        projectId: p.data.projectId,
        grupo: p.data.grupo,
        rotulo: patch.rotulo ?? null,
        cor: patch.cor ?? null,
        updatedBy: request.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [plannerAnnualGroups.projectId, plannerAnnualGroups.grupo],
        set: { ...patch, updatedBy: request.userId ?? null, updatedAt: new Date() },
      });

    const personalizacoes = await fastify.db
      .select({
        grupo: plannerAnnualGroups.grupo,
        rotulo: plannerAnnualGroups.rotulo,
        cor: plannerAnnualGroups.cor,
      })
      .from(plannerAnnualGroups)
      .where(eq(plannerAnnualGroups.projectId, p.data.projectId));

    return { grupos: gruposDoProjeto(personalizacoes) };
  });

  /** Cria uma esteira. Sem `nome`, entra como linha em branco para nomear. */
  fastify.post(`${base}/:projectId/esteiras`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ projectId: ID }).safeParse(request.params);
    const b = z
      .object({
        grupo: z.string().refine(ehGrupo, "Grupo inválido"),
        nome: z.string().trim().max(120).optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    // Vai para o fim do grupo, não da lista: a esteira nova aparece junto das
    // suas irmãs, que é onde quem clicou está olhando.
    const [{ ultimo }] = await fastify.db
      .select({ ultimo: sql<number>`coalesce(max(${plannerAnnualTracks.sortOrder}), -1)::int` })
      .from(plannerAnnualTracks)
      .where(eq(plannerAnnualTracks.projectId, p.data.projectId));

    const [criada] = await fastify.db
      .insert(plannerAnnualTracks)
      .values({
        projectId: p.data.projectId,
        grupo: b.data.grupo,
        nome: b.data.nome ?? "",
        sortOrder: (ultimo ?? -1) + 1,
        createdBy: request.userId ?? null,
      })
      .returning();

    return reply.code(201).send(criada);
  });

  /**
   * As esteiras que a empresa ganha quando o calendário nasce vazio.
   *
   * Uma matriz sem linha nenhuma não ensina o que ela é. Estas seis vêm da
   * planilha que o time já usava — e são renomeáveis e removíveis, então
   * começar com elas custa menos que começar com nada.
   */
  fastify.post(`${base}/:projectId/esteiras/iniciais`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ projectId: ID }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [{ total }] = await fastify.db
      .select({ total: sql<number>`count(*)::int` })
      .from(plannerAnnualTracks)
      .where(eq(plannerAnnualTracks.projectId, p.data.projectId));
    // Chamar duas vezes não duplica: a segunda não faz nada.
    if ((total ?? 0) > 0) return reply.code(409).send({ error: "Já existem esteiras." });

    const criadas = await fastify.db
      .insert(plannerAnnualTracks)
      .values(
        ESTEIRAS_INICIAIS.map((e, i) => ({
          projectId: p.data.projectId,
          grupo: e.grupo,
          nome: e.nome,
          sortOrder: i,
          createdBy: request.userId ?? null,
        })),
      )
      .returning();

    return reply.code(201).send({ esteiras: criadas });
  });

  fastify.put(`${base}/esteiras/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: ID }).safeParse(request.params);
    const b = z
      .object({
        grupo: z.string().refine(ehGrupo, "Grupo inválido").optional(),
        nome: z.string().trim().max(120).optional(),
        sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [atualizada] = await fastify.db
      .update(plannerAnnualTracks)
      .set({ ...b.data, updatedAt: new Date() })
      .where(eq(plannerAnnualTracks.id, p.data.id))
      .returning();

    if (!atualizada) return reply.code(404).send({ error: "Esteira não encontrada" });
    return atualizada;
  });

  /** Apaga a esteira. As células vão junto por `ON DELETE CASCADE`. */
  fastify.delete(`${base}/esteiras/:id`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ id: ID }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const apagadas = await fastify.db
      .delete(plannerAnnualTracks)
      .where(eq(plannerAnnualTracks.id, p.data.id))
      .returning({ id: plannerAnnualTracks.id });

    if (apagadas.length === 0) return reply.code(404).send({ error: "Esteira não encontrada" });
    return { ok: true };
  });

  /** Grava uma célula. Cria, atualiza ou apaga, conforme o que sobrou nela. */
  fastify.put(`${base}/esteiras/:trackId/:ano`, async (request, reply) => {
    if (denyGuest(request)) return reply.code(403).send({ error: "Acesso negado" });
    const p = z.object({ trackId: ID, ano: ANO }).safeParse(request.params);
    const b = celulaSchema.safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Dados inválidos" });

    const valores = limparCelula(b.data);
    const alvo = and(
      eq(plannerAnnualCells.trackId, p.data.trackId),
      eq(plannerAnnualCells.ano, p.data.ano),
      eq(plannerAnnualCells.mes, b.data.mes),
    );

    if (celulaVazia(valores)) {
      await fastify.db.delete(plannerAnnualCells).where(alvo);
      return { ...valores, mes: b.data.mes };
    }

    await fastify.db
      .insert(plannerAnnualCells)
      .values({
        trackId: p.data.trackId,
        ano: p.data.ano,
        mes: b.data.mes,
        ...valores,
        updatedBy: request.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [plannerAnnualCells.trackId, plannerAnnualCells.ano, plannerAnnualCells.mes],
        set: { ...valores, updatedBy: request.userId ?? null, updatedAt: new Date() },
      });

    return { ...valores, mes: b.data.mes };
  });
});
