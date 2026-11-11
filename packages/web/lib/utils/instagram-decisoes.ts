/**
 * As leituras do período que pedem decisão.
 *
 * Cada cartão nasce de um número que já está na tela — e existe porque o
 * número sozinho não diz o que fazer. "79% de saídas" é um fato; "o conteúdo
 * está chegando, o aperto é segurar quem chega" é uma decisão.
 *
 * Tudo aqui é regra determinística sobre os próprios dados: nada de IA, para
 * que o cartão nunca discorde do número que o gerou, e nenhum cartão aparece
 * sem o dado que o sustenta.
 */

import type { InstagramMedia } from "@/lib/hooks/use-instagram";
import { ganchoExplicaOAlcance } from "./instagram-metas";
import { agruparPorTema } from "./instagram-temas";

export interface Decisao {
  titulo: string;
  /** "urgente" pinta o cartão; "atencao" é amarelo; "bom" é notícia boa. */
  nivel: "urgente" | "atencao" | "bom";
  /** O número que originou a leitura. */
  evidencia: string;
  acao: string;
}

const nf = (n: number) => Math.round(n).toLocaleString("pt-BR");
const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");
const K = (n: number) =>
  n >= 1_000_000 ? `${umaCasa(n / 1_000_000)} mi` : n >= 10_000 ? `${nf(n / 1_000)} mil` : nf(n);

export interface NumerosParaDecidir {
  alcance: number;
  alcanceAnterior: number | null;
  entraram: number | null;
  sairam: number | null;
  visitasAoPerfil: number;
  cliquesNaBio: number;
  engajamento: number | null;
  engajamentoAnterior: number | null;
  posts: readonly InstagramMedia[];
}

export function decisoesDoPeriodo(n: NumerosParaDecidir): Decisao[] {
  const out: Decisao[] = [];

  // 1. O que entra e some. É o aperto que o saldo esconde.
  if (n.entraram != null && n.sairam != null && n.entraram > 0) {
    const churn = (n.sairam / n.entraram) * 100;
    if (churn >= 50) {
      out.push({
        titulo: "Mais da metade de quem segue vai embora",
        nivel: churn >= 70 ? "urgente" : "atencao",
        evidencia: `${nf(n.entraram)} entraram e ${nf(n.sairam)} saíram: ${Math.round(churn)} de cada 100.`,
        acao:
          "A distribuição está funcionando; o aperto é o que vem depois do follow. Olhar os primeiros " +
          "posts que um seguidor novo encontra e o que o perfil promete na bio.",
      });
    }
  }

  // 2. Alcance subiu e engajamento caiu — o par que parece contradição e não é.
  if (
    n.alcanceAnterior != null &&
    n.alcanceAnterior > 0 &&
    n.engajamento != null &&
    n.engajamentoAnterior != null &&
    n.alcance / n.alcanceAnterior >= 1.3 &&
    n.engajamento < n.engajamentoAnterior
  ) {
    out.push({
      titulo: "O engajamento caiu porque o alcance cresceu",
      nivel: "bom",
      evidencia:
        `Alcance ${umaCasa(n.alcance / n.alcanceAnterior)}× o período anterior e engajamento de ` +
        `${umaCasa(n.engajamentoAnterior)}% para ${umaCasa(n.engajamento)}%.`,
      acao:
        "Queda esperada: a conta chegou a muito mais gente de fora, que reage menos. Comparar o " +
        "engajamento com o do período anterior aqui não ajuda — olhar interesse por mil, que não depende do tamanho da entrega.",
    });
  }

  // 3. O gancho dos Reels explica o alcance?
  const gancho = ganchoExplicaOAlcance(n.posts);
  if (gancho?.forte.alcance && gancho.fraco.alcance && gancho.forte.alcance / gancho.fraco.alcance >= 1.5) {
    out.push({
      titulo: "Os primeiros 3 segundos decidem o alcance dos Reels",
      nivel: "atencao",
      evidencia:
        `Reels que seguraram o começo alcançaram ${K(gancho.forte.alcance)} na mediana (${gancho.forte.n} posts); ` +
        `os que não seguraram, ${K(gancho.fraco.alcance)} (${gancho.fraco.n}).`,
      acao:
        "Antes de gravar, testar a abertura: é o que separa os dois grupos. Publicar mais Reels com " +
        "a mesma abertura fraca não muda o resultado.",
    });
  }

  // 4. Quem abre o perfil e não clica: o problema está na bio, não no conteúdo.
  if (n.visitasAoPerfil > 50) {
    const taxa = (n.cliquesNaBio / n.visitasAoPerfil) * 100;
    if (taxa < 5) {
      out.push({
        titulo: "Quem abre o perfil quase não clica no link",
        nivel: "atencao",
        evidencia: `${nf(n.visitasAoPerfil)} visitas ao perfil e ${nf(n.cliquesNaBio)} cliques na bio (${umaCasa(taxa)}%).`,
        acao:
          "O conteúdo está levando gente ao perfil; é a bio que não converte. Rever a frase, o que o " +
          "link promete e se o destino cumpre o que o post ofereceu.",
      });
    }
  }

  // 5. Que assunto rende — só quando há etiqueta em posts suficientes.
  const temas = agruparPorTema(n.posts).filter((t) => t.interesse != null && t.posts >= 2);
  if (temas.length >= 3) {
    const melhor = temas[0];
    const pior = temas[temas.length - 1];
    if (melhor.interesse && pior.interesse && melhor.interesse / pior.interesse >= 2) {
      out.push({
        titulo: `"${melhor.tema}" se espalha muito mais que "${pior.tema}"`,
        nivel: "bom",
        evidencia:
          `${umaCasa(melhor.interesse)} contra ${umaCasa(pior.interesse)} por mil alcançados ` +
          `(${melhor.posts} e ${pior.posts} posts).`,
        acao:
          "Testar mais do primeiro antes de concluir — a amostra ainda é pequena. Se confirmar, é o " +
          "assunto para ocupar o calendário.",
      });
    }
  }

  return out;
}
