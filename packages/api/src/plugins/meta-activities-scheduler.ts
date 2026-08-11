// Job periódico que traz o histórico de alterações da Meta pro Log de Campanha
// (verba, liga/desliga, público, criativos). Molde: meta-perf-scheduler intraday.
//
// Cadência em MINUTOS, não diária: mudança de verba durante o lançamento é a
// informação que o time consulta no mesmo dia — um sync noturno chegaria tarde
// demais pra ser útil no debriefing.
//
// Desligável via META_ACTIVITIES_ENABLED=false (sempre desligado em
// NODE_ENV=test). Intervalo: META_ACTIVITIES_MINUTES (default 30).
// Janela: META_ACTIVITIES_DAYS (default 7) — sobreposição é de propósito, o
// sourceId deduplica e assim nada se perde se um ciclo falhar.

import fp from "fastify-plugin";
import { syncMetaActivityLog } from "../services/meta-activity-log-sync.js";

export default fp(async function metaActivitiesSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.META_ACTIVITIES_ENABLED === "false") {
    fastify.log.info("[meta-activities] agendador desativado (META_ACTIVITIES_ENABLED=false)");
    return;
  }

  const minutos = fastify.config.META_ACTIVITIES_MINUTES ?? 30;
  const dias = fastify.config.META_ACTIVITIES_DAYS ?? 7;
  const intervalMs = minutos * 60_000;

  let timer: NodeJS.Timeout | null = null;
  let rodando = false;

  async function runOnce(): Promise<void> {
    // Guarda contra sobreposição: uma conta grande pode levar mais que o
    // intervalo, e dois ciclos simultâneos só desperdiçariam chamada de API.
    if (rodando) {
      fastify.log.info("[meta-activities] ciclo anterior ainda rodando — pulando");
      return;
    }
    rodando = true;
    const inicio = Date.now();
    try {
      const resumo = await syncMetaActivityLog(fastify.db, {
        days: dias,
        log: (m) => fastify.log.info(m),
      });
      fastify.log.info(
        {
          accountsProcessed: resumo.accountsProcessed,
          activitiesFetched: resumo.activitiesFetched,
          entriesCreated: resumo.entriesCreated,
          semFunil: resumo.semFunil,
          errors: resumo.errors.length,
          durationMs: Date.now() - inicio,
        },
        "[meta-activities] concluído",
      );
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[meta-activities] falhou");
    } finally {
      rodando = false;
    }
  }

  const agendar = (): void => {
    timer = setTimeout(async () => {
      await runOnce();
      agendar();
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  };

  // Warm-up ~40s após o boot: escalonado em relação ao meta-perf (20s) pra os
  // dois não baterem na Graph API ao mesmo tempo no restart.
  timer = setTimeout(async () => {
    await runOnce();
    agendar();
  }, 40_000);
  if (typeof timer.unref === "function") timer.unref();

  fastify.log.info(
    `[meta-activities] ativo a cada ${minutos}min (janela ${dias}d), warm-up em ~40s`,
  );

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
