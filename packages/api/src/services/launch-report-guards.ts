/**
 * Story 41.3 — guardas de qualidade do Resumão (§8).
 *
 * A spec é explícita: *"Falha = erro explícito, nunca renderizar número errado
 * em silêncio."* Este módulo é o que separa o gerador de uma planilha bonita.
 *
 * Três camadas:
 * 1. **9 invariantes (§8.1)** — verdades matemáticas. Quebrou = bug. **Bloqueiam**
 *    a geração com HTTP 422 informando o código e a ação sugerida.
 * 2. **8 alertas (§8.2)** — sinal de dado suspeito. **Nunca bloqueiam**; viram
 *    banner no topo do HTML e linha no memorial.
 * 3. **Conferência externa (§8.3)** — comparação com o investimento oficial do
 *    painel, com dois limiares.
 *
 * Funções **puras**, sem I/O: recebem o objeto da 41.2 e devolvem o resultado.
 * É o que torna os testes baratos.
 *
 * ⚠️ Comparação de ponto flutuante é sempre `Math.abs(a − b) <= tol`, nunca
 * `toFixed(2) === toFixed(2)` — arredondar antes de comparar mascara diferença
 * real de centavos acumulada.
 */

import type { LaunchReportMetrics } from "./launch-report-engine.js";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type CodigoInvariante = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9";
export type CodigoAlerta = "W1" | "W2" | "W3" | "W4" | "W5" | "W6" | "W7" | "W8";
export type StatusInvariante = "passed" | "failed" | "skipped";

export interface ResultadoInvariante {
  codigo: CodigoInvariante;
  status: StatusInvariante;
  /** Os dois lados da conta com os valores reais. Erro sem número é inútil. */
  detalhe: string;
  /** O que fazer. Específica por invariante — nunca "verifique os dados". */
  acao: string;
}

export interface Alerta {
  codigo: CodigoAlerta;
  mensagem: string;
}

export interface ConferenciaExterna {
  status: "passed" | "failed" | "alerta" | "skipped";
  investimentoCalculado: number;
  investimentoOficial: number | null;
  /** Delta relativo (fração, não %). `null` quando pulada. */
  delta: number | null;
  detalhe: string;
}

export interface LaunchReportGuardResult {
  invariantes: ResultadoInvariante[];
  alertas: Alerta[];
  conferencia: ConferenciaExterna;
  /** `true` quando algum invariante falhou **ou** a conferência externa bloqueou. */
  bloqueado: boolean;
  /** Invariantes `failed`, na ordem A1→A9. */
  violacoes: ResultadoInvariante[];
}

export interface ValidateOptions {
  /**
   * Total oficial de investimento do painel (§8.3). Ausente = checagem pulada e
   * reportada como tal — **nunca** derivar um "oficial" de outra query.
   */
  investimentoOficial?: number | null;
  /**
   * `true` quando algum lote de consulta à Meta voltou exatamente no `limit`
   * (provável truncagem silenciosa). Insumo do W8.
   */
  loteNoLimite?: boolean;
}

/** Erro pronto para virar 422, no formato do §9.1. */
export class InvarianteVioladoError extends Error {
  readonly erro = "INVARIANTE_VIOLADO";
  constructor(
    readonly codigo: CodigoInvariante,
    readonly detalhe: string,
    readonly acao: string,
    readonly violacoes: ResultadoInvariante[],
  ) {
    super(detalhe);
    this.name = "InvarianteVioladoError";
  }
  toResponse() {
    return {
      erro: this.erro,
      codigo: this.codigo,
      detalhe: this.detalhe,
      acao: this.acao,
      violacoes: this.violacoes,
    };
  }
}

/** Erro da conferência externa (§8.3) — distinto de invariante. */
export class ConferenciaExternaError extends Error {
  readonly erro = "CONFERENCIA_EXTERNA";
  constructor(
    readonly detalhe: string,
    readonly acao: string,
    readonly conferencia: ConferenciaExterna,
  ) {
    super(detalhe);
    this.name = "ConferenciaExternaError";
  }
  toResponse() {
    return {
      erro: this.erro,
      detalhe: this.detalhe,
      acao: this.acao,
      conferencia: this.conferencia,
    };
  }
}

// ---------------------------------------------------------------------------
// Tolerâncias — exatamente as da §8.1. Não afrouxar.
// ---------------------------------------------------------------------------

export const TOLERANCIAS = {
  A1: 0.01,
  A3: 0.01,
  A4: 0.01,
  A6: 1.0,
  A9: 0.001,
} as const;

/** Limiares da conferência externa (§8.3). */
export const LIMIAR_CONFERENCIA = { bloqueio: 0.005, alerta: 0.0005 } as const;

/** Limiares dos alertas (§8.2). */
export const LIMIARES_ALERTA = {
  /** W3: spend abaixo disso com impressões acima do outro limiar = corrompido. */
  spendSuspeito: 20,
  impressoesSuspeitas: 1000,
  /** W4: mais valores distintos de preço que isso = coluna contaminada. */
  precosDistintos: 15,
  /** W5: taxa de resposta da pesquisa abaixo disso. */
  taxaResposta: 75,
  /** W6: % de vendas pagas sem ad_name acima disso. */
  vendasSemAdName: 20,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dentro = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

const brl = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v: number, casas = 4): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const int = (v: number): string => Math.round(v).toLocaleString("pt-BR");

function ok(codigo: CodigoInvariante, detalhe: string): ResultadoInvariante {
  return { codigo, status: "passed", detalhe, acao: "" };
}

function falhou(codigo: CodigoInvariante, detalhe: string, acao: string): ResultadoInvariante {
  return { codigo, status: "failed", detalhe, acao };
}

function pulado(codigo: CodigoInvariante, detalhe: string): ResultadoInvariante {
  return { codigo, status: "skipped", detalhe, acao: "" };
}

// ---------------------------------------------------------------------------
// validateLaunchReport
// ---------------------------------------------------------------------------

export function validateLaunchReport(
  m: LaunchReportMetrics,
  opts: ValidateOptions = {},
): LaunchReportGuardResult {
  const invariantes: ResultadoInvariante[] = [
    checarA1(m),
    checarA2(m),
    checarA3(m),
    checarA4(m),
    checarA5(m),
    checarA6(m),
    checarA7(m),
    checarA8(m),
    checarA9(m),
  ];

  const alertas = coletarAlertas(m, opts);
  // A conferência externa não tem código W na §8.2 — ela é reportada pelo campo
  // `conferencia`, que o memorial e o banner renderizam por conta própria.
  // Empurrá-la para dentro de `alertas` com um código emprestado misturaria dois
  // sinais diferentes.
  const conferencia = conferirExterno(m, opts.investimentoOficial ?? null);

  const violacoes = invariantes.filter((i) => i.status === "failed");

  return {
    invariantes,
    alertas,
    conferencia,
    bloqueado: violacoes.length > 0 || conferencia.status === "failed",
    violacoes,
  };
}

/**
 * Roda as guardas e **lança** quando bloqueado — a forma que a rota usa, para
 * garantir que nada seja renderizado nem persistido com número inconsistente.
 */
export function assertLaunchReport(
  m: LaunchReportMetrics,
  opts: ValidateOptions = {},
): LaunchReportGuardResult {
  const r = validateLaunchReport(m, opts);
  if (r.violacoes.length > 0) {
    const primeira = r.violacoes[0]!;
    throw new InvarianteVioladoError(primeira.codigo, primeira.detalhe, primeira.acao, r.violacoes);
  }
  if (r.conferencia.status === "failed") {
    throw new ConferenciaExternaError(
      r.conferencia.detalhe,
      "Conferir o período do relatório e se o cache de insights da Meta está atualizado — " +
        "diferença acima de 0,5% não é drift de reprocessamento",
      r.conferencia,
    );
  }
  return r;
}

// ---------------------------------------------------------------------------
// Os 9 invariantes
// ---------------------------------------------------------------------------

/** A1 — `INV_QUENTE + INV_FRIO == INV` (tol. 0,01). */
function checarA1(m: LaunchReportMetrics): ResultadoInvariante {
  const soma = m.investimento.quente + m.investimento.frio;
  const total = m.investimento.comImposto;
  const detalhe =
    `INV quente (${brl(m.investimento.quente)}) + INV frio (${brl(m.investimento.frio)}) ` +
    `= ${brl(soma)} vs INV total (${brl(total)}) — diferença de ${brl(Math.abs(soma - total))}`;
  return dentro(soma, total, TOLERANCIAS.A1)
    ? ok("A1", detalhe)
    : falhou(
        "A1",
        detalhe,
        "Alguma campanha não caiu em quente nem em frio. Conferir se o nome traz " +
          "hot/cold/quente/frio — campanhas sem essa marca aparecem em `pendencias`",
      );
}

/** A2 — Σ ingressos por origem == `ingressos_unicos` (exato). */
function checarA2(m: LaunchReportMetrics): ResultadoInvariante {
  const p = m.ingressos.porOrigem;
  const soma = p.Pago + p["Orgânico"] + p["Sem Track"];
  const detalhe =
    `Pago (${int(p.Pago)}) + Orgânico (${int(p["Orgânico"])}) + Sem Track (${int(p["Sem Track"])}) ` +
    `= ${int(soma)} vs ingressos únicos (${int(m.ingressos.unicos)})`;
  return soma === m.ingressos.unicos
    ? ok("A2", detalhe)
    : falhou(
        "A2",
        detalhe,
        "Comprador contado em dois baldes de origem, ou balde de origem faltando. " +
          "Conferir `classificarOrigem` sobre o utm_source das vendas",
      );
}

/** A3 — Σ faturamento por origem == `faturamento_total` (tol. 0,01). */
function checarA3(m: LaunchReportMetrics): ResultadoInvariante {
  const f = m.faturamento.porOrigem;
  const soma = f.Pago + f["Orgânico"] + f["Sem Track"];
  const total = m.faturamento.total;
  const detalhe =
    `Σ faturamento por origem (${brl(soma)}) vs total (${brl(total)}) — ` +
    `diferença de ${brl(Math.abs(soma - total))}`;
  return dentro(soma, total, TOLERANCIAS.A3)
    ? ok("A3", detalhe)
    : falhou(
        "A3",
        detalhe,
        "Linha de venda órfã de atribuição. Verificar atribuição de origem em " +
          "vendas sem produto de captação",
      );
}

/** A4 — `fat_captacao + fat_order_bump == fat_total` (tol. 0,01). */
function checarA4(m: LaunchReportMetrics): ResultadoInvariante {
  const soma = m.faturamento.captacao + m.faturamento.orderBump;
  const total = m.faturamento.total;
  const detalhe =
    `captação (${brl(m.faturamento.captacao)}) + order bump (${brl(m.faturamento.orderBump)}) ` +
    `= ${brl(soma)} vs total (${brl(total)}) — diferença de ${brl(Math.abs(soma - total))}`;
  return dentro(soma, total, TOLERANCIAS.A4)
    ? ok("A4", detalhe)
    : falhou(
        "A4",
        detalhe,
        "Produto fora das duas listas. Rodar o wizard de order bumps da etapa e " +
          "classificar os produtos que aparecem na tabela de classificação do relatório",
      );
}

/** A5 — `count(UNICOS) == count(distinct email) + avulsos` (exato). */
function checarA5(m: LaunchReportMetrics): ResultadoInvariante {
  const soma = m.ingressos.emailsDistintos + m.ingressos.avulsosSemEmail;
  const detalhe =
    `e-mails distintos com captação (${int(m.ingressos.emailsDistintos)}) + ` +
    `avulsos sem e-mail (${int(m.ingressos.avulsosSemEmail)}) = ${int(soma)} vs ` +
    `ingressos únicos (${int(m.ingressos.unicos)})`;
  return soma === m.ingressos.unicos
    ? ok("A5", detalhe)
    : falhou(
        "A5",
        detalhe,
        "O dedupe por e-mail está furado. Conferir se a normalização de e-mail " +
          "(trim + lowercase) roda antes de agrupar",
      );
}

/**
 * A6 — Σ `spend_ajustado` dos ads da visão == `INV` da visão (tol. 1,00).
 *
 * `skipped` (nunca `passed`) enquanto a saída não trouxer destaques por anúncio
 * — quem preenche é a Story 41.4. Reportar `passed` aqui seria mentir: o
 * invariante não rodou.
 */
function checarA6(m: LaunchReportMetrics): ResultadoInvariante {
  const visoes = m.destaques?.visoes;
  if (!visoes?.length) {
    return pulado(
      "A6",
      "sem destaques por anúncio na saída — o ad-level precisa existir no período " +
        "(no DG ele começa em 2026-05-20, então o PG02 nunca terá)",
    );
  }

  // Visão sem ad-level tem fator 0 e não é avaliável — pular ela, não a todas.
  const avaliaveis = visoes.filter((v) => v.motivoSkip === null);
  if (avaliaveis.length === 0) {
    return pulado("A6", visoes.map((v) => v.motivoSkip).filter(Boolean).join("; "));
  }

  for (const v of avaliaveis) {
    if (!dentro(v.somaSpendAjustado, v.invVisao, TOLERANCIAS.A6)) {
      return falhou(
        "A6",
        `visão ${v.visao}: Σ spend ajustado (${brl(v.somaSpendAjustado)}) vs INV da visão ` +
          `(${brl(v.invVisao)}) — diferença de ${brl(Math.abs(v.somaSpendAjustado - v.invVisao))}`,
        "A reescala do §3.8 usou o INV errado. O fator é `INV_visao / Σ spend_bruto(ads da visão)` " +
          "— conferir se não está usando o INV total no lugar do da visão",
      );
    }
  }

  const puladas = visoes.length - avaliaveis.length;
  return ok(
    "A6",
    `${avaliaveis.length} visão(ões) com Σ spend ajustado fechando com o INV (tol. R$ 1,00)` +
      (puladas > 0 ? `; ${puladas} sem ad-level` : ""),
  );
}

/** A7 — `ing_pago_quente + ing_pago_frio <= ing_pagos` (sempre). */
function checarA7(m: LaunchReportMetrics): ResultadoInvariante {
  const soma = m.ingressos.pagoQuente + m.ingressos.pagoFrio;
  const detalhe =
    `pagos quentes (${int(m.ingressos.pagoQuente)}) + pagos frios (${int(m.ingressos.pagoFrio)}) ` +
    `= ${int(soma)} vs ingressos pagos (${int(m.ingressos.pagos)})`;
  return soma <= m.ingressos.pagos
    ? ok("A7", detalhe)
    : falhou(
        "A7",
        detalhe,
        "Double-count de temperatura: um comprador pago foi contado como quente E frio. " +
          "Conferir `classificarPublico` — hot e cold não podem casar na mesma string",
      );
}

/**
 * A8 — todo produto pertence a exatamente uma categoria (exato).
 *
 * ⚠️ Nota honesta sobre o alcance: a spec descreve o A8 como "produto novo no
 * lote sem classificar". No modelo atual isso é **inobservável**, porque o
 * sistema só mantém a lista de *order bumps* — produto não listado vira
 * captação por definição, então um produto novo nunca fica "sem categoria".
 *
 * O que dá para verificar de verdade, e é o que fazemos: nenhum produto aparece
 * nas duas categorias, e a soma das vendas por categoria fecha com o total.
 * Isso pega o caso real de um mesmo nome de produto classificado de forma
 * inconsistente entre planilhas do mesmo stage.
 */
function checarA8(m: LaunchReportMetrics): ResultadoInvariante {
  const categoriasPorNome = new Map<string, Set<string>>();
  let vendasSomadas = 0;
  for (const p of m.produtos) {
    vendasSomadas += p.vendas;
    const s = categoriasPorNome.get(p.nome);
    if (s) s.add(p.categoria);
    else categoriasPorNome.set(p.nome, new Set([p.categoria]));
  }

  const ambiguos = [...categoriasPorNome.entries()].filter(([, s]) => s.size > 1).map(([n]) => n);
  if (ambiguos.length > 0) {
    return falhou(
      "A8",
      `${ambiguos.length} produto(s) classificado(s) nas DUAS categorias: ${ambiguos.join(", ")}`,
      `Rodar o wizard de order bumps e classificar de forma consistente: ${ambiguos.join(", ")}`,
    );
  }

  const detalhe =
    `${categoriasPorNome.size} produto(s), cada um em exatamente uma categoria; ` +
    `Σ vendas por produto (${int(vendasSomadas)}) vs vendas totais (${int(m.ingressos.totais)})`;
  return vendasSomadas === m.ingressos.totais
    ? ok("A8", detalhe)
    : falhou(
        "A8",
        detalhe,
        "Venda que não entrou em nenhum produto. Conferir se alguma linha ficou " +
          "sem nome de produto e caiu fora da agregação",
      );
}

/**
 * A9 — `(1000/CPM) × CTR × conv × ticket == roas_pago` (tol. 0,001).
 *
 * O mais poderoso dos nove: o ROAS pago é uma identidade exata, e ela é a base
 * da decomposição do Comparativo (41.6).
 *
 * ⚠️ Usa os valores **do catálogo** (`midia.cpm`, `midia.ctr`,
 * `conversao.cliqueVenda`, `ticket.pago`, `roas.pago`) — não recalcula tudo a
 * partir dos crus. Recalcular tornaria o invariante uma **tautologia**:
 *
 *     (1000/((INV/impr)×1000)) × (cliques/impr) × (pagos/cliques) × (fat/pagos)
 *       = fat/INV = roas_pago     ← verdadeiro para QUALQUER entrada
 *
 * O que o A9 existe para pegar é justamente divergência entre os fatores que o
 * relatório **exibe** e o ROAS que ele **afirma**. O caso concreto da spec: CTR
 * calculado com `link_click` e conversão com `clicks` totais — aí os dois lados
 * deixam de fechar, e é certo que falhem.
 *
 * "A partir dos crus" da story se refere a não usar percentuais já
 * *arredondados para exibição* — usamos os valores numéricos do catálogo, que
 * carregam precisão total.
 */
function checarA9(m: LaunchReportMetrics): ResultadoInvariante {
  const inv = m.investimento.comImposto;
  const { impressoes, cliques } = m.midia;
  const pagos = m.ingressos.pagos;
  const fatPago = m.faturamento.pago;

  if (inv === 0 || impressoes === 0 || cliques === 0 || pagos === 0) {
    return pulado(
      "A9",
      "identidade não é avaliável: investimento, impressões, cliques ou ingressos pagos em zero",
    );
  }

  const cpm = m.midia.cpm.valor;
  if (cpm === 0) {
    return pulado("A9", "identidade não é avaliável: CPM em zero");
  }
  // O catálogo guarda CTR e conversão em PONTOS PERCENTUAIS; a identidade é
  // sobre frações.
  const ctr = m.midia.ctr.valor / 100;
  const conv = m.conversao.cliqueVenda.valor / 100;
  const ticket = m.ticket.pago.valor;
  const reconstruido = (1000 / cpm) * ctr * conv * ticket;
  const roasPago = m.roas.pago.valor;

  const detalhe =
    `(1000/${num(cpm, 2)}) × ${num(ctr * 100, 4)}% × ${num(conv * 100, 4)}% × ${brl(ticket)} ` +
    `= ${num(reconstruido)} vs ROAS pago (${num(roasPago)}) — ` +
    `diferença de ${num(Math.abs(reconstruido - roasPago), 6)}`;

  return dentro(reconstruido, roasPago, TOLERANCIAS.A9)
    ? ok("A9", detalhe)
    : falhou(
        "A9",
        detalhe,
        "A identidade do ROAS não fecha. Conferir se o CTR usa os MESMOS cliques da " +
          "conversão (cliques totais, não link_click) e se o ticket é sobre ingressos pagos únicos",
      );
}

// ---------------------------------------------------------------------------
// Os 8 alertas — nunca bloqueiam
// ---------------------------------------------------------------------------

function coletarAlertas(m: LaunchReportMetrics, opts: ValidateOptions): Alerta[] {
  const alertas: Alerta[] = [];

  // W1 — divergência campaign × ad acima de R$ 50
  if (m.divergencias.length > 0) {
    const lista = m.divergencias
      .slice(0, 5)
      .map((d) => `${d.campaignName} (campanha ${brl(d.spendCampanha)} vs ads ${brl(d.spendAds)})`)
      .join("; ");
    const resto = m.divergencias.length > 5 ? ` e mais ${m.divergencias.length - 5}` : "";
    alertas.push({
      codigo: "W1",
      mensagem: `${m.divergencias.length} campanha(s) com divergência campaign × ad acima de R$ 50: ${lista}${resto}`,
    });
  }

  // W2 — campanha fora dos 5 prefixos
  if (m.campanhas.naoPadrao.length > 0) {
    alertas.push({
      codigo: "W2",
      mensagem:
        `${m.campanhas.naoPadrao.length} campanha(s) fora da convenção de nomes (§2.2), ` +
        `somadas ao investimento mas sem fase: ${m.campanhas.naoPadrao.map((c) => c.campaignName).join("; ")}`,
    });
  }

  // W3 — anúncio com spend baixo e muitas impressões (valor corrompido)
  if (m.adsComSpendSuspeito.length > 0) {
    const lista = m.adsComSpendSuspeito
      .slice(0, 5)
      .map((a) => `${a.adName} (R$ ${brl(a.spend)} com ${int(a.impressoes)} impressões)`)
      .join("; ");
    alertas.push({
      codigo: "W3",
      mensagem: `${m.adsComSpendSuspeito.length} anúncio(s) com spend provavelmente corrompido: ${lista}`,
    });
  }

  // W4 — produto com preço contaminado
  const contaminados = Object.entries(m.precoDistintoPorProduto).filter(
    ([, n]) => n > LIMIARES_ALERTA.precosDistintos,
  );
  if (contaminados.length > 0) {
    const lista = contaminados.map(([p, n]) => `${p} (${n} valores distintos)`).join("; ");
    alertas.push({
      codigo: "W4",
      mensagem:
        `${contaminados.length} produto(s) com mais de ${LIMIARES_ALERTA.precosDistintos} ` +
        `valores de preço distintos — coluna provavelmente contaminada: ${lista}`,
    });
  }

  // W5 — taxa de resposta baixa
  const taxa = m.pesquisa.taxaResposta.valor;
  if (taxa < LIMIARES_ALERTA.taxaResposta) {
    alertas.push({
      codigo: "W5",
      mensagem:
        `taxa de resposta da pesquisa em ${num(taxa, 1)}% (abaixo de ${LIMIARES_ALERTA.taxaResposta}%) — ` +
        `${int(m.pesquisa.respondentes)} compradores responderam de ${int(m.ingressos.unicos)} ingressos únicos; ` +
        `os blocos de qualificação representam menos que o total`,
    });
  }

  // W6 — vendas pagas sem ad_name (ranking por criativo incompleto)
  const pctSemAdName = m.pctVendasPagasSemAdName;
  if (typeof pctSemAdName === "number" && pctSemAdName > LIMIARES_ALERTA.vendasSemAdName) {
    alertas.push({
      codigo: "W6",
      mensagem:
        `${num(pctSemAdName, 1)}% das vendas pagas estão sem ad_name resolvido ` +
        `(acima de ${LIMIARES_ALERTA.vendasSemAdName}%) — o ranking por criativo está incompleto`,
    });
  }

  // W7 — linhas convertidas de moeda estrangeira
  if (m.linhasConvertidas > 0) {
    alertas.push({
      codigo: "W7",
      mensagem:
        `${int(m.linhasConvertidas)} linha(s) em moeda estrangeira tiveram o valor substituído ` +
        `pelo preço modal em BRL do mesmo produto (§2.4)`,
    });
  }

  // W8 — lote da Meta possivelmente truncado
  if (opts.loteNoLimite) {
    alertas.push({
      codigo: "W8",
      mensagem:
        "um lote de consulta à Meta voltou exatamente no limite de paginação — " +
        "pode haver campanha faltando no investimento",
    });
  }

  return alertas;
}

// ---------------------------------------------------------------------------
// Conferência externa (§8.3)
// ---------------------------------------------------------------------------

function conferirExterno(
  m: LaunchReportMetrics,
  oficial: number | null,
): ConferenciaExterna {
  const calculado = m.investimento.comImposto;

  if (oficial === null || !Number.isFinite(oficial) || oficial <= 0) {
    return {
      status: "skipped",
      investimentoCalculado: calculado,
      investimentoOficial: null,
      delta: null,
      detalhe:
        "conferência externa pulada — nenhum investimento oficial informado " +
        "(não derivar um 'oficial' de outra fonte)",
    };
  }

  const delta = Math.abs(calculado - oficial) / oficial;
  const pct = num(delta * 100, 3);
  const base =
    `investimento calculado ${brl(calculado)} vs oficial ${brl(oficial)} — ` +
    `diferença de ${brl(Math.abs(calculado - oficial))} (${pct}%)`;

  if (delta > LIMIAR_CONFERENCIA.bloqueio) {
    return {
      status: "failed",
      investimentoCalculado: calculado,
      investimentoOficial: oficial,
      delta,
      detalhe: `${base} — acima do limite de 0,5%`,
    };
  }
  if (delta > LIMIAR_CONFERENCIA.alerta) {
    return {
      status: "alerta",
      investimentoCalculado: calculado,
      investimentoOficial: oficial,
      delta,
      detalhe: `${base} — dentro do drift normal de reprocessamento da Meta, mas acima de 0,05%`,
    };
  }
  return {
    status: "passed",
    investimentoCalculado: calculado,
    investimentoOficial: oficial,
    delta,
    detalhe: base,
  };
}
