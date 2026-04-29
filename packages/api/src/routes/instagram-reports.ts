import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import fp from "fastify-plugin";
import {
  instagramMonthlyReports,
  instagramAccounts,
  instagramAccountProjects,
  projects,
  projectMembers,
  users,
} from "../db/schema.js";
import type {
  MonthlyReportData,
  AccountReport,
  PostSummary,
  AccountReportTotals,
  AccountReportDelta,
  AccountReportDeltaItem,
} from "@loyola-x/shared";

// ============================================================
// SCHEMAS
// ============================================================

const projectParamSchema = z.object({
  projectId: z.string().uuid(),
});

const reportParamSchema = z.object({
  projectId: z.string().uuid(),
  reportId: z.string().uuid(),
});

const generateBodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month deve estar no formato YYYY-MM"),
});

// ============================================================
// HELPERS
// ============================================================

const MONTH_LABELS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function monthLabelPt(month: string): string {
  const [y, m] = month.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_LABELS_PT[idx] ?? m} ${y}`;
}

function monthBoundaries(month: string): { since: number; until: number; periodStart: string; periodEnd: string } {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return {
    since: Math.floor(start.getTime() / 1000),
    until: Math.floor(end.getTime() / 1000),
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

function previousMonth(month: string): string {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function buildDeltaItem(current: number, previous: number): AccountReportDeltaItem {
  return { current, previous, deltaPct: deltaPct(current, previous) };
}

// Categoriza follows_and_unfollows breakdown — mesma lógica do overview-cards
interface FollowsBreakdown { gained: number; lost: number }

interface InsightEntryShape {
  name: string;
  values?: Array<{ value?: unknown; end_time?: string }>;
  total_value?: { value?: unknown; breakdowns?: Array<{ results?: Array<{ dimension_values?: string[]; value?: number }> }> };
}

function pickAccountFollows(entries: InsightEntryShape[]): FollowsBreakdown {
  const entry = entries.find((e) => e.name === "follows_and_unfollows");
  if (!entry) return { gained: 0, lost: 0 };
  const breakdowns = entry.total_value?.breakdowns;
  if (breakdowns && breakdowns.length > 0) {
    let gained = 0;
    let lost = 0;
    for (const r of breakdowns[0]?.results ?? []) {
      const dim = r.dimension_values?.[0];
      const val = typeof r.value === "number" ? r.value : 0;
      if (dim === "FOLLOWER") gained = val;
      else if (dim === "NON_FOLLOWER") lost = val;
    }
    return { gained, lost };
  }
  return { gained: 0, lost: 0 };
}

function pickAccountTotal(entries: InsightEntryShape[], name: string): number {
  const entry = entries.find((e) => e.name === name);
  if (!entry) return 0;
  if (entry.total_value && typeof entry.total_value.value === "number") {
    return entry.total_value.value;
  }
  if (entry.values && entry.values.length > 0) {
    let sum = 0;
    for (const v of entry.values) {
      if (typeof v.value === "number") sum += v.value;
    }
    return sum;
  }
  return 0;
}

function pickReachTimeSeries(entries: InsightEntryShape[]): Array<{ date: string; reach: number }> {
  const entry = entries.find((e) => e.name === "reach");
  if (!entry?.values) return [];
  return entry.values
    .map((v) => ({
      date: typeof v.end_time === "string" ? v.end_time.slice(0, 10) : "",
      reach: typeof v.value === "number" ? v.value : 0,
    }))
    .filter((d) => d.date);
}

function extractDemographicsCounts(
  entry: InsightEntryShape | undefined,
): Array<{ key: string; value: number }> {
  if (!entry) return [];
  const breakdowns = entry.total_value?.breakdowns;
  if (breakdowns && breakdowns.length > 0) {
    const out: Array<{ key: string; value: number }> = [];
    for (const r of breakdowns[0]?.results ?? []) {
      const key = r.dimension_values?.join(" ") ?? "";
      const val = typeof r.value === "number" ? r.value : 0;
      if (key) out.push({ key, value: val });
    }
    return out;
  }
  // Legacy format: values: [{ value: { key1: N, key2: N } }]
  const v = entry.values?.[0]?.value;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([key, value]) => ({ key, value: typeof value === "number" ? value : 0 }));
  }
  return [];
}

// ============================================================
// AGGREGATION LOGIC PER ACCOUNT
// ============================================================

interface MediaItem {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  reach?: number | null;
  saved?: number | null;
  engagement_rate?: number | null;
  follows?: number | null;
}

function buildPostSummary(post: MediaItem, mediaProductType: string | null): PostSummary {
  const captionTrunc = post.caption
    ? post.caption.length > 200
      ? post.caption.slice(0, 197) + "..."
      : post.caption
    : null;
  return {
    mediaId: post.id,
    mediaType: post.media_type,
    mediaProductType,
    timestamp: post.timestamp,
    thumbnailUrl: post.thumbnail_url ?? post.media_url ?? null,
    permalink: null,
    caption: captionTrunc,
    reach: post.reach ?? null,
    likes: post.like_count ?? 0,
    comments: post.comments_count ?? 0,
    saves: post.saved ?? null,
    engagementRate: post.engagement_rate ?? null,
    follows: post.follows ?? null,
  };
}

// ============================================================
// ROUTES
// ============================================================

export default fp(async function instagramReportsRoutes(fastify) {
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

  async function fetchProjectAccounts(projectId: string) {
    return await fastify.db
      .select({
        id: instagramAccounts.id,
        instagramUserId: instagramAccounts.instagramUserId,
        instagramUsername: instagramAccounts.instagramUsername,
        accountName: instagramAccounts.accountName,
        profilePictureUrl: instagramAccounts.profilePictureUrl,
        accessTokenEncrypted: instagramAccounts.accessTokenEncrypted,
        accessTokenIv: instagramAccounts.accessTokenIv,
      })
      .from(instagramAccounts)
      .innerJoin(
        instagramAccountProjects,
        eq(instagramAccountProjects.accountId, instagramAccounts.id),
      )
      .where(eq(instagramAccountProjects.projectId, projectId));
  }

  async function aggregateAccountReport(
    accountId: string,
    instagramUsername: string,
    accountName: string,
    profilePictureUrl: string | null,
    instagramUserId: string,
    accessToken: string,
    month: string,
  ): Promise<AccountReport> {
    const { since, until } = monthBoundaries(month);

    // 1. Listar mídia (com enrichment do service — reach, saved, engagement_rate)
    const mediaRes = await fastify.instagramService.getMediaList(accountId, 100);
    // Filtrar pelo período
    const periodPosts = mediaRes.data.filter((p) => {
      const t = Math.floor(new Date(p.timestamp).getTime() / 1000);
      return t >= since && t <= until;
    });

    // Pra cada post FEED, tentar enriquecer com follows (reusa cache)
    // Buscar media_product_type também — chamada extra simples
    const postsWithMediaProductType = await Promise.all(
      periodPosts.map(async (post) => {
        let mediaProductType: string | null = null;
        try {
          const url = `https://graph.instagram.com/v25.0/${post.id}?fields=media_product_type&access_token=${accessToken}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json() as { media_product_type?: string };
            mediaProductType = data.media_product_type ?? null;
          }
        } catch {
          /* ignora */
        }

        // Follows per-post: só pra FEED (Meta não suporta Reels)
        let follows: number | null = null;
        if (mediaProductType === "FEED") {
          try {
            const url = `https://graph.instagram.com/v25.0/${post.id}/insights?metric=follows&access_token=${accessToken}`;
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json() as {
                data?: Array<{ name: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
              };
              const entry = data.data?.find((e) => e.name === "follows");
              if (entry) {
                if (entry.values && entry.values.length > 0) {
                  let sum = 0;
                  let any = false;
                  for (const v of entry.values) {
                    if (typeof v.value === "number") {
                      sum += v.value;
                      any = true;
                    }
                  }
                  if (any) follows = sum;
                }
                if (follows == null && entry.total_value && typeof entry.total_value.value === "number") {
                  follows = entry.total_value.value;
                }
              }
            }
          } catch { /* ignora */ }
        }

        return { post, mediaProductType, follows };
      })
    );

    // Construir summaries
    const summaries: PostSummary[] = postsWithMediaProductType.map(({ post, mediaProductType, follows }) =>
      buildPostSummary({ ...post, follows }, mediaProductType)
    );

    // Distribuição de mídia
    let reelsCount = 0;
    let reelsReach = 0;
    let feedCount = 0;
    let feedReach = 0;
    for (const { post, mediaProductType } of postsWithMediaProductType) {
      const r = post.reach ?? 0;
      if (mediaProductType === "REELS") {
        reelsCount++;
        reelsReach += r;
      } else if (mediaProductType === "FEED") {
        feedCount++;
        feedReach += r;
      }
    }

    // Top/Bottom 5
    const byEngagement = [...summaries].filter((p) => p.engagementRate != null);
    byEngagement.sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
    const topByEngagement = byEngagement.slice(0, 5);
    const bottomByEngagement = byEngagement.slice(-5).reverse();

    const byReach = [...summaries].filter((p) => p.reach != null);
    byReach.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0));
    const topByReach = byReach.slice(0, 5);
    const bottomByReach = byReach.slice(-5).reverse();

    // Account insights (followers, reach time series, totals agregados)
    let accountInsights: InsightEntryShape[] = [];
    try {
      const raw = await fastify.instagramService.getAccountInsights(accountId, "day", since, until);
      accountInsights = raw as unknown as InsightEntryShape[];
    } catch { /* ignora */ }

    const followsBreak = pickAccountFollows(accountInsights);
    const reachTotal = pickAccountTotal(accountInsights, "reach");
    const viewsTotal = pickAccountTotal(accountInsights, "views");
    const interactionsTotal = pickAccountTotal(accountInsights, "total_interactions");
    const likesTotal = pickAccountTotal(accountInsights, "likes");
    const commentsTotal = pickAccountTotal(accountInsights, "comments");
    const savesTotal = pickAccountTotal(accountInsights, "saves");
    const sharesTotal = pickAccountTotal(accountInsights, "shares");

    // Reach time series → daily trend
    const reachByDay = pickReachTimeSeries(accountInsights);
    // FollowersDelta diário não vem facilmente; mantemos 0 se não disponível.
    // Em v2, capturar daily breakdown de follows_and_unfollows.
    const dailyTrend = reachByDay.map((d) => ({
      date: d.date,
      followersDelta: 0, // not available daily in current API shape
      reach: d.reach,
    }));

    // Profile pra followers endOfMonth
    let endOfMonth: number | null = null;
    try {
      const profile = await fastify.instagramService.getProfile(accountId);
      endOfMonth = profile.followers_count ?? null;
    } catch { /* ignora */ }

    const followers = {
      startOfMonth: endOfMonth != null ? endOfMonth - (followsBreak.gained - followsBreak.lost) : null,
      endOfMonth,
      gained: followsBreak.gained,
      lost: followsBreak.lost,
      net: followsBreak.gained - followsBreak.lost,
    };

    // Demografia
    let demographics: AccountReport["demographics"] = null;
    try {
      const demoRaw = await fastify.instagramService.getAudienceDemographics(accountId);
      const demoEntries = demoRaw as unknown as InsightEntryShape[];
      const ageEntry = demoEntries.find((e) => e.name === "audience_gender_age");
      const cityEntry = demoEntries.find((e) => e.name === "audience_city");
      const countryEntry = demoEntries.find((e) => e.name === "audience_country");

      const ageGender = ageEntry ? extractDemographicsCounts(ageEntry).slice(0, 12) : null;
      const cities = cityEntry
        ? extractDemographicsCounts(cityEntry)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .map((d) => ({ name: d.key, count: d.value }))
        : null;
      const countries = countryEntry
        ? extractDemographicsCounts(countryEntry)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5)
            .map((d) => ({ name: d.key, count: d.value }))
        : null;

      if (ageGender || cities || countries) {
        demographics = { ageGender, cities, countries };
      }
    } catch { /* ignora */ }

    const totals: AccountReportTotals = {
      postsPublished: periodPosts.length,
      reach: reachTotal,
      views: viewsTotal,
      interactions: interactionsTotal,
      likes: likesTotal,
      comments: commentsTotal,
      saves: savesTotal,
      shares: sharesTotal,
    };

    return {
      accountId,
      instagramUsername,
      accountName,
      profilePictureUrl,
      totals,
      followers,
      mediaDistribution: {
        reels: { count: reelsCount, reach: reelsReach },
        feed: { count: feedCount, reach: feedReach },
      },
      dailyTrend,
      topByEngagement,
      bottomByEngagement,
      topByReach,
      bottomByReach,
      demographics,
      comparison: null,
    };

    // unused vars guard
    void instagramUserId;
  }

  function buildComparison(current: AccountReport, previous: AccountReport): AccountReportDelta {
    return {
      followersNet: buildDeltaItem(current.followers.net, previous.followers.net),
      reach: buildDeltaItem(current.totals.reach, previous.totals.reach),
      views: buildDeltaItem(current.totals.views, previous.totals.views),
      interactions: buildDeltaItem(current.totals.interactions, previous.totals.interactions),
      postsPublished: buildDeltaItem(current.totals.postsPublished, previous.totals.postsPublished),
    };
  }

  // ============================================================
  // POST /api/projects/:projectId/reports/instagram/generate
  // ============================================================
  fastify.post(
    "/api/projects/:projectId/reports/instagram/generate",
    async (request, reply) => {
      const params = projectParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const body = generateBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Body inválido", details: body.error.flatten().fieldErrors });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const { month } = body.data;
      const accounts = await fetchProjectAccounts(params.data.projectId);

      // Procurar relatório do mês anterior pra comparativo
      const prevMonth = previousMonth(month);
      const [prevReport] = await fastify.db
        .select()
        .from(instagramMonthlyReports)
        .where(
          and(
            eq(instagramMonthlyReports.projectId, params.data.projectId),
            eq(instagramMonthlyReports.month, prevMonth),
          ),
        )
        .limit(1);
      const prevData = prevReport ? (prevReport.data as MonthlyReportData) : null;

      // Agregar cada conta — sequencial pra reduzir burst contra Graph
      const accountReports: AccountReport[] = [];
      for (const acc of accounts) {
        const accessToken = (await import("../services/encryption.js")).decrypt(
          acc.accessTokenEncrypted,
          acc.accessTokenIv,
        );
        const ar = await aggregateAccountReport(
          acc.id,
          acc.instagramUsername ?? acc.accountName,
          acc.accountName,
          acc.profilePictureUrl,
          acc.instagramUserId,
          accessToken,
          month,
        );
        // Comparison: encontra a mesma conta no prevReport
        if (prevData) {
          const prevAcc = prevData.accounts.find((p) => p.accountId === acc.id);
          if (prevAcc) ar.comparison = buildComparison(ar, prevAcc);
        }
        accountReports.push(ar);
      }

      const { periodStart, periodEnd } = monthBoundaries(month);
      const reportData: MonthlyReportData = {
        month,
        monthLabel: monthLabelPt(month),
        generatedAt: new Date().toISOString(),
        periodStart,
        periodEnd,
        accounts: accountReports,
        hasComparison: !!prevData,
      };

      // Upsert
      const [row] = await fastify.db
        .insert(instagramMonthlyReports)
        .values({
          projectId: params.data.projectId,
          month,
          data: reportData,
          generatedBy: request.userId,
        })
        .onConflictDoUpdate({
          target: [instagramMonthlyReports.projectId, instagramMonthlyReports.month],
          set: {
            data: reportData,
            generatedBy: request.userId,
            generatedAt: new Date(),
          },
        })
        .returning();

      return reply.code(201).send({
        id: row.id,
        projectId: row.projectId,
        month: row.month,
        data: row.data,
        generatedBy: row.generatedBy,
        generatedAt: row.generatedAt,
      });
    },
  );

  // ============================================================
  // GET /api/projects/:projectId/reports/instagram/:reportId
  // ============================================================
  fastify.get(
    "/api/projects/:projectId/reports/instagram/:reportId",
    async (request, reply) => {
      const params = reportParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const [row] = await fastify.db
        .select()
        .from(instagramMonthlyReports)
        .where(
          and(
            eq(instagramMonthlyReports.id, params.data.reportId),
            eq(instagramMonthlyReports.projectId, params.data.projectId),
          ),
        )
        .limit(1);

      if (!row) return reply.code(404).send({ error: "Relatório não encontrado" });

      return {
        id: row.id,
        projectId: row.projectId,
        month: row.month,
        data: row.data,
        generatedBy: row.generatedBy,
        generatedAt: row.generatedAt,
      };
    },
  );

  // ============================================================
  // GET /api/projects/:projectId/reports/instagram (lista)
  // ============================================================
  fastify.get(
    "/api/projects/:projectId/reports/instagram",
    async (request, reply) => {
      const params = projectParamSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "Parâmetros inválidos" });

      const project = await getProjectAccess(params.data.projectId, request.userId, request.userRole);
      if (!project) return reply.code(404).send({ error: "Projeto não encontrado" });

      const rows = await fastify.db
        .select({
          id: instagramMonthlyReports.id,
          month: instagramMonthlyReports.month,
          generatedAt: instagramMonthlyReports.generatedAt,
          generatedBy: instagramMonthlyReports.generatedBy,
          generatedByName: users.name,
        })
        .from(instagramMonthlyReports)
        .leftJoin(users, eq(users.id, instagramMonthlyReports.generatedBy))
        .where(eq(instagramMonthlyReports.projectId, params.data.projectId))
        .orderBy(desc(instagramMonthlyReports.generatedAt));

      return rows;
    },
  );
});
