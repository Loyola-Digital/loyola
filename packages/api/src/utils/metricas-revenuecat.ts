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
