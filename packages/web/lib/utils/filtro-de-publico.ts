// ============================================================
// Story 29.62 — o filtro de público das tabelas do Perpétuo.
//
// Pura e testável: a decisão de manter ou descartar uma linha, e a contagem do
// que ficou de fora — que o AC4 exige mostrar.
// ============================================================

export type FiltroDePublico = "todos" | "quente" | "frio";

export const OPCOES_DE_PUBLICO: Array<{ valor: FiltroDePublico; rotulo: string }> = [
  { valor: "todos", rotulo: "Todos os públicos" },
  { valor: "quente", rotulo: "Quente (hot)" },
  { valor: "frio", rotulo: "Frio (cold)" },
];

export interface ClassificacaoDeEntidade {
  temperatura: "quente" | "frio";
  nivel: "anuncio" | "conjunto" | "campanha";
}

export interface ResultadoDoFiltro<T> {
  linhas: T[];
  /** Linhas descartadas por NÃO terem classificação (AC4). */
  semClassificacao: number;
  /** Linhas descartadas por serem do outro público. */
  doOutroPublico: number;
}

/**
 * Aplica o filtro a uma lista, devolvendo também o que ficou de fora e por quê.
 *
 * ## Por que devolver as contagens
 *
 * O AC4 nasceu de uma medição: no `bbe-fc1-mai-26`, **119 das 242 vendas** não
 * têm rastreio de tráfego nenhum. Quem filtrar por Quente e depois por Frio não
 * vai fechar com Todos — e sem saber disso, a conclusão natural é que o
 * dashboard está errado.
 *
 * Separar "sem classificação" de "outro público" importa porque só o primeiro é
 * um limite do dado; o segundo é o filtro funcionando.
 */
export function filtrarPorPublico<T>(
  linhas: T[],
  filtro: FiltroDePublico,
  idDaLinha: (linha: T) => string,
  mapa: Record<string, ClassificacaoDeEntidade> | undefined,
): ResultadoDoFiltro<T> {
  if (filtro === "todos") {
    return { linhas, semClassificacao: 0, doOutroPublico: 0 };
  }

  const out: T[] = [];
  let semClassificacao = 0;
  let doOutroPublico = 0;

  for (const linha of linhas) {
    const c = mapa?.[idDaLinha(linha)];
    if (!c) {
      semClassificacao++;
      continue;
    }
    if (c.temperatura === filtro) out.push(linha);
    else doOutroPublico++;
  }

  return { linhas: out, semClassificacao, doOutroPublico };
}

/** O aviso do AC4, ou `null` quando não há nada a declarar. */
export function avisoDeNaoClassificados(
  r: ResultadoDoFiltro<unknown>,
  filtro: FiltroDePublico,
): string | null {
  if (filtro === "todos" || r.semClassificacao === 0) return null;
  const n = r.semClassificacao;
  return `${n} ${n === 1 ? "linha ficou de fora" : "linhas ficaram de fora"} por não ter público identificável no nome da campanha, do conjunto ou do anúncio. Quente + Frio não fecha com Todos por causa delas.`;
}
