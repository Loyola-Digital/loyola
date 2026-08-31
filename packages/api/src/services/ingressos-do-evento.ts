/**
 * Ingressos emitidos de uma etapa de Captação de Evento.
 *
 * ## Ingresso não é venda
 *
 * A Kiwify manda UMA transação quando a pessoa compra três ingressos. Contar
 * linhas subestima o público — medido nesta etapa do `bbe-pr2-ago-26`: 19
 * vendas, **22 ingressos**. A diferença são as compras múltiplas, que é
 * exatamente quem leva a família ou a equipe.
 *
 * ## De onde vem o número
 *
 * Do PRODUTO, não da soma das vendas: sendo `type: "event"`, ele traz os lotes
 * com `issued_tickets` — a contagem da própria Kiwify. Isso substitui a divisão
 * `valor ÷ preço unitário`, que quebraria aqui: este evento tem onze lotes
 * (Black, VIP, Empreendedor, versões com 15% e 20% de desconto…), e qualquer
 * conta que assuma preço único erra na maioria das vendas.
 *
 * ## Por que o cache
 *
 * É rede externa dentro de uma rota que hoje responde do banco. Sem cache, cada
 * consulta do Inácio viraria uma ida à Kiwify — e a rota pública passaria a ter
 * a latência e a taxa de falha de um terceiro. Cinco minutos é curto para quem
 * acompanha venda ao vivo e longo o bastante para uma tela que atualiza sozinha
 * não virar tráfego.
 */

import { eq } from "drizzle-orm";
import { kiwifyConnections, kiwifyStageConfigs } from "../db/schema.js";
import {
  decryptKiwifySecret,
  fetchEventProduct,
  getKiwifyToken,
  totalDeIngressos,
} from "./kiwify.js";

export const VALIDADE_DO_CACHE_MS = 5 * 60 * 1000;

export interface IngressosDoEvento {
  /** Emitidos, somando os lotes. `null` quando não deu para apurar. */
  total: number | null;
  /**
   * Por que não deu, quando `total` é `null`.
   *
   * A ausência precisa ter causa: "sem ingressos" e "não consegui perguntar"
   * levam a ações diferentes, e um `null` mudo faria as duas parecerem a mesma.
   */
  motivo?: "sem-conexao" | "sem-produto" | "produto-nao-e-evento" | "falha-na-kiwify";
  /** Detalhe por lote — o que explica o total sem obrigar a abrir a Kiwify. */
  porLote: { produto: string; lote: string; emitidos: number; disponiveis: number }[];
}

const VAZIO: IngressosDoEvento = { total: null, porLote: [] };

const cache = new Map<string, { em: number; dados: IngressosDoEvento }>();

/** Esquece o que está guardado. Existe para o teste não depender de relógio. */
export function limparCacheDeIngressos(stageId?: string): void {
  if (stageId) cache.delete(stageId);
  else cache.clear();
}

type Db = {
  select: (f: unknown) => {
    from: (t: unknown) => {
      where: (c: unknown) => { limit: (n: number) => Promise<Record<string, unknown>[]> };
    };
  };
};

/**
 * Quantos ingressos a etapa emitiu.
 *
 * Nunca lança: falha de rede vira `total: null` com motivo. Esta função é
 * chamada de dentro de uma rota que já tinha resposta útil sem ela — derrubar
 * a resposta inteira porque a Kiwify piscou seria trocar um campo a mais por
 * um endpoint a menos.
 */
export async function ingressosDaEtapa(
  db: Db,
  stageId: string,
  projectId: string,
  log?: { warn: (o: unknown, m: string) => void },
): Promise<IngressosDoEvento> {
  const guardado = cache.get(stageId);
  if (guardado && Date.now() - guardado.em < VALIDADE_DO_CACHE_MS) return guardado.dados;

  const dados = await apurar(db, stageId, projectId, log);
  cache.set(stageId, { em: Date.now(), dados });
  return dados;
}

async function apurar(
  db: Db,
  stageId: string,
  projectId: string,
  log?: { warn: (o: unknown, m: string) => void },
): Promise<IngressosDoEvento> {
  const [cfg] = (await db
    .select({ productIds: kiwifyStageConfigs.productIds })
    .from(kiwifyStageConfigs)
    .where(eq(kiwifyStageConfigs.stageId, stageId))
    .limit(1)) as { productIds: string[] | null }[];

  const produtos = cfg?.productIds ?? [];
  if (produtos.length === 0) return { ...VAZIO, motivo: "sem-produto" };

  const [conexao] = (await db
    .select({
      clientId: kiwifyConnections.clientIdEncrypted,
      clientIdIv: kiwifyConnections.clientIdIv,
      clientSecret: kiwifyConnections.clientSecretEncrypted,
      clientSecretIv: kiwifyConnections.clientSecretIv,
      accountId: kiwifyConnections.accountIdEncrypted,
      accountIdIv: kiwifyConnections.accountIdIv,
    })
    .from(kiwifyConnections)
    .where(eq(kiwifyConnections.projectId, projectId))
    .limit(1)) as {
    clientId: string;
    clientIdIv: string;
    clientSecret: string;
    clientSecretIv: string;
    accountId: string;
    accountIdIv: string;
  }[];

  if (!conexao) return { ...VAZIO, motivo: "sem-conexao" };

  try {
    const token = await getKiwifyToken(
      decryptKiwifySecret(conexao.clientId, conexao.clientIdIv),
      decryptKiwifySecret(conexao.clientSecret, conexao.clientSecretIv),
    );
    const accountId = decryptKiwifySecret(conexao.accountId, conexao.accountIdIv);

    const lidos = await Promise.all(
      produtos.map((id) => fetchEventProduct(token, accountId, id).catch(() => null)),
    );
    const eventos = lidos.filter(
      (p): p is NonNullable<typeof p> => p !== null && p.type === "event",
    );

    // Produto configurado que não é evento não tem ingresso — e dizer isso é
    // diferente de dizer que o evento vendeu zero.
    if (eventos.length === 0) return { ...VAZIO, motivo: "produto-nao-e-evento" };

    const porLote = eventos.flatMap((p) =>
      p.batches
        // Lote intocado só alonga a lista: o que interessa é onde houve emissão
        // ou onde a disponibilidade já mudou.
        .filter((b) => b.issuedTickets > 0 || b.availableTickets < b.maxTickets)
        .map((b) => ({
          produto: p.name,
          lote: b.name,
          emitidos: b.issuedTickets,
          disponiveis: b.availableTickets,
        })),
    );

    return {
      total: eventos.reduce((acc, p) => acc + totalDeIngressos(p.batches), 0),
      porLote,
    };
  } catch (erro) {
    log?.warn({ erro, stageId }, "nao consegui apurar ingressos na Kiwify");
    return { ...VAZIO, motivo: "falha-na-kiwify" };
  }
}

/** A etapa em que a contagem de ingressos faz sentido. */
export function ehEtapaDeEvento(stageType: string | null | undefined): boolean {
  return stageType === "event_capture";
}
