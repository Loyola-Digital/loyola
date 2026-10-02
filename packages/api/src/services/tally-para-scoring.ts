/**
 * O formulário do Tally virando rascunho do modelo de Lead Scoring.
 *
 * ## O que este módulo NÃO faz
 *
 * Ele não inventa pontuação. Quanto vale "faturamento acima de R$ 100 mil" é
 * conhecimento do negócio, não do formulário — e um palpite plausível aqui seria
 * pior que um zero visível, porque ninguém revisaria.
 *
 * O que ele faz é tirar do caminho a parte mecânica e chata: transcrever as
 * perguntas e todas as alternativas na forma exata que o motor de scoring lê,
 * com os pontos zerados. É essa transcrição que hoje é feita à mão num fluxo do
 * n8n e colada de volta na aba ("ctrl+c / ctrl+v do modelo externo").
 *
 * ## Por que os aliases de coluna vêm junto
 *
 * O motor casa cada pergunta com uma COLUNA da planilha de respostas, e o
 * cabeçalho dessa coluna é o título da pergunta no Tally — mas nem sempre
 * idêntico: a exportação corta, a pessoa renomeia, o `?` some. Já existe
 * `column_aliases` para isso; preencher com o título original e a versão sem
 * pontuação cobre o caso comum sem ninguém precisar saber que o problema
 * existe.
 *
 * Módulo puro: sem DB, sem rede.
 */

import type { PerguntaDoTally } from "./tally.js";
import type { Band, LeadScoringSchema, ScoringQuestion } from "../routes/lead-scoring.js";

/** Pergunta de identificação não pontua — e sugerir que pontue atrapalha. */
const IDENTIFICACAO = /\b(e-?mail|nome|telefone|whatsapp|celular|cpf|cnpj)\b/i;

function semPontuacaoFinal(s: string): string {
  return s.replace(/[?!.\s]+$/g, "").trim();
}

/**
 * As faixas padrão A/B/C/D.
 *
 * Existem para o rascunho já ser executável: um modelo sem `bands` não
 * classifica ninguém, e a tela mostraria tudo vazio sem dizer que falta
 * configurar. Os limites são proporcionais ao total possível, então continuam
 * fazendo sentido com qualquer quantidade de perguntas — e são o primeiro
 * palpite a ser ajustado por quem conhece o lançamento.
 */
export function faixasPadrao(maxPontos: number): Band[] {
  const corte = (pct: number) => Math.round(maxPontos * pct);
  return [
    {
      id: "A",
      range: { min: corte(0.75), max: maxPontos },
      recommended_action: "Escalar — é o lead que compra",
      description: "Faixa de maior potencial. Ajuste os limites depois da primeira leitura real.",
    },
    {
      id: "B",
      range: { min: corte(0.5), max: Math.max(corte(0.75) - 1, 0) },
      recommended_action: "Manter — bom lead, acompanhar o CPL",
    },
    {
      id: "C",
      range: { min: corte(0.25), max: Math.max(corte(0.5) - 1, 0) },
      recommended_action: "Observar — depende do CPL para valer a pena",
    },
    {
      id: "D",
      range: { min: 0, max: Math.max(corte(0.25) - 1, 0) },
      recommended_action: "Cortar — lead fora do perfil",
    },
  ];
}

export interface OpcoesDoRascunho {
  /** Nome do projeto, só para o cabeçalho do modelo. */
  projeto?: string;
  /** Pontos por alternativa quando a pergunta pontua. Sempre 0: ver o topo. */
  pontosIniciais?: number;
}

/**
 * O rascunho do modelo a partir das perguntas do formulário.
 *
 * Perguntas de campo aberto entram sem alternativa: elas não pontuam sozinhas,
 * mas ficam no modelo com `max_points: 0` para quem monta ver que existem — e
 * para o caso de virarem regra depois (o motor já suporta pontuação
 * condicional, usada quando uma resposta só vale se outra estiver preenchida).
 */
export function rascunhoDeScoring(
  perguntas: PerguntaDoTally[],
  opcoes: OpcoesDoRascunho = {},
): LeadScoringSchema {
  const pontos = opcoes.pontosIniciais ?? 0;
  const questions: ScoringQuestion[] = [];

  for (const p of perguntas) {
    if (IDENTIFICACAO.test(p.titulo) && p.opcoes.length === 0) continue;

    const semPontuacao = semPontuacaoFinal(p.titulo);
    const aliases = semPontuacao === p.titulo ? [p.titulo] : [p.titulo, semPontuacao];

    questions.push({
      id: p.id,
      label: p.titulo,
      column_aliases: aliases,
      weight: 1,
      // Zero de propósito: é o que faz quem monta preencher em vez de confiar
      // num número que o sistema inventou.
      max_points: 0,
      answers: p.opcoes.map((valor) => ({ value: valor, points: pontos })),
      unmapped_default: 0,
    });
  }

  return {
    schema_version: "tally-v1",
    project: opcoes.projeto ? { name: opcoes.projeto } : undefined,
    scoring_model: { max_possible_score: 0, questions },
    bands: faixasPadrao(0),
  };
}

/**
 * Recalcula `max_points`, `max_possible_score` e as faixas a partir dos pontos
 * já preenchidos.
 *
 * Existe porque esses três números são derivados e, mantidos à mão, divergem em
 * silêncio — um `max_possible_score` velho desloca todas as faixas e muda a
 * classificação de todo mundo sem nenhum erro aparecer.
 */
export function recalcularTotais(schema: LeadScoringSchema, refazerFaixas = false): LeadScoringSchema {
  const questions = (schema.scoring_model?.questions ?? []).map((q) => {
    const maior = q.answers.reduce((m, a) => {
      const p = "points" in a ? a.points : Math.max(a.points_conditional.if_q4_filled, a.points_conditional.if_q4_empty);
      return Math.max(m, p);
    }, 0);
    return { ...q, max_points: maior * (q.weight ?? 1) };
  });

  const total = questions.reduce((s, q) => s + (q.max_points ?? 0), 0);

  return {
    ...schema,
    scoring_model: { ...schema.scoring_model, max_possible_score: total, questions },
    bands: refazerFaixas || !schema.bands?.length ? faixasPadrao(total) : schema.bands,
  };
}
