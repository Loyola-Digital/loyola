import fp from "fastify-plugin";
import { eq, and, gt } from "drizzle-orm";
import { instagramAccounts, instagramMetricsCache } from "../db/schema.js";
import {
  lerMetricas,
  ordemDeBusca,
  precisaBuscarInsights,
  salvarMetricas,
  type LinhaParaGravar,
} from "./instagram-post-metrics.js";
import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GRAPH_API_VERSION = "v25.0";
const GRAPH_API_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`;
const RATE_LIMIT_MAX = 200;
/**
 * Quantos posts podem ter os insights buscados numa mesma leitura da lista.
 *
 * A Meta dá 200 chamadas por hora por conta e os insights vêm de um em um.
 * Sem teto, uma lista de 100 posts consumia metade da cota de uma vez — e foi
 * o que derrubou a tela com 429. O que não couber fica para a próxima leitura
 * (ou para o backfill), servido do banco enquanto isso.
 */
const ORCAMENTO_DE_INSIGHTS = 30;
/** Chamadas simultâneas à Meta. Baixo de propósito: rajada é o que ela pune. */
const INSIGHTS_EM_PARALELO = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Cache TTL in minutes per metric type */
const CACHE_TTL: Record<string, number> = {
  profile: 5,
  post_insights: 15,
  account_insights: 30,
  demographics: 60,
  stories: 5,
  reels: 15,
};

// ============================================================
// TYPES
// ============================================================

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  /** O link público do post — a tabela mensal usa para abrir o melhor do mês. */
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  // Enriched via insights (best-effort — null if API didn't return)
  reach?: number | null;
  saved?: number | null;
  engagement_rate?: number | null;
  // Qualidade de vídeo (reels): plays (v25 "views"), shares e tempo médio
  // assistido (ig_reels_avg_watch_time, ms). null p/ imagem ou sem dado.
  views?: number | null;
  shares?: number | null;
  avg_watch_time_ms?: number | null;
  /** FEED | REELS | STORY — `media_type` VIDEO não separa Reels de vídeo no feed. */
  media_product_type?: string;
  /**
   * Seguidores que o post trouxe. A Meta só entrega para FEED (foto e
   * carrossel); em Reels vem do que o time digita (`follows_fonte`).
   */
  follows?: number | null;
  /** De onde veio o número acima. `manual` = digitado do painel do Instagram. */
  follows_fonte?: "meta" | "manual" | null;
  /**
   * `reels_skip_rate`: % das visualizações do Reels que pularam nos 3
   * primeiros segundos. 100 − isto é a retenção do gancho. Só Reels.
   */
  skip_rate?: number | null;
}

interface MediaListResponse {
  data: InstagramMedia[];
  paging?: { cursors?: { after?: string }; next?: string };
}

interface InsightValue {
  value: number | Record<string, unknown>;
  end_time?: string;
}

interface InsightEntry {
  name: string;
  period: string;
  values: InsightValue[];
  /**
   * `breakdowns` aparece quando a métrica é pedida com `breakdown=` — é onde
   * vem a separação de novos seguidores e unfollows, por exemplo. Sem declarar
   * aqui, o dado chega e o TypeScript não deixa ninguém lê-lo.
   */
  total_value?: {
    value?: number | Record<string, unknown>;
    breakdowns?: {
      dimension_keys?: string[];
      results?: { dimension_values: string[]; value: number }[];
    }[];
  };
  title: string;
  description: string;
  id: string;
}

interface InsightsResponse {
  data: InsightEntry[];
}

// v21.0 demographics format (follower_demographics with breakdown)
interface DemographicsResult {
  dimension_values: string[];
  value: number;
}
interface DemographicsBreakdown {
  dimension_keys: string[];
  results: DemographicsResult[];
}
interface DemographicsEntry {
  name: string;
  period: string;
  title: string;
  id: string;
  total_value: { breakdowns: DemographicsBreakdown[] };
}
interface DemographicsResponse {
  data: DemographicsEntry[];
}

function transformDemographicsBreakdown(
  resp: DemographicsResponse,
  legacyName: string,
): InsightEntry | null {
  const entry = resp.data?.[0];
  if (!entry?.total_value?.breakdowns?.length) return null;
  const breakdown = entry.total_value.breakdowns[0];
  const valueMap: Record<string, number> = {};
  for (const r of breakdown.results) {
    valueMap[r.dimension_values.join(" ")] = r.value;
  }
  return {
    name: legacyName,
    period: "lifetime",
    values: [{ value: valueMap }],
    title: legacyName,
    description: "",
    id: entry.id ?? legacyName,
  };
}

interface StoryMedia {
  id: string;
  media_type: string;
  media_url?: string;
  timestamp: string;
}

interface StoriesResponse {
  data: StoryMedia[];
}

/** Post cru (sem enrichment de insights) — pro auto-log do Log de Campanha. */
export interface InstagramMediaBasic {
  id: string;
  caption?: string;
  media_type: string;
  permalink?: string;
  timestamp: string;
}

interface InstagramService {
  validateToken(accessToken: string): Promise<{ id: string; name: string; username: string; profile_picture_url?: string }>;
  getProfile(accountId: string): Promise<InstagramProfile>;
  getMediaList(accountId: string, limit?: number, after?: string): Promise<{ data: InstagramMedia[]; nextCursor?: string }>;
  /** Lista leve (1 chamada, sem insights) — Story 38.2b (auto-log de posts). */
  getMediaListBasic(accountId: string, limit?: number): Promise<InstagramMediaBasic[]>;
  getMediaInsights(mediaId: string, accountId: string, mediaType?: string): Promise<InsightEntry[]>;
  getAccountInsights(accountId: string, period: string, since: number, until: number, somente?: string[]): Promise<InsightEntry[]>;
  getAudienceDemographics(accountId: string): Promise<InsightEntry[]>;
  getStories(accountId: string): Promise<Array<StoryMedia & { insights?: InsightEntry[] }>>;
  getReels(accountId: string): Promise<{ data: InstagramMedia[]; nextCursor?: string }>;
  invalidateCache(accountId: string, metricType?: string): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    instagramService: InstagramService;
  }
}

// ============================================================
// RATE LIMITER (in-memory)
// ============================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(tokenHash: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(tokenHash);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(tokenHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    throw new InstagramApiError(
      `Rate limit atingido, tente novamente em ${minutesLeft} minutos`,
      429,
    );
  }

  entry.count++;
  if (entry.count > 180) {
    // Warning zone — logged by caller
  }
}

function hashToken(token: string): string {
  return token.slice(0, 8) + "..." + token.slice(-4);
}

// ============================================================
// ERROR HANDLING
// ============================================================

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public graphCode?: number,
    public graphSubcode?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

function mapGraphError(err: GraphApiError["error"]): InstagramApiError {
  // Token expired or invalid
  if (err.code === 190) {
    return new InstagramApiError(
      "Token de acesso expirado ou inválido. Renove o token no Meta Business Manager.",
      401,
      err.code,
      err.error_subcode,
    );
  }

  // Permission error
  if (err.code === 10 || err.type === "OAuthException") {
    return new InstagramApiError(
      `Erro de permissão: ${err.message}`,
      403,
      err.code,
      err.error_subcode,
    );
  }

  // Rate limit from Meta side
  if (err.code === 4 || err.code === 32) {
    return new InstagramApiError(
      "Rate limit da Meta atingido. Aguarde alguns minutos.",
      429,
      err.code,
    );
  }

  // Generic
  return new InstagramApiError(
    `Instagram API error: ${err.message}`,
    500,
    err.code,
    err.error_subcode,
  );
}

// ============================================================
// GRAPH FETCH HELPER
// ============================================================

async function graphFetch<T>(path: string, token: string): Promise<T> {
  const tokenHash = hashToken(token);
  checkRateLimit(tokenHash);

  const separator = path.includes("?") ? "&" : "?";
  const url = `${GRAPH_API_BASE}${path}${separator}access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    const apiError = data as GraphApiError;
    if (apiError.error) {
      throw mapGraphError(apiError.error);
    }
    throw new InstagramApiError(
      `Instagram API error (${response.status})`,
      response.status,
    );
  }

  return data as T;
}

// ============================================================
// PLUGIN
// ============================================================

export default fp(async function instagramServicePlugin(fastify) {
  // ---- Cache helpers ----

  async function getCachedMetric(
    accountId: string,
    metricType: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<unknown | null> {
    const now = new Date();
    const conditions = [
      eq(instagramMetricsCache.accountId, accountId),
      eq(instagramMetricsCache.metricType, metricType),
      gt(instagramMetricsCache.expiresAt, now),
    ];

    if (periodStart) {
      conditions.push(eq(instagramMetricsCache.periodStart, periodStart));
    }
    if (periodEnd) {
      conditions.push(eq(instagramMetricsCache.periodEnd, periodEnd));
    }

    const rows = await fastify.db
      .select({ metricData: instagramMetricsCache.metricData })
      .from(instagramMetricsCache)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0 ? rows[0].metricData : null;
  }

  async function setCachedMetric(
    accountId: string,
    metricType: string,
    data: unknown,
    ttlMinutes: number,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000);

    await fastify.db
      .insert(instagramMetricsCache)
      .values({
        accountId,
        metricType,
        metricData: data,
        periodStart: periodStart ?? null,
        periodEnd: periodEnd ?? null,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          instagramMetricsCache.accountId,
          instagramMetricsCache.metricType,
          instagramMetricsCache.periodStart,
          instagramMetricsCache.periodEnd,
        ],
        set: {
          metricData: data,
          fetchedAt: new Date(),
          expiresAt,
        },
      });
  }

  async function invalidateCache(
    accountId: string,
    metricType?: string,
  ): Promise<void> {
    const conditions = [eq(instagramMetricsCache.accountId, accountId)];
    if (metricType) {
      conditions.push(eq(instagramMetricsCache.metricType, metricType));
    }
    await fastify.db
      .delete(instagramMetricsCache)
      .where(and(...conditions));
  }

  // ---- Token decryption helper ----

  async function getDecryptedToken(accountId: string): Promise<{ token: string; igUserId: string }> {
    const rows = await fastify.db
      .select({
        accessTokenEncrypted: instagramAccounts.accessTokenEncrypted,
        accessTokenIv: instagramAccounts.accessTokenIv,
        instagramUserId: instagramAccounts.instagramUserId,
      })
      .from(instagramAccounts)
      .where(eq(instagramAccounts.id, accountId))
      .limit(1);

    if (rows.length === 0) {
      throw new InstagramApiError("Conta Instagram não encontrada", 404);
    }

    const { accessTokenEncrypted, accessTokenIv, instagramUserId } = rows[0];
    const token = decrypt(accessTokenEncrypted, accessTokenIv);
    return { token, igUserId: instagramUserId };
  }

  // ---- API Methods ----

  async function validateToken(
    accessToken: string,
  ): Promise<{ id: string; name: string; username: string; profile_picture_url?: string }> {
    const result = await graphFetch<{
      id: string | number;
      name: string;
      username: string;
      profile_picture_url?: string;
    }>("/me?fields=id,name,username,profile_picture_url", accessToken);
    // Instagram IDs can exceed Number.MAX_SAFE_INTEGER; ensure string type.
    return { ...result, id: String(result.id) };
  }

  async function getProfile(accountId: string): Promise<InstagramProfile> {
    const cached = await getCachedMetric(accountId, "profile");
    if (cached) return cached as InstagramProfile;

    const { token, igUserId } = await getDecryptedToken(accountId);
    const profile = await graphFetch<InstagramProfile>(
      `/${igUserId}?fields=id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url`,
      token,
    );

    await setCachedMetric(accountId, "profile", profile, CACHE_TTL.profile);
    return profile;
  }

  async function getMediaListBasic(
    accountId: string,
    limit = 50,
  ): Promise<InstagramMediaBasic[]> {
    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<{ data: InstagramMediaBasic[] }>(
      `/${igUserId}/media?fields=id,caption,media_type,permalink,timestamp&limit=${limit}`,
      token,
    );
    return result.data ?? [];
  }

  /**
   * A lista de posts, com as métricas vindas do BANCO.
   *
   * A lista em si é uma chamada à Meta (traz post novo, legenda, thumbnail que
   * expira, curtidas e comentários). Os insights ficam guardados em
   * `instagram_post_metrics`: buscamos só os que faltam ou envelheceram, com
   * teto por leitura, e paramos na hora se a Meta reclamar de cota.
   */
  async function getMediaList(
    accountId: string,
    limit = 25,
    after?: string,
  ): Promise<{ data: InstagramMedia[]; nextCursor?: string }> {
    const { token, igUserId } = await getDecryptedToken(accountId);
    let path = `/${igUserId}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}`;
    if (after) path += `&after=${after}`;

    const result = await graphFetch<MediaListResponse>(path, token);
    const posts = result.data ?? [];
    const guardadas = await lerMetricas(fastify.db, accountId, posts.map((p) => p.id));

    const candidatos = posts
      .map((post) => ({
        post,
        postadoEm: new Date(post.timestamp),
        insightsEm: guardadas.get(post.id)?.insightsAt ?? null,
      }))
      .filter((c) => precisaBuscarInsights(c.postadoEm, c.insightsEm));
    const aBuscar = ordemDeBusca(candidatos).slice(0, ORCAMENTO_DE_INSIGHTS);

    const buscados = new Map<string, { m: MetricasCruas; em: Date }>();
    let cotaEstourou = false;
    for (let i = 0; i < aBuscar.length && !cotaEstourou; i += INSIGHTS_EM_PARALELO) {
      const bloco = aBuscar.slice(i, i + INSIGHTS_EM_PARALELO);
      const res = await Promise.allSettled(
        bloco.map(async (c) => {
          const entries = await getMediaInsights(c.post.id, accountId, c.post.media_type);
          return { id: c.post.id, m: metricasDasEntradas(entries) };
        }),
      );
      for (const r of res) {
        if (r.status === "fulfilled") buscados.set(r.value.id, { m: r.value.m, em: new Date() });
        // 429: parar AGORA. Insistir só aprofunda o bloqueio, e o que já está
        // no banco basta para a tela abrir.
        else if (r.reason instanceof InstagramApiError && r.reason.statusCode === 429) {
          cotaEstourou = true;
          fastify.log.warn("[IG] cota da Meta estourou; servindo o que está no banco");
        }
      }
    }

    const paraGravar: LinhaParaGravar[] = posts.map((p) => {
      const novo = buscados.get(p.id);
      const antigo = guardadas.get(p.id);
      const m = novo?.m;
      return {
        mediaId: p.id,
        postedAt: new Date(p.timestamp),
        mediaType: p.media_type ?? null,
        mediaProductType: p.media_product_type ?? null,
        caption: p.caption ?? null,
        permalink: p.permalink ?? null,
        likeCount: p.like_count ?? null,
        commentsCount: p.comments_count ?? null,
        reach: m ? m.reach : (antigo?.reach ?? null),
        views: m ? m.views : (antigo?.views ?? null),
        saved: m ? m.saved : (antigo?.saved ?? null),
        shares: m ? m.shares : (antigo?.shares ?? null),
        follows: m ? m.follows : (antigo?.follows ?? null),
        skipRate: m ? m.skipRate : (antigo?.skipRate ?? null),
        avgWatchTimeMs: m ? m.avgWatchTimeMs : (antigo?.avgWatchTimeMs ?? null),
        insightsAt: novo?.em ?? antigo?.insightsAt ?? null,
      };
    });
    await salvarMetricas(fastify.db, accountId, paraGravar);

    const manuais = new Map(
      [...guardadas.values()]
        .filter((m) => m.followsManual != null)
        .map((m) => [m.mediaId, m.followsManual]),
    );
    const data: InstagramMedia[] = posts.map((post, i) => {
      const g = paraGravar[i]!;
      const likes = post.like_count ?? 0;
      const comments = post.comments_count ?? 0;
      const engagementRate =
        g.reach && g.reach > 0
          ? // Compartilhamento entra: é a mesma conta da tabela mensal
            // (`interacoesDoPost`), senão o "melhor post do mês" de lá e o topo
            // do ranking daqui discordariam sobre o mesmo post.
            ((likes + comments + (g.saved ?? 0) + (g.shares ?? 0)) / g.reach) * 100
          : null;
      return {
        ...post,
        reach: g.reach ?? null,
        saved: g.saved ?? null,
        engagement_rate: engagementRate,
        views: g.views ?? null,
        shares: g.shares ?? null,
        avg_watch_time_ms: g.avgWatchTimeMs ?? null,
        // O digitado à mão só entra onde a Meta não responde — nunca por cima
        // do número dela.
        follows: g.follows ?? manuais.get(post.id) ?? null,
        follows_fonte:
          g.follows != null ? "meta" : manuais.get(post.id) != null ? "manual" : null,
        skip_rate: g.skipRate ?? null,
      } satisfies InstagramMedia;
    });

    return { data, nextCursor: result.paging?.cursors?.after };
  }

  interface MetricasCruas {
    reach: number | null;
    views: number | null;
    saved: number | null;
    shares: number | null;
    follows: number | null;
    skipRate: number | null;
    avgWatchTimeMs: number | null;
  }

  function metricasDasEntradas(entries: InsightEntry[]): MetricasCruas {
    return {
      reach: pickInsightValue(entries, "reach"),
      views: pickInsightValue(entries, "views"),
      saved: pickInsightValue(entries, "saved"),
      shares: pickInsightValue(entries, "shares"),
      follows: pickInsightValue(entries, "follows"),
      skipRate: pickInsightValue(entries, "reels_skip_rate"),
      avgWatchTimeMs: pickInsightValue(entries, "ig_reels_avg_watch_time"),
    };
  }

  function pickInsightValue(entries: InsightEntry[], name: string): number | null {
    const e = entries.find((x) => x.name === name);
    if (!e) return null;
    // total_value is the v25.0 shape for non-time-series metrics
    if (e.total_value && typeof e.total_value.value === "number") {
      return e.total_value.value;
    }
    // fallback: time_series — sum the values
    if (e.values && e.values.length > 0) {
      let sum = 0;
      let any = false;
      for (const v of e.values) {
        if (typeof v.value === "number") {
          sum += v.value;
          any = true;
        }
      }
      return any ? sum : null;
    }
    return null;
  }

  async function getMediaInsights(
    mediaId: string,
    accountId: string,
    mediaType?: string,
  ): Promise<InsightEntry[]> {
    // O cache curto continua, mas agora é só contra repetição dentro da mesma
    // rajada — quem guarda de verdade é `instagram_post_metrics`.
    const cacheKey = `post_insights_v2_${mediaId}`;
    const cached = await getCachedMetric(accountId, cacheKey);
    if (cached) return cached as InsightEntry[];

    const { token } = await getDecryptedToken(accountId);

    // v25.0: metrics depend on media type
    // Deprecated: impressions (use views), plays
    let metrics: string;
    if (mediaType === "VIDEO" || mediaType === "REEL") {
      metrics = "reach,views,likes,comments,saved,shares,ig_reels_avg_watch_time,reels_skip_rate";
    } else if (mediaType === "STORY") {
      metrics = "reach,views,replies,shares,follows,navigation";
    } else {
      // FEED (IMAGE, CAROUSEL_ALBUM)
      metrics = "reach,views,likes,comments,saved,shares,follows";
    }

    // Fetch with fallback — some metrics may fail for older posts
    const entries: InsightEntry[] = [];
    try {
      const result = await graphFetch<InsightsResponse>(
        `/${mediaId}/insights?metric=${metrics}`,
        token,
      );
      entries.push(...result.data);
    } catch {
      // Fallback 1 (Reels): sem a taxa de pulo, que é a métrica mais nova — se
      // ela for recusada, as outras não podem ir junto.
      if (metrics.includes("reels_skip_rate")) {
        try {
          const result = await graphFetch<InsightsResponse>(
            `/${mediaId}/insights?metric=${metrics.replace(",reels_skip_rate", "")}`,
            token,
          );
          entries.push(...result.data);
        } catch {
          // segue para o conjunto mínimo
        }
      }
    }
    if (entries.length === 0) {
      // Fallback: try minimal set
      try {
        const result = await graphFetch<InsightsResponse>(
          `/${mediaId}/insights?metric=reach,likes,comments,saved,shares`,
          token,
        );
        entries.push(...result.data);
      } catch {
        // Media might not support insights (carousel albums, etc.)
      }
    }

    if (entries.length > 0) {
      await setCachedMetric(accountId, cacheKey, entries, CACHE_TTL.post_insights);
    }
    return entries;
  }

  /**
   * Insights do perfil no período.
   *
   * `somente` pede um subconjunto de métricas: o comparativo mensal precisa de
   * quatro (alcance, views, interações e seguidores) e pedia as treze — seis
   * meses custavam 78 chamadas das 200 que a Meta dá por hora. Cada
   * subconjunto tem sua própria chave de cache; sem isso, a resposta curta do
   * mensal serviria o dashboard inteiro com metade das métricas faltando.
   */
  async function getAccountInsights(
    accountId: string,
    period: string,
    since: number,
    until: number,
    somente?: string[],
  ): Promise<InsightEntry[]> {
    const periodStart = new Date(since * 1000).toISOString().split("T")[0];
    const periodEnd = new Date(until * 1000).toISOString().split("T")[0];

    // Cache key v3: each metric fetched independently
    // v4: + alcance e views quebrados por seguidor × não seguidor.
    // v5: + website_clicks e profile_views.
    // v6: alcance único (reach_total) e follower_count como série diária.
    const cacheKey = somente
      ? `account_insights_v6_${[...somente].sort().join("-")}`.slice(0, 50)
      : "account_insights_v6";
    const cached = await getCachedMetric(accountId, cacheKey, periodStart, periodEnd);
    if (cached) return cached as InsightEntry[];

    const { token, igUserId } = await getDecryptedToken(accountId);

    // v25.0: fetch each metric independently so one failure doesn't kill others.
    // API v22+ deprecated: impressions (use views), profile_views, plays
    // Only "reach" supports time_series. All others require metric_type=total_value.
    const base = `/${igUserId}/insights`;
    const tsParams = `&period=${period}&since=${since}&until=${until}`;

    const entries: InsightEntry[] = [];

    const querem = (m: string) => !somente || somente.includes(m);

    // 1. Séries diárias. Medido em 17/09/2026: das nove métricas testadas, só
    // estas duas devolvem pontos por dia — `views`, `profile_views`,
    // `website_clicks`, `total_interactions` e `likes` voltam VAZIAS.
    //
    // `follower_count` estava na lista de total_value e por isso o gráfico de
    // "Novos seguidores" não desenhava nada: sem `values`, não há série.
    const timeSeriesMetrics = ["reach", "follower_count"].filter(querem);
    await Promise.all(timeSeriesMetrics.map(async (metric) => {
      try {
        const result = await graphFetch<InsightsResponse>(
          `${base}?metric=${metric}${tsParams}&metric_type=time_series`, token
        );
        if (result?.data?.length > 0) {
          entries.push(...result.data);
          fastify.log.info(`[IG insights] ${metric}: OK time_series (${result.data[0]?.values?.length ?? 0} values)`);
        }
      } catch (err) {
        fastify.log.warn(`[IG insights] ${metric} time_series: FAILED - ${err instanceof Error ? err.message.substring(0, 80) : String(err)}`);
      }
    }));

    // 2. Total value metrics (aggregated for the period)
    const totalValueMetrics = [
      "views",                    // replaces deprecated "impressions"
      "accounts_engaged",
      "total_interactions",
      "follows_and_unfollows",
      "likes",
      "comments",
      "saves",
      "shares",
      "replies",
      // `profile_links_taps` é o nome novo e, medido em @odanilogato
      // (17/09/2026), vem praticamente zerado: 3 em 30 dias contra 2.196 de
      // `website_clicks` no mesmo período. Os dois vão; a tela usa o que tem
      // número (ver `cliquesNaBio` no web).
      "profile_links_taps",
      "website_clicks",
      "profile_views",
    ].filter(querem);
    await Promise.all(totalValueMetrics.map(async (metric) => {
      try {
        // `follows_and_unfollows` requer breakdown=follow_type (Meta v25+)
        // Sem esse parâmetro, a API retorna vazio silenciosamente.
        const breakdownParam = metric === "follows_and_unfollows" ? "&breakdown=follow_type" : "";
        const result = await graphFetch<InsightsResponse>(
          `${base}?metric=${metric}${tsParams}&metric_type=total_value${breakdownParam}`, token
        );
        if (result?.data?.length > 0) {
          entries.push(...result.data);
          fastify.log.info(`[IG insights] ${metric}: OK (total_value)`);
        }
      } catch (err) {
        fastify.log.warn(`[IG insights] ${metric}: FAILED - ${err instanceof Error ? err.message.substring(0, 80) : String(err)}`);
      }
    }));

    // 2b. Alcance ÚNICO do período.
    //
    // A série diária diz quantas contas viram EM CADA DIA; somar os 30 dias
    // conta de novo quem apareceu em mais de um. Medido em @odanilogato
    // (30 dias): a soma dá 1.728.838 e o valor único, 1.171.564 — 48% de
    // diferença, e o app do Instagram mostra o único.
    //
    // Nome próprio porque `reach` já existe na lista como série; quem procura
    // por nome pegaria o primeiro.
    if (querem("reach")) {
      try {
        const r = await graphFetch<InsightsResponse>(
          `${base}?metric=reach${tsParams}&metric_type=total_value`, token
        );
        for (const e of r?.data ?? []) entries.push({ ...e, name: "reach_total" });
      } catch (err) {
        fastify.log.warn(`[IG insights] reach total_value: FAILED - ${err instanceof Error ? err.message.substring(0, 80) : String(err)}`);
      }
    }

    // 3. Alcance e views quebrados por seguidor × não seguidor (só no PERFIL: por
    // post a Meta recusa, "Incompatible breakdowns (follow_type)").
    // Renomeados porque "reach" e "views" já existem na lista sem quebra, e quem
    // procura por nome pegaria o primeiro.
    //
    // Aqui FOLLOWER é quem JÁ SEGUE o perfil — não o mesmo sentido do
    // `follows_and_unfollows`, onde FOLLOWER é novo seguidor.
    await Promise.all(["reach", "views"].filter(querem).map(async (metric) => {
      try {
        const result = await graphFetch<InsightsResponse>(
          `${base}?metric=${metric}${tsParams}&metric_type=total_value&breakdown=follow_type`, token
        );
        for (const e of result?.data ?? []) entries.push({ ...e, name: `${metric}_follow_type` });
      } catch (err) {
        fastify.log.warn(`[IG insights] ${metric} follow_type: FAILED - ${err instanceof Error ? err.message.substring(0, 80) : String(err)}`);
      }
    }));

    fastify.log.info("[IG insights] returned metrics: " + (entries.map((e) => e.name).join(", ") || "(none)"));

    // Janela que já fechou (terminou há mais de 2 dias) não muda mais: o
    // comparativo mensal pede seis dessas por abertura, e rebuscá-las a cada 30
    // minutos era o segundo maior consumidor da cota.
    const fechada = until * 1000 < Date.now() - 2 * 86_400_000;
    await setCachedMetric(
      accountId,
      cacheKey,
      entries,
      fechada ? 60 * 24 * 30 : CACHE_TTL.account_insights,
      periodStart,
      periodEnd,
    );
    return entries;
  }

  async function getAudienceDemographics(accountId: string): Promise<InsightEntry[]> {
    const cached = await getCachedMetric(accountId, "demographics");
    if (cached) return cached as InsightEntry[];

    const { token, igUserId } = await getDecryptedToken(accountId);

    // v25.0: demographic metrics use timeframe instead of since/until
    const [ageResult, genderResult, countryResult, cityResult] = await Promise.allSettled([
      graphFetch<DemographicsResponse>(
        `/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age&timeframe=last_30_days`,
        token,
      ),
      graphFetch<DemographicsResponse>(
        `/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=gender&timeframe=last_30_days`,
        token,
      ),
      graphFetch<DemographicsResponse>(
        `/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country&timeframe=last_30_days`,
        token,
      ),
      graphFetch<DemographicsResponse>(
        `/${igUserId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city&timeframe=last_30_days`,
        token,
      ),
    ]);

    const ageResp    = ageResult.status    === "fulfilled" ? ageResult.value    : null;
    const genderResp = genderResult.status === "fulfilled" ? genderResult.value : null;
    const countryResp= countryResult.status=== "fulfilled" ? countryResult.value: null;
    const cityResp   = cityResult.status   === "fulfilled" ? cityResult.value   : null;

    // If every breakdown failed, surface the first error so the UI shows it
    if (!ageResp && !genderResp && !countryResp && !cityResp) {
      const firstRejected = [ageResult, genderResult, countryResult, cityResult]
        .find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      if (firstRejected) throw firstRejected.reason;
      return [];
    }

    const result: InsightEntry[] = [];
    // Merge age + gender into one audience_gender_age entry
    const ageEntry    = ageResp    ? transformDemographicsBreakdown(ageResp,    "audience_gender_age") : null;
    const genderEntry = genderResp ? transformDemographicsBreakdown(genderResp, "audience_gender_age") : null;
    const mergedAgeGender = ageEntry ?? genderEntry;
    if (mergedAgeGender) result.push(mergedAgeGender);

    const co = countryResp ? transformDemographicsBreakdown(countryResp, "audience_country") : null;
    const ci = cityResp    ? transformDemographicsBreakdown(cityResp,    "audience_city")    : null;
    if (co) result.push(co);
    if (ci) result.push(ci);

    await setCachedMetric(accountId, "demographics", result, CACHE_TTL.demographics);
    return result;
  }

  async function getStories(
    accountId: string,
  ): Promise<Array<StoryMedia & { insights?: InsightEntry[] }>> {
    const cached = await getCachedMetric(accountId, "stories");
    if (cached) return cached as Array<StoryMedia & { insights?: InsightEntry[] }>;

    const { token, igUserId } = await getDecryptedToken(accountId);
    const result = await graphFetch<StoriesResponse>(
      `/${igUserId}/stories?fields=id,media_type,media_url,timestamp`,
      token,
    );

    const storiesWithInsights = await Promise.all(
      result.data.map(async (story) => {
        try {
          const insights = await graphFetch<InsightsResponse>(
            `/${story.id}/insights?metric=reach,views,replies,shares,follows,navigation`,
            token,
          );
          return { ...story, insights: insights.data };
        } catch {
          return { ...story, insights: undefined };
        }
      }),
    );

    await setCachedMetric(accountId, "stories", storiesWithInsights, CACHE_TTL.stories);
    return storiesWithInsights;
  }

  /**
   * Os Reels recentes — a mesma lista de posts, filtrada.
   *
   * Antes esta função repetia a busca e o enriquecimento por conta própria:
   * numa tela que já mostra a lista completa, eram os MESMOS posts pedidos à
   * Meta duas vezes. Reusar `getMediaList` corta essa metade e faz os Reels
   * lerem do banco junto com o resto.
   */
  async function getReels(
    accountId: string,
  ): Promise<{ data: InstagramMedia[]; nextCursor?: string }> {
    const lista = await getMediaList(accountId, 25);
    return {
      data: lista.data.filter(
        (m) => m.media_product_type === "REELS" || m.media_type === "VIDEO" || m.media_type === "REEL",
      ),
      nextCursor: lista.nextCursor,
    };
  }

  // ---- Decorate Fastify ----

  fastify.decorate("instagramService", {
    validateToken,
    getProfile,
    getMediaList,
    getMediaListBasic,
    getMediaInsights,
    getAccountInsights,
    getAudienceDemographics,
    getStories,
    getReels,
    invalidateCache,
  });
});
