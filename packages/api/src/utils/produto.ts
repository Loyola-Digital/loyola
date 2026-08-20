/**
 * Story 29.53 (Fatia B) — a classificação de produto entra na conta.
 *
 * A classificação existe desde a 29.49: enum canônico no shared, coluna
 * `product_types` no banco, diálogo de UI no painel. O que faltava era alguém
 * LER. `grep productTypes` nos serviços de cálculo devolvia zero — o mapa era
 * gravado e nunca consultado.
 *
 * Aqui é a regra, num lugar só, para que a rota de vendas e o relatório
 * classifiquem igual. A chave canônica vivia em `routes/perpetual-spreadsheets`
 * e foi trazida para cá — regra de domínio não mora em rota.
 */

/** Story 29.49 — `principal` é o default de quem não foi classificado. */
export const TIPOS_DE_PRODUTO = ["principal", "order_bump", "upsell"] as const;
export type TipoDeProduto = (typeof TIPOS_DE_PRODUTO)[number];

/**
 * Chave canônica de produto: `trim().toLowerCase()`.
 *
 * Mesma regra da 18.51a na Captação Paga — sem ela "Imersão" e "imersão" viram
 * dois produtos, e o gestor classifica um e não entende por que o outro
 * continua contando como principal.
 *
 * ⚠️ Igualdade exata, não fuzzy. No funil do Netão convivem `Workshop Burgers
 * Netão` (19 linhas) e `Burgers Netão` (1) — o mesmo produto para quem olha,
 * duas entradas aqui. Unificá-las é decisão de produto, e a 29.49 fixou a
 * igualdade exata: mudar isso por conta própria reclassificaria em silêncio o
 * que o gestor marcou à mão.
 */
export function productKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * O tipo de uma linha da planilha.
 *
 * **Ausente do mapa = `principal`**, e isso não é um detalhe: `product_types`
 * guarda só os `order_bump` e `upsell` (`normalizeProductTypes` remove os
 * `principal` antes de gravar). Se o default fosse qualquer outra coisa, ligar
 * a classificação zeraria a contagem de todo funil ainda não classificado —
 * que hoje são todos menos um.
 *
 * Linha sem nome de produto (coluna não mapeada, célula vazia) também é
 * `principal`: sem informação, o comportamento é o de antes da story.
 */
export function tipoDoProduto(
  nomeDoProduto: string | null | undefined,
  tipos: Record<string, TipoDeProduto>,
): TipoDeProduto {
  const nome = (nomeDoProduto ?? "").trim();
  if (!nome) return "principal";
  return tipos[productKey(nome)] ?? "principal";
}

/** Contagem de LINHAS por tipo — não de compradores. Ver `contarPorTipo`. */
export interface QuebraPorTipo {
  principal: number;
  order_bump: number;
  upsell: number;
}

export function quebraVazia(): QuebraPorTipo {
  return { principal: 0, order_bump: 0, upsell: 0 };
}
