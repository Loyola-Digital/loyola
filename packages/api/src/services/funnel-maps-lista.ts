/**
 * A ordem da lista "Todos os mapas".
 *
 * ## Por que não é alfabética
 *
 * Era: projeto, funil, ordem da etapa — e os avulsos, por nome, na frente de
 * tudo. Estável e, por isso mesmo, inútil para quem desenha: o mapa que acabou
 * de ser mexido ficava exatamente onde sempre esteve, às vezes no fim de uma
 * lista de trinta.
 *
 * ## Mapa nunca desenhado vai para o fim
 *
 * A lista inclui etapas do tipo "mapa" que ainda não têm desenho salvo — elas
 * chegam sem `updatedAt`. Não são trabalho recente nem antigo: são trabalho
 * que não existe, e no topo empurrariam para baixo justamente o que se
 * procura. Entre elas, ordem alfabética, para a lista não se remexer entre
 * dois carregamentos.
 */

export interface MapaNaLista {
  updatedAt: string | null;
  stageName: string | null;
  projectName?: string | null;
}

export function ordenarMapasPorAtividade<T extends MapaNaLista>(mapas: T[]): T[] {
  return [...mapas].sort((a, b) => {
    // `!a.updatedAt` cobre `null` e `""`: os dois significam "sem desenho".
    if (!a.updatedAt && !b.updatedAt) return comparaNome(a, b);
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    if (a.updatedAt === b.updatedAt) return comparaNome(a, b);
    // Texto ISO 8601 em UTC compara como data — e sem construir 30 `Date`.
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

function comparaNome(a: MapaNaLista, b: MapaNaLista): number {
  return `${a.projectName ?? ""} ${a.stageName ?? ""}`.localeCompare(
    `${b.projectName ?? ""} ${b.stageName ?? ""}`,
    "pt-BR",
  );
}
