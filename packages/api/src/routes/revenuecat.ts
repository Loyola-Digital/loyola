import { z } from "zod";
import { metricasDerivadasDaEtapa } from "../utils/metricas-revenuecat.js";
import { diasDaJanelaEmSp, instanteDoInicioDaJanela } from "../utils/sale-date.js";
import { consultaDoInicioDaAssinatura, lerLinhaDaJornada, montarJornada } from "../utils/jornada-lyrio.js";
import { consultaDaJornadaPorProduto, lerProdutoDaJornada, montarPorProduto } from "../utils/jornada-por-produto-lyrio.js";
import {
  consultaDeVendasPorCanal,
  diaNoFusoDoNegocio,
  consultaDoInicioDosAtributos,
  consultaDoQueFicaForaDaQuebra,
  dataIso,
  lerLinhaDeVendas,
  montarVendasPorCanal,
} from "../utils/vendas-por-canal-lyrio.js";
import { pagantesPorCanalDaEtapa } from "../utils/pagantes-lyrio.js";
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
  getRevenuecatRevenue,
  getRevenuecatChartTotal,
  respostaDeFalhaDoRevenuecat,
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

/**
 * Story 42.14 (AC2b, AC10b) — a janela de `metricas-derivadas` é OPCIONAL: sem
 * `days`, a rota responde como antes (a série inteira), e o eco `days: null`
 * diz isso. Com `days`, aplica a janela e a ecoa.
 */
const janelaOpcionalSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
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

      // Story 42.13 (AC4): N dias de calendário em SP, incluindo hoje — a régua
      // da Meta (`dateRangeFromDays`), não as últimas N × 24 h.
      const cutoff = instanteDoInicioDaJanela(query.data.days);
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
          // Story 42.13 (AC4b): o dia de SP, o mesmo da janela — em UTC, a venda das
          // 21h às 24h caía no dia seguinte.
          day: diaNoFusoDoNegocio(revenuecatSales.purchasedAt),
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
   *
   * Story 42.18 (AC3): a mesma redução por usuário traz o produto do primeiro
   * "iniciou" e do primeiro "iniciou teste" — `porProduto` reparte, por plano,
   * o iniciou de cada canal, com os mesmos novos como denominador.
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

      const desde = instanteDoInicioDaJanela(query.data.days); // Story 42.13 (AC4)
      const [usuarios, inicio, atributos] = await Promise.all([
        fastify.db.execute(consultaDaJornadaPorProduto(params.data.stageId, desde)),
        fastify.db.execute(consultaDoInicioDaAssinatura(params.data.stageId)),
        // Story 42.12 (AC4/AC6): desde quando a Meta é identificável — vem do dado.
        fastify.db.execute(consultaDoInicioDosAtributos(params.data.stageId)),
      ]);
      const linhas = (usuarios.rows as Record<string, unknown>[]).map((r) => ({ ...lerLinhaDaJornada(r), ...lerProdutoDaJornada(r) }));
      const jornada = montarJornada(linhas, desde);
      const porProduto = montarPorProduto(linhas, desde); // Story 42.18 (AC3)
      const primeiraAssinatura = (inicio.rows[0] as { desde?: unknown } | undefined)?.desde;
      // Story 42.13 (QA MNT-001): dia de SP, como `desde` e `atributosDesde`.
      const assinaturaDesde = dataIso(primeiraAssinatura);

      // Story 42.12 (D7): Meta E Google no mesmo usuário é "impossível" — se
      // acontecer, é sinal de falha na integração. Sem o id (PII).
      if (jornada.conflito.novos > 0) {
        request.log.warn({ stageId: params.data.stageId, conflito: jornada.conflito.novos }, "lyrio: usuários com Meta e Google na jornada");
      }

      return {
        days: query.data.days,
        desde: dataIso(desde), // Story 42.13: o primeiro dia da janela, em SP
        assinaturaDesde,
        atributosDesde: dataIso((atributos.rows[0] as { desde?: unknown } | undefined)?.desde),
        ...jornada,
        porProduto,
      };
    },
  );

  // ---- GET vendas por canal ---- (Story 42.12)
  /**
   * As vendas pagas da etapa separadas em Meta · Google · Orgânico ou cupom ·
   * Sem atribuição, com a quebra da Meta por campanha/conjunto/anúncio. Canal
   * pelo usuário (série inteira, D6); venda pela janela de `days` sobre
   * `purchased_at` — a mesma coluna de `/sales` (PO-02).
   *
   * Guarda igual à de `/sales` e `/jornada`: `getProjectAccess` E `getStage`.
   * Agrega NO BANCO (uma linha por comprador, sem o id); a classificação é a de
   * `utils/vendas-por-canal-lyrio.ts`. Só contagens na resposta.
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/vendas-por-canal",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const desde = instanteDoInicioDaJanela(query.data.days); // Story 42.13 (AC4)
      const [compradores, fora, atributos] = await Promise.all([
        fastify.db.execute(consultaDeVendasPorCanal(params.data.stageId, desde)),
        fastify.db.execute(consultaDoQueFicaForaDaQuebra(params.data.stageId, desde)),
        fastify.db.execute(consultaDoInicioDosAtributos(params.data.stageId)),
      ]);
      const vendas = montarVendasPorCanal((compradores.rows as Record<string, unknown>[]).map(lerLinhaDeVendas));
      if (vendas.conflito.compradores > 0) {
        request.log.warn({ stageId: params.data.stageId, conflito: vendas.conflito.compradores }, "lyrio: compradores com Meta e Google");
      }
      const f = (fora.rows[0] ?? {}) as { sem_valor?: unknown; sem_usuario?: unknown };

      return {
        days: query.data.days,
        desde: dataIso(desde), // Story 42.13: o primeiro dia da janela, em SP
        atributosDesde: dataIso((atributos.rows[0] as { desde?: unknown } | undefined)?.desde),
        ...vendas,
        // PO-03: o que o card "Vendas" de `/sales` conta e esta quebra não conta.
        foraDaQuebra: { semValor: Number(f.sem_valor ?? 0) || 0, semUsuario: Number(f.sem_usuario ?? 0) || 0 },
      };
    },
  );

  // ---- GET novos pagantes, renovações e LTV por plano ---- (Story 42.14)
  /**
   * AC6 (novos pagantes POR PESSOA, por canal), AC8 (renovações por canal) e
   * AC7 (LTV bruto por plano: Mensal, Trimestral, Anual), na janela de `days` sobre `purchased_at` — a régua
   * de `/sales` e `/vendas-por-canal` (N dias de calendário de SP). O canal é o
   * da 42.12 com a origem mais antiga para quem tem Meta E Google (D16/D25/D26);
   * empate exato → `conflito` (PO-D3). Regras em `utils/pagantes-lyrio.ts`.
   *
   * Guarda igual à de `/vendas-por-canal`: `getProjectAccess` E `getStage`.
   * Só contagens e somas na resposta — nunca `app_user_id`. A resposta ecoa a
   * janela (AC10b) e a cobertura (`assinaturaDesde`, achado G).
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/pagantes-por-canal",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // A composição mora em `utils/pagantes-lyrio.ts` — a mesma que a sonda de
      // conferência em produção roda.
      const corpo = await pagantesPorCanalDaEtapa((q) => fastify.db.execute(q), params.data.stageId, query.data.days);
      if (corpo.novosPagantes.conflito > 0 || corpo.renovacoes.conflito > 0) {
        request.log.warn({ stageId: params.data.stageId, conflito: corpo.novosPagantes.conflito }, "lyrio: pagantes com Meta e Google no mesmo instante");
      }
      return corpo;
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
        // Story 42.14 (PO-D4 (1)): a causa sai separada — antes toda falha virava
        // a mesma frase sobre permissão, e um 429 (limite de 25/min) aparecia na
        // tela como "falta permissão".
        const falha = respostaDeFalhaDoRevenuecat(err, "as métricas do overview");
        return reply.code(falha.status).send(falha.corpo);
      }
    },
  );

  // ---- GET receita do período ---- (Story 42.14, D22)
  /**
   * A receita BRUTA do RevenueCat na janela do filtro de dias, pelo endpoint de
   * intervalo da API v2 (`/metrics/revenue`). Substitui o `revenue_last_28_days`
   * do overview nos cards que seguem o filtro (Resumo e Overview).
   *
   * A janela é a régua da etapa — N dias de calendário de SP terminando hoje —
   * passada como `start_date`/`end_date`. O RevenueCat conta esses DIAS em UTC
   * e o intervalo é inclusivo (documentação + sonda de 2026-10-16); a diferença
   * de até 3 h nas pontas é declarada no memorial do card, não escondida
   * (AC2d). A resposta ecoa a janela aplicada (AC10b).
   *
   * Falha nunca vira 200 com `null`: 429 (limite) ou 502, com a causa (PO-D4).
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/receita",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const apiKey = await getApiKey(params.data.projectId);
      if (!apiKey) return reply.code(409).send({ error: "RevenueCat não conectado neste projeto" });

      const { desde, ate } = diasDaJanelaEmSp(query.data.days);
      const janela = { days: query.data.days, desde, ate };

      const [cfg] = await fastify.db
        .select({ rcProjectId: revenuecatStageConfig.rcProjectId })
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);
      // Sem app selecionado: ausência legítima, como no overview.
      if (!cfg?.rcProjectId) return { configured: false, ...janela, valorUsd: null };

      try {
        const r = await getRevenuecatRevenue(apiKey, cfg.rcProjectId, { startDate: desde, endDate: ate });
        return {
          configured: true,
          ...janela,
          valorUsd: r.valor,
          moeda: r.moeda,
          tipoDeReceita: r.tipoDeReceita,
          // O que a API diz ter aplicado — para o memorial e a conferência (D19).
          intervaloDaApi: { inicio: r.startDate, fim: r.endDate },
        };
      } catch (err) {
        request.log.error(err, "Erro ao puxar a receita do período no RevenueCat");
        const falha = respostaDeFalhaDoRevenuecat(err, "a receita do período");
        return reply.code(falha.status).send(falha.corpo);
      }
    },
  );


  // ---- GET novos clientes do período ---- (Story 42.14, D22)
  /**
   * "Novos clientes" na janela do filtro, pelo chart `customers_new` do
   * RevenueCat ("new customers whose customer cohort date falls within the
   * period") — o total do intervalo (`summary.total`). Mesma régua, guarda e
   * tratamento de falha de `/receita`; ecoa a janela (AC10b).
   */
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/revenuecat/novos-clientes",
    async (request, reply) => {
      const params = stageParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const query = salesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });
      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      const apiKey = await getApiKey(params.data.projectId);
      if (!apiKey) return reply.code(409).send({ error: "RevenueCat não conectado neste projeto" });

      const { desde, ate } = diasDaJanelaEmSp(query.data.days);
      const janela = { days: query.data.days, desde, ate };

      const [cfg] = await fastify.db
        .select({ rcProjectId: revenuecatStageConfig.rcProjectId })
        .from(revenuecatStageConfig)
        .where(eq(revenuecatStageConfig.stageId, params.data.stageId))
        .limit(1);
      if (!cfg?.rcProjectId) return { configured: false, ...janela, valor: null };

      try {
        const r = await getRevenuecatChartTotal(apiKey, cfg.rcProjectId, "customers_new", { startDate: desde, endDate: ate });
        return { configured: true, ...janela, valor: r.total, medida: r.medida, diaIncompleto: r.diasIncompletos > 0 };
      } catch (err) {
        request.log.error(err, "Erro ao puxar os novos clientes do período no RevenueCat");
        const falha = respostaDeFalhaDoRevenuecat(err, "os novos clientes do período");
        return reply.code(falha.status).send(falha.corpo);
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
      const query = janelaOpcionalSchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });
      // Story 42.14 (AC2e) — a pendência PO-06 da 42.11: a etapa pertence a ESTE
      // funil e a ESTE projeto, como em `/sales`, `/jornada` e `/vendas-por-canal`.
      // Sem isto, quem tem acesso a um projeto lia os eventos de qualquer etapa.
      const stage = await getStage(params.data.projectId, params.data.funnelId, params.data.stageId);
      if (!stage) return reply.code(404).send({ error: "Etapa não encontrada" });

      // A composição mora em `utils/metricas-revenuecat.ts` — a mesma que a sonda
      // de conferência em produção roda.
      return metricasDerivadasDaEtapa((q) => fastify.db.execute(q), params.data.stageId, query.data.days);
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
