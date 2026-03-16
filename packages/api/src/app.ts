import Fastify from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import "./types/index.js";

// Plugins
import envPlugin from "./config/env.js";
import corsPlugin from "./middleware/cors.js";
import rateLimitPlugin from "./middleware/rate-limit.js";
import multipart from "@fastify/multipart";
import authPlugin from "./middleware/auth.js";
import dbPlugin from "./db/client.js";

// Services
import mindRegistryPlugin from "./services/mind-registry.js";
import mindEnginePlugin from "./services/mind-engine.js";
import claudePlugin from "./services/claude.js";
import conversationServicePlugin from "./services/conversation.js";
import clickupServicePlugin from "./services/clickup.js";

// Routes
import healthRoutes from "./routes/health.js";
import webhookRoutes from "./routes/webhooks.js";
import mindsRoutes from "./routes/minds.js";
import chatRoutes from "./routes/chat.js";
import uploadRoutes from "./routes/upload.js";
import conversationRoutes from "./routes/conversations.js";
import taskRoutes from "./routes/tasks.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  // 1. Config (first — everything depends on env)
  await app.register(envPlugin);

  // 2. Infrastructure (CORS, rate-limit, multipart)
  await app.register(corsPlugin);
  await app.register(rateLimitPlugin);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // 3. Auth — register clerkPlugin at root (onRequest so it runs before preHandler)
  await app.register(clerkPlugin, {
    secretKey: app.config.CLERK_SECRET_KEY,
    publishableKey: app.config.CLERK_PUBLISHABLE_KEY,
    hookName: "onRequest",
  });
  await app.register(authPlugin);

  // 4. Database
  await app.register(dbPlugin);

  // 5. Services
  await app.register(mindRegistryPlugin);
  await app.register(mindEnginePlugin);
  await app.register(claudePlugin);
  await app.register(conversationServicePlugin);
  await app.register(clickupServicePlugin);

  // 6. Routes (last — consume services)
  await app.register(healthRoutes);
  await app.register(webhookRoutes);
  await app.register(mindsRoutes);
  await app.register(chatRoutes);
  await app.register(uploadRoutes);
  await app.register(conversationRoutes);
  await app.register(taskRoutes);

  return app;
}
