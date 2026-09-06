/**
 * Quando vale chamar a IA na busca do Swipe Files.
 *
 * A busca por texto é local, instantânea e resolve a maioria — "Opal", "vsl",
 * "black friday". Chamar o modelo em cima dela seria pagar quatro segundos por
 * uma resposta que já estava na tela.
 *
 * A IA entra só quando a busca literal deixou a desejar. É uma regra de
 * produto, e por isso mora aqui em vez de virar um `&&` no meio do componente:
 * mudar o limiar não deveria exigir reler a tela inteira.
 */

/** Abaixo disto, a busca por texto não respondeu de verdade. */
export const POUCOS_RESULTADOS = 4;

/** Menos que isto não é uma busca, é alguém começando a digitar. */
export const TERMO_MINIMO = 3;

export function deveBuscarPorContexto({
  termo,
  achadosPorTexto,
  carregandoTexto,
}: {
  termo: string;
  achadosPorTexto: number;
  /** Enquanto a busca literal não voltou, não dá para saber se ela bastou. */
  carregandoTexto: boolean;
}): boolean {
  if (carregandoTexto) return false;
  if (termo.trim().length < TERMO_MINIMO) return false;
  return achadosPorTexto < POUCOS_RESULTADOS;
}
