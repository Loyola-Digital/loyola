/**
 * Story 41.6 — decomposição de ROAS, deltas e cenários hipotéticos (§5, §7.3).
 *
 * A identidade que torna isso possível sem modelo estatístico:
 *
 *     ROAS_pago = (1000 / CPM) × CTR × conversão_clique_venda × ticket_pago
 *
 * É **exata** — é o mesmo invariante A9 da 41.3. Duas consequências:
 *
 * 1. **Decomposição multiplicativa.** O peso de cada fator sai de
 *    `ln(fator) / Σ ln(fatores)`, e o produto dos 4 ratios reconstrói o ROAS do
 *    lançamento B a partir do A. Verificável: `roas_a × Π(fatores) == roas_b`.
 * 2. **Simulação sem chute.** Trocar CPM e CTR entre os dois lançamentos,
 *    mantendo investimento, conversão, ticket e faturamento orgânico, produz um
 *    cenário aritmeticamente correto — não uma projeção.
 *
 * ⚠️ **Peso negativo significa que o fator AJUDOU.** O sinal é direção relativa
 * ao movimento total, não magnitude. Confundir isso é literalmente o bug do §6,
 * em que o relatório escreveu "a conversão piorou" para uma conversão que tinha
 * melhorado 13,8%. Por isso `direcao` é **campo calculado**, não derivação de
 * template: um único lugar decide.
 *
 * Funções puras.
 */

import type { LaunchReportMetrics } from "./launch-report-engine.js";

// ---------------------------------------------------------------------------
// Metadados por métrica — dirigem cor, seta e formatação (§AC5)
// ---------------------------------------------------------------------------

export type FormatoMetrica = "moeda" | "pct" | "inteiro" | "numero";

export interface MetaMetrica {
  chave: string;
  label: string;
  formato: FormatoMetrica;
  /** `true` em métrica de custo — CPV menor em B é **verde**. */
  menorEhMelhor: boolean;
  secao: string;
}

/**
 * Tabela única de metadados. Cor, seta e formatação saem daqui — nunca de
 * condicional espalhada pelo template. É o que mata a AC5 e metade da AC6 de
 * uma vez.
 */
export const METRICAS: MetaMetrica[] = [
  // Escala
  { chave: "investimento", label: "Investimento", formato: "moeda", menorEhMelhor: false, secao: "Escala" },
  { chave: "investimentoQuente", label: "Investimento quente", formato: "moeda", menorEhMelhor: false, secao: "Escala" },
  { chave: "investimentoFrio", label: "Investimento frio", formato: "moeda", menorEhMelhor: false, secao: "Escala" },
  { chave: "impressoes", label: "Impressões", formato: "inteiro", menorEhMelhor: false, secao: "Escala" },
  { chave: "cliques", label: "Cliques", formato: "inteiro", menorEhMelhor: false, secao: "Escala" },
  // Eficiência de mídia
  { chave: "ctr", label: "CTR", formato: "pct", menorEhMelhor: false, secao: "Eficiência de mídia" },
  { chave: "cpc", label: "CPC", formato: "moeda", menorEhMelhor: true, secao: "Eficiência de mídia" },
  { chave: "cpm", label: "CPM", formato: "moeda", menorEhMelhor: true, secao: "Eficiência de mídia" },
  // Volume de vendas
  { chave: "ingressosUnicos", label: "Ingressos únicos", formato: "inteiro", menorEhMelhor: false, secao: "Volume de vendas" },
  { chave: "ingressosPagos", label: "Ingressos pagos", formato: "inteiro", menorEhMelhor: false, secao: "Volume de vendas" },
  { chave: "vendasTotais", label: "Vendas totais", formato: "inteiro", menorEhMelhor: false, secao: "Volume de vendas" },
  { chave: "conversaoCliqueVenda", label: "Conversão clique→venda", formato: "pct", menorEhMelhor: false, secao: "Volume de vendas" },
  // Faturamento
  { chave: "faturamentoTotal", label: "Faturamento total", formato: "moeda", menorEhMelhor: false, secao: "Faturamento" },
  { chave: "faturamentoPago", label: "Faturamento pago", formato: "moeda", menorEhMelhor: false, secao: "Faturamento" },
  { chave: "faturamentoOrganico", label: "Faturamento orgânico", formato: "moeda", menorEhMelhor: false, secao: "Faturamento" },
  { chave: "faturamentoOrderBump", label: "Faturamento order bump", formato: "moeda", menorEhMelhor: false, secao: "Faturamento" },
  // Custo de aquisição
  { chave: "cpvGeral", label: "CPV geral", formato: "moeda", menorEhMelhor: true, secao: "Custo de aquisição" },
  { chave: "cpvPago", label: "CPV pago", formato: "moeda", menorEhMelhor: true, secao: "Custo de aquisição" },
  // Retorno
  { chave: "roasPago", label: "ROAS pago", formato: "numero", menorEhMelhor: false, secao: "Retorno" },
  { chave: "roasTotal", label: "ROAS total", formato: "numero", menorEhMelhor: false, secao: "Retorno" },
  { chave: "ticketPago", label: "Ticket pago", formato: "moeda", menorEhMelhor: false, secao: "Retorno" },
  { chave: "ticketTotal", label: "Ticket total", formato: "moeda", menorEhMelhor: false, secao: "Retorno" },
  // Mix de público
  { chave: "pctInvestQuente", label: "% investimento quente", formato: "pct", menorEhMelhor: false, secao: "Mix de público" },
  { chave: "ingressosPagoQuente", label: "Ingressos pagos quentes", formato: "inteiro", menorEhMelhor: false, secao: "Mix de público" },
  { chave: "ingressosPagoFrio", label: "Ingressos pagos frios", formato: "inteiro", menorEhMelhor: false, secao: "Mix de público" },
  // Qualificação
  { chave: "taxaResposta", label: "Taxa de resposta da pesquisa", formato: "pct", menorEhMelhor: false, secao: "Qualificação" },
  // Order bump
  { chave: "attachRateGeral", label: "Attach rate geral", formato: "pct", menorEhMelhor: false, secao: "Order bump" },
  { chave: "attachRatePago", label: "Attach rate pago", formato: "pct", menorEhMelhor: false, secao: "Order bump" },
  { chave: "pctFatOb", label: "% do faturamento em order bump", formato: "pct", menorEhMelhor: false, secao: "Order bump" },
  { chave: "ticketOb", label: "Ticket do order bump", formato: "moeda", menorEhMelhor: false, secao: "Order bump" },
];

/** Extrai o valor de uma métrica do objeto do motor. */
export function valorDaMetrica(m: LaunchReportMetrics, chave: string): number {
  switch (chave) {
    case "investimento": return m.investimento.comImposto;
    case "investimentoQuente": return m.investimento.quente;
    case "investimentoFrio": return m.investimento.frio;
    case "impressoes": return m.midia.impressoes;
    case "cliques": return m.midia.cliques;
    case "ctr": return m.midia.ctr.valor;
    case "cpc": return m.midia.cpc.valor;
    case "cpm": return m.midia.cpm.valor;
    case "ingressosUnicos": return m.ingressos.unicos;
    case "ingressosPagos": return m.ingressos.pagos;
    case "vendasTotais": return m.ingressos.totais;
    case "conversaoCliqueVenda": return m.conversao.cliqueVenda.valor;
    case "faturamentoTotal": return m.faturamento.total;
    case "faturamentoPago": return m.faturamento.pago;
    case "faturamentoOrganico": return m.faturamento.organico;
    case "faturamentoOrderBump": return m.faturamento.orderBump;
    case "cpvGeral": return m.cpv.geral.valor;
    case "cpvPago": return m.cpv.pago.valor;
    case "roasPago": return m.roas.pago.valor;
    case "roasTotal": return m.roas.total.valor;
    case "ticketPago": return m.ticket.pago.valor;
    case "ticketTotal": return m.ticket.total.valor;
    case "pctInvestQuente": return m.investimento.pctQuente;
    case "ingressosPagoQuente": return m.ingressos.pagoQuente;
    case "ingressosPagoFrio": return m.ingressos.pagoFrio;
    case "taxaResposta": return m.pesquisa.taxaResposta.valor;
    case "attachRateGeral": return m.orderBump.attachRateGeral.valor;
    case "attachRatePago": return m.orderBump.attachRatePago.valor;
    case "pctFatOb": return m.orderBump.pctFatObGeral.valor;
    case "ticketOb": return m.orderBump.ticketOb.valor;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------

export interface DeltaMetrica extends MetaMetrica {
  a: number;
  b: number;
  /** Variação percentual de A para B. `null` quando a base é zero. */
  deltaPct: number | null;
  /** `melhorou` | `piorou` | `estável` — já considerando `menorEhMelhor`. */
  avaliacao: "melhorou" | "piorou" | "estável";
}

export function calcularDeltas(
  a: LaunchReportMetrics,
  b: LaunchReportMetrics,
): DeltaMetrica[] {
  return METRICAS.map((meta) => {
    const va = valorDaMetrica(a, meta.chave);
    const vb = valorDaMetrica(b, meta.chave);
    const deltaPct = va === 0 ? null : (vb / va - 1) * 100;
    let avaliacao: DeltaMetrica["avaliacao"];
    if (va === vb) avaliacao = "estável";
    else {
      const aumentou = vb > va;
      avaliacao = (meta.menorEhMelhor ? !aumentou : aumentou) ? "melhorou" : "piorou";
    }
    return { ...meta, a: va, b: vb, deltaPct, avaliacao };
  });
}

// ---------------------------------------------------------------------------
// Decomposição (§7.3)
// ---------------------------------------------------------------------------

export type DirecaoFator = "puxou pra baixo" | "ajudou" | "neutro";

export interface FatorDecomposicao {
  chave: "cpm" | "ctr" | "conversao" | "ticket";
  label: string;
  ratio: number;
  /** `(ratio − 1) × 100`. */
  efeito: number;
  /** `ln(ratio) / Σ ln(ratios) × 100`. Negativo = o fator **ajudou**. */
  peso: number;
  /** Campo, não derivação de template — um único lugar decide. */
  direcao: DirecaoFator;
}

export interface Decomposicao {
  fatores: FatorDecomposicao[];
  /** Π dos 4 ratios. */
  produto: number;
  roasA: number;
  roasB: number;
  /** `roas_a × Π(fatores)` — deve bater com `roasB`. */
  roasReconstruido: number;
  /** `false` quando a identidade não fecha ou algum ratio é ≤ 0. */
  valida: boolean;
  /** Preenchido quando `valida` é `false` — vira o aviso no lugar da seção. */
  motivoInvalida: string | null;
}

/** Tolerância da assertiva `roas_a × Π == roas_b` (§AC2). */
export const TOLERANCIA_DECOMPOSICAO = 0.001;

/**
 * Decompõe a variação do ROAS pago entre dois lançamentos.
 *
 * ⚠️ **O fator de CPM é invertido** (`cpm_a / cpm_b`), ao contrário dos outros
 * três. CPM maior é pior, então a razão precisa girar para que "ratio > 1"
 * signifique "ajudou" em todos os quatro. Errar isso inverte o sinal do peso e
 * a direção — exatamente o bug do §6.
 */
export function decompor(a: LaunchReportMetrics, b: LaunchReportMetrics): Decomposicao {
  const cpmA = a.midia.cpm.valor;
  const cpmB = b.midia.cpm.valor;
  const ctrA = a.midia.ctr.valor;
  const ctrB = b.midia.ctr.valor;
  const convA = a.conversao.cliqueVenda.valor;
  const convB = b.conversao.cliqueVenda.valor;
  const tickA = a.ticket.pago.valor;
  const tickB = b.ticket.pago.valor;
  const roasA = a.roas.pago.valor;
  const roasB = b.roas.pago.valor;

  const base: [FatorDecomposicao["chave"], string, number][] = [
    // CPM invertido — ver o aviso do JSDoc.
    ["cpm", "CPM", cpmB === 0 ? 0 : cpmA / cpmB],
    ["ctr", "CTR", ctrA === 0 ? 0 : ctrB / ctrA],
    ["conversao", "Conversão", convA === 0 ? 0 : convB / convA],
    ["ticket", "Ticket pago", tickA === 0 ? 0 : tickB / tickA],
  ];

  const invalido = base.find(([, , r]) => !(r > 0));
  if (invalido || roasA <= 0) {
    return {
      fatores: [],
      produto: 0,
      roasA,
      roasB,
      roasReconstruido: 0,
      valida: false,
      motivoInvalida: invalido
        ? `o fator ${invalido[1]} ficou em zero ou negativo — o logaritmo não é definido, ` +
          `então a decomposição não pode ser calculada`
        : "o ROAS pago do lançamento A é zero — não há base para decompor",
    };
  }

  const somaLn = base.reduce((s, [, , r]) => s + Math.log(r), 0);
  const produto = base.reduce((p, [, , r]) => p * r, 1);
  const roasReconstruido = roasA * produto;

  const fatores: FatorDecomposicao[] = base.map(([chave, label, ratio]) => ({
    chave,
    label,
    ratio,
    efeito: (ratio - 1) * 100,
    // Σ ln = 0 significa que os fatores se cancelaram exatamente; sem
    // denominador não há peso relativo — 0 é mais honesto que dividir por zero.
    peso: somaLn === 0 ? 0 : (Math.log(ratio) / somaLn) * 100,
    direcao: ratio < 1 ? "puxou pra baixo" : ratio > 1 ? "ajudou" : "neutro",
  }));

  const fecha = Math.abs(roasReconstruido - roasB) < TOLERANCIA_DECOMPOSICAO;

  return {
    fatores,
    produto,
    roasA,
    roasB,
    roasReconstruido,
    valida: fecha,
    motivoInvalida: fecha
      ? null
      : `a identidade não fecha: ROAS A (${roasA.toFixed(4)}) × produto dos fatores ` +
        `(${produto.toFixed(4)}) = ${roasReconstruido.toFixed(4)}, mas o ROAS pago de B é ` +
        `${roasB.toFixed(4)} — a decomposição seria inválida por construção`,
  };
}

// ---------------------------------------------------------------------------
// Cenários hipotéticos (§7.3)
// ---------------------------------------------------------------------------

export interface Cenario {
  /** Descrição derivada do dado, nunca literal. */
  titulo: string;
  impressoes: number;
  cliques: number;
  vendas: number;
  cpv: number;
  faturamentoPago: number;
  faturamentoTotal: number;
  roasPago: number;
  roasTotal: number;
}

/**
 * Simula um lançamento com **outro CPM e outro CTR**, mantendo investimento,
 * conversão, ticket e faturamento orgânico da base.
 *
 * Não é projeção: dado o mesmo investimento, um CPM diferente compra um número
 * diferente de impressões, e o resto cai por aritmética.
 */
export function simular(
  base: LaunchReportMetrics,
  cpmNovo: number,
  ctrNovo: number,
  titulo: string,
): Cenario {
  const inv = base.investimento.comImposto;
  const conv = base.conversao.cliqueVenda.valor / 100;
  const ticket = base.ticket.pago.valor;
  const organico = base.faturamento.organico;

  const impressoes = cpmNovo === 0 ? 0 : (inv / cpmNovo) * 1000;
  const cliques = impressoes * (ctrNovo / 100);
  const vendas = cliques * conv;
  const faturamentoPago = vendas * ticket;
  const faturamentoTotal = faturamentoPago + organico;

  return {
    titulo,
    impressoes,
    cliques,
    vendas,
    cpv: vendas === 0 ? 0 : inv / vendas,
    faturamentoPago,
    faturamentoTotal,
    roasPago: inv === 0 ? 0 : faturamentoPago / inv,
    roasTotal: inv === 0 ? 0 : faturamentoTotal / inv,
  };
}

export interface Recuperacoes {
  /** `roas_b × (ticket_a / ticket_b)`. */
  seIgualarTicket: number;
  /** `roas_b × (ticket_a / ticket_b) × (cpm_b / cpm_a)`. */
  seIgualarAmbos: number;
}

/**
 * Duas simulações de recuperação do §7.3: quanto o ROAS de B voltaria se ele
 * tivesse o ticket de A, e se tivesse ticket **e** CPM de A.
 */
export function recuperacoes(
  a: LaunchReportMetrics,
  b: LaunchReportMetrics,
): Recuperacoes {
  const tickA = a.ticket.pago.valor;
  const tickB = b.ticket.pago.valor;
  const cpmA = a.midia.cpm.valor;
  const cpmB = b.midia.cpm.valor;
  const roasB = b.roas.pago.valor;

  const fatorTicket = tickB === 0 ? 1 : tickA / tickB;
  const fatorCpm = cpmA === 0 ? 1 : cpmB / cpmA;
  return {
    seIgualarTicket: roasB * fatorTicket,
    seIgualarAmbos: roasB * fatorTicket * fatorCpm,
  };
}

// ---------------------------------------------------------------------------
// Resultado completo
// ---------------------------------------------------------------------------

export interface ComparativoResultado {
  deltas: DeltaMetrica[];
  decomposicao: Decomposicao;
  cenarios: Cenario[];
  recuperacoes: Recuperacoes;
}

export function compararLancamentos(
  a: LaunchReportMetrics,
  b: LaunchReportMetrics,
): ComparativoResultado {
  return {
    deltas: calcularDeltas(a, b),
    decomposicao: decompor(a, b),
    cenarios: [
      // Cada cenário empresta o CPM e o CTR do OUTRO lançamento.
      simular(a, b.midia.cpm.valor, b.midia.ctr.valor, "Lançamento A com o CPM e o CTR de B"),
      simular(b, a.midia.cpm.valor, a.midia.ctr.valor, "Lançamento B com o CPM e o CTR de A"),
    ],
    recuperacoes: recuperacoes(a, b),
  };
}
