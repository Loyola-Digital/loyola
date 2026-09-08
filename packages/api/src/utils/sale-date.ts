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

// ============================================================
// Story 29.69 — a HORA da venda
// ============================================================

/**
 * Formatador de hora no fuso do negócio. `hourCycle: "h23"` evita o `24` que o
 * `en-US` devolve para meia-noite.
 */
const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

/**
 * A célula traz indicador de fuso? (`Z`, `+03:00`, `-0300`)
 *
 * É o que separa **instante** de **hora escrita**, e a Task 0 da 29.69 mostrou
 * que os dois convivem na MESMA coluna: em `bbe-fc1-a1-mai-26`, 44 de 263
 * linhas terminam em `Z` e 219 não. Tratar as duas iguais joga as 44 três horas
 * adiante — e as que caem entre 00:00Z e 02:59Z, para o dia seguinte.
 */
function temFuso(raw: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw.trim());
}

export interface DiaEHoraDaVenda {
  /** `YYYY-MM-DD` no fuso do negócio. */
  dia: string;
  /**
   * Hora cheia `0..23`, ou `null` quando a célula não traz hora.
   *
   * `null` **não é meia-noite**. Uma planilha que só registra o dia
   * (`19/08/2025` — o caso de 2 dos 5 funis perpétuos em produção) colocaria
   * 100% das vendas às 00h num gráfico "por hora", e o pico das 00h seria lido
   * como comportamento do comprador.
   */
  hora: number | null;
}

/**
 * Dia e hora de uma venda, derivados **juntos** da mesma célula.
 *
 * Separá-los em duas funções seria convidar o caso em que o dia sai do caminho
 * de instante (convertido) e a hora do caminho literal — e a venda apareceria
 * às 22h de um dia em que ela não aconteceu.
 *
 * Três formatos, todos vistos em produção (Task 0):
 *
 * | Célula                       | Dia         | Hora | Por quê |
 * |------------------------------|-------------|------|---------|
 * | `19/08/2025`                 | `2025-08-19`| `null` | não há hora escrita |
 * | `24/05/2026 20:12:38`        | `2026-05-24`| `20` | hora escrita, sem fuso: literal |
 * | `2026-08-27 08:42:44`        | `2026-08-27`| `8`  | idem — ISO sem fuso **não** é instante |
 * | `2026-07-12T23:50:33.624Z`   | `2026-07-12`| `20` | instante: convertido para São Paulo |
 * | `2026-07-21T01:18:00Z`       | `2026-07-20`| `22` | instante: cai no dia anterior |
 *
 * ⚠️ **Divergência conhecida com `saleDayKey`** (deixada de propósito, para o
 * QA decidir): naquela função, `2026-08-27 08:42:44` cai no ramo de instante e
 * é interpretado no fuso do PROCESSO. Em produção (UTC) uma venda antes das 03h
 * locais vira o dia anterior. Aqui a regra é a correta — ISO sem fuso é hora
 * escrita —, e por isso as duas podem discordar nesse caso. Corrigir
 * `saleDayKey` mudaria números de séries diárias já em produção, o que está
 * **fora do escopo desta story** (AC8). Ver o teste que documenta o caso.
 */
export function saleDayAndHour(raw: string | null | undefined): DiaEHoraDaVenda | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // 1) BR — `dd/mm/aaaa` com hora opcional. Sempre literal.
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (br) {
    const [, d, m, y, hh] = br;
    const day = Number.parseInt(d, 10);
    const month = Number.parseInt(m, 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dia = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const hora = hh == null ? null : Number.parseInt(hh, 10);
    if (hora != null && (hora < 0 || hora > 23)) return { dia, hora: null };
    return { dia, hora };
  }

  // 2) ISO sem fuso — `aaaa-mm-dd`, `aaaa-mm-dd hh:mm`, `aaaa-mm-ddThh:mm`.
  //    Hora escrita, não instante: interpretar como UTC (ou como o fuso do
  //    processo) é o que faria a venda mudar de hora conforme onde o código
  //    roda.
  if (!temFuso(trimmed)) {
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (iso) {
      const [, y, m, d, hh] = iso;
      const dia = `${y}-${m}-${d}`;
      const hora = hh == null ? null : Number.parseInt(hh, 10);
      if (hora != null && (hora < 0 || hora > 23)) return { dia, hora: null };
      return { dia, hora };
    }
  }

  // 3) Sobrou instante com fuso — converte para o fuso do negócio.
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return null;
  const hora = Number.parseInt(hourFormatter.format(dt), 10);
  return {
    dia: toBusinessDayKey(dt),
    hora: Number.isNaN(hora) ? null : hora,
  };
}

/**
 * Dia da semana de uma chave `YYYY-MM-DD`: `0` = Domingo … `6` = Sábado.
 *
 * Aritmética de calendário em UTC — a chave já é dia civil e não deve passar
 * por conversão de fuso de novo, sob pena de segunda-feira virar domingo.
 */
export function weekdayFromDayKey(dayKey: string): number | null {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getUTCDay();
}

/** Domingo → Sábado, para rótulo de eixo. */
export const NOMES_DOS_DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/**
 * Faixa horária da Meta (`"14:00:00 - 14:59:59"`) → `14`.
 *
 * O breakdown `hourly_stats_aggregated_by_advertiser_time_zone` devolve a hora
 * como **texto de intervalo**, não como número — verificado contra a API na
 * Task 0b da 29.69. Sem este parser, a chave do cache viraria a string inteira
 * e nada casaria com a hora da venda.
 */
export function horaDaFaixaMeta(faixa: string | null | undefined): number | null {
  if (!faixa) return null;
  const m = String(faixa).trim().match(/^(\d{1,2}):/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  return h >= 0 && h <= 23 ? h : null;
}

/**
 * Story 44.27 — o primeiro dia de uma janela de `dias` que **termina hoje**.
 *
 * ## Por que este helper existe
 *
 * O seletor de período do painel tinha DUAS réguas para o mesmo número:
 *
 *     vendas do perpétuo   shiftDayKey(businessToday(), -dias)     → dias + 1
 *     investimento         (dias − 1) × 86_400_000                 → dias
 *
 * Com `dias = 7` em 07/09/2026, a tabela listava **oito** dias (31/08→07/09):
 * a venda de 31/08 entrava e o investimento de 31/08 não, porque a janela do
 * spend começava em 01/09. O dia órfão somava receita sem somar custo, e a
 * Tendência de 7 dias emitia **1.61x** onde os seletores de 30 e 90 dias, para
 * a mesma janela, emitiam **1.36x** — 19% de otimismo no bloco cuja função é
 * disparar decisão de corte de verba.
 *
 * A diferença era exatamente o investimento de um dia: R$ 4.646,80 com 31/08,
 * R$ 3.922,21 sem ele.
 *
 * ## Uma janela de N dias TERMINANDO hoje inclui hoje
 *
 * Por isso `-(dias − 1)` e não `-dias`. Sete dias contados a partir de hoje são
 * hoje e os seis anteriores.
 *
 * ⚠️ **Use isto em todo corte por `days`.** Eram cinco pontos em
 * `perpetual-sales-data.ts` (`:321`, `:591`, `:685`, `:846`, `:1016`), e
 * consertar um só deixaria os outros quatro divergindo — foi por isso que
 * virou função com nome em vez de aritmética repetida.
 */
export function inicioDaJanela(dias: number, ate: string = businessToday()): string {
  return shiftDayKey(ate, -(dias - 1));
}
