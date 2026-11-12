/**
 * A chamada de cada post, lida da legenda por REGRA.
 *
 * Tema é julgamento editorial e por isso a IA sugere e o social media revisa.
 * Chamada não é: "Comente GUIA" está escrito na legenda com todas as letras.
 * Uma regex resolve, de graça, sem revisão e sem erro silencioso — e o que a
 * regra não reconhece fica "sem chamada" em vez de virar palpite.
 *
 * ## O agrupamento é pela PALAVRA, não por um tipo
 *
 * A tentação é mapear GUIA → isca, BLACK → oferta num dicionário. Mas os
 * números do período de 29/10 a 11/11 da Fernanda separam exatamente as
 * palavras: GUIA rendeu 24 e 38 comentários por mil, enquanto BLACK, MFB,
 * INGLÊS, BILÍNGUE e GRUPO ficaram entre 0,8 e 8. Colapsar as palavras em três
 * tipos apagaria a distinção que o dado mostra. O tipo fica como estrutura —
 * pede comentário, manda para a bio, ou não pede nada.
 *
 * ## Comentário ganha da bio
 *
 * Quando a legenda pede os dois, o comentário é a chamada do post: o link na
 * bio é instrução permanente do perfil, está em quase toda legenda e não
 * distingue um post do outro.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { mediana } from "./instagram-sinal";

export type TipoDaChamada = "comentario" | "bio" | "nenhuma";

export interface Chamada {
  tipo: TipoDaChamada;
  /** A palavra pedida no comentário — "GUIA", "BLACK". Só em `comentario`. */
  palavra: string | null;
  /** Como aparece na tela: "Comente GUIA", "Link na bio", "Sem chamada". */
  rotulo: string;
}

/**
 * "Comente GUIA", "comenta a palavra GUIA", "COMENTE GUIA".
 *
 * O verbo vai letra a letra porque a palavra pedida tem de ficar em CAIXA
 * ALTA — é o que a distingue do resto da frase — e um `/i` no regex inteiro
 * faria `\p{Lu}` aceitar minúsculas também, transformando "comente que eu te
 * mando" em chamada de nome "que".
 *
 * Mínimo de três letras: "comente AI" é interjeição, não palavra-chave.
 */
const PEDIDO_DE_COMENTARIO =
  /\b[Cc][Oo][Mm][Ee][Nn][Tt][EeAa]\p{L}*\s+(?:a\s+palavra\s+)?(\p{Lu}[\p{Lu}\d]{2,})\b/u;

/** "link na bio", "link da bio", "link está na bio", "link in bio". */
const LINK_NA_BIO = /\blink\b[\s\S]{0,15}?\bbio\b/i;

export function chamadaDaLegenda(caption: string | null | undefined): Chamada {
  const texto = caption ?? "";

  const comentario = PEDIDO_DE_COMENTARIO.exec(texto);
  if (comentario) {
    const palavra = comentario[1]!;
    return { tipo: "comentario", palavra, rotulo: `Comente ${palavra}` };
  }

  if (LINK_NA_BIO.test(texto)) return { tipo: "bio", palavra: null, rotulo: "Link na bio" };

  return { tipo: "nenhuma", palavra: null, rotulo: "Sem chamada" };
}

export interface LinhaDaChamada {
  chamada: string;
  tipo: TipoDaChamada;
  posts: number;
  /**
   * Comentários por mil alcançados, na MEDIANA.
   *
   * Comentário é a reação que a chamada pede, e por mil porque um post de 500
   * mil de alcance tem mais comentários que um de 10 mil sem a chamada ter
   * funcionado melhor. Mediana e não média: um post viral puxaria a palavra
   * inteira e faria parecer que a chamada rende quando rendeu o post.
   */
  comentariosPorMil: number | null;
  alcance: number | null;
}

/** Comentários por mil alcançados de um post. Sem alcance, não há taxa. */
export function comentariosPorMil(p: InstagramMedia): number | null {
  if (!p.reach || p.reach <= 0) return null;
  return ((p.comments_count ?? 0) / p.reach) * 1000;
}

export function agruparPorChamada(posts: readonly InstagramMedia[]): LinhaDaChamada[] {
  const porChamada = new Map<string, { tipo: TipoDaChamada; posts: InstagramMedia[] }>();
  for (const p of posts) {
    const c = chamadaDaLegenda(p.caption);
    const grupo = porChamada.get(c.rotulo);
    if (grupo) grupo.posts.push(p);
    else porChamada.set(c.rotulo, { tipo: c.tipo, posts: [p] });
  }

  const linhas: LinhaDaChamada[] = [];
  for (const [chamada, { tipo, posts: doGrupo }] of porChamada) {
    linhas.push({
      chamada,
      tipo,
      posts: doGrupo.length,
      comentariosPorMil: mediana(
        doGrupo.map(comentariosPorMil).filter((v): v is number => v != null),
      ),
      alcance: mediana(doGrupo.map((p) => p.reach).filter((v): v is number => v != null && v > 0)),
    });
  }

  // Pela taxa, porque a pergunta do bloco é "que chamada faz a pessoa
  // comentar?". Grupo sem taxa vai para o fim.
  return linhas.sort((a, b) => (b.comentariosPorMil ?? -1) - (a.comentariosPorMil ?? -1));
}

/**
 * A frase que o bloco escreve embaixo da tabela.
 *
 * Só sai quando há duas chamadas com taxa e pelo menos dois posts na melhor:
 * "a chamada X rende 30× mais" a partir de um post só é ruído com cara de
 * conclusão.
 */
export function leituraDasChamadas(linhas: readonly LinhaDaChamada[]): string | null {
  const comTaxa = linhas.filter((l) => l.comentariosPorMil != null);
  if (comTaxa.length < 2) return null;
  const melhor = comTaxa[0]!;
  const pior = comTaxa[comTaxa.length - 1]!;
  if (melhor.posts < 2) return null;

  const n = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(".", ","));
  return (
    `"${melhor.chamada}" rende ${n(melhor.comentariosPorMil!)} comentários por mil alcançados ` +
    `(${melhor.posts} post${melhor.posts > 1 ? "s" : ""}); "${pior.chamada}", ` +
    `${n(pior.comentariosPorMil!)}. A chamada é escrita na legenda, então é a parte mais barata ` +
    `de trocar.`
  );
}
