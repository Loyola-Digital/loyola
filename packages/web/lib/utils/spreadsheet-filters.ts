import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import type { FunnelSpreadsheetData, FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";

/**
 * Normaliza string de data em diferentes formatos (ISO, BR DD/MM/YYYY, ou parseável pelo Date)
 * para o formato canônico YYYY-MM-DD.
 *
 * Retorna null quando a string não pode ser normalizada.
 */
export function normaliseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const ts = Date.parse(trimmed);
  if (!isNaN(ts)) return new Date(ts).toISOString().slice(0, 10);
  return null;
}

/**
 * Retorna apenas as linhas da planilha cuja coluna mapeada como `date` cai
 * dentro da janela de **`days` dias terminando hoje** — ou seja,
 * `[hoje - (days - 1), hoje]`, inclusiva nas duas pontas.
 *
 * ⚠️ Story 18.80: até 08/09/2026 esta função devolvia `days + 1` dias, e o
 * resultado dela cruza com dado da Meta que vem com `days`. Ver a nota no
 * corpo.
 *
 * Linhas sem data válida ou fora da janela são descartadas.
 * Se a coluna `date` não estiver mapeada, retorna todas as linhas (não há como filtrar).
 */
export function filterSheetRowsByDays(
  data: FunnelSpreadsheetData | undefined,
  days: number,
): FunnelSpreadsheetRow[] {
  if (!data) return [];
  if (!data.mapping.date) return data.rows;

  /**
   * Story 18.80 — a janela vem de `@loyola-x/shared`, a MESMA função da API.
   *
   * Antes esta função tinha a própria aritmética, e ela estava errada por um
   * dia: `cutoff = hoje - days` com filtro inclusivo devolve `days + 1` dias.
   * A mídia da Meta sempre veio com `days` (`traffic-analytics.ts:1191`), e as
   * duas cruzam em CPL, CAC, ROAS e no Top Criativos — leads de 8 dias sobre
   * investimento de 7. O erro tinha direção: sempre otimista.
   *
   * Medido em 08/09/2026, antes de corrigir: CPL do `bbe-fc1-a1-mai-26` em 7
   * dias saía 50% mais barato que o real. A magnitude oscila com o que caiu no
   * dia extra; o defeito não oscilava.
   *
   * ⚠️ O "hoje" é o do NAVEGADOR, e por isso vai explícito: a API usa o dia do
   * fuso do negócio. `inicioDaJanela` não embute default nenhum, justamente
   * para essa diferença não sumir dentro da função que existe para acabar com
   * divergência de janela.
   */
  const agora = new Date();
  const todayIso = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const cutoffIso = inicioDaJanela(days, todayIso);
  return data.rows.filter((row) => {
    const normalized = normaliseDate(row.named.date);
    if (!normalized) return false;
    return normalized >= cutoffIso && normalized <= todayIso;
  });
}
