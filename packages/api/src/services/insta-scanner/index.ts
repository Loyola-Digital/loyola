/**
 * Spy de Conteúdo — orquestração de um scan e o consumo da fila.
 *
 * A rota HTTP só enfileira (`status: queued`); quem executa é o worker, que
 * roda no mesmo processo da API. O scan leva ~5min (2 runs Apify + análise
 * Claude), então prender a requisição seria inviável.
 *
 * Concorrência: `claimNextScan` usa `FOR UPDATE SKIP LOCKED`, então N workers
 * (ou N ticks paralelos) pegam jobs diferentes sem coordenação — e continua
 * correto se um dia a API subir com mais de uma instância.
 */

import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { instagramScans } from "../../db/schema.js";
import { analyzeProfile } from "./analyzer.js";
import { computeMetrics } from "./metrics.js";
import { scrapeProfile } from "./scraper.js";

export { normalizeUsername } from "./scraper.js";
export type * from "./types.js";

/** Job preso em `running` por mais que isto é considerado órfão e re-enfileirado. */
const STALE_LEASE_MS = 20 * 60 * 1000;

export interface ScanRunnerConfig {
  apifyToken: string;
  anthropicKey: string;
  apifyActor?: string;
  model?: string;
  effort?: string;
}

/**
 * Pega o próximo scan da fila e o marca como `running`, atomicamente.
 *
 * Inclui jobs órfãos (running com lease vencido): se o processo morreu no meio
 * de um scan, sem isso o job ficaria travado em `running` para sempre.
 */
export async function claimNextScan(db: Database): Promise<typeof instagramScans.$inferSelect | null> {
  const staleBefore = new Date(Date.now() - STALE_LEASE_MS);

  const rows = await db.execute<{ id: string }>(sql`
    SELECT id FROM ${instagramScans}
    WHERE status = 'queued'
       OR (status = 'running' AND claimed_at < ${staleBefore})
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  const id = rows.rows?.[0]?.id;
  if (!id) return null;

  const now = new Date();
  const [claimed] = await db
    .update(instagramScans)
    .set({ status: "running", claimedAt: now, startedAt: now, updatedAt: now })
    .where(eq(instagramScans.id, id))
    .returning();
  return claimed ?? null;
}

/**
 * Executa um scan de ponta a ponta e grava o resultado.
 *
 * Nunca lança: qualquer erro vira `status: failed` com a mensagem, que o front
 * mostra no card. Um perfil privado ou inexistente é o caso mais comum.
 */
export async function runScan(
  db: Database,
  scan: typeof instagramScans.$inferSelect,
  config: ScanRunnerConfig,
  log: (msg: string) => void = () => {},
): Promise<void> {
  const params = scan.params ?? { limit: 120, since: null, tzOffset: -3 };
  try {
    log(`[spy] @${scan.username}: coletando (limite ${params.limit})`);
    const scraped = await scrapeProfile(scan.username, {
      token: config.apifyToken,
      actor: config.apifyActor,
      limit: params.limit,
      since: params.since,
      onProgress: (m) => log(`[spy] @${scan.username}: ${m}`),
    });

    if (!scraped.posts.length) {
      throw new Error("Nenhuma publicação foi coletada — não há o que analisar.");
    }

    const metrics = computeMetrics(scraped.profile, scraped.posts, { tzOffset: params.tzOffset });
    log(
      `[spy] @${scan.username}: ${metrics.totais.analisados} publicações · ` +
        `engajamento médio ${metrics.engajamento.media}`,
    );

    // Métricas ficam salvas ANTES da análise: se a Claude falhar (recusa,
    // truncamento, timeout), o scan ainda entrega os números em vez de nada.
    await db
      .update(instagramScans)
      .set({
        profile: scraped.profile as unknown as Record<string, unknown>,
        metrics: metrics as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(instagramScans.id, scan.id));

    const { analysis, usage } = await analyzeProfile({
      apiKey: config.anthropicKey,
      profile: scraped.profile,
      metrics,
      posts: scraped.posts,
      model: config.model,
      effort: config.effort,
      onProgress: (m) => log(`[spy] @${scan.username}: ${m}`),
    });

    await db
      .update(instagramScans)
      .set({
        status: "done",
        analysis: analysis as unknown as Record<string, unknown>,
        usage,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(instagramScans.id, scan.id));

    log(
      `[spy] @${scan.username}: pronto — ${analysis.pilares_conteudo.length} pilares, ` +
        `${analysis.insights_conteudo.length} insights · ${usage.inputTokens} tokens in`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[spy] @${scan.username}: ERRO — ${message}`);

    // Se as métricas já foram gravadas, mantém o scan utilizável: marca done
    // com o erro anotado em vez de failed (o front mostra os números e avisa
    // que a análise qualitativa não saiu).
    const [current] = await db
      .select({ metrics: instagramScans.metrics })
      .from(instagramScans)
      .where(eq(instagramScans.id, scan.id))
      .limit(1);
    const temMetricas = !!current?.metrics;

    await db
      .update(instagramScans)
      .set({
        status: temMetricas ? "done" : "failed",
        error: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(instagramScans.id, scan.id));
  }
}

/** Quantos scans estão na fila ou rodando — usado pelo front pra mostrar posição. */
export async function queueDepth(db: Database): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(instagramScans)
    .where(or(eq(instagramScans.status, "queued"), eq(instagramScans.status, "running")));
  return row?.n ?? 0;
}

/** Scans que ainda estão pendentes há mais tempo que o esperado (diagnóstico). */
export async function stuckScans(db: Database): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_LEASE_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(instagramScans)
    .where(and(eq(instagramScans.status, "running"), lt(instagramScans.claimedAt, staleBefore)));
  return row?.n ?? 0;
}

/** Ordem da fila — o front usa pra estimar espera. */
export const QUEUE_ORDER = asc(instagramScans.createdAt);
