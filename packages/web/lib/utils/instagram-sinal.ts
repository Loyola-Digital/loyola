/**
 * O sinal de um post, e como ele se compara com os do mesmo formato.
 *
 * ## Por que "interesse por mil"
 *
 * Alcance sozinho premia o post que a Meta resolveu distribuir. Compartilhar e
 * salvar são decisões de quem viu — e por mil alcançados o número para de
 * depender do tamanho da entrega, então um Reels de 90 mil e um carrossel de
 * 9 mil passam a caber na mesma coluna.
 *
 * ## Por que cada formato tem a sua régua
 *
 * Reels, carrossel e estático não jogam o mesmo jogo: o Reels alcança muito
 * mais e é compartilhado muito menos por pessoa alcançada. Comparar um Reels
 * com a mediana geral do perfil só diz qual formato ele é. Por isso o status
 * sai dos quartis do PRÓPRIO formato: forte é estar entre os 25% melhores dos
 * seus pares, fraco entre os 25% piores.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { formatoDoPost, interessePorMil, type Formato } from "./instagram-posts";

/** Quantil com interpolação linear, o mesmo critério do protótipo. */
export function quantil(valores: readonly number[], q: number): number | null {
  const a = [...valores].sort((x, y) => x - y);
  if (a.length === 0) return null;
  const pos = (a.length - 1) * q;
  const base = Math.floor(pos);
  const resto = pos - base;
  const proximo = a[base + 1];
  return proximo !== undefined ? a[base] + resto * (proximo - a[base]) : a[base];
}

export const mediana = (valores: readonly number[]): number | null => quantil(valores, 0.5);

export interface ReferenciaDoFormato {
  /** Quantos posts do formato entraram na conta. */
  n: number;
  /** Mediana de alcance — a régua do "quantas vezes um post típico". */
  alcance: number | null;
  interesse: number | null;
  p25: number | null;
  p75: number | null;
}

/**
 * Abaixo disto os quartis não dizem nada: com três posts, todo post é o melhor
 * ou o pior do formato. O status fica em branco em vez de mentir.
 */
const MINIMO_PARA_QUARTIS = 5;

export type Referencias = Partial<Record<Formato, ReferenciaDoFormato>>;

export function referenciasPorFormato(posts: readonly InstagramMedia[]): Referencias {
  const out: Referencias = {};
  for (const post of posts) {
    const f = formatoDoPost(post);
    (out[f] ??= { n: 0, alcance: null, interesse: null, p25: null, p75: null }).n++;
  }
  for (const f of Object.keys(out) as Formato[]) {
    const doFormato = posts.filter((p) => formatoDoPost(p) === f);
    const alcances = doFormato.map((p) => p.reach).filter((v): v is number => v != null && v > 0);
    const sinais = doFormato
      .map(interessePorMil)
      .filter((v): v is number => v != null);
    out[f] = {
      n: doFormato.length,
      alcance: mediana(alcances),
      interesse: mediana(sinais),
      p25: sinais.length >= MINIMO_PARA_QUARTIS ? quantil(sinais, 0.25) : null,
      p75: sinais.length >= MINIMO_PARA_QUARTIS ? quantil(sinais, 0.75) : null,
    };
  }
  return out;
}

export type StatusDoPost = "forte" | "na linha" | "fraco";

export function statusDoPost(post: InstagramMedia, refs: Referencias): StatusDoPost | null {
  const r = refs[formatoDoPost(post)];
  const sinal = interessePorMil(post);
  if (!r || sinal == null || r.p25 == null || r.p75 == null) return null;
  if (sinal >= r.p75) return "forte";
  if (sinal <= r.p25) return "fraco";
  return "na linha";
}

/** Quantas vezes o alcance do post é o de um post típico do mesmo formato. */
export function alcanceVezesTipico(post: InstagramMedia, refs: Referencias): number | null {
  const r = refs[formatoDoPost(post)];
  if (!r?.alcance || !post.reach) return null;
  return post.reach / r.alcance;
}

export interface Destaque {
  /** A pergunta que este post responde. */
  pergunta: string;
  post: InstagramMedia;
  /** O número que o elegeu, já escrito. */
  valor: string;
}

const milhar = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Os quatro posts que explicam o período — cada um responde uma pergunta
 * diferente, e é por isso que são quatro e não um "top 4": o post que mais
 * alcançou quase nunca é o que mais trouxe seguidor.
 */
export function destaquesDoPeriodo(posts: readonly InstagramMedia[]): Destaque[] {
  const melhor = (
    valor: (p: InstagramMedia) => number | null,
    pergunta: string,
    escrever: (p: InstagramMedia, v: number) => string,
  ): Destaque | null => {
    let top: { post: InstagramMedia; v: number } | null = null;
    for (const post of posts) {
      const v = valor(post);
      if (v == null) continue;
      if (!top || v > top.v) top = { post, v };
    }
    return top ? { pergunta, post: top.post, valor: escrever(top.post, top.v) } : null;
  };

  return [
    melhor((p) => p.reach ?? null, "Mais viu", (_p, v) => `${milhar(v)} contas`),
    melhor(interessePorMil, "Mais espalhou", (_p, v) => `${umaCasa(v)} por mil alcançados`),
    melhor(
      (p) => (p.skip_rate == null ? null : 100 - p.skip_rate),
      "Melhor gancho",
      (_p, v) => `${umaCasa(v)}% passaram de 3 s`,
    ),
    melhor((p) => p.follows ?? null, "Mais seguidores", (_p, v) => `+${milhar(v)} seguidores`),
  ].filter((d): d is Destaque => d != null);
}
