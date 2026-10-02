/**
 * A conexão com o Tally e a leitura dos formulários.
 *
 * O ponto da feature: o modelo de Lead Scoring deixa de ser transcrito à mão
 * num fluxo do n8n e passa a nascer do formulário de verdade. Ver
 * `services/tally.ts` para o contrato da API e `tally-para-scoring.ts` para a
 * conversão.
 *
 * O token nunca volta para a tela — as rotas dizem se existe conexão e quando
 * foi salva, nunca o valor.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { projectMembers, projects, tallyConnections } from "../db/schema.js";
import { decrypt, encrypt } from "../services/encryption.js";
import { TallyError, listarFormularios, perguntasDoFormulario } from "../services/tally.js";
import { rascunhoDeScoring } from "../services/tally-para-scoring.js";

const projetoParam = z.object({ projectId: z.string().uuid() });
const formParam = projetoParam.extend({ formId: z.string().min(1).max(100) });

export default fp(async function tallyRoutes(fastify) {
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

  /** O token em claro, ou `null` quando o projeto não conectou. */
  async function tokenDe(projectId: string): Promise<string | null> {
    const [linha] = await fastify.db
      .select({ enc: tallyConnections.tokenEncrypted, iv: tallyConnections.tokenIv })
      .from(tallyConnections)
      .where(eq(tallyConnections.projectId, projectId))
      .limit(1);
    return linha ? decrypt(linha.enc, linha.iv) : null;
  }

  function erro(
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    e: unknown,
  ) {
    // Falha do Tally vira 502: não é o usuário do Loyola X que está sem sessão,
    // é a integração — confundir os dois manda a pessoa relogar à toa.
    if (e instanceof TallyError) return reply.code(502).send({ error: e.message });
    fastify.log.error({ erro: e }, "falha na integração com o Tally");
    return reply.code(500).send({ error: "Não consegui falar com o Tally." });
  }

  // ---- Estado da conexão ---------------------------------------------------

  fastify.get("/api/projects/:projectId/tally/connection", async (request, reply) => {
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const [linha] = await fastify.db
      .select({ em: tallyConnections.updatedAt })
      .from(tallyConnections)
      .where(eq(tallyConnections.projectId, p.data.projectId))
      .limit(1);
    return { conectado: Boolean(linha), salvoEm: linha?.em?.toISOString() ?? null };
  });

  const corpoDaChave = z.object({ token: z.string().trim().min(10).max(500) });

  /**
   * Salva a chave — e só depois de PROVAR que ela funciona.
   *
   * Guardar uma chave inválida deixaria a tela dizendo "conectado" e a lista de
   * formulários vazia, que é o pior dos dois mundos: parece configurado e não
   * está.
   */
  fastify.put("/api/projects/:projectId/tally/connection", async (request, reply) => {
    const p = projetoParam.safeParse(request.params);
    const corpo = corpoDaChave.safeParse(request.body);
    if (!p.success || !corpo.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (request.userRole !== "admin") return reply.code(403).send({ error: "Só admin conecta o Tally" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }

    let formularios;
    try {
      formularios = await listarFormularios(corpo.data.token, 1);
    } catch (e) {
      return erro(reply, e);
    }

    const { encrypted, iv } = encrypt(corpo.data.token);
    const agora = new Date();
    await fastify.db
      .insert(tallyConnections)
      .values({
        projectId: p.data.projectId,
        tokenEncrypted: encrypted,
        tokenIv: iv,
        createdBy: request.userId,
        updatedAt: agora,
      })
      .onConflictDoUpdate({
        target: tallyConnections.projectId,
        set: { tokenEncrypted: encrypted, tokenIv: iv, updatedAt: agora },
      });

    return { conectado: true, formularios: formularios.length };
  });

  fastify.delete("/api/projects/:projectId/tally/connection", async (request, reply) => {
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (request.userRole !== "admin") return reply.code(403).send({ error: "Só admin desconecta o Tally" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    await fastify.db.delete(tallyConnections).where(eq(tallyConnections.projectId, p.data.projectId));
    return { conectado: false };
  });

  // ---- Formulários ---------------------------------------------------------

  fastify.get("/api/projects/:projectId/tally/forms", async (request, reply) => {
    const p = projetoParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const token = await tokenDe(p.data.projectId);
    if (!token) return reply.code(409).send({ error: "Tally não conectado", code: "NOT_CONNECTED" });
    try {
      return { forms: await listarFormularios(token) };
    } catch (e) {
      return erro(reply, e);
    }
  });

  /**
   * As perguntas do formulário E o rascunho do modelo de scoring.
   *
   * Os dois juntos porque é uma coisa só do ponto de vista de quem usa: abrir o
   * formulário serve para montar o modelo. Quem quiser só olhar as perguntas lê
   * `perguntas`; quem vai montar, cola o `rascunho`.
   */
  fastify.get("/api/projects/:projectId/tally/forms/:formId/questions", async (request, reply) => {
    const p = formParam.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    if (!(await temAcesso(p.data.projectId, request.userId!, request.userRole!))) {
      return reply.code(404).send({ error: "Projeto não encontrado" });
    }
    const token = await tokenDe(p.data.projectId);
    if (!token) return reply.code(409).send({ error: "Tally não conectado", code: "NOT_CONNECTED" });

    try {
      const perguntas = await perguntasDoFormulario(token, p.data.formId);
      const [projeto] = await fastify.db
        .select({ nome: projects.name })
        .from(projects)
        .where(eq(projects.id, p.data.projectId))
        .limit(1);
      return {
        perguntas,
        rascunho: rascunhoDeScoring(perguntas, { projeto: projeto?.nome }),
      };
    } catch (e) {
      return erro(reply, e);
    }
  });
});
