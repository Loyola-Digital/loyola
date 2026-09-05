/**
 * As opções dos filtros do Swipe Files.
 *
 * ## Por que contadas, e não em ordem alfabética
 *
 * A biblioteca real tem 291 referências e 781 tags distintas — 589 delas usadas
 * uma única vez. Em ordem alfabética, as primeiras opções da lista são as que
 * menos servem: `acesso-vitalicio` (1 item) aparece antes de `escassez` (66).
 * Ordenadas por uso, as que recortam a biblioteca de verdade ficam à mão, e a
 * cauda longa fica atrás da busca do próprio filtro.
 *
 * A contagem também vai para a tela: saber que um filtro devolve 1 de 291 é o
 * que evita clicar nele esperando um recorte.
 */

export interface OpcaoDeFiltro {
  valor: string;
  n: number;
}

/**
 * Conta os valores e devolve do mais usado ao menos usado.
 *
 * Empate desfeito em ordem alfabética para a lista não trocar de ordem entre
 * duas leituras — dezenas de tags empatam em 1, e uma lista que se remexe a
 * cada `GET` faz a pessoa perder o chip que estava mirando.
 */
export function contarFacetas(valores: (string | null | undefined)[]): OpcaoDeFiltro[] {
  const conta = new Map<string, number>();
  for (const v of valores) {
    const s = (v ?? "").trim();
    if (!s) continue;
    conta.set(s, (conta.get(s) ?? 0) + 1);
  }
  return [...conta.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "pt-BR"));
}
