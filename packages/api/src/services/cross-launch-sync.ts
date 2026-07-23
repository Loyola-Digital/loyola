import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { funnels, funnelStages, publicMetricsCache } from "../db/schema.js";
import { readSheetData } from "./google-sheets.js";
import { resolveSalesSheetsForStage } from "./sales-daily-sync.js";
import { classifyRefundStatus, isRefundBucket } from "./sales-status.js";

/**
 * Story 39.I4 (mapeamento do Inácio, jul/22) — CROSS-LAUNCH: recompra entre
 * lançamentos/funis do MESMO projeto, com match server-side por sha256 do
 * e-mail (nunca expõe PII). Responde "quem comprou no funil A comprou depois
 * no funil B?" — a matriz de recompra que hoje só saía de CSV manual.
 *
 * Compute caro (lê TODAS as planilhas de venda do projeto) → cache em
 * public_metrics_cache (scope 'cross-launch', key = projectId), populado por
 * backfill/scheduler; o endpoint público só lê o cache.
 */

export const CROSS_LAUNCH_SCOPE = "cross-launch";

function hashEmail(raw: string): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e) return null;
  return createHash("sha256").update(e).digest("hex");
}

function parseNumberBr(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const normalized = hasComma ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return parseFloat(normalized) || 0;
}

function parseDateIso(val: string | undefined): string | null {
  if (!val) return null;
  const t = val.trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

interface BuyerAgg {
  vendas: number;
  bruto: number;
  first: string | null;
  last: string | null;
}

export interface CrossLaunchPayload {
  funnels: { funnelId: string; name: string; type: string; buyers: number; faturamentoBruto: number }[];
  totalUniqueBuyers: number;
  multiFunnelBuyers: number;
  /** Pares A→B: compradores em comum + quantos compraram em A ANTES de B (recompra direcional). */
  overlaps: {
    funnelA: string;
    funnelB: string;
    sharedBuyers: number;
    aThenB: number;
    bThenA: number;
  }[];
}

export async function computeCrossLaunchForProject(
  db: Database,
  projectId: string,
): Promise<CrossLaunchPayload | null> {
  const funnelRows = await db
    .select({ id: funnels.id, name: funnels.name, type: funnels.type })
    .from(funnels)
    .where(and(eq(funnels.projectId, projectId), isNull(funnels.archivedAt)));
  if (funnelRows.length === 0) return null;

  // funnelId → (emailHash → agg)
  const buyersByFunnel = new Map<string, Map<string, BuyerAgg>>();
  const funnelMeta: CrossLaunchPayload["funnels"] = [];

  for (const funnel of funnelRows) {
    const stages = await db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.funnelId, funnel.id));

    // União das planilhas de venda das etapas (dedup por sheet.id — a mesma
    // planilha pode resolver pra mais de uma etapa).
    const seenSheets = new Set<string>();
    const sheets: Awaited<ReturnType<typeof resolveSalesSheetsForStage>>["sheets"] = [];
    for (const st of stages) {
      const { sheets: s } = await resolveSalesSheetsForStage(db, st.id);
      for (const sheet of s) {
        if (seenSheets.has(sheet.id)) continue;
        seenSheets.add(sheet.id);
        sheets.push(sheet);
      }
    }
    if (sheets.length === 0) continue;

    const buyers = new Map<string, BuyerAgg>();
    let faturamento = 0;
    for (const sheet of sheets) {
      const mapping = (sheet.columnMapping ?? {}) as {
        email?: string;
        transactionId?: string;
        productName?: string;
        valorBruto?: string;
        dataVenda?: string;
        status?: string;
      };
      let data: { headers: string[]; rows: string[][] };
      try {
        data = await readSheetData(sheet.spreadsheetId, sheet.sheetName);
      } catch {
        continue;
      }
      const col = (n?: string) => (n ? data.headers.indexOf(n) : -1);
      const emailIdx = col(mapping.email);
      const txIdx = col(mapping.transactionId);
      const produtoIdx = col(mapping.productName);
      const brutoIdx = col(mapping.valorBruto);
      const dataIdx = col(mapping.dataVenda);
      const statusIdx = col(mapping.status);
      if (emailIdx === -1) continue;

      const seenTx = new Set<string>();
      for (const row of data.rows) {
        const h = hashEmail(row[emailIdx] ?? "");
        if (!h) continue;
        if (statusIdx !== -1 && isRefundBucket(classifyRefundStatus(row[statusIdx], true))) continue;
        const txId = txIdx >= 0 ? (row[txIdx] ?? "").trim() : "";
        const produto = produtoIdx >= 0 ? (row[produtoIdx] ?? "").trim().toLowerCase() : "";
        if (txId) {
          const k = `${sheet.id}|${txId}|${produto}`;
          if (seenTx.has(k)) continue;
          seenTx.add(k);
        }
        const bruto = brutoIdx >= 0 ? parseNumberBr(row[brutoIdx]) : 0;
        const date = dataIdx >= 0 ? parseDateIso(row[dataIdx]) : null;
        faturamento += bruto;
        const b = buyers.get(h) ?? { vendas: 0, bruto: 0, first: null, last: null };
        b.vendas += 1;
        b.bruto += bruto;
        if (date) {
          if (!b.first || date < b.first) b.first = date;
          if (!b.last || date > b.last) b.last = date;
        }
        buyers.set(h, b);
      }
    }
    if (buyers.size === 0) continue;
    buyersByFunnel.set(funnel.id, buyers);
    funnelMeta.push({
      funnelId: funnel.id,
      name: funnel.name,
      type: funnel.type,
      buyers: buyers.size,
      faturamentoBruto: Math.round(faturamento * 100) / 100,
    });
  }

  if (funnelMeta.length === 0) return null;

  // Contagem global + multi-funil
  const funnelsPerBuyer = new Map<string, number>();
  for (const buyers of buyersByFunnel.values()) {
    for (const h of buyers.keys()) funnelsPerBuyer.set(h, (funnelsPerBuyer.get(h) ?? 0) + 1);
  }
  const multiFunnelBuyers = [...funnelsPerBuyer.values()].filter((n) => n >= 2).length;

  // Pares (A,B): interseção + direção pela PRIMEIRA compra em cada funil.
  const overlaps: CrossLaunchPayload["overlaps"] = [];
  const ids = [...buyersByFunnel.keys()];
  const nameById = new Map(funnelMeta.map((f) => [f.funnelId, f.name]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = buyersByFunnel.get(ids[i])!;
      const B = buyersByFunnel.get(ids[j])!;
      const [small, large, smallIsA] = A.size <= B.size ? [A, B, true] : [B, A, false];
      let shared = 0;
      let aThenB = 0;
      let bThenA = 0;
      for (const [h, sb] of small) {
        const lb = large.get(h);
        if (!lb) continue;
        shared++;
        const aAgg = smallIsA ? sb : lb;
        const bAgg = smallIsA ? lb : sb;
        if (aAgg.first && bAgg.first) {
          if (aAgg.first < bAgg.first) aThenB++;
          else if (bAgg.first < aAgg.first) bThenA++;
        }
      }
      if (shared > 0) {
        overlaps.push({
          funnelA: nameById.get(ids[i]) ?? ids[i],
          funnelB: nameById.get(ids[j]) ?? ids[j],
          sharedBuyers: shared,
          aThenB,
          bThenA,
        });
      }
    }
  }
  overlaps.sort((a, b) => b.sharedBuyers - a.sharedBuyers);

  return {
    funnels: funnelMeta,
    totalUniqueBuyers: funnelsPerBuyer.size,
    multiFunnelBuyers,
    overlaps,
  };
}

export interface CrossLaunchSyncSummary {
  projectsProcessed: number;
  projectsSkipped: number;
  errors: { projectId: string; error: string }[];
}

/** Job: recomputa o cross-launch de todos os projetos (ou dos filtrados). */
export async function syncCrossLaunch(
  db: Database,
  opts: { projectIds?: string[]; log?: (msg: string) => void } = {},
): Promise<CrossLaunchSyncSummary> {
  const log = opts.log ?? (() => {});
  const summary: CrossLaunchSyncSummary = { projectsProcessed: 0, projectsSkipped: 0, errors: [] };

  const projectRows = await db
    .selectDistinct({ projectId: funnels.projectId })
    .from(funnels)
    .where(isNull(funnels.archivedAt));

  for (const { projectId } of projectRows) {
    if (opts.projectIds && !opts.projectIds.includes(projectId)) continue;
    try {
      const payload = await computeCrossLaunchForProject(db, projectId);
      if (!payload) {
        summary.projectsSkipped++;
        continue;
      }
      await db
        .insert(publicMetricsCache)
        .values({ projectId, scope: CROSS_LAUNCH_SCOPE, key: projectId, payload, computedAt: new Date() })
        .onConflictDoUpdate({
          target: [publicMetricsCache.projectId, publicMetricsCache.scope, publicMetricsCache.key],
          set: { payload, computedAt: new Date() },
        });
      summary.projectsProcessed++;
      log(`[cross-launch] projeto ${projectId}: ${payload.funnels.length} funis, ${payload.totalUniqueBuyers} compradores únicos, ${payload.multiFunnelBuyers} multi-funil`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push({ projectId, error: msg });
      log(`[cross-launch] ERRO projeto ${projectId}: ${msg}`);
    }
  }
  return summary;
}
