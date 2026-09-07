/**
 * Coleções do Swipe Files — o agrupamento feito à mão.
 *
 * ## Coleção, e não pasta
 *
 * Uma peça pertence a mais de uma: o mesmo criativo de Black Friday serve à
 * coleção do lançamento e à de referências de escassez. "Pasta" carrega a
 * expectativa de que o arquivo está num lugar só, e a primeira vez que alguém
 * precisasse do contrário faria uma cópia no bucket.
 *
 * ## O que ela resolve que os filtros não resolvem
 *
 * Marca, nicho e formato já agrupam o acervo — a tela agrupa por eles sem
 * tabela nenhuma. A coleção existe para o critério que NÃO está nos campos:
 * "o que mandei pro cliente", "o que vou usar no lançamento de outubro".
 */

/** O nome que a pessoa digitou → o que vai ao banco. */
export function limparNomeDaColecao(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 120) : null;
}

/**
 * O nome de coleção que uma pasta do computador vira.
 *
 * O navegador entrega o caminho relativo de cada arquivo
 * (`Black Friday 2026/anuncios/peca-01.png`), e o que interessa é a pasta
 * RAIZ escolhida — os subdiretórios descrevem a arrumação de quem montou, não
 * o assunto. Uma coleção por subpasta encheria a lista de "anuncios" e "novos".
 */
export function nomeDaPastaRaiz(caminhoRelativo: string): string | null {
  const partes = caminhoRelativo.split(/[\\/]/).filter(Boolean);
  // Só há nome de pasta se houver ao menos um diretório ANTES do arquivo.
  return partes.length >= 2 ? limparNomeDaColecao(partes[0]) : null;
}

/**
 * Um nome que ainda não existe, a partir do desejado.
 *
 * Subir a mesma pasta duas vezes é comum — a segunda com mais arquivos. Sem
 * isto, a segunda tentativa esbarraria no índice único e a pessoa perderia o
 * envio inteiro por causa do nome.
 */
export function nomeLivre(desejado: string, existentes: string[]): string {
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  if (!usados.has(desejado.trim().toLowerCase())) return desejado;
  for (let i = 2; i < 500; i += 1) {
    const tentativa = `${desejado} (${i})`;
    if (!usados.has(tentativa.toLowerCase())) return tentativa.slice(0, 120);
  }
  return `${desejado} (novo)`.slice(0, 120);
}

export const AGRUPAMENTOS = ["brand", "niche", "platform", "format"] as const;
export type Agrupamento = (typeof AGRUPAMENTOS)[number];

export function ehAgrupamento(v: string): v is Agrupamento {
  return (AGRUPAMENTOS as readonly string[]).includes(v);
}

export interface PecaAgrupavel {
  brand: string | null;
  niche: string | null;
  platform: string | null;
  format: string | null;
}

/**
 * Agrupa a biblioteca por um atributo que a IA já preencheu.
 *
 * É a "pasta automática": não precisa de tabela nem de manutenção, e já existe
 * desde que a peça foi catalogada. Sem valor no campo, a peça cai em um grupo
 * próprio no FIM — some-la seria esconder parte do acervo de quem escolheu
 * agrupar, e é justamente essa parte que precisa ser catalogada.
 */
export function agruparPorAtributo<T extends PecaAgrupavel>(
  pecas: T[],
  por: Agrupamento,
): { valor: string | null; pecas: T[] }[] {
  const grupos = new Map<string, T[]>();
  const sem: T[] = [];

  for (const p of pecas) {
    const v = (p[por] ?? "").trim();
    if (!v) {
      sem.push(p);
      continue;
    }
    const atual = grupos.get(v);
    if (atual) atual.push(p);
    else grupos.set(v, [p]);
  }

  const ordenados = [...grupos.entries()]
    // Maior primeiro: um grupo de quinze diz mais sobre o acervo que um de um.
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"))
    .map(([valor, pecas]) => ({ valor, pecas }));

  return sem.length > 0 ? [...ordenados, { valor: null, pecas: sem }] : ordenados;
}
