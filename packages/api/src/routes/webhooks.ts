import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { timingSafeEqual } from "node:crypto";
import { eq, and, like, ne, sql } from "drizzle-orm";
import {
  users,
  kiwifyConnections,
  kiwifyWebhookEvents,
  kiwifySubscriptions,
} from "../db/schema.js";
import {
  computeDedupKey,
  extractEventType,
  extractOrderId,
  normalizeKiwifySubscriptionEvent,
} from "../services/kiwify-subscriptions.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparação constant-time de tokens (false se tamanhos diferem — não lança). */
function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

interface ClerkWebhookPayload {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    image_url?: string | null;
  };
}

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Capture raw body before Fastify parses JSON
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body, done) => {
      done(null, body);
    }
  );

  fastify.post("/api/webhooks/clerk", async (request, reply) => {
    const webhookSecret = fastify.config.CLERK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      fastify.log.error("CLERK_WEBHOOK_SECRET not configured");
      return reply.code(400).send({ error: "Webhook secret not configured" });
    }

    // Verify signature (AC 2)
    const svixId = request.headers["svix-id"] as string;
    const svixTimestamp = request.headers["svix-timestamp"] as string;
    const svixSignature = request.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      fastify.log.warn("Missing svix headers");
      return reply.code(400).send({ error: "Missing webhook headers" });
    }

    let payload: ClerkWebhookPayload;

    try {
      const wh = new Webhook(webhookSecret);
      payload = wh.verify(request.body as string, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookPayload;
    } catch (err) {
      fastify.log.warn({ err }, "Webhook signature verification failed");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    const { type, data } = payload;

    try {
      switch (type) {
        case "user.created": {
          const email = data.email_addresses?.[0]?.email_address ?? "";
          const firstName = data.first_name ?? "";
          const lastName = data.last_name ?? "";
          const name = `${firstName} ${lastName}`.trim() || data.username || "Unknown";

          // Check if there's an invited stub user with this email
          const stubUser = await fastify.db
            .select({ id: users.id, clerkId: users.clerkId })
            .from(users)
            .where(and(eq(users.email, email), like(users.clerkId, "guest:%")))
            .limit(1);

          if (stubUser.length > 0) {
            // The auth middleware may have already auto-provisioned a placeholder
            // user with this clerkId — delete it first to avoid unique conflict
            await fastify.db
              .delete(users)
              .where(and(eq(users.clerkId, data.id), ne(users.id, stubUser[0].id)));

            // Merge: activate invited user with real Clerk ID
            await fastify.db
              .update(users)
              .set({ clerkId: data.id, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
              .where(eq(users.id, stubUser[0].id));
            fastify.log.info({ clerkId: data.id, email }, "Invited user activated");
          } else {
            // No stub found — check if auto-provisioned placeholder exists and fix its email
            const placeholderUser = await fastify.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.clerkId, data.id))
              .limit(1);

            if (placeholderUser.length > 0) {
              await fastify.db
                .update(users)
                .set({ email, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
                .where(eq(users.id, placeholderUser[0].id));
              fastify.log.info({ clerkId: data.id }, "Placeholder user email updated");
            } else {
              // Brand new user — starts as pending
              await fastify.db
                .insert(users)
                .values({ clerkId: data.id, email, name, avatarUrl: data.image_url ?? null, status: "pending" });
              fastify.log.info({ clerkId: data.id }, "New user provisioned as pending");
            }
          }
          break;
        }

        case "user.updated": {
          const email = data.email_addresses?.[0]?.email_address ?? "";
          const firstName = data.first_name ?? "";
          const lastName = data.last_name ?? "";
          const name = `${firstName} ${lastName}`.trim() || data.username || "Unknown";

          await fastify.db
            .update(users)
            .set({ email, name, avatarUrl: data.image_url ?? null, updatedAt: new Date() })
            .where(eq(users.clerkId, data.id));

          fastify.log.info({ clerkId: data.id }, "User profile updated");
          break;
        }

        case "user.deleted": {
          // AC 5: Delete (cascade handles FKs)
          await fastify.db
            .delete(users)
            .where(eq(users.clerkId, data.id));

          fastify.log.info({ clerkId: data.id }, "User deleted");
          break;
        }

        default:
          // AC 8: Ignore unknown events silently
          fastify.log.info({ type }, "Ignoring unknown webhook event");
      }
    } catch (err) {
      fastify.log.error({ err, type, clerkId: data.id }, "Webhook handler error");
    }

    // AC 8: Always return 200
    return reply.code(200).send({ success: true });
  });

  // ============================================================
  // Story 35.6 (Epic 35 fase 2) — Webhook de assinatura Kiwify.
  // URL única por projeto: POST /api/webhooks/kiwify/:projectId?token=<webhookToken>.
  // O expert cola essa URL no painel da Kiwify dele. Roteamento pelo projectId no
  // path; autenticação pela comparação constant-time do token (sem HMAC nesta fase).
  //
  // Estratégia: grava SEMPRE o evento bruto (idempotente via dedup_key = sha256 do
  // corpo) e, se o evento referir uma assinatura, faz upsert do estado normalizado.
  // Responde 200 em qualquer erro de processamento (não-2xx faz a Kiwify reenviar).
  //
  // SEGURANÇA: nunca logar o corpo (PII do customer) nem o token.
  // ============================================================
  fastify.post("/api/webhooks/kiwify/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const token = (request.query as { token?: string }).token ?? "";

    if (!UUID_RE.test(projectId)) {
      return reply.code(404).send({ error: "Not found" });
    }

    // Roteia + autentica: token secreto guardado na conexão Kiwify do projeto.
    const [conn] = await fastify.db
      .select({ webhookToken: kiwifyConnections.webhookToken })
      .from(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, projectId))
      .limit(1);

    if (!conn?.webhookToken) {
      // Projeto sem webhook configurado — não revela se o projeto existe.
      return reply.code(404).send({ error: "Not found" });
    }
    if (!token || !tokensMatch(token, conn.webhookToken)) {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const rawBody = typeof request.body === "string" ? request.body : "";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      fastify.log.warn({ projectId }, "Kiwify webhook: corpo não-JSON, ignorando");
      return reply.code(200).send({ ok: true });
    }

    try {
      const dedupKey = computeDedupKey(rawBody);
      const eventType = extractEventType(payload);
      const orderId = extractOrderId(payload);
      const norm = normalizeKiwifySubscriptionEvent(payload);

      // 1) Log bruto idempotente. Reenvio idêntico (mesmo corpo) colide e é no-op.
      const inserted = await fastify.db
        .insert(kiwifyWebhookEvents)
        .values({
          projectId,
          eventType,
          orderId,
          subscriptionId: norm?.subscriptionId ?? null,
          dedupKey,
          payload,
        })
        .onConflictDoNothing({
          target: [kiwifyWebhookEvents.projectId, kiwifyWebhookEvents.dedupKey],
        })
        .returning({ id: kiwifyWebhookEvents.id });

      if (inserted.length === 0) {
        return reply.code(200).send({ ok: true, duplicate: true });
      }

      // 2) Upsert do estado normalizado quando o evento referir uma assinatura.
      // "Último recebido vence" (lastEventAt = hora de recebimento). Campos de
      // identidade usam coalesce p/ não apagar valor já conhecido quando um evento
      // posterior vier sem ele. Limitação conhecida: entrega fora de ordem pode
      // sobrescrever um estado mais recente (raro; o log bruto permite reprocessar).
      if (norm) {
        const now = new Date();
        await fastify.db
          .insert(kiwifySubscriptions)
          .values({
            projectId,
            subscriptionId: norm.subscriptionId,
            productId: norm.productId,
            productName: norm.productName,
            planName: norm.planName,
            customerEmail: norm.customerEmail,
            customerName: norm.customerName,
            status: norm.status,
            orderId: norm.orderId,
            amount: norm.amount,
            currency: norm.currency,
            startedAt: norm.startedAt,
            nextChargeAt: norm.nextChargeAt,
            canceledAt: norm.canceledAt,
            lastEventType: norm.eventType,
            lastEventAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [kiwifySubscriptions.projectId, kiwifySubscriptions.subscriptionId],
            set: {
              status: norm.status,
              orderId: norm.orderId,
              amount: norm.amount,
              nextChargeAt: norm.nextChargeAt,
              canceledAt: norm.canceledAt,
              lastEventType: norm.eventType,
              lastEventAt: now,
              updatedAt: now,
              // Identidade: preserva o valor anterior se o novo vier nulo.
              productId: sql`coalesce(excluded.product_id, ${kiwifySubscriptions.productId})`,
              productName: sql`coalesce(excluded.product_name, ${kiwifySubscriptions.productName})`,
              planName: sql`coalesce(excluded.plan_name, ${kiwifySubscriptions.planName})`,
              customerEmail: sql`coalesce(excluded.customer_email, ${kiwifySubscriptions.customerEmail})`,
              customerName: sql`coalesce(excluded.customer_name, ${kiwifySubscriptions.customerName})`,
              currency: sql`coalesce(excluded.currency, ${kiwifySubscriptions.currency})`,
              startedAt: sql`coalesce(excluded.started_at, ${kiwifySubscriptions.startedAt})`,
            },
          });
      }
    } catch (err) {
      // Nunca propagar erro (não-2xx faz a Kiwify reenviar em loop). Só status.
      fastify.log.error({ err, projectId }, "Kiwify webhook handler error");
    }

    return reply.code(200).send({ ok: true });
  });
}
