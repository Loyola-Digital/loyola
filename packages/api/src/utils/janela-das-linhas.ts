/**
 * Story 18.85 (AC1/AC3/AC4) — linhas de planilha dentro da janela do seletor.
 *
 * A rota `creative-performance` contava vendas, ingressos e leads da planilha
 * INTEIRA ao lado de um investimento de `days` dias. A janela vem de
 * `inicioDaJanela` (a régua da 18.80, a mesma do front e de `dateRangeFromDays`
 * da Meta: `hoje − (days−1)` até hoje, no fuso do negócio) e a data da linha de
 * `saleDayKey` — nenhuma aritmética de data nova.
 *
 * Regras (as do projeto, não novas):
 *  - planilha sem coluna de data (não mapeada, ou mapeada e AUSENTE do
 *    cabeçalho — PO-04) → nenhuma linha sai: não há com o que recortar, e zerar
 *    calado seria o defeito "planilha inteira some do período sem aviso";
 *  - coluna presente e data ilegível → a linha sai (`saleDayKey` → `null`, o
 *    chamador pula), e é CONTADA em `semData` — descarte não é silencioso.
 */

import { inicioDaJanela, saleDayKey } from "./sale-date.js";

export interface RecorteDaJanela {
  linhas: string[][];
  /** `false` quando a planilha não tem coluna de data utilizável. */
  aplicada: boolean;
  foraDaJanela: number;
  /** Linhas com a coluna de data presente e ilegível (descartadas). */
  semData: number;
}

/**
 * @param dateIdx índice da coluna de data (`-1` = sem coluna → sem recorte)
 * @param hoje    `businessToday()` — explícito para o teste fixar o relógio
 */
export function recortarLinhasPelaJanela(
  rows: string[][],
  dateIdx: number,
  days: number,
  hoje: string,
): RecorteDaJanela {
  if (dateIdx < 0) return { linhas: rows, aplicada: false, foraDaJanela: 0, semData: 0 };
  const inicio = inicioDaJanela(days, hoje);
  let foraDaJanela = 0;
  let semData = 0;
  const linhas = rows.filter((row) => {
    const dia = saleDayKey(row[dateIdx]);
    if (!dia) {
      semData++;
      return false;
    }
    if (dia < inicio || dia > hoje) {
      foraDaJanela++;
      return false;
    }
    return true;
  });
  return { linhas, aplicada: true, foraDaJanela, semData };
}
