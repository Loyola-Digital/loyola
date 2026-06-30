// Epic 37 — Service GA4 (Google Analytics Data API v1beta).
//
// A GA4 mede COMPORTAMENTO on-page (sessões, usuários, engajamento, conversões)
// e ATRIBUI o tráfego a origem/mídia/campanha. Complementa Meta/Google Ads
// (que dão custo/cliques) — aqui não há spend. Conexão por projeto via OAuth
// Google (mesmo client GOOGLE_ADS_CLIENT_ID/SECRET, escopo analytics.readonly);
// cada ETAPA escolhe a página (ga4_page_filter) a analisar.
//
// SEGURANÇA: NUNCA logar refresh_token nem access_token. Mensagens de erro só
// status + detalhe da API.

import { createHash } from "node:crypto";
import { encrypt, decrypt } from "./encryption.js";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_DATA_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GA4_ADMIN_BASE = "https://analyticsadmin.googleapis.com/v1beta";

// Escopo de leitura da GA4 (Data API + Admin API de leitura).
export const GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

// Renova o access_token (1h) com 60s de folga.
const TOKEN_SKEW_MS = 60_000;

// ============================================================
// Cripto (reusa encryption.ts — AES-256-GCM), espelha kiwify/google-ads
// ============================================================

export function encryptGa4Secret(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}
export function decryptGa4Secret(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

// ============================================================
// OAuth — URL de consentimento (escopo analytics) + refresh de token
// ============================================================

/** URL de consentimento OAuth com escopo analytics.readonly (reusa o client Google). */
export function getGa4OAuthUrl(redirectUri: string, state?: string): string {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_ADS_CLIENT_ID não configurado");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GA4_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}
// Cache em memória por refresh_token (chave = hash, nunca o token cru).
const tokenCache = new Map<string, CachedToken>();

/** access_token a partir do refresh_token (cacheado ~1h). Não vaza segredos. */
export async function getGa4AccessToken(refreshToken: string): Promise<string> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAtMs > Date.now()) return cached.token;

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth não configurado");

  let res: Response;
  try {
    res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
  } catch {
    throw new Error("Falha de rede ao renovar token Google");
  }
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: refresh token inválido ou revogado`);

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google não retornou access_token");
  const ttlMs = (typeof data.expires_in === "number" ? data.expires_in : 3600) * 1000;
  tokenCache.set(key, { token: data.access_token, expiresAtMs: Date.now() + ttlMs - TOKEN_SKEW_MS });
  return data.access_token;
}

/** Limpa o cache de token (testes / troca de credencial). */
export function clearGa4TokenCache(): void {
  tokenCache.clear();
}

// ============================================================
// Admin API — listar properties acessíveis
// ============================================================

export interface Ga4Property {
  /** ID numérico (sem "properties/"). */
  propertyId: string;
  displayName: string;
  account: string;
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    displayName?: string;
    propertySummaries?: Array<{ property?: string; displayName?: string }>;
  }>;
}

/** Lista properties GA4 acessíveis pelo token (achatado account → property). */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const res = await fetch(`${GA4_ADMIN_BASE}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? "";
    } catch { /* corpo não-JSON */ }
    throw new Error(`GA4 Admin ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = (await res.json()) as AccountSummariesResponse;
  const out: Ga4Property[] = [];
  for (const acc of data.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      const id = (p.property ?? "").replace("properties/", "").trim();
      if (id) out.push({ propertyId: id, displayName: p.displayName ?? id, account: acc.displayName ?? "" });
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ============================================================
// Data API — runReport (1 chamada: dims canal/origem/campanha + métricas)
// ============================================================

const REPORT_DIMENSIONS = [
  "sessionDefaultChannelGroup",
  "sessionSourceMedium",
  "sessionCampaignName",
] as const;

const REPORT_METRICS = [
  "sessions",
  "totalUsers",
  "engagedSessions",
  "conversions",
  "screenPageViews",
  "purchaseRevenue",
] as const;

/** Linha crua já parseada do runReport. */
export interface Ga4RawRow {
  channel: string;
  sourceMedium: string;
  campaign: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  conversions: number;
  pageViews: number;
  revenue: number;
}

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Roda o runReport da etapa: período [startDate, endDate] (YYYY-MM-DD), filtrando
 * por página (substring de landingPagePlusQueryString) quando informado. Retorna
 * linhas cruas parseadas (agregação fica em aggregateGa4StageReport).
 */
export async function runGa4Report(
  accessToken: string,
  propertyId: string,
  args: { startDate: string; endDate: string; pageFilter?: string | null },
): Promise<Ga4RawRow[]> {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    dimensions: REPORT_DIMENSIONS.map((name) => ({ name })),
    metrics: REPORT_METRICS.map((name) => ({ name })),
    limit: 10000,
  };
  if (args.pageFilter && args.pageFilter.trim()) {
    body.dimensionFilter = {
      filter: {
        fieldName: "landingPagePlusQueryString",
        stringFilter: { matchType: "CONTAINS", value: args.pageFilter.trim(), caseSensitive: false },
      },
    };
  }

  const res = await fetch(`${GA4_DATA_BASE}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? "";
    } catch { /* corpo não-JSON */ }
    throw new Error(`GA4 Data ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = (await res.json()) as RunReportResponse;
  return (data.rows ?? []).map((r) => {
    const d = r.dimensionValues ?? [];
    const m = r.metricValues ?? [];
    return {
      channel: d[0]?.value ?? "(unknown)",
      sourceMedium: d[1]?.value ?? "(unknown)",
      campaign: d[2]?.value ?? "(not set)",
      sessions: num(m[0]?.value),
      users: num(m[1]?.value),
      engagedSessions: num(m[2]?.value),
      conversions: num(m[3]?.value),
      pageViews: num(m[4]?.value),
      revenue: num(m[5]?.value),
    };
  });
}

// ============================================================
// Agregação pura (testável sem rede)
// ============================================================

export interface Ga4StageDashboard {
  totals: {
    sessions: number;
    users: number;
    engagedSessions: number;
    /** engagedSessions / sessions (0..1), ou 0 sem sessões. */
    engagementRate: number;
    conversions: number;
    pageViews: number;
    revenue: number;
  };
  byChannel: Array<{ channel: string; sessions: number; conversions: number }>;
  topSources: Array<{ sourceMedium: string; sessions: number; conversions: number }>;
  topCampaigns: Array<{ campaign: string; sessions: number; conversions: number; revenue: number }>;
}

function topBy<T extends { sessions: number }>(map: Map<string, T>, n: number): T[] {
  return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions).slice(0, n);
}

/** Agrega as linhas cruas em totais + quebras por canal/origem/campanha. */
export function aggregateGa4StageReport(rows: Ga4RawRow[]): Ga4StageDashboard {
  const totals = { sessions: 0, users: 0, engagedSessions: 0, conversions: 0, pageViews: 0, revenue: 0 };
  const byChannel = new Map<string, { channel: string; sessions: number; conversions: number }>();
  const bySource = new Map<string, { sourceMedium: string; sessions: number; conversions: number }>();
  const byCampaign = new Map<string, { campaign: string; sessions: number; conversions: number; revenue: number }>();

  for (const r of rows) {
    totals.sessions += r.sessions;
    totals.users += r.users;
    totals.engagedSessions += r.engagedSessions;
    totals.conversions += r.conversions;
    totals.pageViews += r.pageViews;
    totals.revenue += r.revenue;

    const ch = byChannel.get(r.channel) ?? { channel: r.channel, sessions: 0, conversions: 0 };
    ch.sessions += r.sessions; ch.conversions += r.conversions;
    byChannel.set(r.channel, ch);

    const sm = bySource.get(r.sourceMedium) ?? { sourceMedium: r.sourceMedium, sessions: 0, conversions: 0 };
    sm.sessions += r.sessions; sm.conversions += r.conversions;
    bySource.set(r.sourceMedium, sm);

    const cp = byCampaign.get(r.campaign) ?? { campaign: r.campaign, sessions: 0, conversions: 0, revenue: 0 };
    cp.sessions += r.sessions; cp.conversions += r.conversions; cp.revenue += r.revenue;
    byCampaign.set(r.campaign, cp);
  }

  return {
    totals: {
      ...totals,
      engagementRate: totals.sessions > 0 ? totals.engagedSessions / totals.sessions : 0,
    },
    byChannel: topBy(byChannel, 12),
    topSources: topBy(bySource, 8),
    topCampaigns: topBy(byCampaign, 8),
  };
}

// ============================================================
// Helper de data — YYYY-MM-DD UTC de `hoje - days`
// ============================================================

export function ymdDaysAgo(days: number, ref: Date = new Date()): string {
  const ms = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() - days, 0, 0, 0, 0);
  const d = new Date(ms);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}
