// Story 36.4: agendador interno que faz o refresh diário da performance Meta
// (insights por ad/campanha/dia) no cache do banco. Molde: meta-names-scheduler.
// Hora local configurável via META_PERF_SYNC_HOUR (default 4h). Desligável via
// META_PERF_SYNC_ENABLED=false (sempre desligado em NODE_ENV=test). Auto-reagenda.

import fp from "fastify-plugin";
import { syncMetaPerformance } from "../services/meta-perf-sync.js";
import { syncLeadOrigin } from "../services/lead-origin-sync.js";
import { syncSurvey } from "../services/survey-aggregation.js";
import { syncSalesDaily } from "../services/sales-daily-sync.js";

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
        days: fastify.config.META_PERF_SYNC_DAYS ?? 14,
        creatives: true, // cadência diária popula também o cache de criativos
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

    // Pesquisa de qualificação (Story 36.7, Buraco 1).
    try {
      const survey = await syncSurvey(fastify.db, { log: (m) => fastify.log.info(m) });
      fastify.log.info(
        { stagesProcessed: survey.stagesProcessed, stagesSkipped: survey.stagesSkipped, errors: survey.errors.length },
        "[survey] concluído",
      );
    } catch (err) {
      fastify.log.error(err, "[survey] falhou");
    }

    // Vendas diárias por origem (Story 36.7, Buraco 3 / Dados Diários).
    try {
      const sales = await syncSalesDaily(fastify.db, { log: (m) => fastify.log.info(m) });
      fastify.log.info(
        { stagesProcessed: sales.stagesProcessed, stagesSkipped: sales.stagesSkipped, errors: sales.errors.length },
        "[sales-daily] concluído",
      );
    } catch (err) {
      fastify.log.error(err, "[sales-daily] falhou");
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

  // ── Cadência INTRADAY ──────────────────────────────────────────────────────
  // Mantém "hoje/recente" fresco no banco (default a cada 15min, janela 3 dias,
  // sem creatives) para os painéis lerem do DB sem nunca chamar a Meta ao vivo.
  let intradayTimer: NodeJS.Timeout | null = null;
  if (fastify.config.META_PERF_INTRADAY_ENABLED !== "false") {
    const intervalMs = (fastify.config.META_PERF_INTRADAY_MINUTES ?? 15) * 60_000;
    const intradayDays = fastify.config.META_PERF_INTRADAY_DAYS ?? 3;
    let intradayRunning = false;

    const runIntraday = async (): Promise<void> => {
      if (intradayRunning) return; // não empilha se o ciclo anterior ainda roda
      intradayRunning = true;
      const startedAt = Date.now();
      try {
        const summary = await syncMetaPerformance(fastify.db, {
          days: intradayDays,
          creatives: false,
          log: (m) => fastify.log.debug(m),
        });
        fastify.log.info(
          {
            projectsProcessed: summary.projectsProcessed,
            accountsProcessed: summary.accountsProcessed,
            adRowsUpserted: summary.adRowsUpserted,
            campaignRowsUpserted: summary.campaignRowsUpserted,
            placementRowsUpserted: summary.placementRowsUpserted,
            errors: summary.errors.length,
            durationMs: Date.now() - startedAt,
          },
          "[meta-perf:intraday] concluído",
        );
      } catch (err) {
        fastify.log.error(err, "[meta-perf:intraday] falhou");
      } finally {
        intradayRunning = false;
      }
    };

    const scheduleIntraday = (): void => {
      intradayTimer = setTimeout(async () => {
        await runIntraday();
        scheduleIntraday();
      }, intervalMs);
      if (typeof intradayTimer.unref === "function") intradayTimer.unref();
    };

    // Warm-up: primeiro ciclo ~20s após o boot (aquece o cache no deploy/restart
    // pra os painéis já lerem do banco), depois segue no intervalo normal. Em
    // tsx watch, restarts rápidos cancelam o timer anterior (onClose) — não acumula.
    intradayTimer = setTimeout(async () => {
      await runIntraday();
      scheduleIntraday();
    }, 20_000);
    if (typeof intradayTimer.unref === "function") intradayTimer.unref();
    fastify.log.info(
      `[meta-perf:intraday] ativo a cada ${Math.round(intervalMs / 60_000)}min (janela ${intradayDays}d), warm-up em ~20s`,
    );
  }

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
    if (intradayTimer) clearTimeout(intradayTimer);
  });
});
