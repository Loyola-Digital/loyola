// Agendador do aviso de venda nova. Molde: alertas-de-funil-scheduler.
//
// A cada 2 minutos (VENDAS_PUSH_MINUTES) relê as planilhas de venda das etapas
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
 * Dois minutos: é o atraso entre a linha cair na planilha e o celular tocar
 * (~1 min na média). Não dá para ir muito abaixo lendo planilha: medido em
 * 23/11/2026, um ciclo são **39 leituras** (20 arquivos, 39 abas distintas), e a
 * conta de serviço tem 60 leituras/min — cota que o painel também usa quando
 * alguém abre a tela de vendas. Com a pausa entre etapas, o ciclo leva ~1 min:
 * em 2 min de intervalo sobra metade do tempo com a cota livre.
 *
 * Instantâneo de verdade não se resolve lendo planilha mais vezes, e sim pelo
 * webhook da Kiwify (`POST /api/webhooks/kiwify/:projectId`), que já grava
 * `order_approved` com valor e produto — falta a URL estar colada no painel de
 * cada conta (hoje só PP tem).
 */
const PADRAO_MINUTOS = 2;

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

  const minutos = Math.max(1, Number(fastify.config.VENDAS_PUSH_MINUTES ?? PADRAO_MINUTOS));
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

  // Igual aos outros agendadores (kiwify-vendas, lead-capi): diz na subida que
  // está no ar e com que cadência. Sem esta linha não há como confirmar em
  // produção qual intervalo está valendo — o ciclo só fala quando tem aviso.
  fastify.log.info({ minutos }, "[vendas-novas] agendador no ar");

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
