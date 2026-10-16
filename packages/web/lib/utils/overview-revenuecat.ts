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
  /** Story 42.14 (AC10b) — o eco da janela; ausente/`null` = série inteira (API anterior). */
  days?: number | null;
  desde?: string | null;
}

/** O que `/revenuecat/receita` devolve e os cards usam (Story 42.14). */
export interface ReceitaDoPeriodo {
  configured: boolean;
  days: number;
  desde: string;
  ate: string;
  valorUsd: number | null;
}

/** O que `/revenuecat/novos-clientes` devolve (chart `customers_new`, Story 42.14). */
export interface NovosClientesDoPeriodo {
  configured: boolean;
  days: number;
  desde: string;
  ate: string;
  valor: number | null;
  medida?: string;
  /** O dia de hoje veio com `incomplete: true` (em andamento). */
  diaIncompleto?: boolean;
}

/** `AAAA-MM-DD` a `AAAA-MM-DD` → `dd/mm a dd/mm`. */
function intervaloBr(desde: string, ate: string): string {
  return `${desde.slice(8, 10)}/${desde.slice(5, 7)} a ${ate.slice(8, 10)}/${ate.slice(5, 7)}`;
}

/**
 * Story 42.14 (D22) — o card "Novos clientes" dos DOIS blocos, pela rota de
 * `charts/customers_new` na janela do filtro. Com a API anterior à rota (404 da
 * rota), fica nos 28 dias do overview, declarado e em âmbar (AC10b); com erro,
 * "—" e a causa — sem cair para os 28 dias (AC2d).
 */
export function cardDeNovosClientes(
  estado: EstadoDaFonte<NovosClientesDoPeriodo>,
  overview: EstadoDaFonte<{ id: string; value: number }[]>,
  ctx: ContextoDaJanela,
): CardComJanela {
  const base = { id: "novos-clientes", rotulo: "Novos clientes" };
  if (estado.tipo === "oculto") {
    const decl = declararJanela({ tipo: "fixa", dias: 28, origem: "revenuecat" }, ctx);
    const erro = memorialDoErroDaFonte(overview, { fonte: FONTE_DO_OVERVIEW, periodo: decl.periodo });
    if (erro) return { ...base, valor: "—", declaracao: decl, formula: erro };
    const m = overview.tipo === "pronto" ? overview.dados : null;
    const v = m?.find((x) => x.id === "new_customers_last_28_days")?.value ?? m?.find((x) => x.id === "new_customers")?.value ?? null;
    return {
      ...base,
      valor: fmtNum(v),
      declaracao: decl,
      formula:
        v == null
          ? undefined
          : memorial(decl, {
              expression: "Contagem",
              values: [{ label: "Novos clientes", value: fmtNum(v), source: `${FONTE_DO_OVERVIEW} · new_customers` }],
              result: fmtNum(v),
              note: "App User IDs criados na janela (aliases contam 1). A API ainda não tem a rota de novos clientes por período (versão anterior à do painel — veja o aviso de versão no topo): fica nos 28 dias do overview até o deploy.",
            }),
    };
  }
  const decl = declararJanela({ tipo: "filtro" }, { ...ctx, serieDesde: null });
  const erro = memorialDoErroDaFonte(estado, { fonte: FONTE_DOS_NOVOS_CLIENTES, periodo: decl.periodo });
  if (erro) return { ...base, valor: "—", declaracao: decl, formula: erro };
  const d = estado.tipo === "pronto" && estado.dados.configured ? estado.dados : null;
  if (!d || d.valor == null) return { ...base, valor: "—", declaracao: decl };
  return {
    ...base,
    valor: fmtNum(d.valor),
    declaracao: decl,
    formula: memorial(decl, {
      expression: "Contagem (total do período)",
      values: [{ label: d.medida ?? "Novos clientes", value: fmtNum(d.valor), source: `${FONTE_DOS_NOVOS_CLIENTES} · summary.total` }],
      result: fmtNum(d.valor),
      note: `Clientes novos cuja data de coorte cai no período, como o RevenueCat define (aliases contam 1). O RevenueCat conta os dias em UTC e o intervalo é inclusivo: a janela enviada é ${intervaloBr(d.desde, d.ate)} (dias de SP), então as pontas podem diferir em até 3 h.${d.diaIncompleto ? " O dia de hoje ainda está em andamento (incompleto)." : ""}`,
    }),
  };
}

export interface EntradaDoOverview {
  ctx: ContextoDaJanela;
  /** As métricas de `/metrics/overview` (snapshot + 28 dias). */
  overview: EstadoDaFonte<{ id: string; value: number }[]>;
  /** A receita da janela do filtro (rota nova; `oculto` = API anterior). */
  receita: EstadoDaFonte<ReceitaDoPeriodo>;
  /** Os novos clientes da janela do filtro (`charts/customers_new`; `oculto` = API anterior). */
  novosClientes: EstadoDaFonte<NovosClientesDoPeriodo>;
  /** As métricas dos eventos, pedidas com `days` = o filtro. */
  derivadas: EstadoDaFonte<MetricasDerivadasDoOverview>;
  /** As mesmas, pedidas com `days = 28`: o numerador da Conversão para Trial (D10). */
  derivadas28: EstadoDaFonte<MetricasDerivadasDoOverview>;
  /**
   * Os novos pagantes POR PESSOA dos últimos 28 dias (`pagantes-por-canal?days=28`):
   * o numerador da Conversão para Pagante (PO-04, AC6). `oculto` = API anterior.
   */
  pagantes28: EstadoDaFonte<{ days: number; desde: string; novosPagantes: { total: number } }>;
}

const FONTE_DO_OVERVIEW = "RevenueCat · GET /metrics/overview";
const FONTE_DA_RECEITA = "RevenueCat · GET /metrics/revenue (revenue_type=revenue, currency=USD)";
const FONTE_DAS_DERIVADAS = "eventos do webhook do RevenueCat (revenuecat_sales)";
const FONTE_DOS_NOVOS_CLIENTES = "RevenueCat · GET /charts/customers_new";

/** O memorial de um número: a fórmula com o `period` da declaração da janela. */
function memorial(
  decl: DeclaracaoDaJanela,
  m: Omit<MetricFormula, "period">,
): MetricFormula {
  return { ...m, period: decl.periodo };
}

/**
 * AC10b (PO-10) — a janela que a resposta de `metricas-derivadas` DE FATO
 * aplicou. É o eco que decide, não o pedido: a API anterior ignora `?days=` e
 * devolve a série inteira com 200, e aquela resposta não pode receber a
 * etiqueta "últimos N dias".
 */
export function janelaDasDerivadas(d: Pick<MetricasDerivadasDoOverview, "days">, diasPedidos: number): JanelaDoCard {
  return d.days === diasPedidos ? { tipo: "filtro" } : { tipo: "serie" };
}

/**
 * Story 42.14 (AC1, AC3c) — os cards do Overview do RevenueCat, com a janela de
 * cada um e o memorial que substitui o `title=` nativo. O texto do `detalhe`
 * antigo de cada card é o ponto de partida do memorial: nada se perde (AC1b).
 *
 * Fonte em erro: o card mostra "—" e o memorial diz a causa (PO-D4). Fonte
 * carregando: "—" sem memorial (ainda não há o que explicar).
 *
 * Sonda de produção (2026-10-16): "Novos clientes" segue o filtro pelo chart
 * `customers_new` (que tem `summary.total`). "Usuários ativos" NÃO: o chart
 * `customers_active` conta pessoas por DIA e só traz a média; não há total de
 * pessoas distintas no período, e somar os dias contaria a mesma pessoa várias
 * vezes (19.310 no overview contra ~1.600–1.900 por dia). Ele fica nos 28 dias
 * do overview, com âmbar, e as conversões no ramo D10 (28 dias alinhados).
 */
export function cardsDoOverview(e: EntradaDoOverview): { principais: CardComJanela[]; eventos: CardComJanela[] } {
  const ctx = e.ctx;
  const dec = (janela: JanelaDoCard, serieDesde?: string | null) =>
    declararJanela(janela, serieDesde === undefined ? ctx : { ...ctx, serieDesde });
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

  // ── Receita: a janela do filtro (D22, PO-11); a API anterior à rota fica nos 28 dias, declarada ──
  const cardReceita = ((): CardComJanela => {
    if (e.receita.tipo === "oculto") {
      return doOverview("receita", "Receita", vinteOito, fmtUsd, valor("revenue"), (v) => ({
        expression: "Receita bruta acumulada (US$)",
        values: [{ label: "Receita", value: fmtUsd(v), source: `${FONTE_DO_OVERVIEW} · revenue` }],
        result: fmtUsd(v),
        note: "Receita bruta, na janela fixa de 28 dias do overview: a API ainda não tem a rota de receita por período (versão anterior à do painel — veja o aviso de versão no topo).",
      }));
    }
    // A receita é do RevenueCat, não do webhook: a série de 10/08 não a limita.
    const decl = dec({ tipo: "filtro" }, null);
    const erro = memorialDoErroDaFonte(e.receita, { fonte: FONTE_DA_RECEITA, periodo: decl.periodo });
    if (erro) return { id: "receita", rotulo: "Receita", valor: "—", declaracao: decl, formula: erro };
    const r = e.receita.tipo === "pronto" && e.receita.dados.configured ? e.receita.dados : null;
    const v = r?.valorUsd ?? null;
    return {
      id: "receita",
      rotulo: "Receita",
      valor: fmtUsd(v),
      declaracao: decl,
      formula:
        v == null || !r
          ? undefined
          : memorial(decl, {
              expression: "Receita bruta acumulada (US$)",
              values: [{ label: "Receita", value: fmtUsd(v), source: FONTE_DA_RECEITA }],
              result: fmtUsd(v),
              note: `Receita bruta (antes da comissão de loja e de impostos; menos reembolsos, como o RevenueCat define). O RevenueCat conta os dias em UTC e o intervalo é inclusivo: a janela enviada é ${intervaloBr(r.desde, r.ate)} (dias de SP), então as pontas podem diferir em até 3 h; o dia de hoje ainda está em andamento.`,
            }),
    };
  })();

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
    cardReceita,
    cardDeNovosClientes(e.novosClientes, e.overview, ctx),
    doOverview("usuarios-ativos", "Usuários ativos", vinteOito, fmtNum, usuariosAtivos,
      contagem("Usuários ativos", "active_users", "App User IDs que se comunicaram com o RevenueCat na janela — pessoas distintas nos 28 dias do overview. Não segue o filtro: o gráfico por período do RevenueCat (customers_active) conta pessoas por dia e não dá o total de pessoas distintas, e somar os dias contaria a mesma pessoa várias vezes. É o denominador das duas conversões ao lado. A API pode ter cache de 1 a 2 h.")),
  ];

  // ── as conversões: numerador e denominador nos MESMOS 28 dias (D7, D10, AC2b) ──
  const vinteOitoDias = (desde: string | null | undefined) =>
    desde ? `${desde.slice(8, 10)}/${desde.slice(5, 7)} a ${ctx.hoje.slice(8, 10)}/${ctx.hoje.slice(5, 7)}` : "últimos 28 dias";
  /**
   * Uma conversão: `fonte` é o estado do numerador; `numerador` só é lido com a
   * fonte pronta E com o eco dos 28 dias. Sem o eco (API anterior), o número
   * seria de outra janela — dividir pelos usuários de 28 dias repetiria o
   * defeito que esta story corrige (AC2d), então o card fica "—" e explica.
   */
  const conversao = (
    id: string,
    rotulo: string,
    fonte: EstadoDaFonte<{ days?: number | null; desde?: string | null }>,
    numerador: number | null,
    partes: { label: string; value: string; source: string }[],
    nota: string,
    indisponivel: string,
  ): CardComJanela => {
    const decl = vinteOito;
    const erro =
      memorialDoErroDaFonte(fonte, { fonte: FONTE_DAS_DERIVADAS, periodo: decl.periodo }) ??
      memorialDoErroDaFonte(e.overview, { fonte: FONTE_DO_OVERVIEW, periodo: decl.periodo });
    if (erro) return { id, rotulo, valor: "—", declaracao: decl, formula: erro };
    if (fonte.tipo === "oculto" || (fonte.tipo === "pronto" && fonte.dados.days !== 28)) {
      return {
        id,
        rotulo,
        valor: "—",
        declaracao: decl,
        formula: memorial(decl, {
          expression: `${rotulo.replace("Conversão para ", "")} (28 dias) ÷ Usuários ativos (28 dias)`,
          values: [{ label: "Numerador por janela", value: "indisponível", source: "API anterior à Story 42.14" }],
          result: "—",
          note: `${indisponivel} (versão anterior à do painel — veja o aviso de versão no topo). Dividir um número de outra janela pelos usuários de 28 dias misturaria janelas; a conversão volta depois do deploy.`,
        }),
      };
    }
    if (fonte.tipo !== "pronto") return { id, rotulo, valor: "—", declaracao: decl };
    const taxa = numerador != null && usuariosAtivos ? numerador / usuariosAtivos : null;
    return {
      id,
      rotulo,
      valor: fmtPct(taxa),
      declaracao: decl,
      formula:
        taxa == null
          ? undefined
          : memorial(decl, {
              expression: `${rotulo.replace("Conversão para ", "")} ÷ Usuários ativos`,
              values: [
                ...partes.map((p) => ({ ...p, source: `${p.source} · ${vinteOitoDias(fonte.dados.desde)} (dias de SP)` })),
                { label: "Usuários ativos", value: fmtNum(usuariosAtivos), source: `${FONTE_DO_OVERVIEW} · active_users (28 dias, em UTC)` },
              ],
              result: `${fmtNum(numerador)} ÷ ${fmtNum(usuariosAtivos)} = ${fmtPct(taxa)}`,
              note: `${nota} Numerador e denominador nos mesmos 28 dias: o numerador nos dias de calendário de SP, o denominador nos 28 dias do RevenueCat (UTC; a API não diz se inclui hoje) — diferença de horas nas pontas, da fonte.`,
            }),
    };
  };
  const d28 = e.derivadas28.tipo === "pronto" ? e.derivadas28.dados : null;
  const p28 = e.pagantes28.tipo === "pronto" ? e.pagantes28.dados : null;
  // AC7 da 42.9 — o numerador é quem inicia TRIAL; o rótulo diz TRIAL de propósito.
  principais.push(
    conversao("conversao-trial", "Conversão para Trial", e.derivadas28, d28?.novosTrials ?? null,
      [{ label: "Iniciaram trial (pessoas)", value: fmtNum(d28?.novosTrials), source: FONTE_DAS_DERIVADAS }],
      "Mede entrada no funil de assinatura, NÃO receita.",
      "A API ainda não entrega os eventos por janela"),
    // PO-04 — o numerador é a contagem de novos pagantes POR PESSOA (AC6), não
    // `novasAssinaturasPagas + conversoesDeTrial` (eventos + pessoas, série inteira).
    conversao("conversao-pagante", "Conversão para Pagante", e.pagantes28, p28?.novosPagantes.total ?? null,
      [{ label: "Novos pagantes (pessoas)", value: fmtNum(p28?.novosPagantes.total), source: "eventos do webhook · pagantes-por-canal" }],
      `Este é o número que vira receita. ${"Novo pagante = pessoa cujo primeiro pagamento caiu na janela (quem veio do trial conta na primeira cobrança); quem já pagava antes de a série começar pode aparecer como novo."}`,
      "A API ainda não tem a contagem de novos pagantes por pessoa"),
  );

  // ── os números dos eventos do webhook, na janela do filtro (com o eco) ──
  const d = e.derivadas.tipo === "pronto" ? e.derivadas.dados : null;
  const serieDesde = d?.serieDesde ?? ctx.serieDesde ?? null;
  const declDosEventos = d ? dec(janelaDasDerivadas(d, ctx.diasDoFiltro), serieDesde) : dec({ tipo: "filtro" }, serieDesde);
  const doEvento = (
    id: string,
    rotulo: string,
    fmt: (v: number | null) => string,
    v: number | null,
    corpo: (v: number) => Omit<MetricFormula, "period">,
  ): CardComJanela => {
    const erro = memorialDoErroDaFonte(e.derivadas, { fonte: FONTE_DAS_DERIVADAS, periodo: declDosEventos.periodo });
    if (erro) return { id, rotulo, valor: "—", declaracao: declDosEventos, formula: erro };
    return { id, rotulo, valor: fmt(v), declaracao: declDosEventos, formula: v == null ? undefined : memorial(declDosEventos, corpo(v)) };
  };
  const contagemDeEventos = (label: string, nota: string) => (v: number) => ({
    expression: "Contagem de eventos",
    values: [{ label, value: fmtNum(v), source: FONTE_DAS_DERIVADAS }],
    result: fmtNum(v),
    note: nota,
  });

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
          note: "Trials iniciados na janela cuja pessoa pagou alguma vez, em qualquer momento da série (inclusive depois do fim da janela).",
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

  return { principais: [...principais], eventos };
}
