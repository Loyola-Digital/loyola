/**
 * Coleta diária dos grupos do SendFlow.
 *
 * Mesmo desenho do `revenuecat-snapshot-scheduler`: roda dentro do processo,
 * se reagenda e nunca derruba a API.
 *
 * O horário é fixo pelo mesmo motivo que lá: `participantsAmount` é uma FOTO do
 * momento, não um acumulado. Coletar às 3h ou às 23h dá números diferentes para
 * o mesmo dia, e uma série com horário variável não é comparável consigo mesma.
 *
 * Isto é o que tira a planilha do caminho — antes alguém exportava do SendFlow,
 * colava numa aba e o app lia dali.
 */

import fp from "fastify-plugin";
import { and, eq, isNull } from "drizzle-orm";
import { funnels, sendflowConnections } from "../db/schema.js";
import { sincronizarGruposDoSendflow } from "../services/sendflow-groups-sync.js";

const HORA_DA_COLETA = 5;

function msAteProximaHora(hora: number): number {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(hora, 0, 0, 0);
  if (proxima.getTime() <= agora.getTime()) proxima.setDate(proxima.getDate() + 1);
  return proxima.getTime() - agora.getTime();
}

export default fp(async function sendflowGroupsSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;

  let timer: NodeJS.Timeout | null = null;

  async function rodar(): Promise<void> {
    try {
      const conexoes = await fastify.db
        .select({ projectId: sendflowConnections.projectId })
        .from(sendflowConnections);
      if (conexoes.length === 0) return;

      let coletados = 0;
      for (const c of conexoes) {
        // Funil arquivado não acumula mais: o histórico dele já está fechado.
        const ativos = await fastify.db
          .select({ id: funnels.id })
          .from(funnels)
          .where(and(eq(funnels.projectId, c.projectId), isNull(funnels.archivedAt)));

        for (const f of ativos) {
          try {
            const r = await sincronizarGruposDoSendflow(fastify.db, c.projectId, f.id);
            if (r.campanha) coletados += 1;
          } catch (err) {
            // Um funil que falha não pode impedir os outros — e a maioria nem
            // tem campanha no SendFlow.
            fastify.log.warn({ err, funnelId: f.id }, "[sendflow-grupos] funil falhou");
          }
        }
      }
      fastify.log.info({ coletados }, "[sendflow-grupos] coleta concluída");
    } catch (err) {
      fastify.log.error(err, "[sendflow-grupos] coleta falhou");
    }
  }

  function agendar(): void {
    const delay = msAteProximaHora(HORA_DA_COLETA);
    timer = setTimeout(async () => {
      await rodar();
      agendar();
    }, delay);
    if (typeof timer.unref === "function") timer.unref();
  }

  agendar();
  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
