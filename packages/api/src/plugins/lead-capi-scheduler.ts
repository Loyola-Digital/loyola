/**
 * Qualifica os leads novos e manda a faixa ao Meta, sozinho.
 *
 * ## Por que precisa de agendador
 *
 * O valor do envio é o algoritmo aprender **enquanto a campanha roda**. Depender
 * de alguém lembrar de clicar em "Enviar agora" faz o aprendizado chegar
 * depois que a verba já foi gasta no lead errado — e um botão que precisa ser
 * apertado todo dia não é apertado todo dia.
 *
 * ## Só o que está LIGADO
 *
 * O ciclo só olha etapas com `ativo = true`. Essa chave é a única coisa entre a
 * classificação e a conta de mídia: enquanto estiver desligada, nada sai, por
 * mais configurado que esteja. É de propósito que ligar seja um ato consciente
 * — o que se manda ensina o algoritmo, e ensinar errado custa caro e demora a
 * desfazer.
 *
 * ## Rodar demais não estraga nada
 *
 * O envio é idempotente duas vezes: o controle de enviados evita a chamada, e o
 * `event_id` determinístico faz o próprio Meta descartar a repetição se o
 * controle falhar. Um ciclo a mais custa chamadas de API, não dado errado.
 */

import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import { funnelStages, funnels, stageLeadCapi } from "../db/schema.js";
import { EnvioImpossivel, enviarLeadsDaEtapa } from "../services/lead-capi-envio.js";

/**
 * Quinze minutos: o Meta aceita evento de até 7 dias, então minuto a minuto não
 * compra nada, e a leitura das respostas (planilha ou Tally) é a parte cara.
 * `LEAD_CAPI_MINUTES` sobrescreve.
 */
const PADRAO_MINUTOS = 15;

export default fp(async function leadCapiSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.LEAD_CAPI_ENABLED === "false") {
    fastify.log.info("[lead-capi] agendador desativado (LEAD_CAPI_ENABLED=false)");
    return;
  }

  const minutos = Number(fastify.config.LEAD_CAPI_MINUTES ?? PADRAO_MINUTOS);
  const intervalo = Math.max(5, minutos) * 60_000;
  let rodando = false;
  let timer: NodeJS.Timeout | null = null;

  async function ciclo(): Promise<void> {
    // Um ciclo demorado não pode encavalar no seguinte: dois em voo mandariam
    // o mesmo lote duas vezes antes de o primeiro registrar o que mandou.
    if (rodando) return;
    rodando = true;
    try {
      const etapas = await fastify.db
        .select({ stageId: stageLeadCapi.stageId, projectId: funnels.projectId })
        .from(stageLeadCapi)
        .innerJoin(funnelStages, eq(funnelStages.id, stageLeadCapi.stageId))
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .where(eq(stageLeadCapi.ativo, true));

      for (const etapa of etapas) {
        try {
          const r = await enviarLeadsDaEtapa(fastify.db, etapa.stageId, etapa.projectId);
          // Só registra no log quando algo saiu: um ciclo silencioso a cada 15
          // minutos encheria o log de "0 enviados" e esconderia o que importa.
          if ((r.enviados ?? 0) > 0) {
            fastify.log.info(
              { etapa: etapa.stageId, enviados: r.enviados, recebidos: r.recebidos, faixas: r.faixas },
              "[lead-capi] leads enviados ao Meta",
            );
          }
        } catch (err) {
          // Configuração incompleta não é falha do ciclo — é a etapa dizendo
          // que ainda não está pronta, e repetir o aviso a cada 15 minutos não
          // ajuda ninguém.
          if (err instanceof EnvioImpossivel) continue;
          // Uma etapa com problema não pode impedir as outras.
          fastify.log.warn({ err, etapa: etapa.stageId }, "[lead-capi] etapa falhou");
        }
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[lead-capi] ciclo falhou");
    } finally {
      rodando = false;
    }
  }

  fastify.addHook("onReady", async () => {
    // Um minuto depois de subir: o deploy já tem o que fazer, e não vale
    // disputar CPU com o start.
    timer = setInterval(() => void ciclo(), intervalo);
    setTimeout(() => void ciclo(), 60_000).unref();
    fastify.log.info({ minutos }, "[lead-capi] agendador no ar");
  });

  fastify.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
  });
});
