import fp from "fastify-plugin";
import { sql } from "drizzle-orm";

export default fp(async function healthRoutes(fastify) {
  fastify.get("/api/health", async (_request, reply) => {
    try {
      await fastify.db.execute(sql`SELECT 1`);
      return {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch {
      reply.code(503);
      return {
        status: "error",
        db: "disconnected",
        timestamp: new Date().toISOString(),
      };
    }
  });
});
