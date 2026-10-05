import Fastify, { type FastifyError } from "fastify";
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
import metaActivitiesSchedulerPlugin from "./plugins/meta-activities-scheduler.js";

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
import pdiRoutes from "./routes/pdi.js";
import pessoalRoutes from "./routes/pessoal.js";
import projectSourceRulesRoutes from "./routes/project-source-rules.js";
import nomenclaturaRoutes from "./routes/nomenclatura.js";
import biCatalogoRoutes from "./routes/bi-catalogo.js";
import biDashboardsRoutes from "./routes/bi-dashboards.js";
import biQueryRoutes from "./routes/bi-query.js";
import apiKeysRoutes from "./routes/api-keys.js";
import publicDiscoveryRoutes from "./routes/public-discovery.js";
import publicMcpManifestRoutes from "./routes/public-mcp-manifest.js";
import publicMetaRoutes from "./routes/public-meta.js";
import publicCadeiaCacRoutes from "./routes/public-cadeia-cac.js";
import stageCadeiaCacRoutes from "./routes/stage-cadeia-cac.js";
import publicPanoramaRoutes from "./routes/public-panorama.js";
import publicPerpetualMetricsRoutes from "./routes/public-perpetual-metrics.js";
import projectPanoramaRoutes from "./routes/project-panorama.js";
import publicVslRoutes from "./routes/public-vsl.js";
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
import stageApplicationsRoutes from "./routes/stage-applications.js";
import stageSalesJourneyRoutes from "./routes/stage-sales-journey.js";
import switchyRoutes from "./routes/switchy.js";
import funnelStageRoutes from "./routes/funnel-stages.js";
import stageSalesSpreadsheetsRoutes from "./routes/stage-sales-spreadsheets.js";
import plannerRoutes from "./routes/planner.js";
import stageApplicationRoutes from "./routes/stage-application.js";
import stageSalesDataRoutes from "./routes/stage-sales-data.js";
import sellersBreakdownRoutes from "./routes/sellers-breakdown.js";
import sellerAliasesRoutes from "./routes/seller-aliases.js";
import manualSalesRoutes from "./routes/manual-sales.js";
import stageOperationalCostsRoutes from "./routes/stage-operational-costs.js";
import sprintReportsRoutes from "./routes/sprint-reports.js";
import launchReportConfigRoutes from "./routes/launch-report-config.js";
import perpetualReportConfigRoutes from "./routes/perpetual-report-config.js";
import debriefingConfigRoutes from "./routes/debriefing-config.js";
import debriefingGenerateRoutes from "./routes/debriefing-generate.js"; // Story 49.6
import perpetualReportRoutes from "./routes/perpetual-report.js";
import launchReportsRoutes, {
  comparativoRoutes,
} from "./routes/launch-reports.js";
import publicSalesRowsRoutes from "./routes/public-sales-rows.js";
import publicFunnelSalesRoutes from "./routes/public-funnel-sales.js";
import publicCrossLaunchRoutes from "./routes/public-cross-launch.js";
import perpetualSpreadsheetsRoutes from "./routes/perpetual-spreadsheets.js";
import perpetualSalesDataRoutes from "./routes/perpetual-sales-data.js";
import perpetualUpsellSpreadsheetsRoutes from "./routes/perpetual-upsell-spreadsheets.js";
import perpetualUpsellDataRoutes from "./routes/perpetual-upsell-data.js";
import sprintDashboardRoutes from "./routes/sprint-dashboard.js";
import creativeRevenueRoutes from "./routes/creative-revenue.js";
import metaAdsComparisonRoutes from "./routes/meta-ads-comparison.js";
import leadScoringRoutes from "./routes/lead-scoring.js";
import tallyRoutes from "./routes/tally.js";
import leadCapiRoutes from "./routes/lead-capi.js";
import leadCapiSchedulerPlugin from "./plugins/lead-capi-scheduler.js";
import organicPostsRoutes from "./routes/organic-posts.js";
import instagramReportsRoutes from "./routes/instagram-reports.js";
import funnelGroupsRoutes from "./routes/funnel-groups.js";
import funnelBatchTurnsRoutes from "./routes/funnel-batch-turns.js";
import zoomStageRoutes from "./routes/zoom-stage.js";
import stageCreativePerformanceRoutes from "./routes/stage-creative-performance.js";
import driveCreativesRoutes from "./routes/drive-creatives.js";
import lpCampaignsRoutes from "./routes/lp-campaigns.js";
import mauticRoutes from "./routes/mautic.js";
import sendflowRoutes from "./routes/sendflow.js";
import hotmartRoutes from "./routes/hotmart.js";
import kiwifyRoutes from "./routes/kiwify.js";
import memberkitRoutes from "./routes/memberkit.js";
import revenuecatRoutes from "./routes/revenuecat.js";
import fxRoutes from "./routes/fx.js";
import stageEventConfigRoutes from "./routes/stage-event-config.js";
import stageSalesPlanRoutes from "./routes/stage-sales-plan.js";
import ga4Routes from "./routes/ga4.js";
import funnelMapRoutes from "./routes/funnel-maps.js";
import plausibleRoutes from "./routes/plausible.js";
import abTestsRoutes from "./routes/ab-tests.js";
import vturbRoutes from "./routes/vturb.js";
import npsRoutes from "./routes/nps.js";
import debriefingsRoutes from "./routes/debriefings.js";
import campaignLogRoutes from "./routes/campaign-log.js";
import eventPaymentAlertsRoutes from "./routes/event-payment-alerts.js";
import stageComercialRoutes from "./routes/stage-comercial.js";
import instagramScansRoutes from "./routes/instagram-scans.js";
import swipeFilesRoutes from "./routes/swipe-files.js";
import planejamentoRoutes from "./routes/planejamento.js"; // Story 48.1
import paymentAlertsSchedulerPlugin from "./plugins/payment-alerts-scheduler.js";
import sendflowGroupsSchedulerPlugin from "./plugins/sendflow-groups-scheduler.js";
import revenuecatSnapshotSchedulerPlugin from "./plugins/revenuecat-snapshot-scheduler.js";
import plannerSyncSchedulerPlugin from "./plugins/planner-sync-scheduler.js";
import usoDoProdutoPlugin from "./plugins/uso-do-produto.js";
import plannerAnualRoutes from "./routes/planner-anual.js";
import publicPlannerAnualRoutes from "./routes/public-planner-anual.js";
import instaScanWorkerPlugin from "./plugins/insta-scan-worker.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  // Erro nao tratado nunca vaza SQL: o DrizzleQueryError traz "Failed query: <sql>"
  // na mensagem e os parametros (tokens cifrados, emails) em `cause.parameters`.
  // Loga o erro inteiro no servidor e devolve so o essencial ao cliente.
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status =
      erro.statusCode && erro.statusCode >= 400 ? erro.statusCode : 500;

    if (status >= 500) {
      request.log.error({ err: erro }, "erro nao tratado");
      return reply.code(status).send({ error: "Erro interno do servidor" });
    }

    return reply.code(status).send({ error: erro.message });
  });

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
  // O acumulador de uso é registrado ANTES do auth porque é o hook do auth que
  // alimenta ele — o decorator precisa existir quando aquele hook roda. Grava
  // no banco só pelo timer, que dispara bem depois do `dbPlugin`.
  await app.register(usoDoProdutoPlugin);
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
  // Log de Campanha automático a partir do histórico de alterações da Meta.
  await app.register(metaActivitiesSchedulerPlugin);
  await app.register(paymentAlertsSchedulerPlugin);
  // Grupos do SendFlow (substitui a exportação manual pra planilha).
  await app.register(sendflowGroupsSchedulerPlugin);
  // Story 42.10: um ponto por dia das métricas do RevenueCat. A API só devolve
  // o estado de agora — cada dia sem coletar é um ponto perdido para sempre.
  await app.register(revenuecatSnapshotSchedulerPlugin);
  // Planner <-> agenda do Google. Reenvia pendencias e importa o que mudou la.
  await app.register(plannerSyncSchedulerPlugin);
  // Spy de Conteúdo: consome a fila de scans do Instagram em background.
  await app.register(instaScanWorkerPlugin);

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
  await app.register(pdiRoutes);
  await app.register(pessoalRoutes);
  await app.register(projectSourceRulesRoutes);
  // Epic 47: dicionário da nomenclatura de campanhas (Story 47.1).
  await app.register(nomenclaturaRoutes);
  await app.register(biCatalogoRoutes);
  await app.register(biQueryRoutes);
  await app.register(biDashboardsRoutes);
  await app.register(apiKeysRoutes);
  // API pública read-only (/api/public/*) — Story 36.3
  await app.register(publicDiscoveryRoutes);
  await app.register(publicMcpManifestRoutes);
  await app.register(publicMetaRoutes);
  await app.register(publicCadeiaCacRoutes);
  await app.register(stageCadeiaCacRoutes);
  // Story 44.20 — o panorama do projeto. Duas rotas, uma função, como as irmãs acima.
  await app.register(publicPanoramaRoutes);
  await app.register(publicPerpetualMetricsRoutes);
  await app.register(projectPanoramaRoutes);
  await app.register(publicVslRoutes);
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
  await app.register(stageApplicationsRoutes);
  await app.register(stageSalesJourneyRoutes);
  await app.register(switchyRoutes);
  await app.register(funnelStageRoutes);
  await app.register(stageSalesSpreadsheetsRoutes);
  await app.register(plannerRoutes);
  // Calendario anual (esteiras x meses). Em teste; arquivo proprio.
  await app.register(plannerAnualRoutes);
  await app.register(publicPlannerAnualRoutes);
  await app.register(stageApplicationRoutes);
  await app.register(stageSalesDataRoutes);
  await app.register(sellersBreakdownRoutes);
  await app.register(sellerAliasesRoutes);
  await app.register(manualSalesRoutes);
  await app.register(stageOperationalCostsRoutes);
  await app.register(sprintReportsRoutes);
  await app.register(launchReportConfigRoutes);
  await app.register(perpetualReportConfigRoutes);
  // Story 49.1 — config + gate do gerador de debriefing (Epic 49).
  // Story 49.6 PERF-001: o GET da config memoiza por 60 s as perguntas lidas da planilha.
  await app.register(debriefingConfigRoutes, { cachePerguntasMs: 60_000 });
  await app.register(debriefingGenerateRoutes); // Story 49.6 — POST …/debriefing/generate
  await app.register(perpetualReportRoutes);
  await app.register(launchReportsRoutes);
  await app.register(comparativoRoutes);
  await app.register(publicSalesRowsRoutes);
  await app.register(publicFunnelSalesRoutes);
  await app.register(publicCrossLaunchRoutes);
  await app.register(perpetualSpreadsheetsRoutes);
  await app.register(perpetualSalesDataRoutes);
  await app.register(perpetualUpsellSpreadsheetsRoutes);
  await app.register(perpetualUpsellDataRoutes);
  await app.register(sprintDashboardRoutes);
  await app.register(creativeRevenueRoutes);
  await app.register(metaAdsComparisonRoutes);
  await app.register(leadScoringRoutes);
  await app.register(tallyRoutes);
  await app.register(leadCapiRoutes);
  await app.register(leadCapiSchedulerPlugin);
  await app.register(organicPostsRoutes);
  await app.register(instagramReportsRoutes);
  await app.register(funnelGroupsRoutes);
  await app.register(funnelBatchTurnsRoutes);
  await app.register(zoomStageRoutes);
  await app.register(stageCreativePerformanceRoutes);
  await app.register(driveCreativesRoutes);
  await app.register(lpCampaignsRoutes);
  await app.register(mauticRoutes);
  await app.register(sendflowRoutes);
  await app.register(hotmartRoutes);
  await app.register(kiwifyRoutes);
  await app.register(memberkitRoutes);
  await app.register(revenuecatRoutes);
  await app.register(fxRoutes);
  await app.register(stageEventConfigRoutes);
  await app.register(stageSalesPlanRoutes);
  await app.register(ga4Routes);
  await app.register(funnelMapRoutes);
  await app.register(plausibleRoutes);
  await app.register(abTestsRoutes);
  await app.register(vturbRoutes);
  await app.register(npsRoutes);
  await app.register(debriefingsRoutes);
  await app.register(campaignLogRoutes);
  await app.register(eventPaymentAlertsRoutes);
  await app.register(stageComercialRoutes);
  await app.register(instagramScansRoutes);
  await app.register(swipeFilesRoutes);
  await app.register(planejamentoRoutes); // Story 48.1 — Painel de Planejamento

  return app;
}
