import Fastify from "fastify";
import "./types/index.js";

// Plugins
import envPlugin from "./config/env.js";
import corsPlugin from "./middleware/cors.js";
import rateLimitPlugin from "./middleware/rate-limit.js";
import authPlugin from "./middleware/auth.js";
import dbPlugin from "./db/client.js";

// Services
import mindRegistryPlugin from "./services/mind-registry.js";
import mindEnginePlugin from "./services/mind-engine.js";
import claudePlugin from "./services/claude.js";

// Routes
import healthRoutes from "./routes/health.js";
import webhookRoutes from "./routes/webhooks.js";
import mindsRoutes from "./routes/minds.js";
import chatRoutes from "./routes/chat.js";

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

  // 5. Services
  await app.register(mindRegistryPlugin);
  await app.register(mindEnginePlugin);
  await app.register(claudePlugin);

  // 6. Routes (last — consume services)
  await app.register(healthRoutes);
  await app.register(webhookRoutes);
  await app.register(mindsRoutes);
  await app.register(chatRoutes);

  return app;
}
