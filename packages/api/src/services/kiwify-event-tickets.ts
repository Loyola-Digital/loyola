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

/** 5 min: ingresso de evento não muda de minuto a minuto, e a tela recarrega. */
const cache = new LRUCache<string, { total: number | null }>({ max: 200, ttl: 5 * 60 * 1000 });

export async function contarIngressosDoEvento(
  db: Database,
  projectId: string,
  stageId: string,
): Promise<number | null> {
  const chave = `${projectId}:${stageId}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado.total;

  try {
    const [cfg] = await db
      .select({ productIds: kiwifyStageConfigs.productIds })
      .from(kiwifyStageConfigs)
      .where(eq(kiwifyStageConfigs.stageId, stageId))
      .limit(1);
    // Sem conferência configurada não há produto para consultar. Isso é o
    // normal na maioria das etapas — não é erro nem ausência de dado.
    if (!cfg || (cfg.productIds ?? []).length === 0) {
      cache.set(chave, { total: null });
      return null;
    }

    const [conn] = await db
      .select()
      .from(kiwifyConnections)
      .where(eq(kiwifyConnections.projectId, projectId))
      .limit(1);
    if (!conn) {
      cache.set(chave, { total: null });
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
      cache.set(chave, { total: null });
      return null;
    }

    const total = eventos.reduce((acc, p) => acc + totalDeIngressos(p.batches), 0);
    cache.set(chave, { total });
    return total;
  } catch {
    // Kiwify fora do ar não pode derrubar o dashboard inteiro: o número some,
    // o resto continua.
    cache.set(chave, { total: null });
    return null;
  }
}
