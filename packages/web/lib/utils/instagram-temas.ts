/**
 * Os posts agrupados por tema do conteúdo.
 *
 * Formato responde "como publicar"; tema responde "sobre o quê". São perguntas
 * diferentes e a segunda não tinha resposta na tela: dava para ver que o
 * carrossel vai melhor que o Reels, mas não que um assunto se espalha e outro
 * morre.
 *
 * ## Mediana, não média
 *
 * Um post viral puxa a média do tema inteiro e faz parecer que o assunto rende
 * quando o que rendeu foi um post. A mediana diz como é o post TÍPICO daquele
 * tema, que é o que o próximo post vai ser.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { interacoesDoPost, interessePorMil } from "./instagram-posts";
import { mediana } from "./instagram-sinal";

export interface LinhaDoTema {
  tema: string;
  posts: number;
  /** Quantos ainda estão com a etiqueta sugerida pela IA, sem revisão. */
  sugeridos: number;
  alcance: number | null;
  interesse: number | null;
  engajamento: number | null;
}

export function agruparPorTema(posts: readonly InstagramMedia[]): LinhaDoTema[] {
  const porTema = new Map<string, InstagramMedia[]>();
  for (const p of posts) {
    const tema = p.tema?.trim();
    if (!tema) continue;
    const lista = porTema.get(tema);
    if (lista) lista.push(p);
    else porTema.set(tema, [p]);
  }

  const linhas: LinhaDoTema[] = [];
  for (const [tema, doTema] of porTema) {
    const engajamentos = doTema
      .map((p) => (p.reach && p.reach > 0 ? (interacoesDoPost(p) / p.reach) * 100 : null))
      .filter((v): v is number => v != null);
    linhas.push({
      tema,
      posts: doTema.length,
      sugeridos: doTema.filter((p) => p.tema_fonte === "ia").length,
      alcance: mediana(doTema.map((p) => p.reach).filter((v): v is number => v != null && v > 0)),
      interesse: mediana(doTema.map(interessePorMil).filter((v): v is number => v != null)),
      engajamento: mediana(engajamentos),
    });
  }

  // Por interesse por mil: a pergunta do bloco é "que assunto se espalha?", não
  // "sobre o que publicamos mais". Tema sem o número vai para o fim.
  return linhas.sort((a, b) => (b.interesse ?? -1) - (a.interesse ?? -1));
}

/**
 * A frase embaixo da tabela: o que o agrupamento está dizendo.
 *
 * Só sai com três temas ou mais e quando a diferença entre o primeiro e o
 * último é grande o bastante para não ser ruído — com dois temas de cinco
 * posts, "X rende o dobro de Y" é uma conclusão sobre nada.
 */
export function leituraDosTemas(linhas: readonly LinhaDoTema[]): string | null {
  const comNumero = linhas.filter((l) => l.interesse != null && l.posts >= 2);
  if (comNumero.length < 3) return null;

  const melhor = comNumero[0];
  const pior = comNumero[comNumero.length - 1];
  if (!melhor.interesse || !pior.interesse) return null;

  const vezes = melhor.interesse / pior.interesse;
  if (vezes < 1.5) {
    return "Nenhum tema se destaca: todos se espalham de forma parecida. O que decide o resultado aqui não é o assunto.";
  }
  const n = vezes.toFixed(1).replace(".", ",");
  return `${melhor.tema} se espalha ${n}× mais que ${pior.tema}, por pessoa alcançada. Vale testar mais do primeiro antes de concluir — são ${melhor.posts} post(s).`;
}
