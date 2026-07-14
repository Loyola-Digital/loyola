import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  funnelStages,
  funnels,
  projects,
  projectMembers,
  metaAdsAccounts,
  metaAdsAccountProjects,
  publicMetricsCache,
} from "../db/schema.js";
import { SALES_DAILY_SCOPE, type SalesDailyPayload } from "../services/sales-daily-sync.js";
import {
  fetchDailyInsights,
  decryptAccountToken,
  type MetaDailyInsight,
} from "../services/meta-ads.js";
import { fetchCampaignDailyInsightsForIdsWithCache } from "../services/meta-insights-cache.js";

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
  leads: number;
}

/** Leads do pixel: só o evento `lead` (mesma regra do public-meta — evita duplicação). */
function parseLeadAction(actions?: { action_type: string; value: string }[]): number {
  const lead = actions?.find((a) => a.action_type === "lead");
  return lead ? Number(lead.value) || 0 : 0;
}

function aggregateInsights(insights: MetaDailyInsight[]): Omit<DayAgg, "leads"> {
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
    const existing = dateMap.get(key) ?? { impressions: 0, clicks: 0, spend: 0, reach: 0, leads: 0 };
    existing.impressions += Number(item.impressions) || 0;
    existing.clicks += Number(item.clicks) || 0;
    existing.spend += Number(item.spend) || 0;
    existing.reach += Number(item.reach) || 0;
    existing.leads += parseLeadAction(item.actions);
    dateMap.set(key, existing);
  }
  return dateMap;
}

// ============================================================
// ROUTE
// ============================================================

export default fp(async function metaAdsComparisonRoutes(fastify) {
  /**
   * Faturamento/vendas por DATA de um funil inteiro: soma o byDay dos caches
   * sales-daily (public_metrics_cache) de TODAS as etapas do funil — mesmos
   * números do MCP (planilhas dedupadas + vendas manuais, reembolso fora).
   * Cache vazio → mapa vazio (o front mostra "—", não zero fake).
   */
  async function salesByDayForFunnel(
    funnelId: string,
  ): Promise<Record<string, { faturamento: number; vendas: number }>> {
    const stages = await fastify.db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, funnelId));
    if (stages.length === 0) return {};

    const rows = await fastify.db
      .select({ payload: publicMetricsCache.payload })
      .from(publicMetricsCache)
      .where(
        and(
          eq(publicMetricsCache.scope, SALES_DAILY_SCOPE),
          inArray(publicMetricsCache.key, stages.map((s) => s.id)),
        ),
      );

    const out: Record<string, { faturamento: number; vendas: number }> = {};
    for (const row of rows) {
      const payload = row.payload as SalesDailyPayload;
      for (const d of payload.byDay ?? []) {
        const e = out[d.date] ?? { faturamento: 0, vendas: 0 };
        e.faturamento += d.faturamentoBruto;
        e.vendas += d.ingressos.total;
        out[d.date] = e;
      }
    }
    return out;
  }

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

      // 4. Resolve a(s) conta(s) Meta candidatas + token.
      // Funis antigos não gravam metaAccountId no nível do funil (só campanhas no
      // stage) — a conta Meta é do PROJETO. Quando o funil aponta uma conta, usamos
      // ela; senão, TODAS as contas do projeto viram candidatas e no passo 5
      // escolhemos a que de fato tem as campanhas (filter por campaign.id numa conta
      // que não as possui devolve [] sem erro, então é seguro varrer). Sem isto,
      // comparar com lançamentos antigos retornava sempre "no_meta_account"; e pegar
      // só a primeira conta quebrava de forma intermitente em projetos multi-conta.
      const accountCandidates: Array<{ metaAccountId: string; accessToken: string }> = [];

      if (compareFunnel.metaAccountId) {
        const [metaAccount] = await fastify.db
          .select({
            metaAccountId: metaAdsAccounts.metaAccountId,
            accessTokenEncrypted: metaAdsAccounts.accessTokenEncrypted,
            accessTokenIv: metaAdsAccounts.accessTokenIv,
          })
          .from(metaAdsAccounts)
          .where(eq(metaAdsAccounts.id, compareFunnel.metaAccountId))
          .limit(1);
        if (metaAccount) {
          accountCandidates.push({
            metaAccountId: metaAccount.metaAccountId,
            accessToken: decryptAccountToken(metaAccount.accessTokenEncrypted, metaAccount.accessTokenIv),
          });
        }
      }

      if (accountCandidates.length === 0) {
        // Funil sem conta gravada → todas as contas Meta vinculadas ao PROJETO
        // viram candidatas. ORDER BY id pra ser determinístico (sem isso, a "primeira
        // conta" em projeto multi-conta era arbitrária e quebrava de forma
        // intermitente).
        const links = await fastify.db
          .select({ accountId: metaAdsAccountProjects.accountId })
          .from(metaAdsAccountProjects)
          .where(eq(metaAdsAccountProjects.projectId, params.data.projectId));
        if (links.length > 0) {
          const accts = await fastify.db
            .select({
              metaAccountId: metaAdsAccounts.metaAccountId,
              accessTokenEncrypted: metaAdsAccounts.accessTokenEncrypted,
              accessTokenIv: metaAdsAccounts.accessTokenIv,
            })
            .from(metaAdsAccounts)
            .where(inArray(metaAdsAccounts.id, links.map((l) => l.accountId)))
            .orderBy(metaAdsAccounts.id);
          for (const a of accts) {
            accountCandidates.push({
              metaAccountId: a.metaAccountId,
              accessToken: decryptAccountToken(a.accessTokenEncrypted, a.accessTokenIv),
            });
          }
        }
      }

      if (accountCandidates.length === 0) {
        return {
          compareFunnelName: compareFunnel.name,
          compareStageName: compareStage.name,
          days: [],
          totals: { impressions: 0, clicks: 0, spend: 0, reach: 0 },
          semDados: true,
          reason: "no_meta_account",
        };
      }

      // Campaigns: stage campaigns take priority, then funnel campaigns
      const stageCampaigns = (compareStage.campaigns ?? []) as { id: string; name: string }[];
      const funnelCampaigns = (compareFunnel.campaigns ?? []) as { id: string; name: string }[];
      const campaigns = stageCampaigns.length > 0 ? stageCampaigns : funnelCampaigns;
      const campaignIds = campaigns.map((c) => c.id);

      // A comparação alinha por DIA do lançamento (D1, D2...), NÃO por data — e o
      // lançamento comparado pode ser de meses ou do ANO PASSADO. Por isso ignoramos
      // os `days` recentes do dashboard e buscamos uma janela LARGA: pegamos todo o
      // histórico de atividade das campanhas do funil comparado e indexamos por dia
      // ativo (aggregateByDate -> sort ASC -> dayIndex 1..N abaixo).
      const COMPARISON_LOOKBACK_DAYS = 730; // ~2 anos (dentro do limite de histórico da Meta)

      // 5. Fetch Meta Ads data — DB-first cache (meta_campaign_insights_daily).
      // Varre as contas candidatas e fica com a primeira que retornar dados pras
      // campanhas (em projeto multi-conta a conta dona das campanhas pode não ser a
      // primeira; uma conta que não as possui devolve [] sem erro).
      let allInsights: MetaDailyInsight[] = [];
      try {
        for (const acct of accountCandidates) {
          const insights =
            campaignIds.length > 0
              ? await fetchCampaignDailyInsightsForIdsWithCache(
                  fastify.db,
                  params.data.projectId,
                  acct.metaAccountId,
                  acct.accessToken,
                  campaignIds,
                  COMPARISON_LOOKBACK_DAYS,
                )
              : await fetchDailyInsights(acct.metaAccountId, acct.accessToken, COMPARISON_LOOKBACK_DAYS);
          if (insights.length > 0) {
            allInsights = insights;
            break;
          }
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
          // Distingue do "no_meta_account": aqui há conta(s), mas nenhuma retornou
          // insights pras campanhas no lookback (campanhas sem entrega ou, em
          // multi-conta, campanhas que não pertencem a nenhuma conta vinculada).
          reason: "no_data",
        };
      }

      // 6. Aggregate by date → sort ASC → index 1..N
      const dateMap = aggregateByDate(allInsights);
      const sortedEntries = Array.from(dateMap.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );

      // Faturamento/vendas por data dos DOIS funis (cache sales-daily somado
      // por etapa). Comparado: casa pela data de cada dia ativo; atual: vai
      // cru na resposta e o front casa com o date_start do dailyData.
      const [compSales, atualSales] = await Promise.all([
        salesByDayForFunnel(row.compareFunnelId),
        salesByDayForFunnel(params.data.funnelId),
      ]);

      const dayMetrics = sortedEntries.map(([date, v], idx) => ({
        dayIndex: idx + 1,
        impressions: v.impressions,
        clicks: v.clicks,
        spend: v.spend,
        reach: v.reach,
        ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
        cpc: v.clicks > 0 ? v.spend / v.clicks : 0,
        leads: v.leads,
        cpl: v.leads > 0 ? v.spend / v.leads : null,
        faturamento: compSales[date]?.faturamento ?? 0,
        vendas: compSales[date]?.vendas ?? 0,
      }));

      const totalsAgg = aggregateInsights(allInsights);

      return {
        compareFunnelName: compareFunnel.name,
        compareStageName: compareStage.name,
        days: dayMetrics,
        totals: totalsAgg,
        atualSalesByDay: atualSales,
        semDados: false,
      };
    }
  );
});
