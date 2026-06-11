import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import { hotmartConnections, hotmartCache, projects, projectMembers } from "../db/schema.js";
import {
  encryptHotmartSecret,
  decryptHotmartSecret,
  getHotmartToken,
  listHotmartProducts,
  computeHotmartDashboard,
  monthsAgoMs,
  nowMs,
} from "../services/hotmart.js";

// ============================================================
// Story 34.3 — Rotas Hotmart (Assinaturas / recorrência).
// Connection CRUD (credenciais OAuth2 criptografadas por projeto) + products
// (derivados das assinaturas) + dashboard de métricas agregadas (cacheado LRU).
//
// SEGURANÇA: GET connection retorna só { connected }. NUNCA logar/serializar
// client_secret, o Basic (Authorization) nem PII do assinante.
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });

const connectionBodySchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const productsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

const dashboardQuerySchema = z.object({
  productId: z.string().min(1),
  months: z.coerce.number().int().min(1).max(36).default(12),
});

// L1: cache LRU em memória (mesma instância), TTL 30min. Armazena array de
// produtos ou objeto de dashboard (ambos objetos — non-nullish exigido pelo
// lru-cache v11). L2 é a tabela hotmart_cache no banco (sobrevive a restart).
const FRESH_TTL_MS = 30 * 60 * 1000;

const memCache = new LRUCache<string, object>({
  max: 500,
  ttl: FRESH_TTL_MS,
});

/** Chave do L1 (memória) — combina projeto + cacheKey lógica. */
function memKey(projectId: string, cacheKey: string): string {
  return `${projectId}:${cacheKey}`;
}

export default fp(async function hotmartRoutes(fastify) {
  // Acesso ao projeto (espelho de mautic.ts): guest sem vínculo -> null (404);
  // projeto inexistente -> null (404).
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

  async function getConnectionRow(projectId: string) {
    const [row] = await fastify.db
      .select()
      .from(hotmartConnections)
      .where(eq(hotmartConnections.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  /** Credenciais decifradas da conexão do projeto, ou null se não conectado/decifra falhar. */
  async function getCreds(projectId: string): Promise<{ clientId: string; clientSecret: string } | null> {
    const row = await getConnectionRow(projectId);
    if (!row) return null;
    try {
      const clientId = decryptHotmartSecret(row.clientIdEncrypted, row.clientIdIv);
      const clientSecret = decryptHotmartSecret(row.clientSecretEncrypted, row.clientSecretIv);
      return { clientId, clientSecret };
    } catch {
      return null;
    }
  }

  // ============================================================
  // Cache stale-while-revalidate (L1 memória + L2 banco)
  // ============================================================

  /** Lê a linha de cache do banco (L2), ou null. */
  async function readDbCache(projectId: string, cacheKey: string) {
    const [row] = await fastify.db
      .select()
      .from(hotmartCache)
      .where(and(eq(hotmartCache.projectId, projectId), eq(hotmartCache.cacheKey, cacheKey)))
      .limit(1);
    return row ?? null;
  }

  /** Upsert do payload agregado no banco (L2). */
  async function writeDbCache(projectId: string, cacheKey: string, data: object): Promise<void> {
    const now = new Date();
    await fastify.db
      .insert(hotmartCache)
      .values({ projectId, cacheKey, data, computedAt: now })
      .onConflictDoUpdate({
        target: [hotmartCache.projectId, hotmartCache.cacheKey],
        set: { data, computedAt: now },
      });
  }

  // Guarda contra stampede: chaves com refresh em background em andamento.
  const refreshing = new Set<string>();

  /** Recomputa em background e atualiza L1+L2. Erros são logados, não propagados. */
  function backgroundRefresh<T extends object>(
    projectId: string,
    cacheKey: string,
    compute: () => Promise<T>,
  ): void {
    const flightKey = memKey(projectId, cacheKey);
    if (refreshing.has(flightKey)) return;
    refreshing.add(flightKey);
    void (async () => {
      try {
        const fresh = await compute();
        memCache.set(flightKey, fresh);
        await writeDbCache(projectId, cacheKey, fresh);
      } catch (err) {
        fastify.log.error(err, "Hotmart background refresh falhou");
      } finally {
        refreshing.delete(flightKey);
      }
    })();
  }

  /**
   * Serve com stale-while-revalidate:
   *  - L1 (memória) fresco -> retorna na hora.
   *  - L2 (banco) fresco (< 30min) -> repopula L1 e retorna.
   *  - L2 stale -> retorna stale JÁ e revalida em background.
   *  - Sem cache (cold real) -> computa síncrono, persiste, retorna.
   */
  async function serveWithSwr<T extends object>(
    projectId: string,
    cacheKey: string,
    compute: () => Promise<T>,
  ): Promise<T> {
    const flightKey = memKey(projectId, cacheKey);

    const l1 = memCache.get(flightKey) as T | undefined;
    if (l1 !== undefined) return l1;

    const row = await readDbCache(projectId, cacheKey);
    if (row) {
      const data = row.data as T;
      memCache.set(flightKey, data);
      const ageMs = Date.now() - row.computedAt.getTime();
      if (ageMs >= FRESH_TTL_MS) backgroundRefresh(projectId, cacheKey, compute);
      return data;
    }

    // Cold real: primeira vez de todos os tempos pra essa chave.
    const fresh = await compute();
    memCache.set(flightKey, fresh);
    await writeDbCache(projectId, cacheKey, fresh);
    return fresh;
  }

  /** Limpa L1 (prefixo do projeto) + L2 (linhas do projeto). Usado ao trocar/remover conexão. */
  async function invalidateHotmartCache(projectId: string): Promise<void> {
    for (const key of memCache.keys()) {
      if (key.startsWith(`${projectId}:`)) memCache.delete(key);
    }
    await fastify.db.delete(hotmartCache).where(eq(hotmartCache.projectId, projectId));
  }

  // ---- GET connection (status, sem credenciais) ----
  fastify.get("/api/projects/:projectId/hotmart/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const row = await getConnectionRow(params.data.projectId);
    return { connected: Boolean(row) };
  });

  // ---- PUT connection (valida credenciais no token endpoint, criptografa e salva) ----
  fastify.put("/api/projects/:projectId/hotmart/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Valida credenciais batendo no token endpoint ANTES de persistir.
    try {
      await getHotmartToken(body.data.clientId, body.data.clientSecret);
    } catch (err) {
      request.log.error(err, "Hotmart connection validation failed");
      return reply.code(502).send({
        error: "Falha ao conectar na Hotmart. Verifique client_id/client_secret.",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const encId = encryptHotmartSecret(body.data.clientId);
    const encSecret = encryptHotmartSecret(body.data.clientSecret);
    const now = new Date();
    await fastify.db
      .insert(hotmartConnections)
      .values({
        projectId: params.data.projectId,
        clientIdEncrypted: encId.encrypted,
        clientIdIv: encId.iv,
        clientSecretEncrypted: encSecret.encrypted,
        clientSecretIv: encSecret.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: hotmartConnections.projectId,
        set: {
          clientIdEncrypted: encId.encrypted,
          clientIdIv: encId.iv,
          clientSecretEncrypted: encSecret.encrypted,
          clientSecretIv: encSecret.iv,
          updatedAt: now,
        },
      });

    await invalidateHotmartCache(params.data.projectId);
    return { connected: true };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/hotmart/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(hotmartConnections)
      .where(eq(hotmartConnections.projectId, params.data.projectId));
    await invalidateHotmartCache(params.data.projectId);
    return { connected: false };
  });

  // ---- GET products (derivados das assinaturas, cacheado LRU) ----
  fastify.get("/api/projects/:projectId/hotmart/products", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = productsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos", details: query.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await getCreds(params.data.projectId);
    if (!creds) return reply.code(409).send({ error: "Hotmart não conectado neste projeto" });

    const cacheKey = `products:${query.data.months}`;
    try {
      const products = await serveWithSwr(params.data.projectId, cacheKey, async () => {
        const token = await getHotmartToken(creds.clientId, creds.clientSecret);
        const accessionFrom = monthsAgoMs(query.data.months, nowMs());
        return listHotmartProducts(token, accessionFrom);
      });
      return { products };
    } catch (err) {
      request.log.error(err, "Erro ao listar produtos da Hotmart");
      return reply.code(502).send({
        error: "Erro ao listar produtos da Hotmart",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET dashboard (métricas agregadas, cacheado LRU) ----
  fastify.get("/api/projects/:projectId/hotmart/dashboard", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = dashboardQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos", details: query.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await getCreds(params.data.projectId);
    if (!creds) return reply.code(409).send({ error: "Hotmart não conectado neste projeto" });

    const cacheKey = `dashboard:${query.data.productId}:${query.data.months}`;
    try {
      const dashboard = await serveWithSwr(params.data.projectId, cacheKey, async () => {
        const token = await getHotmartToken(creds.clientId, creds.clientSecret);
        return computeHotmartDashboard(token, {
          productId: query.data.productId,
          months: query.data.months,
        });
      });
      return dashboard;
    } catch (err) {
      request.log.error(err, "Erro ao montar dashboard da Hotmart");
      return reply.code(502).send({
        error: "Erro ao montar dashboard da Hotmart",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
