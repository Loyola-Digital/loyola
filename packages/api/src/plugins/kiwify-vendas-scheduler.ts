/**
 * Mantém as vendas da Kiwify no banco, sozinho.
 *
 * ## Por que agendador, e não consulta ao vivo
 *
 * `/v1/sales` exige janela e tem teto de **90 dias** por consulta: dois anos de
 * perpétuo são ~8 chamadas paginadas. Fazer isso a cada abertura de tela é
 * lento e estoura o rate limit — então a sincronização é a única que fala com a
 * API, e o dashboard lê o banco. Mesmo padrão do Meta aqui.
 *
 * ## Só projeto com Kiwify conectada
 *
 * O ciclo varre `kiwify_connections`. Projeto sem conexão não é erro: a maioria
 * não usa Kiwify, e tentar sincronizar o que não existe só encheria o log.
 *
 * ## Rodar demais não estraga nada
 *
 * O upsert é por `(project_id, sale_id)`. Rodar a mesma janela de novo
 * **corrige** status e valor em vez de duplicar — e é por isso que o ciclo pode
 * ser burro e repetitivo. Custa chamadas de API, nunca dado errado.
 *
 * ## Por que recua 7 dias
 *
 * A venda muda depois de criada: sai de `waiting_payment` para `paid`, e pode
 * ser reembolsada semanas depois. Continuar exatamente de onde parou deixaria
 * essas transições para trás para sempre. Ver `sincronizarVendas`.
 */

import fp from "fastify-plugin";
import { kiwifyConnections } from "../db/schema.js";
import { KiwifyIndisponivel, sincronizarVendas } from "../services/kiwify-vendas-cache.js";

/**
 * Trinta minutos: é dashboard de faturamento, não cotação — meia hora de atraso
 * não muda decisão nenhuma, e a janela de 90 dias é a parte cara.
 * `KIWIFY_SYNC_MINUTES` sobrescreve.
 */
const PADRAO_MINUTOS = 30;

export default fp(async function kiwifyVendasSchedulerPlugin(fastify) {
  if (fastify.config.NODE_ENV === "test") return;
  if (fastify.config.KIWIFY_SYNC_ENABLED === "false") {
    fastify.log.info("[kiwify-vendas] agendador desativado (KIWIFY_SYNC_ENABLED=false)");
    return;
  }

  const minutos = Number(fastify.config.KIWIFY_SYNC_MINUTES ?? PADRAO_MINUTOS);
  const intervalo = Math.max(10, minutos) * 60_000;
  let rodando = false;
  let timer: NodeJS.Timeout | null = null;

  async function ciclo(): Promise<void> {
    // Dois ciclos em voo puxariam a mesma janela em paralelo: o upsert aguenta,
    // mas é o dobro de chamadas à Kiwify por nada.
    if (rodando) return;
    rodando = true;
    try {
      const conexoes = await fastify.db
        .select({ projectId: kiwifyConnections.projectId })
        .from(kiwifyConnections);

      for (const c of conexoes) {
        try {
          const r = await sincronizarVendas(fastify.db, c.projectId);
          // Só registra quando veio algo: um ciclo silencioso a cada 30 minutos
          // encheria o log de "0 vendas" e esconderia o que importa.
          if (r.gravadas > 0) {
            fastify.log.info(
              { projeto: c.projectId, de: r.de, ate: r.ate, gravadas: r.gravadas },
              "[kiwify-vendas] vendas sincronizadas",
            );
          }
          if (r.semId > 0) {
            // Venda sem id não tem chave e não pode ser gravada. Nunca deveria
            // acontecer — se acontecer, é mudança na API e precisa aparecer.
            fastify.log.warn(
              { projeto: c.projectId, semId: r.semId },
              "[kiwify-vendas] vendas sem id foram ignoradas",
            );
          }
        } catch (err) {
          // Projeto sem conexão válida não é falha do ciclo.
          if (err instanceof KiwifyIndisponivel) continue;
          // Um projeto com problema não pode impedir os outros.
          fastify.log.warn({ err, projeto: c.projectId }, "[kiwify-vendas] projeto falhou");
        }
      }
    } catch (err) {
      // Nunca derruba o processo — só loga.
      fastify.log.error(err, "[kiwify-vendas] ciclo falhou");
    } finally {
      rodando = false;
    }
  }

  fastify.addHook("onReady", async () => {
    timer = setInterval(() => void ciclo(), intervalo);
    // Dois minutos depois de subir: o deploy já tem o que fazer, e a primeira
    // sincronização de um projeto novo baixa um ano de vendas.
    setTimeout(() => void ciclo(), 120_000).unref();
    fastify.log.info({ minutos }, "[kiwify-vendas] agendador no ar");
  });

  fastify.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
  });
});
