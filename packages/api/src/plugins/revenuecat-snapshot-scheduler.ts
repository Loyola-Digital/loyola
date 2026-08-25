// Story 42.10: coleta diária do overview do RevenueCat. Mesmo desenho do
// `meta-names-scheduler` — roda dentro do processo, auto-reagenda, e nunca
// derruba a API. O horário é fixo porque `active_subscriptions` é snapshot:
// coletar às 3h ou às 23h dá números diferentes para o mesmo "dia", e uma série
// com horário variável não é comparável consigo mesma.

import fp from "fastify-plugin";
import { gravarSnapshotDiario } from "../services/revenuecat-snapshot.js";

const HORA_DA_COLETA = 4;

function msAteProximaHora(hora: number): number {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(hora, 0, 0, 0);
  if (proxima.getTime() <= agora.getTime()) proxima.setDate(proxima.getDate() + 1);
  return proxima.getTime() - agora.getTime();
}

export default fp(async function revenuecatSnapshotSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;

  let timer: NodeJS.Timeout | null = null;

  async function rodar(): Promise<void> {
    try {
      const r = await gravarSnapshotDiario(fastify.db, new Date(), fastify.log);
      fastify.log.info(r, "[rc-snapshot] concluído");
    } catch (err) {
      fastify.log.error(err, "[rc-snapshot] falhou");
    }
  }

  function agendar(): void {
    const delay = msAteProximaHora(HORA_DA_COLETA);
    timer = setTimeout(async () => {
      await rodar();
      agendar();
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
    fastify.log.info(
      `[rc-snapshot] próximo run em ~${Math.round((delay / 3_600_000) * 10) / 10}h (às ${String(HORA_DA_COLETA).padStart(2, "0")}:00 local)`,
    );
  }

  agendar();
  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
