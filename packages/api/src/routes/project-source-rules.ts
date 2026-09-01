/**
 * Match de origem — no escopo do PROJETO.
 *
 * ## Por que saiu da etapa
 *
 * As regras nasceram presas a uma etapa, e isso estava errado por dois motivos
 * que só apareceram em uso:
 *
 * 1. **As linhas nunca foram da etapa.** A leitura sempre foi por funil — a
 *    mesma planilha de aplicações servia todas as etapas dele. Regras por etapa
 *    sobre linhas por funil significava classificar a mesma linha várias vezes,
 *    e poder classificá-la diferente em cada lugar.
 * 2. **`instagram` é `instagram` em qualquer lugar.** A captação e a venda leem
 *    a mesma pessoa; se a captação dissesse orgânico e a venda pago, o funil não
 *    fecharia — e ninguém saberia qual dos dois números estava certo.
 *
 * Agora a regra é do projeto e vale em toda leitura de aplicação: tabela, BI e
 * captação. Ver `services/source-rules-store.ts`.
 *
 * ## Os três endpoints
 *
 *   diagnostico   quantas aplicações não têm origem, e quanto disso já é regra
 *   orfas         como as que sobraram se distribuem por um campo qualquer
 *   regras        CRUD do que recupera
 *
 * A separação existe porque as duas primeiras leem planilha (caro) e a terceira
 * não (barato). Juntas num endpoint só, editar uma regra custaria uma releitura
 * a cada clique.
 */

import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import fp from "fastify-plugin";
import { funnels, projectMembers, projects, projectSourceRules } from "../db/schema.js";
import {
  agruparOrfaos,
  agruparParaClassificar,
  diagnosticar,
  origemPorRegra,
  type RegraDeOrigem,
  type LinhaDeAplicacao,
} from "../services/source-rules.js";
import {
  CAMPO_DA_ORIGEM,
  invalidarRegras,
  regrasDoProjeto,
} from "../services/source-rules-store.js";

const paramsSchema = z.object({ projectId: z.string().uuid() });
const paramsComRegraSchema = paramsSchema.extend({ regraId: z.string().uuid() });

const regraSchema = z.object({
  campo: z.string().trim().min(1).max(120),
  operador: z.enum(["igual", "contem", "comeca_com", "vazio"]),
  valor: z.string().max(500).default(""),
  origem: z.string().trim().min(1).max(120),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativa: z.boolean().optional(),
});

/** Um funil pode ser pedido para estreitar o diagnóstico; sem ele, é o projeto. */
const escopoSchema = z.object({ funnelId: z.string().uuid().optional() });

/** Quanto tempo as linhas lidas das planilhas valem. Leitura é a parte cara. */
const VALIDADE_DAS_LINHAS_MS = 60_000;
const cacheDeLinhas = new Map<string, { em: number; linhas: LinhaDeAplicacao[]; colunas: string[] }>();

export default fp(async function projectSourceRulesRoutes(fastify) {
  /** Guest não entra: classificar origem muda número em todo o produto. */
  async function temAcesso(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") return false;
    const [projeto] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!projeto) return false;
    if (userRole === "admin") return true;
    const [membro] = await fastify.db
      .select({ id: projectMembers.id })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .limit(1);
    return Boolean(membro);
  }

  /**
   * As linhas cruas das planilhas de aplicação — do projeto ou de um funil.
   *
   * Cru de propósito: a regra pode observar QUALQUER coluna, então reduzir a
   * linha aos campos que a tela de aplicações usa tiraria justamente os campos
   * que servem para recuperar a origem.
   *
   * O nome do funil entra em cada linha (`__funil`) para a tela poder dizer de
   * onde veio o grupo — num projeto com seis funis, "247 sem origem" sem dizer
   * onde não ajuda ninguém a agir.
   */
  async function linhasDoEscopo(
    projectId: string,
    funnelId?: string,
  ): Promise<{ linhas: LinhaDeAplicacao[]; colunas: string[]; semPlanilha: boolean }> {
    const chave = `${projectId}:${funnelId ?? "*"}`;
    const guardado = cacheDeLinhas.get(chave);
    if (guardado && Date.now() - guardado.em < VALIDADE_DAS_LINHAS_MS) {
      return { ...guardado, semPlanilha: guardado.linhas.length === 0 };
    }

    const { carregarLinhasBrutas } = await import("../services/application-sheets.js");

    const alvos = funnelId
      ? await fastify.db
          .select({ id: funnels.id, nome: funnels.name })
          .from(funnels)
          .where(and(eq(funnels.id, funnelId), eq(funnels.projectId, projectId)))
      : await fastify.db
          .select({ id: funnels.id, nome: funnels.name })
          .from(funnels)
          .where(eq(funnels.projectId, projectId));

    const linhas: LinhaDeAplicacao[] = [];
    const colunas = new Set<string>();
    let algumaPlanilha = false;

    for (const funil of alvos) {
      const bruto = await carregarLinhasBrutas(fastify, funil.id);
      if (bruto.semPlanilha) continue;
      algumaPlanilha = true;
      for (const l of bruto.linhas) linhas.push({ ...l, __funil: funil.nome });
      for (const c of bruto.colunas) colunas.add(c);
    }

    const resultado = { linhas, colunas: [...colunas] };
    cacheDeLinhas.set(chave, { em: Date.now(), ...resultado });
    return { ...resultado, semPlanilha: !algumaPlanilha };
  }

  // ---- Diagnóstico ----
  fastify.get("/api/projects/:projectId/source-match/diagnostico", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const q = escopoSchema.safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [{ linhas, colunas, semPlanilha }, regras] = await Promise.all([
      linhasDoEscopo(p.data.projectId, q.data.funnelId),
      regrasDoProjeto(fastify.db as never, p.data.projectId),
    ]);
    if (semPlanilha) {
      return { semPlanilha: true, diagnostico: null, colunas: [], aClassificar: [], regras };
    }

    return {
      semPlanilha: false,
      diagnostico: diagnosticar(linhas, CAMPO_DA_ORIGEM, regras),
      // As origens que existem e não dizem se são pagas ou orgânicas. Nesta base
      // é o grupo GRANDE — bem maior que o das sem origem.
      aClassificar: agruparParaClassificar(linhas, CAMPO_DA_ORIGEM, regras),
      // Colunas com algum conteúdo — as vazias não servem para analisar nada e
      // só alongam o seletor.
      colunas: colunas.filter((c) => c !== CAMPO_DA_ORIGEM && c !== "__funil"),
      regras,
    };
  });

  // ---- Órfãs agrupadas por um campo ----
  fastify.get("/api/projects/:projectId/source-match/orfas", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    const q = escopoSchema
      .extend({ campo: z.string().trim().min(1).max(120) })
      .safeParse(request.query);
    if (!p.success || !q.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [{ linhas, semPlanilha }, regras] = await Promise.all([
      linhasDoEscopo(p.data.projectId, q.data.funnelId),
      regrasDoProjeto(fastify.db as never, p.data.projectId),
    ]);
    if (semPlanilha) return { grupos: [] };

    return { grupos: agruparOrfaos(linhas, CAMPO_DA_ORIGEM, q.data.campo, regras) };
  });

  // ---- Regras ----
  fastify.get("/api/projects/:projectId/source-match/regras", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    return { regras: await regrasDoProjeto(fastify.db as never, p.data.projectId) };
  });

  fastify.post("/api/projects/:projectId/source-match/regras", async (request, reply) => {
    const p = paramsSchema.safeParse(request.params);
    // Aceita uma ou várias: a tela cria um grupo inteiro de uma vez, e mandar N
    // requests deixaria a atribuição pela metade se uma falhasse.
    const body = z.union([regraSchema, z.array(regraSchema).max(200)]).safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const novas = (Array.isArray(body.data) ? body.data : [body.data]).map((r) => ({
      projectId: p.data.projectId,
      campo: r.campo,
      operador: r.operador,
      valor: r.operador === "vazio" ? "" : r.valor,
      origem: r.origem,
      ordem: r.ordem ?? 0,
      ativa: r.ativa ?? true,
      createdBy: request.userId ?? null,
    }));

    const criadas = await fastify.db.insert(projectSourceRules).values(novas).returning();
    invalidarRegras(p.data.projectId);
    return reply.code(201).send({ regras: criadas });
  });

  fastify.put("/api/projects/:projectId/source-match/regras/:regraId", async (request, reply) => {
    const p = paramsComRegraSchema.safeParse(request.params);
    const body = regraSchema.partial().safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const [atualizada] = await fastify.db
      .update(projectSourceRules)
      .set({ ...body.data, updatedAt: new Date() })
      .where(
        and(
          eq(projectSourceRules.id, p.data.regraId),
          eq(projectSourceRules.projectId, p.data.projectId),
        ),
      )
      .returning();

    if (!atualizada) return reply.code(404).send({ error: "Regra não encontrada" });
    invalidarRegras(p.data.projectId);
    return atualizada;
  });

  fastify.delete("/api/projects/:projectId/source-match/regras/:regraId", async (request, reply) => {
    const p = paramsComRegraSchema.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    const apagadas = await fastify.db
      .delete(projectSourceRules)
      .where(
        and(
          eq(projectSourceRules.id, p.data.regraId),
          eq(projectSourceRules.projectId, p.data.projectId),
        ),
      )
      .returning({ id: projectSourceRules.id });

    if (apagadas.length === 0) return reply.code(404).send({ error: "Regra não encontrada" });
    invalidarRegras(p.data.projectId);
    return { ok: true };
  });

  // ============================================================
  // Regras GLOBAIS — valem para todos os projetos
  // ============================================================
  //
  // Vivem em Settings, não dentro de uma etapa. O caso que motivou é o link
  // mal montado que entrega `{whatsapp}` — a macro com as chaves literais,
  // sem substituição. Isso não é problema de um projeto nem de uma etapa: é
  // do formato do link, e acontece igual em qualquer campanha.
  //
  // Cadastrar a mesma correção projeto a projeto seria trabalho repetido e
  // fatalmente desatualizado num deles.

  const base = "/api/source-match/regras-globais";

  /** Regra global é configuração de time: só admin mexe. */
  function soAdmin(request: { userRole?: string }): boolean {
    return request.userRole !== "admin";
  }

  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const regras = await fastify.db
      .select()
      .from(projectSourceRules)
      .where(isNull(projectSourceRules.projectId))
      .orderBy(asc(projectSourceRules.ordem), asc(projectSourceRules.createdAt));
    return { regras };
  });

  fastify.post(base, async (request, reply) => {
    if (soAdmin(request)) return reply.code(403).send({ error: "Só admin edita regra global" });
    const body = z.union([regraSchema, z.array(regraSchema).max(200)]).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const novas = (Array.isArray(body.data) ? body.data : [body.data]).map((r) => ({
      projectId: null,
      campo: r.campo,
      operador: r.operador,
      valor: r.operador === "vazio" ? "" : r.valor,
      origem: r.origem,
      ordem: r.ordem ?? 0,
      ativa: r.ativa ?? true,
      createdBy: request.userId ?? null,
    }));

    const criadas = await fastify.db.insert(projectSourceRules).values(novas).returning();
    // Regra global toca TODOS os projetos: limpar só um deixaria os outros
    // servindo a classificação antiga por um minuto — tempo suficiente para
    // alguém conferir e achar que não funcionou.
    invalidarRegras();
    return reply.code(201).send({ regras: criadas });
  });

  fastify.put(`${base}/:regraId`, async (request, reply) => {
    if (soAdmin(request)) return reply.code(403).send({ error: "Só admin edita regra global" });
    const p = z.object({ regraId: z.string().uuid() }).safeParse(request.params);
    const body = regraSchema.partial().safeParse(request.body);
    if (!p.success || !body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const [atualizada] = await fastify.db
      .update(projectSourceRules)
      .set({ ...body.data, updatedAt: new Date() })
      .where(
        and(eq(projectSourceRules.id, p.data.regraId), isNull(projectSourceRules.projectId)),
      )
      .returning();

    if (!atualizada) return reply.code(404).send({ error: "Regra não encontrada" });
    invalidarRegras();
    return atualizada;
  });

  fastify.delete(`${base}/:regraId`, async (request, reply) => {
    if (soAdmin(request)) return reply.code(403).send({ error: "Só admin edita regra global" });
    const p = z.object({ regraId: z.string().uuid() }).safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const apagadas = await fastify.db
      .delete(projectSourceRules)
      .where(and(eq(projectSourceRules.id, p.data.regraId), isNull(projectSourceRules.projectId)))
      .returning({ id: projectSourceRules.id });

    if (apagadas.length === 0) return reply.code(404).send({ error: "Regra não encontrada" });
    invalidarRegras();
    return { ok: true };
  });

  /**
   * Testa as regras contra um valor, sem gravar nada.
   *
   * A tela global não tem etapa, então não dá para mostrar "46 leads sem
   * origem" como a aba antiga fazia. O que substitui isso é poder colar
   * `{whatsapp}` e ver no que ele vira — a mesma pergunta, respondida sem
   * depender de um recorte que ali não existe.
   */
  fastify.post(`${base}/testar`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const body = z
      .object({ campo: z.string().trim().min(1).max(120), valor: z.string().max(500) })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    const regras = (await fastify.db
      .select()
      .from(projectSourceRules)
      .where(isNull(projectSourceRules.projectId))
      .orderBy(
        asc(projectSourceRules.ordem),
        asc(projectSourceRules.createdAt),
      )) as unknown as RegraDeOrigem[];

    const atribuida = origemPorRegra(regras, { [body.data.campo]: body.data.valor });
    return {
      // `null` quando nada casou: dizer "sem origem" seria afirmar um
      // resultado, e o que houve foi ausência de regra que se aplicasse.
      origem: atribuida?.origem ?? null,
      regraId: atribuida?.regraId ?? null,
      casou: atribuida !== null,
    };
  });

});
