/**
 * Story 49.19 — teste exato de Fisher, bilateral, para uma tabela 2×2.
 *
 * ```
 *              sucesso   fracasso
 *   linha 1       a         b
 *   linha 2       c         d
 * ```
 *
 * Com as margens fixas, o número de sucessos da linha 1 segue a
 * hipergeométrica: P(x) = C(a+b, x) · C(c+d, (a+c) − x) / C(n, a+c). O p-valor
 * bilateral soma P(x) de toda tabela tão ou menos provável que a observada (a
 * definição do `fisher.test` do R e do `scipy.stats.fisher_exact`).
 *
 * ## Aritmética exata
 *
 * Os numeradores C(a+b, x) · C(c+d, (a+c) − x) são calculados em `BigInt`, sem
 * ponto flutuante. Assim:
 * - "tão ou menos provável" é comparação exata (o R precisa da tolerância
 *   relativa de 1e-7 para não perder empates por arredondamento; aqui não há
 *   arredondamento);
 * - a decisão "p < 0,05" (`abaixoDoAlfa`) é feita em inteiros: um p-valor de
 *   exatamente 1/20 dá `false` em qualquer orientação da tabela (em ponto
 *   flutuante sai 0,05 numa orientação e 0,04999… noutra — o `scipy` mostra isso).
 *
 * Só o `pValor` (para exibir) é convertido para `number`.
 *
 * O laço percorre os valores possíveis de x, `min(a+b, a+c) − max(0, (a+c) − (c+d)) + 1`
 * termos; no teste de LP `a + c` é o total de compras, pequeno.
 *
 * **Puro**: sem estado, sem relógio, sem aleatoriedade.
 */

/** O nível do método (passo 6): p < 0,05 → veredito. Como fração, para a comparação exata. */
export const ALFA_DO_FISHER = { numerador: 1n, denominador: 20n, valor: 0.05 } as const;

export interface ResultadoDoFisher {
  /** p-valor bilateral (para exibir; a decisão usa `abaixoDoAlfa`). */
  pValor: number;
  /** p < 0,05, decidido em aritmética exata. */
  abaixoDoAlfa: boolean;
}

function exigirInteiroNaoNegativo(nome: string, v: number): bigint {
  if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`fisherExatoBilateral: ${nome} precisa ser inteiro ≥ 0 (recebeu ${String(v)})`);
  return BigInt(v);
}

/** `n / d` como `number`, com precisão relativa de ponto flutuante (d > 0). */
function razaoDeBigInt(n: bigint, d: bigint): number {
  if (n === 0n) return 0;
  const bits = (x: bigint) => x.toString(2).length;
  // O quociente precisa de ≥ 64 bits significativos antes de virar `number`.
  const deslocamento = Math.max(0, bits(d) - bits(n) + 64);
  const q = (n << BigInt(deslocamento)) / d;
  return Number(q) / 2 ** deslocamento;
}

/** C(n, k) exato. */
function binomial(n: bigint, k: bigint): bigint {
  if (k < 0n || k > n) return 0n;
  const kk = k > n - k ? n - k : k;
  let r = 1n;
  for (let i = 1n; i <= kk; i++) r = (r * (n - kk + i)) / i;
  return r;
}

/**
 * Teste exato de Fisher, bilateral, sobre [[a, b], [c, d]].
 * Entradas: inteiros ≥ 0 (senão `RangeError`). Tabela vazia → p = 1.
 */
export function fisherExatoBilateral(a: number, b: number, c: number, d: number): ResultadoDoFisher {
  const A = exigirInteiroNaoNegativo("a", a);
  const B = exigirInteiroNaoNegativo("b", b);
  const C = exigirInteiroNaoNegativo("c", c);
  const D = exigirInteiroNaoNegativo("d", d);
  const linha1 = A + B;
  const linha2 = C + D;
  const coluna1 = A + C;
  const n = linha1 + linha2;
  if (n === 0n) return { pValor: 1, abaixoDoAlfa: false };

  const min = coluna1 > linha2 ? coluna1 - linha2 : 0n;
  const max = linha1 < coluna1 ? linha1 : coluna1;

  // Numerador de P(x) = C(linha1, x) · C(linha2, coluna1 − x), por recorrência exata:
  // C(m, x+1) = C(m, x)·(m − x)/(x + 1)  e  C(m, k−1) = C(m, k)·k/(m − k + 1).
  const numeradores: bigint[] = [];
  let c1 = binomial(linha1, min);
  let c2 = binomial(linha2, coluna1 - min);
  for (let x = min; ; x++) {
    numeradores.push(c1 * c2);
    if (x === max) break;
    c1 = (c1 * (linha1 - x)) / (x + 1n);
    const k = coluna1 - x;
    c2 = (c2 * k) / (linha2 - k + 1n);
  }
  const total = numeradores.reduce((s, v) => s + v, 0n); // = C(n, coluna1)
  const observado = numeradores[Number(A - min)]!;
  const soma = numeradores.reduce((s, v) => (v <= observado ? s + v : s), 0n);
  const somaLimitada = soma > total ? total : soma;
  return {
    pValor: razaoDeBigInt(somaLimitada, total),
    abaixoDoAlfa: somaLimitada * ALFA_DO_FISHER.denominador < total * ALFA_DO_FISHER.numerador,
  };
}
