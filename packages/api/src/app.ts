import Fastify from "fastify";
import "./types/index.js";

// Plugins
import envPlugin from "./config/env.js";
import corsPlugin from "./middleware/cors.js";
import rateLimitPlugin from "./middleware/rate-limit.js";
import authPlugin from "./middleware/auth.js";
import dbPlugin from "./db/client.js";

// Routes
import healthRoutes from "./routes/health.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  // 1. Config (first — everything depends on env)
  await app.register(envPlugin);

  // 2. Infrastructure (CORS, rate-limit)
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);

  // 3. Auth middleware
  await app.register(authPlugin);

  // 4. Database
  await app.register(dbPlugin);

  // 5. Routes (last — consume services)
  await app.register(healthRoutes);

  return app;
}
