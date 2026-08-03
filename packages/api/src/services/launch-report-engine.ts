/**
 * Story 41.2 — motor de cálculo do Resumão: pipeline §2 + catálogo §3.
 *
 * **Puro.** Recebe campanhas, vendas e pesquisa já carregadas e devolve o objeto
 * de métricas. Nada de banco, planilha ou Meta aqui — o I/O mora em
 * `launch-report-loader.ts`. Essa separação é o padrão que a Story 41.8
 * estabeleceu (`perpetual-report-metrics` / `perpetual-report-loader`) e é o que
 * permite conferir a matemática contra a §10 em teste, sem credencial nenhuma.
 *
 * Denominadores — a parte em que a spec mais insiste (§3.2):
 * - `roas_pago` usa o **INV total**, não a fatia rastreada. Leitura conservadora.
 * - `INV_QUENTE + INV_FRIO === INV` (invariante A1).
 * - **Quente + Frio ≠ Pago Total**: três frações com denominadores diferentes.
 * - CTR **sem** imposto (é razão de cliques/impressões); CPC e CPM **com**.
 *
 * Verificado contra a §10 antes de escrever: a identidade A9
 * `(1000/CPM) × CTR × conversão × ticket == roas_pago` fecha com 4 casas nos
 * dois lançamentos, e o CTR da §10 usa **cliques totais** (não `link_click`).
 */

import {
  classificarFase,
  classificarOrigem,
  classificarPublico,
  normalizarNome,
  FASE_NAO_PADRAO,
  type FaseClassificada,
  type Origem,
  type Publico,
} from "./launch-report-normalize.js";
import { applyMetaTax } from "../utils/meta-tax.js";
import {
  aggregateAdHighlights,
  type AdInput,
  type CompradorInput,
  type DestaquesPorAnuncio,
  type FaixaPorAd,
} from "./launch-report-ads.js";

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export interface CampanhaInput {
  campaignId: string;
  campaignName: string;
  /** Spend **cru** (sem gross-up), somado no período. */
  spendBruto: number;
  /**
   * Soma do spend cru do ad-level da mesma campanha, quando disponível.
   * `null` = sem ad-level (não é erro; a reconciliação é pulada).
   */
  spendAdsBruto: number | null;
  impressoes: number;
  cliques: number;
  /**
   * Dia representativo para a alíquota (`YYYY-MM-DD`). O gross-up só vale de
   * 2026-01-01 em diante e um período pode atravessar essa data — por isso o
   * imposto é aplicado por dia no loader e agregado aqui.
   */
  spendComImposto: number;
}

export interface VendaInput {
  /** `null` quando a linha não tem e-mail — conta como ingresso avulso (§2.9). */
  email: string | null;
  txId: string | null;
  produto: string | null;
  /** Valor já resolvido em BRL por `launch-report-sales-value.ts` (§2.4). */
  valorBrl: number;
  /** Dia civil de São Paulo, `YYYY-MM-DD`. */
  dia: string;
  utmSource: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  /** Classificado a partir de `stageSalesSpreadsheets.orderBumpProducts`. */
  isOrderBump: boolean;
  /**
   * `ad_name` resolvido pelo loader (via cache de nomes da Meta a partir do
   * `utm_content`, com fallback para o último segmento do `utm_term`).
   * `null` = não resolvido; alimenta o alerta W6.
   */
  adName?: string | null;
}

export interface PesquisaInput {
  /**
   * E-mails (lowercase) que responderam a pesquisa da etapa.
   *
   * A taxa de resposta do §3 é **compradores que responderam ÷ ingressos
   * únicos** — por isso o motor precisa do conjunto, não de uma contagem.
   * Usar o total de respostas daria taxa acima de 100%: a pesquisa é respondida
   * por todo lead inscrito, não só por quem comprou (conferido no PG02:
   * 1.669 respostas para 1.407 ingressos únicos = 118,6%).
   */
  emailsRespondentes?: ReadonlySet<string>;
  /** Total de linhas da pesquisa — informativo, nunca denominador. */
  respostasTotais?: number;
  /** Blocos de qualificação já agregados por `computeSurveyForStage`. */
  blocos?: unknown;
}

export interface ComputeLaunchReportInput {
  periodo: { inicio: string; fim: string };
  impostoPct: number;
  impostoOrigem: "stage" | "project" | "default";
  /** `true` quando o spend recebido **já** vem com gross-up aplicado. */
  impostoJaAplicado: boolean;
  campanhas: readonly CampanhaInput[];
  vendas: readonly VendaInput[];
  pesquisa?: PesquisaInput | null;
  /** Insumos vindos do §2.4, repassados para os alertas da 41.3. */
  precoDistintoPorProduto?: Record<string, number>;
  linhasConvertidas?: number;
  /** `columnMapping.valorBruto` divergiu e o motor preferiu a coluna de preço. */
  mappingPrecoDivergente?: { colunaDoMapping: string; colunaUsada: string } | null;
  /**
   * Ad-level do período. Ausente ou vazio → `destaques` fica `null` e o
   * invariante A6 permanece `skipped` (é o caso do PG02, cujo ad-level não
   * existe no cache da Meta).
   */
  ads?: readonly AdInput[];
  /** Qualificação por criativo, de `byAdId` de `computeSurveyForStage`. */
  faixas?: readonly FaixaPorAd[];
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

/** Métrica com a conta que a produziu — é ela que o Resumão exibe (§AC5). */
export interface MetricaComMemoria {
  valor: number;
  memoria: string;
}

export interface DivergenciaCampanha {
  campaignId: string;
  campaignName: string;
  spendCampanha: number;
  spendAds: number;
  diferenca: number;
}

export interface LaunchReportMetrics {
  periodo: { inicio: string; fim: string; dias: number };

  campanhas: {
    total: number;
    comInvestimento: number;
    porFase: Record<string, number>;
    naoPadrao: { campaignId: string; campaignName: string }[];
  };

  investimento: {
    bruto: number;
    comImposto: number;
    quente: number;
    frio: number;
    pctQuente: number;
    pctFrio: number;
    impostoPct: number;
    impostoOrigem: string;
    /** Onde o gross-up foi aplicado — pega dupla aplicação (risco R1). */
    impostoAplicadoPor: "motor" | "fonte";
  };

  midia: {
    impressoes: number;
    cliques: number;
    ctr: MetricaComMemoria;
    cpc: MetricaComMemoria;
    cpm: MetricaComMemoria;
  };

  ingressos: {
    unicos: number;
    totais: number;
    captacao: number;
    orderBump: number;
    porOrigem: Record<Origem, number>;
    pagos: number;
    pagoQuente: number;
    pagoFrio: number;
    /** E-mails distintos com produto de captação — lado direito do A5. */
    emailsDistintos: number;
    /** Linhas de captação sem e-mail, contadas avulsas (§2.9). */
    avulsosSemEmail: number;
  };

  faturamento: {
    total: number;
    captacao: number;
    orderBump: number;
    porOrigem: Record<Origem, number>;
    pago: number;
    pagoQuente: number;
    pagoFrio: number;
    organico: number;
  };

  roas: {
    pago: MetricaComMemoria;
    pagoQuente: MetricaComMemoria;
    pagoFrio: MetricaComMemoria;
    total: MetricaComMemoria;
  };

  cpv: {
    geral: MetricaComMemoria;
    pago: MetricaComMemoria;
    quente: MetricaComMemoria;
    frio: MetricaComMemoria;
  };

  ticket: {
    captacao: MetricaComMemoria;
    total: MetricaComMemoria;
    pago: MetricaComMemoria;
  };

  orderBump: {
    attachRateGeral: MetricaComMemoria;
    attachRatePago: MetricaComMemoria;
    pctFatObGeral: MetricaComMemoria;
    pctFatObPago: MetricaComMemoria;
    ticketOb: MetricaComMemoria;
  };

  conversao: {
    /** Ingressos pagos ÷ cliques × 100 — fator da identidade A9. */
    cliqueVenda: MetricaComMemoria;
  };

  pesquisa: {
    taxaResposta: MetricaComMemoria;
    respondentes: number;
    blocos?: unknown;
  };

  produtos: {
    nome: string;
    categoria: "captacao" | "order_bump";
    vendas: number;
    faturamento: number;
    pctFaturamento: number;
    precoMin: number;
    precoMax: number;
  }[];

  /** Notas do §3.2 que o memorial precisa carregar. */
  notas: string[];

  // --- insumos das guardas da 41.3 (esta story só produz) ---
  divergencias: DivergenciaCampanha[];
  pendencias: string[];
  precoDistintoPorProduto: Record<string, number>;
  linhasConvertidas: number;
  /** Ads com spend < 20 e impressões > 1.000 — insumo do W3. Preenchido na 41.4. */
  adsComSpendSuspeito: { adName: string; spend: number; impressoes: number }[];
  /**
   * % de vendas pagas sem `ad_name` resolvido — insumo do W6. `undefined` até a
   * Story 41.4, e o alerta simplesmente não é avaliado enquanto for.
   */
  pctVendasPagasSemAdName?: number;
  /** Destaques por anúncio (41.4). `null` mantém o invariante A6 como `skipped`. */
  destaques: DestaquesPorAnuncio | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Divisão guardada. Denominador zero → 0, seguindo o padrão já estabelecido em
 * `creative-metrics-calculator.ts` (mantém a coluna ordenável no front).
 */
function div(numerador: number, denominador: number): number {
  return denominador === 0 ? 0 : numerador / denominador;
}

function br(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function inteiroBr(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

/** Métrica + memória de cálculo no formato `numerador ÷ denominador = valor`. */
function comMemoria(
  numerador: number,
  denominador: number,
  memoria: string,
  fator = 1,
): MetricaComMemoria {
  return { valor: div(numerador, denominador) * fator, memoria };
}

function diasEntre(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fim}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Limiar do §2.3b: divergência campaign × ad acima disso vira alerta W1. */
export const LIMIAR_DIVERGENCIA_RECONCILIACAO = 50;

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export function computeLaunchReportMetrics(
  input: ComputeLaunchReportInput,
): LaunchReportMetrics {
  const {
    periodo,
    impostoPct,
    impostoOrigem,
    impostoJaAplicado,
    campanhas,
    vendas,
    pesquisa,
  } = input;

  // === §2.2/§2.3b — classificação e reconciliação por campanha ==============
  const porFase: Record<string, number> = {};
  const naoPadrao: { campaignId: string; campaignName: string }[] = [];
  const divergencias: DivergenciaCampanha[] = [];

  let invBruto = 0;
  let invComImposto = 0;
  let invQuente = 0;
  let invFrio = 0;
  let impressoes = 0;
  let cliques = 0;
  let comInvestimento = 0;

  for (const c of campanhas) {
    const nomeNorm = normalizarNome(c.campaignName);
    const fase: FaseClassificada = classificarFase(c.campaignName);
    porFase[fase] = (porFase[fase] ?? 0) + 1;
    if (fase === FASE_NAO_PADRAO) {
      naoPadrao.push({ campaignId: c.campaignId, campaignName: c.campaignName });
    }

    // §2.3b — spend[c] = max(campaign-level, Σ ad-level). O ad-level da Meta é
    // menos confiável, mas quando ele é MAIOR o campaign-level é que está
    // truncado. Divergência acima do limiar é registrada nos dois casos.
    const spendCampanha = c.spendBruto;
    const spendAds = c.spendAdsBruto;
    let spendCru = spendCampanha;
    if (spendAds !== null) {
      spendCru = Math.max(spendCampanha, spendAds);
      const diferenca = Math.abs(spendCampanha - spendAds);
      if (diferenca > LIMIAR_DIVERGENCIA_RECONCILIACAO) {
        divergencias.push({
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          spendCampanha,
          spendAds,
          diferenca,
        });
      }
    }

    // Imposto exatamente uma vez (risco R1). Quando a fonte já veio com
    // gross-up, o motor usa o valor da fonte e não reaplica.
    let comImposto: number;
    if (impostoJaAplicado) {
      comImposto = Math.max(c.spendComImposto, spendCru);
    } else if (spendCru === spendCampanha) {
      // Caminho normal: o loader já calculou o gross-up por DIA, que é o certo
      // quando o período atravessa 2026-01-01.
      comImposto = c.spendComImposto;
    } else {
      // A reconciliação escolheu o ad-level: o gross-up por dia não serve mais,
      // aplica-se a alíquota da config sobre o valor reconciliado.
      comImposto = impostoPct > 0 && impostoPct < 1 ? spendCru / (1 - impostoPct) : spendCru;
    }

    invBruto += spendCru;
    invComImposto += comImposto;
    impressoes += c.impressoes;
    cliques += c.cliques;
    if (spendCru > 0) comInvestimento += 1;

    // §2.7 — hot/cold pelo nome normalizado. Toda campanha cai em Quente ou
    // Frio; "Indefinido" iria para lugar nenhum e quebraria A1, então é somado
    // ao Frio e registrado em `pendencias`.
    const publico = classificarPublico(nomeNorm);
    if (publico === "Quente") invQuente += comImposto;
    else invFrio += comImposto;
  }

  const pendencias: string[] = [];
  for (const c of campanhas) {
    if (classificarPublico(normalizarNome(c.campaignName)) === "Indefinido") {
      pendencias.push(
        `campanha sem hot/cold no nome, somada ao Frio para não quebrar A1: ${c.campaignName}`,
      );
    }
  }
  for (const np of naoPadrao) {
    pendencias.push(`campanha fora dos 5 prefixos da convenção (§2.2): ${np.campaignName}`);
  }
  if (input.mappingPrecoDivergente) {
    pendencias.push(
      `columnMapping.valorBruto aponta para "${input.mappingPrecoDivergente.colunaDoMapping}" ` +
        `(proibido pelo §2.4); o motor usou "${input.mappingPrecoDivergente.colunaUsada}"`,
    );
  }

  // === §2.9 — ingressos únicos e atribuição propagada ======================
  // A compra MAIS RECENTE de cada e-mail define origem e público, e todas as
  // outras linhas daquele e-mail — inclusive order bumps — herdam a atribuição.
  // Consequência intencional: order bump comprado por quem veio de anúncio
  // conta como receita paga.
  interface Comprador {
    email: string;
    origem: Origem;
    publico: Publico;
    ultimoDia: string;
    temCaptacao: boolean;
    /**
     * `true` quando a atribuição atual veio de uma linha de **captação**.
     *
     * Existe por causa de um bug pego em teste: order bump normalmente não
     * carrega UTM e é comprado no mesmo dia da captação. Comparando só por data,
     * a linha do order bump (sem `utm_source`) sobrescrevia a atribuição e o
     * comprador virava "Sem Track" — o faturamento pago ia a zero. O §2.9 diz
     * que order bumps **herdam** a atribuição, ou seja, são receptores e nunca
     * definidores dela.
     */
    veioDeCaptacao: boolean;
    /** `ad_name` da compra que definiu a atribuição. Alimenta a 41.4 e o W6. */
    adName: string | null;
  }

  const compradores = new Map<string, Comprador>();
  const avulsos: Comprador[] = [];

  for (const v of vendas) {
    const origem = classificarOrigem(v.utmSource);
    const publico = classificarPublico(v.utmTerm);

    if (!v.email) {
      // Linha sem e-mail não colapsa: cada uma conta como 1 ingresso avulso.
      if (!v.isOrderBump) {
        avulsos.push({
          email: "",
          origem,
          publico,
          ultimoDia: v.dia,
          temCaptacao: true,
          veioDeCaptacao: true,
          adName: v.adName ?? null,
        });
      }
      continue;
    }

    const atual = compradores.get(v.email);
    if (!atual) {
      compradores.set(v.email, {
        email: v.email,
        origem,
        publico,
        ultimoDia: v.dia,
        temCaptacao: !v.isOrderBump,
        veioDeCaptacao: !v.isOrderBump,
        adName: v.adName ?? null,
      });
      continue;
    }
    if (!v.isOrderBump) atual.temCaptacao = true;

    // Só linha de CAPTAÇÃO define a atribuição. Entre captações, a mais recente
    // ganha — `>=` e não `>` porque, em empate de dia, a última lida é a ordem
    // em que a planilha cresce. Order bump só entra quando ainda não houve
    // nenhuma captação, para o e-mail não ficar sem atribuição nenhuma.
    const ehCaptacao = !v.isOrderBump;
    const podeSobrescrever = ehCaptacao
      ? !atual.veioDeCaptacao || v.dia >= atual.ultimoDia
      : !atual.veioDeCaptacao && v.dia >= atual.ultimoDia;

    if (podeSobrescrever) {
      atual.ultimoDia = v.dia;
      atual.origem = origem;
      atual.publico = publico;
      atual.adName = v.adName ?? null;
      if (ehCaptacao) atual.veioDeCaptacao = true;
    }
  }

  // Únicos = e-mails com produto de captação + avulsos sem e-mail.
  const unicosComEmail = [...compradores.values()].filter((c) => c.temCaptacao);
  const unicos = [...unicosComEmail, ...avulsos];

  const ingressosPorOrigem: Record<Origem, number> = {
    Pago: 0,
    "Orgânico": 0,
    "Sem Track": 0,
  };
  let ingressosPagoQuente = 0;
  let ingressosPagoFrio = 0;
  for (const u of unicos) {
    ingressosPorOrigem[u.origem] += 1;
    if (u.origem === "Pago") {
      if (u.publico === "Quente") ingressosPagoQuente += 1;
      else if (u.publico === "Frio") ingressosPagoFrio += 1;
    }
  }

  // === Faturamento, com a atribuição do comprador propagada ================
  const atribuicaoDe = (v: VendaInput): { origem: Origem; publico: Publico } => {
    if (v.email) {
      const c = compradores.get(v.email);
      if (c) return { origem: c.origem, publico: c.publico };
    }
    return { origem: classificarOrigem(v.utmSource), publico: classificarPublico(v.utmTerm) };
  };

  let fatTotal = 0;
  let fatCaptacao = 0;
  let fatOrderBump = 0;
  let fatPagoQuente = 0;
  let fatPagoFrio = 0;
  let vendasCaptacao = 0;
  let vendasOrderBump = 0;
  const fatPorOrigem: Record<Origem, number> = { Pago: 0, "Orgânico": 0, "Sem Track": 0 };

  interface AggProduto {
    nome: string;
    categoria: "captacao" | "order_bump";
    vendas: number;
    faturamento: number;
    precoMin: number;
    precoMax: number;
  }
  const produtosAgg = new Map<string, AggProduto>();

  for (const v of vendas) {
    const { origem, publico } = atribuicaoDe(v);
    fatTotal += v.valorBrl;
    fatPorOrigem[origem] += v.valorBrl;

    if (v.isOrderBump) {
      fatOrderBump += v.valorBrl;
      vendasOrderBump += 1;
    } else {
      fatCaptacao += v.valorBrl;
      vendasCaptacao += 1;
    }

    if (origem === "Pago") {
      if (publico === "Quente") fatPagoQuente += v.valorBrl;
      else if (publico === "Frio") fatPagoFrio += v.valorBrl;
    }

    const nome = (v.produto ?? "").trim() || "(sem produto)";
    const categoria = v.isOrderBump ? "order_bump" : "captacao";
    const chave = `${categoria} ${nome}`;
    const agg = produtosAgg.get(chave);
    if (agg) {
      agg.vendas += 1;
      agg.faturamento += v.valorBrl;
      agg.precoMin = Math.min(agg.precoMin, v.valorBrl);
      agg.precoMax = Math.max(agg.precoMax, v.valorBrl);
    } else {
      produtosAgg.set(chave, {
        nome,
        categoria,
        vendas: 1,
        faturamento: v.valorBrl,
        precoMin: v.valorBrl,
        precoMax: v.valorBrl,
      });
    }
  }

  const fatPago = fatPorOrigem.Pago;
  const fatOrganico = fatPorOrigem["Orgânico"];
  const ingressosPagos = ingressosPorOrigem.Pago;
  const ingressosUnicos = unicos.length;
  const vendasTotais = vendas.length;

  // === §3 — catálogo ======================================================
  const invTotal = invComImposto;

  const ctr = comMemoria(
    cliques,
    impressoes,
    `${inteiroBr(cliques)} cliques ÷ ${inteiroBr(impressoes)} impressões × 100 = ${br(div(cliques, impressoes) * 100)}%`,
    100,
  );
  const cpc = comMemoria(
    invTotal,
    cliques,
    `R$ ${br(invTotal)} ÷ ${inteiroBr(cliques)} cliques = R$ ${br(div(invTotal, cliques))}`,
  );
  const cpm = comMemoria(
    invTotal,
    impressoes,
    `R$ ${br(invTotal)} ÷ ${inteiroBr(impressoes)} impressões × 1.000 = R$ ${br(div(invTotal, impressoes) * 1000)}`,
    1000,
  );

  const roasPago = comMemoria(
    fatPago,
    invTotal,
    `R$ ${br(fatPago)} (faturamento pago) ÷ R$ ${br(invTotal)} (INV total) = ${br(div(fatPago, invTotal), 4)}`,
  );
  const roasPagoQuente = comMemoria(
    fatPagoQuente,
    invQuente,
    `R$ ${br(fatPagoQuente)} ÷ R$ ${br(invQuente)} (INV quente) = ${br(div(fatPagoQuente, invQuente), 4)}`,
  );
  const roasPagoFrio = comMemoria(
    fatPagoFrio,
    invFrio,
    `R$ ${br(fatPagoFrio)} ÷ R$ ${br(invFrio)} (INV frio) = ${br(div(fatPagoFrio, invFrio), 4)}`,
  );
  const roasTotal = comMemoria(
    fatTotal,
    invTotal,
    `R$ ${br(fatTotal)} (faturamento total) ÷ R$ ${br(invTotal)} = ${br(div(fatTotal, invTotal), 4)}`,
  );

  const cpvGeral = comMemoria(
    invTotal,
    ingressosUnicos,
    `R$ ${br(invTotal)} ÷ ${inteiroBr(ingressosUnicos)} ingressos únicos = R$ ${br(div(invTotal, ingressosUnicos))}`,
  );
  const cpvPago = comMemoria(
    invTotal,
    ingressosPagos,
    `R$ ${br(invTotal)} (INV total, não a fatia rastreada) ÷ ${inteiroBr(ingressosPagos)} ingressos pagos = R$ ${br(div(invTotal, ingressosPagos))}`,
  );
  const cpvQuente = comMemoria(
    invQuente,
    ingressosPagoQuente,
    `R$ ${br(invQuente)} ÷ ${inteiroBr(ingressosPagoQuente)} pagos quentes = R$ ${br(div(invQuente, ingressosPagoQuente))}`,
  );
  const cpvFrio = comMemoria(
    invFrio,
    ingressosPagoFrio,
    `R$ ${br(invFrio)} ÷ ${inteiroBr(ingressosPagoFrio)} pagos frios = R$ ${br(div(invFrio, ingressosPagoFrio))}`,
  );

  const ticketCaptacao = comMemoria(
    fatCaptacao,
    vendasCaptacao,
    `R$ ${br(fatCaptacao)} ÷ ${inteiroBr(vendasCaptacao)} vendas de captação = R$ ${br(div(fatCaptacao, vendasCaptacao))}`,
  );
  const ticketTotal = comMemoria(
    fatTotal,
    vendasTotais,
    `R$ ${br(fatTotal)} ÷ ${inteiroBr(vendasTotais)} vendas = R$ ${br(div(fatTotal, vendasTotais))}`,
  );
  const ticketPago = comMemoria(
    fatPago,
    ingressosPagos,
    `R$ ${br(fatPago)} ÷ ${inteiroBr(ingressosPagos)} ingressos pagos = R$ ${br(div(fatPago, ingressosPagos))}`,
  );

  const attachRateGeral = comMemoria(
    vendasOrderBump,
    ingressosUnicos,
    `${inteiroBr(vendasOrderBump)} order bumps ÷ ${inteiroBr(ingressosUnicos)} ingressos únicos × 100 = ${br(div(vendasOrderBump, ingressosUnicos) * 100)}%`,
    100,
  );
  const obPago = vendas.filter((v) => v.isOrderBump && atribuicaoDe(v).origem === "Pago");
  const fatObPago = obPago.reduce((s, v) => s + v.valorBrl, 0);
  const attachRatePago = comMemoria(
    obPago.length,
    ingressosPagos,
    `${inteiroBr(obPago.length)} order bumps pagos ÷ ${inteiroBr(ingressosPagos)} ingressos pagos × 100 = ${br(div(obPago.length, ingressosPagos) * 100)}%`,
    100,
  );
  const pctFatObGeral = comMemoria(
    fatOrderBump,
    fatTotal,
    `R$ ${br(fatOrderBump)} ÷ R$ ${br(fatTotal)} × 100 = ${br(div(fatOrderBump, fatTotal) * 100)}%`,
    100,
  );
  const pctFatObPago = comMemoria(
    fatObPago,
    fatPago,
    `R$ ${br(fatObPago)} ÷ R$ ${br(fatPago)} × 100 = ${br(div(fatObPago, fatPago) * 100)}%`,
    100,
  );
  const ticketOb = comMemoria(
    fatOrderBump,
    vendasOrderBump,
    `R$ ${br(fatOrderBump)} ÷ ${inteiroBr(vendasOrderBump)} order bumps = R$ ${br(div(fatOrderBump, vendasOrderBump))}`,
  );

  const conversaoCliqueVenda = comMemoria(
    ingressosPagos,
    cliques,
    `${inteiroBr(ingressosPagos)} ingressos pagos ÷ ${inteiroBr(cliques)} cliques × 100 = ${br(div(ingressosPagos, cliques) * 100, 3)}%`,
    100,
  );

  // Compradores que responderam: interseção entre os e-mails dos ingressos
  // únicos e os respondentes. Nunca pode passar de `ingressosUnicos`.
  const emailsRespondentes = pesquisa?.emailsRespondentes;
  const respondentes = emailsRespondentes
    ? unicos.filter((u) => u.email && emailsRespondentes.has(u.email)).length
    : 0;
  const taxaResposta = comMemoria(
    respondentes,
    ingressosUnicos,
    `${inteiroBr(respondentes)} compradores que responderam ÷ ${inteiroBr(ingressosUnicos)} ingressos únicos × 100 = ${br(div(respondentes, ingressosUnicos) * 100)}%`,
    100,
  );

  // === §7.2 — destaques por anúncio (41.4) ================================
  // O faturamento de cada comprador é a soma de TODAS as linhas do e-mail
  // (captação + order bumps). Montar assim, e não somando linha a linha por
  // `ad_name`, é o que preserva os order bumps — eles não carregam o
  // `utm_content` do criativo.
  let destaques: DestaquesPorAnuncio | null = null;
  if (input.ads && input.ads.length > 0) {
    const fatPorEmail = new Map<string, number>();
    for (const v of vendas) {
      if (!v.email) continue;
      fatPorEmail.set(v.email, (fatPorEmail.get(v.email) ?? 0) + v.valorBrl);
    }

    const paraDestaques: CompradorInput[] = unicosComEmail.map((c) => ({
      email: c.email,
      origem: c.origem,
      publico: c.publico,
      adName: c.adName,
      faturamento: fatPorEmail.get(c.email) ?? 0,
    }));

    destaques = aggregateAdHighlights({
      ads: input.ads,
      compradores: paraDestaques,
      faixas: input.faixas,
      invQuente,
      invFrio,
      invTotal: invComImposto,
    });
  }

  const produtos = [...produtosAgg.values()]
    .map((p) => ({
      nome: p.nome,
      categoria: p.categoria,
      vendas: p.vendas,
      faturamento: p.faturamento,
      pctFaturamento: div(p.faturamento, fatTotal) * 100,
      precoMin: p.precoMin,
      precoMax: p.precoMax,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  return {
    periodo: { ...periodo, dias: diasEntre(periodo.inicio, periodo.fim) },

    campanhas: {
      total: campanhas.length,
      comInvestimento,
      porFase,
      naoPadrao,
    },

    investimento: {
      bruto: invBruto,
      comImposto: invComImposto,
      quente: invQuente,
      frio: invFrio,
      pctQuente: div(invQuente, invComImposto) * 100,
      pctFrio: div(invFrio, invComImposto) * 100,
      impostoPct,
      impostoOrigem,
      impostoAplicadoPor: impostoJaAplicado ? "fonte" : "motor",
    },

    midia: { impressoes, cliques, ctr, cpc, cpm },

    ingressos: {
      unicos: ingressosUnicos,
      totais: vendasTotais,
      captacao: vendasCaptacao,
      orderBump: vendasOrderBump,
      porOrigem: ingressosPorOrigem,
      pagos: ingressosPagos,
      pagoQuente: ingressosPagoQuente,
      pagoFrio: ingressosPagoFrio,
      emailsDistintos: unicosComEmail.length,
      avulsosSemEmail: avulsos.length,
    },

    faturamento: {
      total: fatTotal,
      captacao: fatCaptacao,
      orderBump: fatOrderBump,
      porOrigem: fatPorOrigem,
      pago: fatPago,
      pagoQuente: fatPagoQuente,
      pagoFrio: fatPagoFrio,
      organico: fatOrganico,
    },

    roas: { pago: roasPago, pagoQuente: roasPagoQuente, pagoFrio: roasPagoFrio, total: roasTotal },
    cpv: { geral: cpvGeral, pago: cpvPago, quente: cpvQuente, frio: cpvFrio },
    ticket: { captacao: ticketCaptacao, total: ticketTotal, pago: ticketPago },
    orderBump: { attachRateGeral, attachRatePago, pctFatObGeral, pctFatObPago, ticketOb },
    conversao: { cliqueVenda: conversaoCliqueVenda },
    pesquisa: { taxaResposta, respondentes, blocos: pesquisa?.blocos },
    produtos,

    notas: [
      "ROAS Pago usa o INV total, não a fatia rastreada — leitura conservadora (§3.2).",
      "Quente + Frio ≠ Pago Total: são três frações com denominadores diferentes (§3.2).",
      "A atribuição do comprador vem da compra mais recente e propaga para todas as linhas do mesmo e-mail, inclusive order bumps (§2.9).",
      `Imposto de ${br(impostoPct * 100)}% aplicado uma vez, com origem "${impostoOrigem}".`,
    ],

    divergencias,
    pendencias,
    precoDistintoPorProduto: input.precoDistintoPorProduto ?? {},
    linhasConvertidas: input.linhasConvertidas ?? 0,
    adsComSpendSuspeito: destaques?.adsComSpendSuspeito ?? [],
    pctVendasPagasSemAdName: destaques?.pctVendasPagasSemAdName,
    destaques,
  };
}

/** Reexporta para quem monta o loader não precisar importar de dois lugares. */
export { applyMetaTax };
