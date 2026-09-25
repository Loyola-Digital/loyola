/**
 * Story 29.81 (PO-07) — o percentual "igual o VTurb", TRUNCADO a 2 casas, num
 * lugar só.
 *
 * Nasceu na Story 29.78 em `packages/web/lib/utils/vturb-tabela.ts`, quando a
 * API devolvia só brutos e as taxas nasciam no web. Com a 29.81 o feed público
 * (43.5) também passa a entregar a Retenção ao pitch truncada — e a API
 * precisaria de uma segunda implementação da mesma conta. Duas implementações
 * divergem na primeira mudança (é a história da `janela-de-dias`, 18.80), por
 * isso a conta mudou para cá, sem ser reescrita.
 *
 * ## Truncar com INTEIROS (29.78, PO-09)
 *
 * Truncar em ponto flutuante erra em razão redonda: 57/100 dá 0,57, ×10000 =
 * 5699,999… e o piso vira 56,99 %. Conferido em 23/09 contra o piso exato
 * (BigInt), em todos os pares p ≤ t ≤ 5.000: `⌊p ÷ t × 100 × 100⌋` diverge em
 * 3.457 pares e `⌊p ÷ t × 10000⌋` em 1.680. A conta aqui é `⌊p × 10000 ÷ t⌋`,
 * com a correção feita por MULTIPLICAÇÃO de inteiros — nunca confiando no
 * arredondamento da divisão.
 *
 * ## Módulo folha, sem imports
 *
 * O web importa por subpath (`@loyola-x/shared/src/percentual-truncado`); a
 * API, pelo índice (`@loyola-x/shared`). Os dois caminhos NÃO são
 * intercambiáveis — ver a tabela em `./index.ts` (Story 19.14).
 */

/**
 * `parte ÷ todo` em CENTÉSIMOS DE PONTO PERCENTUAL, truncado: 13/164 → 792
 * (7,92 %). `null` quando o denominador é zero ou os números não são contagens
 * válidas — zero no denominador é ausência de medição, não taxa zero.
 */
export function centesimosTruncados(parte: number, todo: number): number | null {
  if (!Number.isInteger(parte) || !Number.isInteger(todo) || todo <= 0 || parte < 0) return null;
  const alvo = parte * 10000;
  // Estimativa pela divisão e correção EXATA por multiplicação de inteiros: o
  // resultado é o maior q com q × todo ≤ parte × 10000, sem depender de como a
  // divisão em ponto flutuante arredondou.
  let q = Math.floor(alvo / todo);
  while (q > 0 && q * todo > alvo) q--;
  while ((q + 1) * todo <= alvo) q++;
  return q;
}

/** 792 → `"7,92%"`; 5700 → `"57,00%"`. Montado a partir dos inteiros, sem `toFixed`. */
export function textoDePercentual(centesimos: number): string {
  const inteiro = Math.trunc(centesimos / 100);
  const fracao = String(centesimos % 100).padStart(2, "0");
  return `${inteiro},${fracao}%`;
}

/**
 * Story 29.81 (AC8) — a mesma conta como FRAÇÃO, para quem entrega a taxa em
 * [0,1] (o feed público): 225/4032 → 0,0558; 13/164 → 0,0792 (e não 0,0793).
 * `null` nos mesmos casos de `centesimosTruncados`.
 */
export function fracaoTruncada(parte: number, todo: number): number | null {
  const c = centesimosTruncados(parte, todo);
  return c === null ? null : c / 10000;
}
