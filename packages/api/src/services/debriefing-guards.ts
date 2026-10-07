/**
 * Story 49.5 — Guardas do Debriefing: os checks da Fase 12 da skill
 * `loyola-debriefing` (`checklists/verificacao-pre-entrega.md`) como código.
 *
 * - **F1–F15** (invariantes): bloqueiam — número errado não é renderizado.
 * - **WF1–WF9** (alertas): sinalizam dado suspeito, nunca bloqueiam.
 * - **Conferência externa** (opcional): investimento contra o oficial informado.
 *
 * Padrão de API da 41.3 (`launch-report-guards.ts`): `validate*` devolve
 * `{ invariantes, alertas, conferencia, bloqueado, violacoes }` e `assert*`
 * lança. Prefixos `F`/`WF` próprios para não colidir com `A`/`W` do Epic 41.
 *
 * **Puro.** Sem I/O, sem relógio. F8, F12 e F13 comparam o campo EXPOSTO com o
 * RECOMPUTADO a partir de campos crus do próprio payload — comparar cru com cru
 * seria tautologia (precedente do A9 da 41.3).
 *
 * Tolerâncias: contagens e pertinência exatas; dinheiro `0,01`; razão
 * recomputada `1e-9`; imposto relativo `1e-6`. Nunca "arredondar e comparar".
 */

import { CANAIS, FECHAMENTOS, cpcDeLink, ctrDeLink, type Canal } from "@loyola-x/shared";
import { dataExiste } from "./debriefing-config.js";
import { aplicarImposto, corteSemCarrinho, LACUNA_CARRINHO_AINDA_NAO_ABRIU } from "./debriefing-hygiene.js";
import {
  CRITERIO_DE_UNICO_HEADLINE,
  MAXD_PADRAO,
  fmtNumero,
  fmtReais,
  type CriterioDeUnico,
  type DebriefingMoneyTime,
  type MidiaAgregada,
  type TuplaClassificada,
} from "./debriefing-money-time-engine.js";
import {
  ITENS_DA_LACUNA_DO_CARRINHO,
  LACUNA_DIMENSAO_NAO_CONFIRMADA,
  type CodigoDeLacunaDoDebriefing,
  type DebriefingPayload,
} from "./debriefing-payload.js";
import {
  ConferenciaExternaError,
  LIMIARES_ALERTA,
  LIMIAR_CONFERENCIA,
  type ConferenciaExterna,
} from "./launch-report-guards.js";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const CODIGOS_INVARIANTE_FASE12 = [
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15",
] as const;
export type CodigoInvarianteFase12 = (typeof CODIGOS_INVARIANTE_FASE12)[number];

export const CODIGOS_ALERTA_FASE12 = ["WF1", "WF2", "WF3", "WF4", "WF5", "WF6", "WF7", "WF8", "WF9"] as const;
export type CodigoAlertaFase12 = (typeof CODIGOS_ALERTA_FASE12)[number];

export type StatusInvarianteFase12 = "passed" | "failed" | "skipped";

export interface ResultadoInvarianteFase12 {
  codigo: CodigoInvarianteFase12;
  status: StatusInvarianteFase12;
  /** Os dois lados da conta, com os valores reais. */
  detalhe: string;
  /** O que fazer — específica por invariante; vazia quando passou. */
  acao: string;
}

export interface AlertaFase12 {
  codigo: CodigoAlertaFase12;
  mensagem: string;
  /** Quantos itens o alerta agrupa (o banner da 49.6 mostra a contagem). */
  quantidade: number;
}

export interface DebriefingGuardResult {
  invariantes: ResultadoInvarianteFase12[];
  alertas: AlertaFase12[];
  conferencia: ConferenciaExterna;
  /** `true` quando algum invariante falhou OU a conferência externa bloqueou. */
  bloqueado: boolean;
  /** Invariantes `failed`, na ordem F1→F15. */
  violacoes: ResultadoInvarianteFase12[];
}

export interface ValidateDebriefingOptions {
  /** Investimento oficial informado por quem gera. Ausente = conferência `skipped` (nunca derivado de outra fonte). */
  investimentoOficial?: number | null;
}

/** Corpo 422 no formato da 41.3: `{ erro, codigo, detalhe, acao, violacoes }`. */
export class DebriefingInvarianteVioladoError extends Error {
  readonly erro = "INVARIANTE_VIOLADO";
  constructor(
    readonly codigo: CodigoInvarianteFase12,
    readonly detalhe: string,
    readonly acao: string,
    readonly violacoes: ResultadoInvarianteFase12[],
  ) {
    super(detalhe);
    this.name = "DebriefingInvarianteVioladoError";
  }
  toResponse() {
    return { erro: this.erro, codigo: this.codigo, detalhe: this.detalhe, acao: this.acao, violacoes: this.violacoes };
  }
}

// ---------------------------------------------------------------------------
// Tolerâncias e ações
// ---------------------------------------------------------------------------

export const TOLERANCIAS_FASE12 = {
  /** Reais. */
  dinheiro: 0.01,
  /** Razão recomputada a partir de campos do próprio payload. */
  razao: 1e-9,
  /** Consistência do imposto (relativa). */
  impostoRelativo: 1e-6,
} as const;

/** Uma ação por invariante, específica — proibido "verifique os dados" (AC3). */
export const ACOES_FASE12: Readonly<Record<CodigoInvarianteFase12, string>> = {
  F1: "Uma soma de faturamento ou a contagem da dedup não fecha: rodar de novo o Motor I (49.3) e conferir se a camada 1 (ID da venda + produto) e a camada 2 (e-mail + produto) foram aplicadas UMA vez, antes do corte de janela, e se faturamento total, por etapa, por tipo e a auditoria do principal saem do mesmo conjunto de linhas.",
  F2: "Venda via TMB com valor dentro do faturamento ou sem sinalização: conferir a plataforma `tmb` da planilha na etapa do principal — a venda conta em vendas do principal com valor considerado R$ 0 e a memória do faturamento do principal precisa citar o TMB.",
  F3: "Ingressos únicos não fecham com as quebras: conferir se o critério headline é `porEmail` e se os dois motores (49.3 e 49.4) leram a MESMA higiene de vendas (`higienizarVendasDoDebriefing`) — as chaves de compradores de captação têm de ser idênticas nos dois.",
  F4: "Vendas do principal por canal ou por fechamento não somam o total: conferir no classificador (49.2) se toda venda do principal recebeu exatamente um canal e um valor de fechamento.",
  F5: "A Tabela 1 de aquisição tem lista (Comunidade/Front) ou `Closer` como canal: listas vão para a Tabela 2 e Closer é o eixo de fechamento (decisão 3) — corrigir a versão do classificador antes de gerar.",
  F6: "Os dois motores classificaram a mesma UTM de formas diferentes: injetar o MESMO classificador (mesma versão e config de closer) no Motor I e no Motor II e gerar de novo.",
  F7: "A coorte não fecha: a base de data tem de ser a do LEAD, e naCoorte + pré-lançamento + fora da coorte + além da janela tem de dar as vendas do principal; se a cauda ficou fora, aumentar o maxD (padrão 45) em vez de cortar vendas.",
  F8: "Um ROAS do payload não bate com faturamento ÷ investimento do próprio payload: conferir no Motor I qual numerador entrou (só ingresso, captação = ingresso + combo + order bump, total = captação + principal + downsell) e se o denominador é o investimento com imposto do grupo certo.",
  F9: "A pesquisa não fecha ou exibe dimensão não confirmada: conferir no Motor II a dedup por e-mail (linhas − vazias − repetidas = respondentes), confirmar a pergunta na config da 49.1 antes de exibi-la e garantir segmentos exclusivos.",
  F10: "Datas-chave incompletas ou fora de ordem: corrigir na config do Debriefing (49.1) — início da captação ≤ abertura ≤ fim do carrinho, e reabertura/downsell respondidos (com abertura ≤ fim) quando há etapa com esse papel.",
  F11: "Uma condição do payload gera lacuna que não está em `lacunas[]`: a lacuna é obrigatória no relatório — corrigir o motor que deixou de emiti-la (ver o código no detalhe) antes de gerar.",
  F12: "O investimento com imposto não bate com o spend cru × (1 ÷ (1 − alíquota)) por dia: o imposto foi aplicado zero ou duas vezes (ou com o fator fixo da skill). Só o Motor I aplica o imposto, por dia, com `aplicarImposto`; quente + frio + indefinido têm de somar o investimento.",
  F13: "CTR/CPC não são os de clique no link: recalcular com `ctrDeLink`/`cpcDeLink` de `shared/src/clique-no-link.ts`; sem `link_click` a métrica é nula — nunca cliques totais nem 0.",
  F14: "Há produto da captação cujo papel o default da etapa não resolve: classificar o produto (ingresso, combo ou order bump) no mapa de produtos da planilha de vendas da etapa de captação e gerar de novo.",
  F15: "Um valor monetário não veio da célula crua da planilha: ler o valor com `lerValorMonetario` no Motor I (nunca valor pré-parseado — \"29.9\" vira 299, \"4.000\" vira 4).",
};

const ACAO_CONFERENCIA =
  "O investimento calculado diverge do oficial informado acima de 0,5%: conferir o vínculo de campanhas das etapas (49.1) e a mídia do período no banco antes de gerar — não ajustar o número à mão.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dentro = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;
const dentroRelativo = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1);
const int = (v: number): string => fmtNumero(v, 0);
const num = (v: number | null | undefined): string => (v == null ? "null" : fmtNumero(v, 6));
const soma = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);

function passou(codigo: CodigoInvarianteFase12, detalhe: string): ResultadoInvarianteFase12 {
  return { codigo, status: "passed", detalhe, acao: "" };
}
function falhou(codigo: CodigoInvarianteFase12, problemas: readonly string[]): ResultadoInvarianteFase12 {
  return { codigo, status: "failed", detalhe: problemas.join("; "), acao: ACOES_FASE12[codigo] };
}
function pulado(codigo: CodigoInvarianteFase12, detalhe: string): ResultadoInvarianteFase12 {
  return { codigo, status: "skipped", detalhe, acao: "" };
}
const resultado = (codigo: CodigoInvarianteFase12, problemas: readonly string[], ok: string): ResultadoInvarianteFase12 =>
  problemas.length > 0 ? falhou(codigo, problemas) : passou(codigo, ok);

const GRUPOS_HEADLINE = ["captacao", "principal", "downsell"] as const;

// ---------------------------------------------------------------------------
// Invariantes
// ---------------------------------------------------------------------------

/** F1 — dedup e soma: nenhum caminho de soma dobrado (armadilha #1, check 1). */
export function checarF1(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  for (const camada of ["camada1", "camada2"] as const) {
    const c = m.dedup[camada];
    if (c.antes - c.depois !== c.removidas) {
      problemas.push(`dedup ${camada}: antes ${int(c.antes)} − depois ${int(c.depois)} = ${int(c.antes - c.depois)} ≠ removidas ${int(c.removidas)}`);
    }
  }
  const total = m.faturamentoTotal;
  const caminhos: [string, number][] = [
    ["Σ faturamento por etapa (grupo)", soma(Object.values(m.faturamentoPorEtapa))],
    ["Σ faturamento por stageId", soma(Object.values(m.faturamentoPorStageId))],
    ["Σ faturamento por tipo", soma(Object.values(m.faturamentoPorTipo))],
  ];
  for (const [rotulo, v] of caminhos) {
    if (!dentro(total, v, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`faturamentoTotal ${fmtReais(total)} ≠ ${rotulo} ${fmtReais(v)}`);
    }
  }
  // 49.12: com o carrinho fechado no corte, o faturamento do principal é lacuna
  // (`null`) — a soma da auditoria confere contra o faturamento por etapa.
  const fatPrin = m.faturamentoPrincipal.valor ?? m.faturamentoPorEtapa.principal;
  const somaAuditoria = soma(m.auditoriaDeVendas.map((a) => a.valorConsiderado));
  if (!dentro(fatPrin, somaAuditoria, TOLERANCIAS_FASE12.dinheiro)) {
    problemas.push(`faturamentoPrincipal ${fmtReais(fatPrin)} ≠ Σ valor considerado da auditoria do principal ${fmtReais(somaAuditoria)}`);
  }
  if (!dentro(fatPrin, m.faturamentoPorEtapa.principal, TOLERANCIAS_FASE12.dinheiro)) {
    problemas.push(`faturamentoPrincipal ${fmtReais(fatPrin)} ≠ faturamentoPorEtapa.principal ${fmtReais(m.faturamentoPorEtapa.principal)}`);
  }
  const vistos = new Set<string>();
  for (const a of m.auditoriaDeVendas) {
    if (!a.txId || !a.produto) continue;
    const k = `${a.fonte}\u0000${a.txId}\u0000${a.produto.trim().toLowerCase()}`;
    if (vistos.has(k)) problemas.push(`auditoriaDeVendas tem (txId ${a.txId}, produto ${a.produto}) repetido`);
    vistos.add(k);
  }
  const auditados = new Set(m.auditoriaDeVendas.map((a) => a.txId).filter((t): t is string => !!t));
  for (const e of m.vendasExcluidas) {
    if (e.txId && auditados.has(e.txId)) {
      problemas.push(`venda excluída ${e.txId} (${e.motivo}) aparece na auditoria do principal — o valor dela entra no faturamento`);
    }
  }
  return resultado(
    "F1",
    problemas,
    `dedup fecha nas duas camadas; faturamentoTotal ${fmtReais(total)} = por etapa = por stageId = por tipo; principal ${fmtReais(fatPrin)} = Σ auditoria`,
  );
}

/** F2 — TMB conta a venda, exclui o valor e é sinalizado (check 2). */
export function checarF2(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  const tmbNaAuditoria = m.auditoriaDeVendas.filter((a) => a.tmb);
  if (tmbNaAuditoria.length !== m.tmb.vendasNoPrincipal) {
    problemas.push(`vendas TMB na auditoria do principal ${int(tmbNaAuditoria.length)} ≠ tmb.vendasNoPrincipal ${int(m.tmb.vendasNoPrincipal)}`);
  }
  for (const a of tmbNaAuditoria) {
    if (a.valorConsiderado !== 0) {
      problemas.push(`venda TMB ${a.txId ?? "(sem id)"} entra no faturamento com ${fmtReais(a.valorConsiderado)} (deveria ser R$ 0,00)`);
    }
  }
  if (m.auditoriaDeVendas.length !== m.vendasPrincipal) {
    problemas.push(`auditoria do principal tem ${int(m.auditoriaDeVendas.length)} vendas ≠ vendasPrincipal ${int(m.vendasPrincipal)} (TMB precisa contar como venda)`);
  }
  if (m.tmb.vendas > 0) {
    if (!m.tmb.sinalizado) problemas.push(`tmb.vendas ${int(m.tmb.vendas)} > 0 com tmb.sinalizado = false`);
    if (!m.tmb.texto) problemas.push(`tmb.vendas ${int(m.tmb.vendas)} > 0 sem o texto de TMB`);
  }
  if (m.tmb.vendasNoPrincipal > 0 && !/TMB/.test(m.faturamentoPrincipal.memoria)) {
    problemas.push(`a memória do faturamento do principal não cita o TMB ("${m.faturamentoPrincipal.memoria}")`);
  }
  if (m.tmb.vendas > 0 && !/TMB/.test(m.roasTotalSemTmb.memoria)) {
    problemas.push(`a memória do ROAS total s/ TMB não cita o TMB ("${m.roasTotalSemTmb.memoria}")`);
  }
  return resultado(
    "F2",
    problemas,
    m.tmb.vendas > 0
      ? `${int(m.tmb.vendas)} venda(s) TMB contadas, valor ${fmtReais(m.tmb.valorExcluido)} fora do faturamento e sinalizado`
      : "sem venda TMB",
  );
}

const ordenadas = (xs: readonly string[]): string[] => [...xs].sort();
const mesmaLista = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const x = ordenadas(a);
  const y = ordenadas(b);
  return x.every((v, i) => v === y[i]);
};

/** F3 — ingressos: resumo = lista de compradores; cada eixo fecha sozinho (check 3, decisão 3). */
export function checarF3(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  if (m.criterioDeUnico !== CRITERIO_DE_UNICO_HEADLINE) {
    problemas.push(`critério headline ${m.criterioDeUnico} ≠ ${CRITERIO_DE_UNICO_HEADLINE} (decisão 1)`);
  }
  const iu = m.ingressosUnicos;
  if (m.compradores.length !== iu) problemas.push(`ingressosUnicos ${int(iu)} ≠ lista de compradores ${int(m.compradores.length)}`);
  if (m.captacao.ingressosUnicos !== iu) problemas.push(`captacao.ingressosUnicos ${int(m.captacao.ingressosUnicos)} ≠ ingressosUnicos ${int(iu)}`);
  const headline = m.compradoresCaptacao[CRITERIO_DE_UNICO_HEADLINE] ?? [];
  if (headline.length !== iu) problemas.push(`compradoresCaptacao.${CRITERIO_DE_UNICO_HEADLINE} ${int(headline.length)} ≠ ingressosUnicos ${int(iu)}`);
  const porCanal = soma(m.tabela1.canais.map((c) => c.ingressos));
  if (porCanal !== iu) problemas.push(`Σ ingressos por canal ${int(porCanal)} ≠ ingressosUnicos ${int(iu)}`);
  const porFech = m.tabela1.fechamento.closer.ingressos + m.tabela1.fechamento.semCloser.ingressos;
  if (porFech !== iu) problemas.push(`closer + semCloser (ingressos) ${int(porFech)} ≠ ingressosUnicos ${int(iu)}`);
  for (const criterio of Object.keys(m.compradoresCaptacao) as CriterioDeUnico[]) {
    const a = m.compradoresCaptacao[criterio] ?? [];
    const b = p.publico.compradoresCaptacao[criterio] ?? [];
    if (!mesmaLista(a, b)) {
      problemas.push(`compradores de captação (${criterio}): Motor I ${int(a.length)} × Motor II ${int(b.length)} — chaves diferentes`);
    }
  }
  if (!m.diferencaDeFonte?.codigo || !m.diferencaDeFonte.texto) problemas.push("diferencaDeFonte não declarada");
  return resultado(
    "F3",
    problemas,
    `ingressosUnicos ${int(iu)} (porEmail) = Σ por canal = closer + semCloser; os dois motores com as mesmas chaves`,
  );
}

/** F4 — vendas do principal por canal e por fechamento somam o oficial (check 4). */
export function checarF4(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const vp = m.vendasPrincipal;
  const problemas: string[] = [];
  const porCanal = soma(m.tabela1.canais.map((c) => c.vendas));
  if (porCanal !== vp) problemas.push(`Σ vendas do principal por canal ${int(porCanal)} ≠ vendasPrincipal ${int(vp)}`);
  const porFech = m.tabela1.fechamento.closer.vendas + m.tabela1.fechamento.semCloser.vendas;
  if (porFech !== vp) problemas.push(`closer + semCloser (vendas) ${int(porFech)} ≠ vendasPrincipal ${int(vp)}`);
  return resultado("F4", problemas, `vendasPrincipal ${int(vp)} = Σ por canal = closer + semCloser`);
}

const LISTAS_E_FECHAMENTO = ["comunidade", "front", "closer"];

/** F5 — canais × listas × fechamento separados (armadilha #8, check 5). */
export function checarF5(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  const validos = new Set<string>(CANAIS);
  const vistos = new Set<string>();
  for (const l of m.tabela1.canais) {
    const nome = String(l.canal);
    if (LISTAS_E_FECHAMENTO.includes(nome.trim().toLowerCase())) {
      problemas.push(`canal "${nome}" na Tabela 1 de aquisição (lista ou fechamento não é canal)`);
    } else if (!validos.has(nome)) {
      problemas.push(`canal "${nome}" fora do vocabulário do classificador`);
    }
    if (vistos.has(nome)) problemas.push(`canal "${nome}" repetido na Tabela 1`);
    vistos.add(nome);
  }
  const s = m.tabela1.somas;
  if (s.ingressosPorCanal !== m.ingressosUnicos || s.ingressosPorFechamento !== m.ingressosUnicos) {
    problemas.push(`somas de ingressos por canal ${int(s.ingressosPorCanal)} / por fechamento ${int(s.ingressosPorFechamento)} ≠ ingressosUnicos ${int(m.ingressosUnicos)} (canal e fechamento somados?)`);
  }
  if (s.vendasPorCanal !== m.vendasPrincipal || s.vendasPorFechamento !== m.vendasPrincipal) {
    problemas.push(`somas de vendas por canal ${int(s.vendasPorCanal)} / por fechamento ${int(s.vendasPorFechamento)} ≠ vendasPrincipal ${int(m.vendasPrincipal)}`);
  }
  const fechamentos = new Set<string>(FECHAMENTOS);
  const porCanal = new Map<string, number>();
  for (const c of m.compradores) {
    if (!validos.has(c.canal)) problemas.push(`comprador com canal "${c.canal}" fora do vocabulário`);
    if (!fechamentos.has(c.fechamento)) problemas.push(`comprador com fechamento "${c.fechamento}" fora do vocabulário`);
    porCanal.set(c.canal, (porCanal.get(c.canal) ?? 0) + 1);
  }
  for (const l of m.tabela1.canais) {
    const n = porCanal.get(l.canal) ?? 0;
    if (n !== l.ingressos) problemas.push(`canal ${l.canal}: ${int(l.ingressos)} ingressos na Tabela 1 × ${int(n)} compradores com esse canal`);
  }
  return resultado("F5", problemas, "Tabela 1 só com canais de aquisição; cada ingresso e cada venda em exatamente um canal e um fechamento");
}

function chaveDaTupla(t: Pick<TuplaClassificada, "lead" | "venda" | "sellerName">): string {
  const u = (x: TuplaClassificada["lead"]) =>
    x ? [x.source ?? null, x.medium ?? null, x.campaign ?? null, x.term ?? null, x.campaignName ?? null] : null;
  return JSON.stringify([u(t.lead), u(t.venda), t.sellerName ?? null]);
}

/** F6 — classificador único: mesma versão e mesmos rótulos nas duas saídas (armadilha #9, check 6). */
export function checarF6(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  if (m.classificadorVersao !== p.publico.classificadorVersao) {
    problemas.push(`classificadorVersao: Motor I "${m.classificadorVersao}" ≠ Motor II "${p.publico.classificadorVersao}"`);
  }
  const rotulos = new Map<string, { canal: Canal; fechamento: string; onde: string }>();
  let comparadas = 0;
  const registrar = (t: TuplaClassificada, onde: string) => {
    const k = chaveDaTupla(t);
    const atual = rotulos.get(k);
    if (!atual) {
      rotulos.set(k, { canal: t.canal, fechamento: t.fechamento, onde });
      return;
    }
    if (atual.onde !== onde) comparadas += 1;
    if (atual.canal !== t.canal || atual.fechamento !== t.fechamento) {
      problemas.push(`a mesma UTM ${k} é ${atual.canal}/${atual.fechamento} (${atual.onde}) e ${t.canal}/${t.fechamento} (${onde})`);
    }
  };
  for (const t of m.tuplasClassificadas) registrar(t, "Motor I");
  for (const t of p.publico.tuplasClassificadas) registrar(t, "Motor II");
  return resultado(
    "F6",
    problemas,
    `classificador ${m.classificadorVersao} nos dois motores; ${int(comparadas)} tupla(s) presentes nos dois com o mesmo rótulo de canal e fechamento`,
  );
}

/** F7 — coorte pela data do lead, sem cortar a cauda (armadilhas #4 e #7, check 7). */
export function checarF7(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const c = m.coorte;
  const problemas: string[] = [];
  if (c.baseDeData !== "lead") problemas.push(`coorte.baseDeData = "${String(c.baseDeData)}" (tem de ser "lead", nunca a data da venda)`);
  const somaBuckets = c.naCoorte + c.basePreLancamento + c.foraDaCoorte.length + c.alemDaJanela.length;
  if (somaBuckets !== m.vendasPrincipal) {
    problemas.push(
      `naCoorte ${int(c.naCoorte)} + pré-lançamento ${int(c.basePreLancamento)} + fora da coorte ${int(c.foraDaCoorte.length)} + além da janela ${int(c.alemDaJanela.length)} = ${int(somaBuckets)} ≠ vendasPrincipal ${int(m.vendasPrincipal)}`,
    );
  }
  if (m.vendasPrincipalBrutas !== m.vendasPrincipal + m.vendasExcluidas.length) {
    problemas.push(`vendasPrincipalBrutas ${int(m.vendasPrincipalBrutas)} ≠ vendasPrincipal ${int(m.vendasPrincipal)} + excluídas ${int(m.vendasExcluidas.length)}`);
  }
  if (!Number.isInteger(c.maxD) || c.maxD <= 0) {
    problemas.push(`maxD ausente ou inválido (${String(c.maxD)})`);
  } else {
    const naSerie = c.serie.filter((s) => s.dMais > c.maxD && s.vendas > 0);
    for (const s of naSerie) problemas.push(`venda em D+${int(s.dMais)} dentro da série com maxD ${int(c.maxD)} (deveria estar em alemDaJanela)`);
    for (const a of c.alemDaJanela) {
      if (!(a.dMais > c.maxD)) problemas.push(`venda em alemDaJanela com D+${int(a.dMais)} ≤ maxD ${int(c.maxD)}`);
    }
    const naSerieTotal = soma(c.serie.filter((s) => s.dMais >= 0).map((s) => s.vendas));
    if (naSerieTotal !== c.naCoorte) problemas.push(`Σ série da coorte ${int(naSerieTotal)} ≠ naCoorte ${int(c.naCoorte)}`);
  }
  return resultado(
    "F7",
    problemas,
    `coorte por data do lead, maxD ${int(c.maxD)}${c.maxD < MAXD_PADRAO ? ` (< ${MAXD_PADRAO}, cauda em alemDaJanela: ${int(c.alemDaJanela.length)})` : ""}; buckets somam ${int(m.vendasPrincipal)}`,
  );
}

/** F8 — ROAS nos 3 níveis, recomputados de faturamento e investimento do payload (check 8, decisão 5). */
export function checarF8(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  const invGrupo = (g: keyof DebriefingMoneyTime["midia"]["porGrupo"]) => m.midia.porGrupo[g].investimentoComImposto;
  const invCap = invGrupo("captacao");
  const invTotal = soma(GRUPOS_HEADLINE.map(invGrupo));
  const fatTotal = soma(GRUPOS_HEADLINE.map((g) => m.faturamentoPorEtapa[g]));
  const pulados: string[] = [];

  const conferirRazao = (
    nome: string,
    metrica: { valor: number | null; motivo?: string; numerador?: number | null; denominador?: number | null },
    numerador: number | null,
    rotuloNum: string,
    denominador: number,
    rotuloDen: string,
  ) => {
    if (metrica.valor === null) {
      if (!metrica.motivo) problemas.push(`${nome} = null sem motivo`);
      else pulados.push(`${nome} (${metrica.motivo})`);
      return;
    }
    if (numerador === null) {
      problemas.push(`${nome} do payload (${num(metrica.valor)}) com ${rotuloNum} nulo`);
      return;
    }
    if (denominador === 0) {
      problemas.push(`${nome} do payload (${num(metrica.valor)}) com ${rotuloDen} = 0`);
      return;
    }
    const esperado = numerador / denominador;
    if (!dentro(metrica.valor, esperado, TOLERANCIAS_FASE12.razao)) {
      problemas.push(`${nome} do payload (${num(metrica.valor)}) ≠ ${rotuloNum} ÷ ${rotuloDen} (${num(esperado)})`);
    }
    if (metrica.numerador != null && !dentro(metrica.numerador, numerador, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`${nome}.numerador ${fmtReais(metrica.numerador)} ≠ ${rotuloNum} ${fmtReais(numerador)}`);
    }
    if (metrica.denominador != null && !dentro(metrica.denominador, denominador, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`${nome}.denominador ${fmtReais(metrica.denominador)} ≠ ${rotuloDen} ${fmtReais(denominador)}`);
    }
  };

  conferirRazao("roasSoIngresso", m.roasSoIngresso, m.captacao.faturamentoIngresso.valor, "faturamentoIngresso", invCap, "investimentoCaptacao");
  conferirRazao("roasCaptacao", m.roasCaptacao, m.captacao.faturamentoCaptacao.valor, "faturamentoCaptacao", invCap, "investimentoCaptacao");
  conferirRazao("roasTotalSemTmb", m.roasTotalSemTmb, fatTotal, "captação + principal + downsell", invTotal, "investimento total");

  const d = m.roasTotalSemTmb.decomposicao;
  if (!dentro(m.roasTotalSemTmb.numerador, d.captacao + d.principal + d.downsell, TOLERANCIAS_FASE12.dinheiro)) {
    problemas.push(`roasTotalSemTmb.numerador ${fmtReais(m.roasTotalSemTmb.numerador)} ≠ captação + principal + downsell da decomposição ${fmtReais(d.captacao + d.principal + d.downsell)}`);
  }
  for (const g of GRUPOS_HEADLINE) {
    if (!dentro(d[g], m.faturamentoPorEtapa[g], TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`decomposição.${g} ${fmtReais(d[g])} ≠ faturamentoPorEtapa.${g} ${fmtReais(m.faturamentoPorEtapa[g])}`);
    }
  }

  const t = m.teseOrderBump;
  const si = m.roasSoIngresso.valor;
  const rc = m.roasCaptacao.valor;
  const esperado = si === null || rc === null ? "indefinida" : si < 1 && rc > 1 ? "confirmada" : "nao-confirmada";
  if (t.veredito !== esperado) {
    problemas.push(`teseOrderBump.veredito "${t.veredito}" ≠ "${esperado}" (roasSoIngresso ${num(si)}, roasCaptacao ${num(rc)})`);
  }
  if (t.roasSoIngresso !== si || t.roasCaptacao !== rc) {
    problemas.push(`teseOrderBump repete ROAS diferentes dos do payload (${num(t.roasSoIngresso)}/${num(t.roasCaptacao)} × ${num(si)}/${num(rc)})`);
  }

  if (problemas.length > 0) return falhou("F8", problemas);
  if (!m.captacao.aplicavel || (si === null && rc === null)) {
    return pulado(
      "F8",
      `ROAS de captação não se aplica: ${pulados.join("; ") || "sem captação paga"}; ROAS total ${m.roasTotalSemTmb.valor === null ? "nulo" : "conferido"}`,
    );
  }
  return passou(
    "F8",
    `3 ROAS recomputados de faturamento ÷ investimento do payload${pulados.length ? ` (nulos com motivo: ${pulados.join("; ")})` : ""}; tese "${t.veredito}"`,
  );
}

/** F9 — pesquisa deduplicada; dimensão só se confirmada; segmentos exclusivos (armadilha #6, check 9). */
export function checarF9(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const a = p.publico;
  const pq = a.pesquisa;
  const problemas: string[] = [];
  const calc = pq.linhasLidas - pq.vazias - pq.duplicadasRemovidas;
  if (calc !== pq.respondentes) {
    problemas.push(`linhas lidas ${int(pq.linhasLidas)} − vazias ${int(pq.vazias)} − repetidas ${int(pq.duplicadasRemovidas)} = ${int(calc)} ≠ respondentes ${int(pq.respondentes)}`);
  }
  const confirmadas = p.config.perguntasConfirmadas;
  const naoConfirmadas = new Set(a.dimensoesNaoConfirmadas.map((d) => d.campo));
  for (const d of a.dimensoes) {
    if (naoConfirmadas.has(d.campo)) problemas.push(`dimensão "${d.campo}" exibida e listada como não confirmada`);
    const etapas = Object.entries(confirmadas).filter(([, pc]) => {
      const chave = (pc as Record<string, string | null | undefined>)[d.campo];
      return typeof chave === "string" && chave.length > 0;
    });
    if (etapas.length === 0) problemas.push(`dimensão "${d.campo}" exibida sem pergunta confirmada na config (49.1)`);
    for (const pg of d.perguntas) {
      const chave = (confirmadas[pg.stageId] as Record<string, string | null | undefined> | undefined)?.[d.campo];
      if (chave !== pg.chave) problemas.push(`dimensão "${d.campo}" usa a pergunta "${pg.chave}" na etapa ${pg.stageId}, a confirmada é "${chave ?? "nenhuma"}"`);
    }
  }
  const somaSeg = soma(a.segmentos.map((s) => s.n));
  if (somaSeg !== pq.respondentes) problemas.push(`Σ segmentos ${int(somaSeg)} ≠ respondentes ${int(pq.respondentes)} (segmentos não exclusivos)`);
  return resultado(
    "F9",
    problemas,
    `pesquisa: ${int(pq.linhasLidas)} − ${int(pq.vazias)} − ${int(pq.duplicadasRemovidas)} = ${int(pq.respondentes)}; ${int(a.dimensoes.length)} dimensão(ões) confirmada(s); segmentos somam ${int(somaSeg)}`,
  );
}

/**
 * F10 — datas-chave completas e ordenadas, coerentes com os papéis das etapas (check 10).
 * Story 49.12 (AC9): "ainda não aconteceu" vale SÓ no modo em andamento; no
 * encerrado, a regra é a de sempre (datas incompletas bloqueiam).
 */
export function checarF10(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const cfg = p.config;
  if (cfg.situacaoDoLancamento === "em-andamento") return checarF10EmAndamento(cfg);
  const d = cfg.datasChave;
  const problemas: string[] = [];
  for (const [nome, v] of [["inicioCaptacao", d.inicioCaptacao], ["aberturaCarrinho", d.aberturaCarrinho], ["fimCarrinho", d.fimCarrinho]] as const) {
    if (typeof v !== "string" || !dataExiste(v)) problemas.push(`${nome} ausente ou inválida (${String(v)})`);
  }
  if (problemas.length === 0 && !(d.inicioCaptacao <= d.aberturaCarrinho && d.aberturaCarrinho <= d.fimCarrinho)) {
    problemas.push(`fora de ordem: início ${d.inicioCaptacao} ≤ abertura ${d.aberturaCarrinho} ≤ fim ${d.fimCarrinho} não vale`);
  }
  for (const nome of ["reabertura", "downsell"] as const) {
    const r = d[nome] as { houve?: unknown; abertura?: string; fim?: string } | null | undefined;
    if (!r || typeof r.houve !== "boolean") {
      problemas.push(`${nome} sem resposta explícita (houve indefinido)`);
      continue;
    }
    if (r.houve === true) {
      if (!r.abertura || !r.fim || !dataExiste(r.abertura) || !dataExiste(r.fim)) problemas.push(`${nome} com houve = true sem abertura/fim válidas`);
      else if (r.abertura > r.fim) problemas.push(`${nome}: abertura ${r.abertura} > fim ${r.fim}`);
    }
  }
  const papeis = new Set(p.config.etapas.map((e) => e.papel));
  if (papeis.has("reabertura") && d.reabertura?.houve !== true) problemas.push("há etapa com papel reabertura e datasChave.reabertura.houve ≠ true");
  if ((papeis.has("leads-downsell") || papeis.has("vendas-downsell")) && d.downsell?.houve !== true) {
    problemas.push("há etapa com papel de downsell e datasChave.downsell.houve ≠ true");
  }
  return resultado("F10", problemas, `início ${d.inicioCaptacao} ≤ abertura ${d.aberturaCarrinho} ≤ fim ${d.fimCarrinho}; reabertura e downsell respondidos`);
}

/** F10 no modo em andamento (49.12 AC2/AC9): cada fase com data válida OU "ainda não aconteceu" — nunca as duas, nunca nenhuma. */
function checarF10EmAndamento(cfg: Extract<DebriefingPayload["config"], { situacaoDoLancamento: "em-andamento" }>): ResultadoInvarianteFase12 {
  const d = cfg.datasChave;
  const aindaNao = new Set<string>(Array.isArray(cfg.aindaNaoAconteceu) ? cfg.aindaNaoAconteceu : []);
  const problemas: string[] = [];
  if (typeof d.inicioCaptacao !== "string" || !dataExiste(d.inicioCaptacao)) problemas.push(`inicioCaptacao ausente ou inválida (${String(d.inicioCaptacao)})`);
  for (const [nome, v] of [["aberturaCarrinho", d.aberturaCarrinho], ["fimCarrinho", d.fimCarrinho]] as const) {
    if (aindaNao.has(nome)) {
      if (v !== null) problemas.push(`${nome} = ${String(v)} e também "ainda não aconteceu"`);
    } else if (typeof v !== "string" || !dataExiste(v)) {
      problemas.push(`${nome} ausente ou inválida (${String(v)}) sem "ainda não aconteceu"`);
    }
  }
  const presentes = [d.inicioCaptacao, d.aberturaCarrinho, d.fimCarrinho].filter((v): v is string => typeof v === "string" && dataExiste(v));
  for (let i = 1; i < presentes.length; i++) {
    if (presentes[i - 1]! > presentes[i]!) problemas.push(`fora de ordem: ${presentes[i - 1]} > ${presentes[i]} (início ≤ abertura ≤ fim, entre as que existem)`);
  }
  for (const nome of ["reabertura", "downsell"] as const) {
    const r = d[nome] as { houve?: unknown; abertura?: string; fim?: string } | null | undefined;
    if (aindaNao.has(nome)) {
      if (r) problemas.push(`${nome} respondida e também "ainda não aconteceu"`);
      continue;
    }
    if (!r || typeof r.houve !== "boolean") {
      problemas.push(`${nome} sem resposta explícita (houve indefinido, sem "ainda não aconteceu")`);
      continue;
    }
    if (r.houve === true) {
      if (!r.abertura || !r.fim || !dataExiste(r.abertura) || !dataExiste(r.fim)) problemas.push(`${nome} com houve = true sem abertura/fim válidas`);
      else if (r.abertura > r.fim) problemas.push(`${nome}: abertura ${r.abertura} > fim ${r.fim}`);
    }
  }
  const papeis = new Set(cfg.etapas.map((e) => e.papel));
  const ok = (nome: "reabertura" | "downsell") => d[nome]?.houve === true || aindaNao.has(nome);
  if (papeis.has("reabertura") && !ok("reabertura")) problemas.push("há etapa com papel reabertura e datasChave.reabertura nem houve nem \"ainda não aconteceu\"");
  if ((papeis.has("leads-downsell") || papeis.has("vendas-downsell")) && !ok("downsell")) {
    problemas.push("há etapa com papel de downsell e datasChave.downsell nem houve nem \"ainda não aconteceu\"");
  }
  const rot = (v: string | null, campo: string) => (v ?? (aindaNao.has(campo) ? "ainda não aconteceu" : "—"));
  return resultado(
    "F10",
    problemas,
    `lançamento em andamento: início ${d.inicioCaptacao} · abertura ${rot(d.aberturaCarrinho, "aberturaCarrinho")} · fim ${rot(d.fimCarrinho, "fimCarrinho")}; reabertura e downsell respondidos (ou "ainda não aconteceu")`,
  );
}

/**
 * 49.15: a falta de ad-level só pesa quando a dimensão de tipo de criativo é
 * EXIBIDA — o mesmo `tipoDeCriativo.aplicavel` com que o render decide montar a
 * tabela "Criativo por tipo" e a lacuna "Mídia por criativo indisponível". Com
 * `dimensaoDeCriativo = "nenhuma"` o Motor II marca o fato (`adLevel.motivo =
 * SEM_AD_LEVEL`) mas não registra a lacuna, porque nada do documento lê o
 * ad-level; exigi-la na F11 dava 422 em toda geração. Vale para a F11
 * (`lacunasExigidas`) e para o WF9.
 */
export function semAdLevelNaDimensaoExibida(p: DebriefingPayload): boolean {
  const tc = p.publico.tipoDeCriativo;
  return tc.aplicavel && tc.adLevel.motivo === "SEM_AD_LEVEL";
}

/** As lacunas que o payload EXIGE, cada uma com o porquê. */
export function lacunasExigidas(p: DebriefingPayload): { codigo: CodigoDeLacunaDoDebriefing; porque: string; itens?: string[] }[] {
  const m = p.dinheiroTempo;
  const a = p.publico;
  const exigidas: { codigo: CodigoDeLacunaDoDebriefing; porque: string; itens?: string[] }[] = [
    { codigo: "LISTAS_FRONT_COMUNIDADE", porque: "sempre (sem fonte de listas no Loyola)" },
    { codigo: "LEADS_DO_PAINEL", porque: "sempre (o resumo não tem o # Leads oficial do debriefing diário)" },
  ];
  if (m.coorte.foraDaCoorte.length > 0) exigidas.push({ codigo: "VENDAS_SEM_DATA", porque: `${int(m.coorte.foraDaCoorte.length)} venda(s) fora da coorte` });
  if (semAdLevelNaDimensaoExibida(p)) exigidas.push({ codigo: "SEM_AD_LEVEL", porque: "sem ad-level no período" });
  if (m.higiene.linhasConvertidas > 0) {
    exigidas.push({ codigo: "PRECO_ORIGINAL_NAO_MAPEADO", porque: `${int(m.higiene.linhasConvertidas)} linha(s) em moeda estrangeira convertida(s)` });
  }
  if (a.crossLaunch.tipoDaBase === "compradores") exigidas.push({ codigo: "BASE_ANTERIOR_SEM_LEADS", porque: "base anterior só com compradores" });
  if (m.vendasExcluidas.length > 0) {
    exigidas.push({ codigo: "VENDAS_EXCLUIDAS_AUTOMATICAMENTE", porque: `${int(m.vendasExcluidas.length)} venda(s) do principal antes da abertura` });
  }
  // 49.12 (AC6): carrinho fechado no corte — o que depende dele é lacuna nomeada, item a item.
  const semCarrinho = corteSemCarrinho(m.janela);
  if (semCarrinho) {
    exigidas.push({
      codigo: LACUNA_CARRINHO_AINDA_NAO_ABRIU,
      porque: `carrinho ainda não abriu até o corte ${semCarrinho.dia} (D+${int(semCarrinho.dMaisN)})`,
      itens: [...ITENS_DA_LACUNA_DO_CARRINHO],
    });
  }
  if (m.higiene.dedupNaoAplicada.length > 0) {
    exigidas.push({ codigo: "DEDUP_POR_ID_NAO_APLICADA", porque: `${int(m.higiene.dedupNaoAplicada.length)} planilha(s) sem ID/produto mapeado` });
  }
  if (a.dimensoesNaoConfirmadas.length > 0) {
    const itens = [...new Set(a.dimensoesNaoConfirmadas.map((d) => d.campo))];
    exigidas.push({ codigo: LACUNA_DIMENSAO_NAO_CONFIRMADA, porque: `${int(itens.length)} dimensão(ões) não confirmada(s)`, itens });
  }
  // 49.11 (R6-7): etapa com 2+ pesquisas, sem a de captação marcada, e resposta repetida decidida sem data.
  if (a.pesquisa.duplicadasSemData > 0) {
    const porEtapa = new Map<string, string[]>();
    for (const pp of a.pesquisa.porPesquisa) porEtapa.set(pp.stageId, [...(porEtapa.get(pp.stageId) ?? []), pp.pesquisaId]);
    const marcadas = p.config.pesquisaDeCaptacaoPorEtapa ?? {};
    for (const [stageId, ids] of porEtapa) {
      const marcada = marcadas[stageId];
      if (ids.length >= 2 && !(marcada && ids.includes(marcada))) {
        exigidas.push({
          codigo: "DESEMPATE_SEM_PESQUISA_DE_CAPTACAO",
          porque: `etapa ${stageId} com ${int(ids.length)} pesquisas sem a de captação marcada e ${int(a.pesquisa.duplicadasSemData)} repetida(s) decidida(s) sem data`,
        });
        break;
      }
    }
  }
  return exigidas;
}

/** F11 — lacunas listadas (check 11 + M3). */
export function checarF11(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const presentes = new Map(p.lacunas.map((l) => [l.codigo, l]));
  const problemas: string[] = [];
  const exigidas = lacunasExigidas(p);
  for (const e of exigidas) {
    const l = presentes.get(e.codigo);
    if (!l) {
      problemas.push(`lacuna ${e.codigo} ausente em lacunas[] (${e.porque})`);
      continue;
    }
    for (const item of e.itens ?? []) {
      if (!(l.itens ?? []).includes(item)) problemas.push(`lacuna ${e.codigo} não cita "${item}"`);
    }
  }
  const codigos = p.lacunas.map((l) => l.codigo);
  const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
  for (const c of new Set(repetidos)) problemas.push(`lacuna ${c} repetida em lacunas[] (a união é por código)`);
  return resultado("F11", problemas, `${int(exigidas.length)} lacuna(s) exigida(s), todas presentes: ${exigidas.map((e) => e.codigo).join(", ")}`);
}

const agregadosDeMidia = (m: DebriefingMoneyTime): [string, MidiaAgregada][] => [
  ...Object.entries(m.midia.porEtapa).map(([k, v]) => [`etapa ${k}`, v] as [string, MidiaAgregada]),
  ...Object.entries(m.midia.porGrupo).map(([k, v]) => [`grupo ${k}`, v] as [string, MidiaAgregada]),
];

/** F12 — imposto UMA vez, por dia, recomposto do spend cru (decisão ✅2, resolução 6). */
export function checarF12(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const pct = m.imposto.impostoPct;
  const problemas: string[] = [];
  if (m.imposto.impostoAplicadoPor !== "motor") problemas.push(`impostoAplicadoPor = "${String(m.imposto.impostoAplicadoPor)}" (só o motor aplica)`);
  if (!(pct >= 0 && pct < 1)) {
    return falhou("F12", [...problemas, `impostoPct fora de [0, 1): ${String(pct)}`]);
  }
  if (!dentroRelativo(m.imposto.fatorImposto, 1 / (1 - pct), TOLERANCIAS_FASE12.impostoRelativo)) {
    problemas.push(`fatorImposto ${num(m.imposto.fatorImposto)} ≠ 1 ÷ (1 − ${num(pct)}) = ${num(1 / (1 - pct))}`);
  }
  for (const d of m.midia.midiaDiariaPorEtapa) {
    const esperado = aplicarImposto(d.bruto, d.dia, pct);
    if (!dentroRelativo(d.comImposto, esperado, TOLERANCIAS_FASE12.impostoRelativo)) {
      problemas.push(`etapa ${d.stageId} em ${d.dia}: com imposto ${fmtReais(d.comImposto)} ≠ aplicarImposto(bruto ${fmtReais(d.bruto)}) ${fmtReais(esperado)}`);
    }
  }
  for (const [stageId, e] of Object.entries(m.midia.porEtapa)) {
    const dias = m.midia.midiaDiariaPorEtapa.filter((d) => d.stageId === stageId);
    const esperado = soma(dias.map((d) => aplicarImposto(d.bruto, d.dia, pct)));
    if (!dentroRelativo(e.investimentoComImposto, esperado, TOLERANCIAS_FASE12.impostoRelativo)) {
      problemas.push(`etapa ${stageId}: investimentoComImposto ${fmtReais(e.investimentoComImposto)} ≠ Σ_dia aplicarImposto(bruto) ${fmtReais(esperado)}`);
    }
    const bruto = soma(dias.map((d) => d.bruto));
    if (!dentro(e.investimentoBruto, bruto, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`etapa ${stageId}: investimentoBruto ${fmtReais(e.investimentoBruto)} ≠ Σ bruto diário ${fmtReais(bruto)}`);
    }
  }
  for (const [rotulo, ag] of agregadosDeMidia(m)) {
    const q = ag.quenteFrio;
    if (!dentro(q.INV_QUENTE + q.INV_FRIO + q.INV_INDEFINIDO, q.INV, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`${rotulo}: INV_QUENTE ${fmtReais(q.INV_QUENTE)} + INV_FRIO ${fmtReais(q.INV_FRIO)} + INV_INDEFINIDO ${fmtReais(q.INV_INDEFINIDO)} ≠ INV ${fmtReais(q.INV)}`);
    }
    if (!dentro(q.INV, ag.investimentoComImposto, TOLERANCIAS_FASE12.dinheiro)) {
      problemas.push(`${rotulo}: INV ${fmtReais(q.INV)} ≠ investimentoComImposto ${fmtReais(ag.investimentoComImposto)}`);
    }
  }
  const invTotal = soma(GRUPOS_HEADLINE.map((g) => m.midia.porGrupo[g].investimentoComImposto));
  if (m.midia.investimentoTotal.valor === null || !dentro(m.midia.investimentoTotal.valor, invTotal, TOLERANCIAS_FASE12.dinheiro)) {
    problemas.push(`investimentoTotal ${num(m.midia.investimentoTotal.valor)} ≠ captação + principal + downsell ${fmtReais(invTotal)}`);
  }
  return resultado(
    "F12",
    problemas,
    `imposto ${fmtNumero(pct * 100, 2)}% aplicado uma vez, por dia, pelo motor (${int(m.midia.midiaDiariaPorEtapa.length)} etapa×dia recompostos); quente + frio + indefinido = INV`,
  );
}

/** F13 — CTR/CPC sempre de `link_click`; ausente = null (decisão ✅2). */
export function checarF13(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  const igual = (a: number | null, b: number | null) =>
    a === null || b === null ? a === b : dentroRelativo(a, b, TOLERANCIAS_FASE12.razao);
  for (const [rotulo, ag] of agregadosDeMidia(m)) {
    const ctr = ctrDeLink(ag.linkClicks, ag.impressoes);
    const cpc = cpcDeLink(ag.linkClicks, ag.investimentoComImposto);
    if (!igual(ag.ctr.valor, ctr)) problemas.push(`${rotulo}: ctr ${num(ag.ctr.valor)} ≠ ctrDeLink(link_click ${num(ag.linkClicks)}, impressões ${int(ag.impressoes)}) ${num(ctr)}`);
    if (!igual(ag.cpc.valor, cpc)) problemas.push(`${rotulo}: cpc ${num(ag.cpc.valor)} ≠ cpcDeLink(link_click ${num(ag.linkClicks)}, investimento ${fmtReais(ag.investimentoComImposto)}) ${num(cpc)}`);
    if (ag.linkClicks === null && (ag.ctr.valor !== null || ag.cpc.valor !== null)) {
      problemas.push(`${rotulo}: sem link_click e ctr/cpc preenchidos (${num(ag.ctr.valor)}/${num(ag.cpc.valor)}) — fallback proibido`);
    }
  }
  return resultado("F13", problemas, "CTR e CPC = ctrDeLink/cpcDeLink dos campos crus em toda etapa e grupo; sem link_click = null");
}

/**
 * F14 — produto da captação sem papel resolvido (armadilha #3).
 *
 * Regra do painel (`tipoDoProdutoNaVenda`, `routes/stage-sales-data.ts`): produto
 * fora do mapa numa etapa de captação paga É o ingresso (a UI não grava
 * `ingresso`, que é o padrão). Bloquear todo produto fora do mapa bloquearia
 * para sempre; bloqueia só o que o default não resolve — o produto cujas vendas
 * caíram num tipo que não é de captação (`tiposAssumidos` fora de `ingresso`).
 */
export function checarF14(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const lista = p.dinheiroTempo.produtosNaoClassificados;
  const ambiguos = lista.filter((x) => x.tiposAssumidos.length === 0 || x.tiposAssumidos.some((t) => t !== "ingresso"));
  if (ambiguos.length > 0) {
    return falhou(
      "F14",
      ambiguos.map(
        (x) => `"${x.produto}" (${int(x.vendas)} venda(s), ${fmtReais(x.faturamento)}) fora do mapa de produtos e assumido como ${x.tiposAssumidos.join("/") || "nenhum tipo"} na captação`,
      ),
    );
  }
  return passou(
    "F14",
    lista.length === 0
      ? "todo produto da captação classificado no mapa de produtos"
      : `${int(lista.length)} produto(s) fora do mapa assumido(s) como ingresso pela regra padrão do painel: ${lista.map((x) => `"${x.produto}" (${int(x.vendas)})`).join(", ")}`,
  );
}

/** F15 — todo valor monetário lido da célula crua (R-49-4). */
export function checarF15(p: DebriefingPayload): ResultadoInvarianteFase12 {
  const m = p.dinheiroTempo;
  const problemas: string[] = [];
  for (const [grupo, origem] of Object.entries(m.origemDoValor)) {
    if (origem !== "celula-crua") problemas.push(`origemDoValor.${grupo} = "${String(origem)}" (tem de ser "celula-crua")`);
  }
  if (m.vendasManuais.origemDoValor !== "manual_sales.value") {
    problemas.push(`vendasManuais.origemDoValor = "${String(m.vendasManuais.origemDoValor)}" (tem de ser "manual_sales.value", decisão 3A)`);
  }
  if (p.publico.origemDoValor.investimentoPorTipoDeCriativo !== "meta_ad_insights_daily.spend") {
    problemas.push(`publico.origemDoValor.investimentoPorTipoDeCriativo = "${String(p.publico.origemDoValor.investimentoPorTipoDeCriativo)}"`);
  }
  return resultado("F15", problemas, "todo grupo monetário de planilha com origemDoValor = celula-crua");
}

const CHECAGENS: readonly ((p: DebriefingPayload) => ResultadoInvarianteFase12)[] = [
  checarF1, checarF2, checarF3, checarF4, checarF5, checarF6, checarF7, checarF8,
  checarF9, checarF10, checarF11, checarF12, checarF13, checarF14, checarF15,
];

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export function coletarAlertasDebriefing(p: DebriefingPayload): AlertaFase12[] {
  const m = p.dinheiroTempo;
  const a = p.publico;
  const alertas: AlertaFase12[] = [];

  const semFase = m.pendencias.filter((x) => x.codigo === "CAMPANHA_SEM_FASE" || x.codigo === "CAMPANHA_SEM_PUBLICO");
  if (semFase.length > 0) {
    alertas.push({
      codigo: "WF1",
      quantidade: semFase.length,
      mensagem: `${int(semFase.length)} campanha(s) sem fase/público reconhecível: ${semFase.map((x) => `${x.campaignName ?? x.campaignId ?? "?"} (${x.codigo}${x.investimentoComImposto != null ? `, ${fmtReais(x.investimentoComImposto)}` : ""})`).join("; ")}`,
    });
  }

  const contaminados = Object.entries(m.higiene.precoDistintoPorProduto).filter(([, n]) => n > LIMIARES_ALERTA.precosDistintos);
  if (contaminados.length > 0) {
    alertas.push({
      codigo: "WF2",
      quantidade: contaminados.length,
      mensagem: `${int(contaminados.length)} produto(s) com mais de ${LIMIARES_ALERTA.precosDistintos} preços distintos (coluna de preço contaminada?): ${contaminados.map(([prod, n]) => `${prod} (${int(n)})`).join("; ")}`,
    });
  }

  if (m.higiene.linhasConvertidas > 0) {
    const lac = m.lacunas.find((l) => l.codigo === "PRECO_ORIGINAL_NAO_MAPEADO");
    alertas.push({
      codigo: "WF3",
      quantidade: m.higiene.linhasConvertidas,
      mensagem: `${int(m.higiene.linhasConvertidas)} linha(s) em moeda estrangeira convertida(s) pelo preço modal${lac?.detalhe ? ` — ${lac.detalhe}` : ""}`,
    });
  }

  const tr = a.taxaDeResposta.valor;
  if (tr !== null && tr < LIMIARES_ALERTA.taxaResposta) {
    alertas.push({
      codigo: "WF4",
      quantidade: 1,
      mensagem: `taxa de resposta da pesquisa ${fmtNumero(tr, 2)}% (${int(a.taxaDeResposta.numerador)} de ${int(a.taxaDeResposta.denominador)} compradores de captação) abaixo de ${LIMIARES_ALERTA.taxaResposta}%`,
    });
  }

  const semLink = Object.entries(m.midia.porEtapa).filter(([, e]) => e.linkClicks === null && (e.investimentoComImposto > 0 || e.impressoes > 0));
  if (semLink.length > 0) {
    alertas.push({
      codigo: "WF5",
      quantidade: semLink.length,
      mensagem: `${int(semLink.length)} etapa(s) sem link_click (CTR/CPC "—"): ${semLink.map(([k, e]) => `${k} (${e.papel}, ${fmtReais(e.investimentoComImposto)})`).join("; ")}`,
    });
  }

  // WF6: os dias sinalizados E os que o limiar diz que deveriam estar (pico não sinalizado = armadilha #10).
  const limiar = m.limiarPicoArtefato.limiarPicoArtefato;
  const sinalizados = m.roasDiarioCaptacao.filter((d) => d.picoArtefato);
  const naoSinalizados = m.roasDiarioCaptacao.filter(
    (d) => !d.picoArtefato && !d.diaSemGasto && d.investimento > 0 && limiar !== null && d.investimento < limiar,
  );
  if (sinalizados.length + naoSinalizados.length > 0) {
    const fmt = (d: (typeof sinalizados)[number]) => `D+${int(d.dMais)} (${d.dia}, investimento ${fmtReais(d.investimento)}, ROAS ${num(d.roas)})`;
    alertas.push({
      codigo: "WF6",
      quantidade: sinalizados.length + naoSinalizados.length,
      mensagem:
        `${int(sinalizados.length)} dia(s) de ROAS diário com pico-artefato (investimento < ${limiar === null ? "—" : fmtReais(limiar)}, 10% da média diária)` +
        (sinalizados.length ? `: ${sinalizados.map(fmt).join("; ")}` : "") +
        (naoSinalizados.length ? ` — ${int(naoSinalizados.length)} dia(s) abaixo do limiar NÃO sinalizado(s) pelo motor: ${naoSinalizados.map(fmt).join("; ")}` : ""),
    });
  }

  const alem = m.coorte.alemDaJanela;
  const fora = m.coorte.foraDaCoorte;
  const excl = m.vendasExcluidas;
  if (alem.length + fora.length + excl.length > 0) {
    const valor = (xs: readonly { valor: number }[]) => fmtReais(soma(xs.map((x) => x.valor)));
    alertas.push({
      codigo: "WF7",
      quantidade: alem.length + fora.length + excl.length,
      mensagem:
        `vendas fora da leitura da coorte: além da janela ${int(alem.length)} (${valor(alem)}), fora da coorte ${int(fora.length)} (${valor(fora)}), ` +
        `excluídas automaticamente antes da abertura ${int(excl.length)} (${valor(excl)})`,
    });
  }

  const amostra = [
    ...a.faixa.conversaoPorFaixa.filter((l) => l.amostraBaixa && l.n > 0).map((l) => `faixa ${l.faixa} (n=${int(l.n)})`),
    ...a.conversaoPorSegmento.filter((l) => l.amostraBaixa && l.n > 0).map((l) => `segmento ${l.segmento} (n=${int(l.n)})`),
    ...a.criativoXFaixa.criativos.filter((c) => c.amostraBaixa && c.n > 0).map((c) => `criativo ${c.nome} (n=${int(c.n)})`),
  ];
  const semFaixa = a.faixa.distribuicao.semFaixa ?? 0;
  const dnc = a.dimensoesNaoConfirmadas.map((d) => d.campo);
  if (amostra.length > 0 || semFaixa > 0 || dnc.length > 0) {
    const partes: string[] = [];
    if (amostra.length) partes.push(`${int(amostra.length)} recorte(s) com amostra baixa: ${amostra.join("; ")}`);
    if (semFaixa > 0) partes.push(`${int(semFaixa)} respondente(s) sem faixa`);
    if (dnc.length) partes.push(`dimensões não confirmadas: ${dnc.join(", ")}`);
    alertas.push({ codigo: "WF8", quantidade: amostra.length + (semFaixa > 0 ? 1 : 0) + dnc.length, mensagem: partes.join(" · ") });
  }

  const semAdLevel = semAdLevelNaDimensaoExibida(p);
  const conflitos = a.tipoDeCriativo.conflitosDeTipo;
  if (semAdLevel || conflitos.length > 0) {
    const partes: string[] = [];
    if (semAdLevel) partes.push("sem ad-level no período (CTR, CPC e custo por tipo de criativo não medidos)");
    if (conflitos.length) partes.push(`${int(conflitos.length)} criativo(s) com conflito de tipo: ${conflitos.map((c) => `${c.adName} (${c.motivo})`).join("; ")}`);
    alertas.push({ codigo: "WF9", quantidade: (semAdLevel ? 1 : 0) + conflitos.length, mensagem: partes.join(" · ") });
  }

  return alertas;
}

// ---------------------------------------------------------------------------
// Conferência externa
// ---------------------------------------------------------------------------

export function conferirInvestimentoOficial(p: DebriefingPayload, investimentoOficial: number | null | undefined): ConferenciaExterna {
  const m = p.dinheiroTempo;
  const calculado = m.midia.investimentoTotal.valor ?? soma(GRUPOS_HEADLINE.map((g) => m.midia.porGrupo[g].investimentoComImposto));
  if (investimentoOficial == null) {
    return {
      status: "skipped",
      investimentoCalculado: calculado,
      investimentoOficial: null,
      delta: null,
      detalhe: "conferência externa pulada — nenhum investimento oficial informado (nunca derivado de outra fonte)",
    };
  }
  if (!(investimentoOficial > 0)) {
    return {
      status: "failed",
      investimentoCalculado: calculado,
      investimentoOficial,
      delta: null,
      detalhe: `investimento oficial informado inválido (${String(investimentoOficial)})`,
    };
  }
  const delta = Math.abs(calculado - investimentoOficial) / investimentoOficial;
  const base = `calculado ${fmtReais(calculado)} × oficial ${fmtReais(investimentoOficial)} — delta ${fmtNumero(delta * 100, 4)}%`;
  if (delta > LIMIAR_CONFERENCIA.bloqueio) {
    return { status: "failed", investimentoCalculado: calculado, investimentoOficial, delta, detalhe: `${base} > ${fmtNumero(LIMIAR_CONFERENCIA.bloqueio * 100, 2)}%` };
  }
  if (delta > LIMIAR_CONFERENCIA.alerta) {
    return { status: "alerta", investimentoCalculado: calculado, investimentoOficial, delta, detalhe: `${base} — acima de ${fmtNumero(LIMIAR_CONFERENCIA.alerta * 100, 2)}%, abaixo do bloqueio` };
  }
  return { status: "passed", investimentoCalculado: calculado, investimentoOficial, delta, detalhe: base };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function validateDebriefing(p: DebriefingPayload, opts: ValidateDebriefingOptions = {}): DebriefingGuardResult {
  const invariantes = CHECAGENS.map((checar) => checar(p));
  const alertas = coletarAlertasDebriefing(p);
  const conferencia = conferirInvestimentoOficial(p, opts.investimentoOficial);
  const violacoes = invariantes.filter((i) => i.status === "failed");
  return {
    invariantes,
    alertas,
    conferencia,
    bloqueado: violacoes.length > 0 || conferencia.status === "failed",
    violacoes,
  };
}

/** Lança quando `bloqueado`: invariante primeiro (o 1º na ordem F1→F15), depois a conferência externa. */
export function assertDebriefing(p: DebriefingPayload, opts: ValidateDebriefingOptions = {}): DebriefingGuardResult {
  const r = validateDebriefing(p, opts);
  const primeira = r.violacoes[0];
  if (primeira) throw new DebriefingInvarianteVioladoError(primeira.codigo, primeira.detalhe, primeira.acao, r.violacoes);
  if (r.conferencia.status === "failed") throw new ConferenciaExternaError(r.conferencia.detalhe, ACAO_CONFERENCIA, r.conferencia);
  return r;
}
