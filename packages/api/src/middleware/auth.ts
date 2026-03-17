import { getAuth } from "@clerk/fastify";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { users } from "../db/schema.js";

export default fp(async function authPlugin(fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    // Skip auth for health check, webhooks, CORS preflight, and public invitation endpoints
    if (request.method === "OPTIONS") return;
    if (request.url === "/api/health") return;
    if (request.url.startsWith("/api/webhooks/")) return;
    if (request.url.startsWith("/api/invitations/")) return;

    const auth = getAuth(request);
    if (!auth.userId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    // Resolve Clerk ID → internal UUID (auto-provision if missing)
    const clerkId = auth.userId;
    let dbUser = await fastify.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (dbUser.length === 0) {
      // Auto-provision user on first request
      const [newUser] = await fastify.db
        .insert(users)
        .values({
          clerkId,
          email: `${clerkId}@placeholder.dev`,
          name: clerkId,
        })
        .onConflictDoNothing()
        .returning({ id: users.id, role: users.role });

      if (newUser) {
        dbUser = [newUser];
      } else {
        // Race condition — re-fetch
        dbUser = await fastify.db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
      }
    }

    request.userId = dbUser[0].id;
    request.userRole = dbUser[0].role;
  });
});
