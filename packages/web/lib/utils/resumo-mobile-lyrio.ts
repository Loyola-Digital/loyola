/**
 * Story 42.14 — os cards do Resumo mobile da etapa Lyrio: valor, janela
 * declarada e memorial de cada um. Saiu do `useMemo` de `lyrio-stage-view.tsx`
 * (Story 42.2/42.4) para cá, onde o vitest alcança (AC9d, último item).
 *
 * ## O que mudou de janela (D22, D17)
 *
 *   Investimento Meta ...... 28 dias fixos → o FILTRO (a régua de SP)
 *   Investimento Google .... 28 dias N+1 em UTC → o FILTRO, na régua de SP
 *   Receita ................ `revenue_last_28_days` → `/metrics/revenue` do filtro
 *   ROAS, Margem ........... seguem, por consequência dos insumos
 *   MRR, assinaturas, trials  continuam `agora` (retrato)
 *   Novos clientes ......... 28 dias do overview → `charts/customers_new` do filtro
 *
 * ## Nenhuma razão mistura janelas (AC2d)
 *
 * ROAS e Margem dividem uma receita e um investimento da MESMA janela. Se a
 * receita do filtro falha, os dois ficam "—" com a causa — nunca caem para o
 * `revenue_last_28_days` (PO-D4 (4)). Só a API ANTERIOR à rota de receita (404 da
 * rota, contrato < 59) leva o trio Receita/ROAS/Margem aos 28 dias, e aí os três
 * dizem isso com etiqueta e âmbar: o que era antes, declarado (AC10b).
 *
 * ## Novos clientes
 *
 * Segue o filtro pelo chart `customers_new` (D22), cuja forma foi conferida na
 * sonda de produção de 2026-10-16 (`summary.total` pelo `display_name` da
 * medida). O card é o mesmo do Overview (`cardDeNovosClientes`).
 */

import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { calcularMargemContribuicao, fecharEmCentavos } from "./lyrio-margin";
import { memorialDoGoogleSemNumero } from "./lyrio-google-ads";
import { declararJanela, intervaloDaJanela, type ContextoDaJanela, type DeclaracaoDaJanela, type JanelaDoCard } from "./janela-dos-cards-lyrio";
import { memorialDoErroDaFonte, naJanelaPedida, type EstadoDaFonte } from "./estado-da-fonte-revenuecat";
import { comoEstadoDoGoogle, NOTA_DO_FUSO_DO_GOOGLE, valorDoGoogleNaRegua, type InvestimentoDoGoogleNaRegua } from "./google-ads-na-regua";
import { cardDeNovosClientes, fmtUsd, type CardComJanela, type NovosClientesDoPeriodo, type ReceitaDoPeriodo } from "./overview-revenuecat";

/** Os ícones moram no componente; aqui só a chave (o vitest coleta `.ts` sem JSX). */
export type IconeDoCard = "investimento" | "receita" | "roas" | "margem" | "mrr" | "assinaturas" | "trials" | "clientes" | "cac" | "ltv" | "renovacao";

export interface CardDoResumo extends CardComJanela {
  icone: IconeDoCard;
  /** Destaque de resultado (ROAS, Margem). */
  realce?: boolean;
  /** Valor negativo que não pode passar despercebido (margem). */
  negativo?: boolean;
}

/** O gasto da Meta numa janela (`sumMetaSpendWithTax`). */
export interface GastoDaMeta {
  spendLiquido: number;
  imposto: number;
  spendComImposto: number;
}

export interface EntradaDoResumo {
  ctx: ContextoDaJanela;
  cambio: { taxa: number | null; fonte: string };
  /**
   * Investimento da Meta: `undefined` = carregando. Sem campanha vinculada = 0
   * (não há investimento). `erroFiltro`/`erro28` (QA REL-001): a mensagem da
   * consulta em erro — o "—" passa a dizer a causa.
   */
  meta: { temCampanhas: boolean; filtro: GastoDaMeta | undefined; vinteOito: GastoDaMeta | undefined; erroFiltro?: string | null; erro28?: string | null };
  google: { mostrar: boolean; filtro: InvestimentoDoGoogleNaRegua; vinteOito: InvestimentoDoGoogleNaRegua };
  /** A receita da janela do filtro (rota nova; `oculto` = API anterior). */
  receita: EstadoDaFonte<ReceitaDoPeriodo>;
  /** Os novos clientes da janela do filtro (rota nova; `oculto` = API anterior). */
  novosClientes: EstadoDaFonte<NovosClientesDoPeriodo>;
  /** O overview: snapshots e, só com a API anterior, a receita e os novos clientes de 28 dias. */
  overview: EstadoDaFonte<{ id: string; value: number }[]>;
  percentuais: { platformFeePct: number; taxPct: number; otherCostsPct: number };
}

export function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
export function fmtRoas(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}
const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR"));

const FONTE_DO_OVERVIEW = "RevenueCat · GET /metrics/overview";
const FONTE_DA_RECEITA = "RevenueCat · GET /metrics/revenue (revenue_type=revenue, currency=USD)";

function metrica(m: { id: string; value: number }[] | null, ...ids: string[]): number | null {
  if (!m) return null;
  for (const id of ids) {
    const x = m.find((y) => y.id === id);
    if (x) return x.value;
  }
  return null;
}

/**
 * Story 42.14 (QA REL-001) — o memorial do "—" quando a consulta da Meta
 * (`/api/traffic/analytics/:projectId/campaign-daily`) falhou. Antes do REL-001,
 * a falha ficava "—" sem causa, como se ainda carregasse.
 */
export function memorialDoErroDaMeta(mensagem: string, periodo: string, dependentes: string): MetricFormula {
  return {
    expression: "Meta Ads API indisponível",
    values: [{ label: "Erro", value: mensagem, source: "GET /api/traffic/analytics/:projectId/campaign-daily" }],
    result: "—",
    period: periodo,
    note: `A consulta do gasto diário da Meta falhou; tente atualizar. Enquanto isso, ${dependentes} "—": sem a Meta, o investimento é desconhecido.`,
  };
}

/** Memorial de um card dependente que ficou "—": a causa de cada insumo que faltou (PO-D4 (4)). */
function memorialDeDependente(decl: DeclaracaoDaJanela, expressao: string, causas: MetricFormulaValue[]): MetricFormula {
  return {
    expression: expressao,
    values: causas,
    result: "—",
    period: decl.periodo,
    note: "Sem um dos insumos, a conta não fecha — o card fica \"—\", nunca um número parcial nem o de outra janela.",
  };
}

/**
 * Os cards do Resumo mobile (sem os CACs, LTVs e renovações — `cardsDeAquisicao`).
 * Ordem de exibição: o fluxo (investimento → receita → ROAS → margem), os
 * retratos e os novos clientes.
 */
export function cardsDoResumo(e: EntradaDoResumo): CardDoResumo[] {
  const { ctx, cambio } = e;
  const dec = (j: JanelaDoCard) => declararJanela(j, ctx);
  const filtro = dec({ tipo: "filtro" });
  const agora = dec({ tipo: "agora" });
  const rc28 = dec({ tipo: "fixa", dias: 28, origem: "revenuecat" });
  const overview = e.overview.tipo === "pronto" ? e.overview.dados : null;
  const erroDoOverview = (periodo: string) => memorialDoErroDaFonte(e.overview, { fonte: FONTE_DO_OVERVIEW, periodo });
  const cambioValue: MetricFormulaValue | null =
    cambio.taxa != null ? { label: "Câmbio US$ 1 →", value: fmtBRL(cambio.taxa), source: cambio.fonte } : null;

  // QA TEST-001 — a receita só vale para a janela que ECOA (AC10b).
  const receitaDaJanela = naJanelaPedida(e.receita, ctx.diasDoFiltro);
  // ── a janela do fluxo: o filtro; só a API anterior à rota de receita leva aos 28 dias ──
  const apiAnterior = receitaDaJanela.tipo === "oculto";
  const declDoFluxo = apiAnterior ? rc28 : filtro;
  const intervaloDoFiltro = `${intervaloDaJanela(ctx.diasDoFiltro, ctx.hoje)}`;

  // Investimento Meta e Google (os cards seguem SEMPRE o filtro: não dependem da rota nova).
  const gastoMeta = (g: GastoDaMeta | undefined): GastoDaMeta | undefined =>
    e.meta.temCampanhas ? g : { spendLiquido: 0, imposto: 0, spendComImposto: 0 };
  const metaFiltro = gastoMeta(e.meta.filtro);

  const cardMeta = (g: GastoDaMeta | undefined, decl: DeclaracaoDaJanela, erro: string | null | undefined): CardDoResumo => {
    if (erro && e.meta.temCampanhas) {
      return { id: "investimento-meta", rotulo: "Investimento (Meta)", valor: "—", declaracao: decl, icone: "investimento", formula: memorialDoErroDaMeta(erro, decl.periodo, "o ROAS, a Margem e os CACs ficam") };
    }
    if (!g) return { id: "investimento-meta", rotulo: "Investimento (Meta)", valor: "—", declaracao: decl, icone: "investimento" };
    // QA-04 da 42.2: as duas parcelas SOMAM o total exibido.
    const [liq, imp] = fecharEmCentavos(g.spendComImposto, [g.spendLiquido, g.imposto]);
    return {
      id: "investimento-meta",
      rotulo: "Investimento (Meta)",
      valor: fmtBRL(g.spendComImposto),
      declaracao: decl,
      icone: "investimento",
      formula: {
        expression: "Σ spend diário ÷ (1 − 12,15%)",
        values: [
          { label: "Investimento líquido", value: fmtBRL(liq), source: "Meta Ads API · soma do spend diário das campanhas vinculadas" },
          { label: "Imposto (12,15%)", value: fmtBRL(imp), source: "alíquota vigente desde 01/01/2026, aplicada por dia" },
        ],
        result: `${fmtBRL(liq)} + ${fmtBRL(imp)} = ${fmtBRL(g.spendComImposto)}`,
        period: decl.periodo,
        note: "O valor do card JÁ inclui o imposto. O gross-up é por dentro: o imposto incide sobre o bruto, então não é spend × 1,1215.",
      },
    };
  };

  const cardGoogle = (estado: InvestimentoDoGoogleNaRegua, decl: DeclaracaoDaJanela): CardDoResumo => {
    const v = valorDoGoogleNaRegua(estado);
    const base = { id: "investimento-google", rotulo: "Investimento (Google)", declaracao: decl, icone: "investimento" as const };
    // QA loop da 42.13 (TEST-001): o "—" diz a causa, pelo memorial já testado.
    const semNumero = memorialDoGoogleSemNumero(comoEstadoDoGoogle(estado), decl.periodo);
    if (semNumero) return { ...base, valor: "—", formula: semNumero };
    if (v == null) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtBRL(v),
      formula: {
        expression: "Σ spend diário das campanhas vinculadas",
        values: [{ label: "Investimento", value: fmtBRL(v), source: "Google Ads API · GET /daily por campanha vinculada" }],
        result: fmtBRL(v),
        period: decl.periodo,
        note: `${NOTA_DO_FUSO_DO_GOOGLE} Sem imposto de 12,15%: aquele tributo é da plataforma Meta.`,
      },
    };
  };

  // ── a receita do fluxo ──
  let receitaUsd: number | null = null;
  let causaDaReceita: MetricFormula | null = null;
  let fonteDaReceita = FONTE_DA_RECEITA;
  let notaDaReceita = "";
  if (apiAnterior) {
    receitaUsd = metrica(overview, "revenue_last_28_days", "revenue");
    causaDaReceita = erroDoOverview(declDoFluxo.periodo);
    fonteDaReceita = `${FONTE_DO_OVERVIEW} · revenue_last_28_days`;
    notaDaReceita = "A API ainda não tem a rota de receita por período (versão anterior à do painel — veja o aviso de versão no topo): este card, o ROAS e a Margem ficam nos 28 dias do overview até o deploy.";
  } else {
    causaDaReceita = memorialDoErroDaFonte(receitaDaJanela, {
      fonte: FONTE_DA_RECEITA,
      periodo: declDoFluxo.periodo,
      dependentes: "o ROAS e a Margem de Contribuição",
    });
    if (receitaDaJanela.tipo === "pronto") {
      receitaUsd = receitaDaJanela.dados.configured ? receitaDaJanela.dados.valorUsd : null;
      notaDaReceita = `O RevenueCat conta os dias em UTC e o intervalo é inclusivo: a janela enviada é ${intervaloDoFiltro} (dias de SP), então as pontas podem diferir em até 3 h; o dia de hoje ainda está em andamento. Menos reembolsos, como o RevenueCat define a receita.`;
    }
  }
  const receitaBrl = receitaUsd != null && cambio.taxa != null ? receitaUsd * cambio.taxa : null;

  const cardReceita: CardDoResumo = (() => {
    const base = { id: "receita", rotulo: "Receita (RevenueCat)", declaracao: declDoFluxo, icone: "receita" as const };
    if (causaDaReceita) return { ...base, valor: "—", formula: causaDaReceita };
    if (receitaUsd == null || !cambioValue) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtBRL(receitaBrl),
      formula: {
        expression: "Receita bruta (US$) × câmbio",
        values: [{ label: "Receita bruta", value: fmtUsd(receitaUsd), source: fonteDaReceita }, cambioValue],
        result: `${fmtUsd(receitaUsd)} × ${fmtBRL(cambio.taxa)} = ${fmtBRL(receitaBrl)}`,
        period: declDoFluxo.periodo,
        note: `Receita bruta: antes da comissão de loja, de impostos e de custos. ${notaDaReceita}`.trim(),
      },
    };
  })();

  // ── os insumos do ROAS e da Margem, na janela do fluxo ──
  const metaDoFluxo = apiAnterior ? gastoMeta(e.meta.vinteOito) : metaFiltro;
  const googleDoFluxoEstado = apiAnterior ? e.google.vinteOito : e.google.filtro;
  const googleDoFluxo = valorDoGoogleNaRegua(googleDoFluxoEstado);
  const investimentoDoFluxo = metaDoFluxo && googleDoFluxo != null ? metaDoFluxo.spendComImposto + googleDoFluxo : null;

  /** Por que o ROAS / a Margem não têm número. `[]` quando têm (ou quando só falta carregar). */
  const causasDoFluxo = (): MetricFormulaValue[] => {
    const c: MetricFormulaValue[] = [];
    if (causaDaReceita) c.push({ label: "Receita", value: String(causaDaReceita.values[0]?.value ?? "indisponível"), source: fonteDaReceita });
    const erroMeta = e.meta.temCampanhas ? (apiAnterior ? e.meta.erro28 : e.meta.erroFiltro) : null;
    if (erroMeta) c.push({ label: "Investimento (Meta)", value: erroMeta, source: "Meta Ads API" });
    const g = comoEstadoDoGoogle(googleDoFluxoEstado);
    if (g.tipo === "erro") c.push({ label: "Investimento (Google)", value: g.mensagem, source: "Google Ads API" });
    if (g.tipo === "sem_conta") c.push({ label: "Investimento (Google)", value: "nenhuma conta Google Ads conectada ao projeto", source: "Google Ads" });
    return c;
  };
  const notaDoFluxo = apiAnterior
    ? "Receita nos 28 dias do RevenueCat (em UTC) contra o investimento dos 28 dias de calendário de SP: a diferença de até 3 h nas pontas é da fonte."
    : `Receita e investimento na mesma janela (${intervaloDoFiltro}); o RevenueCat conta os dias em UTC e a Meta e o Google em dias de SP — diferença de até 3 h nas pontas.`;

  const roas = receitaBrl != null && investimentoDoFluxo != null && investimentoDoFluxo > 0 ? receitaBrl / investimentoDoFluxo : null;
  const cardRoas: CardDoResumo = (() => {
    const base = { id: "roas", rotulo: "ROAS", declaracao: declDoFluxo, icone: "roas" as const, realce: true };
    const causas = causasDoFluxo();
    if (causas.length) return { ...base, valor: "—", formula: memorialDeDependente(declDoFluxo, "Receita (R$) ÷ Investimento total (R$)", causas) };
    if (roas == null) return { ...base, valor: "—" };
    return {
      ...base,
      valor: fmtRoas(roas),
      formula: {
        expression: "Receita (R$) ÷ Investimento total (R$)",
        values: [
          { label: "Receita", value: fmtBRL(receitaBrl), source: "RevenueCat, convertida pelo câmbio" },
          { label: "Investimento total", value: fmtBRL(investimentoDoFluxo), source: googleDoFluxo ? "Meta (com imposto) + Google Ads" : "Meta Ads, com imposto de 12,15%" },
        ],
        result: `${fmtBRL(receitaBrl)} ÷ ${fmtBRL(investimentoDoFluxo)} = ${fmtRoas(roas)}`,
        period: declDoFluxo.periodo,
        note: `Receita bruta contra investimento. Não desconta comissão de loja, imposto nem custos — para isso, veja a Margem de Contribuição. ${notaDoFluxo}`,
      },
    };
  })();

  const { platformFeePct, taxPct, otherCostsPct } = e.percentuais;
  const margem =
    receitaBrl != null && metaDoFluxo && googleDoFluxo != null
      ? calcularMargemContribuicao({
          faturamentoBrutoBrl: receitaBrl,
          platformFeePct,
          taxPct,
          otherCostsPct,
          investimentoMetaLiquidoBrl: metaDoFluxo.spendLiquido,
          impostoMetaBrl: metaDoFluxo.imposto,
          investimentoGoogleBrl: googleDoFluxo,
        })
      : null;
  const cardMargem: CardDoResumo = (() => {
    const base = { id: "margem", rotulo: "Margem de Contribuição", declaracao: declDoFluxo, icone: "margem" as const, realce: true };
    const causas = causasDoFluxo();
    if (causas.length) return { ...base, valor: "—", formula: memorialDeDependente(declDoFluxo, "Faturamento líquido − investimento", causas) };
    if (!margem || !metaDoFluxo) return { ...base, valor: "—" };
    const [liq, imp] = fecharEmCentavos(metaDoFluxo.spendComImposto, [metaDoFluxo.spendLiquido, metaDoFluxo.imposto]);
    return {
      ...base,
      valor: fmtBRL(margem.margem),
      negativo: margem.margem < 0,
      formula: {
        expression: "(Bruto − plataforma − imposto − outros custos) − investimento − imposto Meta",
        values: [
          { label: "Faturamento bruto", value: fmtBRL(margem.faturamentoBruto), source: "RevenueCat, convertido pelo câmbio" },
          { label: `− Descontos da plataforma (${platformFeePct}%)`, value: fmtBRL(margem.descontosPlataforma), source: "comissão Apple/Google — configurável na etapa" },
          { label: `− Imposto (${taxPct}%)`, value: fmtBRL(margem.imposto), source: "imposto sobre a receita — configurável na etapa" },
          { label: `− Outros custos (${otherCostsPct}%)`, value: fmtBRL(margem.outrosCustos), source: "custos operacionais — configurável na etapa" },
          { label: "= Faturamento líquido", value: fmtBRL(margem.faturamentoLiquido), source: "bruto menos os três descontos acima" },
          { label: "− Investimento (Meta líquido)", value: fmtBRL(liq), source: "Meta Ads API, sem imposto" },
          { label: "− Imposto Meta (12,15%)", value: fmtBRL(imp), source: "gross-up por dentro, desde 01/01/2026" },
          ...(googleDoFluxo ? [{ label: "− Investimento (Google)", value: fmtBRL(googleDoFluxo), source: "Google Ads API — sem imposto da Meta" }] : []),
        ],
        result: `${fmtBRL(margem.faturamentoLiquido)} − ${fmtBRL(margem.investimentoTotal)} = ${fmtBRL(margem.margem)}`,
        period: declDoFluxo.periodo,
        note: `Os três percentuais incidem sobre o faturamento bruto (não em cascata) e são editáveis em Configurar. ${notaDoFluxo}`,
      },
    };
  })();

  // ── retratos e novos clientes, do overview ──
  const doOverview = (
    id: string,
    rotulo: string,
    icone: IconeDoCard,
    decl: DeclaracaoDaJanela,
    v: number | null,
    valor: string,
    corpo: () => Omit<MetricFormula, "period">,
  ): CardDoResumo => {
    const erro = erroDoOverview(decl.periodo);
    if (erro) return { id, rotulo, valor: "—", declaracao: decl, icone, formula: erro };
    return { id, rotulo, valor: v == null ? "—" : valor, declaracao: decl, icone, formula: v == null ? undefined : { ...corpo(), period: decl.periodo } };
  };
  const contagem = (label: string, m: string, nota: string, v: number | null) => () => ({
    expression: "Contagem",
    values: [{ label, value: fmtNum(v), source: `${FONTE_DO_OVERVIEW} · ${m}` }],
    result: fmtNum(v),
    note: nota,
  });

  const mrr = metrica(overview, "mrr");
  const mrrBrl = mrr != null && cambio.taxa != null ? mrr * cambio.taxa : null;
  const assinaturas = metrica(overview, "active_subscriptions");
  const trials = metrica(overview, "active_trials");

  const cards: CardDoResumo[] = [cardMeta(metaFiltro, filtro, e.meta.erroFiltro)];
  if (e.google.mostrar) cards.push(cardGoogle(e.google.filtro, filtro));
  cards.push(
    cardReceita,
    cardRoas,
    cardMargem,
    doOverview("mrr", "MRR", "mrr", agora, mrrBrl, fmtBRL(mrrBrl), () => ({
      expression: "MRR (US$) × câmbio",
      values: [{ label: "MRR", value: fmtUsd(mrr), source: `${FONTE_DO_OVERVIEW} · mrr` }, ...(cambioValue ? [cambioValue] : [])],
      result: `${fmtUsd(mrr)} × ${fmtBRL(cambio.taxa)} = ${fmtBRL(mrrBrl)}`,
      // PO-D6: a API marca o MRR com P28D; o painel segue a definição documentada (retrato).
      note: "Receita recorrente mensal no momento da consulta — não é média de período. Retrato, não acumulado: pela documentação do RevenueCat, o MRR é o valor atual das assinaturas pagas ativas, normalizado para um mês. A API marca este número com período de 28 dias (P28D), o que a documentação não explica; o painel segue a definição documentada.",
    })),
    doOverview("assinaturas", "Assinaturas ativas", "assinaturas", agora, assinaturas, fmtNum(assinaturas),
      contagem("Total", "active_subscriptions", "Assinaturas ativas agora — não é acumulado do período (o RevenueCat inclui as canceladas que ainda têm acesso).", assinaturas)),
    doOverview("trials", "Trials ativos", "trials", agora, trials, fmtNum(trials),
      contagem("Total", "active_trials", "Trials em andamento agora. Ainda não viraram receita.", trials)),
    { ...cardDeNovosClientes(e.novosClientes, e.overview, ctx), icone: "clientes" },
  );
  // Como na 42.2: o card do Google só existe com campanha vinculada; o resto aparece sempre.
  return cards;
}
