// Story 18.37: agendador interno que roda o backfill de nomes Meta uma vez por
// dia, na madrugada (hora configurável via META_BACKFILL_HOUR, default 3h local
// do servidor). Roda dentro do processo da API (sempre ligado) — não depende de
// cron externo. Auto-reagenda após cada execução.

import fp from "fastify-plugin";
import { backfillMetaNames } from "../services/meta-names-backfill.js";

/** ms até a próxima ocorrência de `hour:00:00` no horário local. */
function msUntilNextRun(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export default fp(async function metaNamesSchedulerPlugin(fastify) {
  // Nunca agenda em testes.
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.META_BACKFILL_ENABLED === "false") {
    fastify.log.info("[meta-backfill] agendador desativado (META_BACKFILL_ENABLED=false)");
    return;
  }

  const hour = fastify.config.META_BACKFILL_HOUR ?? 3;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<void> {
    const startedAt = Date.now();
    fastify.log.info("[meta-backfill] iniciando backfill diário de nomes Meta");
    try {
      const summary = await backfillMetaNames(fastify.db, {
        log: (m) => fastify.log.info(m),
      });
      fastify.log.info(
        {
          accountsProcessed: summary.accountsProcessed,
          accountsSkipped: summary.accountsSkipped,
          totalUpserts: summary.totalUpserts,
          durationMs: Date.now() - startedAt,
        },
        "[meta-backfill] concluído",
      );
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[meta-backfill] falhou");
    }
  }

  function schedule(): void {
    const delay = msUntilNextRun(hour);
    timer = setTimeout(async () => {
      await runOnce();
      schedule(); // reagenda pro próximo dia
    }, delay);
    // não segura o event loop no shutdown
    if (typeof timer.unref === "function") timer.unref();
    const hrs = Math.round((delay / 3_600_000) * 10) / 10;
    fastify.log.info(`[meta-backfill] próximo run em ~${hrs}h (às ${String(hour).padStart(2, "0")}:00 local)`);
  }

  schedule();

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
