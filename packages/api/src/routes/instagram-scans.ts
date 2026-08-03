/**
 * Spy de Conteúdo — rotas da área Global.
 *
 * `POST /scans` só ENFILEIRA e devolve na hora; o worker executa em background
 * (~5min por scan). O front faz polling do status — a pessoa não fica presa na
 * página. Guest não entra (é ferramenta interna).
 */

import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import fp from "fastify-plugin";
import { instagramScans, users } from "../db/schema.js";
import { normalizeUsername } from "../services/insta-scanner/index.js";

const DEFAULT_DAILY_LIMIT = 15;
/** Reaproveita scan recente do mesmo perfil em vez de refazer (custo real). */
const REUSE_WINDOW_HOURS = 12;

const createSchema = z.object({
  username: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(10).max(300).optional(),
  since: z.string().trim().max(20).optional(),
  tzOffset: z.coerce.number().int().min(-12).max(14).optional(),
  /** Ignora o scan recente e força um novo (gasta crédito de novo). */
  force: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/** Lista sem os blobs pesados — a listagem não precisa de metrics/analysis. */
const listColumns = {
  id: instagramScans.id,
  username: instagramScans.username,
  status: instagramScans.status,
  params: instagramScans.params,
  profile: instagramScans.profile,
  usage: instagramScans.usage,
  error: instagramScans.error,
  requestedBy: instagramScans.requestedBy,
  requestedByName: users.name,
  startedAt: instagramScans.startedAt,
  finishedAt: instagramScans.finishedAt,
  createdAt: instagramScans.createdAt,
};

export default fp(async function instagramScansRoutes(fastify) {
  const base = "/api/instagram-scans";

  // ---- GET / — lista os scans (mais recentes primeiro) ----
  fastify.get(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });

    const rows = await fastify.db
      .select(listColumns)
      .from(instagramScans)
      .leftJoin(users, eq(users.id, instagramScans.requestedBy))
      .orderBy(desc(instagramScans.createdAt))
      .limit(100);

    return { scans: rows };
  });

  // ---- GET /:id — scan completo (com metrics + analysis) ----
  fastify.get(`${base}/:id`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido" });

    const [scan] = await fastify.db
      .select({
        ...listColumns,
        metrics: instagramScans.metrics,
        analysis: instagramScans.analysis,
      })
      .from(instagramScans)
      .leftJoin(users, eq(users.id, instagramScans.requestedBy))
      .where(eq(instagramScans.id, params.data.id))
      .limit(1);

    if (!scan) return reply.code(404).send({ error: "Scan não encontrado" });
    return scan;
  });

  // ---- POST / — enfileira um scan ----
  fastify.post(base, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dados inválidos" });

    if (!fastify.config.APIFY_TOKEN) {
      return reply.code(503).send({
        error: "Coleta indisponível: APIFY_TOKEN não configurado no servidor.",
        code: "APIFY_NOT_CONFIGURED",
      });
    }

    let username: string;
    try {
      username = normalizeUsername(body.data.username);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Usuário inválido" });
    }

    // Trava de custo: cada scan são 2 runs Apify + ~70k tokens.
    const dailyLimit = fastify.config.INSTA_SCAN_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ n: usedToday } = { n: 0 }] = await fastify.db
      .select({ n: sql<number>`count(*)::int` })
      .from(instagramScans)
      .where(
        and(eq(instagramScans.requestedBy, request.userId), gte(instagramScans.createdAt, since24h)),
      );
    if (usedToday >= dailyLimit) {
      return reply.code(429).send({
        error: `Limite de ${dailyLimit} scans por dia atingido. Cada scan consome crédito de coleta e de análise.`,
        code: "DAILY_LIMIT",
      });
    }

    // Reaproveita scan recente do mesmo perfil — refazer em 12h raramente traz
    // dado novo e gasta de novo. `force: true` pula isto.
    if (!body.data.force) {
      const reuseSince = new Date(Date.now() - REUSE_WINDOW_HOURS * 60 * 60 * 1000);
      const [recent] = await fastify.db
        .select({ id: instagramScans.id, status: instagramScans.status })
        .from(instagramScans)
        .where(
          and(eq(instagramScans.username, username), gte(instagramScans.createdAt, reuseSince)),
        )
        .orderBy(desc(instagramScans.createdAt))
        .limit(1);
      if (recent && recent.status !== "failed") {
        return reply.code(200).send({
          id: recent.id,
          username,
          reused: true,
          message: `Já existe um scan de @${username} das últimas ${REUSE_WINDOW_HOURS}h. Abra-o, ou use "forçar novo" pra coletar de novo.`,
        });
      }
    }

    const [created] = await fastify.db
      .insert(instagramScans)
      .values({
        username,
        status: "queued",
        params: {
          limit: body.data.limit ?? 120,
          since: body.data.since || null,
          tzOffset: body.data.tzOffset ?? -3,
        },
        requestedBy: request.userId,
      })
      .returning({ id: instagramScans.id, username: instagramScans.username });

    // Posição na fila — o front usa pra dar noção de espera.
    const [{ n: ahead } = { n: 0 }] = await fastify.db
      .select({ n: sql<number>`count(*)::int` })
      .from(instagramScans)
      .where(
        and(
          sql`${instagramScans.status} IN ('queued','running')`,
          sql`${instagramScans.createdAt} < (SELECT created_at FROM ${instagramScans} WHERE id = ${created.id})`,
        ),
      );

    return reply.code(201).send({ ...created, reused: false, queuePosition: ahead });
  });

  // ---- DELETE /:id ----
  fastify.delete(`${base}/:id`, async (request, reply) => {
    if (request.userRole === "guest") return reply.code(403).send({ error: "Acesso negado" });
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID inválido" });

    const deleted = await fastify.db
      .delete(instagramScans)
      .where(eq(instagramScans.id, params.data.id))
      .returning({ id: instagramScans.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "Scan não encontrado" });
    return { ok: true };
  });
});
