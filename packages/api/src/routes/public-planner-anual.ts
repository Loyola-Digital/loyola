/**
 * A esteira anual do Planner pela API pública (X-API-Key).
 *
 * Feita para um Claude preencher a visão "Anual (esteiras)" sem navegador —
 * spec da Ágatha (Projetos e Processos), set/2026. Grava nas MESMAS tabelas
 * que a tela usa: o que entra por aqui aparece na tela no próximo reload, e o
 * que a tela edita aparece aqui.
 *
 * Contrato completo, com exemplos: `docs/llms.txt` → "Planner".
 *
 * ## O desenho
 *
 * - Ler antes de escrever: `GET /:projectId/:ano` devolve faixas → esteiras →
 *   células preenchidas, com o vocabulário junto.
 * - Escrever em LOTE e PARCIAL: `PUT /:projectId/:ano/celulas`. Campo omitido
 *   não muda; `null` limpa. A esteira vem por id ou por faixa + nome.
 * - `dryRun: true` devolve o diff sem gravar — o Claude mostra à Ágatha o que
 *   vai mudar antes de aplicar. O diff e a gravação saem do mesmo plano
 *   (`planejarLote`), então o que ela aprovou é o que vai ao banco.
 * - Toda escrita fica em `planner_api_audit`, com a chave e o diff.
 */

import fp from "fastify-plugin";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  plannerAnnualCells,
  plannerAnnualGroups,
  plannerAnnualTracks,
  projects,
} from "../db/schema.js";
import { requireScope } from "../middleware/api-key-auth.js";
import {
  CATEGORIAS,
  FUNIS,
  celulaPublica,
  celulaVazia,
  chaveDeTexto,
  diffDaCelula,
  gruposDoProjeto,
  planejarLote,
  resolverFaixa,
  type CelulaDoAnual,
  type PlanoDoLote,
} from "../services/planner-anual.js";
import { registrarNoPlanner } from "../services/planner-auditoria.js";

const LER = requireScope("planner:read", "planner:write");
const ESCREVER = requireScope("planner:write");

const ID = z.string().uuid();
const ANO = z.coerce.number().int().min(2020).max(2100);
const MES = z.coerce.number().int().min(1).max(12);
const texto = (max: number) => z.string().max(max).nullable().optional();

const itemSchema = z.object({
  esteira: z.object({
    id: ID.optional(),
    faixa: z.string().max(60).optional(),
    nome: z.string().max(120).optional(),
    criarSeNaoExistir: z.boolean().optional(),
  }),
  mes: MES,
  nota: texto(120),
  produto: texto(160),
  categoria: texto(40),
  funil: texto(60),
});

const loteSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  celulas: z.array(itemSchema).min(1).max(200),
});

const limparSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  esteiraId: ID,
  meses: z.array(MES).min(1).max(12),
});

export default fp(async function publicPlannerAnualRoutes(fastify) {
  const base = "/api/public/v1/planner/anual";

  async function projetoExiste(projectId: string): Promise<boolean> {
    const [p] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return Boolean(p);
  }

  /** Esteiras, faixas e as células do ano — o estado que o lote compara. */
  async function lerEstado(projectId: string, ano: number) {
    const [esteiras, personalizacoes] = await Promise.all([
      fastify.db
        .select({
          id: plannerAnnualTracks.id,
          grupo: plannerAnnualTracks.grupo,
          nome: plannerAnnualTracks.nome,
          sortOrder: plannerAnnualTracks.sortOrder,
        })
        .from(plannerAnnualTracks)
        .where(eq(plannerAnnualTracks.projectId, projectId))
        .orderBy(asc(plannerAnnualTracks.sortOrder)),
      fastify.db
        .select({
          grupo: plannerAnnualGroups.grupo,
          rotulo: plannerAnnualGroups.rotulo,
          cor: plannerAnnualGroups.cor,
        })
        .from(plannerAnnualGroups)
        .where(eq(plannerAnnualGroups.projectId, projectId)),
    ]);
    const grupos = gruposDoProjeto(personalizacoes);
    const linhas = esteiras.length
      ? await fastify.db
          .select()
          .from(plannerAnnualCells)
          .where(
            and(
              inArray(
                plannerAnnualCells.trackId,
                esteiras.map((e) => e.id),
              ),
              eq(plannerAnnualCells.ano, ano),
            ),
          )
      : [];
    const celulas = new Map<string, CelulaDoAnual>(
      linhas.map((c) => [
        `${c.trackId}:${c.mes}`,
        { frequencia: c.frequencia, produto: c.produto, categoria: c.categoria, funil: c.funil },
      ]),
    );
    const atualizadoEm = linhas.reduce<Date | null>(
      (max, c) => (!max || c.updatedAt > max ? c.updatedAt : max),
      null,
    );
    return { esteiras, grupos, celulas, linhas, atualizadoEm };
  }

  const apiKeyId = (request: { apiKey?: { id: string } }) => request.apiKey?.id ?? null;

  // ---- Vocabulário ----
  fastify.get(`${base}/vocabulario`, { preHandler: LER }, async () => ({
    faixas: ["organico", "trafego", "ascensao"],
    categorias: CATEGORIAS,
    funis: FUNIS,
  }));

  // ---- Leitura do ano ----
  fastify.get(`${base}/:projectId/:ano`, { preHandler: LER }, async (request, reply) => {
    const p = z.object({ projectId: ID, ano: ANO }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "projectId (uuid) e ano (2020–2100) inválidos" });
    if (!(await projetoExiste(p.data.projectId))) {
      return reply.code(404).send({ error: "Empresa (projectId) não encontrada" });
    }
    const { esteiras, grupos, linhas, atualizadoEm } = await lerEstado(p.data.projectId, p.data.ano);

    return {
      projectId: p.data.projectId,
      ano: p.data.ano,
      atualizadoEm,
      faixas: grupos.map((g) => ({
        faixa: g.id,
        rotulo: g.rotulo,
        cor: g.cor,
        esteiras: esteiras
          .filter((e) => e.grupo === g.id)
          .map((e) => ({
            id: e.id,
            nome: e.nome,
            posicao: e.sortOrder,
            // Só os meses preenchidos: doze células vazias por linha seriam
            // ruído no contexto do modelo. Mês ausente = célula vazia.
            celulas: linhas
              .filter((c) => c.trackId === e.id)
              .sort((a, b) => a.mes - b.mes)
              .map((c) => ({
                mes: c.mes,
                ...celulaPublica(c),
                atualizadoEm: c.updatedAt,
              })),
          })),
      })),
      vocabulario: { categorias: CATEGORIAS, funis: FUNIS },
    };
  });

  // ---- Criar esteira ----
  fastify.post(`${base}/:projectId/esteiras`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ projectId: ID }).safeParse(request.params);
    const b = z
      .object({ faixa: z.string().min(1).max(60), nome: z.string().trim().min(1).max(120) })
      .safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({ error: "Envie { faixa, nome }. faixa: organico | trafego | ascensao (ou o rótulo da tela)." });
    }
    if (!(await projetoExiste(p.data.projectId))) {
      return reply.code(404).send({ error: "Empresa (projectId) não encontrada" });
    }
    const { esteiras, grupos } = await lerEstado(p.data.projectId, new Date().getFullYear());
    const faixa = resolverFaixa(b.data.faixa, grupos);
    if (!faixa) {
      return reply.code(400).send({
        error: `faixa "${b.data.faixa}" não existe. Opções: ${grupos.map((g) => `${g.id} ("${g.rotulo}")`).join(", ")}.`,
      });
    }
    const igual = esteiras.find(
      (e) => e.grupo === faixa && chaveDeTexto(e.nome) === chaveDeTexto(b.data.nome),
    );
    // Criar duas vezes não duplica: o modelo pode repetir a chamada.
    if (igual) {
      return reply.code(409).send({ error: "Essa esteira já existe nesta faixa.", esteira: { id: igual.id, faixa, nome: igual.nome } });
    }

    const [{ ultimo }] = await fastify.db
      .select({ ultimo: sql<number>`coalesce(max(${plannerAnnualTracks.sortOrder}), -1)::int` })
      .from(plannerAnnualTracks)
      .where(eq(plannerAnnualTracks.projectId, p.data.projectId));
    const [criada] = await fastify.db
      .insert(plannerAnnualTracks)
      .values({ projectId: p.data.projectId, grupo: faixa, nome: b.data.nome, sortOrder: (ultimo ?? -1) + 1 })
      .returning();

    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: apiKeyId(request),
      acao: "esteira.criar",
      projectId: p.data.projectId,
      detalhe: { esteiraId: criada!.id, faixa, nome: b.data.nome },
    });
    return reply.code(201).send({ id: criada!.id, faixa, nome: criada!.nome, posicao: criada!.sortOrder });
  });

  // ---- Editar esteira ----
  fastify.patch(`${base}/:projectId/esteiras/:esteiraId`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ projectId: ID, esteiraId: ID }).safeParse(request.params);
    const b = z
      .object({
        nome: z.string().trim().min(1).max(120).optional(),
        faixa: z.string().max(60).optional(),
        posicao: z.coerce.number().int().min(0).max(9999).optional(),
      })
      .safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Envie { nome?, faixa?, posicao? }." });

    const { esteiras, grupos } = await lerEstado(p.data.projectId, new Date().getFullYear());
    const atual = esteiras.find((e) => e.id === p.data.esteiraId);
    if (!atual) return reply.code(404).send({ error: "Esteira não encontrada nesta empresa" });

    const mudanca: { nome?: string; grupo?: string; sortOrder?: number; updatedAt: Date } = { updatedAt: new Date() };
    if (b.data.nome !== undefined) mudanca.nome = b.data.nome;
    if (b.data.posicao !== undefined) mudanca.sortOrder = b.data.posicao;
    if (b.data.faixa !== undefined) {
      const f = resolverFaixa(b.data.faixa, grupos);
      if (!f) return reply.code(400).send({ error: `faixa "${b.data.faixa}" não existe.` });
      mudanca.grupo = f;
    }
    const [salva] = await fastify.db
      .update(plannerAnnualTracks)
      .set(mudanca)
      .where(eq(plannerAnnualTracks.id, atual.id))
      .returning();

    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: apiKeyId(request),
      acao: "esteira.editar",
      projectId: p.data.projectId,
      detalhe: { esteiraId: atual.id, antes: { nome: atual.nome, faixa: atual.grupo, posicao: atual.sortOrder }, depois: b.data },
    });
    return { id: salva!.id, faixa: salva!.grupo, nome: salva!.nome, posicao: salva!.sortOrder };
  });

  /** O plano em formato de resposta — igual no dryRun e na gravação. */
  function resposta(plano: PlanoDoLote, idsNovos: Map<string, string>) {
    const celulas = plano.mudancas.map((m) => {
      const diff = diffDaCelula(m.antes, m.depois);
      return {
        esteiraId: m.esteiraId ?? idsNovos.get(`${m.faixa}|${chaveDeTexto(m.esteira)}`) ?? null,
        faixa: m.faixa,
        esteira: m.esteira,
        mes: m.mes,
        mudou: Object.keys(diff).length > 0,
        antes: celulaPublica(m.antes),
        depois: celulaPublica(m.depois),
        diff,
      };
    });
    return {
      esteirasCriadas: plano.novas.map((n) => ({
        id: idsNovos.get(`${n.faixa}|${chaveDeTexto(n.nome)}`) ?? null,
        faixa: n.faixa,
        nome: n.nome,
      })),
      celulas,
      resumo: {
        alteradas: celulas.filter((c) => c.mudou).length,
        semMudanca: celulas.filter((c) => !c.mudou).length,
        esteirasCriadas: plano.novas.length,
      },
    };
  }

  // ---- Upsert em lote ----
  fastify.put(`${base}/:projectId/:ano/celulas`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ projectId: ID, ano: ANO }).safeParse(request.params);
    const b = loteSchema.safeParse(request.body);
    if (!p.success) return reply.code(400).send({ error: "projectId (uuid) e ano (2020–2100) inválidos" });
    if (!b.success) {
      return reply.code(400).send({
        error: "Corpo inválido. Esperado { dryRun?, celulas: [{ esteira: { id } | { faixa, nome, criarSeNaoExistir? }, mes: 1–12, nota?, produto?, categoria?, funil? }] } (até 200 células).",
        detalhes: b.error.flatten(),
      });
    }
    if (!(await projetoExiste(p.data.projectId))) {
      return reply.code(404).send({ error: "Empresa (projectId) não encontrada" });
    }

    const { esteiras, grupos, celulas } = await lerEstado(p.data.projectId, p.data.ano);
    const plano = planejarLote(b.data.celulas, esteiras, grupos, celulas);
    // Tudo ou nada: gravar metade de um lote deixaria a tela num estado que
    // ninguém pediu, e o modelo não saberia qual metade entrou.
    if (plano.erros.length) {
      return reply.code(400).send({ error: "Nada foi gravado: há itens inválidos.", erros: plano.erros });
    }

    if (b.data.dryRun) {
      return { dryRun: true, projectId: p.data.projectId, ano: p.data.ano, ...resposta(plano, new Map()) };
    }

    const idsNovos = new Map<string, string>();
    await fastify.db.transaction(async (tx) => {
      if (plano.novas.length) {
        const [{ ultimo }] = await tx
          .select({ ultimo: sql<number>`coalesce(max(${plannerAnnualTracks.sortOrder}), -1)::int` })
          .from(plannerAnnualTracks)
          .where(eq(plannerAnnualTracks.projectId, p.data.projectId));
        const criadas = await tx
          .insert(plannerAnnualTracks)
          .values(
            plano.novas.map((n, i) => ({
              projectId: p.data.projectId,
              grupo: n.faixa,
              nome: n.nome,
              sortOrder: (ultimo ?? -1) + 1 + i,
            })),
          )
          .returning();
        criadas.forEach((c, i) => {
          const n = plano.novas[i]!;
          idsNovos.set(`${n.faixa}|${chaveDeTexto(n.nome)}`, c.id);
        });
      }

      for (const m of plano.mudancas) {
        if (Object.keys(diffDaCelula(m.antes, m.depois)).length === 0) continue;
        const trackId = m.esteiraId ?? idsNovos.get(`${m.faixa}|${chaveDeTexto(m.esteira)}`)!;
        const alvo = and(
          eq(plannerAnnualCells.trackId, trackId),
          eq(plannerAnnualCells.ano, p.data.ano),
          eq(plannerAnnualCells.mes, m.mes),
        );
        // Célula que ficou vazia é APAGADA, como na tela: vazia e inexistente
        // são a mesma coisa lá.
        if (celulaVazia(m.depois)) {
          await tx.delete(plannerAnnualCells).where(alvo);
          continue;
        }
        await tx
          .insert(plannerAnnualCells)
          .values({ trackId, ano: p.data.ano, mes: m.mes, ...m.depois })
          .onConflictDoUpdate({
            target: [plannerAnnualCells.trackId, plannerAnnualCells.ano, plannerAnnualCells.mes],
            set: { ...m.depois, updatedBy: null, updatedAt: new Date() },
          });
      }
    });

    const saida = resposta(plano, idsNovos);
    await registrarNoPlanner(fastify.db, request.log, {
      apiKeyId: apiKeyId(request),
      acao: "celulas.gravar",
      projectId: p.data.projectId,
      detalhe: {
        ano: p.data.ano,
        esteirasCriadas: saida.esteirasCriadas,
        celulas: saida.celulas.filter((c) => c.mudou).map(({ esteiraId, mes, diff }) => ({ esteiraId, mes, diff })),
      },
    });
    const { atualizadoEm } = await lerEstado(p.data.projectId, p.data.ano);
    return { dryRun: false, projectId: p.data.projectId, ano: p.data.ano, atualizadoEm, ...saida };
  });

  // ---- Limpar meses ----
  fastify.delete(`${base}/:projectId/:ano/celulas`, { preHandler: ESCREVER }, async (request, reply) => {
    const p = z.object({ projectId: ID, ano: ANO }).safeParse(request.params);
    const b = limparSchema.safeParse(request.body);
    if (!p.success || !b.success) {
      return reply.code(400).send({ error: "Envie { esteiraId, meses: [1–12], dryRun? }." });
    }
    const { esteiras, celulas } = await lerEstado(p.data.projectId, p.data.ano);
    const esteira = esteiras.find((e) => e.id === b.data.esteiraId);
    if (!esteira) return reply.code(404).send({ error: "Esteira não encontrada nesta empresa" });

    const meses = [...new Set(b.data.meses)].sort((x, y) => x - y);
    const limpas = meses
      .map((mes) => ({ mes, antes: celulas.get(`${esteira.id}:${mes}`) }))
      .filter((c): c is { mes: number; antes: CelulaDoAnual } => Boolean(c.antes))
      .map((c) => ({ mes: c.mes, antes: celulaPublica(c.antes) }));

    if (!b.data.dryRun && limpas.length) {
      await fastify.db
        .delete(plannerAnnualCells)
        .where(
          and(
            eq(plannerAnnualCells.trackId, esteira.id),
            eq(plannerAnnualCells.ano, p.data.ano),
            inArray(
              plannerAnnualCells.mes,
              limpas.map((c) => c.mes),
            ),
          ),
        );
      await registrarNoPlanner(fastify.db, request.log, {
        apiKeyId: apiKeyId(request),
        acao: "celulas.limpar",
        projectId: p.data.projectId,
        detalhe: { ano: p.data.ano, esteiraId: esteira.id, limpas },
      });
    }
    return {
      dryRun: b.data.dryRun,
      esteira: { id: esteira.id, faixa: esteira.grupo, nome: esteira.nome },
      ano: p.data.ano,
      limpas,
      jaVazias: meses.filter((m) => !limpas.some((c) => c.mes === m)),
    };
  });
});
