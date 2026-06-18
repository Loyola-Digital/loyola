import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import { apiKeys } from "../db/schema.js";
import { generateApiKey } from "../services/api-key.js";

/**
 * Gestão de API Keys (Story 36.1) — admin only.
 *
 * Estas rotas passam pelo pipeline Clerk normal (humano logado). O *consumo*
 * das chaves por máquina (header X-API-Key) é a Story 36.2, em rotas separadas.
 */

const idParamSchema = z.object({ id: z.string().uuid() });

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  scopes: z.array(z.string()).min(1).optional(),
});

// Gestão de chaves é mais restrita que o gate de admin.ts (admin OU manager):
// uma API key é credencial de máquina de longa duração — só admin emite/revoga.
function requireAdmin(role: string | undefined): boolean {
  return role === "admin";
}

export default fp(async function apiKeysRoutes(fastify) {
  // ---- POST /api/api-keys ---- gera uma nova chave (retorna o texto puro UMA vez)
  fastify.post("/api/api-keys", async (request, reply) => {
    if (!requireAdmin(request.userRole)) {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parsed = createKeySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Dados inválidos",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { raw, keyPrefix, keyHash } = generateApiKey();
    const scopes = parsed.data.scopes ?? ["meta:read"];

    const [created] = await fastify.db
      .insert(apiKeys)
      .values({
        name: parsed.data.name,
        keyPrefix,
        keyHash,
        scopes,
        createdBy: request.userId,
      })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        createdAt: apiKeys.createdAt,
      });

    // `key` em texto puro só aqui — nunca mais é recuperável.
    return reply.code(201).send({ ...created, key: raw });
  });

  // ---- GET /api/api-keys ---- lista chaves (mascarado, nunca retorna hash/raw)
  fastify.get("/api/api-keys", async (request, reply) => {
    if (!requireAdmin(request.userRole)) {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const rows = await fastify.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      scopes: r.scopes,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
      revoked: r.revokedAt !== null,
    }));
  });

  // ---- DELETE /api/api-keys/:id ---- revoga (soft — mantém histórico)
  fastify.delete("/api/api-keys/:id", async (request, reply) => {
    if (!requireAdmin(request.userRole)) {
      return reply.code(403).send({ error: "Acesso negado" });
    }

    const parsed = idParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "ID inválido" });
    }

    const [revoked] = await fastify.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, parsed.data.id))
      .returning({ id: apiKeys.id, revokedAt: apiKeys.revokedAt });

    if (!revoked) {
      return reply.code(404).send({ error: "Chave não encontrada" });
    }

    return { id: revoked.id, revoked: true };
  });
});
