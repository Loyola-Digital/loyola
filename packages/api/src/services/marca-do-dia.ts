/**
 * O que fica gravado na marca de um dia, depois de uma edição.
 *
 * Uma linha de `funnel_batch_turns` carrega duas coisas independentes: a
 * VIRADA DE LOTE (`label`, que a tabela desenha como marco) e a OBSERVAÇÃO
 * (`nota`, texto livre do dia). Elas são editadas em momentos diferentes, pela
 * mesma rota.
 *
 * Daí as duas regras que esta função existe para não errar:
 *
 * - **Campo ausente no pedido não é mexido.** Mandar só a observação precisa
 *   preservar a virada de lote que já estava lá — senão anotar um dia apagaria
 *   a marcação de lote de quem passou antes.
 * - **Os dois vazios significam apagar.** Sem isso sobra uma linha sem
 *   conteúdo, que a tabela desenha como marco sem texto.
 *
 * Pura porque é a parte com regra, e testá-la não deveria exigir banco.
 */

export interface MarcaDoDia {
  label: string;
  nota: string | null;
}

export interface PedidoDeMarca {
  /** Ausente = não mexer. */
  label?: string;
  /** Ausente = não mexer. `null` ou vazio = remover. */
  nota?: string | null;
}

export type ResultadoDaMarca =
  { acao: "remover" } | { acao: "gravar"; marca: MarcaDoDia };

export function resolverMarcaDoDia(
  atual: MarcaDoDia | null,
  pedido: PedidoDeMarca,
): ResultadoDaMarca {
  const label = (pedido.label ?? atual?.label ?? "").trim();
  // `=== undefined` e não `??`: `null` é um pedido explícito de remover, e o
  // `??` o trataria como "não mandou nada".
  const bruta = pedido.nota === undefined ? atual?.nota : pedido.nota;
  const nota = bruta?.trim() || null;

  if (!label && !nota) return { acao: "remover" };
  return { acao: "gravar", marca: { label, nota } };
}
