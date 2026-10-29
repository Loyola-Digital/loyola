/**
 * Story 18.100 (AC5) — o dia de São Paulo de um INSTANTE, num lugar só.
 *
 * ## O problema
 *
 * A aba do Lead Form da Meta grava `2026-10-28T22:54:52-05:00`. O web pegava o
 * dia pelo `slice(0, 10)` da string, ou seja, o dia do PRÓPRIO offset (−05:00):
 * esse lead, que em Brasília é 00:54 de 29/10, caía em 28/10. A API já
 * convertia instante para São Paulo (`saleDayKey`, Story 41.7); o web não.
 *
 * ## A regra
 *
 * Só INSTANTE (data + hora + fuso) é convertido. O resto é dia ESCRITO e não se
 * mexe: converter `29/10/2026` subtrairia 3h de uma meia-noite e jogaria o lead
 * para o dia anterior. Por isso a função devolve `null` fora do formato de
 * instante, e cada lado segue com o que já fazia.
 *
 * | entrada | saída |
 * |---|---|
 * | `2026-10-29T22:30:00-05:00` | `2026-10-30` (00:30 em Brasília) |
 * | `2026-10-29T05:48:26-05:00` | `2026-10-29` |
 * | `2026-07-21T01:18:00Z` | `2026-07-20` |
 * | `2026-04-15T17:35:10.016-03:00` | `2026-04-15` |
 * | `2026-10-29 22:30-0500` | `2026-10-30` |
 * | `29/10/2026`, `2026-10-29`, `2026-08-27 01:30:00` | `null` |
 *
 * O resultado não depende do fuso do processo: o instante é lido com o fuso
 * escrito na célula e formatado no fuso do negócio.
 *
 * ## Módulo folha, sem imports
 *
 * O web consome por subpath (`@loyola-x/shared/src/dia-do-negocio`) e a API por
 * bare import (`@loyola-x/shared`). Os dois caminhos NÃO são intercambiáveis
 * (Story 19.14): ver a tabela em `./index.ts`.
 */

/** O fuso do negócio: o do Gerenciador da Meta das contas do time (Story 41.7). */
export const BUSINESS_TIMEZONE = "America/Sao_Paulo";

/** `en-CA` formata como `YYYY-MM-DD`, que é exatamente a chave usada. */
const formatadorDoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia civil de um instante, no fuso do negócio. Independe do TZ do processo. */
export function toBusinessDayKey(instant: Date): string {
  return formatadorDoDia.format(instant);
}

/** `YYYY-MM-DD[T ]HH:mm[:ss[.fff]](Z|±HH:MM|±HHMM)` — o instante com fuso. */
const INSTANTE_COM_FUSO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * O dia de São Paulo (`YYYY-MM-DD`) de uma célula com instante e fuso, ou
 * `null` quando a célula não é instante com fuso (dia escrito, ISO sem fuso,
 * vazio, lixo). Nunca lança.
 */
export function diaDoInstante(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = INSTANTE_COM_FUSO.exec(String(raw).trim());
  if (!m) return null;
  const [, ano, mes, dia, hora, minuto, segundo, fracao, fuso] = m;
  // Monta a forma que o `Date` lê igual em todo motor: `T`, segundos, no máximo
  // milissegundos e o fuso com dois-pontos.
  const ms = fracao ? `.${fracao.slice(0, 3).padEnd(3, "0")}` : "";
  const fusoComDoisPontos = fuso === "Z" ? "Z" : fuso.includes(":") ? fuso : `${fuso.slice(0, 3)}:${fuso.slice(3)}`;
  const instante = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo ?? "00"}${ms}${fusoComDoisPontos}`);
  if (Number.isNaN(instante.getTime())) return null;
  return toBusinessDayKey(instante);
}
