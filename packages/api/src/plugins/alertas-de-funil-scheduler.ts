// Agendador dos alertas de funil. Molde: payment-alerts-scheduler.
//
// Roda a cada 30 min dentro da janela acordada (8h–22h de São Paulo). Fora dela
// não avalia: alerta de madrugada não muda decisão nenhuma e é o jeito mais
// rápido de a pessoa desligar a notificação inteira.
//
// O `last_sent_date` por regra deduplica, então rodar o ciclo várias vezes é
// inofensivo — o que cobre restart e deploy no meio do dia.

import fp from "fastify-plugin";
import { horaSaoPaulo, rodarAlertas } from "../services/alertas-de-funil.js";
import { pushConfigurado } from "../services/push.js";

const INTERVALO_MS = 30 * 60_000;
const HORA_INICIO = 8;
const HORA_FIM = 22;

export default fp(async function alertasDeFunilSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.ALERTAS_FUNIL_ENABLED === "false") {
    fastify.log.info("[alertas-funil] agendador desativado (ALERTAS_FUNIL_ENABLED=false)");
    return;
  }
  if (!pushConfigurado(fastify.config)) {
    // Sem as chaves VAPID o ciclo gastaria consulta de BI para não entregar
    // nada — e pior, marcaria `last_sent_date` como se tivesse avisado.
    fastify.log.info("[alertas-funil] sem chaves VAPID: agendador não sobe");
    return;
  }

  let rodando = false;
  let timer: NodeJS.Timeout | null = null;

  async function ciclo(): Promise<void> {
    if (rodando) return;
    const hora = horaSaoPaulo();
    if (hora < HORA_INICIO || hora >= HORA_FIM) return;
    rodando = true;
    try {
      const resumo = await rodarAlertas(fastify);
      if (resumo.alertasEnviados > 0 || resumo.erros.length > 0) {
        fastify.log.info(resumo, "[alertas-funil] ciclo concluído");
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[alertas-funil] falhou");
    } finally {
      rodando = false;
    }
  }

  function agendar(): void {
    timer = setTimeout(async () => {
      await ciclo();
      agendar();
    }, INTERVALO_MS);
    if (typeof timer.unref === "function") timer.unref();
  }

  // Aquecimento ~60s depois do boot: cobre deploy no meio do dia sem concorrer
  // com o resto da subida.
  timer = setTimeout(async () => {
    await ciclo();
    agendar();
  }, 60_000);
  if (typeof timer.unref === "function") timer.unref();

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
