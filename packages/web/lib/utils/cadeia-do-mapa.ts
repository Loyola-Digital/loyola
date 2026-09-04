/**
 * Quem vem depois de um bloco no mapa.
 *
 * Serve ao gesto de arrastar a corrente inteira: pegar a captação e levar
 * junto a VSL, o checkout e o upsell que saem dela. Sem isso, reposicionar um
 * trecho do funil é arrastar bloco por bloco e refazer o alinhamento no fim.
 *
 * ## O ciclo é o caso perigoso
 *
 * Um mapa real tem volta: o downsell aponta de novo para o checkout, o
 * remarketing volta para a landing. Uma busca ingênua entra em laço e trava a
 * aba — e trava DURANTE um arrasto, com o ponteiro capturado, o que é a pior
 * hora possível. O conjunto de visitados é o que garante o fim.
 */

export interface LigacaoSimples {
  fromBox: string;
  toBox: string;
}

/**
 * Todos os blocos alcançáveis a partir de `origem`, seguindo as setas para
 * frente. Não inclui a própria origem.
 *
 * Busca em largura: a ordem não importa para mover, mas ela mantém o resultado
 * estável entre execuções, o que torna o teste legível.
 */
export function descendentes(origem: string, ligacoes: LigacaoSimples[]): Set<string> {
  const saindoDe = new Map<string, string[]>();
  for (const l of ligacoes) {
    const lista = saindoDe.get(l.fromBox);
    if (lista) lista.push(l.toBox);
    else saindoDe.set(l.fromBox, [l.toBox]);
  }

  const encontrados = new Set<string>();
  const fila = [origem];
  // `visitados` inclui a origem desde o começo: sem isso, um ciclo que volta
  // para ela a colocaria no resultado e o próprio bloco seria movido duas
  // vezes pelo mesmo delta.
  const visitados = new Set([origem]);

  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const proximo of saindoDe.get(atual) ?? []) {
      if (visitados.has(proximo)) continue;
      visitados.add(proximo);
      encontrados.add(proximo);
      fila.push(proximo);
    }
  }

  return encontrados;
}
