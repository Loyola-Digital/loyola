import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import { hotmartConnections, projects, projectMembers } from "../db/schema.js";
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

// Cache LRU module-level, compartilhado por products e dashboard (ttl ~30min).
// V deve ser non-nullish (lru-cache v11) — armazenamos array de produtos ou o
// objeto de dashboard, ambos objetos.
const hotmartCache = new LRUCache<string, object>({
  max: 500,
  ttl: 30 * 60 * 1000,
});

/** Remove todas as entradas do cache cujo prefixo da chave é `${projectId}:`. */
function invalidateHotmartCache(projectId: string): void {
  for (const key of hotmartCache.keys()) {
    if (key.startsWith(`${projectId}:`)) hotmartCache.delete(key);
  }
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

    invalidateHotmartCache(params.data.projectId);
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
    invalidateHotmartCache(params.data.projectId);
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

    const cacheKey = `${params.data.projectId}:products:${query.data.months}`;
    const cached = hotmartCache.get(cacheKey);
    if (cached !== undefined) return { products: cached };

    try {
      const token = await getHotmartToken(creds.clientId, creds.clientSecret);
      const accessionFrom = monthsAgoMs(query.data.months, nowMs());
      const products = await listHotmartProducts(token, accessionFrom);
      hotmartCache.set(cacheKey, products);
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

    const cacheKey = `${params.data.projectId}:dashboard:${query.data.productId}:${query.data.months}`;
    const cached = hotmartCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const token = await getHotmartToken(creds.clientId, creds.clientSecret);
      const dashboard = await computeHotmartDashboard(token, {
        productId: query.data.productId,
        months: query.data.months,
      });
      hotmartCache.set(cacheKey, dashboard);
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
