/**
 * Story 41.10 — dedup de vendas por `(ID da venda, produto normalizado)`.
 *
 * A mesma chave que o Loyola já usa inline no painel (`routes/stage-sales-data.ts`)
 * e no sync diário (`services/sales-daily-sync.ts`), agora como função pura para
 * quem precisa dela fora daqueles laços: o Resumão (41.10), o relatório de
 * perpétuo (41.11) e a camada 1 do debriefing (49.3). Os dois dedups inline
 * **não** foram migrados para cá — mudariam o painel por código (fora do escopo).
 *
 * Por que o produto entra na chave: no mesmo pedido, ingresso e order bump
 * compartilham o identificador. No DG-PG04 são 127 pedidos com o mesmo
 * `Transaction` cobrindo mais de um produto; dedup só pelo ID colapsaria o bump
 * no ingresso e sumiria com venda legítima.
 *
 * O caso que originou a story (DG-PG02, n8n): 25 vendas de R$ 99 aparecem duas
 * vezes com o **mesmo ID da venda** e o mesmo produto — a segunda linha com a
 * coluna `Transaction` vazia e o horário 3 h antes. Somadas, inflavam o
 * faturamento em R$ 2.475,00.
 *
 * Contrato (consumido pela 49.3 e pela 41.11 — o nome da função não muda):
 * - pura, sem I/O; preserva a ordem de `linhas`;
 * - chamada **por planilha**: o escopo "planilha" da chave vem de quem chama;
 * - chave = `idDaVenda.trim()` + produto (`trim` + minúsculas; `null` = `""`);
 * - `idDaVenda` vazio ou `null` ⇒ a linha **nunca** colapsa (venda sem
 *   identificador continua sendo venda — mesma regra de `utils/comprador.ts`);
 * - sobrevive a **primeira** ocorrência; as demais vão para `removidas`.
 *
 * Política que é de quem chama, não daqui: planilha sem a coluna de ID **ou** de
 * produto mapeada não deve chamar esta função (com produto sempre `""`, ingresso
 * e bump do mesmo pedido colapsariam) e deve avisar que a dedup não rodou.
 */

export interface ChaveDaVenda {
  /** Identificador da venda no gateway, lido da coluna `mapping.transactionId`. */
  idDaVenda: string | null;
  /** Nome do produto como veio na planilha. `null` vale como `""`. */
  produto: string | null;
}

export interface ResultadoDedupPorIdDaVenda<T> {
  /** Linhas que contam, na ordem original. */
  mantidas: T[];
  /** Repetições descartadas (a 2ª ocorrência em diante), na ordem original. */
  removidas: T[];
}

/**
 * Chave canônica da venda, ou `null` quando a linha não tem ID (não colapsa).
 *
 * O separador `\u0000` não aparece em célula de planilha — evita que
 * `("a|b", "c")` e `("a", "b|c")` virem a mesma chave.
 */
export function chaveDeDedupDaVenda(c: ChaveDaVenda): string | null {
  const id = (c.idDaVenda ?? "").trim();
  if (!id) return null;
  const produto = (c.produto ?? "").trim().toLowerCase();
  return `${id}\u0000${produto}`;
}

export function deduplicarPorIdDaVenda<T>(
  linhas: readonly T[],
  chave: (linha: T) => ChaveDaVenda,
): ResultadoDedupPorIdDaVenda<T> {
  const vistas = new Set<string>();
  const mantidas: T[] = [];
  const removidas: T[] = [];

  for (const linha of linhas) {
    const k = chaveDeDedupDaVenda(chave(linha));
    if (k === null) {
      mantidas.push(linha);
      continue;
    }
    if (vistas.has(k)) {
      removidas.push(linha);
      continue;
    }
    vistas.add(k);
    mantidas.push(linha);
  }

  return { mantidas, removidas };
}
