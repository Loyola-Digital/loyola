/**
 * Mantém o Planner e a agenda do Google em dia, sozinho.
 *
 * ## Por que a direção Google → Planner precisa de agendador
 *
 * A outra direção não precisa: salvar uma campanha já escreve no Google na
 * mesma requisição. Mas quando alguém mexe na agenda pelo Google Calendar,
 * nada avisa o Planner — a única forma de descobrir é perguntar de tempos em
 * tempos. Sem isso, "sincronizado" dependia de alguém lembrar de clicar em
 * Importar.
 *
 * ## Reenviar ANTES de importar
 *
 * Esta é a decisão que impede a sincronização automática de destruir trabalho.
 *
 * Quando a escrita no Google falha, a fase fica marcada como pendente: a versão
 * boa está aqui, a velha está lá. Se o ciclo importasse primeiro, traria a
 * velha por cima da boa e a edição sumiria — sem erro, sem aviso, como se
 * ninguém tivesse mexido. Reenviando primeiro, as duas pontas passam a
 * concordar, e a importação seguinte não tem o que desfazer.
 *
 * ## Rodar demais não estraga nada
 *
 * A importação é idempotente: fase que veio do Google é casada por
 * `googleEventId` e atualizada no lugar, nunca somada. Um ciclo a mais custa
 * chamadas de API, não dados.
 */

import fp from "fastify-plugin";
import { plannerGoogleCalendars } from "../db/schema.js";
import {
  atualizarEvento,
  emailDaServiceAccount,
  tituloParaGoogle,
} from "../services/planner-google.js";
import { importarDaAgenda, reenviarPendentes } from "../services/planner-sync.js";
import { PALETA } from "../routes/planner.js";

const PADRAO_MINUTOS = 30;

export default fp(async function plannerSyncSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.PLANNER_SYNC_ENABLED === "false") {
    fastify.log.info("[planner-sync] agendador desativado (PLANNER_SYNC_ENABLED=false)");
    return;
  }
  // Sem chave do Google não há o que sincronizar — e tentar a cada 30 min
  // encheria o log de uma falha que não é falha.
  if (!emailDaServiceAccount()) {
    fastify.log.info("[planner-sync] sem GOOGLE_SERVICE_ACCOUNT_KEY, agendador não sobe");
    return;
  }

  const minutos = Number(fastify.config.PLANNER_SYNC_MINUTES ?? PADRAO_MINUTOS);
  const intervalo = Math.max(5, minutos) * 60_000;
  let rodando = false;
  let timer: NodeJS.Timeout | null = null;

  async function ciclo(): Promise<void> {
    // Um ciclo com muitas agendas pode passar do intervalo. Deixar dois em voo
    // faria os dois escreverem a mesma campanha.
    if (rodando) return;
    rodando = true;
    try {
      // 1. As pendências primeiro — ver o cabeçalho.
      const p = await reenviarPendentes(fastify.db, atualizarEvento, tituloParaGoogle);
      if (p.tentadas > 0) {
        fastify.log.info(p, "[planner-sync] pendências reenviadas");
      }

      // 2. Depois, trazer o que mudou lá.
      const agendas = await fastify.db.select().from(plannerGoogleCalendars);
      let campanhas = 0;
      let fases = 0;
      for (const a of agendas) {
        try {
          const r = await importarDaAgenda(fastify.db, a.calendarId, PALETA);
          campanhas += r.campanhasCriadas + r.campanhasAtualizadas;
          fases += r.fases;
        } catch (err) {
          // Uma agenda fora do ar não pode impedir as outras cinco.
          fastify.log.warn({ err, agenda: a.label }, "[planner-sync] agenda falhou");
        }
      }
      if (campanhas > 0) {
        fastify.log.info(
          { agendas: agendas.length, campanhas, fases },
          "[planner-sync] ciclo concluído",
        );
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[planner-sync] falhou");
    } finally {
      rodando = false;
    }
  }

  function agendar(): void {
    timer = setTimeout(async () => {
      await ciclo();
      agendar();
    }, intervalo);
    if (typeof timer.unref === "function") timer.unref();
  }

  // Warm-up depois do boot: um deploy no meio do dia já volta em dia, sem
  // esperar o primeiro intervalo inteiro.
  timer = setTimeout(async () => {
    await ciclo();
    agendar();
  }, 45_000);
  if (typeof timer.unref === "function") timer.unref();

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });

  fastify.log.info(`[planner-sync] agendador ativo (a cada ${Math.max(5, minutos)} min)`);
});
