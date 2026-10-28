/**
 * Story 42.15 (AC10, D8 a D11, D14, D15, PO-D1) — o LTV sobre margem pela
 * versão por churn, a relação LTV/CAC e o CAC máximo (3:1), com as faixas de
 * interpretação e os alertas de distorção. Metodologia: a instrução "Cálculo de
 * LTV, CAC e relação LTV/CAC" colada pelo Danilo em 2026-10-27.
 *
 * ## As contas (todas mensais, regra 2 da instrução)
 *
 *   ARPU mensal ......... MRR (US$) ÷ assinaturas ativas × câmbio (RevenueCat, `agora`)
 *   Margem % ............ 100% − plataforma − imposto − outros custos (só os
 *                         percentuais da etapa: a mídia entra uma vez, no CAC, PO-02)
 *   Churn mensal ........ expirações PAGAS nos últimos 30 dias ÷ assinaturas
 *                         pagas ativas no primeiro desses dias (D9, D15)
 *   Tempo de vida ....... 1 ÷ churn, em meses
 *   LTV ................. (ARPU × margem %) ÷ churn, em R$
 *   LTV/CAC ............. LTV ÷ CAC consolidado do filtro (D11), uma casa e "x"
 *   CAC máximo .......... LTV ÷ 3
 *
 * ## Um período só (AC10k)
 *
 * Os três insumos do LTV entram com `periodo: "mensal"` no TIPO; o churn de uma
 * janela que não é a de 30 dias é recusado em execução, com "—" e a causa.
 *
 * ## O que este módulo nunca faz
 *
 * Estimar um insumo: o que falta vira "—", e o memorial diz QUAL faltou (AC10a).
 * Os textos não usam travessão entre palavras (AC10j); o "—" sozinho é o valor
 * ausente, convenção do painel.
 */

import type { MetricFormula, MetricFormulaValue } from "@/lib/types/metric-formula";
import { inicioDaJanela } from "@loyola-x/shared/src/janela-de-dias";
import { declararJanela, diaMes, type ContextoDaJanela } from "./janela-dos-cards-lyrio";
import type { EstadoDaFonte } from "./estado-da-fonte-revenuecat";
import { fmtUsd } from "./overview-revenuecat";
import { fmtBRL, type CardDoResumo, type EstadoDosPercentuais, type LinhaEmSegundoPlano } from "./resumo-mobile-lyrio";
import { ALERTA_DO_CAC_SO_MIDIA, type CacConsolidado } from "./aquisicao-lyrio";

/** D15 — o churn é mensal: os últimos 30 dias, fixos, na régua única do projeto. */
export const DIAS_DO_CHURN = 30;
/** PO-D1 — abaixo disto, o numerador do churn é pequeno demais (o limite é do @po). */
export const LIMITE_DA_BASE_PEQUENA = 10;
/** AC10h — o limite do "período curto" do CAC (proposta do @sm). */
export const LIMITE_DO_PERIODO_CURTO = 30;

/** Marca de tipo dos insumos do LTV: só o mês entra (AC10k). */
export interface InsumoMensal {
  periodo: "mensal";
}

/** ARPU: MRR e assinaturas ativas, retratos de agora (o MRR já normaliza os planos para o mês). */
export interface ArpuMensal extends InsumoMensal {
  mrrUsd: number;
  assinaturasAtivas: number;
}

/** A margem de contribuição em %, só dos três percentuais da etapa (PO-02). */
export interface MargemMensal extends InsumoMensal {
  platformFeePct: number;
  taxPct: number;
  otherCostsPct: number;
}

/** O churn: numerador do webhook, denominador do chart `actives`, a MESMA janela. */
export interface ChurnMensal extends InsumoMensal {
  /** Os dias da janela, como a API ecoou: só 30 vale. */
  dias: number;
  desde: string;
  ate: string;
  /** `EXPIRATION` com `period_type` pago (`churnPagante`); trial fica fora (PO-04). */
  expiracoesPagas: number;
  /** Assinaturas pagas ativas no dia `diaDoChart` (chart `actives`, dia de UTC). */
  assinaturasNoInicio: number;
  diaDoChart: string;
  /** Início da série de assinaturas (`serieDesde`), para a cobertura. */
  serieDesde: string | null;
}

export type EstadoDoInsumo<T> = { tipo: "carregando" } | { tipo: "indisponivel"; causa: string } | { tipo: "pronto"; dados: T };

export type ResultadoDoLtv =
  | { tipo: "indisponivel"; causa: string }
  | { tipo: "pronto"; arpuBrl: number; margemPct: number; churn: number; vidaMeses: number; ltvBrl: number };

/** O LTV por churn. Pura: o mesmo trio dá sempre o mesmo número, ou a causa do "—". */
export function calcularLtvPorChurn(arpu: ArpuMensal, margem: MargemMensal, churn: ChurnMensal, taxa: number | null): ResultadoDoLtv {
  if (churn.dias !== DIAS_DO_CHURN) {
    return { tipo: "indisponivel", causa: `o churn veio de uma janela de ${churn.dias} dias, não dos ${DIAS_DO_CHURN} dias fixos: misturaria períodos` };
  }
  if (taxa == null) return { tipo: "indisponivel", causa: "câmbio US$ → R$ indisponível" };
  if (arpu.assinaturasAtivas <= 0) return { tipo: "indisponivel", causa: "assinaturas ativas iguais a 0, sem receita média por cliente" };
  const margemPct = 100 - margem.platformFeePct - margem.taxPct - margem.otherCostsPct;
  if (margemPct <= 0) return { tipo: "indisponivel", causa: `margem de contribuição de ${fmtPct(margemPct)}, igual ou menor que 0%` };
  if (churn.assinaturasNoInicio <= 0) return { tipo: "indisponivel", causa: `nenhuma assinatura paga ativa em ${diaMes(churn.diaDoChart)}, o churn não tem denominador` };
  if (churn.expiracoesPagas <= 0) return { tipo: "indisponivel", causa: "nenhuma expiração paga no período, churn zero não permite calcular o LTV" };
  const arpuBrl = (arpu.mrrUsd / arpu.assinaturasAtivas) * taxa;
  const taxaDeChurn = churn.expiracoesPagas / churn.assinaturasNoInicio;
  return { tipo: "pronto", arpuBrl, margemPct, churn: taxaDeChurn, vidaMeses: 1 / taxaDeChurn, ltvBrl: (arpuBrl * (margemPct / 100)) / taxaDeChurn };
}

/**
 * AC10k — o arredondamento da relação para UMA casa, numa função só, que serve à
 * exibição e à faixa. Em décimos inteiros, com a correção do ponto flutuante
 * (`0.95.toFixed(1)` dá "0.9"): 2,96 vira 30 décimos, 5,04 vira 50.
 */
export function decimosDaRelacao(v: number): number {
  return Math.round(Number((v * 10).toPrecision(12)));
}

/** `2,8x`, em pt-BR, a partir dos décimos. */
export function fmtRelacao(decimos: number): string {
  return `${(decimos / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

export type FaixaDaRelacao = 1 | 2 | 3 | 4;

/** As quatro faixas (Passo 5, D14), sobre o valor EXIBIDO, em décimos. */
export const FAIXAS: Record<FaixaDaRelacao, { intervalo: string; texto: string }> = {
  1: { intervalo: "abaixo de 1,0x", texto: "O cliente vale menos do que custou. Não escalar." },
  2: { intervalo: "de 1,0x a 2,9x", texto: "Empata ou lucra pouco. Reduzir o CAC ou aumentar o LTV antes de escalar." },
  3: { intervalo: "de 3,0x a 5,0x", texto: "Saudável. Cobre a aquisição e deixa lucro." },
  4: { intervalo: "acima de 5,0x", texto: "Muito eficiente. Pode estar investindo pouco em aquisição." },
};

export function faixaDaRelacao(decimos: number): FaixaDaRelacao {
  if (decimos < 10) return 1;
  if (decimos <= 29) return 2;
  if (decimos <= 50) return 3;
  return 4;
}

export interface RelacaoLtvCac {
  razao: number;
  decimos: number;
  exibida: string;
  faixa: FaixaDaRelacao;
  cacMaximoBrl: number;
}

/** LTV/CAC e CAC máximo (3:1). `null` com CAC ou LTV sem número, ou CAC igual a 0. */
export function relacaoLtvCac(ltvBrl: number, cacBrl: number): RelacaoLtvCac | null {
  if (!(cacBrl > 0) || !Number.isFinite(ltvBrl)) return null;
  const razao = ltvBrl / cacBrl;
  const decimos = decimosDaRelacao(razao);
  return { razao, decimos, exibida: fmtRelacao(decimos), faixa: faixaDaRelacao(decimos), cacMaximoBrl: Math.round((ltvBrl / 3) * 100) / 100 };
}

/** Os alertas de distorção que se aplicam (Passo 6). O "só mídia" aparece sempre (D10). */
export function alertasDoLtvCac(a: {
  diasDoFiltro: number;
  inicioDoCac: string;
  inicioDoChurn: string | null;
  serieDesde: string | null;
  expiracoesPagas: number | null;
}): string[] {
  const out = [ALERTA_DO_CAC_SO_MIDIA];
  if (a.diasDoFiltro < LIMITE_DO_PERIODO_CURTO) out.push(`Período curto: a janela do CAC tem menos de ${LIMITE_DO_PERIODO_CURTO} dias.`);
  if (a.serieDesde) {
    const antes: string[] = [];
    if (a.inicioDoChurn && a.inicioDoChurn < a.serieDesde) antes.push("o período do churn");
    if (a.inicioDoCac < a.serieDesde) antes.push("a janela do CAC");
    if (antes.length) out.push(`Base incompleta: ${antes.join(" e ")} ${antes.length > 1 ? "começam" : "começa"} antes de ${diaMes(a.serieDesde)}, o início da série de assinaturas.`);
  }
  if (a.expiracoesPagas != null && a.expiracoesPagas < LIMITE_DA_BASE_PEQUENA) {
    out.push(`Base pequena: só ${a.expiracoesPagas.toLocaleString("pt-BR")} ${a.expiracoesPagas === 1 ? "expiração paga" : "expirações pagas"} no período. Uma a mais ou a menos muda muito o LTV.`);
  }
  return out;
}

function fmtPct(v: number, casas = 2): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const fmtMeses = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} meses`;

// ─────────────────────────── os insumos, a partir das consultas ───────────────────────────

/** O ARPU a partir do overview (`mrr` e `active_subscriptions`, `agora`). */
export function arpuDoOverview(overview: EstadoDaFonte<{ id: string; value: number }[]>): EstadoDoInsumo<ArpuMensal> {
  if (overview.tipo === "carregando") return { tipo: "carregando" };
  if (overview.tipo === "oculto") return { tipo: "indisponivel", causa: "a API não entregou o overview do RevenueCat" };
  if (overview.tipo === "erro") return { tipo: "indisponivel", causa: `overview do RevenueCat indisponível: ${overview.mensagem}` };
  const v = (id: string) => overview.dados.find((m) => m.id === id)?.value ?? null;
  const mrrUsd = v("mrr");
  const assinaturasAtivas = v("active_subscriptions");
  if (mrrUsd == null) return { tipo: "indisponivel", causa: "o overview do RevenueCat não trouxe o MRR" };
  if (assinaturasAtivas == null) return { tipo: "indisponivel", causa: "o overview do RevenueCat não trouxe as assinaturas ativas" };
  return { tipo: "pronto", dados: { periodo: "mensal", mrrUsd, assinaturasAtivas } };
}

/**
 * QA loop 1 (REL-001) — a margem só entra no LTV quando os percentuais da etapa
 * CARREGARAM (`percentuaisDaConfig`). Antes, a tela caía calada nos padrões
 * 15/5/1 com a configuração em erro (ou carregando) e o memorial dizia
 * "percentuais da etapa": o AC10a manda "—" com a causa.
 */
export function margemDosPercentuais(p: EstadoDosPercentuais): EstadoDoInsumo<MargemMensal> {
  if (p.tipo !== "pronto") return p;
  return { tipo: "pronto", dados: { periodo: "mensal", ...p.dados } };
}

/** O eco de `metricas-derivadas?days=30` que o churn usa. */
export interface DerivadasDoChurn {
  churnPagante: number;
  serieDesde: string | null;
  days?: number | null;
  desde?: string | null;
}
/** O eco de `ativas-no-inicio?days=30`. */
export interface AtivasDoChurn {
  configured: boolean;
  days: number;
  desde: string;
  ate: string;
  diaDoChart: string;
  valor: number | null;
}

const causaDaFonte = (e: EstadoDaFonte<unknown>, oQue: string): string | null =>
  e.tipo === "erro" ? `${oQue} indisponível: ${e.mensagem}` : e.tipo === "oculto" ? `${oQue}: a API ainda não tem a rota (versão anterior à do painel)` : null;

/**
 * O churn a partir das duas consultas. As duas tem de ecoar a MESMA janela: o
 * numerador de uma janela e o denominador de outra misturariam períodos.
 */
export function churnDasConsultas(derivadas: EstadoDaFonte<DerivadasDoChurn>, ativas: EstadoDaFonte<AtivasDoChurn>): EstadoDoInsumo<ChurnMensal> {
  const causa = causaDaFonte(derivadas, "as expirações pagas") ?? causaDaFonte(ativas, "as assinaturas ativas no início do período");
  if (causa) return { tipo: "indisponivel", causa };
  if (derivadas.tipo !== "pronto" || ativas.tipo !== "pronto") return { tipo: "carregando" };
  const d = derivadas.dados;
  const a = ativas.dados;
  if (!a.configured || a.valor == null) return { tipo: "indisponivel", causa: "nenhum app do RevenueCat selecionado na etapa" };
  if (d.days == null || d.desde == null) return { tipo: "indisponivel", causa: "as expirações pagas vieram da série inteira (API anterior), não dos 30 dias" };
  if (d.days !== a.days || d.desde !== a.desde) {
    return { tipo: "indisponivel", causa: `o numerador (${d.days} dias desde ${diaMes(d.desde)}) e o denominador (${a.days} dias desde ${diaMes(a.desde)}) não são da mesma janela` };
  }
  return {
    tipo: "pronto",
    dados: { periodo: "mensal", dias: d.days, desde: a.desde, ate: a.ate, expiracoesPagas: d.churnPagante, assinaturasNoInicio: a.valor, diaDoChart: a.diaDoChart, serieDesde: d.serieDesde },
  };
}

// ─────────────────────────── os dois cards ───────────────────────────

export interface EntradaDoLtvPorChurn {
  ctx: ContextoDaJanela;
  cambio: { taxa: number | null; fonte: string };
  arpu: EstadoDoInsumo<ArpuMensal>;
  /** QA loop 1 (REL-001): o estado da configuração da etapa, não um número pronto (`margemDosPercentuais`). */
  margem: EstadoDoInsumo<MargemMensal>;
  churn: EstadoDoInsumo<ChurnMensal>;
  /** O CAC consolidado do FILTRO (D11), o do card CAC. */
  cac: CacConsolidado;
}

const FONTE_DO_OVERVIEW = "RevenueCat · GET /metrics/overview";
const FONTE_DO_NUMERADOR = "eventos do webhook do RevenueCat · EXPIRATION pagos · GET …/revenuecat/metricas-derivadas?days=30";
const FONTE_DO_DENOMINADOR = "RevenueCat · GET /charts/actives (assinaturas pagas ativas) · GET …/revenuecat/ativas-no-inicio?days=30";
const FONTE_DA_MARGEM = "percentuais da etapa (Configurar): plataforma, imposto e outros custos";

/** O LTV (margem) e o LTV/CAC. Os dois aparecem sempre: sem um insumo, "—" e a causa. */
export function cardsDoLtvPorChurn(e: EntradaDoLtvPorChurn): { ltv: CardDoResumo; relacao: CardDoResumo } {
  const { ctx } = e;
  const declChurn = declararJanela({ tipo: "fixa", dias: DIAS_DO_CHURN, origem: "regua" }, ctx);
  const declCac = declararJanela({ tipo: "filtro" }, ctx);
  const inicioDoCac = inicioDaJanela(ctx.diasDoFiltro, ctx.hoje);
  const churn = e.churn.tipo === "pronto" ? e.churn.dados : null;
  const periodoDoLtv = churn
    ? `mensal: MRR e assinaturas de agora; churn de ${diaMes(churn.desde)} a ${diaMes(churn.ate)} (${DIAS_DO_CHURN} dias fixos, régua de SP)`
    : `mensal: MRR e assinaturas de agora; churn dos últimos ${DIAS_DO_CHURN} dias fixos`;
  const periodoDaRelacao = `LTV ${periodoDoLtv} · CAC: ${declCac.periodo}`;
  const periodoDoCardLtv = `${periodoDoLtv} · ${declChurn.frase}`;

  const baseLtv = { id: "ltv-margem", rotulo: "LTV (margem)", declaracao: declChurn, icone: "ltv" as const };
  const baseRelacao = { id: "ltv-cac", rotulo: "LTV/CAC", declaracao: declCac, icone: "relacao" as const, realce: true };
  const alertas = alertasDoLtvCac({
    diasDoFiltro: ctx.diasDoFiltro,
    inicioDoCac,
    inicioDoChurn: churn?.desde ?? null,
    serieDesde: churn?.serieDesde ?? ctx.serieDesde ?? null,
    expiracoesPagas: churn?.expiracoesPagas ?? null,
  });
  const valoresDosAlertas: MetricFormulaValue[] = alertas.map((a) => ({ label: "Alerta", value: a, source: "Passo 6 da instrução de LTV e CAC" }));
  const semNumero = (periodo: string, expressao: string, causas: string[], extra: MetricFormulaValue[] = []): MetricFormula => ({
    expression: expressao,
    values: [...causas.map((c) => ({ label: "Insumo que faltou", value: c, source: "AC10a: nenhum insumo é estimado" })), ...extra],
    result: "—",
    period: periodo,
    note: "Sem um dos insumos, a conta não fecha: o card fica “—”, nunca um número estimado.",
  });

  // ── LTV ──
  const causasDoLtv = [e.arpu, e.margem, e.churn].flatMap((x) => (x.tipo === "indisponivel" ? [x.causa] : []));
  const carregandoLtv = !causasDoLtv.length && (e.arpu.tipo === "carregando" || e.margem.tipo === "carregando" || e.churn.tipo === "carregando");
  const resultado: ResultadoDoLtv | null =
    !causasDoLtv.length && e.arpu.tipo === "pronto" && e.margem.tipo === "pronto" && e.churn.tipo === "pronto"
      ? calcularLtvPorChurn(e.arpu.dados, e.margem.dados, e.churn.dados, e.cambio.taxa)
      : null;

  let cardLtv: CardDoResumo;
  if (causasDoLtv.length) cardLtv = { ...baseLtv, valor: "—", formula: semNumero(periodoDoCardLtv, "(ARPU mensal × margem %) ÷ churn mensal", causasDoLtv) };
  else if (carregandoLtv || !resultado) cardLtv = { ...baseLtv, valor: "—", carregando: true };
  else if (resultado.tipo === "indisponivel") cardLtv = { ...baseLtv, valor: "—", formula: semNumero(periodoDoCardLtv, "(ARPU mensal × margem %) ÷ churn mensal", [resultado.causa]) };
  else {
    const a = (e.arpu as { dados: ArpuMensal }).dados;
    const c = churn!;
    const m = (e.margem as { dados: MargemMensal }).dados;
    cardLtv = {
      ...baseLtv,
      valor: fmtBRL(resultado.ltvBrl),
      formula: {
        expression: "(ARPU mensal × margem %) ÷ churn mensal",
        values: [
          { label: "MRR", value: fmtUsd(a.mrrUsd), source: `${FONTE_DO_OVERVIEW} · mrr (agora; já normaliza os planos para o mês)` },
          { label: "Assinaturas ativas", value: fmtNum(a.assinaturasAtivas), source: `${FONTE_DO_OVERVIEW} · active_subscriptions (agora)` },
          { label: "Câmbio US$ 1 →", value: fmtBRL(e.cambio.taxa), source: e.cambio.fonte },
          { label: "ARPU mensal", value: `${fmtUsd(a.mrrUsd)} ÷ ${fmtNum(a.assinaturasAtivas)} × ${fmtBRL(e.cambio.taxa)} = ${fmtBRL(resultado.arpuBrl)}`, source: "receita média por cliente, por mês" },
          { label: "Margem de contribuição", value: `100% − ${fmtPct(m.platformFeePct)} − ${fmtPct(m.taxPct)} − ${fmtPct(m.otherCostsPct)} = ${fmtPct(resultado.margemPct)}`, source: FONTE_DA_MARGEM },
          { label: "Expirações pagas", value: fmtNum(c.expiracoesPagas), source: FONTE_DO_NUMERADOR },
          { label: `Assinaturas pagas ativas em ${diaMes(c.diaDoChart)}`, value: fmtNum(c.assinaturasNoInicio), source: FONTE_DO_DENOMINADOR },
          { label: "Churn mensal", value: `${fmtNum(c.expiracoesPagas)} ÷ ${fmtNum(c.assinaturasNoInicio)} = ${fmtPct(resultado.churn * 100)}`, source: "expirações pagas ÷ assinaturas pagas ativas no início do período" },
          { label: "Tempo de vida", value: `1 ÷ ${fmtPct(resultado.churn * 100)} = ${fmtMeses(resultado.vidaMeses)}`, source: "1 ÷ churn mensal" },
        ],
        result: `(${fmtBRL(resultado.arpuBrl)} × ${fmtPct(resultado.margemPct)}) ÷ ${fmtPct(resultado.churn * 100)} = ${fmtBRL(resultado.ltvBrl)}`,
        period: periodoDoCardLtv,
        note: `LTV sobre a margem, pela versão por churn (o churn é medido, não estimado). A margem usa só os três percentuais da etapa: a mídia entra uma vez, no CAC. O churn conta só a expiração de assinatura paga; a expiração de trial é abandono, não churn. O chart do RevenueCat conta o dia ${diaMes(c.diaDoChart)} em UTC, e a janela é de dias de SP: as pontas podem diferir em até 3 h. Diferente dos cards LTV bruto, que dividem a receita bruta do plano pelas pessoas.`,
      },
    };
  }

  // ── LTV/CAC e CAC máximo ──
  const ltvBrl = resultado?.tipo === "pronto" ? resultado.ltvBrl : null;
  const cac = e.cac;
  const causaDoCac =
    cac.tipo === "indisponivel"
      ? `CAC desconhecido: ${cac.causa}`
      : cac.tipo === "oculto"
        ? "CAC desconhecido: a API ainda não tem a rota de novos pagantes"
        : cac.tipo === "pronto" && (cac.centavos == null || cac.centavos <= 0)
          ? cac.centavos == null
            ? "CAC desconhecido: nenhum novo pagante na janela do filtro"
            : "CAC igual a 0, sem investimento em mídia na janela do filtro"
          : null;
  const causasDaRelacao = [
    ...(cardLtv.valor === "—" && !cardLtv.carregando ? [`LTV sem número: ${causasDoLtv[0] ?? (resultado?.tipo === "indisponivel" ? resultado.causa : "insumo ausente")}`] : []),
    ...(causaDoCac ? [causaDoCac] : []),
  ];
  const cacBrl = cac.tipo === "pronto" && cac.centavos != null ? cac.centavos / 100 : null;
  const rel = ltvBrl != null && cacBrl != null ? relacaoLtvCac(ltvBrl, cacBrl) : null;

  const linhasVazias: LinhaEmSegundoPlano[] = [{ id: "cac-maximo", rotulo: "CAC máximo (3:1)", valor: "—" }];
  let cardRelacao: CardDoResumo;
  if (causasDaRelacao.length) {
    cardRelacao = { ...baseRelacao, valor: "—", secundarias: linhasVazias, alerta: true, formula: semNumero(periodoDaRelacao, "LTV ÷ CAC consolidado do filtro", causasDaRelacao, valoresDosAlertas) };
  } else if (!rel) {
    cardRelacao = { ...baseRelacao, valor: "—", secundarias: linhasVazias, carregando: true };
  } else {
    const faixa = FAIXAS[rel.faixa];
    const secundarias: LinhaEmSegundoPlano[] = [
      { id: "cac-maximo", rotulo: "CAC máximo (3:1):", valor: `pode pagar até ${fmtBRL(rel.cacMaximoBrl)} por cliente novo mantendo 3:1` },
      { id: "faixa", rotulo: `${faixa.intervalo}:`, valor: faixa.texto },
    ];
    cardRelacao = {
      ...baseRelacao,
      valor: rel.exibida,
      secundarias,
      alerta: alertas.length > 0,
      formula: {
        expression: "LTV ÷ CAC consolidado do filtro; CAC máximo = LTV ÷ 3",
        values: [
          { label: "LTV (margem)", value: fmtBRL(ltvBrl), source: `o card LTV (margem), ${periodoDoLtv}` },
          { label: "CAC consolidado", value: fmtBRL(cacBrl), source: `o card CAC: investimento total ÷ todos os novos pagantes, ${declCac.periodo}` },
          { label: "LTV/CAC", value: `${fmtBRL(ltvBrl)} ÷ ${fmtBRL(cacBrl)} = ${rel.razao.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} → ${rel.exibida}`, source: "uma casa decimal, arredondada uma vez" },
          { label: "CAC máximo (3:1)", value: `${fmtBRL(ltvBrl)} ÷ 3 = ${fmtBRL(rel.cacMaximoBrl)}: pode pagar até ${fmtBRL(rel.cacMaximoBrl)} por cliente novo mantendo 3:1`, source: "LTV ÷ 3" },
          { label: "Faixa", value: `${faixa.intervalo}: ${faixa.texto}`, source: "Passo 5 da instrução, sobre o valor exibido" },
          ...valoresDosAlertas,
        ],
        result: `${fmtBRL(ltvBrl)} ÷ ${fmtBRL(cacBrl)} = ${rel.exibida}`,
        period: periodoDaRelacao,
        note: `As duas janelas são diferentes, e cada uma está declarada: o LTV é mensal por construção; o CAC é por cliente novo na janela do filtro de ${ctx.diasDoFiltro.toLocaleString("pt-BR")} dias, então a relação muda quando o filtro muda. O LTV/CAC real é menor que o exibido, porque o CAC só tem a mídia.`,
      },
    };
  }
  return { ltv: cardLtv, relacao: cardRelacao };
}
