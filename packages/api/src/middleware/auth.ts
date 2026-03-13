import { clerkPlugin, getAuth } from "@clerk/fastify";
import fp from "fastify-plugin";

export default fp(async function authPlugin(fastify) {
  await fastify.register(clerkPlugin, {
    secretKey: fastify.config.CLERK_SECRET_KEY,
    publishableKey: fastify.config.CLERK_PUBLISHABLE_KEY,
  });

  fastify.addHook("onRequest", async (request, reply) => {
    // Skip auth for health check and webhooks
    if (request.url === "/api/health") return;
    if (request.url.startsWith("/api/webhooks/")) return;

    const { userId } = getAuth(request);
    if (!userId) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    request.userId = userId;
  });
});
