/**
 * Links dentro do texto de uma nota ou bloco de texto do mapa.
 *
 * ## Por que não um editor de texto rico
 *
 * O conteúdo mora num `textarea` e é gravado como string simples no JSONB do
 * bloco. Trocar por `contentEditable` significaria serializar HTML, sanitizar
 * o que volta e reescrever a seleção, o desfazer e o colar — para um campo que
 * precisa de uma coisa só: link clicável.
 *
 * Aqui o texto continua texto. A marcação é a do markdown (`[rótulo](url)`),
 * que quase todo mundo já digita sem pensar, e a URL solta também vira link
 * porque é como as pessoas de fato colam endereço.
 *
 * ## O gesto de "colar por cima da seleção"
 *
 * `linkAoColar` cobre o que o ClickUp faz: com texto selecionado, colar uma
 * URL transforma a seleção em link em vez de substituí-la pelo endereço. É o
 * atalho que evita ter de conhecer a sintaxe.
 */

export type PedacoDeTexto =
  | { tipo: "texto"; valor: string }
  | { tipo: "link"; rotulo: string; url: string };

/** `[rótulo](url)` — o rótulo aceita qualquer coisa menos `]`. */
const MARKDOWN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
/** URL solta. Para na pontuação final, que quase nunca faz parte do endereço. */
const SOLTA = /(https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"])/g;

/** Se a string inteira é um endereço — usado no colar. */
export function ehUrl(s: string): boolean {
  const t = s.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  try {
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Quebra o texto em pedaços comuns e links, na ordem em que aparecem.
 *
 * Devolve lista, e não HTML: quem desenha decide as classes e os handlers, e
 * nada aqui precisa ser sanitizado depois — o React escapa o texto por
 * construção.
 */
export function pedacosDoTexto(texto: string): PedacoDeTexto[] {
  if (!texto) return [];

  const saida: PedacoDeTexto[] = [];
  let resto = 0;

  // Markdown primeiro: dentro de `[a](url)` existe uma URL solta, e casar a
  // solta antes partiria a marcação ao meio.
  MARKDOWN.lastIndex = 0;
  for (const m of texto.matchAll(MARKDOWN)) {
    const inicio = m.index;
    if (inicio > resto) empurrarComUrlSolta(saida, texto.slice(resto, inicio));
    saida.push({ tipo: "link", rotulo: m[1]!, url: m[2]! });
    resto = inicio + m[0].length;
  }
  if (resto < texto.length) empurrarComUrlSolta(saida, texto.slice(resto));

  return saida;
}

function empurrarComUrlSolta(saida: PedacoDeTexto[], trecho: string): void {
  let resto = 0;
  SOLTA.lastIndex = 0;
  for (const m of trecho.matchAll(SOLTA)) {
    const inicio = m.index;
    if (inicio > resto) saida.push({ tipo: "texto", valor: trecho.slice(resto, inicio) });
    // O endereço vira o próprio rótulo — encurtado no desenho, não aqui: o
    // dado precisa continuar sendo o link inteiro para o clique funcionar.
    saida.push({ tipo: "link", rotulo: m[1]!, url: m[1]! });
    resto = inicio + m[0].length;
  }
  if (resto < trecho.length) saida.push({ tipo: "texto", valor: trecho.slice(resto) });
}

/**
 * Garante o esquema no endereço.
 *
 * `exemplo.com` sem `https://` é lido pelo navegador como caminho RELATIVO: o
 * link abriria dentro do próprio Loyola X, numa rota que não existe. Aplicado
 * na hora de abrir, e não ao gravar, para valer também nos links que já foram
 * salvos sem esquema.
 */
export function comEsquema(url: string): string {
  const t = url.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** Só o domínio, para caber num bloco estreito. */
export function encurtar(url: string, max = 40): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const curto = u.hostname.replace(/^www\./, "") + u.pathname;
    return curto.length <= max ? curto : `${curto.slice(0, max - 1)}…`;
  } catch {
    return `${url.slice(0, max - 1)}…`;
  }
}

export interface ResultadoDoColar {
  texto: string;
  /** Onde deixar o cursor depois — o fim do que foi inserido. */
  cursor: number;
}

/**
 * Colar uma URL por cima de um trecho selecionado vira link.
 *
 * Sem seleção, ou colando algo que não é endereço, devolve `null` e o colar
 * segue o caminho normal do navegador — interceptar tudo faria o Ctrl+V comum
 * parar de funcionar dentro da nota.
 */
export function linkAoColar(
  texto: string,
  inicio: number,
  fim: number,
  colado: string,
): ResultadoDoColar | null {
  if (inicio === fim) return null;
  if (!ehUrl(colado)) return null;

  const selecionado = texto.slice(inicio, fim);
  // Selecionar um endereço e colar outro por cima é substituição, não link:
  // `[https://a](https://b)` não quer dizer nada.
  if (ehUrl(selecionado)) return null;

  const marcado = `[${selecionado}](${colado.trim()})`;
  return {
    texto: texto.slice(0, inicio) + marcado + texto.slice(fim),
    cursor: inicio + marcado.length,
  };
}
