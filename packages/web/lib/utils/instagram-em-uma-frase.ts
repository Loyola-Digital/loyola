/**
 * O período em uma frase, montado dos números — não escrito por IA.
 *
 * A pessoa que abre a tela quer saber, antes de qualquer gráfico, se o mês foi
 * bom. Treze cartões não respondem isso: cada um responde um pedaço. Esta
 * frase junta alcance, reação e saldo de seguidores na ordem em que a conta
 * funciona, e diz onde está o aperto.
 *
 * É determinística de propósito: sai dos mesmos números dos cartões, então
 * nunca diverge deles nem custa chamada de modelo. A leitura interpretativa
 * continua sendo a da análise com IA, mais abaixo na página.
 */

export interface NumerosDoPeriodo {
  alcance: number;
  alcanceAnterior: number | null;
  compartilhamentos: number;
  compartilhamentosAnterior: number | null;
  /** Seguidores que entraram e que saíram no período. */
  entraram: number | null;
  sairam: number | null;
  /** Parcela do alcance que ainda não seguia, em %. */
  pctNaoSeguidores: number | null;
}

/** Um pedaço da frase, para a tela destacar os números em negrito. */
export interface Trecho {
  texto: string;
  forte?: boolean;
}

const K = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")} mi`;
  if (n >= 10_000) return `${Math.round(n / 1_000).toLocaleString("pt-BR")} mil`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return Math.round(n).toLocaleString("pt-BR");
};

const umaCasa = (n: number) => n.toFixed(1).replace(".", ",");

/** "4,2 vezes" / "+38%" / "quase igual ao" — a comparação em palavras. */
function compara(atual: number, anterior: number | null): string | null {
  if (anterior == null || anterior <= 0) return null;
  const r = atual / anterior;
  if (r >= 2) return `${umaCasa(r)} vezes o período anterior`;
  const pct = Math.round((r - 1) * 100);
  if (Math.abs(pct) < 3) return "quase o mesmo do período anterior";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% sobre o período anterior`;
}

export function fraseDoPeriodo(n: NumerosDoPeriodo): Trecho[] {
  const out: Trecho[] = [];
  const push = (texto: string, forte = false) => out.push(forte ? { texto, forte } : { texto });

  if (n.alcance <= 0) return [{ texto: "Ainda não há alcance medido neste período." }];

  push("O perfil alcançou ");
  const vsAlcance = compara(n.alcance, n.alcanceAnterior);
  push(`${K(n.alcance)} contas${vsAlcance ? `, ${vsAlcance}` : ""}`, true);
  push(".");

  if (n.pctNaoSeguidores != null) {
    push(` ${umaCasa(n.pctNaoSeguidores)}% de quem viu ainda não seguia`, true);
    push(" — é público novo.");
  }

  const vsShares = compara(n.compartilhamentos, n.compartilhamentosAnterior);
  if (n.compartilhamentos > 0) {
    push(" Compartilharam ");
    push(`${K(n.compartilhamentos)} vezes${vsShares ? `, ${vsShares}` : ""}`, true);
    push(".");
  }

  if (n.entraram != null && n.sairam != null) {
    const saldo = n.entraram - n.sairam;
    const churn = n.entraram > 0 ? n.sairam / n.entraram : null;
    push(saldo >= 0 ? " A conta ganhou " : " A conta perdeu ");
    push(`${saldo >= 0 ? "+" : "−"}${K(Math.abs(saldo))} seguidores`, true);
    push(`, porque entraram ${K(n.entraram)} e saíram ${K(n.sairam)}`);
    // O churn alto é o aperto que o saldo esconde — é o que muda o que fazer
    // amanhã, então entra na frase em vez de ficar só num cartão.
    push(
      churn != null && churn >= 0.5
        ? `: de cada 100 que entraram, ${Math.round(churn * 100)} foram embora. O conteúdo está chegando; o aperto é segurar quem chega.`
        : ".",
    );
  }

  return out;
}

/** As três etapas, com o que fazer quando cada uma trava. */
export const ETAPAS_DO_CAMINHO = [
  {
    n: 1,
    nome: "Alcance",
    texto: "Quantas pessoas viram. Se cai, o problema é o conteúdo chegar às pessoas: formato, horário, gancho.",
    cor: "bg-cyan-500",
  },
  {
    n: 2,
    nome: "Interesse",
    texto: "O que fizeram. Salvar e compartilhar valem mais que curtir: mostram que o conteúdo merece ir para mais gente.",
    cor: "bg-purple-500",
  },
  {
    n: 3,
    nome: "Ação",
    texto: "O que decidiram. Visitar o perfil, clicar na bio, entrar no grupo. É o que paga a conta.",
    cor: "bg-amber-500",
  },
] as const;
