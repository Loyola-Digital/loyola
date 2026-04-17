import { getAuth, clerkClient } from "@clerk/fastify";
import { eq } from "drizzle-orm";
import fp from "fastify-plugin";
import { users } from "../db/schema.js";

export default fp(async function authPlugin(fastify) {
  fastify.addHook("onRequest", async (request, reply) => {
    // Skip auth for health check, webhooks, CORS preflight, and public invitation endpoints
    if (request.method === "OPTIONS") return;
    if (request.url === "/api/health") return;
    if (request.url.startsWith("/api/webhooks/")) return;
    // Only invite info (GET) is public; the accept endpoint (POST) requires auth
    if (request.method === "GET" && request.url.startsWith("/api/invitations/")) return;

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
      // Fetch real user data from Clerk before provisioning
      let email = `${clerkId}@placeholder.dev`;
      let name = clerkId;
      let avatarUrl: string | null = null;
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress ?? email;
        const firstName = clerkUser.firstName ?? "";
        const lastName = clerkUser.lastName ?? "";
        name = `${firstName} ${lastName}`.trim() || clerkUser.username || name;
        avatarUrl = clerkUser.imageUrl ?? null;
      } catch {
        // Fallback to placeholder if Clerk API fails
      }

      // Auto-provision new user as pending (requires admin approval)
      const [newUser] = await fastify.db
        .insert(users)
        .values({
          clerkId,
          email,
          name,
          avatarUrl,
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

    // Guard: provisionamento pode falhar silenciosamente se outro usuário já
    // ocupa o email (constraint unique em users.email). onConflictDoNothing
    // mata o INSERT e o re-fetch por clerkId volta vazio. Sem esse check,
    // a linha abaixo explode com "Cannot read properties of undefined (reading 'id')"
    // e quebra TODAS as rotas autenticadas.
    if (dbUser.length === 0 || !dbUser[0]) {
      fastify.log.error(
        { clerkId, email: `${clerkId}@placeholder.dev` },
        "[auth] User provisioning failed — likely email conflict with existing user",
      );
      reply.code(500).send({
        error: "Falha no provisionamento de usuário. Contate o suporte.",
        code: "USER_PROVISION_FAILED",
      });
      return;
    }

    request.userId = dbUser[0].id;
    request.userRole = dbUser[0].role;

    // Auto-fix placeholder users on login (lazy sync with Clerk)
    const userEmail = await fastify.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, dbUser[0].id))
      .limit(1);

    if (userEmail[0]?.email?.endsWith("@placeholder.dev")) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        const realEmail = clerkUser.emailAddresses?.[0]?.emailAddress;
        if (realEmail) {
          const firstName = clerkUser.firstName ?? "";
          const lastName = clerkUser.lastName ?? "";
          const realName = `${firstName} ${lastName}`.trim() || clerkUser.username || clerkId;
          await fastify.db
            .update(users)
            .set({ email: realEmail, name: realName, avatarUrl: clerkUser.imageUrl ?? null, updatedAt: new Date() })
            .where(eq(users.id, dbUser[0].id));
        }
      } catch {
        // Non-critical — will retry next request
      }
    }

    // Allow /api/me regardless of status (so frontend can check status)
    if (request.url === "/api/me") return;

    // Allow pending users to accept invitations (the accept endpoint activates them)
    if (dbUser[0].status === "pending" && request.method === "POST" && request.url.match(/^\/api\/invitations\/[^/]+\/accept$/)) {
      return;
    }

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
