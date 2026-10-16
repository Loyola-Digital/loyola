// ============================================================
// Story 42.9 — o que cada número do Overview significa.
//
// Duas naturezas na mesma resposta da API, e confundi-las é o erro fácil:
//
//   active_subscriptions, active_trials, mrr  → SNAPSHOT de agora
//   revenue, new_customers                    → acumulado de 28 DIAS
//
// O filtro de dias da etapa não governa nenhuma das duas. Exibir um snapshot ao
// lado do filtro sem dizer faria o gestor ler o número como resposta ao filtro.
//
// Story 42.14 — o vocabulário de janela saiu daqui para
// `janela-dos-cards-lyrio.ts`, a fonte única dos dois blocos (AC2a). Este módulo
// monta os cards do Overview: valor, janela e o memorial de cada um (AC1), que
// substitui o `title=` nativo.
// ============================================================

import type { MetricFormula } from "@/lib/types/metric-formula";
import {
  declararJanela,
  type ContextoDaJanela,
  type DeclaracaoDaJanela,
  type JanelaDoCard,
} from "./janela-dos-cards-lyrio";
import { memorialDoErroDaFonte, type EstadoDaFonte } from "./estado-da-fonte-revenuecat";

/** Dólar — `mrr` e `revenue` vêm em USD; exibir como real erraria ~5x. */
export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}

export function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`;
}

/** Movimento com sinal — o que a métrica quer dizer é a direção. */
export function fmtMovimento(v: number | null | undefined): string {
  if (v == null) return "—";
  return v > 0 ? `+${fmtNum(v)}` : fmtNum(v);
}

/**
 * ARR = MRR × 12 (AC3). `null` entra e sai como `null`: "não sabemos" nunca
 * pode virar "zero" num card de receita anual.
 */
export function arrDoMrr(mrr: number | null | undefined): number | null {
  return mrr == null ? null : mrr * 12;
}

/**
 * AC5 — a frase que declara desde quando a série de assinatura existe.
 *
 * Os eventos de assinatura começam em 10/ago/2026; os de paywall vêm de junho.
 * Sem essa declaração, um número de churn seria lido como "desde sempre".
 */
export function avisoDaSerie(serieDesde: string | null | undefined): string | null {
  if (!serieDesde) return null;
  const [a, m, d] = serieDesde.split("-");
  return `Série de assinaturas desde ${d}/${m}/${a} — antes disso o webhook ainda não registrava estes eventos.`;
}

// ─────────────────────────── cards do Overview (Story 42.14) ───────────────────────────

/** Um card dos dois blocos: valor, janela declarada e memorial (AC1). */
export interface CardComJanela {
  id: string;
  rotulo: string;
  valor: string;
  declaracao: DeclaracaoDaJanela;
  /** `undefined` = ausência legítima (o card repassa sem tooltip, AC1c). */
  formula?: MetricFormula;
}

/** Espelha `GET …/revenuecat/metricas-derivadas`. */
export interface MetricasDerivadasDoOverview {
  novasAssinaturasPagas: number;
  novosTrials: number;
  conversoesDeTrial: number;
  taxaDeConversaoDeTrial: number | null;
  churnPagante: number;
  abandonoDeTrial: number;
  cancelamentosPagantes: number;
  movimentoDeAssinaturas: number;
  serieDesde: string | null;
  totalDeEventos: number;
}

export interface EntradaDoOverview {
  ctx: ContextoDaJanela;
  /** As métricas de `/metrics/overview` (snapshot + 28 dias). */
  overview: EstadoDaFonte<{ id: string; value: number }[]>;
  /** As métricas dos eventos do webhook. */
  derivadas: EstadoDaFonte<MetricasDerivadasDoOverview>;
}

const FONTE_DO_OVERVIEW = "RevenueCat · GET /metrics/overview";
const FONTE_DAS_DERIVADAS = "eventos do webhook do RevenueCat (revenuecat_sales)";

/** O memorial de um número: a fórmula com o `period` da declaração da janela. */
function memorial(
  decl: DeclaracaoDaJanela,
  m: Omit<MetricFormula, "period">,
): MetricFormula {
  return { ...m, period: decl.periodo };
}

/**
 * Story 42.14 (AC1, AC3c) — os cards do Overview do RevenueCat, com a janela de
 * cada um e o memorial que substitui o `title=` nativo. O texto do `detalhe`
 * antigo de cada card é o ponto de partida do memorial: nada se perde (AC1b).
 *
 * Fonte em erro: o card mostra "—" e o memorial diz a causa (PO-D4). Fonte
 * carregando: "—" sem memorial (ainda não há o que explicar).
 */
export function cardsDoOverview(e: EntradaDoOverview): { principais: CardComJanela[]; eventos: CardComJanela[] } {
  const ctx = e.ctx;
  const dec = (janela: JanelaDoCard) => declararJanela(janela, ctx);
  const agora = dec({ tipo: "agora" });
  const vinteOito = dec({ tipo: "fixa", dias: 28, origem: "revenuecat" });

  const metricas = e.overview.tipo === "pronto" ? e.overview.dados : null;
  const valor = (id: string): number | null => metricas?.find((x) => x.id === id)?.value ?? null;

  /** Um card do overview: número da API, ou "—" com a causa do erro. */
  const doOverview = (
    id: string,
    rotulo: string,
    decl: DeclaracaoDaJanela,
    fmt: (v: number | null) => string,
    v: number | null,
    corpo: (v: number) => Omit<MetricFormula, "period">,
  ): CardComJanela => {
    const erro = memorialDoErroDaFonte(e.overview, { fonte: FONTE_DO_OVERVIEW, periodo: decl.periodo });
    if (erro) return { id, rotulo, valor: "—", declaracao: decl, formula: erro };
    return { id, rotulo, valor: fmt(v), declaracao: decl, formula: v == null ? undefined : memorial(decl, corpo(v)) };
  };

  const contagem = (label: string, metrica: string, nota: string) => (v: number) => ({
    expression: "Contagem",
    values: [{ label, value: fmtNum(v), source: `${FONTE_DO_OVERVIEW} · ${metrica}` }],
    result: fmtNum(v),
    note: nota,
  });

  const mrr = valor("mrr");
  const usuariosAtivos = valor("active_users");

  const principais: CardComJanela[] = [
    doOverview("assinaturas", "Assinaturas ativas", agora, fmtNum, valor("active_subscriptions"),
      contagem("Assinaturas ativas", "active_subscriptions", "Assinaturas pagas ativas neste instante (o RevenueCat inclui as canceladas que ainda têm acesso e as em período de graça).")),
    doOverview("trials", "Trials ativos", agora, fmtNum, valor("active_trials"),
      contagem("Trials ativos", "active_trials", "Períodos de teste em andamento neste instante. Ainda não viraram receita.")),
    doOverview("mrr", "MRR", agora, fmtUsd, mrr, (v) => ({
      expression: "MRR (US$)",
      values: [{ label: "MRR", value: fmtUsd(v), source: `${FONTE_DO_OVERVIEW} · mrr` }],
      result: fmtUsd(v),
      note: "Receita recorrente mensal, como a API a calcula. Em dólar. Não é média de período.",
    })),
    // AC3a — o ARR leva `agora`; o "derivado: MRR × 12" vai no memorial.
    doOverview("arr", "ARR", agora, fmtUsd, arrDoMrr(mrr), () => ({
      expression: "MRR × 12",
      values: [{ label: "MRR", value: fmtUsd(mrr), source: `${FONTE_DO_OVERVIEW} · mrr` }],
      result: `${fmtUsd(mrr)} × 12 = ${fmtUsd(arrDoMrr(mrr))}`,
      note: "Derivado: não é medido pela API. É o MRR de agora projetado em 12 meses.",
    })),
    doOverview("receita", "Receita", vinteOito, fmtUsd, valor("revenue"), (v) => ({
      expression: "Receita bruta acumulada (US$)",
      values: [{ label: "Receita", value: fmtUsd(v), source: `${FONTE_DO_OVERVIEW} · revenue` }],
      result: fmtUsd(v),
      note: "Receita bruta (antes da comissão de loja e de impostos), na janela fixa de 28 dias da API.",
    })),
    doOverview("novos-clientes", "Novos clientes", vinteOito, fmtNum, valor("new_customers"),
      contagem("Novos clientes", "new_customers", "App User IDs criados na janela (aliases contam 1). A API pode ter cache de 1 a 2 h.")),
    doOverview("usuarios-ativos", "Usuários ativos", vinteOito, fmtNum, usuariosAtivos,
      contagem("Usuários ativos", "active_users", "App User IDs que se comunicaram com o RevenueCat na janela. É o denominador das duas conversões ao lado. A API pode ter cache de 1 a 2 h.")),
  ];

  // ── os números dos eventos do webhook ──
  const d = e.derivadas.tipo === "pronto" ? e.derivadas.dados : null;
  const serie = declararJanela({ tipo: "serie" }, { ...ctx, serieDesde: d?.serieDesde ?? ctx.serieDesde });
  const doEvento = (
    id: string,
    rotulo: string,
    fmt: (v: number | null) => string,
    v: number | null,
    corpo: (v: number) => Omit<MetricFormula, "period">,
  ): CardComJanela => {
    const erro = memorialDoErroDaFonte(e.derivadas, { fonte: FONTE_DAS_DERIVADAS, periodo: serie.periodo });
    if (erro) return { id, rotulo, valor: "—", declaracao: serie, formula: erro };
    return { id, rotulo, valor: fmt(v), declaracao: serie, formula: v == null ? undefined : memorial(serie, corpo(v)) };
  };
  const contagemDeEventos = (label: string, nota: string) => (v: number) => ({
    expression: "Contagem de eventos",
    values: [{ label, value: fmtNum(v), source: FONTE_DAS_DERIVADAS }],
    result: fmtNum(v),
    note: nota,
  });

  // A conversão: numerador dos eventos, denominador do overview. Só existe com os dois.
  const conversao = (id: string, rotulo: string, numerador: number | null, partes: { label: string; value: string }[], nota: string): CardComJanela => {
    const erro =
      memorialDoErroDaFonte(e.derivadas, { fonte: FONTE_DAS_DERIVADAS, periodo: serie.periodo }) ??
      memorialDoErroDaFonte(e.overview, { fonte: FONTE_DO_OVERVIEW, periodo: serie.periodo });
    if (erro) return { id, rotulo, valor: "—", declaracao: serie, formula: erro };
    const taxa = numerador != null && usuariosAtivos ? numerador / usuariosAtivos : null;
    return {
      id,
      rotulo,
      valor: fmtPct(taxa),
      declaracao: serie,
      formula:
        taxa == null
          ? undefined
          : memorial(serie, {
              expression: `${rotulo.replace("Conversão para ", "")} ÷ Usuários ativos`,
              values: [
                ...partes.map((p) => ({ ...p, source: FONTE_DAS_DERIVADAS })),
                { label: "Usuários ativos", value: fmtNum(usuariosAtivos), source: `${FONTE_DO_OVERVIEW} · active_users (28 dias)` },
              ],
              result: `${fmtNum(numerador)} ÷ ${fmtNum(usuariosAtivos)} = ${fmtPct(taxa)}`,
              note: nota,
            }),
    };
  };

  if (d) {
    // AC7 da 42.9 — o numerador é quem inicia TRIAL; o rótulo diz TRIAL de propósito.
    principais.push(
      conversao("conversao-trial", "Conversão para Trial", d.novosTrials,
        [{ label: "Iniciaram trial", value: fmtNum(d.novosTrials) }],
        "Mede entrada no funil de assinatura, NÃO receita. ⚠️ O numerador é da série inteira e o denominador é de 28 dias: as duas pontas estão em janelas diferentes."),
      conversao("conversao-pagante", "Conversão para Pagante", d.novasAssinaturasPagas + d.conversoesDeTrial,
        [
          { label: "Entraram pagando (eventos)", value: fmtNum(d.novasAssinaturasPagas) },
          { label: "Converteram do trial", value: fmtNum(d.conversoesDeTrial) },
        ],
        "Este é o número que vira receita. ⚠️ O numerador é da série inteira e o denominador é de 28 dias: as duas pontas estão em janelas diferentes."),
    );
  }

  const eventos: CardComJanela[] = d || e.derivadas.tipo === "erro"
    ? [
        doEvento("novas-pagas", "Novas assinaturas pagas", fmtNum, d?.novasAssinaturasPagas ?? null,
          contagemDeEventos("INITIAL_PURCHASE pagos", "Conta EVENTOS de compra que já entraram pagando (period_type NORMAL/INTRO/PROMOTIONAL), não pessoas: quem assina, cancela e assina de novo conta duas vezes.")),
        doEvento("conversoes-trial", "Conversões de trial", fmtNum, d?.conversoesDeTrial ?? null, (v) => ({
          expression: "Trials da janela que pagaram depois",
          values: [
            { label: "Converteram", value: fmtNum(v), source: FONTE_DAS_DERIVADAS },
            { label: "Iniciaram trial", value: fmtNum(d?.novosTrials), source: FONTE_DAS_DERIVADAS },
          ],
          result: `${fmtNum(v)} de ${fmtNum(d?.novosTrials)} (${fmtPct(d?.taxaDeConversaoDeTrial)})`,
          note: "Trials iniciados na janela cuja pessoa pagou alguma vez, em qualquer momento da série.",
        })),
        // O churn conta só EXPIRATION de quem PAGAVA. Somar o abandono de trial
        // daria um número muito maior e sobre outra pergunta.
        doEvento("churn", "Churn (pagantes)", fmtNum, d?.churnPagante ?? null,
          contagemDeEventos("EXPIRATION pagos", "Assinaturas PAGAS que expiraram. Não inclui trial abandonado nem cancelamento — quem cancelou ainda tem acesso até o fim do ciclo.")),
        doEvento("movimento", "Movimento de assinaturas", fmtMovimento, d?.movimentoDeAssinaturas ?? null, (v) => ({
          expression: "Entradas pagas + conversões de trial − expirações pagas",
          values: [
            { label: "Entradas pagas", value: fmtNum(d?.novasAssinaturasPagas), source: FONTE_DAS_DERIVADAS },
            { label: "Conversões de trial", value: fmtNum(d?.conversoesDeTrial), source: FONTE_DAS_DERIVADAS },
            { label: "Expirações pagas", value: fmtNum(d?.churnPagante), source: FONTE_DAS_DERIVADAS },
          ],
          result: `${fmtNum(d?.novasAssinaturasPagas)} + ${fmtNum(d?.conversoesDeTrial)} − ${fmtNum(d?.churnPagante)} = ${fmtMovimento(v)}`,
          note: "Cancelamento não entra: o acesso continua até o fim do ciclo, e existe reativação.",
        })),
        doEvento("trials-abandonados", "Trials abandonados", fmtNum, d?.abandonoDeTrial ?? null,
          contagemDeEventos("EXPIRATION de trial", "Testes que expiraram sem virar assinatura. É abandono, não churn de cliente.")),
        doEvento("cancelamentos", "Cancelamentos", fmtNum, d?.cancelamentosPagantes ?? null,
          contagemDeEventos("CANCELLATION pagos", "Pagantes que desligaram a renovação. Ainda têm acesso — viram churn quando expirar, se não reativarem.")),
      ]
    : [];

  return { principais, eventos };
}
