/**
 * Estado do sync Meta por (projeto, conta, tipo). Duas funções:
 * - recordSyncRun: o producer chama ao fim de cada etapa (sucesso ou erro).
 * - getProjectMetaFreshness: as rotas leem para devolver "atualizado há X" ao
 *   painel (max last_success_at do projeto), tornando transparente que o dado
 *   vem do banco e não da Meta ao vivo.
 */
import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { metaSyncState } from "../db/schema.js";

export type MetaSyncKind =
  | "ad-daily"
  | "campaign-daily"
  | "placements"
  | "creatives"
  | "names";

export interface SyncRunResult {
  success: boolean;
  rowsUpserted?: number;
  error?: string | null;
  durationMs?: number;
}

export async function recordSyncRun(
  db: Database,
  projectId: string,
  accountId: string,
  kind: MetaSyncKind,
  result: SyncRunResult,
): Promise<void> {
  const now = new Date();
  await db
    .insert(metaSyncState)
    .values({
      projectId,
      accountId,
      kind,
      lastRunAt: now,
      lastSuccessAt: result.success ? now : null,
      rowsUpserted: result.rowsUpserted ?? 0,
      status: result.success ? "ok" : "error",
      error: result.error ?? null,
      durationMs: result.durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: [metaSyncState.projectId, metaSyncState.accountId, metaSyncState.kind],
      set: {
        lastRunAt: sql`EXCLUDED.last_run_at`,
        // Em falha, EXCLUDED.last_success_at é NULL → COALESCE preserva o último
        // sucesso anterior (não regride o "atualizado há X").
        lastSuccessAt: sql`COALESCE(EXCLUDED.last_success_at, ${metaSyncState.lastSuccessAt})`,
        rowsUpserted: sql`EXCLUDED.rows_upserted`,
        status: sql`EXCLUDED.status`,
        error: sql`EXCLUDED.error`,
        durationMs: sql`EXCLUDED.duration_ms`,
      },
    });
}

export interface MetaFreshness {
  /** ISO do sync de performance mais recente bem-sucedido do projeto, ou null. */
  lastSyncedAt: string | null;
}

export async function getProjectMetaFreshness(
  db: Database,
  projectId: string,
): Promise<MetaFreshness> {
  const rows = await db
    .select({ lastSuccessAt: metaSyncState.lastSuccessAt })
    .from(metaSyncState)
    .where(eq(metaSyncState.projectId, projectId));

  let max: Date | null = null;
  for (const r of rows) {
    if (r.lastSuccessAt && (!max || r.lastSuccessAt.getTime() > max.getTime())) {
      max = r.lastSuccessAt;
    }
  }
  return { lastSyncedAt: max ? max.toISOString() : null };
}
