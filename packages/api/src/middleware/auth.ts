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
    // Story 36.2: rotas públicas autenticam por X-API-Key (middleware próprio),
    // não pelo Clerk. Não exigir usuário Clerk aqui.
    if (request.url.startsWith("/api/public/")) return;
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
      let name = "";
      let avatarUrl: string | null = null;
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        email = clerkUser.emailAddresses?.[0]?.emailAddress ?? email;
        const firstName = clerkUser.firstName ?? "";
        const lastName = clerkUser.lastName ?? "";
        name = `${firstName} ${lastName}`.trim() || clerkUser.username || "";
        avatarUrl = clerkUser.imageUrl ?? null;
      } catch {
        // Fallback to placeholder if Clerk API fails
      }
      // Nunca usar o clerkId como nome exibível (vaza "user_xxx" na UI).
      // Fallback: parte local do email real > "Usuário".
      if (!name) {
        const emailPrefix = email.endsWith("@placeholder.dev")
          ? ""
          : email.split("@")[0];
        name = emailPrefix || "Usuário";
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

    // Auto-fix placeholder/corrupted users on login (lazy sync with Clerk).
    // Repara tanto email placeholder quanto name corrompido pelo fallback
    // antigo (name = clerkId, ex.: "user_3BPD..." vazando na UI) ou o
    // genérico "Usuário"/"Unknown" — assim que o Clerk tiver dados reais.
    // Também sincroniza avatar ausente (login Google tem foto no Clerk mas a
    // linha antiga ficou com avatarUrl null).
    const [current] = await fastify.db
      .select({ email: users.email, name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, dbUser[0].id))
      .limit(1);

    const corrupted =
      current &&
      (current.email.endsWith("@placeholder.dev") ||
        current.name === clerkId ||
        current.name.startsWith("user_") ||
        current.name === "Usuário" ||
        current.name === "Unknown" ||
        current.avatarUrl == null);

    if (current && corrupted) {
      try {
        const clerkUser = await clerkClient.users.getUser(clerkId);
        const realEmail =
          clerkUser.emailAddresses?.[0]?.emailAddress ?? current.email;
        const firstName = clerkUser.firstName ?? "";
        const lastName = clerkUser.lastName ?? "";
        const emailPrefix = realEmail.endsWith("@placeholder.dev")
          ? ""
          : realEmail.split("@")[0];
        const realName =
          `${firstName} ${lastName}`.trim() ||
          clerkUser.username ||
          emailPrefix ||
          current.name;
        const realAvatar = clerkUser.imageUrl ?? current.avatarUrl;
        if (
          realName !== current.name ||
          realEmail !== current.email ||
          realAvatar !== current.avatarUrl
        ) {
          try {
            await fastify.db
              .update(users)
              .set({
                email: realEmail,
                name: realName,
                avatarUrl: realAvatar,
                updatedAt: new Date(),
              })
              .where(eq(users.id, dbUser[0].id));
          } catch {
            // Email real pode COLIDIR com outra linha (unique em users.email —
            // conta duplicada). Sem este fallback o update inteiro morria e o
            // usuário ficava "Usuário"/sem avatar pra sempre. Atualiza o que dá.
            await fastify.db
              .update(users)
              .set({ name: realName, avatarUrl: realAvatar, updatedAt: new Date() })
              .where(eq(users.id, dbUser[0].id));
          }
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
