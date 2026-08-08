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

/**
 * Story 29.44 (AC5) — a janela imediatamente anterior, de mesma duração.
 *
 * A regra, por extenso, porque foi exatamente aqui que a story errou na
 * primeira escrita (dava "24/07 a 31/07" para um período de 7 dias — 8 dias, e
 * começando um dia cedo demais):
 *
 *     duração        = fim − início + 1        (inclusiva nas DUAS pontas)
 *     fim_anterior   = início − 1 dia
 *     início_anterior= fim_anterior − (duração − 1)
 *
 * Para 01/08 → 07/08 (7 dias), sai 25/07 → 31/07. Sem sobreposição de um dia
 * (que contaria o mesmo dia duas vezes e suavizaria o delta) e sem buraco
 * (que compararia contra um período que não encosta no atual).
 *
 * Aritmética em UTC de propósito: `new Date("2026-08-01")` já é UTC, e somar
 * dias com `setDate` no fuso local atravessa horário de verão em algumas
 * timezones, produzindo janela de 6 ou 8 dias uma vez por ano.
 */
export function janelaAnterior(janela: JanelaExplicita): JanelaExplicita {
  const MS_DIA = 86_400_000;
  const ini = Date.parse(`${janela.startDate}T00:00:00Z`);
  const fim = Date.parse(`${janela.endDate}T00:00:00Z`);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) {
    // Janela inválida não vira janela inventada — devolve a própria, e o
    // chamador detecta a igualdade e não exibe comparativo.
    return janela;
  }
  const duracaoDias = Math.round((fim - ini) / MS_DIA) + 1;
  const fimAnterior = ini - MS_DIA;
  const inicioAnterior = fimAnterior - (duracaoDias - 1) * MS_DIA;
  const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { startDate: ymd(inicioAnterior), endDate: ymd(fimAnterior) };
}
