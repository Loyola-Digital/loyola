import Fastify from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import "./types/index.js";

// Plugins
import envPlugin from "./config/env.js";
import corsPlugin from "./middleware/cors.js";
import rateLimitPlugin from "./middleware/rate-limit.js";
import multipart from "@fastify/multipart";
import authPlugin from "./middleware/auth.js";
import guestGuardPlugin from "./middleware/guest-guard.js";
import dbPlugin from "./db/client.js";

// Services
import mindRegistryPlugin from "./services/mind-registry.js";
import mindEnginePlugin from "./services/mind-engine.js";
import claudePlugin from "./services/claude.js";
import conversationServicePlugin from "./services/conversation.js";
import clickupServicePlugin from "./services/clickup.js";
import instagramServicePlugin from "./services/instagram.js";

// Routes
import healthRoutes from "./routes/health.js";
import webhookRoutes from "./routes/webhooks.js";
import mindsRoutes from "./routes/minds.js";
import chatRoutes from "./routes/chat.js";
import uploadRoutes from "./routes/upload.js";
import conversationRoutes from "./routes/conversations.js";
import taskRoutes from "./routes/tasks.js";
import instagramRoutes from "./routes/instagram.js";
import projectRoutes from "./routes/projects.js";
import invitationsRoutes from "./routes/invitations.js";
import adminRoutes from "./routes/admin.js";
import metaAdsRoutes from "./routes/meta-ads.js";
import trafficAnalyticsRoutes from "./routes/traffic-analytics.js";
import funnelRoutes from "./routes/funnels.js";
import googleAdsRoutes from "./routes/google-ads.js";
import googleAdsAnalyticsRoutes from "./routes/google-ads-analytics.js";
import youtubeChannelRoutes from "./routes/youtube-channels.js";
import googleSheetsRoutes from "./routes/google-sheets.js";
import salesRoutes from "./routes/sales.js";
import funnelSpreadsheetsRoutes from "./routes/funnel-spreadsheets.js";
import switchyRoutes from "./routes/switchy.js";
import funnelStageRoutes from "./routes/funnel-stages.js";
import stageSalesSpreadsheetsRoutes from "./routes/stage-sales-spreadsheets.js";
import stageSalesDataRoutes from "./routes/stage-sales-data.js";

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

  // 4b. Guest access guard (needs DB + userRole from auth)
  await app.register(guestGuardPlugin);

  // 5. Services
  await app.register(mindRegistryPlugin);
  await app.register(mindEnginePlugin);
  await app.register(claudePlugin);
  await app.register(conversationServicePlugin);
  await app.register(clickupServicePlugin);
  await app.register(instagramServicePlugin);

  // 6. Routes (last — consume services)
  await app.register(healthRoutes);
  await app.register(webhookRoutes);
  await app.register(mindsRoutes);
  await app.register(chatRoutes);
  await app.register(uploadRoutes);
  await app.register(conversationRoutes);
  await app.register(taskRoutes);
  await app.register(instagramRoutes);
  await app.register(projectRoutes);
  await app.register(invitationsRoutes);
  await app.register(adminRoutes);
  await app.register(metaAdsRoutes);
  await app.register(trafficAnalyticsRoutes);
  await app.register(funnelRoutes);
  await app.register(googleAdsRoutes);
  await app.register(googleAdsAnalyticsRoutes);
  await app.register(youtubeChannelRoutes);
  await app.register(googleSheetsRoutes);
  await app.register(salesRoutes);
  await app.register(funnelSpreadsheetsRoutes);
  await app.register(switchyRoutes);
  await app.register(funnelStageRoutes);
  await app.register(stageSalesSpreadsheetsRoutes);
  await app.register(stageSalesDataRoutes);

  return app;
}
