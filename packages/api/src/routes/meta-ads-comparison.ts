import { z } from "zod";
import { eq, and } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  projects,
  projectMembers,
  metaAdsAccounts,
} from "../db/schema.js";
import {
  fetchCampaignDailyInsights,
  fetchDailyInsights,
  decryptAccountToken,
  type MetaDailyInsight,
} from "../services/meta-ads.js";

// ============================================================
// SCHEMAS
// ============================================================

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  funnelId: z.string().uuid(),
  stageId: z.string().uuid(),
});

const querySchema = z.object({
  days: z.coerce.number().int().positive().default(30),
});

// ============================================================
// HELPERS
// ============================================================

interface DayAgg {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
}

function aggregateInsights(insights: MetaDailyInsight[]): DayAgg {
  return insights.reduce(
    (acc, item) => ({
      impressions: acc.impressions + (Number(item.impressions) || 0),
      clicks: acc.clicks + (Number(item.clicks) || 0),
      spend: acc.spend + (Number(item.spend) || 0),
      reach: acc.reach + (Number(item.reach) || 0),
    }),
    { impressions: 0, clicks: 0, spend: 0, reach: 0 }
  );
}

function aggregateByDate(allInsights: MetaDailyInsight[]): Map<string, DayAgg> {
  const dateMap = new Map<string, DayAgg>();
  for (const item of allInsights) {
    const key = item.date_start;
    const existing = dateMap.get(key) ?? { impressions: 0, clicks: 0, spend: 0, reach: 0 };
    existing.impressions += Number(item.impressions) || 0;
    existing.clicks += Number(item.clicks) || 0;
    existing.spend += Number(item.spend) || 0;
    existing.reach += Number(item.reach) || 0;
    dateMap.set(key, existing);
  }
  return dateMap;
}

// ============================================================
// ROUTE
// ============================================================

export default fp(async function metaAdsComparisonRoutes(fastify) {
  async function getProjectAccess(projectId: string, userId: string, userRole: string) {
    if (userRole === "guest") {
      const [member] = await fastify.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!member) return null;
    }
    const [project] = await fastify.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return project ?? null;
  }

  // GET /api/projects/:projectId/funnels/:funnelId/stages/:stageId/meta-ads-comparison
  fastify.get(
    "/api/projects/:projectId/funnels/:funnelId/stages/:stageId/meta-ads-comparison",
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const query = querySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: "Query inválida" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      // 1. Load current stage + funnel
      const [row] = await fastify.db
        .select({
          stageType: funnelStages.stageType,
          compareFunnelId: funnels.compareFunnelId,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(
          and(
            eq(funnelStages.id, params.data.stageId),
            eq(funnelStages.funnelId, params.data.funnelId),
            eq(funnels.projectId, params.data.projectId)
          )
        )
        .limit(1);

      if (!row) return reply.code(404).send({ error: "Etapa não encontrada" });

      if (!row.compareFunnelId) {
        return { semDados: true };
      }

      // 2. Load comparison funnel
      const [compareFunnel] = await fastify.db
        .select({
          id: funnels.id,
          name: funnels.name,
          metaAccountId: funnels.metaAccountId,
          campaigns: funnels.campaigns,
        })
        .from(funnels)
        .where(eq(funnels.id, row.compareFunnelId))
        .limit(1);

      if (!compareFunnel) return { semDados: true };

      // 3. Find matching stage in comparison funnel by stageType
      const [compareStage] = await fastify.db
        .select({
          id: funnelStages.id,
          name: funnelStages.name,
          campaigns: funnelStages.campaigns,
        })
        .from(funnelStages)
        .where(
          and(
            eq(funnelStages.funnelId, row.compareFunnelId),
            eq(funnelStages.stageType, row.stageType)
          )
        )
        .limit(1);

      if (!compareStage) {
        return {
          compareFunnelName: compareFunnel.name,
          compareStageName: "",
          days: [],
          totals: { impressions: 0, clicks: 0, spend: 0, reach: 0 },
          semDados: true,
          reason: "no_matching_stage",
        };
      }

      // 4. Resolve campaigns + meta account
      if (!compareFunnel.metaAccountId) {
        return {
          compareFunnelName: compareFunnel.name,
          compareStageName: compareStage.name,
          days: [],
          totals: { impressions: 0, clicks: 0, spend: 0, reach: 0 },
          semDados: true,
          reason: "no_meta_account",
        };
      }

      const [metaAccount] = await fastify.db
        .select({
          metaAccountId: metaAdsAccounts.metaAccountId,
          accessTokenEncrypted: metaAdsAccounts.accessTokenEncrypted,
          accessTokenIv: metaAdsAccounts.accessTokenIv,
        })
        .from(metaAdsAccounts)
        .where(eq(metaAdsAccounts.id, compareFunnel.metaAccountId))
        .limit(1);

      if (!metaAccount) {
        return { semDados: true };
      }

      const token = decryptAccountToken(metaAccount.accessTokenEncrypted, metaAccount.accessTokenIv);

      // Campaigns: stage campaigns take priority, then funnel campaigns
      const stageCampaigns = (compareStage.campaigns ?? []) as { id: string; name: string }[];
      const funnelCampaigns = (compareFunnel.campaigns ?? []) as { id: string; name: string }[];
      const campaigns = stageCampaigns.length > 0 ? stageCampaigns : funnelCampaigns;

      const { days } = query.data;

      // 5. Fetch Meta Ads data
      let allInsights: MetaDailyInsight[] = [];
      try {
        if (campaigns.length > 0) {
          const results = await Promise.all(
            campaigns.map((c) =>
              fetchCampaignDailyInsights(metaAccount.metaAccountId, token, c.id, days)
            )
          );
          allInsights = results.flat();
        } else {
          allInsights = await fetchDailyInsights(metaAccount.metaAccountId, token, days);
        }
      } catch {
        return { semDados: true };
      }

      if (allInsights.length === 0) {
        return {
          compareFunnelName: compareFunnel.name,
          compareStageName: compareStage.name,
          days: [],
          totals: { impressions: 0, clicks: 0, spend: 0, reach: 0 },
          semDados: true,
        };
      }

      // 6. Aggregate by date → sort ASC → index 1..N
      const dateMap = aggregateByDate(allInsights);
      const sortedEntries = Array.from(dateMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      const dayMetrics = sortedEntries.map(([, v], idx) => ({
        dayIndex: idx + 1,
        impressions: v.impressions,
        clicks: v.clicks,
        spend: v.spend,
        reach: v.reach,
        ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
        cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
      }));

      const totalsAgg = aggregateInsights(allInsights);

      return {
        compareFunnelName: compareFunnel.name,
        compareStageName: compareStage.name,
        days: dayMetrics,
        totals: totalsAgg,
        semDados: false,
      };
    }
  );
});
