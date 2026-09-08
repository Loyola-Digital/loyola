/**
 * Catalogar uma referência que já está no bucket.
 *
 * ## Por que isto existe separado da rota de análise
 *
 * `POST /swipe-files/analisar` cataloga um arquivo que está SUBINDO: recebe o
 * multipart, analisa e devolve a sugestão para a tela preencher. Aqui o arquivo
 * já está salvo e o que falta é a catalogação — o caso da subida em lote e o do
 * backfill, que são o mesmo problema em dois momentos.
 *
 * Ter os dois no mesmo lugar evita o que já aconteceu: a regra de "o que dá
 * para analisar" existia em três cópias e cada correção pegava uma.
 *
 * ## Vídeo não entra
 *
 * Ninguém assiste o vídeo — nem nós, nem o modelo. Inventar tags a partir do
 * nome do arquivo encheria a busca de palpites que PARECEM catalogação, e uma
 * tag errada é pior que tag nenhuma: some da busca certa e aparece na errada.
 * O caminho para vídeo é a transcrição, que entra como documento.
 */

import type {
  ClienteDeAnalise,
  SugestaoDeSwipe,
  VocabularioDoAcervo,
} from "./swipe-analise.js";
import {
  analisarLink,
  analisarReferencia,
  ehDocumento,
  ehHtml,
  podeAnalisar,
  textoDoDocumento,
  textoDoHtml,
} from "./swipe-analise.js";

/** Teto da API da Anthropic para anexo. Acima disso nem vale baixar. */
export const MAX_BYTES_DE_ANALISE = 32 * 1024 * 1024;

/** Quantos valores de cada tipo cabem no prompt sem virar ruído. */
export const VOCAB_MAX = 40;

export interface ItemParaCatalogar {
  id: string;
  title: string;
  assetKind: string;
  fileUrl: string | null;
  fileMime: string | null;
  sourceUrl: string | null;
}

/** Dá para o modelo catalogar isto? */
export function podeCatalogar(item: {
  assetKind: string;
  fileMime: string | null;
}): boolean {
  if (item.assetKind === "video") return false;
  const mime = item.fileMime ?? "";
  return podeAnalisar(mime) || ehHtml(mime) || ehDocumento(mime);
}

/**
 * A catalogação de um item, pelos mesmos três caminhos da rota de análise.
 *
 * Documento e HTML viram TEXTO — o modelo lê a transcrição ou a headline.
 * Imagem e PDF vão como anexo, para o modelo ver.
 */
export async function catalogarItem(
  claude: ClienteDeAnalise,
  item: ItemParaCatalogar,
  buffer: Buffer,
  vocabulario?: VocabularioDoAcervo,
): Promise<SugestaoDeSwipe> {
  const mime = item.fileMime ?? "";
  if (ehDocumento(mime)) {
    return analisarLink(claude, {
      url: item.sourceUrl ?? item.title,
      titulo: item.title,
      textoDaPagina: await textoDoDocumento(buffer, mime),
      vocabulario,
    });
  }
  if (ehHtml(mime)) {
    return analisarLink(claude, {
      url: item.sourceUrl ?? item.title,
      titulo: item.title,
      textoDaPagina: textoDoHtml(buffer.toString("utf8")),
      vocabulario,
    });
  }
  return analisarReferencia(
    claude,
    { buffer, mimeType: mime },
    {
      nomeDoArquivo: item.title,
      origem: item.sourceUrl ?? undefined,
      vocabulario,
    },
  );
}

/**
 * O que esta peça criou entra no vocabulário das próximas.
 *
 * Sem isto um lote é cego para si mesmo: a lista inicial só tem o que JÁ estava
 * catalogado, então a primeira peça de um anunciante novo escolhe uma grafia e
 * a segunda escolhe outra. Medido antes de existir: "Gabriel Navarro" numa peça
 * e "Navarro" na seguinte, do mesmo anunciante.
 *
 * O valor novo entra no COMEÇO: é o mais recente e o mais provável de se
 * repetir nas peças seguintes, que costumam vir da mesma pasta.
 */
export function aprenderVocabulario(
  vocabulario: VocabularioDoAcervo,
  sugestao: SugestaoDeSwipe,
): void {
  const juntar = (
    lista: string[] | undefined,
    valor: string | null | undefined,
  ) => {
    const v = valor?.trim();
    if (!v || lista?.includes(v)) return lista;
    return [v, ...(lista ?? [])];
  };
  vocabulario.marcas = juntar(vocabulario.marcas, sugestao.marca);
  vocabulario.nichos = juntar(vocabulario.nichos, sugestao.nicho);
  for (const t of sugestao.tags) vocabulario.tags = juntar(vocabulario.tags, t);
}

/**
 * Os campos que a catalogação grava.
 *
 * O TÍTULO fica de fora de propósito: é o nome do arquivo que a pessoa
 * reconhece na grade, e trocá-lo em massa faria ninguém achar o que subiu.
 */
export function camposDaSugestao(sugestao: SugestaoDeSwipe) {
  return {
    brand: sugestao.marca || null,
    niche: sugestao.nicho || null,
    platform: sugestao.plataforma || null,
    format: sugestao.formato || null,
    tags: sugestao.tags.slice(0, 20),
  };
}
