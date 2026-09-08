/**
 * Os bytes de uma página salva, virando texto.
 *
 * Separado do componente porque duas telas precisam do mesmo palpite — a capa
 * do card e o visualizador — e porque uma função pura roda nos testes do
 * pacote web, que são `environment: node`, sem DOM.
 *
 * ## Por que não confiar no `charset` declarado
 *
 * A página salva pelo navegador costuma trazer `<meta charset="utf-8">` mesmo
 * quando o arquivo foi gravado em Windows-1252 por um editor antigo. Ler o
 * rótulo daria a resposta errada com toda a confiança do mundo.
 *
 * Decodificar em UTF-8 e CONTAR os estragos é mais honesto: byte inválido em
 * UTF-8 vira U+FFFD, o losango com a interrogação. Um ou outro pode ser do
 * próprio conteúdo; dezenas significam que o palpite estava errado, e a
 * segunda tentativa recupera os acentos que apareceriam como "ImersÃ£o".
 */

/** Quantos caracteres perdidos já indicam que o UTF-8 foi o palpite errado. */
export const LIMITE_DE_PERDA = 3;

export function decodificarHtml(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const perdidos = (utf8.match(/\uFFFD/g) ?? []).length;
  if (perdidos <= LIMITE_DE_PERDA) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    // Navegador sem o rótulo `windows-1252`. O UTF-8 estragado ainda mostra a
    // estrutura da página; devolver vazio não mostraria nada.
    return utf8;
  }
}
