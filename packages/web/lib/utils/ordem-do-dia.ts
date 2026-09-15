// Story 18.82 — ordenação da tabela "Dados diários" pela coluna Dia.
//
// A ordenação é assunto de EXIBIÇÃO: `buildDailyRows` (funnel-metrics.ts)
// continua entregando as linhas ascendentes, porque os gráficos da mesma
// tela leem `rows[0]` como primeiro dia (lead-trend-calculations.ts) e
// `rows[rows.length - 1]` como âncora da projeção (meta-ads-teste-section).
// Inverter na fonte quebraria a projeção sem erro nenhum — por isso a tabela
// ordena uma CÓPIA, aqui, e mais ninguém vê a mudança.
//
// `date` é ISO `YYYY-MM-DD` nas duas fontes (Meta: `date_start.slice(0, 10)`;
// planilha: `normaliseDate`), então comparar a string é comparar a data —
// inclusive na virada de ano, o que o teste prova.

export type OrdemDoDia = "asc" | "desc";

/** Padrão da tabela: quem abre o painel quer ontem, não o primeiro dia do período. */
export const ORDEM_DO_DIA_PADRAO: OrdemDoDia = "desc";

/**
 * Devolve uma cópia de `linhas` ordenada por `date`.
 *
 * - `desc` (padrão): dia mais recente primeiro.
 * - `asc`: dia mais antigo primeiro.
 *
 * Nunca muta a entrada: `rows` é compartilhado com os gráficos, e uma
 * mutação aqui os reordenaria sem que ninguém tivesse pedido.
 */
export function ordenarLinhasPorDia<T extends { date: string }>(
  linhas: readonly T[],
  ordem: OrdemDoDia = ORDEM_DO_DIA_PADRAO,
): T[] {
  const copia = [...linhas];
  copia.sort((a, b) =>
    ordem === "asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
  );
  return copia;
}

/** A outra direção — o clique no cabeçalho "Dia". */
export function inverterOrdemDoDia(ordem: OrdemDoDia): OrdemDoDia {
  return ordem === "desc" ? "asc" : "desc";
}
