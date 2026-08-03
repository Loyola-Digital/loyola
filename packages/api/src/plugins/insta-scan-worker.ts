/**
 * Spy de Conteúdo — worker que consome a fila de scans.
 *
 * Roda no mesmo processo da API (não há Redis/fila externa no stack). A cada
 * tick tenta preencher até `INSTA_SCAN_CONCURRENCY` slots; cada slot pega um
 * job com `FOR UPDATE SKIP LOCKED`, então nunca há disputa pelo mesmo scan —
 * e continua correto se a API subir com mais de uma instância.
 *
 * Desligável com `INSTA_SCAN_WORKER_ENABLED=false` (sempre off em teste).
 */

import fp from "fastify-plugin";
import { claimNextScan, runScan } from "../services/insta-scanner/index.js";

const TICK_MS = 5_000;

export default fp(async function instaScanWorkerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.INSTA_SCAN_WORKER_ENABLED === "false") {
    fastify.log.info("[spy] worker desativado (INSTA_SCAN_WORKER_ENABLED=false)");
    return;
  }
  // Sem APIFY_TOKEN não há como coletar — o worker não sobe e os scans ficam
  // na fila; a rota avisa o usuário na hora de enfileirar.
  if (!fastify.config.APIFY_TOKEN) {
    fastify.log.warn("[spy] APIFY_TOKEN ausente — worker não iniciado");
    return;
  }

  const concurrency = fastify.config.INSTA_SCAN_CONCURRENCY ?? 2;
  let running = 0;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function drainSlot(): Promise<void> {
    running++;
    try {
      const scan = await claimNextScan(fastify.db);
      if (!scan) return;
      await runScan(
        fastify.db,
        scan,
        {
          apifyToken: fastify.config.APIFY_TOKEN as string,
          anthropicKey: fastify.config.ANTHROPIC_API_KEY,
          apifyActor: fastify.config.APIFY_ACTOR,
          model: fastify.config.INSTA_SCAN_MODEL,
          effort: fastify.config.INSTA_SCAN_EFFORT,
        },
        (m) => fastify.log.info(m),
      );
      // Terminou um job: tenta puxar o próximo imediatamente em vez de esperar
      // o tick, pra fila não andar em passo de 5s quando há trabalho acumulado.
      if (!stopped) void drainSlot();
    } catch (err) {
      // runScan já trata os erros do scan; um erro aqui é da própria fila
      // (banco fora, etc). Loga e deixa o próximo tick tentar de novo.
      fastify.log.error(err, "[spy] falha ao processar a fila");
    } finally {
      running--;
    }
  }

  function tick(): void {
    if (stopped) return;
    const free = concurrency - running;
    for (let i = 0; i < free; i++) void drainSlot();
  }

  timer = setInterval(tick, TICK_MS);
  // Não segura o processo vivo só por causa do worker.
  timer.unref?.();
  fastify.log.info(`[spy] worker ativo (concorrência ${concurrency}, tick ${TICK_MS}ms)`);

  fastify.addHook("onClose", async () => {
    stopped = true;
    if (timer) clearInterval(timer);
  });
});
