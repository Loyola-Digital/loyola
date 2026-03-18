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
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (dbUser.length === 0) {
      // Auto-provision new user as pending (requires admin approval)
      const [newUser] = await fastify.db
        .insert(users)
        .values({
          clerkId,
          email: `${clerkId}@placeholder.dev`,
          name: clerkId,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning({ id: users.id, role: users.role, status: users.status });

      if (newUser) {
        dbUser = [newUser];
      } else {
        // Race condition — re-fetch
        dbUser = await fastify.db
          .select({ id: users.id, role: users.role, status: users.status })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
      }
    }

    request.userId = dbUser[0].id;
    request.userRole = dbUser[0].role;

    // Allow /api/me regardless of status (so frontend can check status)
    if (request.url === "/api/me") return;

    if (dbUser[0].status === "pending") {
      reply.code(403).send({ error: "Acesso pendente de aprovação.", code: "PENDING_APPROVAL" });
      return;
    }
    if (dbUser[0].status === "blocked") {
      reply.code(403).send({ error: "Acesso bloqueado.", code: "BLOCKED" });
      return;
    }
  });
});
