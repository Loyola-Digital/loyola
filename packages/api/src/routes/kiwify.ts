import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import { kiwifyConnections, kiwifyCache, projects, projectMembers } from "../db/schema.js";
import {
  encryptKiwifySecret,
  decryptKiwifySecret,
  getKiwifyToken,
  kiwifyGet,
  listKiwifyProducts,
  computeKiwifyDashboard,
} from "../services/kiwify.js";

// ============================================================
// Story 35.3 — Rotas Kiwify (Assinaturas / recorrência).
// Connection CRUD (credenciais OAuth2 + account_id criptografados por projeto) +
// products (derivados das assinaturas recurring) + dashboard de métricas
// agregadas (cacheado SWR L1+L2). Espelha routes/hotmart.ts (34.3).
//
// SEGURANÇA: GET connection retorna só { connected }. NUNCA logar/serializar
// client_secret, o token Bearer, o account_id nem PII do assinante.
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });

const connectionBodySchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  accountId: z.string().min(1),
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
// lru-cache v11). L2 é a tabela kiwify_cache no banco (sobrevive a restart).
const FRESH_TTL_MS = 30 * 60 * 1000;

const memCache = new LRUCache<string, object>({
  max: 500,
  ttl: FRESH_TTL_MS,
});

/** Chave do L1 (memória) — combina projeto + cacheKey lógica. */
function memKey(projectId: string, cacheKey: string): string {
  return `${projectId}:${cacheKey}`;
}

export default fp(async function kiwifyRoutes(fastify) {
  // Acesso ao projeto (espelho de hotmart.ts): guest sem vínculo -> null (404);
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
      .from(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, projectId))
      .limit(1);
    return row ?? null;
  }

  /** Credenciais decifradas da conexão do projeto, ou null se não conectado/decifra falhar. */
  async function getCreds(
    projectId: string,
  ): Promise<{ clientId: string; clientSecret: string; accountId: string } | null> {
    const row = await getConnectionRow(projectId);
    if (!row) return null;
    try {
      const clientId = decryptKiwifySecret(row.clientIdEncrypted, row.clientIdIv);
      const clientSecret = decryptKiwifySecret(row.clientSecretEncrypted, row.clientSecretIv);
      const accountId = decryptKiwifySecret(row.accountIdEncrypted, row.accountIdIv);
      return { clientId, clientSecret, accountId };
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
      .from(kiwifyCache)
      .where(and(eq(kiwifyCache.projectId, projectId), eq(kiwifyCache.cacheKey, cacheKey)))
      .limit(1);
    return row ?? null;
  }

  /** Upsert do payload agregado no banco (L2). */
  async function writeDbCache(projectId: string, cacheKey: string, data: object): Promise<void> {
    const now = new Date();
    await fastify.db
      .insert(kiwifyCache)
      .values({ projectId, cacheKey, data, computedAt: now })
      .onConflictDoUpdate({
        target: [kiwifyCache.projectId, kiwifyCache.cacheKey],
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
        fastify.log.error(err, "Kiwify background refresh falhou");
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
  async function invalidateKiwifyCache(projectId: string): Promise<void> {
    for (const key of memCache.keys()) {
      if (key.startsWith(`${projectId}:`)) memCache.delete(key);
    }
    await fastify.db.delete(kiwifyCache).where(eq(kiwifyCache.projectId, projectId));
  }

  // ---- GET connection (status, sem credenciais) ----
  fastify.get("/api/projects/:projectId/kiwify/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const row = await getConnectionRow(params.data.projectId);
    return { connected: Boolean(row) };
  });

  // ---- PUT connection (valida token + chamada autenticada, criptografa e salva) ----
  fastify.put("/api/projects/:projectId/kiwify/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    // Valida credenciais ANTES de persistir: token endpoint + 1 chamada
    // autenticada (/products?page_size=1) para confirmar que o account_id casa.
    try {
      const token = await getKiwifyToken(body.data.clientId, body.data.clientSecret);
      await kiwifyGet(token, body.data.accountId, "/products", { page_size: 1 });
    } catch (err) {
      request.log.error(err, "Kiwify connection validation failed");
      return reply.code(502).send({
        error: "Falha ao conectar na Kiwify. Verifique client_id/client_secret/account_id.",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    const encId = encryptKiwifySecret(body.data.clientId);
    const encSecret = encryptKiwifySecret(body.data.clientSecret);
    const encAccount = encryptKiwifySecret(body.data.accountId);
    const now = new Date();
    await fastify.db
      .insert(kiwifyConnections)
      .values({
        projectId: params.data.projectId,
        clientIdEncrypted: encId.encrypted,
        clientIdIv: encId.iv,
        clientSecretEncrypted: encSecret.encrypted,
        clientSecretIv: encSecret.iv,
        accountIdEncrypted: encAccount.encrypted,
        accountIdIv: encAccount.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: kiwifyConnections.projectId,
        set: {
          clientIdEncrypted: encId.encrypted,
          clientIdIv: encId.iv,
          clientSecretEncrypted: encSecret.encrypted,
          clientSecretIv: encSecret.iv,
          accountIdEncrypted: encAccount.encrypted,
          accountIdIv: encAccount.iv,
          updatedAt: now,
        },
      });

    await invalidateKiwifyCache(params.data.projectId);
    return { connected: true };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/kiwify/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, params.data.projectId));
    await invalidateKiwifyCache(params.data.projectId);
    return { connected: false };
  });

  // ---- GET products (derivados das assinaturas recurring, cacheado SWR) ----
  fastify.get("/api/projects/:projectId/kiwify/products", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = productsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos", details: query.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await getCreds(params.data.projectId);
    if (!creds) return reply.code(409).send({ error: "Kiwify não conectado neste projeto" });

    const cacheKey = `products:${query.data.months}`;
    try {
      const products = await serveWithSwr(params.data.projectId, cacheKey, async () => {
        const token = await getKiwifyToken(creds.clientId, creds.clientSecret);
        return listKiwifyProducts(token, creds.accountId);
      });
      return { products };
    } catch (err) {
      request.log.error(err, "Erro ao listar produtos da Kiwify");
      return reply.code(502).send({
        error: "Erro ao listar produtos da Kiwify",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ---- GET dashboard (métricas agregadas, cacheado SWR) ----
  fastify.get("/api/projects/:projectId/kiwify/dashboard", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const query = dashboardQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Parâmetros inválidos", details: query.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const creds = await getCreds(params.data.projectId);
    if (!creds) return reply.code(409).send({ error: "Kiwify não conectado neste projeto" });

    const cacheKey = `dashboard:${query.data.productId}:${query.data.months}`;
    try {
      const dashboard = await serveWithSwr(params.data.projectId, cacheKey, async () => {
        const token = await getKiwifyToken(creds.clientId, creds.clientSecret);
        return computeKiwifyDashboard(token, creds.accountId, {
          productId: query.data.productId,
          months: query.data.months,
        });
      });
      return dashboard;
    } catch (err) {
      request.log.error(err, "Erro ao montar dashboard da Kiwify");
      return reply.code(502).send({
        error: "Erro ao montar dashboard da Kiwify",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
});
