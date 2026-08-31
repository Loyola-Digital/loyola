/**
 * Quanto da primeira página cabe na capa do card.
 *
 * ## Por que recortar
 *
 * Uma landing page salva em PDF é UMA página de cinco mil pixels de altura.
 * Respeitar a proporção real transformava o card numa tira: a grade virava uma
 * coluna de fitas, e a miniatura ficava pequena demais para reconhecer o que
 * era. O que identifica uma landing page é o topo — a headline, o herói —, não
 * o rodapé com o CNPJ.
 *
 * ## Por que no canvas, e não no CSS
 *
 * Dava para desenhar a página inteira e cortar com `object-cover`. Mas
 * 600 × 6000 px são ~14 MB de bitmap por card, e a memória é real mesmo que o
 * recorte seja visual. Encolher o canvas faz o pdf.js clipar o que passa da
 * altura: o mesmo resultado na tela, sem pagar pelo que ninguém vê.
 */

/**
 * A página mais alta que a capa aceita, como proporção largura/altura.
 *
 * 0,6 dá um card em pé, um pouco mais alto que A4 — cabe numa grade sem
 * dominar a tela. Abaixo disso, corta.
 */
export const PROPORCAO_MINIMA = 0.6;

/**
 * A mais larga. Um PDF em paisagem não precisa virar uma faixa de 4 cm de
 * altura ao lado dos outros cards.
 */
export const PROPORCAO_MAXIMA = 1.6;

/** O tamanho do bitmap, dada a página de verdade. */
export function enquadrar(
  paginaLargura: number,
  paginaAltura: number,
  larguraDoBitmap: number,
): { largura: number; altura: number; cortou: boolean } {
  // Página degenerada (zero, NaN) não deve virar canvas inválido: cai no
  // formato em pé, que é o mais comum.
  if (!(paginaLargura > 0) || !(paginaAltura > 0)) {
    return { largura: larguraDoBitmap, altura: Math.round(larguraDoBitmap / 0.75), cortou: false };
  }

  const escala = larguraDoBitmap / paginaLargura;
  const alturaCheia = paginaAltura * escala;

  const alturaMaxima = larguraDoBitmap / PROPORCAO_MINIMA;
  const alturaMinima = larguraDoBitmap / PROPORCAO_MAXIMA;

  // Só o excesso de ALTURA é cortado. Uma página larga demais não é recortada
  // pelos lados — perder a margem esquerda de um PDF em paisagem esconderia
  // justamente onde o texto começa.
  const altura = Math.round(Math.min(Math.max(alturaCheia, alturaMinima), alturaMaxima));

  return {
    largura: larguraDoBitmap,
    altura,
    // Um pixel de diferença é arredondamento, não corte.
    cortou: alturaCheia - altura > 1,
  };
}
