import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import fp from "fastify-plugin";
import { LRUCache } from "lru-cache";
import {
  kiwifyConnections,
  kiwifyCache,
  kiwifyStageConfigs,
  kiwifySubscriptions,
  funnels,
  funnelStages,
  stageSalesSpreadsheets,
  projects,
  projectMembers,
} from "../db/schema.js";
import { readSheetData } from "../services/google-sheets.js";
import { classifyRefundStatus, isRefundBucket } from "../services/sales-status.js";
import {
  conciliar,
  diaNormalizado,
  quantidadeDeIngressos,
  type VendaDaPlanilha,
} from "../services/kiwify-reconciliation.js";
import {
  encryptKiwifySecret,
  decryptKiwifySecret,
  getKiwifyToken,
  kiwifyGet,
  listKiwifyProducts,
  computeKiwifyDashboard,
  fetchSalesWindowed,
  fetchEventProduct,
  totalDeIngressos,
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

    // `todos=1`: o seletor da conferência precisa dos produtos de VENDA ÚNICA,
    // que são a maioria num lançamento. O default continua só recorrentes para
    // não mudar o dashboard de assinaturas, que é quem já usava esta rota.
    const todos = (request.query as { todos?: string }).todos === "1";
    const cacheKey = `products:${query.data.months}:${todos ? "todos" : "recorrentes"}`;
    try {
      const products = await serveWithSwr(params.data.projectId, cacheKey, async () => {
        const token = await getKiwifyToken(creds.clientId, creds.clientSecret);
        return listKiwifyProducts(token, creds.accountId, !todos);
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

  // ============================================================
  // Story 35.6 (fase 2) — Webhook de assinatura por projeto.
  // O sistema "gera o webhook" do projeto: uma URL única com token secreto que o
  // expert cola no painel da Kiwify. O token vive na conexão Kiwify do projeto.
  // ============================================================

  const WEBHOOK_PATH = (projectId: string) => `/api/webhooks/kiwify/${projectId}`;

  /** Gera (ou garante) o token de webhook do projeto. Requer conexão existente. */
  async function ensureWebhookToken(projectId: string): Promise<string | null> {
    const row = await getConnectionRow(projectId);
    if (!row) return null;
    if (row.webhookToken) return row.webhookToken;
    const token = randomBytes(24).toString("hex");
    await fastify.db
      .update(kiwifyConnections)
      .set({ webhookToken: token, updatedAt: new Date() })
      .where(eq(kiwifyConnections.projectId, projectId));
    return token;
  }

  // ---- GET webhook (URL + token p/ colar na Kiwify; gera token na 1ª vez) ----
  fastify.get("/api/projects/:projectId/kiwify/webhook", async (request, reply) => {
    // Token é segredo de configuração — só não-guests (mesma régua do PUT connection).
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const token = await ensureWebhookToken(params.data.projectId);
    if (!token) {
      return reply.code(409).send({ error: "Conecte a Kiwify neste projeto antes de gerar o webhook" });
    }
    return { configured: true, path: WEBHOOK_PATH(params.data.projectId), token };
  });

  // ---- POST webhook/rotate (revoga o token antigo e gera um novo) ----
  fastify.post("/api/projects/:projectId/kiwify/webhook/rotate", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const row = await getConnectionRow(params.data.projectId);
    if (!row) {
      return reply.code(409).send({ error: "Conecte a Kiwify neste projeto antes de gerar o webhook" });
    }
    const token = randomBytes(24).toString("hex");
    await fastify.db
      .update(kiwifyConnections)
      .set({ webhookToken: token, updatedAt: new Date() })
      .where(eq(kiwifyConnections.projectId, params.data.projectId));
    return { configured: true, path: WEBHOOK_PATH(params.data.projectId), token };
  });

  // ---- GET subscriptions/summary (estado REAL vindo dos webhooks) ----
  // Preenche os gaps honestos do Pull-MVP: vigentes/canceladas/atrasadas + MRR real
  // (Σ amount das assinaturas vigentes, por moeda). Leitura para todos com acesso.
  fastify.get("/api/projects/:projectId/kiwify/subscriptions/summary", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const statusRows = await fastify.db
      .select({
        status: kiwifySubscriptions.status,
        count: sql<number>`count(*)::int`,
      })
      .from(kiwifySubscriptions)
      .where(eq(kiwifySubscriptions.projectId, params.data.projectId))
      .groupBy(kiwifySubscriptions.status);

    const mrrRows = await fastify.db
      .select({
        currency: kiwifySubscriptions.currency,
        value: sql<number>`coalesce(sum(${kiwifySubscriptions.amount}), 0)::int`,
      })
      .from(kiwifySubscriptions)
      .where(
        and(
          eq(kiwifySubscriptions.projectId, params.data.projectId),
          eq(kiwifySubscriptions.status, "active"),
        ),
      )
      .groupBy(kiwifySubscriptions.currency);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) {
      byStatus[r.status] = r.count;
      total += r.count;
    }

    return {
      total,
      byStatus,
      active: byStatus["active"] ?? 0,
      canceled: byStatus["canceled"] ?? 0,
      late: byStatus["late"] ?? 0,
      // MRR real (centavos) das assinaturas vigentes, por moeda (BRL primeiro não
      // garantido aqui — o front ordena/exibe).
      activeMrr: mrrRows
        .filter((r) => r.currency)
        .map((r) => ({ currency: r.currency as string, value: r.value })),
    };
  });

  // ============================================================
  // Conferência com a planilha (Story: divergência de vendas)
  // ============================================================

  const stageParamsSchema = z.object({
    projectId: z.string().uuid(),
    funnelId: z.string().uuid(),
    stageId: z.string().uuid(),
  });

  const configBodySchema = z.object({
    /** Ids de produto da Kiwify que entram na conferência desta etapa. */
    productIds: z.array(z.string().min(1)).min(1, "Escolha ao menos um produto"),
    /** aaaa-mm-dd — a partir de quando contar. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato aaaa-mm-dd"),
    /**
     * Preço de UM ingresso. Opcional: sem ele cada venda conta 1, que é o
     * comportamento de sempre. Com ele, a compra de 3 ingressos deixa de
     * aparecer como uma venda só.
     */
    ticketPrice: z.number().positive().nullable().optional(),
  });

  /** A etapa pertence ao funil, e o funil ao projeto? */
  async function etapaDoProjeto(projectId: string, funnelId: string, stageId: string) {
    const [linha] = await fastify.db
      .select({ id: funnelStages.id, funnelProject: funnels.projectId })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnelStages.funnelId, funnels.id))
      .where(and(eq(funnelStages.id, stageId), eq(funnelStages.funnelId, funnelId)))
      .limit(1);
    return linha && linha.funnelProject === projectId ? linha : null;
  }

  /** Config da conferência desta etapa, mais o estado da conexão do projeto. */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/kiwify/config",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      if (!(await etapaDoProjeto(params.data.projectId, params.data.funnelId, params.data.stageId))) {
        return reply.code(404).send({ error: "Etapa não encontrada" });
      }

      const [cfg] = await fastify.db
        .select()
        .from(kiwifyStageConfigs)
        .where(eq(kiwifyStageConfigs.stageId, params.data.stageId))
        .limit(1);

      // A conexão é do projeto: dizer aqui se ela existe evita a tela ter de
      // fazer uma segunda chamada só para saber se pode oferecer a conferência.
      const conectado = Boolean(await getCreds(params.data.projectId));

      return {
        conectado,
        config: cfg
          ? {
              productIds: cfg.productIds ?? [],
              startDate: cfg.startDate,
              ticketPrice: cfg.ticketPrice === null ? null : Number(cfg.ticketPrice),
              updatedAt: cfg.updatedAt.toISOString(),
            }
          : null,
      };
    },
  );

  /** Define o recorte (produtos + data de início) da conferência. */
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/kiwify/config",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const body = configBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
      }
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      if (!(await etapaDoProjeto(params.data.projectId, params.data.funnelId, params.data.stageId))) {
        return reply.code(404).send({ error: "Etapa não encontrada" });
      }
      if (!(await getCreds(params.data.projectId))) {
        return reply.code(409).send({ error: "Conecte a Kiwify no projeto antes de configurar a conferência" });
      }

      const agora = new Date();
      await fastify.db
        .insert(kiwifyStageConfigs)
        .values({
          stageId: params.data.stageId,
          productIds: body.data.productIds,
          startDate: body.data.startDate,
          ticketPrice: body.data.ticketPrice != null ? String(body.data.ticketPrice) : null,
          createdBy: request.userId,
          updatedAt: agora,
        })
        .onConflictDoUpdate({
          target: kiwifyStageConfigs.stageId,
          set: {
            productIds: body.data.productIds,
            startDate: body.data.startDate,
            ticketPrice: body.data.ticketPrice != null ? String(body.data.ticketPrice) : null,
            updatedAt: agora,
          },
        });

      return {
        config: {
          productIds: body.data.productIds,
          startDate: body.data.startDate,
          ticketPrice: body.data.ticketPrice ?? null,
        },
      };
    },
  );

  /** Desliga a conferência desta etapa. */
  fastify.delete(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/kiwify/config",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      await fastify.db
        .delete(kiwifyStageConfigs)
        .where(eq(kiwifyStageConfigs.stageId, params.data.stageId));
      return { config: null };
    },
  );

  /**
   * Confere a planilha da etapa contra a Kiwify e diz onde diverge.
   *
   * Não muda nada: o dashboard continua lendo a planilha. Isto responde uma
   * pergunta que hoje não tem resposta — "os números batem?" — e, quando não
   * batem, mostra QUAIS vendas estão de cada lado, que é o que permite achar a
   * causa em vez de discutir o total.
   *
   * A janela vai da data de início configurada até hoje. Os produtos são os
   * escolhidos para a etapa: a conta da Kiwify tem todos os produtos do expert,
   * e comparar tudo contra a planilha de um lançamento acusaria divergência em
   * cada venda dos outros.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/kiwify/reconciliation",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [cfg] = await fastify.db
        .select()
        .from(kiwifyStageConfigs)
        .where(eq(kiwifyStageConfigs.stageId, params.data.stageId))
        .limit(1);
      // Sem configuração não há conferência — e isso não é erro: a maioria das
      // etapas não usa Kiwify.
      if (!cfg) return { configurado: false as const };

      const creds = await getCreds(params.data.projectId);
      if (!creds) {
        return reply.code(409).send({ error: "Kiwify não conectado neste projeto" });
      }

      const hoje = new Date().toISOString().slice(0, 10);
      const planilhas = await fastify.db
        .select()
        .from(stageSalesSpreadsheets)
        .where(eq(stageSalesSpreadsheets.stageId, params.data.stageId));

      try {
        // Um token para tudo: vendas e detalhe dos produtos usam o mesmo.
        const token = await getKiwifyToken(creds.clientId, creds.clientSecret);
        const [daPlanilha, daKiwify] = await Promise.all([
          lerVendasDasPlanilhas(planilhas, cfg.startDate, hoje),
          (async () => {
            const listas = await Promise.all(
              (cfg.productIds ?? []).map((productId) =>
                fetchSalesWindowed(token, creds.accountId, {
                  productId,
                  from: cfg.startDate,
                  to: hoje,
                  fullDetails: true,
                }),
              ),
            );
            return listas.flat();
          })(),
        ]);

        // Reembolso e recusa não são venda: a planilha também não os conta, e
        // incluí-los aqui acusaria divergência a cada estorno.
        const pagas = daKiwify.filter((v) => VENDA_VALE.has((v.status ?? "").toLowerCase()));

        /**
         * Ingressos, que não são a mesma coisa que vendas.
         *
         * A Kiwify manda UMA venda quando a pessoa compra três ingressos, então
         * contar linhas subestima o público. A resposta oficial está no
         * PRODUTO: sendo `type: "event"`, ele traz os lotes com
         * `issued_tickets` — a contagem da própria Kiwify, por lote.
         *
         * Isso substitui a divisão por preço, que quebraria aqui: este evento
         * tem nove lotes (797, 997, 1097, versões com 15% de desconto…), e
         * qualquer conta que assuma um preço único erra na maioria das vendas.
         * O preço unitário configurado fica como reserva, para produto que não
         * é evento e mesmo assim vende em quantidade.
         */
        const lotes = (
          await Promise.all(
            (cfg.productIds ?? []).map((id) =>
              fetchEventProduct(token, creds.accountId, id).catch(() => null),
            ),
          )
        ).filter((p): p is NonNullable<typeof p> => p !== null && p.type === "event");

        const ingressosPorLote = lotes.flatMap((p) =>
          p.batches
            .filter((b) => b.issuedTickets > 0 || b.availableTickets < b.maxTickets)
            .map((b) => ({
              produto: p.name,
              lote: b.name,
              preco: b.price / 100,
              emitidos: b.issuedTickets,
              disponiveis: b.availableTickets,
              total: b.maxTickets,
            })),
        );
        const ingressosDoEvento = lotes.length > 0
          ? lotes.reduce((acc, p) => acc + totalDeIngressos(p.batches), 0)
          : null;

        const unitario = cfg.ticketPrice === null ? null : Number(cfg.ticketPrice);
        const comQuantidade = pagas.map((v) => {
          const base = Number((v as { payment?: { product_base_price?: number } }).payment?.product_base_price ?? 0) / 100;
          return { venda: v, ingressos: quantidadeDeIngressos(base, unitario), precoBase: base };
        });
        // O número do evento manda quando existe: é contagem, não estimativa.
        const ingressosKiwify = ingressosDoEvento ?? comQuantidade.reduce((acc, x) => acc + x.ingressos, 0);
        const comprasMultiplas = comQuantidade
          .filter((x) => x.ingressos > 1)
          .map((x) => ({
            nome: (x.venda as { customer?: { name?: string } }).customer?.name ?? null,
            email: (x.venda as { customer?: { email?: string } }).customer?.email ?? null,
            data: diaNormalizado(x.venda.approved_date ?? null),
            ingressos: x.ingressos,
            precoBase: x.precoBase,
          }))
          .sort((a, b) => b.ingressos - a.ingressos);

        const resultado = conciliar(
          daPlanilha,
          pagas.map((v) => ({
            id: String(v.id ?? ""),
            reference: (v as { reference?: string }).reference ?? null,
            email: (v as { customer?: { email?: string } }).customer?.email ?? null,
            data: diaNormalizado(v.approved_date ?? (v as { created_at?: string }).created_at ?? null),
            // net_amount vem em CENTAVOS.
            valor: (v.net_amount ?? 0) / 100,
            produto: v.product?.name ?? null,
          })),
        );

        /**
         * Produtos que aparecem na PLANILHA, com quantas linhas cada um.
         *
         * É o antídoto do principal modo de erro da conferência: escolher na
         * Kiwify um produto que não é o do lançamento. Aí a divergência é
         * enorme e não significa nada — some as vendas de um produto contra as
         * de outro. Vendo lado a lado o que a planilha tem, a pessoa percebe
         * na hora que escolheu errado.
         */
        const produtosNaPlanilha = (() => {
          const m = new Map<string, number>();
          for (const linha of daPlanilha) {
            const nome = (linha.produto ?? "").trim() || "(sem produto)";
            m.set(nome, (m.get(nome) ?? 0) + 1);
          }
          return [...m.entries()]
            .map(([nome, vendas]) => ({ nome, vendas }))
            .sort((a, b) => b.vendas - a.vendas)
            .slice(0, 10);
        })();

        return {
          configurado: true as const,
          periodo: { de: cfg.startDate, ate: hoje },
          produtos: cfg.productIds ?? [],
          produtosNaPlanilha,
          /**
           * Ingressos ≠ vendas. `null` quando não há preço unitário
           * configurado: nesse caso não dá para saber, e mostrar o número de
           * vendas como se fosse de ingressos seria repetir o erro que esta
           * contagem existe para corrigir.
           */
          ingressosKiwify: ingressosDoEvento ?? (unitario ? ingressosKiwify : null),
          /** `lotes` = veio de `issued_tickets`; `preco` = derivado do valor. */
          fonteDosIngressos: ingressosDoEvento != null ? ("lotes" as const) : unitario ? ("preco" as const) : null,
          ticketPrice: unitario,
          ingressosPorLote,
          comprasMultiplas,
          ...resultado,
          // As listas podem ser longas num lançamento grande. A tela recebe uma
          // amostra, mas o TOTAL vai separado: mostrar 50 quando são 300 seria
          // subestimar o problema justamente no caso em que ele é maior.
          soNaKiwify: resultado.soNaKiwify.slice(0, AMOSTRA),
          soNaPlanilha: resultado.soNaPlanilha.slice(0, AMOSTRA),
          soNaKiwifyTotal: resultado.soNaKiwify.length,
          soNaPlanilhaTotal: resultado.soNaPlanilha.length,
          amostraLimitada:
            resultado.soNaKiwify.length > AMOSTRA || resultado.soNaPlanilha.length > AMOSTRA,
        };
      } catch (err) {
        request.log.error(err, "[kiwify] conferência falhou");
        return reply.code(502).send({
          error: "Não consegui comparar agora",
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );
});

/**
 * Status da Kiwify que representam venda válida.
 *
 * Fora daqui ficam reembolso, chargeback e recusa — que a planilha também não
 * conta como venda. Incluí-los faria a conferência acusar divergência a cada
 * estorno, e o aviso perderia o sentido de tanto aparecer sem motivo.
 */
const VENDA_VALE = new Set(["paid", "approved"]);

/** Quantas divergências a resposta detalha. O total vai sempre completo. */
const AMOSTRA = 50;

/**
 * Lê as vendas das planilhas da etapa, com as MESMAS regras do dashboard.
 *
 * Precisa ser igual: comparar a Kiwify contra uma contagem diferente da que
 * aparece na tela produziria um aviso que ninguém consegue conferir.
 */
async function lerVendasDasPlanilhas(
  planilhas: Array<{
    spreadsheetId: string;
    sheetName: string;
    columnMapping: unknown;
  }>,
  de: string,
  ate: string,
): Promise<VendaDaPlanilha[]> {
  const out: VendaDaPlanilha[] = [];

  for (const sp of planilhas) {
    const mapping = (sp.columnMapping ?? {}) as {
      email?: string;
      dataVenda?: string;
      transactionId?: string;
      status?: string;
      valorBruto?: string;
      productName?: string;
    };

    let data: { headers: string[]; rows: string[][] };
    try {
      data = await readSheetData(sp.spreadsheetId, sp.sheetName);
    } catch {
      // Planilha ilegível (permissão, aba renomeada) não derruba a conferência:
      // ela é justamente um dos motivos de divergência que queremos flagrar.
      continue;
    }

    const col = (nome: string | undefined) => (nome ? data.headers.indexOf(nome) : -1);
    const iEmail = col(mapping.email);
    const iData = col(mapping.dataVenda);
    const iTx = col(mapping.transactionId);
    const iStatus = col(mapping.status);
    const iValor = col(mapping.valorBruto);
    const iProduto = col(mapping.productName);
    const temStatus = iStatus !== -1;

    const vistos = new Set<string>();
    for (const row of data.rows) {
      if (temStatus && isRefundBucket(classifyRefundStatus(row[iStatus], true))) continue;

      const dia = diaNormalizado(iData !== -1 ? row[iData] : null);
      // Fora da janela configurada: a planilha costuma ter o histórico inteiro,
      // e a conferência é do recorte que o time escolheu. Data ilegível NÃO é
      // descartada — some do recorte por engano seria inventar divergência.
      if (dia && (dia < de || dia > ate)) continue;

      const chave = iTx !== -1 ? (row[iTx] ?? "").trim() : "";
      const produto = iProduto !== -1 ? (row[iProduto] ?? "").trim() : "";
      // Mesma dedup do dashboard: retry do gateway repete a transação para o
      // mesmo produto, e isso é uma venda só.
      const dedup = chave ? `${chave}::${produto.toLowerCase()}` : "";
      if (dedup) {
        if (vistos.has(dedup)) continue;
        vistos.add(dedup);
      }

      out.push({
        chave: chave || null,
        email: iEmail !== -1 ? (row[iEmail] ?? "").trim() || null : null,
        data: dia || null,
        valor: iValor !== -1 ? Number(String(row[iValor] ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0 : 0,
        produto: produto || null,
      });
    }
  }

  return out;
}
