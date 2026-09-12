/**
 * As séries do SendFlow viradas numa tabela por dia.
 *
 * ## Por que existe
 *
 * O SendFlow entrega três séries separadas (entradas, saídas, cliques) mais uma
 * lista de disparos com data e hora. A tabela do dashboard é uma linha por dia
 * com tudo junto — e o dia que tem saída mas não tem entrada precisa aparecer
 * igual, senão a data simplesmente falta na tabela.
 *
 * Função pura de propósito: é onde mora a chance de errar (dia que existe numa
 * série e não na outra, disparo com data nula, ordenação), e é o que dá para
 * testar sem montar componente nem chamar rede.
 */

export interface PontoDoDia {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  entrou: number;
  saiu: number;
  /** `entrou - saiu`. Negativo é dia de esvaziamento, e precisa aparecer. */
  saldo: number;
  cliques: number;
  disparos: number;
}

export interface SerieDoSendflow {
  porDia: { date: string; valor: number }[];
}

export interface DisparoDoSendflow {
  /** Data e hora ISO, ou `null` quando o disparo nunca rodou. */
  quando: string | null;
}

/**
 * Uma linha por dia, do mais recente para o mais antigo.
 *
 * A união das datas de TODAS as fontes: um dia que só teve disparo — sem
 * entrada nem saída — é informação (a mensagem saiu e ninguém entrou), e some
 * da tabela se a montagem partir de uma série só.
 */
export function montarDiario(
  entradas: SerieDoSendflow,
  saidas: SerieDoSendflow,
  cliques: SerieDoSendflow,
  disparos: DisparoDoSendflow[],
): PontoDoDia[] {
  const porDia = new Map<string, PontoDoDia>();

  const garantir = (date: string) => {
    const atual = porDia.get(date);
    if (atual) return atual;
    const novo: PontoDoDia = {
      date,
      entrou: 0,
      saiu: 0,
      saldo: 0,
      cliques: 0,
      disparos: 0,
    };
    porDia.set(date, novo);
    return novo;
  };

  const somar = (
    serie: SerieDoSendflow | null | undefined,
    campo: "entrou" | "saiu" | "cliques",
  ) => {
    // A série inteira pode faltar, não só o `porDia`: é resposta de rede, e uma
    // chave a menos no payload não deve derrubar a tela toda.
    for (const p of serie?.porDia ?? []) {
      if (!p?.date) continue;
      garantir(p.date)[campo] += p.valor ?? 0;
    }
  };

  somar(entradas, "entrou");
  somar(saidas, "saiu");
  somar(cliques, "cliques");

  for (const d of disparos ?? []) {
    // Disparo sem data é o agendado que nunca rodou: não pertence a dia nenhum,
    // e jogá-lo em "hoje" inventaria atividade que não houve.
    if (!d?.quando) continue;
    const dia = d.quando.slice(0, 10);
    if (dia.length !== 10) continue;
    garantir(dia).disparos += 1;
  }

  for (const p of porDia.values()) p.saldo = p.entrou - p.saiu;

  return [...porDia.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Os totais que os cartões de cima mostram. */
export function totaisDoDiario(linhas: PontoDoDia[]) {
  return linhas.reduce(
    (acc, l) => ({
      entrou: acc.entrou + l.entrou,
      saiu: acc.saiu + l.saiu,
      cliques: acc.cliques + l.cliques,
      disparos: acc.disparos + l.disparos,
    }),
    { entrou: 0, saiu: 0, cliques: 0, disparos: 0 },
  );
}

/**
 * O tamanho do grupo em cada dia, reconstruído a partir de HOJE.
 *
 * ## Por que de trás para frente
 *
 * O SendFlow dá o tamanho ATUAL do grupo e o fluxo diário — nunca o tamanho de
 * cada dia. Somar o fluxo desde a primeira linha daria outro número: o período
 * mostrado não cobre a vida inteira do grupo, e as entradas anteriores a ele
 * simplesmente não estão na série.
 *
 * Descer do total conhecido é o único jeito de a linha terminar no valor que os
 * cartões mostram. Se ela terminasse em outro número, a tela se contradiria
 * sozinha — e é o tipo de divergência que ninguém consegue explicar depois.
 *
 * Recebe as linhas em ordem CRONOLÓGICA (mais antiga primeiro).
 */
export function reconstruirTotais(
  cronologico: PontoDoDia[],
  participantesHoje: number,
): (PontoDoDia & { total: number; saiuNegativo: number })[] {
  const saida: (PontoDoDia & { total: number; saiuNegativo: number })[] = [];
  let acumulado = participantesHoje;
  for (let i = cronologico.length - 1; i >= 0; i--) {
    const l = cronologico[i]!;
    // O total DESTE dia é o que havia depois do fluxo dele — por isso o
    // acumulado só desce depois de gravar a linha.
    saida[i] = { ...l, total: acumulado, saiuNegativo: -l.saiu };
    acumulado -= l.saldo;
  }
  return saida;
}
