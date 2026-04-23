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
 * dentro da janela retroativa `[today - days, today]`.
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

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);

  return data.rows.filter((row) => {
    const normalized = normaliseDate(row.named.date);
    if (!normalized) return false;
    return normalized >= cutoffIso && normalized <= todayIso;
  });
}
