/**
 * Busca por CONTEXTO na biblioteca de referências.
 *
 * ## O problema que ela resolve
 *
 * A busca por texto acha o que está escrito. Só que ninguém procura pelo que
 * está escrito — procura por "anúncio que quebra objeção de preço", e a peça
 * que faz isso está catalogada como "ancoragem-de-preco" ou nem isso. Medido:
 * 589 das 781 tags aparecem numa referência só, então a tag quase nunca é a
 * palavra que a pessoa digitaria.
 *
 * ## Por que o catálogo inteiro vai no prompt
 *
 * O caminho clássico seria embeddings — mas `pgvector` não está disponível
 * neste banco (só `pg_trgm` e `unaccent`), a Anthropic não tem API de
 * embeddings, e o acervo inteiro cabe em ~27 mil tokens. Montar índice
 * vetorial para 291 itens é construir uma usina para acender uma lâmpada.
 *
 * O catálogo vai num bloco marcado para CACHE: ele muda devagar, e sem isso
 * cada busca pagaria os 27 mil tokens do zero.
 *
 * ## Uma linha por referência, campos separados por `|`
 *
 * Não é JSON porque JSON gasta ~40% mais tokens em chaves repetidas 291 vezes,
 * e o modelo lê a tabela sem dificuldade. O índice numérico no começo é o que
 * ele devolve — pedir o UUID de volta convida a erro de transcrição em texto
 * de 36 caracteres.
 */

export interface ReferenciaDoCatalogo {
  id: string;
  title: string;
  notes: string | null;
  brand: string | null;
  niche: string | null;
  platform: string | null;
  format: string | null;
  tags: string[] | null;
}

export interface AchadoPorContexto {
  id: string;
  /** Por que esta peça responde à busca. Aparece no card. */
  motivo: string;
}

/** Quanto de cada anotação entra. O bastante para o gancho, sem a peça toda. */
const LIMITE_DA_NOTA = 320;

export function montarCatalogo(refs: ReferenciaDoCatalogo[]): string {
  return refs
    .map((r, i) => {
      const nota = (r.notes ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITE_DA_NOTA);
      const campos = [
        r.title,
        r.brand ?? "",
        r.niche ?? "",
        [r.platform, r.format].filter(Boolean).join(" "),
        (r.tags ?? []).join(","),
        nota,
      ].map((c) => String(c).replace(/[|\n]/g, " ").trim());
      return `${i}|${campos.join("|")}`;
    })
    .join("\n");
}

export const CABECALHO_DO_CATALOGO =
  "indice|titulo|marca|nicho|plataforma e formato|tags|anotacao";

export function instrucao(pergunta: string, quantos: number): string {
  return [
    `A pessoa procura: "${pergunta}"`,
    "",
    "Escolha as referências do catálogo que respondem a isso PELO QUE ELAS SÃO,",
    "não pelas palavras que contêm. Uma peça que ancora o preço no cafezinho",
    "responde a 'quebra objeção de preço' mesmo sem essas palavras em lugar nenhum.",
    "",
    `Devolva no máximo ${quantos}, da mais relevante para a menos.`,
    "Uma linha por resultado, no formato `indice: motivo`, onde o motivo é uma",
    "frase curta em português dizendo o que naquela peça responde à busca.",
    "",
    "Se nenhuma responder de verdade, devolva a palavra NADA e mais nada.",
    "Não invente índice que não esteja no catálogo. Não explique sua escolha",
    "fora do formato pedido.",
  ].join("\n");
}

/**
 * A resposta do modelo → os ids de verdade.
 *
 * Índice fora da lista é DESCARTADO em silêncio: o catálogo é a fonte, e um
 * número inventado não deve virar erro na cara de quem só queria buscar.
 */
export function interpretarResposta(
  texto: string,
  refs: ReferenciaDoCatalogo[],
): AchadoPorContexto[] {
  if (/^\s*NADA\s*$/im.test(texto)) return [];

  const vistos = new Set<string>();
  const achados: AchadoPorContexto[] = [];

  for (const linha of texto.split("\n")) {
    const m = /^\s*(\d+)\s*[:.\-–]\s*(.+?)\s*$/.exec(linha);
    if (!m) continue;
    const ref = refs[Number(m[1])];
    if (!ref || vistos.has(ref.id)) continue;
    vistos.add(ref.id);
    achados.push({ id: ref.id, motivo: m[2].replace(/^["'`]|["'`]$/g, "").slice(0, 200) });
  }
  return achados;
}
