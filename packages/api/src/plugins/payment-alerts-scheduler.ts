// Story 38.3: agendador do alerta diário de pagamentos (Evento Presencial).
// Molde: meta-perf-scheduler. Checa a cada 15min se a hora local de São Paulo
// já passou de PAYMENT_ALERT_HOUR (default 8h) e roda o check do dia — o
// last_sent_date por etapa deduplica, então rodar o ciclo várias vezes é
// inofensivo e cobre restarts/deploys depois da hora.

import fp from "fastify-plugin";
import { runPaymentAlerts, hourSaoPaulo } from "../services/event-payment-alerts.js";

const CHECK_INTERVAL_MS = 15 * 60_000;
const DEFAULT_HOUR = 8;

export default fp(async function paymentAlertsSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.PAYMENT_ALERT_ENABLED === "false") {
    fastify.log.info("[payment-alerts] agendador desativado (PAYMENT_ALERT_ENABLED=false)");
    return;
  }

  const hour = fastify.config.PAYMENT_ALERT_HOUR ?? DEFAULT_HOUR;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (running) return;
    if (hourSaoPaulo() < hour) return; // ainda não é hora (SP)
    running = true;
    try {
      const summary = await runPaymentAlerts(fastify);
      if (summary.stagesChecked > 0 || summary.errors.length > 0) {
        fastify.log.info(
          {
            stagesChecked: summary.stagesChecked,
            messagesSent: summary.messagesSent,
            errors: summary.errors,
          },
          "[payment-alerts] ciclo concluído",
        );
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[payment-alerts] falhou");
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, CHECK_INTERVAL_MS);
    if (typeof timer.unref === "function") timer.unref();
  }

  // Warm-up ~30s após o boot (cobre deploy/restart depois da hora do alerta).
  timer = setTimeout(async () => {
    await tick();
    schedule();
  }, 30_000);
  if (typeof timer.unref === "function") timer.unref();
  fastify.log.info(
    `[payment-alerts] ativo — envia a partir das ${String(hour).padStart(2, "0")}:00 (America/Sao_Paulo), check a cada 15min`,
  );

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
