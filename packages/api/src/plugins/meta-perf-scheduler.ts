// Story 36.4: agendador interno que faz o refresh diário da performance Meta
// (insights por ad/campanha/dia) no cache do banco. Molde: meta-names-scheduler.
// Hora local configurável via META_PERF_SYNC_HOUR (default 4h). Desligável via
// META_PERF_SYNC_ENABLED=false (sempre desligado em NODE_ENV=test). Auto-reagenda.

import fp from "fastify-plugin";
import { syncMetaPerformance } from "../services/meta-perf-sync.js";
import { syncLeadOrigin } from "../services/lead-origin-sync.js";

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

export default fp(async function metaPerfSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.META_PERF_SYNC_ENABLED === "false") {
    fastify.log.info("[meta-perf] agendador desativado (META_PERF_SYNC_ENABLED=false)");
    return;
  }

  const hour = fastify.config.META_PERF_SYNC_HOUR ?? 4;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(): Promise<void> {
    const startedAt = Date.now();
    fastify.log.info("[meta-perf] iniciando refresh diário de performance Meta");
    try {
      const summary = await syncMetaPerformance(fastify.db, {
        days: 7,
        log: (m) => fastify.log.info(m),
      });
      fastify.log.info(
        {
          projectsProcessed: summary.projectsProcessed,
          projectsSkipped: summary.projectsSkipped,
          adRowsUpserted: summary.adRowsUpserted,
          campaignsCovered: summary.campaignsCovered,
          errors: summary.errors.length,
          durationMs: Date.now() - startedAt,
        },
        "[meta-perf] concluído",
      );
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[meta-perf] falhou");
    }

    // Leads por origem (Story 36.7) — recomputa o cache no mesmo ciclo.
    try {
      const leads = await syncLeadOrigin(fastify.db, { log: (m) => fastify.log.info(m) });
      fastify.log.info(
        { stagesProcessed: leads.stagesProcessed, stagesSkipped: leads.stagesSkipped, errors: leads.errors.length },
        "[lead-origin] concluído",
      );
    } catch (err) {
      fastify.log.error(err, "[lead-origin] falhou");
    }
  }

  function schedule(): void {
    const delay = msUntilNextRun(hour);
    timer = setTimeout(async () => {
      await runOnce();
      schedule(); // reagenda pro próximo dia
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
    const hrs = Math.round((delay / 3_600_000) * 10) / 10;
    fastify.log.info(
      `[meta-perf] próximo run em ~${hrs}h (às ${String(hour).padStart(2, "0")}:00 local)`,
    );
  }

  schedule();

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
