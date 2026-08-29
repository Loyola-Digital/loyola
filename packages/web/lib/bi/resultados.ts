/**
 * Os resultados dos widgets em tela, e as três coisas que mexem neles.
 *
 * ## O bug que este arquivo existe para não deixar voltar
 *
 * A primeira versão guardava o resultado de um widget recém-inserido num mapa
 * **paralelo**, e o mesclava por cima dos resultados das levas:
 *
 * ```ts
 * const resultados = { ...calculados, ...recemInseridos }; // ERRADO
 * ```
 *
 * Como o mapa paralelo tinha prioridade e nunca era limpo, um widget inserido na
 * sessão continuava mostrando o número do **projeto anterior** depois de trocar
 * de projeto ou de escopo — com cara de atual. Não é "não atualiza": é mostrar
 * o número de outro recorte, que é bem pior.
 *
 * A correção é de forma, não de remendo: um mapa só. A semente entra nele como
 * valor provisório, e a leva seguinte passa por cima naturalmente.
 */

/**
 * Genérico no resultado: o reducer não precisa conhecer a forma do que guarda,
 * e assim o tipo do widget chega intacto na tela.
 */
export type AcaoDeResultado<T = unknown> =
  /** Trocou de dashboard, de projeto: o que estava em tela não é mais deste. */
  | { tipo: "limpar" }
  /** Widget acabou de ser criado e já veio com número — valor provisório. */
  | { tipo: "semear"; widgetId: string; resultado: T }
  /** A leva devolveu o número deste widget — este manda. */
  | { tipo: "chegou"; widgetId: string; resultado: T };

export function reduzirResultados<T>(
  estado: Record<string, T>,
  acao: AcaoDeResultado<T>,
): Record<string, T> {
  switch (acao.tipo) {
    case "limpar":
      return {};
    case "semear":
    case "chegou":
      // As duas escrevem no MESMO mapa, e a última vence. É o que faz a leva
      // passar por cima da semente sem precisar de regra de prioridade.
      return { ...estado, [acao.widgetId]: acao.resultado };
  }
}
