import { decrypt } from "./encryption.js";

// ============================================================
// CONSTANTS
// ============================================================

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const RATE_LIMIT_MAX = 200;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Timezone usado pra calcular "hoje" e o range since/until.
 * Meta API recebe esse mesmo timezone explícito via `time_range.time_zone`
 * pra interpretar o range no fuso da conta — evita o bug onde dados do dia
 * atual sumiam quando o servidor (UTC) e a conta (SP) estavam em dias
 * diferentes.
 *
 * Hardcoded em SP porque Loyola atende só clientes brasileiros. Se um dia
 * precisar generalizar, vira coluna em meta_ads_accounts.
 */
const ACCOUNT_TIMEZONE = "America/Sao_Paulo";

// ============================================================
// DATE HELPERS
// ============================================================

/**
 * Retorna a data atual no formato YYYY-MM-DD no timezone passado.
 * Usa Intl.DateTimeFormat com `en-CA` (que já produz YYYY-MM-DD) pra evitar
 * parsing manual.
 */
export function todayInTimezone(timezone: string = ACCOUNT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Subtrai N dias de uma data YYYY-MM-DD usando UTC midnight (suficiente
 * pra aritmética de dias inteiros — o timezone só importa pra definir o
 * "hoje" inicial).
 */
function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const past = new Date(utc - days * 24 * 60 * 60 * 1000);
  return past.toISOString().slice(0, 10);
}

/**
 * Converte `days` em range { since, until } no formato YYYY-MM-DD calculado
 * no timezone da conta Meta. days=1 → since=until=hoje (1 dia, hoje só).
 *
 * Antes calculava em UTC e dependia da Meta converter — quebrava em janelas
 * de horário onde "hoje" UTC ≠ "hoje" SP. Agora `until` é sempre o dia atual
 * no fuso da conta.
 */
function dateRangeFromDays(
  days: number,
  timezone: string = ACCOUNT_TIMEZONE,
): { since: string; until: string } {
  const until = todayInTimezone(timezone);
  const since = subtractDays(until, Math.max(0, days - 1));
  return { since, until };
}

/**
 * Monta o parâmetro `time_range` URL-encoded pra passar pra Meta API.
 * Meta NÃO aceita `time_zone` dentro do JSON (erro #100). O TZ é definido
 * pela conta no Business Manager — basta calcular since/until no MESMO fuso
 * (SP via dateRangeFromDays) que a Meta interpreta corretamente.
 */
function buildTimeRangeParam(since: string, until: string): string {
  return encodeURIComponent(JSON.stringify({ since, until }));
}

/**
 * Epic 30 Story 30.1: divide um range [since, until] em chunks de até 90 dias.
 * Meta API com time_increment=1 (daily) rejeita ranges > 90 dias. Pra ranges
 * maiores (perpetuals de 365 dias), divide e busca em paralelo, depois concatena.
 *
 * Retorna chunks ORDENADOS do mais antigo pro mais recente.
 */
const META_DAILY_MAX_RANGE_DAYS = 90;

export function chunkDateRange(
  since: string,
  until: string,
  maxDaysPerChunk: number = META_DAILY_MAX_RANGE_DAYS,
): Array<{ since: string; until: string }> {
  const sinceMs = new Date(since + "T00:00:00Z").getTime();
  const untilMs = new Date(until + "T00:00:00Z").getTime();
  if (untilMs < sinceMs) return [];
  const dayMs = 24 * 60 * 60 * 1000;
  const totalDays = Math.floor((untilMs - sinceMs) / dayMs) + 1;
  if (totalDays <= maxDaysPerChunk) return [{ since, until }];

  const chunks: Array<{ since: string; until: string }> = [];
  let chunkStart = sinceMs;
  while (chunkStart <= untilMs) {
    const chunkEnd = Math.min(chunkStart + (maxDaysPerChunk - 1) * dayMs, untilMs);
    chunks.push({
      since: new Date(chunkStart).toISOString().slice(0, 10),
      until: new Date(chunkEnd).toISOString().slice(0, 10),
    });
    chunkStart = chunkEnd + dayMs;
  }
  return chunks;
}

// ============================================================
// RATE LIMITER (per-process, same pattern as instagram.ts)
// ============================================================

let requestCount = 0;
let windowStart = Date.now();

function checkRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCount = 0;
    windowStart = now;
  }
  if (requestCount >= RATE_LIMIT_MAX) {
    throw new Error("Meta Ads API rate limit exceeded. Try again later.");
  }
  requestCount++;
}

// ============================================================
// TYPES
// ============================================================

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

export interface MetaInsight {
  impressions?: string;
  reach?: string;
  clicks?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  conversions?: string;
  date_start: string;
  date_stop: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
  bid_amount?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: { id: string };
}

export interface MetaDailyInsight {
  date_start: string;
  date_stop: string;
  impressions: string;
  reach: string;
  clicks: string;
  spend: string;
  ctr: string;
  cpc: string;
  cpm: string;
  // Story 18.46: "Inline Link Clicks" do Ads Manager (cliques no link), usado na
  // tabela de LPs para bater com o que o gestor exporta do Meta.
  inline_link_clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

export interface MetaCampaignInsight extends MetaDailyInsight {
  campaign_id: string;
  campaign_name: string;
}

export interface MetaAdSetInsight extends MetaDailyInsight {
  adset_id: string;
  adset_name: string;
  campaign_id?: string;
  campaign_name?: string;
}

export interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p100: number;
  thruplay: number;
}

export interface MetaAdInsight extends MetaDailyInsight {
  ad_id: string;
  ad_name: string;
  videoMetrics?: VideoMetrics | null;
}

// ============================================================
// AD CREATIVE TYPES (Story 8.1)
// ============================================================

export interface MetaAdCreative {
  adId: string;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  ctaType: string | null;
  objectType: string | null;
  videoId: string | null;
}

// ============================================================
// CORE FETCH
// ============================================================

async function fetchMeta<T>(path: string, token: string): Promise<T> {
  checkRateLimit();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${GRAPH_API_BASE}${path}${separator}access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    const err = data as GraphApiError;
    throw new Error(
      err?.error?.message ?? `Meta API error: ${res.status}`
    );
  }
  return data as T;
}

// ============================================================
// PUBLIC API
// ============================================================

export async function validateMetaAdAccount(
  metaAccountId: string,
  accessToken: string
): Promise<MetaAdAccount> {
  return fetchMeta<MetaAdAccount>(
    `/act_${metaAccountId}?fields=id,name,account_id,account_status,currency,timezone_name`,
    accessToken
  );
}

export async function fetchCampaigns(
  metaAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  // Por padrão a Meta API esconde campanhas ARCHIVED/DELETED. Pra Loyola
  // precisamos do histórico completo (campanhas antigas paused/archived que
  // ainda têm spend e leads relevantes). Filtering explícito + paginação.
  const filtering = encodeURIComponent(
    JSON.stringify([
      {
        field: "effective_status",
        operator: "IN",
        value: ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"],
      },
    ])
  );

  type PageResponse = { data: MetaCampaign[]; paging?: { next?: string } };
  const allResults: MetaCampaign[] = [];
  let nextPath: string | null =
    `/act_${metaAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&filtering=${filtering}&limit=200`;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }
    allResults.push(...(res.data ?? []));
    // Hard cap defensivo — contas extremamente antigas podem ter milhares de
    // campanhas; 2000 é mais do que suficiente pro Loyola e evita loop infinito.
    if (res.paging?.next && allResults.length < 2000) {
      nextPath = res.paging.next;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }

  return allResults;
}

export async function fetchInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const res = await fetchMeta<{ data: MetaInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm&time_range=${timeRange}&level=account`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAdSets(
  metaAccountId: string,
  accessToken: string,
  campaignId: string
): Promise<MetaAdSet[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "campaign.id", operator: "EQUAL", value: campaignId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdSet[] }>(
    `/act_${metaAccountId}/adsets?fields=id,name,status,daily_budget,bid_amount&filtering=${filtering}&limit=100`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAds(
  metaAccountId: string,
  accessToken: string,
  adsetId: string
): Promise<MetaAd[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "adset.id", operator: "EQUAL", value: adsetId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAd[] }>(
    `/act_${metaAccountId}/ads?fields=id,name,status,creative{id}&filtering=${filtering}&limit=100`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchDailyInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaDailyInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const res = await fetchMeta<{ data: MetaDailyInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm&time_range=${timeRange}&time_increment=1&level=account`,
    accessToken
  );
  return res.data ?? [];
}

async function fetchCampaignDailyInsightsSingleRange(
  metaAccountId: string,
  accessToken: string,
  campaignId: string,
  since: string,
  until: string,
): Promise<MetaDailyInsight[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }])
  );

  const queryPath = `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,actions,action_values&time_increment=1&level=campaign&filtering=${filtering}&time_range=${buildTimeRangeParam(since, until)}`;
  const res = await fetchMeta<{ data: MetaDailyInsight[] }>(queryPath, accessToken);
  return res.data ?? [];
}

export async function fetchCampaignDailyInsights(
  metaAccountId: string,
  accessToken: string,
  campaignId: string,
  days: number = 30,
  startDate?: string,
  endDate?: string
): Promise<MetaDailyInsight[]> {
  const since = startDate && endDate ? startDate : dateRangeFromDays(days).since;
  const until = startDate && endDate ? endDate : dateRangeFromDays(days).until;

  // Epic 30 Story 30.1: chunked fetch quando range > 90 dias (Meta limit)
  const chunks = chunkDateRange(since, until);
  const results = await Promise.allSettled(
    chunks.map((c) =>
      fetchCampaignDailyInsightsSingleRange(metaAccountId, accessToken, campaignId, c.since, c.until),
    ),
  );

  const allResults: MetaDailyInsight[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") allResults.push(...r.value);
    else console.error(`[meta] chunk ${chunks[i].since}..${chunks[i].until} falhou:`, r.reason);
  }
  return allResults;
}

// Bulk version: time-series por dia somando N campanhas. Retorna 1 linha por
// (campanha, dia) — agregação por dia é responsabilidade do caller. PAGINAÇÃO
// obrigatória: N campanhas × até 90 dias = pode passar de 25 (limite default
// da Meta) e perder dias mais recentes na primeira página.
// Internal: single-range (≤90d) fetch — chamada por `fetchCampaignDailyInsightsForIds`
// pra cada chunk quando range > 90 dias.
async function fetchCampaignDailyInsightsForIdsSingleRange(
  metaAccountId: string,
  accessToken: string,
  campaignIds: string[],
  since: string,
  until: string,
): Promise<MetaDailyInsight[]> {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }])
  );

  let queryPath = `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,actions,action_values&time_increment=1&level=campaign&limit=500&filtering=${filtering}`;
  queryPath += `&time_range=${buildTimeRangeParam(since, until)}`;

  type PageResponse = { data: MetaDailyInsight[]; paging?: { next?: string } };
  const allResults: MetaDailyInsight[] = [];
  let nextPath: string | null = queryPath;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      checkRateLimit();
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }
    allResults.push(...(res.data ?? []));
    const nextUrl = res.paging?.next;
    // Hard cap: N campanhas × 90 dias = ~450 linhas no pior caso por chunk.
    if (nextUrl && allResults.length < 2000) {
      nextPath = nextUrl;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }

  return allResults;
}

export async function fetchCampaignDailyInsightsForIds(
  metaAccountId: string,
  accessToken: string,
  campaignIds: string[],
  days: number = 30,
  startDate?: string,
  endDate?: string
): Promise<MetaDailyInsight[]> {
  if (campaignIds.length === 0) return [];

  const since = startDate && endDate ? startDate : dateRangeFromDays(days).since;
  const until = startDate && endDate ? endDate : dateRangeFromDays(days).until;

  // Epic 30 Story 30.1: ranges > 90 dias (perpetuals de 1 ano) são divididos em
  // chunks paralelos. Quando ≤ 90, vira 1 chamada só (zero overhead).
  const chunks = chunkDateRange(since, until);
  const results = await Promise.allSettled(
    chunks.map((c) =>
      fetchCampaignDailyInsightsForIdsSingleRange(
        metaAccountId,
        accessToken,
        campaignIds,
        c.since,
        c.until,
      ),
    ),
  );

  // Graceful: chunks que falham são logados via console.error mas não derrubam
  // o resto (perpetual de 1 ano = melhor receber 270 dias do que erro 502).
  const allResults: MetaDailyInsight[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      allResults.push(...r.value);
    } else {
      console.error(
        `[meta] chunk ${chunks[i].since}..${chunks[i].until} falhou:`,
        r.reason,
      );
    }
  }

  return allResults;
}

export async function fetchCampaignInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30,
  startDate?: string,
  endDate?: string,
  campaignIds?: string[],
): Promise<MetaCampaignInsight[]> {
  // Fix 1 (29.8): aceita startDate/endDate explicito (custom range no passado).
  // Quando passado, ignora `days` retroativos.
  const since = startDate && endDate ? startDate : dateRangeFromDays(days).since;
  const until = startDate && endDate ? endDate : dateRangeFromDays(days).until;
  const timeRange = buildTimeRangeParam(since, until);
  // Story 18.46: filtra por campaign.id na query (igual fetchAllAdInsights). Sem
  // isso, o Meta retorna só a 1a página (~25 campanhas) e campanhas de baixo
  // volume (ex: lpc/lpd) somem. limit alto como margem extra.
  const ids = (campaignIds ?? []).filter((x): x is string => !!x);
  const filterPart =
    ids.length === 0
      ? ""
      : `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]))}`;
  const res = await fetchMeta<{ data: MetaCampaignInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,inline_link_clicks,campaign_id,campaign_name,actions,action_values&time_range=${timeRange}&level=campaign&limit=500${filterPart}`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAdSetInsights(
  metaAccountId: string,
  accessToken: string,
  campaignId: string,
  days: number = 30
): Promise<MetaAdSetInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "campaign.id", operator: "EQUAL", value: campaignId },
    ])
  );
  const res = await fetchMeta<{ data: MetaAdSetInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,adset_id,adset_name,actions,action_values&time_range=${timeRange}&level=adset&filtering=${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

export async function fetchAllAdSetInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30
): Promise<MetaAdSetInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const fields = "impressions,reach,clicks,spend,ctr,cpc,cpm,adset_id,adset_name,campaign_id,campaign_name,actions,action_values";

  type PageResponse = { data: MetaAdSetInsight[]; paging?: { next?: string } };
  const allResults: MetaAdSetInsight[] = [];
  let nextPath: string | null = `/act_${metaAccountId}/insights?fields=${fields}&time_range=${timeRange}&level=adset&limit=200`;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      checkRateLimit();
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }
    allResults.push(...(res.data ?? []));
    const nextUrl = res.paging?.next;
    if (nextUrl && allResults.length < 500) {
      nextPath = nextUrl;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }
  return allResults;
}

interface RawAdInsight extends MetaDailyInsight {
  ad_id: string;
  ad_name: string;
  actions?: { action_type: string; value: string }[];
  video_p25_watched_actions?: { action_type: string; value: string }[];
  video_p50_watched_actions?: { action_type: string; value: string }[];
  video_p75_watched_actions?: { action_type: string; value: string }[];
  video_p100_watched_actions?: { action_type: string; value: string }[];
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
}

function parseVideoAction(actions?: { action_type: string; value: string }[]): number {
  if (!actions || actions.length === 0) return 0;
  return parseInt(actions[0].value, 10) || 0;
}

function extractVideoMetrics(raw: RawAdInsight): VideoMetrics | null {
  const p25 = parseVideoAction(raw.video_p25_watched_actions);
  const p50 = parseVideoAction(raw.video_p50_watched_actions);
  const p75 = parseVideoAction(raw.video_p75_watched_actions);
  const p100 = parseVideoAction(raw.video_p100_watched_actions);
  const thruplay = parseVideoAction(raw.video_thruplay_watched_actions);
  if (p25 === 0 && p50 === 0 && p75 === 0 && p100 === 0) return null;
  return { p25, p50, p75, p100, thruplay };
}

export async function fetchAdInsights(
  metaAccountId: string,
  accessToken: string,
  adsetId: string,
  days: number = 30
): Promise<MetaAdInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const filtering = encodeURIComponent(
    JSON.stringify([
      { field: "adset.id", operator: "EQUAL", value: adsetId },
    ])
  );
  const res = await fetchMeta<{ data: RawAdInsight[] }>(
    `/act_${metaAccountId}/insights?fields=impressions,reach,clicks,spend,ctr,cpc,cpm,ad_id,ad_name,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions&time_range=${timeRange}&level=ad&filtering=${filtering}`,
    accessToken
  );
  return (res.data ?? []).map((raw) => ({
    ...raw,
    videoMetrics: extractVideoMetrics(raw),
  }));
}

// ============================================================
// ALL ADS — FLAT QUERY (Story 9.1)
// ============================================================
// Fetches ALL ads at account level in a single paginated call.
// This works for Advantage+ (ASC) campaigns that don't have
// traditional campaign→adset→ad hierarchy.

interface RawAllAdInsight extends RawAdInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  actions?: { action_type: string; value: string }[];
}

export interface AllAdInsight extends MetaAdInsight {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  // Story 18.46 (AC4): array de actions já vem da API (fields inclui `actions`);
  // expomos no tipo para extrair `landing_page_view`.
  actions?: { action_type: string; value: string }[];
}

export async function fetchAllAdInsights(
  metaAccountId: string,
  accessToken: string,
  days: number = 30,
  campaignIds?: string | string[],
  startDate?: string,
  endDate?: string,
): Promise<AllAdInsight[]> {
  // Story 29.8 ext: custom range alcança o ranking de criativos
  const since = startDate && endDate ? startDate : dateRangeFromDays(days).since;
  const until = startDate && endDate ? endDate : dateRangeFromDays(days).until;
  const timeRange = buildTimeRangeParam(since, until);

  // Aceita 1 campanha (string legacy) ou N campanhas (array). Meta Ads API
  // suporta operator EQUAL (single) ou IN (multi) no param `filtering`.
  const idList = Array.isArray(campaignIds)
    ? campaignIds.filter((x): x is string => !!x)
    : campaignIds
      ? [campaignIds]
      : [];
  const filterPart =
    idList.length === 0
      ? ""
      : idList.length === 1
        ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: idList[0] }]))}`
        : `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: idList }]))}`;

  const fields = "impressions,reach,clicks,spend,ctr,cpc,cpm,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions";

  // Paginate — Meta defaults to 25 results per page
  type PageResponse = { data: RawAllAdInsight[]; paging?: { next?: string } };
  const allResults: AllAdInsight[] = [];
  let nextPath: string | null = `/act_${metaAccountId}/insights?fields=${fields}&time_range=${timeRange}&level=ad&limit=200${filterPart}`;
  let useFullUrl = false;

  while (nextPath) {
    let res: PageResponse;
    if (useFullUrl) {
      // Subsequent pages: Meta returns full absolute URL with token already included
      checkRateLimit();
      const raw = await fetch(nextPath);
      res = (await raw.json()) as PageResponse;
    } else {
      res = await fetchMeta<PageResponse>(nextPath, accessToken);
    }

    for (const raw of res.data ?? []) {
      allResults.push({
        ...raw,
        videoMetrics: extractVideoMetrics(raw),
      });
    }

    // Meta returns full absolute URL for next page (may use different API version)
    // Continue pagination to fetch ALL ads (needed for accurate top performer sorting)
    const nextUrl: string | undefined = res.paging?.next;
    if (nextUrl) {
      nextPath = nextUrl;
      useFullUrl = true;
    } else {
      nextPath = null;
    }
  }

  return allResults;
}

// ============================================================
// PLACEMENT BREAKDOWN (Story 8.7)
// ============================================================

export interface MetaPlacementInsight {
  publisher_platform: string;
  platform_position: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
}

export async function fetchPlacementBreakdown(
  metaAccountId: string,
  accessToken: string,
  days: number = 30,
  campaignId?: string
): Promise<MetaPlacementInsight[]> {
  const { since, until } = dateRangeFromDays(days);
  const timeRange = buildTimeRangeParam(since, until);
  const filtering = campaignId
    ? `&filtering=${encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "EQUAL", value: campaignId }]))}`
    : "";
  const level = campaignId ? "campaign" : "account";
  const res = await fetchMeta<{ data: MetaPlacementInsight[] }>(
    `/act_${metaAccountId}/insights?fields=spend,impressions,clicks,ctr,cpc,cpm,actions,action_values&breakdowns=publisher_platform,platform_position&time_range=${timeRange}&level=${level}${filtering}`,
    accessToken
  );
  return res.data ?? [];
}

// ============================================================
// AD CREATIVES (Story 8.1)
// ============================================================

const CREATIVE_CACHE_TTL = 60 * 60 * 1000; // 1h

interface CreativeCacheEntry {
  data: MetaAdCreative;
  timestamp: number;
}

const creativeCache = new Map<string, CreativeCacheEntry>();

function getCachedCreative(adId: string): MetaAdCreative | undefined {
  const entry = creativeCache.get(adId);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CREATIVE_CACHE_TTL) {
    creativeCache.delete(adId);
    return undefined;
  }
  // Story 21.7 follow-up: invalida entries ruins — vídeos sem picture HD
  // (cacheados antes da Strategy C) são retratados pra que o refetch puxe
  // o `picture` do video_id.
  if (!entry.data.imageUrl && entry.data.videoId) {
    creativeCache.delete(adId);
    return undefined;
  }
  return entry.data;
}

function setCachedCreative(creative: MetaAdCreative): void {
  creativeCache.set(creative.adId, { data: creative, timestamp: Date.now() });
}

interface MetaCreativeRaw {
  id?: string;
  thumbnail_url?: string;
  image_url?: string;
  title?: string;
  body?: string;
  link_url?: string;
  call_to_action_type?: string;
  object_type?: string;
  video_id?: string;
}

interface MetaAdWithCreative {
  id: string;
  creative?: MetaCreativeRaw;
}

export async function fetchAdCreatives(
  metaAccountId: string,
  accessToken: string,
  adIds: string[]
): Promise<MetaAdCreative[]> {
  if (adIds.length === 0) return [];

  // Check cache first, collect uncached
  const results: MetaAdCreative[] = [];
  const uncachedIds: string[] = [];

  for (const adId of adIds) {
    const cached = getCachedCreative(adId);
    if (cached) {
      results.push(cached);
    } else {
      uncachedIds.push(adId);
    }
  }

  if (uncachedIds.length === 0) return results;

  // Batch via Meta ?ids= endpoint: 1 request per 50 ads instead of 50 requests
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < uncachedIds.length; i += BATCH_SIZE) {
    batches.push(uncachedIds.slice(i, i + BATCH_SIZE));
  }

  // Step 1: Fetch ad data with creative metadata + effective_instagram_media_id for SHARE ads
  const batchPromises = batches.map(async (batch) => {
    const batchResults: MetaAdCreative[] = [];
    try {
      const idsParam = batch.join(",");
      const data = await fetchMeta<Record<string, MetaAdWithCreative & { creative?: MetaCreativeRaw & { id?: string; effective_instagram_media_id?: string } }>>(
        `/?ids=${idsParam}&fields=id,creative{id,thumbnail_url,image_url,effective_instagram_media_id,title,body,link_url,call_to_action_type,object_type,video_id}`,
        accessToken
      );
      for (const adId of batch) {
        const ad = data[adId];
        const c = ad?.creative;
        const creative: MetaAdCreative = {
          adId,
          thumbnailUrl: c?.thumbnail_url ?? null,
          imageUrl: c?.image_url ?? null,
          title: c?.title ?? null,
          body: c?.body ?? null,
          linkUrl: c?.link_url ?? null,
          ctaType: c?.call_to_action_type ?? null,
          objectType: c?.object_type ?? null,
          videoId: c?.video_id ?? null,
        };
        // Store IDs temporarily for hi-res fetch
        const extra = creative as unknown as Record<string, unknown>;
        extra._creativeId = c?.id ?? null;
        extra._igMediaId = c?.effective_instagram_media_id ?? null;
        batchResults.push(creative);
      }
    } catch (err) {
      console.error("[fetchAdCreatives] batch failed:", err);
      for (const adId of batch) {
        batchResults.push({
          adId, thumbnailUrl: null, imageUrl: null, title: null,
          body: null, linkUrl: null, ctaType: null, objectType: null, videoId: null,
        });
      }
    }
    return batchResults;
  });

  const allBatchResults = await Promise.all(batchPromises);
  for (const batch of allBatchResults) {
    results.push(...batch);
  }

  // Step 2: Fetch hi-res images — two strategies in parallel
  const needsImage = results.filter((c) => !c.imageUrl);

  // Strategy A: Instagram media_url (for SHARE/Instagram ads)
  const igMediaIds = needsImage
    .filter((c) => (c as unknown as Record<string, unknown>)._igMediaId)
    .map((c) => ({
      creative: c,
      igMediaId: (c as unknown as Record<string, unknown>)._igMediaId as string,
    }));

  // Strategy B: Creative effective_image_url (for other ads)
  const creativeIdsForHiRes = needsImage
    .filter((c) => (c as unknown as Record<string, unknown>)._creativeId && !(c as unknown as Record<string, unknown>)._igMediaId)
    .map((c) => ({
      creative: c,
      creativeId: (c as unknown as Record<string, unknown>)._creativeId as string,
    }));

  // Strategy C (Story 21.7 follow-up): vídeos — pega `picture` (frame HD) do
  // video_id e usa como imageUrl. Antes, vídeos caíam só no thumbnail_url
  // (low-res 64-128px) e apareciam pixelados no card da galeria.
  const videosNeedingPreview = results.filter((c) => !c.imageUrl && c.videoId);

  await Promise.all([
    // Strategy A: Batch fetch IG media URLs
    (async () => {
      if (igMediaIds.length === 0) return;
      const igMap = new Map(igMediaIds.map((x) => [x.igMediaId, x.creative]));
      const igIdList = Array.from(igMap.keys());
      for (let i = 0; i < igIdList.length; i += BATCH_SIZE) {
        const batch = igIdList.slice(i, i + BATCH_SIZE);
        try {
          const data = await fetchMeta<Record<string, { id: string; media_url?: string; thumbnail_url?: string }>>(
            `/?ids=${batch.join(",")}&fields=id,media_url,thumbnail_url`,
            accessToken
          );
          for (const igId of batch) {
            const c = igMap.get(igId);
            const meta = data[igId];
            if (c && meta?.media_url) {
              c.imageUrl = meta.media_url;
            }
          }
        } catch (err) {
          console.error("[fetchAdCreatives] IG media batch failed:", err);
        }
      }
    })(),
    // Strategy C: Batch fetch video pictures (frame HD do vídeo)
    (async () => {
      if (videosNeedingPreview.length === 0) return;
      const vMap = new Map(videosNeedingPreview.map((c) => [c.videoId as string, c]));
      const vIdList = Array.from(vMap.keys());
      for (let i = 0; i < vIdList.length; i += BATCH_SIZE) {
        const batch = vIdList.slice(i, i + BATCH_SIZE);
        try {
          const data = await fetchMeta<Record<string, { id: string; picture?: string }>>(
            `/?ids=${batch.join(",")}&fields=id,picture`,
            accessToken
          );
          for (const vid of batch) {
            const c = vMap.get(vid);
            const meta = data[vid];
            if (c && meta?.picture) {
              c.imageUrl = meta.picture;
            }
          }
        } catch (err) {
          console.error("[fetchAdCreatives] video picture batch failed:", err);
        }
      }
    })(),
    // Strategy B: Batch fetch creative effective_image_url
    (async () => {
      if (creativeIdsForHiRes.length === 0) return;
      const cMap = new Map(creativeIdsForHiRes.map((x) => [x.creativeId, x.creative]));
      const cIdList = Array.from(cMap.keys());
      for (let i = 0; i < cIdList.length; i += BATCH_SIZE) {
        const batch = cIdList.slice(i, i + BATCH_SIZE);
        try {
          const data = await fetchMeta<Record<string, { id: string; effective_image_url?: string; image_url?: string }>>(
            `/?ids=${batch.join(",")}&fields=id,effective_image_url,image_url`,
            accessToken
          );
          for (const cid of batch) {
            const c = cMap.get(cid);
            const meta = data[cid];
            if (c && meta) {
              c.imageUrl = meta.effective_image_url ?? meta.image_url ?? null;
            }
          }
        } catch (err) {
          console.error("[fetchAdCreatives] hi-res batch failed:", err);
        }
      }
    })(),
  ]);

  // Clean up temp fields and cache
  for (const c of results) {
    const extra = c as unknown as Record<string, unknown>;
    delete extra._creativeId;
    delete extra._igMediaId;
    setCachedCreative(c);
  }

  return results;
}

// ============================================================
// VIDEO SOURCE (Story 9.5)
// ============================================================

interface VideoSourceResult {
  sourceUrl: string | null;
  embedHtml: string | null;
  permalinkUrl: string | null;
  picture: string | null;
}

const videoSourceCache = new Map<string, { data: VideoSourceResult; timestamp: number }>();
const VIDEO_SOURCE_TTL = 60 * 60 * 1000; // 1h (embed URLs are stable)

export async function fetchVideoSource(
  videoId: string,
  accessToken: string
): Promise<VideoSourceResult> {
  const cached = videoSourceCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < VIDEO_SOURCE_TTL) {
    return cached.data;
  }

  const empty: VideoSourceResult = { sourceUrl: null, embedHtml: null, permalinkUrl: null, picture: null };

  try {
    const data = await fetchMeta<{
      source?: string;
      embed_html?: string;
      permalink_url?: string;
      picture?: string;
    }>(
      `/${videoId}?fields=source,embed_html,permalink_url,picture`,
      accessToken
    );

    const result: VideoSourceResult = {
      sourceUrl: data.source ?? null,
      embedHtml: data.embed_html ?? null,
      permalinkUrl: data.permalink_url ? `https://www.facebook.com${data.permalink_url}` : null,
      picture: data.picture ?? null,
    };

    videoSourceCache.set(videoId, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    return empty;
  }
}

export function decryptAccountToken(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// Story 28.7 — Cache de nomes Meta (ad/adset/campaign)
// ============================================================

export type MetaEntityType = "ad" | "adset" | "campaign";

export interface CachedEntityName {
  entityId: string;
  entityName: string;
}

export interface ResolveEntityNamesCacheAdapter {
  /** Lê do cache os entries ainda válidos (TTL aplicado pelo caller). */
  loadCached(ids: string[]): Promise<CachedEntityName[]>;
  /** Persiste novos entries (upsert). */
  saveToCache(entries: CachedEntityName[]): Promise<void>;
}

const META_NAMES_BATCH_LIMIT = 50; // Meta `/?ids=` aceita até 50 ids por request
const META_NAMES_BATCH_THROTTLE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve N ids Meta (ad/adset/campaign) em nomes, com cache-first + batch API
 * com throttle. Estratégia:
 *
 * 1. Pergunta ao adapter o que já tem em cache válido
 * 2. Lista de faltantes vira chamadas batch `/?ids=<csv>&fields=id,name`
 *    em lotes de 50 (limite Meta)
 * 3. Entre batches, sleep 200ms (throttle conservador — 50 ids/batch × 200ms
 *    = 250 ids/segundo, muito abaixo de 200 req/h)
 * 4. Upsert no cache via adapter
 * 5. Fallback: ids que falharam silenciosamente recebem name = id (caller
 *    diferencia via comparação id === name)
 *
 * @returns Map<id, name> com todos os ids solicitados (cache + recém + fallback)
 */
export async function resolveEntityNames(
  ids: string[],
  accessToken: string,
  cache: ResolveEntityNamesCacheAdapter,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;

  const unique = Array.from(new Set(ids.filter((id) => id && id.trim().length > 0)));
  if (unique.length === 0) return result;

  // 1. Carrega cache
  try {
    const cached = await cache.loadCached(unique);
    for (const c of cached) result.set(c.entityId, c.entityName);
  } catch (err) {
    console.error("[resolveEntityNames] cache load failed (proceeding without cache)", err);
  }

  // 2. Faltantes
  const missing = unique.filter((id) => !result.has(id));
  if (missing.length === 0) return result;

  // 3. Batch Meta API com retry logic (Story 18.33 AC2)
  const fresh: CachedEntityName[] = [];
  const maxRetries = 2;
  const retryBackoffMs = 500;

  for (let i = 0; i < missing.length; i += META_NAMES_BATCH_LIMIT) {
    const batch = missing.slice(i, i + META_NAMES_BATCH_LIMIT);
    let retries = 0;
    let batchResolved = false;

    while (retries < maxRetries && !batchResolved) {
      try {
        const data = await fetchMeta<Record<string, { id: string; name: string }>>(
          `/?ids=${batch.join(",")}&fields=id,name`,
          accessToken,
        );
        for (const id of batch) {
          const entry = data[id];
          if (entry?.name) {
            result.set(id, entry.name);
            fresh.push({ entityId: id, entityName: entry.name });
          }
        }
        batchResolved = true;
      } catch (err) {
        retries++;
        if (retries < maxRetries) {
          console.warn(
            `[resolveEntityNames] batch ${Math.floor(i / META_NAMES_BATCH_LIMIT) + 1} failed (retry ${retries}/${maxRetries})`,
            err,
          );
          await sleep(retryBackoffMs * Math.pow(2, retries - 1));
        } else {
          console.error(
            `[resolveEntityNames] batch ${Math.floor(i / META_NAMES_BATCH_LIMIT) + 1} failed after ${maxRetries} retries (continuing with unresolved)`,
            err,
          );
        }
      }
    }

    if (i + META_NAMES_BATCH_LIMIT < missing.length) {
      await sleep(META_NAMES_BATCH_THROTTLE_MS);
    }
  }

  // 4. Upsert
  if (fresh.length > 0) {
    try {
      await cache.saveToCache(fresh);
    } catch (err) {
      console.error("[resolveEntityNames] cache save failed (returning results anyway)", err);
    }
  }

  // 5. Fallback: ids que não resolveram caem em si mesmos (caller detecta via id === name)
  for (const id of unique) if (!result.has(id)) result.set(id, id);

  return result;
}

// ============================================================
// AD CREATIVE CACHE (Story 18.26 Fase 2)
// ============================================================

/**
 * Story 18.26 Fase 2: adapter pra cache persistente de creative metadata.
 * Mesmo padrão do ResolveEntityNamesCacheAdapter — meta-ads.ts permanece
 * framework-agnostic (sem importar Drizzle); o caller injeta o adapter.
 */
export interface AdCreativeCacheAdapter {
  loadCached(adIds: string[]): Promise<MetaAdCreative[]>;
  saveToCache(creatives: MetaAdCreative[]): Promise<void>;
}

/**
 * Story 18.26 Fase 2: DB-first wrapper de fetchAdCreatives.
 *
 * 1. Carrega creatives ainda válidos no cache via adapter
 * 2. Chama fetchAdCreatives() só pros adIds faltantes (Meta API)
 * 3. Upsert os recém-buscados no cache
 * 4. Retorna a união (cache + fresh)
 *
 * Caller passa adapter que aplica TTL no SELECT (24h padrão alinhado com
 * meta_entity_names_cache).
 */
export async function fetchAdCreativesWithCache(
  adapter: AdCreativeCacheAdapter,
  metaAccountId: string,
  accessToken: string,
  adIds: string[],
): Promise<MetaAdCreative[]> {
  if (adIds.length === 0) return [];
  const unique = Array.from(new Set(adIds.filter((x) => x && x.trim())));
  if (unique.length === 0) return [];

  // 1. Cache hit
  let cached: MetaAdCreative[] = [];
  try {
    cached = await adapter.loadCached(unique);
  } catch (err) {
    console.error("[fetchAdCreativesWithCache] cache load failed (proceeding without)", err);
  }
  const cachedIds = new Set(cached.map((c) => c.adId));
  const missing = unique.filter((id) => !cachedIds.has(id));
  if (missing.length === 0) return cached;

  // 2. Meta API pros faltantes (já tem in-memory cache interno + batch + throttle)
  const fresh = await fetchAdCreatives(metaAccountId, accessToken, missing);

  // 3. Persiste fresh no DB
  if (fresh.length > 0) {
    try {
      await adapter.saveToCache(fresh);
    } catch (err) {
      console.error("[fetchAdCreativesWithCache] cache save failed (returning anyway)", err);
    }
  }

  return [...cached, ...fresh];
}
