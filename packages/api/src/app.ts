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
import apiKeyAuthPlugin from "./middleware/api-key-auth.js";
import dbPlugin from "./db/client.js";

// Services
import mindRegistryPlugin from "./services/mind-registry.js";
import mindEnginePlugin from "./services/mind-engine.js";
import claudePlugin from "./services/claude.js";
import conversationServicePlugin from "./services/conversation.js";
import clickupServicePlugin from "./services/clickup.js";
import instagramServicePlugin from "./services/instagram.js";
import metaNamesSchedulerPlugin from "./plugins/meta-names-scheduler.js";
import metaPerfSchedulerPlugin from "./plugins/meta-perf-scheduler.js";

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
import apiKeysRoutes from "./routes/api-keys.js";
import publicDiscoveryRoutes from "./routes/public-discovery.js";
import publicMetaRoutes from "./routes/public-meta.js";
import publicLeadsRoutes from "./routes/public-leads.js";
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
import sellersBreakdownRoutes from "./routes/sellers-breakdown.js";
import sellerAliasesRoutes from "./routes/seller-aliases.js";
import manualSalesRoutes from "./routes/manual-sales.js";
import stageOperationalCostsRoutes from "./routes/stage-operational-costs.js";
import perpetualSpreadsheetsRoutes from "./routes/perpetual-spreadsheets.js";
import perpetualSalesDataRoutes from "./routes/perpetual-sales-data.js";
import perpetualUpsellSpreadsheetsRoutes from "./routes/perpetual-upsell-spreadsheets.js";
import perpetualUpsellDataRoutes from "./routes/perpetual-upsell-data.js";
import sprintDashboardRoutes from "./routes/sprint-dashboard.js";
import creativeRevenueRoutes from "./routes/creative-revenue.js";
import metaAdsComparisonRoutes from "./routes/meta-ads-comparison.js";
import leadScoringRoutes from "./routes/lead-scoring.js";
import organicPostsRoutes from "./routes/organic-posts.js";
import instagramReportsRoutes from "./routes/instagram-reports.js";
import funnelGroupsRoutes from "./routes/funnel-groups.js";
import funnelBatchTurnsRoutes from "./routes/funnel-batch-turns.js";
import zoomStageRoutes from "./routes/zoom-stage.js";
import stageCreativePerformanceRoutes from "./routes/stage-creative-performance.js";
import lpCampaignsRoutes from "./routes/lp-campaigns.js";
import mauticRoutes from "./routes/mautic.js";
import hotmartRoutes from "./routes/hotmart.js";
import kiwifyRoutes from "./routes/kiwify.js";
import memberkitRoutes from "./routes/memberkit.js";
import stageEventConfigRoutes from "./routes/stage-event-config.js";
import stageSalesPlanRoutes from "./routes/stage-sales-plan.js";
import ga4Routes from "./routes/ga4.js";
import npsRoutes from "./routes/nps.js";
import debriefingsRoutes from "./routes/debriefings.js";
import campaignLogRoutes from "./routes/campaign-log.js";
import eventPaymentAlertsRoutes from "./routes/event-payment-alerts.js";
import stageComercialRoutes from "./routes/stage-comercial.js";
import paymentAlertsSchedulerPlugin from "./plugins/payment-alerts-scheduler.js";

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

  // 4c. API Key auth para rotas públicas read-only /api/public/* (Story 36.2)
  //     Roda após authPlugin (que ignora /api/public/) e dbPlugin.
  await app.register(apiKeyAuthPlugin);

  // 5. Services
  await app.register(mindRegistryPlugin);
  await app.register(mindEnginePlugin);
  await app.register(claudePlugin);
  await app.register(conversationServicePlugin);
  await app.register(clickupServicePlugin);
  await app.register(instagramServicePlugin);

  // 5b. Schedulers (precisam de db) — backfill diário de nomes Meta (Story 18.37)
  await app.register(metaNamesSchedulerPlugin);
  // Refresh diário da performance Meta no cache (Story 36.4)
  await app.register(metaPerfSchedulerPlugin);
  await app.register(paymentAlertsSchedulerPlugin);

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
  await app.register(apiKeysRoutes);
  // API pública read-only (/api/public/*) — Story 36.3
  await app.register(publicDiscoveryRoutes);
  await app.register(publicMetaRoutes);
  await app.register(publicLeadsRoutes);
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
  await app.register(sellersBreakdownRoutes);
  await app.register(sellerAliasesRoutes);
  await app.register(manualSalesRoutes);
  await app.register(stageOperationalCostsRoutes);
  await app.register(perpetualSpreadsheetsRoutes);
  await app.register(perpetualSalesDataRoutes);
  await app.register(perpetualUpsellSpreadsheetsRoutes);
  await app.register(perpetualUpsellDataRoutes);
  await app.register(sprintDashboardRoutes);
  await app.register(creativeRevenueRoutes);
  await app.register(metaAdsComparisonRoutes);
  await app.register(leadScoringRoutes);
  await app.register(organicPostsRoutes);
  await app.register(instagramReportsRoutes);
  await app.register(funnelGroupsRoutes);
  await app.register(funnelBatchTurnsRoutes);
  await app.register(zoomStageRoutes);
  await app.register(stageCreativePerformanceRoutes);
  await app.register(lpCampaignsRoutes);
  await app.register(mauticRoutes);
  await app.register(hotmartRoutes);
  await app.register(kiwifyRoutes);
  await app.register(memberkitRoutes);
  await app.register(stageEventConfigRoutes);
  await app.register(stageSalesPlanRoutes);
  await app.register(ga4Routes);
  await app.register(npsRoutes);
  await app.register(debriefingsRoutes);
  await app.register(campaignLogRoutes);
  await app.register(eventPaymentAlertsRoutes);
  await app.register(stageComercialRoutes);

  return app;
}
