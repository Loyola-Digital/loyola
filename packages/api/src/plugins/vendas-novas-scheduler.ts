// Agendador do aviso de venda nova. Molde: alertas-de-funil-scheduler.
//
// A cada 10 minutos (VENDAS_PUSH_MINUTES) relê as planilhas de venda das etapas
// e avisa o que entrou. Sem janela de silêncio, ao contrário dos alertas de
// funil: alerta de ROAS de madrugada é ruído que faz a pessoa desligar tudo,
// venda é notícia boa e chega a hora que chega. Quem segura o volume é o teto
// por projeto por dia (ver `vendas-novas.ts`).
//
// Rodar várias vezes é inofensivo — `sale_push_sent` é a marca d'água — o que
// cobre restart e deploy no meio do dia.

import fp from "fastify-plugin";
import { pushConfigurado } from "../services/push.js";
import { rodarAvisosDeVenda } from "../services/vendas-novas.js";

/**
 * Dez minutos: é o atraso que a pessoa percebe entre a venda cair na planilha e
 * o celular tocar. Cada rodada custa uma leitura de Sheets por etapa com
 * planilha de venda (15 hoje), bem abaixo da cota.
 */
const PADRAO_MINUTOS = 10;

export default fp(async function vendasNovasSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.VENDAS_PUSH_ENABLED === "false") {
    fastify.log.info("[vendas-novas] agendador desativado (VENDAS_PUSH_ENABLED=false)");
    return;
  }
  if (!pushConfigurado(fastify.config)) {
    // Sem as chaves VAPID o ciclo leria as planilhas para não entregar nada — e
    // pior, marcaria as vendas como avisadas. Mesmo motivo do alertas-de-funil.
    fastify.log.info("[vendas-novas] sem chaves VAPID: agendador não sobe");
    return;
  }

  const minutos = Math.max(5, Number(fastify.config.VENDAS_PUSH_MINUTES ?? PADRAO_MINUTOS));
  let rodando = false;
  let timer: NodeJS.Timeout | null = null;

  async function ciclo(): Promise<void> {
    // Dois ciclos em voo leriam as mesmas abas em paralelo e poderiam avisar a
    // mesma venda duas vezes (a marca d'água só é gravada no fim).
    if (rodando) return;
    rodando = true;
    try {
      const resumo = await rodarAvisosDeVenda(fastify);
      if (resumo.avisos > 0 || resumo.estreias > 0 || resumo.erros.length > 0) {
        fastify.log.info(resumo, "[vendas-novas] ciclo concluído");
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[vendas-novas] falhou");
    } finally {
      rodando = false;
    }
  }

  function agendar(): void {
    timer = setTimeout(async () => {
      await ciclo();
      agendar();
    }, minutos * 60_000);
    if (typeof timer.unref === "function") timer.unref();
  }

  // Aquecimento ~90s depois do boot, sem concorrer com o resto da subida. Na
  // PRIMEIRA vez isto marca o histórico de cada etapa sem avisar ninguém.
  timer = setTimeout(async () => {
    await ciclo();
    agendar();
  }, 90_000);
  if (typeof timer.unref === "function") timer.unref();

  fastify.addHook("onClose", async () => {
    if (timer) clearTimeout(timer);
  });
});
