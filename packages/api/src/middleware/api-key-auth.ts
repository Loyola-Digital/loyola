import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { apiKeys } from "../db/schema.js";
import { hashApiKey, safeCompareHash } from "../services/api-key.js";

/**
 * Autenticação por API Key (Story 36.2) para a API pública read-only (`/api/public/*`).
 *
 * Roda como onRequest hook DEPOIS do authPlugin (que ignora /api/public/*) e do
 * dbPlugin. Valida o header X-API-Key contra `api_keys` (lookup por hash +
 * comparação constant-time), bloqueia chaves revogadas, exige GET (read-only),
 * aplica rate limit por chave e popula `request.apiKey = { id, scopes }`.
 */

const PUBLIC_PREFIX = "/api/public/";

// Exceções ao read-only: rotas públicas de ESCRITA (ingestão via API key com
// scope próprio). O guard genérico bloqueia todo POST/PUT/DELETE em /api/public/*;
// estas rotas são liberadas p/ escrita e protegidas pelo requireScope da própria
// rota. Compara só o pathname (ignora querystring).
const PUBLIC_WRITE_ALLOWLIST = new Set(["/api/public/v1/reports"]);

function isPublicWriteAllowed(url: string): boolean {
  const pathname = url.split("?")[0];
  return PUBLIC_WRITE_ALLOWLIST.has(pathname);
}

// Rate limit por chave — janela fixa in-memory.
// LIMITAÇÃO: não funciona com múltiplas instâncias (cada uma tem seu contador).
// Documentado na Story 36.2; migrar p/ store compartilhado se houver multi-instância.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(keyId: string, reply: FastifyReply): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(keyId);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(keyId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_PER_WINDOW) {
    reply.header("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
    return false;
  }
  return true;
}

/**
 * preHandler de scope para rotas públicas (usado pela Story 36.3).
 * Ex.: `{ preHandler: requireScope("meta:read") }` na definição da rota.
 */
export function requireScope(scope: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKey || !request.apiKey.scopes.includes(scope)) {
      return reply
        .code(403)
        .send({ error: "Escopo insuficiente", code: "SCOPE_REQUIRED", required: scope });
    }
  };
}

export default fp(async function apiKeyAuthPlugin(fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    if (!request.url.startsWith(PUBLIC_PREFIX)) return; // só rotas públicas

    // API read-only — qualquer método de escrita é recusado, EXCETO rotas na
    // allowlist de escrita (protegidas por scope próprio via requireScope).
    if (request.method !== "GET" && request.method !== "HEAD" && !isPublicWriteAllowed(request.url)) {
      return reply.code(405).send({ error: "Método não permitido (API read-only)" });
    }

    const rawHeader = request.headers["x-api-key"];
    const provided = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!provided) {
      return reply.code(401).send({ error: "API key ausente", code: "API_KEY_MISSING" });
    }

    const incomingHash = hashApiKey(provided);
    const [record] = await fastify.db
      .select({
        id: apiKeys.id,
        keyHash: apiKeys.keyHash,
        scopes: apiKeys.scopes,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, incomingHash))
      .limit(1);

    // Constant-time defense-in-depth (o lookup já é por hash).
    if (!record || !safeCompareHash(incomingHash, record.keyHash)) {
      return reply.code(401).send({ error: "API key inválida", code: "API_KEY_INVALID" });
    }
    if (record.revokedAt !== null) {
      return reply.code(403).send({ error: "API key revogada", code: "API_KEY_REVOKED" });
    }

    if (!checkRateLimit(record.id, reply)) {
      return reply.code(429).send({ error: "Rate limit excedido", code: "RATE_LIMITED" });
    }

    request.apiKey = { id: record.id, scopes: record.scopes };

    // lastUsedAt: fire-and-forget — não bloqueia a resposta.
    void fastify.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, record.id))
      .catch(() => {});
  });
});
