/**
 * Story 29.41 (AC6) — a janela da aba Análise MVP, explícita.
 *
 * O problema que isto resolve: os endpoints do perpétuo aceitam `days=N` e
 * calculam a janela no servidor (`perpetual-sales-data.ts:241` — `new Date()`
 * menos N dias). O VTurb, ao contrário, exige `start_date`/`end_date` na
 * requisição. Se cada lado calcular a sua janela por conta própria, elas podem
 * divergir sem que nada avise — e `AGG-01`/`ST-07` proíbem exatamente isso:
 * cadeia que mistura janelas não é cadeia.
 *
 * A conversão aqui replica a regra do servidor deliberadamente, e a janela
 * resultante é EXIBIDA na tela. Uma janela que o usuário pode ler é uma janela
 * que ele pode conferir contra o painel do VTurb — que é o que o AC9 pede.
 */

/** Data local em YYYY-MM-DD. `toISOString()` não serve: converte para UTC e vira o dia anterior à noite. */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface JanelaExplicita {
  startDate: string;
  endDate: string;
}

/**
 * Converte o estado do seletor da aba numa janela explícita.
 *
 * @param days  preset em dias (usado quando não há range custom)
 * @param range range custom vindo do calendário; tem precedência
 * @param hoje  injetável para teste — em produção, a data corrente
 */
export function janelaDaAba(
  days: number,
  range?: { startDate: string; endDate: string },
  hoje: Date = new Date(),
): JanelaExplicita {
  // Range custom veio do calendário: são as datas que o usuário escolheu, e
  // não há o que derivar.
  if (range?.startDate && range?.endDate) {
    return { startDate: range.startDate, endDate: range.endDate };
  }
  // Preset: mesma aritmética de `perpetual-sales-data.ts:241-242` — hoje menos
  // N dias. Se aquela regra mudar, esta precisa mudar junto, senão a cadeia
  // passa a medir uma janela e o resto da aba, outra.
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - days);
  return { startDate: toLocalYMD(inicio), endDate: toLocalYMD(hoje) };
}
