/**
 * PDI — Plano de Desenvolvimento Individual.
 *
 * Admin atribui um documento HTML a uma pessoa; a pessoa vê só o dela. O HTML é
 * guardado inteiro e devolvido cru — quem renderiza é um iframe sandbox no
 * front, sem acesso à sessão. Não sanitizamos aqui de propósito: o documento
 * desenha o próprio card via <script>, então tirar o script deixaria a tela em
 * branco. O isolamento é responsabilidade do iframe, não da limpeza do HTML.
 *
 * Quem escreve é admin; quem lê é o dono. Um copywriter não consegue listar nem
 * abrir o PDI de outra pessoa por nenhuma das rotas.
 */

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { pdiDocuments, users } from "../db/schema.js";

/** Tamanho máximo do documento. O exemplo real tem ~17KB; 2MB cobre com folga. */
const MAX_HTML_BYTES = 2 * 1024 * 1024;

const criarSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(2).max(255),
  html: z
    .string()
    .min(20, "HTML vazio")
    .refine((h) => Buffer.byteLength(h, "utf8") <= MAX_HTML_BYTES, "Documento maior que 2MB"),
});

export default fp(async function pdiRoutes(fastify) {
  function ehAdmin(role: string | undefined): boolean {
    return role === "admin";
  }

  /**
   * O PDI da própria pessoa — o mais recente. É o que decide se o app abre no
   * PDI ou segue pro fluxo normal, então responde `null` (200) em vez de 404:
   * "ainda não tem PDI" é estado esperado, não erro.
   */
  fastify.get("/api/pdi/me", async (request) => {
    const [doc] = await fastify.db
      .select({
        id: pdiDocuments.id,
        title: pdiDocuments.title,
        html: pdiDocuments.html,
        createdAt: pdiDocuments.createdAt,
      })
      .from(pdiDocuments)
      .where(eq(pdiDocuments.userId, request.userId))
      .orderBy(desc(pdiDocuments.createdAt))
      .limit(1);

    if (!doc) return { pdi: null };
    return {
      pdi: {
        id: doc.id,
        title: doc.title,
        html: doc.html,
        createdAt: doc.createdAt.toISOString(),
      },
    };
  });

  /**
   * Só diz SE existe PDI, sem trazer o HTML. É o que o app consulta no boot pra
   * decidir a rota inicial — carregar 17KB de documento só pra decidir um
   * redirect seria desperdício em toda abertura.
   */
  fastify.get("/api/pdi/me/exists", async (request) => {
    const [doc] = await fastify.db
      .select({ id: pdiDocuments.id })
      .from(pdiDocuments)
      .where(eq(pdiDocuments.userId, request.userId))
      .limit(1);
    return { exists: !!doc };
  });

  // ---------- Administração ----------

  /** Lista todos os PDIs (com o dono). Admin only. */
  fastify.get("/api/pdi", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });

    const rows = await fastify.db
      .select({
        id: pdiDocuments.id,
        userId: pdiDocuments.userId,
        title: pdiDocuments.title,
        createdAt: pdiDocuments.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(pdiDocuments)
      .innerJoin(users, eq(users.id, pdiDocuments.userId))
      .orderBy(desc(pdiDocuments.createdAt));

    return {
      documentos: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
        userName: r.userName,
        userEmail: r.userEmail,
      })),
    };
  });

  /** Pessoas que podem receber PDI (não-guests ativos). Admin only. */
  fastify.get("/api/pdi/assignable-users", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });

    const rows = await fastify.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      // `listed` é o controle explícito de quem aparece em seletor de pessoa,
      // ajustável em Settings → Usuários. Substituiu o filtro por e-mail
      // placeholder: a heurística acertava as contas fantasma, mas não cobria
      // conta de teste com e-mail real nem dava ao admin como corrigir sozinho.
      .where(and(eq(users.status, "active"), eq(users.listed, true)))
      .orderBy(users.name);

    // Guest não navega fora de /projects — PDI não faria sentido pra ele.
    return { usuarios: rows.filter((u) => u.role !== "guest") };
  });

  /** HTML completo de um PDI específico. Admin only (o dono usa /api/pdi/me). */
  fastify.get("/api/pdi/:id", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const [doc] = await fastify.db
      .select()
      .from(pdiDocuments)
      .where(eq(pdiDocuments.id, params.data.id))
      .limit(1);
    if (!doc) return reply.code(404).send({ error: "PDI não encontrado" });

    return {
      pdi: {
        id: doc.id,
        userId: doc.userId,
        title: doc.title,
        html: doc.html,
        createdAt: doc.createdAt.toISOString(),
      },
    };
  });

  /** Atribui um PDI. Cada chamada cria uma versão nova — não sobrescreve. */
  fastify.post("/api/pdi", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });

    const body = criarSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }

    const [dono] = await fastify.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, body.data.userId))
      .limit(1);
    if (!dono) return reply.code(404).send({ error: "Usuário não encontrado" });
    if (dono.role === "guest") {
      return reply.code(400).send({ error: "Convidados não têm PDI" });
    }

    const [criado] = await fastify.db
      .insert(pdiDocuments)
      .values({
        userId: body.data.userId,
        title: body.data.title,
        html: body.data.html,
        createdBy: request.userId,
      })
      .returning({ id: pdiDocuments.id, createdAt: pdiDocuments.createdAt });

    return reply.code(201).send({
      pdi: { id: criado.id, createdAt: criado.createdAt.toISOString() },
    });
  });

  /** Remove uma versão do PDI. Admin only. */
  fastify.delete("/api/pdi/:id", async (request, reply) => {
    if (!ehAdmin(request.userRole)) return reply.code(403).send({ error: "Acesso negado" });
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

    const apagados = await fastify.db
      .delete(pdiDocuments)
      .where(eq(pdiDocuments.id, params.data.id))
      .returning({ id: pdiDocuments.id });
    if (apagados.length === 0) return reply.code(404).send({ error: "PDI não encontrado" });

    return reply.code(204).send();
  });
});
