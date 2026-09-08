/**
 * Grava o uso acumulado, de tempos em tempos.
 *
 * ## Por que um acumulador em memória, e não um INSERT por requisição
 *
 * Uma tela do Loyola X faz dezenas de chamadas. Um `INSERT` em cada uma
 * dobraria o número de idas ao banco do produto inteiro — para responder uma
 * pergunta ("o time está usando isto?") que ninguém faz em tempo real.
 *
 * O que se perde num restart é, no máximo, o último minuto de contagem. Adesão
 * não se mede em minutos.
 *
 * ## O `ON CONFLICT` soma, não substitui
 *
 * A mesma hora é gravada várias vezes ao longo dela — uma vez por minuto. Sem
 * somar, cada gravação apagaria a contagem anterior e a hora terminaria com o
 * que aconteceu no último minuto dela.
 */

import fp from "fastify-plugin";
import { sql } from "drizzle-orm";
import { userActivity } from "../db/schema.js";
import { AcumuladorDeUso } from "../services/adesao.js";

declare module "fastify" {
  interface FastifyInstance {
    usoDoProduto: AcumuladorDeUso;
  }
}

const INTERVALO_MS = 60_000;

export default fp(async function usoDoProdutoPlugin(fastify) {
  const acumulador = new AcumuladorDeUso();
  fastify.decorate("usoDoProduto", acumulador);

  async function gravar(): Promise<void> {
    const linhas = acumulador.drenar();
    if (linhas.length === 0) return;
    try {
      await fastify.db
        .insert(userActivity)
        .values(linhas)
        .onConflictDoUpdate({
          target: [userActivity.userId, userActivity.area, userActivity.hora],
          set: { requisicoes: sql`${userActivity.requisicoes} + excluded.requisicoes` },
        });
    } catch (err) {
      // Falhar aqui não pode derrubar nada: é telemetria de adesão, e o
      // produto funciona sem ela. O que foi drenado se perde — de propósito,
      // porque devolver ao acumulador faria a fila crescer sem limite se o
      // banco estivesse fora.
      fastify.log.warn({ err, linhas: linhas.length }, "não consegui gravar o uso do produto");
    }
  }

  const relogio = setInterval(() => void gravar(), INTERVALO_MS);
  // `unref` para o timer não segurar o processo no encerramento.
  relogio.unref?.();

  // No shutdown, grava o que estiver pendente — é o último minuto do dia de
  // trabalho de alguém, e ele conta.
  fastify.addHook("onClose", async () => {
    clearInterval(relogio);
    await gravar();
  });
});
