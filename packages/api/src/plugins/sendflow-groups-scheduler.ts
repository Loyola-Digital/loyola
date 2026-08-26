/**
 * Coleta diária do SendFlow: snapshot dos grupos + disparos no Log de Campanha.
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
import { isNull } from "drizzle-orm";
import { funnels, sendflowConnections } from "../db/schema.js";
import {
  abrirSessao,
  sincronizarDisparosNoLog,
  sincronizarGruposDoSendflow,
} from "../services/sendflow-groups-sync.js";

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
      const conexoes = await fastify.db.select({ id: sendflowConnections.id }).from(sendflowConnections);
      if (conexoes.length === 0) return;

      // Varre os FUNIS, não as conexões: o SendFlow é uma conta global, então
      // uma linha só atende todos os projetos. Quem resolve qual conexão vale
      // é o serviço (projeto primeiro, global como padrão).
      const ativos = await fastify.db
        .select({ id: funnels.id, projectId: funnels.projectId })
        .from(funnels)
        // Funil arquivado não acumula mais: o histórico dele já está fechado.
        .where(isNull(funnels.archivedAt));

      if (ativos.length === 0) return;

      // UMA sessão pra varredura inteira. Uma por funil fazia 9 refreshes e 9
      // sessões em segundos, e o servidor começava a recusar no meio.
      const sessao = await abrirSessao(fastify.db, ativos[0].projectId);
      if (!sessao) return;

      let coletados = 0;
      let linhasNoLog = 0;
      for (const f of ativos) {
        try {
          const r = await sincronizarGruposDoSendflow(fastify.db, f.projectId, f.id, sessao);
          // Sem campanha casada não há o que fazer — e é o caso da maioria dos
          // funis, que são de expert sem operação de WhatsApp.
          if (!r.campanha) continue;
          coletados += 1;
          // O log também: assim a pessoa ABRE a página e os disparos já estão
          // lá, em vez de precisar clicar em Sincronizar pra vê-los.
          const log = await sincronizarDisparosNoLog(fastify.db, f.projectId, f.id, sessao);
          linhasNoLog += log.criados;
        } catch (err) {
          // Um funil que falha não pode impedir os outros.
          fastify.log.warn({ err, funnelId: f.id }, "[sendflow] funil falhou");
        }
      }
      fastify.log.info({ coletados, linhasNoLog }, "[sendflow] coleta diária concluída");
    } catch (err) {
      fastify.log.error(err, "[sendflow] coleta falhou");
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
