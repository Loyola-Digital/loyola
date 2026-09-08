/**
 * Quantos ingressos um evento vendeu, segundo a própria Kiwify.
 *
 * A venda não carrega quantidade: quem leva três ingressos gera UMA venda, e o
 * dashboard contava linhas. O número está no PRODUTO — sendo `type: "event"`,
 * ele traz os lotes, cada um com `issued_tickets`.
 *
 * Deliberadamente NÃO derivamos por preço. O evento do BBE tem nove lotes
 * (Empreendedor 797, VIP 997, Black 1097, versões com 15% de desconto, order
 * bumps de 200 e 300): dividir o valor da venda por um preço único acertaria
 * só quem comprou pelo lote de referência.
 *
 * O resultado fica em cache curto porque isto entra no caminho do dashboard —
 * e o dashboard não pode ficar refém da latência da Kiwify a cada abertura.
 */

import { eq } from "drizzle-orm";
import { LRUCache } from "lru-cache";
import type { Database } from "../db/client.js";
import { kiwifyConnections, kiwifyStageConfigs } from "../db/schema.js";
import { decryptKiwifySecret, fetchEventProduct, getKiwifyToken, totalDeIngressos } from "./kiwify.js";

/**
 * Um lote do evento, do jeito que a tela mostra.
 *
 * `vendidos` é `issued_tickets` — a contagem oficial da Kiwify, e a única que
 * responde "quantos ingressos deste lote saíram". A venda não serve: quem leva
 * três ingressos gera uma linha só.
 */
export interface LoteVendido {
  produto: string;
  lote: string;
  /** Em reais — a API devolve centavos. */
  preco: number;
  vendidos: number;
  disponiveis: number;
  total: number;
}

export interface IngressosDoEvento {
  total: number;
  lotes: LoteVendido[];
}

/**
 * 5 min: ingresso de evento não muda de minuto a minuto, e a tela recarrega.
 *
 * O valor é embrulhado porque o `LRUCache` não guarda `null` — e "consultei e
 * não há evento aqui" precisa ser guardado, senão toda abertura do dashboard
 * refaz a ida à Kiwify para descobrir o mesmo nada.
 */
const cache = new LRUCache<string, { r: IngressosDoEvento | null }>({
  max: 200,
  ttl: 5 * 60 * 1000,
});

/**
 * Os ingressos do evento, lote a lote.
 *
 * O total sozinho responde "quanto vendeu"; a quebra responde "o quê" — e é
 * ela que diz se o VIP encalhou enquanto o Empreendedor esgotou, que é a
 * decisão que se toma no meio de um evento.
 */
export async function ingressosDoEvento(
  db: Database,
  projectId: string,
  stageId: string,
): Promise<IngressosDoEvento | null> {
  const chave = `${projectId}:${stageId}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado.r;

  try {
    const [cfg] = await db
      .select({ productIds: kiwifyStageConfigs.productIds })
      .from(kiwifyStageConfigs)
      .where(eq(kiwifyStageConfigs.stageId, stageId))
      .limit(1);
    // Sem conferência configurada não há produto para consultar. Isso é o
    // normal na maioria das etapas — não é erro nem ausência de dado.
    if (!cfg || (cfg.productIds ?? []).length === 0) {
      cache.set(chave, { r: null });
      return null;
    }

    const [conn] = await db
      .select()
      .from(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, projectId))
      .limit(1);
    if (!conn) {
      cache.set(chave, { r: null });
      return null;
    }

    const token = await getKiwifyToken(
      decryptKiwifySecret(conn.clientIdEncrypted, conn.clientIdIv),
      decryptKiwifySecret(conn.clientSecretEncrypted, conn.clientSecretIv),
    );
    const accountId = decryptKiwifySecret(conn.accountIdEncrypted, conn.accountIdIv);

    const produtos = await Promise.all(
      (cfg.productIds ?? []).map((id) => fetchEventProduct(token, accountId, id).catch(() => null)),
    );
    const eventos = produtos.filter((p): p is NonNullable<typeof p> => p !== null && p.type === "event");
    // Produto que não é evento não tem lote, e forçar um número aqui seria
    // inventar. `null` deixa a tela seguir mostrando o total de vendas.
    if (eventos.length === 0) {
      cache.set(chave, { r: null });
      return null;
    }

    const lotes: LoteVendido[] = eventos.flatMap((p) =>
      p.batches
        // Lote que nunca teve ingresso emitido nem estoque é rascunho na
        // Kiwify: mostrá-lo encheria a tabela de linhas zeradas.
        .filter((b) => b.issuedTickets > 0 || b.maxTickets > 0)
        .map((b) => ({
          produto: p.name,
          lote: b.name,
          // Centavos → reais. A API é toda em centavos; a tela, não.
          preco: b.price / 100,
          vendidos: b.issuedTickets,
          disponiveis: b.availableTickets,
          total: b.maxTickets,
        })),
    );

    const resultado: IngressosDoEvento = {
      total: eventos.reduce((acc, p) => acc + totalDeIngressos(p.batches), 0),
      // Do que mais saiu para o que menos: é a leitura de "o que está
      // funcionando", e a ordem da Kiwify é a de cadastro.
      lotes: lotes.sort((a, b) => b.vendidos - a.vendidos || a.lote.localeCompare(b.lote, "pt-BR")),
    };
    cache.set(chave, { r: resultado });
    return resultado;
  } catch {
    // Kiwify fora do ar não pode derrubar o dashboard inteiro: o número some,
    // o resto continua.
    cache.set(chave, { r: null });
    return null;
  }
}
