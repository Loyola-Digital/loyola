/**
 * Story 41.7 — dia civil de uma venda, no fuso do negócio (§C.7 do complemento).
 *
 * O problema que isto resolve: a planilha registra `created_at` em UTC (sufixo
 * `Z`) e o Gerenciador reporta no fuso da conta (America/Sao_Paulo, UTC−3).
 * Derivar o dia com `getFullYear()/getMonth()/getDate()` usa o fuso do PROCESSO
 * — em produção (Railway, UTC) a venda `2026-07-21T01:18:00Z` cai em 21/07; na
 * máquina do time (UTC−3) cai em 20/07. O mesmo relatório dava números
 * diferentes conforme onde rodava.
 *
 * O que NÃO fazer: converter tudo cegamente. A planilha traz dois formatos
 * distintos e só um deles é um instante:
 *
 *   "21/07/2026"            → dia civil já escrito. Converter isso subtrairia
 *                             3h de uma meia-noite e jogaria para o dia anterior.
 *   "2026-07-21T01:18:00Z"  → instante. ESTE precisa virar dia de São Paulo.
 *
 * Por isso a distinção é feita pela presença de componente de hora + fuso, não
 * por heurística de valor.
 */

export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** `en-CA` formata como `YYYY-MM-DD`, que é exatamente a chave que usamos. */
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil de um instante, no fuso do negócio. Independe do TZ do processo. */
export function toBusinessDayKey(instant: Date): string {
  return dayFormatter.format(instant);
}

/**
 * Dia civil (`YYYY-MM-DD`) da data crua da planilha.
 *
 * - `dd/mm/yyyy` (com ou sem hora) → dia literal, sem conversão de fuso
 * - `YYYY-MM-DD` puro → dia literal
 * - qualquer coisa com hora e fuso (`Z`, `+00:00`) → convertido para São Paulo
 *
 * Devolve `null` quando não dá para interpretar — o caller decide se pula a linha.
 */
export function saleDayKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Formato BR: o dia está escrito, não é instante a converter.
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    const day = Number.parseInt(d, 10);
    const month = Number.parseInt(m, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // ISO date puro (sem hora): também é dia escrito.
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return isoDate[0];

  // Sobrou instante — aí sim converte.
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  return toBusinessDayKey(dt);
}

/** Hoje no fuso do negócio (`YYYY-MM-DD`). */
export function businessToday(now: Date = new Date()): string {
  return toBusinessDayKey(now);
}

/**
 * Ontem no fuso do negócio. O §C.7 exige **dias completos**: se hoje é 28, o
 * período do relatório fecha em 27 — vendas de hoje ficam fora do corte.
 */
export function businessYesterday(now: Date = new Date()): string {
  return shiftDayKey(businessToday(now), -1);
}

/** Soma dias a uma chave `YYYY-MM-DD`, em aritmética de calendário (sem fuso). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map((p) => Number.parseInt(p, 10));
  // UTC aqui é só aritmética de calendário: entra e sai como dia civil, sem
  // envolver o fuso do processo em momento algum.
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Nº de dias no intervalo fechado [inicio, fim]. Usado no §C.3.7 (tendência ≥14 dias). */
export function daysBetween(inicio: string, fim: string): number {
  const toUtc = (k: string) => {
    const [y, m, d] = k.split("-").map((p) => Number.parseInt(p, 10));
    return Date.UTC(y, m - 1, d);
  };
  return Math.floor((toUtc(fim) - toUtc(inicio)) / 86_400_000) + 1;
}
