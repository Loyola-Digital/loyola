/**
 * Story 18.44: Endpoint para agregação de performance de LPs por Campaign
 * GET /api/funnels/:funnelId/stages/:stageId/lp-campaigns
 *
 * Busca Campaigns (Meta Ads) cujo campaign_name contém "lpa", "lpb", "lpc", etc.
 * Retorna: spend, link_clicks, impressions, landing_page_views, campaign_name
 * Frontend calcula: CPM, CPC, CTR, Connect Rate
 *
 * Combina com dados de leads da planilha (Story 18.43 pattern)
 */

import { z } from "zod";
import fp from "fastify-plugin";
import { fetchAllAdInsights } from "../services/meta-ads.js";
import { getMetaAccountForProject } from "../services/traffic-analytics.js";

const paramsSchema = z.object({
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

interface LPCampaignData {
  campaignName: string;
  lpName: string; // "LPA", "LPB", etc (extracted from campaignName)
  spend: number;
  linkClicks: number;
  impressions: number;
  lpViews: number; // landing_page_view from Meta Ads actions
}

interface LPCampaignsResponse {
  campaigns: LPCampaignData[];
  summary: {
    totalSpend: number;
    totalLinkClicks: number;
    totalImpressions: number;
    totalLpViews: number;
  };
}

function extractLPName(campaignName: string): string | null {
  const match = campaignName.match(/lp([a-z])/i);
  return match ? `LP${match[1].toUpperCase()}` : null;
}

function getActionValue(actions: any[] | undefined, actionType: string): number {
  if (!Array.isArray(actions)) return 0;
  const action = actions.find((a) => a.action_type === actionType);
  return action ? parseInt(action.value || "0", 10) : 0;
}

export default fp(async function lpCampaignsRoutes(fastify) {
  fastify.get<{
    Params: z.infer<typeof paramsSchema>;
    Querystring: z.infer<typeof querySchema>;
  }>(
    "/api/funnels/:funnelId/stages/:stageId/lp-campaigns",
    async (request, reply) => {
      const paramsResult = paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.code(400).send({
          error: "Parametros invalidos",
          details: paramsResult.error.flatten().fieldErrors,
        });
      }

      const queryResult = querySchema.safeParse(request.query);
      if (!queryResult.success) {
        return reply.code(400).send({
          error: "Query invalida",
          details: queryResult.error.flatten().fieldErrors,
        });
      }

      const { funnelId, stageId } = paramsResult.data;
      const { days } = queryResult.data;

      try {
        fastify.log.info(`[lp-campaigns] Fetching campaigns for funnelId=${funnelId}, stageId=${stageId}, days=${days}`);

        const metaAccount = await getMetaAccountForProject(funnelId);
        fastify.log.info(`[lp-campaigns] Meta account:`, metaAccount);

        if (!metaAccount) {
          return reply.code(400).send({
            error: "Meta Ads nao configurado para este projeto",
          });
        }

        // Fetch all ad insights (includes campaign_name)
        fastify.log.info(`[lp-campaigns] Fetching all ad insights...`);
        const allInsights = await fetchAllAdInsights(
          metaAccount.metaAccountId,
          metaAccount.accessToken,
          new Date(Date.now() - days * 24 * 60 * 60 * 1000),
          new Date(),
        );
        fastify.log.info(`[lp-campaigns] Got ${allInsights.length} insights`);

        // Filter campaigns that contain "lp[a-z]" in campaign_name
        const lpCampaigns: Map<string, LPCampaignData> = new Map();

        for (const insight of allInsights) {
          const campaignName = insight.campaign_name || "";
          const lpName = extractLPName(campaignName);

          if (!lpName) continue; // Skip campaigns that don't match lp[a-z]

          const key = campaignName; // Use campaign name as key
          const existing = lpCampaigns.get(key) || {
            campaignName,
            lpName,
            spend: 0,
            linkClicks: 0,
            impressions: 0,
            lpViews: 0,
          };

          // Aggregate metrics
          existing.spend += parseFloat(insight.spend || "0");
          existing.linkClicks += parseInt(insight.clicks || "0", 10);
          existing.impressions += parseInt(insight.impressions || "0", 10);
          existing.lpViews += getActionValue(insight.actions, "landing_page_view");

          lpCampaigns.set(key, existing);
        }

        // Calculate summary
        const campaigns = Array.from(lpCampaigns.values());
        const summary = {
          totalSpend: campaigns.reduce((sum, c) => sum + c.spend, 0),
          totalLinkClicks: campaigns.reduce((sum, c) => sum + c.linkClicks, 0),
          totalImpressions: campaigns.reduce(
            (sum, c) => sum + c.impressions,
            0,
          ),
          totalLpViews: campaigns.reduce((sum, c) => sum + c.lpViews, 0),
        };

        return reply.send({
          campaigns,
          summary,
        } as LPCampaignsResponse);
      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({
          error: "Erro ao buscar dados de LP campaigns",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
});
