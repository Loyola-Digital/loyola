import type { FastifyInstance } from "fastify";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

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
        case "user.created":
        case "user.updated": {
          // AC 3, 4, 7: Upsert (idempotent)
          const email = data.email_addresses?.[0]?.email_address ?? "";
          const firstName = data.first_name ?? "";
          const lastName = data.last_name ?? "";
          const name =
            `${firstName} ${lastName}`.trim() || data.username || "Unknown";

          await fastify.db
            .insert(users)
            .values({
              clerkId: data.id,
              email,
              name,
              avatarUrl: data.image_url ?? null,
            })
            .onConflictDoUpdate({
              target: users.clerkId,
              set: {
                email,
                name,
                avatarUrl: data.image_url ?? null,
                updatedAt: new Date(),
              },
            });

          fastify.log.info({ clerkId: data.id, type }, "User synced");
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
}
