// ============================================================
// Story 42.9 — as métricas que a API do RevenueCat não entrega.
//
// `/v2/.../metrics/overview` devolve 6 escalares (active_trials,
// active_subscriptions, mrr, revenue, new_customers, active_users). O resto do
// que o gestor pediu é Chart do dashboard, fora da API v2 — mas sai dos
// eventos de webhook que já guardamos em `revenuecat_sales`.
//
// ## A armadilha central: trial e assinatura paga terminam do mesmo jeito
//
// Medido em produção (2026-08-25):
//
// ```
//    CANCELLATION  TRIAL   158        EXPIRATION  TRIAL   164
//    CANCELLATION  NORMAL   30        EXPIRATION  NORMAL    5
// ```
//
// Somar tudo daria "churn de 177" — misturando 164 pessoas que largaram o
// trial com 5 clientes pagantes perdidos. São perguntas diferentes, e a
// segunda é a que dói. Por isso todo evento de saída é lido COM o
// `period_type`, nunca só pelo tipo.
//
// ## CANCELLATION não é EXPIRATION
//
// `CANCELLATION` é o pedido: a pessoa desliga a renovação e continua com
// acesso até o fim do ciclo. `EXPIRATION` é a assinatura terminando de fato.
// Contar os dois como saída conta a mesma pessoa duas vezes, com semanas de
// distância. Aqui o churn é `EXPIRATION` — a saída consumada — e o
// cancelamento aparece separado, como intenção.
// ============================================================

import { sql, type SQL } from "drizzle-orm";
import { revenuecatSales } from "../db/schema.js";
import { instanteDoInicioDaJanela } from "./sale-date.js";
import { dataIso } from "./vendas-por-canal-lyrio.js";

/** O que uma linha de `revenuecat_sales` precisa expor. */
export interface EventoRevenuecat {
  eventType: string | null;
  /** `payload.event.period_type`: TRIAL | NORMAL | INTRO | PROMOTIONAL. */
  periodType: string | null;
  appUserId: string | null;
  eventAt: Date | null;
}

export interface MetricasDerivadas {
  /** `INITIAL_PURCHASE` com period_type NORMAL — entrou pagando. */
  novasAssinaturasPagas: number;
  /** Pessoas que iniciaram trial no período. */
  novosTrials: number;
  /** Trials que passaram a pagar (mesma pessoa, evento pago depois). */
  conversoesDeTrial: number;
  /** `conversoesDeTrial ÷ novosTrials`, ou `null` sem trial no período. */
  taxaDeConversaoDeTrial: number | null;
  /** `EXPIRATION` de assinatura PAGA — o churn que importa. */
  churnPagante: number;
  /** `EXPIRATION` de trial — abandono, não churn. */
  abandonoDeTrial: number;
  /** `CANCELLATION` de pagante: pediu para sair, ainda tem acesso. */
  cancelamentosPagantes: number;
  /** Entradas menos saídas de assinatura paga. */
  movimentoDeAssinaturas: number;
}

const ENTRADA_PAGA = "INITIAL_PURCHASE";
const PAGO = new Set(["NORMAL", "INTRO", "PROMOTIONAL"]);

function ehPago(periodType: string | null): boolean {
  return PAGO.has((periodType ?? "").toUpperCase());
}
function ehTrial(periodType: string | null): boolean {
  return (periodType ?? "").toUpperCase() === "TRIAL";
}

/**
 * Calcula as métricas derivadas de uma janela de eventos.
 *
 * @param eventos  todos os eventos da janela
 * @param eventosDeSempre  a série COMPLETA, usada só para saber se um trial da
 *   janela converteu depois. Sem isso, um trial iniciado no fim do período
 *   contaria como não convertido para sempre.
 */
export function calcularMetricasDerivadas(
  eventos: EventoRevenuecat[],
  eventosDeSempre: EventoRevenuecat[] = eventos,
): MetricasDerivadas {
  let novasAssinaturasPagas = 0;
  let churnPagante = 0;
  let abandonoDeTrial = 0;
  let cancelamentosPagantes = 0;

  const trialsDaJanela = new Set<string>();

  for (const e of eventos) {
    const t = e.eventType ?? "";
    if (t === ENTRADA_PAGA) {
      if (ehPago(e.periodType)) novasAssinaturasPagas++;
      else if (ehTrial(e.periodType) && e.appUserId) trialsDaJanela.add(e.appUserId);
    } else if (t === "EXPIRATION") {
      if (ehPago(e.periodType)) churnPagante++;
      else if (ehTrial(e.periodType)) abandonoDeTrial++;
    } else if (t === "CANCELLATION" && ehPago(e.periodType)) {
      cancelamentosPagantes++;
    }
  }

  // Quem já pagou alguma vez, em toda a série. `RENEWAL` entra porque é assim
  // que o trial vira pago: a primeira renovação depois do período gratuito.
  const jaPagou = new Set<string>();
  for (const e of eventosDeSempre) {
    const t = e.eventType ?? "";
    if ((t === ENTRADA_PAGA || t === "RENEWAL") && ehPago(e.periodType) && e.appUserId) {
      jaPagou.add(e.appUserId);
    }
  }

  let conversoesDeTrial = 0;
  for (const u of trialsDaJanela) if (jaPagou.has(u)) conversoesDeTrial++;

  return {
    novasAssinaturasPagas,
    novosTrials: trialsDaJanela.size,
    conversoesDeTrial,
    taxaDeConversaoDeTrial: trialsDaJanela.size > 0 ? conversoesDeTrial / trialsDaJanela.size : null,
    churnPagante,
    abandonoDeTrial,
    cancelamentosPagantes,
    // Entradas pagas menos saídas consumadas. O cancelamento NÃO entra: quem
    // cancelou ainda tem acesso, e subtraí-lo aqui adiantaria uma saída que
    // pode nem acontecer (existe `UNCANCELLATION`).
    movimentoDeAssinaturas: novasAssinaturasPagas + conversoesDeTrial - churnPagante,
  };
}

/**
 * Story 42.9 (AC3) — ARR a partir do MRR.
 *
 * Derivação, não medição: a tela declara a conta. `null` entra e sai como
 * `null` para que "não sabemos" não vire "zero".
 */
export function arrDoMrr(mrr: number | null | undefined): number | null {
  return mrr == null ? null : mrr * 12;
}

/**
 * Story 42.9 (AC7) — conversão para trial, sobre Active Users.
 *
 * Decisão do gestor (2026-08-25): o numerador é quem iniciou TRIAL. Medido no
 * dia da decisão, 182 de 11.124 Active Users — 1,64%.
 *
 * ⚠️ Não é "Conversion to Paying". Com esse numerador a métrica mede entrada no
 * funil de assinatura, não receita: quem de fato paga eram 36 (0,32%). O rótulo
 * na tela precisa dizer TRIAL, ou o app parece 5x melhor do que converte.
 */
export function conversaoParaTrial(
  novosTrials: number,
  activeUsers: number | null | undefined,
): number | null {
  if (!activeUsers || activeUsers <= 0) return null;
  return novosTrials / activeUsers;
}

// ─────────────────── Story 42.14 — a rota `metricas-derivadas` ───────────────────

/** Executa um SQL e devolve as linhas — `fastify.db.execute` na rota, `pg` read-only na sonda. */
export type ExecutorDeSql = (q: SQL) => Promise<{ rows: unknown[] }>;

/**
 * Os eventos da etapa que as métricas derivadas leem. Só o `period_type` do
 * payload, não o payload inteiro (que é o que pesa nos 186 mil eventos).
 *
 * QA PERF-001 (sonda de produção, 2026-10-27): só os eventos de ASSINATURA —
 * sem `TEST` e sem `PAYWALL_*`. Paywall é 98% da etapa (~236 mil de ~241 mil
 * eventos) e nenhuma conta daqui o lê: `calcularMetricasDerivadas` só olha
 * INITIAL_PURCHASE, RENEWAL, EXPIRATION e CANCELLATION, e `serieDesde` /
 * `totalDeEventos` já descartavam esses mesmos tipos em memória. Trazê-los
 * custava 1,3 s a 2,3 s por chamada (duas por carga da tela). O corte da
 * janela continua em memória de propósito: a série INTEIRA é a referência do
 * `jaPagou` (achado C), e são poucos milhares de linhas.
 */
export function consultaDosEventosDasDerivadas(stageId: string): SQL {
  const c = revenuecatSales;
  return sql`SELECT ${c.eventType} AS event_type, ${c.appUserId} AS app_user_id, ${c.eventAt} AS event_at,
    (${c.payload}->'event'->>'period_type') AS period_type
  FROM ${c} WHERE ${c.stageId} = ${stageId} AND ${c.eventType} <> 'TEST' AND ${c.eventType} NOT LIKE 'PAYWALL%'`;
}

/** Linha crua do `execute` → evento tipado. O timestamp chega como `Date` ou texto. */
export function lerEventoDasDerivadas(r: Record<string, unknown>): EventoRevenuecat {
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  let eventAt: Date | null = null;
  if (r.event_at instanceof Date) eventAt = r.event_at;
  else if (typeof r.event_at === "string" && r.event_at) {
    const d = new Date(r.event_at);
    eventAt = Number.isNaN(d.getTime()) ? null : d;
  }
  return { eventType: texto(r.event_type), appUserId: texto(r.app_user_id), eventAt, periodType: texto(r.period_type) };
}

/**
 * Story 42.14 (AC2b, AC10b) — a resposta inteira de `metricas-derivadas`. Mora
 * aqui (e não na rota) para a rota e a sonda de conferência em produção
 * rodarem o MESMO código.
 *
 * Com `days`: os números saem dos eventos da janela (N dias de calendário de
 * SP, a régua de `/sales`), e a série INTEIRA continua sendo a referência para
 * saber se um trial da janela pagou depois (achado C). Sem `days`, a série
 * inteira, como antes. A resposta ECOA a janela (`days`/`desde`, `null` sem
 * janela): a API anterior ignora `?days=` e devolve 200 com a série inteira.
 */
export async function metricasDerivadasDaEtapa(
  executar: ExecutorDeSql,
  stageId: string,
  days: number | undefined,
  agora: Date = new Date(),
) {
  const { rows } = await executar(consultaDosEventosDasDerivadas(stageId));
  const eventos = (rows as Record<string, unknown>[]).map(lerEventoDasDerivadas);

  // Só os eventos de ASSINATURA definem a data de início da série: os de
  // paywall existem desde 11/jun e diriam que a série começa antes do que de
  // fato começa.
  const deAssinatura = eventos.filter((e) => e.eventType && e.eventType !== "TEST" && !e.eventType.startsWith("PAYWALL"));
  const datas = deAssinatura
    .map((e) => e.eventAt)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime());

  const desde = days != null ? instanteDoInicioDaJanela(days, agora) : null;
  const naJanela = desde ? eventos.filter((e) => e.eventAt instanceof Date && e.eventAt >= desde) : eventos;

  return {
    ...calcularMetricasDerivadas(naJanela, eventos),
    // O dia de SP, a régua da janela (42.13, MNT-001).
    serieDesde: dataIso(datas[0]),
    totalDeEventos: deAssinatura.length,
    days: days ?? null,
    desde: desde ? dataIso(desde) : null,
  };
}
