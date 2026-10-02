/**
 * Story 49.5 — comparador do payload do Debriefing contra fixtures de oráculo,
 * com a separação do fator de imposto (AC7/AC8).
 *
 * Decisão 1 do dono (2026-09-30): o número do Loyola GOVERNA (`papel:
 * "governante"`); o da skill `loyola-debriefing` é só COMPARAÇÃO (`papel:
 * "comparacao"`) — `diverge` contra ele é relatório e nunca bloqueia.
 *
 * O fator K = (1 ÷ (1 − impostoPct)) ÷ fatorImpostoDaFonte só se aplica às
 * classes de CUSTO (`custo` ×K, `razao-de-custo` ÷K). Volume, dinheiro e taxa de
 * volume são exatos (ou na tolerância da classe): o imposto não os absolve.
 * Com K ≠ 1, custo que bate com o valor ORIGINAL da fonte é `diverge` — é o
 * motor usando o fator da skill no lugar do gross-up do Loyola (decisão ✅2).
 *
 * Classificar uma divergência (`fonte-janela` | `definicao` | `bug`) é ATO
 * HUMANO, gravado na fixture — o comparador nunca infere.
 *
 * **Puro.**
 */

import type { DebriefingPayload } from "./debriefing-payload.js";
import type { GrupoDaEtapa } from "./debriefing-money-time-engine.js";

// ---------------------------------------------------------------------------
// Formato da fixture
// ---------------------------------------------------------------------------

export type PapelDoOraculo = "governante" | "comparacao";
export type ClasseDaMetrica = "volume" | "dinheiro" | "taxa-de-volume" | "custo" | "razao-de-custo";
export type UnidadeDaMetrica = "contagem" | "BRL" | "pct" | "razao";
export type CausaDaDivergencia = "fonte-janela" | "definicao" | "bug";

export const SEM_CAMPO_EQUIVALENTE = "SEM_CAMPO_EQUIVALENTE" as const;

export interface OraculoDaFixture {
  id: "skill-export-cru" | "loyola-epic41";
  papel: PapelDoOraculo;
  fonte: string;
  janela: { de: string; ate: string };
  reconferidoEm: string;
}

export interface MetricaDaFixture {
  chave: string;
  valor: number;
  unidade: UnidadeDaMetrica;
  classe: ClasseDaMetrica;
  /** `"<arquivo> §<seção> linha '<rótulo>'"`. */
  origem: string;
  /** Campo do payload (`CAMPOS_COMPARAVEIS`) ou `SEM_CAMPO_EQUIVALENTE` (fora da comparação, listada no relatório). */
  mapeamento: string;
  /** Casas decimais do valor na fonte (taxas e razões) — a tolerância é meia unidade da última casa. Default 2. */
  casas?: number;
  nota?: string;
}

export interface DivergenciaClassificada {
  chave: string;
  causa: CausaDaDivergencia;
  nota: string;
  classificadaPor: string;
  data: string;
}

export interface FixtureDeDebriefing {
  id: string;
  expert: string;
  lancamento: string;
  oraculo: OraculoDaFixture;
  /** Fator de imposto que a FONTE aplicou ao custo (o fator fixo da skill); `"loyola"` = já com o gross-up do Loyola (K = 1). */
  fatorImpostoDaFonte: number | "loyola";
  /** Datas-chave do lançamento, quando conhecidas (o script de conferência as mostra). */
  datasChave?: { inicioCaptacao: string; aberturaCarrinho: string; fimCarrinho: string; downsell?: { abertura: string; fim: string } };
  metricas: MetricaDaFixture[];
  divergenciasClassificadas?: DivergenciaClassificada[];
}

// ---------------------------------------------------------------------------
// Campos do payload que uma fixture pode mapear
// ---------------------------------------------------------------------------

export interface CampoComparavel {
  unidade: UnidadeDaMetrica;
  descricao: string;
  extrair: (p: DebriefingPayload) => number | null;
}

const HEADLINE: readonly GrupoDaEtapa[] = ["captacao", "principal", "downsell"];
const CANAIS_PAGOS = new Set(["Pago Quente", "Pago Frio", "Pago N/D"]);
const somar = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (v: number | null | undefined) => (v == null ? null : v * 100);

function somaNulavel(xs: readonly (number | null)[]): number | null {
  const com = xs.filter((x): x is number => x !== null);
  return com.length === 0 ? null : somar(com);
}

function canal(nome: string, campo: "ingressos" | "vendas") {
  return (p: DebriefingPayload) => p.dinheiroTempo.tabela1.canais.find((c) => c.canal === nome)?.[campo] ?? 0;
}

/**
 * Vocabulário do mapeamento fixture → payload. A unidade é a do valor
 * devolvido (percentuais já ×100) — o teste de formato exige que bata com a da
 * métrica da fixture.
 */
export const CAMPOS_COMPARAVEIS: Readonly<Record<string, CampoComparavel>> = {
  ingressosUnicos: { unidade: "contagem", descricao: "compradores de captação (porEmail, headline)", extrair: (p) => p.dinheiroTempo.ingressosUnicos },
  "compradoresUnicos.porEmailOuTelefone": {
    unidade: "contagem",
    descricao: "compradores de captação, e-mail OU telefone (comparação com a skill)",
    extrair: (p) => p.dinheiroTempo.captacao.compradoresUnicos.porEmailOuTelefone,
  },
  "compradoresUnicos.porEmail": { unidade: "contagem", descricao: "compradores de captação, só e-mail", extrair: (p) => p.dinheiroTempo.captacao.compradoresUnicos.porEmail },
  vendasCaptacao: {
    unidade: "contagem",
    descricao: "vendas da etapa de captação (todas as linhas, depois das duas camadas de dedup e da janela)",
    extrair: (p) => somar(Object.values(p.dinheiroTempo.captacao.vendasPorTipo)),
  },
  "vendasCaptacao.ingressoMaisCombo": {
    unidade: "contagem",
    descricao: "vendas de ingresso + combo",
    extrair: (p) => p.dinheiroTempo.captacao.vendasPorTipo.ingresso + p.dinheiroTempo.captacao.vendasPorTipo.combo,
  },
  "vendasCaptacao.combo": { unidade: "contagem", descricao: "vendas de combo", extrair: (p) => p.dinheiroTempo.captacao.vendasPorTipo.combo },
  "vendasCaptacao.orderBump": { unidade: "contagem", descricao: "vendas de order bump", extrair: (p) => p.dinheiroTempo.captacao.vendasPorTipo.order_bump },
  comOrderBump: { unidade: "contagem", descricao: "compradores de captação que levaram order bump", extrair: (p) => p.dinheiroTempo.captacao.comOrderBump },
  faturamentoCaptacao: {
    unidade: "BRL",
    descricao: "faturamento da etapa de captação (ingresso + combo + order bump)",
    extrair: (p) => p.dinheiroTempo.captacao.faturamentoCaptacao.valor,
  },
  faturamentoIngressoMaisCombo: {
    unidade: "BRL",
    descricao: "faturamento de ingresso + combo (\"captação (R$)\" do Resumão)",
    extrair: (p) => somaNulavel([p.dinheiroTempo.captacao.faturamentoIngresso.valor, p.dinheiroTempo.captacao.faturamentoCombo.valor]),
  },
  faturamentoIngresso: { unidade: "BRL", descricao: "faturamento de ingresso", extrair: (p) => p.dinheiroTempo.captacao.faturamentoIngresso.valor },
  faturamentoCombo: { unidade: "BRL", descricao: "faturamento de combo", extrair: (p) => p.dinheiroTempo.captacao.faturamentoCombo.valor },
  faturamentoOrderBump: { unidade: "BRL", descricao: "faturamento de order bump", extrair: (p) => p.dinheiroTempo.captacao.faturamentoOrderBump.valor },
  ticketCaptacao: { unidade: "BRL", descricao: "ticket da captação", extrair: (p) => p.dinheiroTempo.captacao.ticketCaptacao.valor },
  pctComTierSuperior: { unidade: "pct", descricao: "% de compradores com combo ou order bump", extrair: (p) => pct(p.dinheiroTempo.captacao.comTierSuperior.valor) },
  vendasPrincipal: { unidade: "contagem", descricao: "vendas do principal (TMB incluso)", extrair: (p) => p.dinheiroTempo.vendasPrincipal },
  faturamentoPrincipal: { unidade: "BRL", descricao: "faturamento do principal s/ TMB", extrair: (p) => p.dinheiroTempo.faturamentoPrincipal.valor },
  faturamentoDownsell: { unidade: "BRL", descricao: "faturamento do downsell", extrair: (p) => p.dinheiroTempo.faturamentoPorEtapa.downsell },
  faturamentoTotalSemTmb: {
    unidade: "BRL",
    descricao: "captação + principal + downsell s/ TMB (numerador do ROAS total)",
    extrair: (p) => p.dinheiroTempo.roasTotalSemTmb.numerador,
  },
  "tmb.vendas": { unidade: "contagem", descricao: "vendas via TMB", extrair: (p) => p.dinheiroTempo.tmb.vendas },
  "tmb.vendasNoPrincipal": { unidade: "contagem", descricao: "vendas do principal via TMB", extrair: (p) => p.dinheiroTempo.tmb.vendasNoPrincipal },
  "tmb.valorExcluido": { unidade: "BRL", descricao: "valor das vendas TMB (fora do faturamento)", extrair: (p) => p.dinheiroTempo.tmb.valorExcluido },
  investimentoCaptacao: {
    unidade: "BRL",
    descricao: "investimento de captação com imposto",
    extrair: (p) => p.dinheiroTempo.midia.porGrupo.captacao.investimentoComImposto,
  },
  investimentoTotal: { unidade: "BRL", descricao: "investimento total com imposto (headline)", extrair: (p) => p.dinheiroTempo.roasTotalSemTmb.denominador },
  investimentoTotalBruto: {
    unidade: "BRL",
    descricao: "investimento total SEM imposto (spend cru)",
    extrair: (p) => somar(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].investimentoBruto)),
  },
  impressoesCaptacao: { unidade: "contagem", descricao: "impressões da captação", extrair: (p) => p.dinheiroTempo.midia.porGrupo.captacao.impressoes },
  linkClicksCaptacao: { unidade: "contagem", descricao: "link clicks da captação", extrair: (p) => p.dinheiroTempo.midia.porGrupo.captacao.linkClicks },
  impressoesTotal: { unidade: "contagem", descricao: "impressões do lançamento (headline)", extrair: (p) => somar(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].impressoes)) },
  linkClicksTotal: {
    unidade: "contagem",
    descricao: "link clicks do lançamento (headline)",
    extrair: (p) => somaNulavel(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].linkClicks)),
  },
  ctrTotal: {
    unidade: "pct",
    descricao: "CTR de link do lançamento (headline)",
    extrair: (p) => {
      const lc = somaNulavel(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].linkClicks));
      const imp = somar(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].impressoes));
      return lc === null || imp <= 0 ? null : (lc / imp) * 100;
    },
  },
  shareQuenteTotal: {
    unidade: "pct",
    descricao: "% do investimento em público quente (headline)",
    extrair: (p) => {
      const inv = somar(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].quenteFrio.INV));
      return inv > 0 ? (somar(HEADLINE.map((g) => p.dinheiroTempo.midia.porGrupo[g].quenteFrio.INV_QUENTE)) / inv) * 100 : null;
    },
  },
  cpmCaptacao: { unidade: "BRL", descricao: "CPM da captação", extrair: (p) => p.dinheiroTempo.midia.porGrupo.captacao.cpm.valor },
  pctCompradoresPorCliques: {
    unidade: "pct",
    descricao: "compradores de captação ÷ link clicks da captação",
    extrair: (p) => p.dinheiroTempo.captacao.pctCompradoresPorCliques.valor,
  },
  conversaoIngressoPrincipal: { unidade: "pct", descricao: "vendas do principal ÷ compradores de captação", extrair: (p) => pct(p.dinheiroTempo.conversaoIngressoPrincipal.valor) },
  roasSoIngresso: { unidade: "razao", descricao: "ROAS só ingresso", extrair: (p) => p.dinheiroTempo.roasSoIngresso.valor },
  roasCaptacao: { unidade: "razao", descricao: "ROAS da captação", extrair: (p) => p.dinheiroTempo.roasCaptacao.valor },
  roasTotalSemTmb: { unidade: "razao", descricao: "ROAS total s/ TMB (com downsell, decisão 5)", extrair: (p) => p.dinheiroTempo.roasTotalSemTmb.valor },
  "reabertura.vendas": { unidade: "contagem", descricao: "vendas da reabertura (apêndice)", extrair: (p) => p.dinheiroTempo.apendiceReabertura.vendas },
  "reabertura.faturamento": { unidade: "BRL", descricao: "faturamento da reabertura (apêndice)", extrair: (p) => p.dinheiroTempo.apendiceReabertura.faturamento },
  "reabertura.investimento": { unidade: "BRL", descricao: "investimento da reabertura com imposto", extrair: (p) => p.dinheiroTempo.apendiceReabertura.investimento },
  "referenciaCombinada.faturamento": {
    unidade: "BRL",
    descricao: "faturamento carrinho + reabertura (referência, não headline)",
    extrair: (p) => p.dinheiroTempo.referenciaCombinada.faturamento,
  },
  "referenciaCombinada.investimento": {
    unidade: "BRL",
    descricao: "investimento carrinho + reabertura com imposto (referência)",
    extrair: (p) => p.dinheiroTempo.referenciaCombinada.investimento,
  },
  "referenciaCombinada.roas": { unidade: "razao", descricao: "ROAS carrinho + reabertura (referência)", extrair: (p) => p.dinheiroTempo.referenciaCombinada.roas.valor },
  "fechamento.closer.vendas": { unidade: "contagem", descricao: "vendas do principal fechadas por closer (eixo de fechamento)", extrair: (p) => p.dinheiroTempo.tabela1.fechamento.closer.vendas },
  "canal.semTrackReal.vendas": { unidade: "contagem", descricao: "vendas do principal em Sem track real", extrair: canal("Sem track real", "vendas") },
  "canal.semTrackReal.ingressos": { unidade: "contagem", descricao: "ingressos em Sem track real", extrair: canal("Sem track real", "ingressos") },
  "canal.pagoQuente.ingressos": { unidade: "contagem", descricao: "ingressos Pago Quente", extrair: canal("Pago Quente", "ingressos") },
  "canal.instagramOrganico.ingressos": { unidade: "contagem", descricao: "ingressos Instagram orgânico", extrair: canal("Instagram orgânico", "ingressos") },
  "canal.whatsapp.ingressos": { unidade: "contagem", descricao: "ingressos WhatsApp", extrair: canal("WhatsApp", "ingressos") },
  "canal.outrosOrganicos.ingressos": { unidade: "contagem", descricao: "ingressos Outros orgânicos", extrair: canal("Outros orgânicos", "ingressos") },
  "canal.instagramOrganico.vendas": { unidade: "contagem", descricao: "vendas do principal Instagram orgânico", extrair: canal("Instagram orgânico", "vendas") },
  vendasPrincipalOrigemPaga: {
    unidade: "contagem",
    descricao: "vendas do principal com canal pago",
    extrair: (p) => somar(p.dinheiroTempo.tabela1.canais.filter((c) => CANAIS_PAGOS.has(c.canal)).map((c) => c.vendas)),
  },
  pctVendasPrincipalOrigemPaga: {
    unidade: "pct",
    descricao: "% das vendas do principal com canal pago",
    extrair: (p) => {
      const vp = p.dinheiroTempo.vendasPrincipal;
      const pagas = somar(p.dinheiroTempo.tabela1.canais.filter((c) => CANAIS_PAGOS.has(c.canal)).map((c) => c.vendas));
      return vp > 0 ? (pagas / vp) * 100 : null;
    },
  },
  "faixa.volumeAB": { unidade: "contagem", descricao: "respondentes A+B", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.volumeAB : null) },
  "faixa.pctAB": { unidade: "pct", descricao: "% A+B sobre a pesquisa deduplicada", extrair: (p) => p.publico.faixa.pctAB.valor },
  "faixa.volumeD": { unidade: "contagem", descricao: "respondentes D", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.volumeD : null) },
  "faixa.A": { unidade: "contagem", descricao: "respondentes faixa A", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.distribuicao.A : null) },
  "faixa.B": { unidade: "contagem", descricao: "respondentes faixa B", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.distribuicao.B : null) },
  "faixa.C": { unidade: "contagem", descricao: "respondentes faixa C", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.distribuicao.C : null) },
  "faixa.D": { unidade: "contagem", descricao: "respondentes faixa D", extrair: (p) => (p.publico.faixa.aplicavel ? p.publico.faixa.distribuicao.D : null) },
  "pesquisa.respondentes": { unidade: "contagem", descricao: "respondentes da pesquisa deduplicada", extrair: (p) => p.publico.pesquisa.respondentes },
  "pesquisa.linhasComRespondente": {
    unidade: "contagem",
    descricao: "linhas da pesquisa com respondente, antes da dedup",
    extrair: (p) => p.publico.pesquisa.linhasLidas - p.publico.pesquisa.vazias,
  },
  "crossLaunch.jaEmBaseAnterior.captacao": {
    unidade: "pct",
    descricao: "% dos compradores de captação já na base anterior",
    extrair: (p) => p.publico.crossLaunch.jaEmBaseAnterior.captacao.valor,
  },
  "crossLaunch.jaEmBaseAnterior.captacao.n": {
    unidade: "contagem",
    descricao: "compradores de captação já na base anterior",
    extrair: (p) => {
      const m = p.publico.crossLaunch.jaEmBaseAnterior.captacao;
      return "numerador" in m && typeof m.numerador === "number" ? m.numerador : null;
    },
  },
  "crossLaunch.jaEmBaseAnterior.principal": {
    unidade: "pct",
    descricao: "% dos compradores do principal já na base anterior",
    extrair: (p) => p.publico.crossLaunch.jaEmBaseAnterior.principal.valor,
  },
};

// ---------------------------------------------------------------------------
// Fator K
// ---------------------------------------------------------------------------

/** K = (1 ÷ (1 − impostoPct)) ÷ fator da fonte; fonte `"loyola"` (já com o gross-up do Loyola) ⇒ 1. */
export function fatorK(impostoPct: number, fatorImpostoDaFonte: number | "loyola"): number {
  if (fatorImpostoDaFonte === "loyola") return 1;
  if (!(impostoPct >= 0 && impostoPct < 1)) throw new RangeError(`fatorK: alíquota fora de [0, 1): ${String(impostoPct)}`);
  if (!(fatorImpostoDaFonte > 0)) throw new RangeError(`fatorK: fator da fonte inválido: ${String(fatorImpostoDaFonte)}`);
  return 1 / (1 - impostoPct) / fatorImpostoDaFonte;
}

// ---------------------------------------------------------------------------
// Comparação
// ---------------------------------------------------------------------------

export type StatusDaComparacao = "ok" | "ok-explicada-por-imposto" | "diverge";

export interface LinhaDaComparacao {
  chave: string;
  classe: ClasseDaMetrica;
  unidade: UnidadeDaMetrica;
  mapeamento: string;
  esperadoOriginal: number;
  esperadoAjustado: number;
  obtido: number | null;
  /** `obtido − esperadoAjustado`; `null` quando o payload não tem o valor. */
  delta: number | null;
  status: StatusDaComparacao;
  /** Classificação humana gravada na fixture (só para `diverge`). */
  classificacao?: DivergenciaClassificada;
  nota?: string;
}

export interface ResultadoDaComparacao {
  fixtureId: string;
  papel: PapelDoOraculo;
  K: number;
  impostoPct: number;
  linhas: LinhaDaComparacao[];
  /** Linhas da fixture fora da comparação — listadas, nunca silenciadas. */
  semCampoEquivalente: { chave: string; valor: number; unidade: UnidadeDaMetrica; origem: string; nota?: string }[];
  /** `diverge` sem classificação humana. */
  divergenciasNaoClassificadas: string[];
  /** Só uma fixture `governante` com divergência não classificada falha a conferência. A `comparacao` nunca. */
  bloqueiaConferencia: boolean;
}

/** Tolerância por classe (AC7). Taxas e razões: meia unidade da última casa da fonte (2 casas ⇒ 0,005). */
export function toleranciaDaClasse(classe: ClasseDaMetrica, casas = 2): number {
  switch (classe) {
    case "volume":
      return 0;
    case "dinheiro":
    case "custo":
      return 0.01;
    case "taxa-de-volume":
    case "razao-de-custo":
      return 0.5 * 10 ** -casas;
  }
}

const bate = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-12;

export function compararComFixture(payload: DebriefingPayload, fixture: FixtureDeDebriefing): ResultadoDaComparacao {
  const imposto = payload.dinheiroTempo.imposto;
  const papelEsperado: PapelDoOraculo = fixture.oraculo.id === "loyola-epic41" ? "governante" : "comparacao";
  if (fixture.oraculo.papel !== papelEsperado) {
    throw new Error(`compararComFixture: oráculo ${fixture.oraculo.id} é sempre "${papelEsperado}" (decisão 1 do dono) — ${fixture.id} diz "${fixture.oraculo.papel}"`);
  }
  if (fixture.fatorImpostoDaFonte !== "loyola" && fixture.oraculo.janela.de < imposto.corteDeData) {
    throw new RangeError(
      `compararComFixture: a fixture ${fixture.id} começa em ${fixture.oraculo.janela.de}, antes do corte do gross-up (${imposto.corteDeData}) — K não vale (o Loyola não aplica imposto antes do corte)`,
    );
  }
  const K = fatorK(imposto.impostoPct, fixture.fatorImpostoDaFonte);
  const kNeutro = Math.abs(K - 1) <= 1e-12;
  const classificadas = new Map((fixture.divergenciasClassificadas ?? []).map((d) => [d.chave, d]));

  const linhas: LinhaDaComparacao[] = [];
  const semCampoEquivalente: ResultadoDaComparacao["semCampoEquivalente"] = [];
  for (const mt of fixture.metricas) {
    if (mt.mapeamento === SEM_CAMPO_EQUIVALENTE) {
      semCampoEquivalente.push({ chave: mt.chave, valor: mt.valor, unidade: mt.unidade, origem: mt.origem, ...(mt.nota ? { nota: mt.nota } : {}) });
      continue;
    }
    const campo = CAMPOS_COMPARAVEIS[mt.mapeamento];
    if (!campo) throw new Error(`compararComFixture: mapeamento desconhecido "${mt.mapeamento}" (${fixture.id}/${mt.chave})`);
    if (campo.unidade !== mt.unidade) {
      throw new Error(`compararComFixture: ${fixture.id}/${mt.chave} em ${mt.unidade}, o campo ${mt.mapeamento} é ${campo.unidade}`);
    }
    const obtido = campo.extrair(payload);
    const tol = toleranciaDaClasse(mt.classe, mt.casas);
    const esperadoAjustado = mt.classe === "custo" ? mt.valor * K : mt.classe === "razao-de-custo" ? mt.valor / K : mt.valor;

    let status: StatusDaComparacao = "diverge";
    let nota: string | undefined;
    if (obtido === null || !Number.isFinite(obtido)) {
      nota = "o payload não tem o valor (null)";
    } else if (mt.classe === "custo" || mt.classe === "razao-de-custo") {
      if (kNeutro) {
        status = bate(obtido, mt.valor, tol) ? "ok" : "diverge";
      } else if (bate(obtido, esperadoAjustado, tol)) {
        status = "ok-explicada-por-imposto";
      } else if (bate(obtido, mt.valor, tol)) {
        nota = "bate com o fator de imposto da FONTE — o motor deveria aplicar o gross-up do Loyola (decisão ✅2)";
      }
    } else {
      status = bate(obtido, mt.valor, tol) ? "ok" : "diverge";
    }
    const linha: LinhaDaComparacao = {
      chave: mt.chave,
      classe: mt.classe,
      unidade: mt.unidade,
      mapeamento: mt.mapeamento,
      esperadoOriginal: mt.valor,
      esperadoAjustado,
      obtido,
      delta: obtido === null ? null : obtido - esperadoAjustado,
      status,
      ...(nota ? { nota } : {}),
    };
    const c = classificadas.get(mt.chave);
    if (status === "diverge" && c) linha.classificacao = c;
    linhas.push(linha);
  }
  const divergenciasNaoClassificadas = linhas.filter((l) => l.status === "diverge" && !l.classificacao).map((l) => l.chave);
  return {
    fixtureId: fixture.id,
    papel: fixture.oraculo.papel,
    K,
    impostoPct: imposto.impostoPct,
    linhas,
    semCampoEquivalente,
    divergenciasNaoClassificadas,
    bloqueiaConferencia: fixture.oraculo.papel === "governante" && divergenciasNaoClassificadas.length > 0,
  };
}
