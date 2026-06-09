// Story 32.1 — Cliente da REST API do Mautic (Basic Auth).
//
// Auth: header `Authorization: Basic base64(username:password)`. Base `{url}/api`.
// Endpoints usados:
//   GET /api/campaigns            → lista campanhas (objeto keyed por id)
//   GET /api/campaigns/{id}       → campanha + events[] (email.send → properties.email)
//   GET /api/emails/{id}          → email com sentCount / readCount (aberturas)
//
// Limitação conhecida: cliques NÃO vêm no objeto email padrão da API nem em
// endpoint dedicado — só `sentCount` (enviados) e `readCount` (aberturas).

import { encrypt, decrypt } from "./encryption.js";

export interface MauticCampaign {
  id: string;
  name: string;
}

export interface MauticEmailStats {
  /** Nº de emails (email.send) na campanha. */
  emailCount: number;
  sent: number;
  opens: number;
  /** opens / sent (0..1). null se sent === 0. */
  openRate: number | null;
  /** Cliques únicos (channel_url_trackables.unique_hits). null se /api/stats indisponível. */
  clicks: number | null;
  /** clicks / sent (0..1). null se clicks/sent indisponível. */
  clickRate: number | null;
  /** Bounces (lead_donotcontact reason=1). null se indisponível. */
  bounces: number | null;
  /** Descadastros (lead_donotcontact reason=2). null se indisponível. */
  unsubscribes: number | null;
  /** false quando o endpoint /api/stats não respondeu (ex.: usuário não-admin). */
  statsAvailable: boolean;
}

export function encryptMauticPassword(plaintext: string): { encrypted: string; iv: string } {
  return encrypt(plaintext);
}

export function decryptMauticPassword(encrypted: string, iv: string): string {
  return decrypt(encrypted, iv);
}

/** Remove barra final pra montar `${base}/api/...` de forma previsível. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function mauticFetch<T>(
  baseUrl: string,
  username: string,
  password: string,
  path: string,
): Promise<T> {
  const url = `${normalizeBaseUrl(baseUrl)}/api${path}`;
  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { errors?: Array<{ message?: string }> };
      detail = body?.errors?.[0]?.message ?? "";
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(`Mautic API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Testa as credenciais batendo num endpoint leve. Lança erro com mensagem
 * legível se falhar (credencial inválida, Basic Auth desabilitado, URL errada).
 */
export async function testMauticConnection(
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> {
  // /api/campaigns?limit=1 é leve e exige auth válida.
  await mauticFetch<unknown>(baseUrl, username, password, "/campaigns?limit=1");
}

type MauticCampaignsResponse = {
  total?: number | string;
  campaigns?: Record<string, { id: number | string; name: string }>;
};

/** Lista campanhas (id+name). Mautic retorna `campaigns` como objeto keyed por id. */
export async function listMauticCampaigns(
  baseUrl: string,
  username: string,
  password: string,
): Promise<MauticCampaign[]> {
  const data = await mauticFetch<MauticCampaignsResponse>(
    baseUrl,
    username,
    password,
    "/campaigns?limit=200&orderBy=name&orderByDir=ASC",
  );
  const campaignsObj = data.campaigns ?? {};
  return Object.values(campaignsObj).map((c) => ({
    id: String(c.id),
    name: c.name,
  }));
}

type MauticCampaignDetailResponse = {
  campaign?: {
    id: number | string;
    name: string;
    events?: Record<
      string,
      { type?: string; eventType?: string; properties?: { email?: number | string } }
    >;
  };
};

type MauticEmailResponse = {
  email?: { id: number | string; sentCount?: number | string; readCount?: number | string };
};

// ---- /api/stats/{table} — acesso granular às tabelas internas do Mautic ----
type StatsWhere = { col: string; expr: string; val: string | number };
type MauticStatsResponse = { total?: number | string; stats?: Array<Record<string, unknown>> };

/** Monta o path /stats/{table}?where[i][col/expr/val]=...&limit=... (chaves codificadas). */
function buildStatsPath(table: string, wheres: StatsWhere[], limit: number, start = 0): string {
  const parts: string[] = [];
  wheres.forEach((w, i) => {
    parts.push(`${encodeURIComponent(`where[${i}][col]`)}=${encodeURIComponent(w.col)}`);
    parts.push(`${encodeURIComponent(`where[${i}][expr]`)}=${encodeURIComponent(w.expr)}`);
    parts.push(`${encodeURIComponent(`where[${i}][val]`)}=${encodeURIComponent(String(w.val))}`);
  });
  parts.push(`limit=${limit}`);
  parts.push(`start=${start}`);
  return `/stats/${table}?${parts.join("&")}`;
}

/** Retorna `total` (contagem filtrada) sem baixar as linhas (limit=1). */
async function statsTotal(
  baseUrl: string,
  username: string,
  password: string,
  table: string,
  wheres: StatsWhere[],
): Promise<number> {
  const data = await mauticFetch<MauticStatsResponse>(
    baseUrl,
    username,
    password,
    buildStatsPath(table, wheres, 1),
  );
  return Number(data.total ?? 0) || 0;
}

/** Retorna as linhas (até `limit`) de uma tabela de stats. */
async function statsRows(
  baseUrl: string,
  username: string,
  password: string,
  table: string,
  wheres: StatsWhere[],
  limit = 1000,
): Promise<Array<Record<string, unknown>>> {
  const data = await mauticFetch<MauticStatsResponse>(
    baseUrl,
    username,
    password,
    buildStatsPath(table, wheres, limit),
  );
  return data.stats ?? [];
}

/**
 * Agrega métricas de email de uma campanha: percorre os events `email.send`,
 * pega os email ids e soma sentCount/readCount de cada email.
 */
export async function getMauticCampaignEmailStats(
  baseUrl: string,
  username: string,
  password: string,
  campaignId: string,
): Promise<MauticEmailStats> {
  const detail = await mauticFetch<MauticCampaignDetailResponse>(
    baseUrl,
    username,
    password,
    `/campaigns/${encodeURIComponent(campaignId)}`,
  );
  const events = detail.campaign?.events ?? {};
  // Coleta email ids únicos dos events de envio de email.
  const emailIds = new Set<string>();
  for (const ev of Object.values(events)) {
    const isEmailSend =
      ev.type === "email.send" || ev.eventType === "email.send" || ev.type === "email.send.email";
    const emailId = ev.properties?.email;
    if (isEmailSend && emailId != null && String(emailId).trim() !== "") {
      emailIds.add(String(emailId));
    }
  }

  let sent = 0;
  let opens = 0;
  // Stats granulares (cliques/bounces/descadastros) via /api/stats — método do
  // Danilo. /api/stats exige usuário admin; se qualquer chamada falhar, degrada
  // pra só enviados+aberturas (statsAvailable=false).
  let statsAvailable = true;
  let clicks = 0;
  let bounces = 0;
  let unsubscribes = 0;

  for (const emailId of emailIds) {
    // Enviados + aberturas: do objeto email (1 chamada, sempre disponível).
    try {
      const emailResp = await mauticFetch<MauticEmailResponse>(
        baseUrl,
        username,
        password,
        `/emails/${encodeURIComponent(emailId)}`,
      );
      sent += Number(emailResp.email?.sentCount ?? 0) || 0;
      opens += Number(emailResp.email?.readCount ?? 0) || 0;
    } catch {
      // Email individual falhou — segue agregando os demais.
    }

    if (!statsAvailable) continue;
    try {
      // Cliques únicos: soma unique_hits de todos os links rastreados do email.
      const trackables = await statsRows(baseUrl, username, password, "channel_url_trackables", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: emailId },
      ]);
      for (const row of trackables) clicks += Number(row.unique_hits ?? 0) || 0;

      // Bounces (reason=1) e descadastros (reason=2) por email.
      bounces += await statsTotal(baseUrl, username, password, "lead_donotcontact", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: emailId },
        { col: "reason", expr: "eq", val: 1 },
      ]);
      unsubscribes += await statsTotal(baseUrl, username, password, "lead_donotcontact", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: emailId },
        { col: "reason", expr: "eq", val: 2 },
      ]);
    } catch {
      // /api/stats indisponível (provável: usuário não-admin) — degrada gracioso.
      statsAvailable = false;
    }
  }

  return {
    emailCount: emailIds.size,
    sent,
    opens,
    openRate: sent > 0 ? opens / sent : null,
    clicks: statsAvailable ? clicks : null,
    clickRate: statsAvailable && sent > 0 ? clicks / sent : null,
    bounces: statsAvailable ? bounces : null,
    unsubscribes: statsAvailable ? unsubscribes : null,
    statsAvailable,
  };
}

// ============================================================
// Story 32.2 — Dashboard geral de emails (não por campanha).
// Lista TODOS os emails (paginado) + enriquece com cliques/bounces/descadastros.
// "Tag" do funil = código no nome do email (ex.: [dg-pg02-abr-26]).
// ============================================================

export interface MauticEmailRow {
  id: string;
  name: string;
  /** "template" (campanha) | "list" (disparo direto) | null. */
  emailType: string | null;
  sent: number;
  opens: number;
  openRate: number | null;
  clicks: number | null;
  clickRate: number | null;
  bounces: number | null;
  unsubscribes: number | null;
}

export interface MauticEmailsDashboard {
  emails: MauticEmailRow[];
  /** false quando /api/stats não respondeu (cliques/bounces ficam null). */
  statsAvailable: boolean;
}

/** Executa `fn` sobre `items` com no máx. `limit` em paralelo. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return results;
}

type MauticEmailsListResponse = {
  total?: number | string;
  emails?: Record<string, { id: number | string; name: string; emailType?: string; sentCount?: number | string; readCount?: number | string }>;
};

/** Lista TODOS os emails (paginado) com sent/opens do próprio objeto. */
export async function listAllMauticEmails(
  baseUrl: string,
  username: string,
  password: string,
): Promise<MauticEmailRow[]> {
  const out: MauticEmailRow[] = [];
  const pageSize = 100;
  for (let start = 0; start < 5000; start += pageSize) {
    const data = await mauticFetch<MauticEmailsListResponse>(
      baseUrl,
      username,
      password,
      `/emails?limit=${pageSize}&start=${start}&orderBy=name&orderByDir=ASC`,
    );
    const emailsObj = data.emails ?? {};
    const rows = Object.values(emailsObj);
    for (const e of rows) {
      const sent = Number(e.sentCount ?? 0) || 0;
      const opens = Number(e.readCount ?? 0) || 0;
      out.push({
        id: String(e.id),
        name: e.name,
        emailType: e.emailType ?? null,
        sent,
        opens,
        openRate: sent > 0 ? opens / sent : null,
        clicks: null,
        clickRate: null,
        bounces: null,
        unsubscribes: null,
      });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Dashboard geral: lista todos os emails e enriquece cada um com cliques
 * (channel_url_trackables) + bounces/descadastros (lead_donotcontact) via
 * /api/stats. Degrada gracioso se /api/stats exigir admin.
 */
export async function getMauticEmailsDashboard(
  baseUrl: string,
  username: string,
  password: string,
): Promise<MauticEmailsDashboard> {
  const emails = await listAllMauticEmails(baseUrl, username, password);
  let statsAvailable = true;

  await mapWithConcurrency(emails, 6, async (row) => {
    if (!statsAvailable) return;
    try {
      const trackables = await statsRows(baseUrl, username, password, "channel_url_trackables", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: row.id },
      ]);
      let clicks = 0;
      for (const t of trackables) clicks += Number(t.unique_hits ?? 0) || 0;
      const bounces = await statsTotal(baseUrl, username, password, "lead_donotcontact", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: row.id },
        { col: "reason", expr: "eq", val: 1 },
      ]);
      const unsubscribes = await statsTotal(baseUrl, username, password, "lead_donotcontact", [
        { col: "channel", expr: "eq", val: "email" },
        { col: "channel_id", expr: "eq", val: row.id },
        { col: "reason", expr: "eq", val: 2 },
      ]);
      row.clicks = clicks;
      row.clickRate = row.sent > 0 ? clicks / row.sent : null;
      row.bounces = bounces;
      row.unsubscribes = unsubscribes;
    } catch {
      statsAvailable = false;
    }
  });

  return { emails, statsAvailable };
}

/**
 * Auto-match: acha a campanha cujo nome contém o token do funil (ex.: "fz-l2").
 * Case-insensitive, ignora espaços nas pontas. Retorna a 1ª que casar (nome
 * mais curto primeiro, pra evitar pegar uma variante mais específica por engano).
 */
export function matchCampaignByName(
  campaigns: MauticCampaign[],
  token: string,
): MauticCampaign | null {
  const needle = token.trim().toLowerCase();
  if (!needle) return null;
  const matches = campaigns
    .filter((c) => c.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.length - b.name.length);
  return matches[0] ?? null;
}
