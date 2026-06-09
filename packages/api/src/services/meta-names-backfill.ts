// Story 18.37: Backfill em massa do cache de nomes Meta (meta_entity_names_cache).
//
// Em vez de resolver ID-por-ID (que estoura o rate limit no tier
// `development_access`), puxa a LISTA COMPLETA de ads/adsets/campaigns de cada
// conta via os edges /act_<id>/{ads,adsets,campaigns} (paginado, ~17 chamadas
// por conta) e faz upsert no cache pra cada projeto vinculado à conta.
//
// Usado por: scheduler diário (plugins/meta-names-scheduler.ts) e CLI
// (scripts/backfill-meta-names.ts).

import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  metaAdsAccounts,
  metaAdsAccountProjects,
  metaEntityNamesCache,
} from "../db/schema.js";
import { decryptAccountToken } from "./meta-ads.js";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";
const PAGE_LIMIT = 500;
const THROTTLE_MS = 400; // entre páginas/edges — conservador pro tier development
const UPSERT_CHUNK = 1000;

type EdgeName = "ads" | "adsets" | "campaigns";
const EDGE_TO_ENTITY: Record<EdgeName, "ad" | "adset" | "campaign"> = {
  ads: "ad",
  adsets: "adset",
  campaigns: "campaign",
};

export interface BackfillOptions {
  /** Restringe a uma conta Meta (meta_account_id da Meta, não o uuid interno). */
  onlyMetaAccountId?: string;
  /** Logger opcional (default: console.log). */
  log?: (msg: string) => void;
}

export interface BackfillSummary {
  accountsProcessed: number;
  accountsSkipped: number;
  totalUpserts: number;
  perAccount: Array<{
    metaAccountId: string;
    ads: number;
    adsets: number;
    campaigns: number;
    projects: number;
    error?: string;
  }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Puxa todos os objetos {id,name} de um edge, paginado. Inclui arquivados/pausados. */
async function fetchAllEdge(
  metaAccountId: string,
  edge: EdgeName,
  token: string,
): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  const filtering = encodeURIComponent(
    JSON.stringify([
      {
        field: "effective_status",
        operator: "IN",
        value: [
          "ACTIVE",
          "PAUSED",
          "ARCHIVED",
          "DELETED",
          "CAMPAIGN_PAUSED",
          "ADSET_PAUSED",
          "DISAPPROVED",
          "PENDING_REVIEW",
          "IN_PROCESS",
          "WITH_ISSUES",
        ],
      },
    ]),
  );
  let url: string | null = `${GRAPH_API_BASE}/act_${metaAccountId}/${edge}?fields=id,name&limit=${PAGE_LIMIT}&filtering=${filtering}&access_token=${token}`;
  while (url) {
    const res: Response = await fetch(url);
    const body = (await res.json()) as {
      data?: Array<{ id: string; name?: string }>;
      paging?: { next?: string };
      error?: unknown;
    };
    if (!res.ok) {
      const usage = res.headers.get("x-business-use-case-usage") ?? "";
      throw new Error(
        `${edge} HTTP ${res.status}: ${JSON.stringify(body?.error ?? body)} | usage=${usage.slice(0, 200)}`,
      );
    }
    for (const o of body.data ?? []) {
      if (o.id && o.name) out.push({ id: o.id, name: o.name });
    }
    url = body.paging?.next ?? null;
    if (url) await sleep(THROTTLE_MS);
  }
  return out;
}

async function upsert(
  db: Database,
  projectId: string,
  entityType: "ad" | "adset" | "campaign",
  rows: Array<{ id: string; name: string }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({
      projectId,
      entityType,
      entityId: r.id,
      // entity_name é varchar(500) — trunca defensivamente
      entityName: r.name.slice(0, 500),
      lastSyncedAt: now,
    }));
    await db
      .insert(metaEntityNamesCache)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          metaEntityNamesCache.projectId,
          metaEntityNamesCache.entityType,
          metaEntityNamesCache.entityId,
        ],
        set: {
          entityName: sql`excluded.entity_name`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      });
  }
  return rows.length;
}

/**
 * Executa o backfill de nomes Meta pra todas as contas (ou uma específica).
 * Resiliente: falha de uma conta não interrompe as demais.
 */
export async function backfillMetaNames(
  db: Database,
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const summary: BackfillSummary = {
    accountsProcessed: 0,
    accountsSkipped: 0,
    totalUpserts: 0,
    perAccount: [],
  };

  const accounts = await db
    .select({
      id: metaAdsAccounts.id,
      metaAccountId: metaAdsAccounts.metaAccountId,
      enc: metaAdsAccounts.accessTokenEncrypted,
      iv: metaAdsAccounts.accessTokenIv,
    })
    .from(metaAdsAccounts);

  const filtered = opts.onlyMetaAccountId
    ? accounts.filter((a) => a.metaAccountId === opts.onlyMetaAccountId)
    : accounts;

  log(`[meta-backfill] contas a processar: ${filtered.length}`);

  for (const acc of filtered) {
    const links = await db
      .select({ projectId: metaAdsAccountProjects.projectId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.accountId, acc.id));

    if (links.length === 0) {
      summary.accountsSkipped++;
      log(`[meta-backfill] act_${acc.metaAccountId}: sem projeto vinculado — pulando`);
      continue;
    }

    let token: string;
    try {
      token = decryptAccountToken(acc.enc, acc.iv);
    } catch (err) {
      summary.accountsSkipped++;
      summary.perAccount.push({
        metaAccountId: acc.metaAccountId,
        ads: 0,
        adsets: 0,
        campaigns: 0,
        projects: links.length,
        error: `decrypt falhou: ${err instanceof Error ? err.message : String(err)}`,
      });
      log(`[meta-backfill] act_${acc.metaAccountId}: decrypt falhou — pulando`);
      continue;
    }

    try {
      const edges: Record<EdgeName, Array<{ id: string; name: string }>> = {
        ads: [],
        adsets: [],
        campaigns: [],
      };
      for (const edge of ["ads", "adsets", "campaigns"] as EdgeName[]) {
        edges[edge] = await fetchAllEdge(acc.metaAccountId, edge, token);
        await sleep(THROTTLE_MS);
      }

      let perAccountUpserts = 0;
      for (const link of links) {
        for (const edge of ["ads", "adsets", "campaigns"] as EdgeName[]) {
          perAccountUpserts += await upsert(
            db,
            link.projectId,
            EDGE_TO_ENTITY[edge],
            edges[edge],
          );
        }
      }

      summary.accountsProcessed++;
      summary.totalUpserts += perAccountUpserts;
      summary.perAccount.push({
        metaAccountId: acc.metaAccountId,
        ads: edges.ads.length,
        adsets: edges.adsets.length,
        campaigns: edges.campaigns.length,
        projects: links.length,
      });
      log(
        `[meta-backfill] act_${acc.metaAccountId}: ${edges.ads.length} ads, ${edges.adsets.length} adsets, ${edges.campaigns.length} campaigns → ${links.length} projeto(s)`,
      );
    } catch (err) {
      summary.accountsSkipped++;
      summary.perAccount.push({
        metaAccountId: acc.metaAccountId,
        ads: 0,
        adsets: 0,
        campaigns: 0,
        projects: links.length,
        error: err instanceof Error ? err.message : String(err),
      });
      log(`[meta-backfill] act_${acc.metaAccountId}: erro ao puxar edges — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return summary;
}
