import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import fp from "fastify-plugin";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async function dbPlugin(fastify) {
  const pool = new Pool({
    connectionString: fastify.config.DATABASE_URL,
    max: 20,
    ssl:
      fastify.config.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  const db = drizzle(pool, { schema });

  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
