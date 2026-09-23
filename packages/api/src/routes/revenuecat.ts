import { z } from "zod";
import { calcularMetricasDerivadas } from "../utils/metricas-revenuecat.js";
import { consultaDaJornada, consultaDoInicioDaAssinatura, lerLinhaDaJornada, montarJornada } from "../utils/jornada-lyrio.js";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import fp from "fastify-plugin";
import {
  revenuecatConnections,
  revenuecatStageConfig,
  revenuecatSales,
  funnelStages,
  funnels,
  projects,
  projectMembers,
} from "../db/schema.js";
import {
  encryptRevenuecatKey,
  decryptRevenuecatKey,
  verifyRevenuecatKey,
  listRevenuecatProjects,
  getRevenuecatOverview,
  REVENUE_EVENT_TYPES,
} from "../services/revenuecat.js";
import {
  backfillRevenuecatSubscriptions,
  statusBackfill,
} from "../services/revenuecat-backfill.js";

// ============================================================
// Etapa Lyrio — Rotas RevenueCat
// Conexão POR PROJETO (Secret API Key v2) + config POR ETAPA (rcProjectId +
// webhook token) + agregação de vendas (vinda dos webhooks).
//
// SEGURANÇA: GET connection devolve só { connected }. NUNCA serializar a key, o
// token do webhook (exceto pra não-guest que configura) nem app_user_id (PII).
// ============================================================

const projectParamsSchema = z.object({ projectId: z.string().uuid() });
const stageParamsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const connectionBodySchema = z.object({
  apiKey: z.string().min(10, "Secret API Key inválida"),
});

const configBodySchema = z.object({
  rcProjectId: z.string().max(64).nullable().optional(),
  label: z.string().max(255).nullable().optional(),
  // Story 42.4 — percentuais da Margem de Contribuição, sobre o faturamento
  // bruto. A soma dos três é validada abaixo (não pode passar de 100%).
  platformFeePct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
  otherCostsPct: z.number().min(0).max(100).optional(),
});

/** Defaults do memorial especificado pelo gestor (Story 42.4). */
const MARGIN_DEFAULTS = { platformFeePct: 15, taxPct: 5, otherCostsPct: 1 } as const;

/** `numeric` do Postgres chega como string no Drizzle. */
function pct(value: string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const salesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});

const REVENUE_TYPES = [...REVENUE_EVENT_TYPES];

export default fp(async function revenuecatRoutes(fastify) {
  // Acesso ao projeto (espelho de kiwify/mautic): guest sem vínculo -> null (404).
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

  /** Confere que a etapa existe e pertence ao funil/projeto. */
  async function getStage(projectId: string, funnelId: string, stageId: string) {
    const [row] = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
      .where(
        and(
          eq(funnelStages.id, stageId),
          eq(funnelStages.funnelId, funnelId),
          eq(funnels.projectId, projectId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async function getApiKey(projectId: string): Promise<string | null> {
    const [row] = await fastify.db
      .select()
      .from(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, projectId))
      .limit(1);
    if (!row) return null;
    try {
      return decryptRevenuecatKey(row.apiKeyEncrypted, row.apiKeyIv);
    } catch {
      return null;
    }
  }

  // ---- GET connection (status, sem a key) ----
  fastify.get("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const [row] = await fastify.db
      .select({ id: revenuecatConnections.id })
      .from(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, params.data.projectId))
      .limit(1);
    return { connected: Boolean(row) };
  });

  // ---- PUT connection (valida a key, criptografa, salva) ----
  fastify.put("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const body = connectionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Dados inválidos", details: body.error.flatten() });
    }
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    try {
      await verifyRevenuecatKey(body.data.apiKey);
    } catch (err) {
      request.log.error(err, "RevenueCat connection validation failed");
      return reply.code(502).send({
        error: "Falha ao conectar no RevenueCat. Verifique a Secret API Key (v2).",
      });
    }

    const enc = encryptRevenuecatKey(body.data.apiKey);
    const now = new Date();
    await fastify.db
      .insert(revenuecatConnections)
      .values({
        projectId: params.data.projectId,
        apiKeyEncrypted: enc.encrypted,
        apiKeyIv: enc.iv,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: revenuecatConnections.projectId,
        set: { apiKeyEncrypted: enc.encrypted, apiKeyIv: enc.iv, updatedAt: now },
      });
    return { connected: true };
  });

  // ---- DELETE connection ----
  fastify.delete("/api/projects/:projectId/revenuecat/connection", async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    await fastify.db
      .delete(revenuecatConnections)
      .where(eq(revenuecatConnections.projectId, params.data.projectId));
    return { connected: false };
  });

  // ---- GET projects (lista os projects do RevenueCat pro dropdown) ----
  fastify.get("/api/projects/:projectId/revenuecat/projects", async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
    const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
    if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

    const apiKey = await getApiKey(params.data.projectId);
    if (!apiKey) return reply.code(409).send({ error: "RevenueCat não conectado neste projeto" });

    try {
      const rcProjects = await listRevenuecatProjects(apiKey);
      return { projects: rcProjects };
    } catch (err) {
      request.log.error(err, "Erro ao listar projects do RevenueCat");
      return reply.code(502).send({ error: "Erro ao listar projects do RevenueCat" });
    }
  });

  // ---- GET stage config (rcProjectId + label + webhook p/ não-guest) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/config",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [row] = await fastify.db
        .select()
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      // Token do webhook é segredo de config — só não-guest recebe.
      const webhook =
        request.userRole !== "guest" && row?.webhookToken
          ? { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token: row.webhookToken }
          : null;

      return {
        rcProjectId: row?.rcProjectId ?? null,
        label: row?.label ?? null,
        webhook,
        // Sempre preenchidos: etapa sem linha de config usa os defaults, e o
        // painel precisa de números para exibir nos campos.
        platformFeePct: pct(row?.platformFeePct, MARGIN_DEFAULTS.platformFeePct),
        taxPct: pct(row?.taxPct, MARGIN_DEFAULTS.taxPct),
        otherCostsPct: pct(row?.otherCostsPct, MARGIN_DEFAULTS.otherCostsPct),
      };
    },
  );

  // ---- PUT stage config (upsert rcProjectId/label; garante linha) ----
  fastify.put(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/config",
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
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [existing] = await fastify.db
        .select()
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      // Story 42.4: o PUT passou a ser PARCIAL. Antes, campo ausente no body
      // virava null — salvar um percentual apagaria o rcProjectId da etapa e
      // derrubaria as métricas do RevenueCat. Só o que veio no body muda.
      const has = <K extends keyof typeof body.data>(k: K) => body.data[k] !== undefined;

      const platformFeePct = has("platformFeePct")
        ? body.data.platformFeePct!
        : pct(existing?.platformFeePct, MARGIN_DEFAULTS.platformFeePct);
      const taxPct = has("taxPct")
        ? body.data.taxPct!
        : pct(existing?.taxPct, MARGIN_DEFAULTS.taxPct);
      const otherCostsPct = has("otherCostsPct")
        ? body.data.otherCostsPct!
        : pct(existing?.otherCostsPct, MARGIN_DEFAULTS.otherCostsPct);

      // Acima de 100% o faturamento líquido fica negativo por construção e o
      // card de margem vira ficção.
      const soma = platformFeePct + taxPct + otherCostsPct;
      if (soma > 100) {
        return reply.code(400).send({
          error: `Os percentuais somam ${soma.toFixed(2)}%. Juntos não podem passar de 100%.`,
        });
      }

      const rcProjectId = has("rcProjectId")
        ? (body.data.rcProjectId ?? null)
        : (existing?.rcProjectId ?? null);
      const label = has("label") ? (body.data.label ?? null) : (existing?.label ?? null);

      const now = new Date();
      const valores = {
        rcProjectId,
        label,
        platformFeePct: String(platformFeePct),
        taxPct: String(taxPct),
        otherCostsPct: String(otherCostsPct),
        updatedAt: now,
      };
      await fastify.db
        .insert(revenuecatStageConfig)
        .values({
          stageId: params.data.stageId,
          projectId: params.data.projectId,
          ...valores,
        })
        .onConflictDoUpdate({
          target: revenuecatStageConfig.stageId,
          set: valores,
        });
      return { ok: true };
    },
  );

  // ---- GET webhook (gera token na 1ª vez; devolve path + token) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/webhook",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const [existing] = await fastify.db
        .select({ id: revenuecatStageConfig.id, webhookToken: revenuecatStageConfig.webhookToken })
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      let token = existing?.webhookToken ?? null;
      const now = new Date();
      if (!token) {
        token = randomBytes(24).toString("hex");
        if (existing) {
          await fastify.db
            .update(revenuecatStageConfig)
            .set({ webhookToken: token, updatedAt: now })
            .where(eq(revenuecatStageConfig.stageId, params.data.stageId));
        } else {
          await fastify.db.insert(revenuecatStageConfig).values({
            stageId: params.data.stageId,
            projectId: params.data.projectId,
            webhookToken: token,
            updatedAt: now,
          });
        }
      }
      return { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token };
    },
  );

  // ---- POST webhook/rotate (revoga token antigo, gera novo) ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/webhook/rotate",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const token = randomBytes(24).toString("hex");
      const now = new Date();
      await fastify.db
        .insert(revenuecatStageConfig)
        .values({
          stageId: params.data.stageId,
          projectId: params.data.projectId,
          webhookToken: token,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: revenuecatStageConfig.stageId,
          set: { webhookToken: token, updatedAt: now },
        });
      return { path: `/api/webhooks/revenuecat/${params.data.stageId}`, token };
    },
  );

  // ---- GET sales (agregação das vendas vindas do webhook) ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/sales",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const cutoff = new Date(Date.now() - query.data.days * 86_400_000);
      // Só eventos que contam como venda (receita nova), na janela.
      const scope = and(
        eq(revenuecatSales.stageId, params.data.stageId),
        gte(revenuecatSales.purchasedAt, cutoff),
        inArray(revenuecatSales.eventType, REVENUE_TYPES),
      );

      const [totals] = await fastify.db
        .select({
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope);

      const byCurrency = await fastify.db
        .select({
          currency: revenuecatSales.currency,
          revenue: sql<number>`coalesce(sum(${revenuecatSales.priceInPurchasedCurrency}), 0)::float8`,
          sales: sql<number>`count(*)::int`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.currency);

      const daily = await fastify.db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${revenuecatSales.purchasedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      const byStore = await fastify.db
        .select({
          store: revenuecatSales.store,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.store);

      const byProduct = await fastify.db
        .select({
          productId: revenuecatSales.productId,
          sales: sql<number>`count(*)::int`,
          revenueUsd: sql<number>`coalesce(sum(${revenuecatSales.revenueUsd}), 0)::float8`,
        })
        .from(revenuecatSales)
        .where(scope)
        .groupBy(revenuecatSales.productId)
        .orderBy(sql`2 desc`)
        .limit(20);

      return {
        days: query.data.days,
        totalSales: totals?.sales ?? 0,
        revenueUsd: totals?.revenueUsd ?? 0,
        byCurrency: byCurrency.filter((c) => c.currency),
        daily,
        byStore: byStore.filter((s) => s.store),
        byProduct: byProduct.filter((p) => p.productId),
      };
    },
  );

  // ---- GET jornada por canal ---- (Story 42.11)
  /**
   * A jornada do usuário por canal: Novos → viu paywall → interagiu → iniciou
   * (teste) → pagou, com a receita. Coorte = primeiro evento do usuário na
   * janela `days`; etapas contadas até hoje (AC2). Guarda igual à de `/sales`:
   * `getProjectAccess` (guest sem vínculo → 404) E `getStage` (a etapa é deste
   * funil e deste projeto) — não o modelo de `/metricas-derivadas`, que pula o
   * `getStage` e traz a tabela inteira para a memória (PO-06).
   *
   * Agrega NO BANCO (uma linha por usuário, sem o id) e classifica o canal em
   * `utils/jornada-lyrio.ts`. Só contagens na resposta — nunca `app_user_id`.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/jornada",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const desde = new Date(Date.now() - query.data.days * 86_400_000);
      const [usuarios, inicio] = await Promise.all([
        fastify.db.execute(consultaDaJornada(params.data.stageId, desde)),
        fastify.db.execute(consultaDoInicioDaAssinatura(params.data.stageId)),
      ]);
      const jornada = montarJornada(
        (usuarios.rows as Record<string, unknown>[]).map(lerLinhaDaJornada),
        desde,
      );
      const primeiraAssinatura = (inicio.rows[0] as { desde?: unknown } | undefined)?.desde;
      const assinaturaDesde =
        primeiraAssinatura instanceof Date
          ? primeiraAssinatura.toISOString().slice(0, 10)
          : typeof primeiraAssinatura === "string" && primeiraAssinatura
            ? new Date(primeiraAssinatura).toISOString().slice(0, 10)
            : null;

      return {
        days: query.data.days,
        desde: desde.toISOString().slice(0, 10),
        assinaturaDesde,
        ...jornada,
      };
    },
  );

  // ---- GET overview (métricas agregadas puxadas da API do RevenueCat) ----
  // Pull ao vivo via API key (não depende do webhook): MRR, assinaturas ativas,
  // receita 28d, etc. Requer key conectada + rcProjectId escolhido na etapa.
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/overview",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const apiKey = await getApiKey(params.data.projectId);
      if (!apiKey) return reply.code(409).send({ error: "RevenueCat não conectado neste projeto" });

      const [cfg] = await fastify.db
        .select({ rcProjectId: revenuecatStageConfig.rcProjectId })
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);

      // Sem app selecionado na etapa — o front pede pra configurar.
      if (!cfg?.rcProjectId) return { configured: false, metrics: [] };

      try {
        const metrics = await getRevenuecatOverview(apiKey, cfg.rcProjectId);
        return { configured: true, metrics };
      } catch (err) {
        request.log.error(err, "Erro ao puxar overview do RevenueCat");
        // 403 = a Secret Key não tem a permissão charts_metrics:overview:read.
        return reply.code(502).send({
          error:
            "Não foi possível puxar as métricas do RevenueCat. Confirme que a Secret API Key tem a permissão de leitura de métricas (charts_metrics:overview:read).",
        });
      }
    },
  );


  // ---- GET /.../revenuecat/metricas-derivadas ---- (Story 42.9, AC8)
  /**
   * As métricas que a API do RevenueCat não entrega, calculadas dos eventos de
   * webhook que já guardamos.
   *
   * ⚠️ A série de assinatura começa em 10/ago/2026 (`revenuecat_sales`). Antes
   * disso só há eventos de paywall. `serieDesde` vai na resposta para a tela
   * declarar isso (AC5) — um gráfico que desenhe reta em zero antes dessa data
   * estaria inventando histórico.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/metricas-derivadas",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const linhas = await fastify.db
        .select({
          eventType: revenuecatSales.eventType,
          appUserId: revenuecatSales.appUserId,
          eventAt: revenuecatSales.eventAt,
          payload: revenuecatSales.payload,
        })
        .from(revenuecatSales)
        .where(eq(revenuecatSales.stageId, params.data.stageId));

      const eventos = linhas.map((l) => ({
        eventType: l.eventType,
        appUserId: l.appUserId,
        eventAt: l.eventAt,
        periodType:
          ((l.payload as { event?: { period_type?: string } } | null)?.event?.period_type) ?? null,
      }));

      // Só os eventos de ASSINATURA definem a data de início da série: os de
      // paywall existem desde 11/jun e diriam que a série começa antes do que
      // de fato começa.
      const deAssinatura = eventos.filter(
        (e) => e.eventType && e.eventType !== "TEST" && !e.eventType.startsWith("PAYWALL"),
      );
      const datas = deAssinatura
        .map((e) => e.eventAt)
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        ...calcularMetricasDerivadas(eventos, eventos),
        serieDesde: datas[0]?.toISOString().slice(0, 10) ?? null,
        totalDeEventos: deAssinatura.length,
      };
    },
  );

  // ============================================================
  // Backfill do histórico de assinaturas (API v2)
  // ============================================================
  //
  // O webhook só registra o que acontece depois de plugado. Estas rotas trazem
  // o que veio antes. É percurso longo (uma chamada por cliente, milhares de
  // clientes), então roda por LOTE e retomável: o POST devolve logo e o cursor
  // fica salvo, o GET mostra o progresso e o próximo POST continua de onde
  // parou.

  // ---- GET status do backfill ----
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/backfill",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      return statusBackfill(fastify.db, params.data.stageId);
    },
  );

  // ---- POST roda um lote do backfill ----
  fastify.post(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/backfill",
    async (request, reply) => {
      if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const corpo = z
        .object({ limite: z.coerce.number().int().min(1).max(2000).optional() })
        .safeParse(request.body ?? {});

      const resultado = await backfillRevenuecatSubscriptions(fastify.db, params.data.stageId, {
        limite: corpo.success ? corpo.data.limite : undefined,
        log: (m) => request.log.info(m),
      });

      if (resultado.status === "error") {
        return reply.code(502).send(resultado);
      }
      return resultado;
    },
  );
});
