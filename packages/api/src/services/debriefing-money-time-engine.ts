/**
 * Story 49.3 — Motor I do Debriefing: dinheiro e tempo.
 *
 * **Puro.** Entra o que o loader (`debriefing-money-time-loader.ts`) leu do
 * banco e das planilhas — células cruas de venda, leads, mídia por
 * campanha×dia —, a config da 49.1 e o classificador da 49.2 injetado; sai um
 * objeto tipado com memória de cálculo por métrica. Sem banco, planilha,
 * relógio (`Date.now`/`new Date()` sem argumento) nem `Math.random`: a mesma
 * entrada dá o mesmo JSON. Padrão do Epic 41 (loader I/O → engine puro), mas o
 * motor do Resumão NÃO é reaproveitado (outra regra de clique, métricas que ele
 * não tem).
 *
 * Fases da skill `loyola-debriefing` cobertas: 2 (higiene), 3 (mídia),
 * 4 (captação), 5 (Tabela 1), 6 (coorte), 7 (conversão e ROAS). Armadilhas
 * 1, 2, 3, 4, 5, 7, 9 e 10.
 *
 * Regras do dono que valem aqui (epic §Decisões — não reabrir):
 * - imposto do Loyola, uma vez, por dia (`aplicarImposto`); nunca o fator fixo da skill;
 * - clique = `link_click`; ausente = `null`, nunca `0` nem cliques totais;
 * - comprador de captação = `ingresso` OU `combo` (R2-1); headline `porEmail`;
 * - dedup por ID da venda (camada 1, função da 41.10) antes do corte de janela;
 * - ROAS total inclui o downsell (decisão 5); headline exclui a reabertura;
 * - pico-artefato: investimento do dia > 0 e < 10% da média diária (decisão 6);
 * - venda do principal antes da abertura do carrinho sai e é listada
 *   (decisão 7); venda-teste NÃO é excluída (R2-4);
 * - aquisição × fechamento: dois eixos, nunca somados (decisão 3, R2-5);
 * - janela = `inicioCaptacao` → maior entre fim do carrinho, da reabertura e do
 *   downsell, para vendas E mídia (decisão 2A, 2026-10-02);
 * - vendas manuais (`manual_sales`) entram como venda da etapa, `fonte:
 *   "manual"` na auditoria (decisão 3A); a camada 2 `(e-mail, produto)` da
 *   skill fica (decisão 1A — a diferença para o Resumão é de definição);
 * - sem PII: chaves em hash; nenhum e-mail, telefone ou nome no payload.
 *
 * Unidades: dinheiro em reais (somado em centavos inteiros, para que toda
 * soma por etapa, por tipo e total feche exatamente); taxas `conversao*` e
 * `comTierSuperior` em FRAÇÃO (0–1); `pct*`, `ctr` e `share` em PERCENTUAL.
 */

import {
  CANAIS,
  ctrDeLink,
  cpcDeLink,
  somarLinkClicks,
  type Canal,
  type EntradaClassificador,
  type Fechamento,
  type ResultadoClassificacao,
  type Utm,
} from "@loyola-x/shared";
import type { DebriefingConfigLancamento, DebriefingPapel } from "./debriefing-config.js";
import type { TipoDeProdutoNaVenda } from "../utils/order-bump.js";
import { valorBrl } from "./launch-report-sales-value.js";
import { LIMIARES_ALERTA } from "./launch-report-guards.js";
import {
  FASE_NAO_PADRAO,
  classificarFase,
  classificarPublico,
  normalizarNome,
  type Publico,
} from "./launch-report-normalize.js";
import {
  aplicarImposto,
  chavesDeComprador,
  dataBrt,
  deduplicarVendas,
  desembrulharUtm,
  diasEntre,
  ehManual,
  ehTmb,
  emCentavos,
  fatorDoImposto,
  filtrarPorStatus,
  LACUNA_CARRINHO_AINDA_NAO_ABRIU,
  anteriorAAbertura,
  corteSemCarrinho,
  diaDoCorteDeLeadsEPesquisa,
  fasesComCarrinhoAberto,
  LACUNA_COORTE_INCOMPLETA,
  LACUNA_DOWNSELL_AINDA_NAO_COMECOU,
  LACUNA_REABERTURA_AINDA_NAO_COMECOU,
  textoDaCoorteIncompleta,
  textoDaFaseEmCurso,
  textoDaFaseQueNaoComecou,
  type FasesNoCorte,
  janelaDaGeracao,
  lerValorMonetario,
  textoDaLacunaDoCarrinho,
  normalizarEmail,
  normalizarTelefone,
  somarDias,
  textoTmb,
  type ContagemDedup,
  type CorteDaJanela,
  type CriterioDeUnico,
  type DedupPorIdNaoAplicada,
  type ExcluidasPorStatus,
  type FonteDaVenda,
  type JanelaDoDebriefing,
  type PlanilhaParaDedup,
  type ValorLido,
} from "./debriefing-hygiene.js";

export type { CriterioDeUnico, FonteDaVenda, JanelaDoDebriefing } from "./debriefing-hygiene.js";

// ---------------------------------------------------------------------------
// Constantes nomeadas
// ---------------------------------------------------------------------------

/**
 * Decisão 1 do dono (2026-09-30): o headline de comprador único é por e-mail,
 * como o Loyola/Epic 41. O motor exige `criterioDeUnico` sem default; o
 * orquestrador (49.5/49.6) passa esta constante.
 */
export const CRITERIO_DE_UNICO_HEADLINE: CriterioDeUnico = "porEmail";

/** Janela da coorte — folgada, para não cortar a cauda (armadilha #7: PG01 vendeu até D+39). */
export const MAXD_PADRAO = 45;

/** Decisão 6 do dono: pico-artefato = investimento do dia abaixo de 10% da média diária da captação. */
export const FRACAO_LIMIAR_PICO_ARTEFATO = 0.1;

/** Agrupamento dos papéis da 49.1 (resolução 10). */
export type GrupoDaEtapa = "captacao" | "principal" | "downsell" | "reabertura";

export const GRUPO_DO_PAPEL: Readonly<Record<DebriefingPapel, GrupoDaEtapa>> = {
  "leads-captacao": "captacao",
  "vendas-captacao": "captacao",
  "vendas-principal": "principal",
  "leads-downsell": "downsell",
  "vendas-downsell": "downsell",
  reabertura: "reabertura",
};

const GRUPOS: readonly GrupoDaEtapa[] = ["captacao", "principal", "downsell", "reabertura"];
const TIPOS: readonly TipoDeProdutoNaVenda[] = ["ingresso", "combo", "order_bump", "principal", "upsell"];
const CANAIS_PAGOS: ReadonlySet<Canal> = new Set<Canal>(["Pago Quente", "Pago Frio", "Pago N/D"]);

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Uma planilha de venda da etapa, como o loader a resolveu. */
export interface PlanilhaDeVendaInput {
  planilhaId: string;
  stageId: string;
  /** Nome da aba — só para a lacuna/auditoria. */
  nome: string;
  /**
   * Subtype da planilha (`main_product | sales | tmb | event_sales | capture`),
   * ou `"manual"` (`PLATAFORMA_MANUAL`) para as vendas lançadas à mão
   * (`manual_sales`, decisão 3A) — o loader as entrega como uma planilha a mais
   * da etapa.
   */
  plataforma: string;
  temColunaStatus: boolean;
  /** `mapping.transactionId` existe na planilha (camada 1 da dedup). */
  temColunaId: boolean;
  /** `mapping.productName` existe na planilha (camada 1 da dedup). */
  temColunaProduto: boolean;
  /**
   * A camada 2 (pessoa + produto) vale na etapa desta planilha —
   * `camada2ValeNaEtapa(stageType)`, gravado pelo loader (Story 41.12, R7-4/R7-5).
   */
  camada2Vale: boolean;
}

/** Uma linha crua de venda. Dinheiro, data e telefone chegam COMO NA CÉLULA. */
export interface VendaCruaInput {
  planilhaId: string;
  /** Linha da planilha (1 = primeira linha de dado). Só para ordem e auditoria. */
  linha: number;
  /** Célula da coluna `mapping.transactionId`. */
  idDaVendaCru: string | null;
  produto: string | null;
  /** Já resolvido pelo loader: `tipoDoProduto(produto, product_types)` com default `tipoPadraoDaEtapa`. */
  tipo: TipoDeProdutoNaVenda;
  /** `true` quando o produto consta em `product_types`; `false` = caiu no default da etapa. */
  tipoClassificado: boolean;
  /** Célula crua da coluna de preço (nunca pré-parseada — R-49-4). */
  valorBrutoCru: string | null;
  moeda: string | null;
  statusCru: string | null;
  emailCru: string | null;
  telefoneCru: string | null;
  dataVendaCru: string | null;
  utm: Utm;
  sellerName: string | null;
}

/** Um registro de lead/pesquisa (fontes da jornada: pesquisas + planilhas não-venda). */
export interface LeadInput {
  emailCru: string | null;
  telefoneCru: string | null;
  dataCriacaoCru: string | null;
  utm: Utm;
}

/** Mídia de uma campanha num dia (spend CRU de `meta_campaign_insights_daily`). */
export interface MidiaCampanhaDiaInput {
  stageId: string;
  campaignId: string;
  campaignName: string;
  /** `YYYY-MM-DD` da Meta (fuso da conta). */
  dia: string;
  spendBruto: number;
  impressoes: number;
  /** `null` = a Meta não devolveu `link_click` (≠ 0). */
  linkClicks: number | null;
}

/**
 * REL-001 — uma aba (`spreadsheetId` + `sheetName`) ligada a MAIS de uma etapa
 * do lançamento. O loader a lê uma vez só, com UM vínculo (o que vale); os
 * outros ficam aqui, declarados — nunca em silêncio.
 *
 * Critério (nesta ordem): 1) o vínculo com mais colunas da camada 1 mapeadas e
 * existentes (`transactionId`, `productName`); 2) empate → o de etapa de papel
 * `vendas-*`; 3) empate → o da primeira etapa na ordem de `config.etapas`
 * (registrado como `"empate-ordem-da-config"`).
 */
export interface FonteDuplicada {
  /** Nome da aba (não é PII). */
  aba: string;
  vinculos: {
    stageId: string;
    papel: DebriefingPapel;
    planilhaId: string;
    temColunaId: boolean;
    temColunaProduto: boolean;
  }[];
  /** `planilhaId` do vínculo que valeu (o único lido). */
  vale: string;
  stageIdQueVale: string;
  criterio: "mapeamento-id-e-produto" | "papel-de-vendas" | "empate-ordem-da-config";
  /** Linhas da aba que deixaram de entrar uma 2ª (3ª…) vez. */
  linhasNaoRelidas: number;
}

/** O classificador da 49.2, injetado (o loader fecha a config dentro). */
export interface ClassificadorInjetado {
  versao: string;
  classificar: (entrada: EntradaClassificador) => ResultadoClassificacao;
}

/** `Pick` que preserva a união (a 49.12 discrimina a config por `situacaoDoLancamento`). */
export type PickDaUniao<T, K extends PropertyKey> = T extends unknown ? Pick<T, Extract<K, keyof T>> : never;

/** O que os motores leem da config (49.12: a situação e o corte decidem a janela). */
export type ConfigDoMotor = PickDaUniao<
  DebriefingConfigLancamento,
  "situacaoDoLancamento" | "datasChave" | "corte" | "etapas" | "imposto"
>;

/** A parte da config que vai aos motores, preservando a situação e o corte (49.12). */
export function configDoMotor(c: DebriefingConfigLancamento): ConfigDoMotor {
  const corte = c.corte !== undefined ? { corte: c.corte } : {};
  if (c.situacaoDoLancamento === "em-andamento") {
    return { situacaoDoLancamento: "em-andamento", datasChave: c.datasChave, etapas: c.etapas, imposto: c.imposto, ...corte };
  }
  return { datasChave: c.datasChave, etapas: c.etapas, imposto: c.imposto, ...corte };
}

export interface DebriefingMoneyTimeInput {
  /**
   * A janela do debriefing NÃO é parâmetro: sai da config por
   * `janelaDaGeracao` (decisão 2A; 49.12: o corte, quando há, é ENTRADA da
   * config). Vendas, leads e mídia fora dela saem e são contadas.
   */
  config: ConfigDoMotor;
  /** Obrigatório e sem default — o orquestrador passa `CRITERIO_DE_UNICO_HEADLINE`. */
  criterioDeUnico: CriterioDeUnico;
  /** Janela da coorte; default `MAXD_PADRAO` (45). */
  maxD?: number;
  planilhas: readonly PlanilhaDeVendaInput[];
  vendas: readonly VendaCruaInput[];
  leads: readonly LeadInput[];
  midia: readonly MidiaCampanhaDiaInput[];
  classificador: ClassificadorInjetado;
  /** REL-001: abas em mais de uma etapa, já lidas uma vez pelo loader. Default `[]`. */
  fontesDuplicadas?: readonly FonteDuplicada[];
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

/** Métrica com a conta que a produziu. `valor = null` sempre com `motivo`. */
export interface Metrica<T = number> {
  valor: T | null;
  memoria: string;
  motivo?: string;
}

/** Razão com os dois lados expostos — a 49.5 recomputa a partir deles. */
export interface MetricaRazao extends Metrica<number> {
  numerador: number;
  denominador: number;
}

export interface Lacuna {
  codigo:
    | typeof LACUNA_CARRINHO_AINDA_NAO_ABRIU
    | typeof LACUNA_COORTE_INCOMPLETA
    | typeof LACUNA_REABERTURA_AINDA_NAO_COMECOU
    | typeof LACUNA_DOWNSELL_AINDA_NAO_COMECOU
    | "LISTAS_FRONT_COMUNIDADE"
    | "LEADS_DO_PAINEL"
    | "VENDAS_SEM_DATA"
    | "PRECO_ORIGINAL_NAO_MAPEADO"
    | "VENDAS_EXCLUIDAS_AUTOMATICAMENTE"
    | "DEDUP_POR_ID_NAO_APLICADA"
    | "FONTE_EM_MAIS_DE_UMA_ETAPA";
  motivo: string;
  detalhe?: string;
}

export interface Pendencia {
  codigo:
    | "CAMPANHA_SEM_FASE"
    | "CAMPANHA_SEM_PUBLICO"
    | "MIDIA_DE_ETAPA_FORA_DA_CONFIG"
    | "VENDA_DE_ETAPA_FORA_DA_CONFIG"
    | "TIPO_INESPERADO_NA_CAPTACAO";
  detalhe: string;
  stageId?: string;
  campaignId?: string;
  campaignName?: string;
  investimentoComImposto?: number;
}

export interface QuenteFrio {
  INV: number;
  INV_QUENTE: number;
  INV_FRIO: number;
  INV_INDEFINIDO: number;
  /** Percentuais de `INV`; `null` quando `INV = 0`. */
  shareQuente: number | null;
  shareFrio: number | null;
  shareIndefinido: number | null;
}

export interface MidiaAgregada {
  investimentoBruto: number;
  investimentoComImposto: number;
  impressoes: number;
  /** `somarLinkClicks`: `null` quando nenhuma linha trouxe `link_click`. */
  linkClicks: number | null;
  /** Campanha×dia sem `link_click` (não entraram na soma de cliques). */
  linhasSemLinkClick: number;
  ctr: Metrica;
  cpc: Metrica;
  cpm: Metrica;
  quenteFrio: QuenteFrio;
}

export interface MidiaDiaDaEtapa {
  dia: string;
  stageId: string;
  bruto: number;
  comImposto: number;
}

export interface ItemDeVendaSemPii {
  txId: string | null;
  produto: string | null;
  valor: number;
  dataBrt: string | null;
  /** `"manual"` = `manual_sales` (decisão 3A); `"planilha"` = planilha de venda da etapa. */
  fonte: FonteDaVenda;
}

export interface VendaExcluida extends ItemDeVendaSemPii {
  /** R2-4: o único motivo de exclusão automática é a data. Não existe `VENDA_TESTE`. */
  motivo: "ANTERIOR_A_ABERTURA";
}

export type OrigemDaData = "lead-email" | "lead-telefone" | "ingresso-email" | "ingresso-telefone" | "nenhuma";

export interface AuditoriaDeVenda {
  /** `"manual"` = `manual_sales` (decisão 3A); `"planilha"` = planilha de venda da etapa. */
  fonte: FonteDaVenda;
  txId: string | null;
  produto: string | null;
  /** Valor da planilha em BRL. */
  valor: number;
  /** Valor que entra no faturamento (TMB = 0). */
  valorConsiderado: number;
  tmb: boolean;
  dataBrt: string | null;
  utmLead: Utm | null;
  utmVenda: Utm;
  canal: Canal;
  fechamento: Fechamento;
  origemDaData: OrigemDaData;
  dataDoLead: string | null;
  dMais: number | null;
}

export interface TuplaClassificada {
  lead: Utm | null;
  venda: Utm | null;
  sellerName: string | null;
  canal: Canal;
  fechamento: Fechamento;
}

export interface LinhaDaTabela1 {
  canal: Canal;
  ingressos: number;
  vendas: number;
  /** `vendas ÷ ingressos` (fração). `null` para `Sem track real` (memorial §5). */
  conversao: Metrica;
}

export interface LinhaDoFechamento {
  ingressos: number;
  vendas: number;
  conversao: Metrica;
}

export interface PontoDaCoorte {
  dMais: number;
  vendas: number;
  faturamento: number;
}

export interface Coorte {
  baseDeData: "lead";
  d0: string;
  maxD: number;
  naCoorte: number;
  basePreLancamento: number;
  foraDaCoorte: (ItemDeVendaSemPii & { motivo: "SEM_DATA_DO_LEAD" | "DATA_DA_VENDA_ILEGIVEL" })[];
  alemDaJanela: (ItemDeVendaSemPii & { dMais: number })[];
  /** `naCoorte + basePreLancamento + foraDaCoorte + alemDaJanela`. */
  soma: number;
  serie: PontoDaCoorte[];
  porOrigemDaData: Record<OrigemDaData, number>;
  /**
   * Story 49.14 (AC3) — o carrinho está em curso no corte: as vendas do
   * principal vão só até o corte e a coorte é INCOMPLETA. Ausente = completa.
   */
  incompleta?: { ateDia: string; dMaisN: number; texto: string };
}

export interface DiaDoRoasCaptacao {
  dia: string;
  dMais: number;
  investimento: number;
  faturamento: number;
  investimentoPorEtapa: Record<string, number>;
  faturamentoPorEtapa: Record<string, number>;
  /** `null` em dia sem gasto (nunca `Infinity`). */
  roas: number | null;
  diaSemGasto: boolean;
  picoArtefato: boolean;
}

export interface CompradorDeCaptacao {
  /** Chave anônima (hash) do critério headline. */
  chave: string;
  canal: Canal;
  fechamento: Fechamento;
  tipos: TipoDeProdutoNaVenda[];
}

/**
 * Produto da captação fora de `product_types` (armadilha #3). `tiposAssumidos`
 * = o tipo que o default da etapa (`tipoPadraoDaEtapa`, a mesma regra do
 * painel) deu às suas vendas — a 49.5 (F14) só bloqueia quando o default não
 * resolve o papel do produto na captação.
 */
export interface ProdutoNaoClassificado {
  produto: string;
  vendas: number;
  faturamento: number;
  tiposAssumidos: TipoDeProdutoNaVenda[];
}

export interface GrupoMonetario {
  vendas: number;
  faturamento: number;
}

export interface DebriefingMoneyTime {
  versao: 1;
  /** Decisão 2A: a janela que cortou vendas e mídia, com a regra por extenso. */
  janela: JanelaDoDebriefing;
  criterioDeUnico: CriterioDeUnico;
  classificadorVersao: string;

  /**
   * R-49-4: todo valor de venda de PLANILHA saiu da célula crua pelo parser
   * único. As vendas manuais vêm do banco (`vendasManuais.origemDoValor`).
   */
  origemDoValor: Record<GrupoDaEtapa | "tmb" | "excluidas", "celula-crua">;

  // ---- Higiene ----
  higiene: {
    linhasLidas: number;
    excluidasPorStatus: ExcluidasPorStatus;
    linhasComValorNegativo: (ItemDeVendaSemPii & { planilha: string; linha: number })[];
    linhasSemValor: number;
    dedup: { camada1: ContagemDedup; camada2: ContagemDedup };
    dedupNaoAplicada: DedupPorIdNaoAplicada[];
    /**
     * REL-001: abas ligadas a mais de uma etapa do lançamento que o loader leu
     * UMA vez (com o vínculo que valeu e o critério). Também vira a lacuna
     * `FONTE_EM_MAIS_DE_UMA_ETAPA`.
     */
    fontesDuplicadas: FonteDuplicada[];
    /**
     * Regra 9 da skill: registros com UTM em array do Postgres. `vendas`/`leads`
     * = registros com algum campo desembrulhado (`{"qr","qr"}` → `qr`);
     * `ambiguas` = registros com array de valores DISTINTOS, que ficam como o
     * texto cru (`desembrulharUtm`).
     */
    utmsEmArray: { vendas: number; leads: number; ambiguas: number };
    foraDoPeriodo: Record<GrupoDaEtapa, GrupoMonetario>;
    vendasSemDia: number;
    linhasConvertidas: number;
    precoDistintoPorProduto: Record<string, number>;
    produtosComPrecoContaminado: { produto: string; valoresDistintos: number }[];
  };
  /** Atalho pedido pela 49.5 (F1): mesmo objeto de `higiene.dedup`. */
  dedup: { camada1: ContagemDedup; camada2: ContagemDedup };

  tmb: {
    vendas: number;
    valorExcluido: number;
    vendasNoPrincipal: number;
    sinalizado: boolean;
    texto: string | null;
  };

  /**
   * Decisão 3A: vendas lançadas à mão (`manual_sales`, reembolsadas fora) que
   * ENTRARAM na conta, por grupo, depois de toda a higiene. Cada uma aparece
   * com `fonte: "manual"` na auditoria.
   */
  vendasManuais: {
    linhasLidas: number;
    porGrupo: Record<GrupoDaEtapa, GrupoMonetario>;
    origemDoValor: "manual_sales.value";
  };

  faturamentoTotal: number;
  faturamentoPorEtapa: Record<GrupoDaEtapa, number>;
  faturamentoPorStageId: Record<string, number>;
  faturamentoPorTipo: Record<TipoDeProdutoNaVenda, number>;

  // ---- Mídia ----
  imposto: {
    impostoPct: number;
    impostoOrigem: "stage" | "project" | "default";
    fatorImposto: number;
    impostoAplicadoPor: "motor";
    corteDeData: string;
  };
  midia: {
    porEtapa: Record<string, MidiaAgregada & { papel: DebriefingPapel; grupo: GrupoDaEtapa }>;
    porGrupo: Record<GrupoDaEtapa, MidiaAgregada>;
    midiaDiariaPorEtapa: MidiaDiaDaEtapa[];
    investimentoTotal: Metrica;
    linhasForaDoPeriodo: number;
  };

  // ---- Captação ----
  captacao: {
    aplicavel: boolean;
    motivo?: string;
    vendasPorTipo: Record<TipoDeProdutoNaVenda, number>;
    faturamentoIngresso: Metrica;
    faturamentoCombo: Metrica;
    faturamentoOrderBump: Metrica;
    faturamentoCaptacao: Metrica;
    compradoresCaptacao: Record<CriterioDeUnico, string[]>;
    ingressosUnicos: number;
    /**
     * Compradores de captação (R2-1: comprador = `ingresso` OU `combo`) nos dois
     * critérios, lado a lado — `porEmail` é o headline (decisão 1),
     * `porEmailOuTelefone` é a comparação com a skill. É sempre
     * `compradoresCaptacao[critério].length`; os avulsos (só order bump) NÃO
     * entram (estão em `avulsos` e em `compradoresDaEtapaInclusiveAvulsos`).
     */
    compradoresUnicos: Record<CriterioDeUnico, number>;
    /**
     * Toda pessoa que comprou algo na etapa de captação, avulsos de order bump
     * incluídos. NÃO é o comprador de captação da R2-1 — serve só para fechar
     * `compradoresUnicos + avulsos` (no critério headline).
     */
    compradoresDaEtapaInclusiveAvulsos: Record<CriterioDeUnico, number>;
    comCombo: number;
    comOrderBump: number;
    comTierSuperior: Metrica;
    avulsos: { compradores: number; faturamento: number };
    ticketCaptacao: Metrica;
    produtosNaoClassificados: ProdutoNaoClassificado[];
    diferencaDeFonte: { codigo: "LEADS_DO_PAINEL"; texto: string };
    pctCompradoresPorCliques: Metrica;
  };
  compradoresCaptacao: Record<CriterioDeUnico, string[]>;
  ingressosUnicos: number;
  /** Compradores de captação (critério headline), dos quais saem as quebras. */
  compradores: CompradorDeCaptacao[];
  diferencaDeFonte: { codigo: "LEADS_DO_PAINEL"; texto: string };
  produtosNaoClassificados: ProdutoNaoClassificado[];

  // ---- Principal ----
  vendasPrincipalBrutas: number;
  vendasPrincipal: number;
  vendasExcluidas: VendaExcluida[];
  faturamentoPrincipal: Metrica;
  downsell: GrupoMonetario & { aplicavel: boolean };

  // ---- Tabela 1 ----
  tabela1: {
    canais: LinhaDaTabela1[];
    fechamento: { closer: LinhaDoFechamento; semCloser: LinhaDoFechamento };
    somas: {
      ingressosPorCanal: number;
      vendasPorCanal: number;
      ingressosPorFechamento: number;
      vendasPorFechamento: number;
      referencia: { ingressosUnicos: number; vendasPrincipal: number };
    };
  };
  tuplasClassificadas: TuplaClassificada[];
  tuplasSemNomeDeCampanha: number;
  auditoriaDeVendas: AuditoriaDeVenda[];

  // ---- Coorte ----
  coorte: Coorte;
  coortePaga: Coorte;

  // ---- Taxas e ROAS ----
  conversaoIngressoPrincipal: Metrica;
  roasSoIngresso: MetricaRazao | (Metrica & { numerador: number | null; denominador: number | null });
  roasCaptacao: MetricaRazao | (Metrica & { numerador: number | null; denominador: number | null });
  roasTotalSemTmb: Metrica & {
    numerador: number;
    denominador: number;
    decomposicao: { captacao: number; principal: number; downsell: number };
    semDownsell: Metrica;
    /**
     * Story 49.14 (AC4) — o downsell no corte: `nao-comecou` = FORA do
     * numerador (o ROAS total é o de captação + principal, dito por extenso,
     * nunca com o downsell como zero); `em-curso` = parcial. Ausente = sem corte
     * ou downsell concluído / que não houve.
     */
    downsellNoCorte?: {
      estado: "nao-comecou" | "em-curso";
      texto: string;
      /**
       * QA 49.14 MNT-001 — com o downsell que não começou: a parcela do
       * faturamento total (vendas da etapa de downsell datadas antes do início
       * dele) que fica FORA do ROAS total, em reais s/ TMB. Continua em
       * `faturamentoTotal` (sem regra nova de exclusão) — o documento a declara
       * junto do ROAS total e do Fat. Total, para a conta fechar para quem lê.
       */
      faturamentoFora?: number;
    };
  };
  teseOrderBump: {
    roasSoIngresso: number | null;
    roasCaptacao: number | null;
    veredito: "confirmada" | "nao-confirmada" | "indefinida";
  };
  apendiceReabertura: {
    aplicavel: boolean;
    vendas: number;
    faturamento: number;
    investimento: number;
    roasMarginal: Metrica;
    nota: "reaproveita audiência já paga";
  };
  referenciaCombinada: { faturamento: number; investimento: number; roas: Metrica };

  // ---- ROAS diário ----
  roasDiarioCaptacao: DiaDoRoasCaptacao[];
  limiarPicoArtefato: {
    limiarPicoArtefato: number | null;
    investimentoMedioDiarioCaptacao: number | null;
    fracao: number;
    diasDoDenominador: number;
    memoria: string;
  };

  pendencias: Pendencia[];
  lacunas: Lacuna[];
}

// ---------------------------------------------------------------------------
// Formatação da memória (pt-BR, espaço comum — nunca NBSP do Intl)
// ---------------------------------------------------------------------------

function agrupar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** `1234.5` → `"1.234,50"` (com `casas`), arredondamento meio-para-cima no absoluto. */
export function fmtNumero(v: number, casas = 2): string {
  const neg = v < 0;
  const fixo = Math.abs(v).toFixed(casas);
  const [int, dec] = fixo.split(".") as [string, string | undefined];
  return `${neg ? "-" : ""}${agrupar(int)}${dec ? `,${dec}` : ""}`;
}

export function fmtReais(v: number): string {
  return `R$ ${fmtNumero(v, 2)}`;
}

function fmtInt(v: number): string {
  return agrupar(String(Math.round(v)));
}

function fmtPct(v: number, casas = 2): string {
  return `${fmtNumero(v, casas)}%`;
}

// ---------------------------------------------------------------------------
// Divisão segura
// ---------------------------------------------------------------------------

function razao(
  numerador: number,
  denominador: number,
  rotuloNum: string,
  rotuloDen: string,
  formatar: (v: number) => string,
  opts: {
    multiplicador?: number;
    formatarResultado?: (v: number) => string;
    /** Unidade do denominador quando difere da do numerador (ex.: ticket = R$ ÷ pessoas). */
    formatarDenominador?: (v: number) => string;
  } = {},
): MetricaRazao {
  const mult = opts.multiplicador ?? 1;
  const fRes = opts.formatarResultado ?? ((v: number) => fmtNumero(v, 2));
  const fDen = opts.formatarDenominador ?? formatar;
  const textoDen = rotuloDen;
  if (!Number.isFinite(denominador) || denominador === 0 || !Number.isFinite(numerador)) {
    return {
      valor: null,
      numerador,
      denominador,
      memoria: `${rotuloNum} ${formatar(numerador)} ÷ ${textoDen} ${fDen(denominador)} — sem denominador`,
      motivo: `DIVISAO_POR_ZERO: ${textoDen} = 0`,
    };
  }
  const valor = (numerador / denominador) * mult;
  return {
    valor,
    numerador,
    denominador,
    memoria:
      `${rotuloNum} ${formatar(numerador)} ÷ ${textoDen} ${fDen(denominador)}` +
      `${mult !== 1 ? ` × ${fmtInt(mult)}` : ""} = ${fRes(valor)}`,
  };
}

function nula(motivo: string, memoria: string): Metrica & { numerador: null; denominador: null } {
  return { valor: null, motivo, memoria, numerador: null, denominador: null };
}

// ---------------------------------------------------------------------------
// Linha enriquecida (interna — nunca sai no payload)
// ---------------------------------------------------------------------------

interface Linha {
  v: VendaCruaInput;
  planilha: PlanilhaDeVendaInput;
  stageId: string;
  grupo: GrupoDaEtapa;
  tmb: boolean;
  fonte: FonteDaVenda;
  idDaVenda: string | null;
  email: string;
  telefone: string | null;
  dia: string | null;
  lido: ValorLido;
  /** Centavos que entram no faturamento (TMB = 0). Preenchido depois de `valorBrl`. */
  centavos: number;
  /** Centavos do valor da planilha (TMB inclusive). */
  centavosDaPlanilha: number;
}

const reais = (centavos: number) => centavos / 100;

function itemSemPii(l: Linha): ItemDeVendaSemPii {
  return { txId: l.idDaVenda, produto: l.v.produto, valor: reais(l.centavosDaPlanilha), dataBrt: l.dia, fonte: l.fonte };
}

const CAMPOS_DE_UTM = ["source", "medium", "campaign", "term"] as const;

/**
 * UTM aparada e com o array do Postgres desembrulhado (`{"qr","qr"}` → `qr`,
 * regra 9 de higiene da skill — `desembrulharUtm`). É ela que chega ao
 * classificador, para lead e venda. `campaignName` vem do loader (nome da
 * campanha), nunca de célula — só é aparado.
 */
function utmLimpa(u: Utm | null | undefined): Utm | null {
  if (!u) return null;
  const t = (x: string | null | undefined) => (x ?? "").trim() || null;
  return {
    source: desembrulharUtm(u.source).valor,
    medium: desembrulharUtm(u.medium).valor,
    campaign: desembrulharUtm(u.campaign).valor,
    term: desembrulharUtm(u.term).valor,
    campaignName: t(u.campaignName),
  };
}

/** Quais formatos de array aparecem nos campos de UTM de um registro. */
function formatosDeArray(u: Utm | null | undefined): { array: boolean; ambiguo: boolean } {
  let array = false;
  let ambiguo = false;
  for (const campo of CAMPOS_DE_UTM) {
    const f = desembrulharUtm(u?.[campo]).formato;
    if (f === "array") array = true;
    if (f === "array-ambiguo") ambiguo = true;
  }
  return { array, ambiguo };
}

// ---------------------------------------------------------------------------
// Mídia
// ---------------------------------------------------------------------------

function quenteFrioDe(porCampanha: ReadonlyMap<string, { nome: string; comImposto: number }>): QuenteFrio {
  let q = 0;
  let f = 0;
  let ind = 0;
  for (const c of porCampanha.values()) {
    const pub: Publico = classificarPublico(normalizarNome(c.nome));
    if (pub === "Quente") q += c.comImposto;
    else if (pub === "Frio") f += c.comImposto;
    else ind += c.comImposto;
  }
  const INV = q + f + ind;
  const share = (x: number) => (INV > 0 ? (x / INV) * 100 : null);
  return {
    INV,
    INV_QUENTE: q,
    INV_FRIO: f,
    INV_INDEFINIDO: ind,
    shareQuente: share(q),
    shareFrio: share(f),
    shareIndefinido: share(ind),
  };
}

function agregarMidia(linhas: readonly (MidiaCampanhaDiaInput & { comImposto: number })[]): MidiaAgregada {
  let bruto = 0;
  let comImposto = 0;
  let impressoes = 0;
  const porCampanha = new Map<string, { nome: string; comImposto: number }>();
  for (const l of linhas) {
    bruto += l.spendBruto;
    comImposto += l.comImposto;
    impressoes += l.impressoes;
    const c = porCampanha.get(l.campaignId);
    if (c) c.comImposto += l.comImposto;
    else porCampanha.set(l.campaignId, { nome: l.campaignName, comImposto: l.comImposto });
  }
  const linkClicks = somarLinkClicks(linhas);
  const linhasSemLinkClick = linhas.filter((l) => l.linkClicks == null).length;

  const ctrValor = ctrDeLink(linkClicks, impressoes);
  const ctr: Metrica =
    ctrValor === null
      ? {
          valor: null,
          motivo: linkClicks == null ? "LINK_CLICK_AUSENTE" : "SEM_IMPRESSOES",
          memoria:
            linkClicks == null
              ? "a Meta não devolveu link_click — CTR não medido (nunca cliques totais)"
              : `link_click ${fmtInt(linkClicks)} ÷ impressões 0 — sem denominador`,
        }
      : {
          valor: ctrValor,
          memoria: `link_click ${fmtInt(linkClicks!)} ÷ impressões ${fmtInt(impressoes)} × 100 = ${fmtPct(ctrValor)}`,
        };
  const cpcValor = cpcDeLink(linkClicks, comImposto);
  const cpc: Metrica =
    cpcValor === null
      ? {
          valor: null,
          motivo: linkClicks == null ? "LINK_CLICK_AUSENTE" : "SEM_CLIQUES",
          memoria:
            linkClicks == null
              ? "a Meta não devolveu link_click — CPC não medido (nunca cliques totais)"
              : `investimento c/ imposto ${fmtReais(comImposto)} ÷ link_click 0 — sem denominador`,
        }
      : {
          valor: cpcValor,
          memoria: `investimento c/ imposto ${fmtReais(comImposto)} ÷ link_click ${fmtInt(linkClicks!)} = ${fmtReais(cpcValor)}`,
        };
  const cpm: Metrica =
    impressoes > 0
      ? {
          valor: (comImposto / impressoes) * 1000,
          memoria: `investimento c/ imposto ${fmtReais(comImposto)} ÷ impressões ${fmtInt(impressoes)} × 1.000 = ${fmtReais((comImposto / impressoes) * 1000)}`,
        }
      : { valor: null, motivo: "SEM_IMPRESSOES", memoria: "sem impressões no período" };

  return {
    investimentoBruto: bruto,
    investimentoComImposto: comImposto,
    impressoes,
    linkClicks,
    linhasSemLinkClick,
    ctr,
    cpc,
    cpm,
    quenteFrio: quenteFrioDe(porCampanha),
  };
}

// ---------------------------------------------------------------------------
// Coorte
// ---------------------------------------------------------------------------

interface DataEscolhida {
  dia: string | null;
  utm: Utm | null;
}

/**
 * Índice "a entrada mais antiga" por chave: entre as entradas da mesma chave,
 * vence a de menor dia legível; sem nenhuma datada, a primeira na ordem
 * (memorial §8.5: e-mail com múltiplas entradas → a mais antiga).
 */
function indiceMaisAntigo<T>(
  itens: readonly T[],
  chave: (t: T) => string | null,
  dia: (t: T) => string | null,
  utm: (t: T) => Utm | null,
): Map<string, DataEscolhida> {
  const m = new Map<string, DataEscolhida>();
  for (const it of itens) {
    const k = chave(it);
    if (!k) continue;
    const d = dia(it);
    const atual = m.get(k);
    if (!atual) {
      m.set(k, { dia: d, utm: utm(it) });
      continue;
    }
    if (d !== null && (atual.dia === null || d < atual.dia)) m.set(k, { dia: d, utm: utm(it) });
  }
  return m;
}

function coorteVazia(d0: string, maxD: number): Coorte {
  return {
    baseDeData: "lead",
    d0,
    maxD,
    naCoorte: 0,
    basePreLancamento: 0,
    foraDaCoorte: [],
    alemDaJanela: [],
    soma: 0,
    serie: Array.from({ length: maxD + 1 }, (_, i) => ({ dMais: i, vendas: 0, faturamento: 0 })),
    porOrigemDaData: {
      "lead-email": 0,
      "lead-telefone": 0,
      "ingresso-email": 0,
      "ingresso-telefone": 0,
      nenhuma: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export function computeDebriefingMoneyTime(input: DebriefingMoneyTimeInput): DebriefingMoneyTime {
  const { config, criterioDeUnico, classificador } = input;
  if (criterioDeUnico !== "porEmail" && criterioDeUnico !== "porEmailOuTelefone") {
    throw new Error(`computeDebriefingMoneyTime: criterioDeUnico obrigatório ("porEmail" | "porEmailOuTelefone"), veio ${String(criterioDeUnico)}`);
  }
  const maxD = input.maxD ?? MAXD_PADRAO;
  if (!Number.isInteger(maxD) || maxD < 0) throw new Error(`computeDebriefingMoneyTime: maxD inválido: ${String(maxD)}`);
  const d0 = config.datasChave.inicioCaptacao;
  // Decisão 2A: uma regra só para a janela (o loader lê a mídia nela também).
  // 49.12: com corte (parcial ou comparação em D+N), o fim é o corte.
  const janela = janelaDaGeracao(config);
  // 49.12: `null` = o carrinho "ainda não aconteceu" — toda venda datada é anterior a ele.
  const abertura = config.datasChave.aberturaCarrinho;
  // 49.12 (AC5): com corte, NADA depois dele entra — nem lead (a data do lead
  // da coorte e a contagem de UTM em array). Sem corte, a lista de sempre.
  // 49.14 (AC6, R9-5): com todas as fases concluídas, nada além do que o final corta.
  const corteDosLeads = diaDoCorteDeLeadsEPesquisa(janela);
  const leadsDaConta = corteDosLeads !== null ? leadsAteOCorte(input.leads, corteDosLeads) : input.leads;
  const pct = config.imposto.valor;

  const papelDaEtapa = new Map<string, DebriefingPapel>(config.etapas.map((e) => [e.stageId, e.papel]));
  const grupoDaEtapa = (stageId: string): GrupoDaEtapa | null => {
    const p = papelDaEtapa.get(stageId);
    return p ? GRUPO_DO_PAPEL[p] : null;
  };
  const planilhaPorId = new Map(input.planilhas.map((p) => [p.planilhaId, p]));
  const pendencias: Pendencia[] = [];
  const lacunas: Lacuna[] = [];

  // ===================================================================
  // 1. Higiene
  // ===================================================================
  const lidas: Linha[] = [];
  const vendasForaDaConfig = new Map<string, number>();
  for (const v of input.vendas) {
    const planilha = planilhaPorId.get(v.planilhaId);
    if (!planilha) {
      throw new Error(`computeDebriefingMoneyTime: venda de planilha desconhecida (${v.planilhaId}) — o loader entrega as planilhas junto`);
    }
    const grupo = grupoDaEtapa(planilha.stageId);
    if (!grupo) {
      vendasForaDaConfig.set(planilha.stageId, (vendasForaDaConfig.get(planilha.stageId) ?? 0) + 1);
      continue;
    }
    lidas.push({
      v,
      planilha,
      stageId: planilha.stageId,
      grupo,
      tmb: ehTmb(planilha.plataforma),
      fonte: ehManual(planilha.plataforma) ? "manual" : "planilha",
      idDaVenda: (v.idDaVendaCru ?? "").trim() || null,
      email: normalizarEmail(v.emailCru),
      telefone: normalizarTelefone(v.telefoneCru),
      dia: dataBrt(v.dataVendaCru),
      lido: lerValorMonetario(v.valorBrutoCru),
      centavos: 0,
      centavosDaPlanilha: 0,
    });
  }
  for (const [stageId, n] of vendasForaDaConfig) {
    pendencias.push({
      codigo: "VENDA_DE_ETAPA_FORA_DA_CONFIG",
      stageId,
      detalhe: `${n} linha(s) de venda de uma etapa que não está em config.etapas — fora de toda conta`,
    });
  }

  const { pagas, excluidasPorStatus } = filtrarPorStatus(lidas, {
    planilhaId: (l) => l.v.planilhaId,
    statusCru: (l) => l.v.statusCru,
    idDaVenda: (l) => l.idDaVenda,
    temColunaStatus: (id) => planilhaPorId.get(id)?.temColunaStatus ?? false,
  });

  // Anomalias de valor ANTES da dedup (só disputa a vaga quem contaria como venda).
  const linhasComValorNegativo: DebriefingMoneyTime["higiene"]["linhasComValorNegativo"] = [];
  let linhasSemValor = 0;
  const candidatas: Linha[] = [];
  for (const l of pagas) {
    if (l.lido.negativo) {
      linhasComValorNegativo.push({
        planilha: l.planilha.nome,
        linha: l.v.linha,
        txId: l.idDaVenda,
        produto: l.v.produto,
        valor: -l.lido.valor,
        dataBrt: l.dia,
        fonte: l.fonte,
      });
      continue;
    }
    // TMB conta a venda mesmo sem valor; fora do TMB, linha sem valor não é venda.
    if (!l.tmb && !(l.lido.valor > 0)) {
      linhasSemValor += 1;
      continue;
    }
    candidatas.push(l);
  }

  const planilhasParaDedup = new Map<string, PlanilhaParaDedup>(
    input.planilhas.map((p) => [
      p.planilhaId,
      {
        planilhaId: p.planilhaId,
        nome: p.nome,
        temColunaId: p.temColunaId,
        temColunaProduto: p.temColunaProduto,
        camada2Vale: p.camada2Vale,
      },
    ]),
  );
  const dedup = deduplicarVendas(
    candidatas,
    {
      planilhaId: (l) => l.v.planilhaId,
      idDaVenda: (l) => l.idDaVenda,
      produto: (l) => l.v.produto,
      emailCru: (l) => l.v.emailCru,
    },
    planilhasParaDedup,
  );
  if (dedup.dedupNaoAplicada.length > 0) {
    lacunas.push({
      codigo: "DEDUP_POR_ID_NAO_APLICADA",
      motivo: "planilha sem a coluna de ID da venda ou de produto mapeada — a dedup por ID (camada 1) não rodou nela",
      detalhe: dedup.dedupNaoAplicada.map((d) => `${d.planilha}: falta ${d.faltando.join(" e ")}`).join("; "),
    });
  }
  const fontesDuplicadas = [...(input.fontesDuplicadas ?? [])].map((f) => ({ ...f, vinculos: f.vinculos.map((v) => ({ ...v })) }));
  if (fontesDuplicadas.length > 0) {
    lacunas.push({
      codigo: "FONTE_EM_MAIS_DE_UMA_ETAPA",
      motivo:
        "a mesma aba de planilha está ligada a mais de uma etapa do lançamento — foi lida UMA vez, com o vínculo que vale (REL-001); revisar os vínculos na configuração do funil",
      detalhe: fontesDuplicadas
        .map(
          (f) =>
            `${f.aba}: ${f.vinculos.length} vínculos (${f.vinculos.map((v) => v.papel).join(", ")}); vale o da etapa ${f.stageIdQueVale} (${f.criterio}); ${f.linhasNaoRelidas} linha(s) não relidas`,
        )
        .join("; "),
    });
  }

  // Regra 9 da skill: UTM em array do Postgres — contada aqui, desembrulhada em `utmLimpa`.
  const utmsEmArray = { vendas: 0, leads: 0, ambiguas: 0 };
  const contarArray = (u: Utm, quem: "vendas" | "leads") => {
    const f = formatosDeArray(u);
    if (f.array) utmsEmArray[quem] += 1;
    if (f.ambiguo) utmsEmArray.ambiguas += 1;
  };
  for (const l of lidas) contarArray(l.v.utm, "vendas");
  for (const l of leadsDaConta) contarArray(l.utm, "leads");

  // Valor em BRL (moeda estrangeira por mediana × 0,5 → preço modal BRL).
  const naoTmb = dedup.mantidas.filter((l) => !l.tmb);
  const resultadoValor = valorBrl(
    naoTmb.map((l) => ({ produto: l.v.produto, preco: l.lido.valor, moeda: l.v.moeda, data: l.dia ?? "" })),
  );
  const valorPorLinha = new Map<Linha, number>();
  naoTmb.forEach((l, i) => valorPorLinha.set(l, resultadoValor.valores[i] ?? 0));
  const mantidas: Linha[] = dedup.mantidas.map((l) => {
    const daPlanilha = l.tmb ? l.lido.valor : (valorPorLinha.get(l) ?? 0);
    const c = emCentavos(daPlanilha);
    return { ...l, centavosDaPlanilha: c, centavos: l.tmb ? 0 : c };
  });
  if (resultadoValor.linhasConvertidas > 0) {
    lacunas.push({
      codigo: "PRECO_ORIGINAL_NAO_MAPEADO",
      motivo: "linhas em moeda estrangeira convertidas pelo preço modal em BRL — o Loyola não mapeia a coluna \"Preço Original\" da skill",
      detalhe: `${resultadoValor.linhasConvertidas} linha(s); produtos: ${resultadoValor.produtosConvertidos.join(", ")}`,
    });
  }

  // Corte de janela — DEPOIS da dedup (a venda ganha um dia, o da sobrevivente).
  const foraDoPeriodo: Record<GrupoDaEtapa, GrupoMonetario> = {
    captacao: { vendas: 0, faturamento: 0 },
    principal: { vendas: 0, faturamento: 0 },
    downsell: { vendas: 0, faturamento: 0 },
    reabertura: { vendas: 0, faturamento: 0 },
  };
  const foraCent: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  let vendasSemDia = 0;
  const noPeriodo: Linha[] = [];
  for (const l of mantidas) {
    if (l.dia === null) {
      vendasSemDia += 1;
      noPeriodo.push(l);
      continue;
    }
    if (l.dia < janela.inicio || l.dia > janela.fim) {
      foraDoPeriodo[l.grupo].vendas += 1;
      foraCent[l.grupo] += l.centavos;
      continue;
    }
    noPeriodo.push(l);
  }
  for (const g of GRUPOS) foraDoPeriodo[g].faturamento = reais(foraCent[g]);

  // Exclusão automática do principal anterior à abertura (decisão 7; R2-4: só por data).
  const vendasExcluidas: VendaExcluida[] = [];
  const contaveis: Linha[] = [];
  let vendasPrincipalBrutas = 0;
  for (const l of noPeriodo) {
    if (l.grupo === "principal") {
      vendasPrincipalBrutas += 1;
      if (l.dia !== null && anteriorAAbertura(l.dia, abertura)) {
        vendasExcluidas.push({ ...itemSemPii(l), motivo: "ANTERIOR_A_ABERTURA" });
        continue;
      }
    }
    contaveis.push(l);
  }
  if (vendasExcluidas.length > 0) {
    const total = vendasExcluidas.reduce((s, x) => s + emCentavos(x.valor), 0);
    lacunas.push({
      codigo: "VENDAS_EXCLUIDAS_AUTOMATICAMENTE",
      motivo: `venda do principal com data anterior à abertura do carrinho (${abertura ?? "que ainda não aconteceu"}) — excluída e listada (decisão 7 do dono)`,
      detalhe: `${vendasExcluidas.length} venda(s), ${fmtReais(reais(total))}`,
    });
  }

  // ===================================================================
  // 2. Faturamento (centavos) e TMB
  // ===================================================================
  const fatGrupoCent: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  const fatTipoCent: Record<TipoDeProdutoNaVenda, number> = { ingresso: 0, combo: 0, order_bump: 0, principal: 0, upsell: 0 };
  const fatStageCent: Record<string, number> = {};
  for (const e of config.etapas) fatStageCent[e.stageId] = 0;
  const vendasGrupo: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  let tmbVendas = 0;
  let tmbCent = 0;
  let tmbNoPrincipal = 0;
  const tmbPorGrupo: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  const manualPorGrupo: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  const manualCentPorGrupo: Record<GrupoDaEtapa, number> = { captacao: 0, principal: 0, downsell: 0, reabertura: 0 };
  for (const l of contaveis) {
    if (l.fonte === "manual") {
      manualPorGrupo[l.grupo] += 1;
      manualCentPorGrupo[l.grupo] += l.centavos;
    }
    vendasGrupo[l.grupo] += 1;
    fatGrupoCent[l.grupo] += l.centavos;
    fatTipoCent[l.v.tipo] += l.centavos;
    fatStageCent[l.stageId] = (fatStageCent[l.stageId] ?? 0) + l.centavos;
    if (l.tmb) {
      tmbVendas += 1;
      tmbCent += l.centavosDaPlanilha;
      tmbPorGrupo[l.grupo] += 1;
      if (l.grupo === "principal") tmbNoPrincipal += 1;
    }
  }
  const faturamentoTotalCent = GRUPOS.reduce((s, g) => s + fatGrupoCent[g], 0);
  const notaTmb = (g: GrupoDaEtapa): string =>
    (tmbPorGrupo[g] > 0 ? ` (${textoTmb(vendasGrupo[g], tmbPorGrupo[g])})` : "") +
    (manualPorGrupo[g] > 0
      ? ` (inclui ${manualPorGrupo[g]} venda(s) manual(is), ${fmtReais(reais(manualCentPorGrupo[g]))})`
      : "");

  // ===================================================================
  // 3. Mídia
  // ===================================================================
  const midiaComImposto: (MidiaCampanhaDiaInput & { comImposto: number })[] = [];
  let linhasMidiaFora = 0;
  const midiaForaDaConfig = new Map<string, number>();
  for (const m of input.midia) {
    if (m.dia < janela.inicio || m.dia > janela.fim) {
      linhasMidiaFora += 1;
      continue;
    }
    if (!grupoDaEtapa(m.stageId)) {
      midiaForaDaConfig.set(m.stageId, (midiaForaDaConfig.get(m.stageId) ?? 0) + 1);
      continue;
    }
    midiaComImposto.push({ ...m, comImposto: aplicarImposto(m.spendBruto, m.dia, pct) });
  }
  for (const [stageId, n] of midiaForaDaConfig) {
    pendencias.push({
      codigo: "MIDIA_DE_ETAPA_FORA_DA_CONFIG",
      stageId,
      detalhe: `${n} linha(s) de mídia de uma etapa que não está em config.etapas — fora de toda conta`,
    });
  }

  const porEtapa: DebriefingMoneyTime["midia"]["porEtapa"] = {};
  for (const e of config.etapas) {
    porEtapa[e.stageId] = {
      ...agregarMidia(midiaComImposto.filter((m) => m.stageId === e.stageId)),
      papel: e.papel,
      grupo: GRUPO_DO_PAPEL[e.papel],
    };
  }
  const porGrupo = Object.fromEntries(
    GRUPOS.map((g) => [g, agregarMidia(midiaComImposto.filter((m) => grupoDaEtapa(m.stageId) === g))]),
  ) as Record<GrupoDaEtapa, MidiaAgregada>;

  const diaria = new Map<string, MidiaDiaDaEtapa>();
  for (const m of midiaComImposto) {
    const k = `${m.stageId}\u0000${m.dia}`;
    const d = diaria.get(k);
    if (d) {
      d.bruto += m.spendBruto;
      d.comImposto += m.comImposto;
    } else diaria.set(k, { dia: m.dia, stageId: m.stageId, bruto: m.spendBruto, comImposto: m.comImposto });
  }
  const midiaDiariaPorEtapa = [...diaria.values()].sort((a, b) =>
    a.stageId === b.stageId ? (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0) : a.stageId < b.stageId ? -1 : 1,
  );

  // Campanhas sem fase/público: nunca descartadas em silêncio.
  const campanhasVistas = new Map<string, { stageId: string; campaignId: string; nome: string; comImposto: number }>();
  for (const m of midiaComImposto) {
    const k = `${m.stageId}\u0000${m.campaignId}`;
    const c = campanhasVistas.get(k);
    if (c) c.comImposto += m.comImposto;
    else campanhasVistas.set(k, { stageId: m.stageId, campaignId: m.campaignId, nome: m.campaignName, comImposto: m.comImposto });
  }
  for (const c of campanhasVistas.values()) {
    if (classificarFase(c.nome) === FASE_NAO_PADRAO) {
      pendencias.push({
        codigo: "CAMPANHA_SEM_FASE",
        stageId: c.stageId,
        campaignId: c.campaignId,
        campaignName: c.nome,
        investimentoComImposto: c.comImposto,
        detalhe: "nome não casa nenhum prefixo de fase — o investimento conta na etapa pelo vínculo",
      });
    }
    if (classificarPublico(normalizarNome(c.nome)) === "Indefinido") {
      pendencias.push({
        codigo: "CAMPANHA_SEM_PUBLICO",
        stageId: c.stageId,
        campaignId: c.campaignId,
        campaignName: c.nome,
        investimentoComImposto: c.comImposto,
        detalhe: "nome sem hot/quente nem cold/frio — investimento em INV_INDEFINIDO",
      });
    }
  }

  const invCaptacao = porGrupo.captacao.investimentoComImposto;
  const invPrincipal = porGrupo.principal.investimentoComImposto;
  const invDownsell = porGrupo.downsell.investimentoComImposto;
  const invReabertura = porGrupo.reabertura.investimentoComImposto;
  const invTotal = invCaptacao + invPrincipal + invDownsell;

  // ===================================================================
  // 4. Leads (índices por e-mail e telefone — a mais antiga)
  // ===================================================================
  const leadsLidos = leadsDaConta.map((l) => ({
    email: normalizarEmail(l.emailCru),
    telefone: normalizarTelefone(l.telefoneCru),
    dia: dataBrt(l.dataCriacaoCru),
    utm: utmLimpa(l.utm),
  }));
  const leadPorEmail = indiceMaisAntigo(leadsLidos, (l) => l.email || null, (l) => l.dia, (l) => l.utm);
  const leadPorTelefone = indiceMaisAntigo(leadsLidos, (l) => l.telefone, (l) => l.dia, (l) => l.utm);
  const leadDe = (l: Linha): DataEscolhida | null =>
    (l.email ? leadPorEmail.get(l.email) : undefined) ?? (l.telefone ? leadPorTelefone.get(l.telefone) : undefined) ?? null;

  // Ingressos (captação ingresso ∪ combo, já higienizados; todas as datas).
  const ingressosParaData = mantidas.filter(
    (l) => l.grupo === "captacao" && (l.v.tipo === "ingresso" || l.v.tipo === "combo"),
  );
  const ingressoPorEmail = indiceMaisAntigo(ingressosParaData, (l) => l.email || null, (l) => l.dia, () => null);
  const ingressoPorTelefone = indiceMaisAntigo(ingressosParaData, (l) => l.telefone, (l) => l.dia, () => null);

  // ===================================================================
  // 5. Classificação (uma vez por ingresso único e por venda do principal)
  // ===================================================================
  const tuplas = new Map<string, TuplaClassificada>();
  const classificar = (lead: Utm | null, venda: Utm | null, sellerName: string | null) => {
    const sn = (sellerName ?? "").trim() || null;
    const r = classificador.classificar({ lead, venda, sellerName: sn });
    const k = JSON.stringify([lead, venda, sn]);
    if (!tuplas.has(k)) tuplas.set(k, { lead, venda, sellerName: sn, canal: r.canal, fechamento: r.fechamento });
    return r;
  };

  // ===================================================================
  // 6. Captação
  // ===================================================================
  const linhasCap = contaveis.filter((l) => l.grupo === "captacao");
  const capAplicavel = input.planilhas.some((p) => grupoDaEtapa(p.stageId) === "captacao");
  const chaves = chavesDeComprador(
    linhasCap.map((l) => ({ emailCru: l.v.emailCru, telefoneCru: l.v.telefoneCru, planilhaId: l.v.planilhaId, linha: l.v.linha })),
  );
  const ancora = (t: TipoDeProdutoNaVenda) => t === "ingresso" || t === "combo";

  const compradoresCaptacao: Record<CriterioDeUnico, string[]> = { porEmail: [], porEmailOuTelefone: [] };
  const compradoresUnicos: Record<CriterioDeUnico, number> = { porEmail: 0, porEmailOuTelefone: 0 };
  const compradoresDaEtapaInclusiveAvulsos: Record<CriterioDeUnico, number> = { porEmail: 0, porEmailOuTelefone: 0 };
  for (const crit of ["porEmail", "porEmailOuTelefone"] as const) {
    const todos = new Set<string>();
    const ancorados = new Set<string>();
    linhasCap.forEach((l, i) => {
      const k = chaves[crit][i]!;
      todos.add(k);
      if (ancora(l.v.tipo)) ancorados.add(k);
    });
    compradoresCaptacao[crit] = [...ancorados].sort();
    // R2-1: comprador de captação = ingresso OU combo. Avulso de bump fica fora.
    compradoresUnicos[crit] = compradoresCaptacao[crit].length;
    compradoresDaEtapaInclusiveAvulsos[crit] = todos.size;
  }

  // Por comprador (critério headline): tipos e linha representativa.
  const porComprador = new Map<string, { tipos: Set<TipoDeProdutoNaVenda>; rep: Linha | null; centavos: number }>();
  linhasCap.forEach((l, i) => {
    const k = chaves[criterioDeUnico][i]!;
    let c = porComprador.get(k);
    if (!c) {
      c = { tipos: new Set(), rep: null, centavos: 0 };
      porComprador.set(k, c);
    }
    c.tipos.add(l.v.tipo);
    c.centavos += l.centavos;
    if (!c.rep && ancora(l.v.tipo)) c.rep = l;
  });

  const headlineSet = new Set(compradoresCaptacao[criterioDeUnico]);
  let comCombo = 0;
  let comOrderBump = 0;
  let comTier = 0;
  let avulsos = 0;
  let avulsosCent = 0;
  const compradores: CompradorDeCaptacao[] = [];
  for (const [chave, c] of porComprador) {
    if (!headlineSet.has(chave)) {
      avulsos += 1;
      avulsosCent += c.centavos;
      continue;
    }
    const temCombo = c.tipos.has("combo");
    const temBump = c.tipos.has("order_bump");
    if (temCombo) comCombo += 1;
    if (temBump) comOrderBump += 1;
    if (temCombo || temBump) comTier += 1;
    const rep = c.rep!;
    const lead = leadDe(rep);
    const r = classificar(lead?.utm ?? null, utmLimpa(rep.v.utm), rep.v.sellerName);
    compradores.push({ chave, canal: r.canal, fechamento: r.fechamento, tipos: TIPOS.filter((t) => c.tipos.has(t)) });
  }
  compradores.sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  const ingressosUnicos = compradoresCaptacao[criterioDeUnico].length;

  const vendasPorTipoCap: Record<TipoDeProdutoNaVenda, number> = { ingresso: 0, combo: 0, order_bump: 0, principal: 0, upsell: 0 };
  const fatTipoCapCent: Record<TipoDeProdutoNaVenda, number> = { ingresso: 0, combo: 0, order_bump: 0, principal: 0, upsell: 0 };
  const naoClassificados = new Map<string, { produto: string; vendas: number; centavos: number; tipos: Set<TipoDeProdutoNaVenda> }>();
  for (const l of linhasCap) {
    vendasPorTipoCap[l.v.tipo] += 1;
    fatTipoCapCent[l.v.tipo] += l.centavos;
    if (!l.v.tipoClassificado) {
      const nome = (l.v.produto ?? "").trim() || "(sem produto)";
      const k = nome.toLowerCase();
      const n = naoClassificados.get(k);
      if (n) {
        n.vendas += 1;
        n.centavos += l.centavos;
        n.tipos.add(l.v.tipo);
      } else naoClassificados.set(k, { produto: nome, vendas: 1, centavos: l.centavos, tipos: new Set([l.v.tipo]) });
    }
  }
  for (const t of ["principal", "upsell"] as const) {
    if (vendasPorTipoCap[t] > 0) {
      pendencias.push({
        codigo: "TIPO_INESPERADO_NA_CAPTACAO",
        detalhe: `${vendasPorTipoCap[t]} venda(s) de tipo "${t}" em etapa de captação — fora de ingresso/combo/order bump, entram só no faturamento da etapa`,
      });
    }
  }
  const produtosNaoClassificados = [...naoClassificados.values()]
    .map((n) => ({
      produto: n.produto,
      vendas: n.vendas,
      faturamento: reais(n.centavos),
      tiposAssumidos: TIPOS.filter((t) => n.tipos.has(t)),
    }))
    .sort((a, b) => (a.produto < b.produto ? -1 : a.produto > b.produto ? 1 : 0));

  const fatCapCent = fatTipoCapCent.ingresso + fatTipoCapCent.combo + fatTipoCapCent.order_bump;
  const motivoGratuita = "CAPTACAO_GRATUITA: etapa de captação sem planilha de venda/ingresso";
  const metricaFat = (cent: number, rotulo: string): Metrica =>
    capAplicavel
      ? { valor: reais(cent), memoria: `Σ ${rotulo} (status pago, deduplicado, s/ TMB) = ${fmtReais(reais(cent))}${notaTmb("captacao")}` }
      : { valor: null, motivo: motivoGratuita, memoria: "captação sem venda — não se aplica" };

  const diferencaDeFonte = {
    codigo: "LEADS_DO_PAINEL" as const,
    texto:
      "o \"# Leads\" oficial do Debriefing diário não existe no Loyola — o número do resumo é o de ingressos deduplicados da planilha de vendas",
  };

  const comTierSuperior: Metrica = capAplicavel
    ? razao(comTier, ingressosUnicos, "compradores de captação com combo ou order bump", "compradores de captação", fmtInt, {
        formatarResultado: (v) => fmtNumero(v, 4),
      })
    : { valor: null, motivo: motivoGratuita, memoria: "captação sem venda — não se aplica" };

  const ticketCaptacao: Metrica = capAplicavel
    ? (() => {
        // MNT-001: dinheiro ÷ pessoas — o denominador é contagem, não R$.
        const r = razao(reais(fatCapCent), ingressosUnicos, "faturamento da captação", "compradores de captação", fmtReais, {
          formatarResultado: fmtReais,
          formatarDenominador: fmtInt,
        });
        const extra =
          avulsos > 0
            ? ` — o numerador inclui ${fmtReais(reais(avulsosCent))} de ${avulsos} comprador(es) só de order bump (avulsos), que não entram no denominador`
            : "";
        return { ...r, memoria: `${r.memoria}${extra}${notaTmb("captacao")}` };
      })()
    : { valor: null, motivo: motivoGratuita, memoria: "captação sem venda — não se aplica" };

  const linkCap = porGrupo.captacao.linkClicks;
  const pctCompradoresPorCliques: Metrica = !capAplicavel
    ? { valor: null, motivo: motivoGratuita, memoria: "captação sem venda — não se aplica" }
    : linkCap == null
      ? {
          valor: null,
          motivo: "LINK_CLICK_AUSENTE",
          memoria: "a Meta não devolveu link_click na captação — taxa não medida (nunca cliques totais)",
        }
      : razao(ingressosUnicos, linkCap, "compradores de captação", "link_click da captação", fmtInt, {
          multiplicador: 100,
          formatarResultado: (v) => fmtPct(v),
        });

  // ===================================================================
  // 7. Principal: Tabela 1, auditoria e coorte
  // ===================================================================
  const linhasPrincipal = contaveis.filter((l) => l.grupo === "principal");
  const vendasPrincipal = linhasPrincipal.length;

  const coorte = coorteVazia(d0, maxD);
  const coortePaga = coorteVazia(d0, maxD);
  const auditoriaDeVendas: AuditoriaDeVenda[] = [];
  const vendasPorCanal = new Map<Canal, number>(CANAIS.map((c) => [c, 0]));
  const vendasPorFechamento: Record<Fechamento, number> = { closer: 0, "sem-closer": 0 };

  for (const l of linhasPrincipal) {
    const lead = leadDe(l);
    const utmVenda = utmLimpa(l.v.utm) ?? {};
    const r = classificar(lead?.utm ?? null, utmLimpa(l.v.utm), l.v.sellerName);
    vendasPorCanal.set(r.canal, (vendasPorCanal.get(r.canal) ?? 0) + 1);
    vendasPorFechamento[r.fechamento] += 1;

    // Data do lead: lead e-mail → lead telefone → ingresso e-mail → ingresso telefone.
    let origemDaData: OrigemDaData = "nenhuma";
    let dataDoLead: string | null = null;
    const tentar = (o: OrigemDaData, d: DataEscolhida | undefined) => {
      if (origemDaData === "nenhuma" && d?.dia) {
        origemDaData = o;
        dataDoLead = d.dia;
      }
    };
    tentar("lead-email", l.email ? leadPorEmail.get(l.email) : undefined);
    tentar("lead-telefone", l.telefone ? leadPorTelefone.get(l.telefone) : undefined);
    tentar("ingresso-email", l.email ? ingressoPorEmail.get(l.email) : undefined);
    tentar("ingresso-telefone", l.telefone ? ingressoPorTelefone.get(l.telefone) : undefined);

    const dMais = dataDoLead !== null && l.dia !== null ? diasEntre(d0, dataDoLead) : null;
    auditoriaDeVendas.push({
      fonte: l.fonte,
      txId: l.idDaVenda,
      produto: l.v.produto,
      valor: reais(l.centavosDaPlanilha),
      valorConsiderado: reais(l.centavos),
      tmb: l.tmb,
      dataBrt: l.dia,
      utmLead: lead?.utm ?? null,
      utmVenda,
      canal: r.canal,
      fechamento: r.fechamento,
      origemDaData,
      dataDoLead,
      dMais,
    });

    const alvo = CANAIS_PAGOS.has(r.canal) ? [coorte, coortePaga] : [coorte];
    for (const c of alvo) {
      c.porOrigemDaData[origemDaData] += 1;
      if (l.dia === null) {
        c.foraDaCoorte.push({ ...itemSemPii(l), motivo: "DATA_DA_VENDA_ILEGIVEL" });
      } else if (dataDoLead === null) {
        c.foraDaCoorte.push({ ...itemSemPii(l), motivo: "SEM_DATA_DO_LEAD" });
      } else if (dMais! < 0) {
        c.basePreLancamento += 1;
      } else if (dMais! > maxD) {
        c.alemDaJanela.push({ ...itemSemPii(l), dMais: dMais! });
      } else {
        c.naCoorte += 1;
        const p = c.serie[dMais!]!;
        p.vendas += 1;
        p.faturamento = reais(emCentavos(p.faturamento) + l.centavos);
      }
    }
  }
  for (const c of [coorte, coortePaga]) {
    c.soma = c.naCoorte + c.basePreLancamento + c.foraDaCoorte.length + c.alemDaJanela.length;
  }
  if (coorte.foraDaCoorte.length > 0) {
    lacunas.push({
      codigo: "VENDAS_SEM_DATA",
      motivo: "venda do principal sem data do lead (lead nem ingresso por e-mail/telefone) ou com data ilegível — fora da coorte, listada à parte",
      detalhe: `${coorte.foraDaCoorte.length} venda(s)`,
    });
  }

  // Tabela 1 — ingressos por canal (dos compradores de captação) e vendas do principal.
  const ingressosPorCanal = new Map<Canal, number>(CANAIS.map((c) => [c, 0]));
  const ingressosPorFechamento: Record<Fechamento, number> = { closer: 0, "sem-closer": 0 };
  for (const c of compradores) {
    ingressosPorCanal.set(c.canal, (ingressosPorCanal.get(c.canal) ?? 0) + 1);
    ingressosPorFechamento[c.fechamento] += 1;
  }
  const canais: LinhaDaTabela1[] = CANAIS.map((canal) => {
    const ing = ingressosPorCanal.get(canal) ?? 0;
    const ven = vendasPorCanal.get(canal) ?? 0;
    const conversao: Metrica =
      canal === "Sem track real"
        ? {
            valor: null,
            motivo: "SEM_TRACK_SEM_CONVERSAO",
            memoria:
              "não se calcula conversão para Sem track real: numerador e denominador vêm de lacunas de rastreio diferentes (memorial §5; tasks/07 §7.1)",
          }
        : razao(ven, ing, `vendas do principal (${canal})`, `ingressos (${canal})`, fmtInt, {
            formatarResultado: (v) => fmtNumero(v, 4),
          });
    return { canal, ingressos: ing, vendas: ven, conversao };
  });
  const linhaFech = (f: Fechamento): LinhaDoFechamento => ({
    ingressos: ingressosPorFechamento[f],
    vendas: vendasPorFechamento[f],
    conversao: razao(vendasPorFechamento[f], ingressosPorFechamento[f], `vendas do principal (${f})`, `ingressos (${f})`, fmtInt, {
      formatarResultado: (v) => fmtNumero(v, 4),
    }),
  });

  const tuplasClassificadas = [...tuplas.values()];
  const tuplasSemNomeDeCampanha = tuplasClassificadas.filter((t) =>
    [t.lead, t.venda].some((u) => u && u.campaign && !u.campaignName),
  ).length;

  lacunas.push({ codigo: "LISTAS_FRONT_COMUNIDADE", motivo: "sem fonte no Loyola" });
  lacunas.push({ codigo: "LEADS_DO_PAINEL", motivo: diferencaDeFonte.texto });

  // ===================================================================
  // 8. Taxas e ROAS
  // ===================================================================
  const conversaoIngressoPrincipal = capAplicavel
    ? razao(vendasPrincipal, ingressosUnicos, "vendas do principal", "compradores de captação", fmtInt, {
        formatarResultado: (v) => fmtNumero(v, 4),
      })
    : { valor: null, motivo: motivoGratuita, memoria: "sem compradores de captação — a única conversão válida (Ingresso → Principal) não se aplica" };

  const fatIngresso = reais(fatTipoCapCent.ingresso);
  const fatCaptacao = reais(fatCapCent);
  const semInvCap = "SEM_INVESTIMENTO_DE_CAPTACAO";
  const roasSoIngresso = !capAplicavel
    ? nula(motivoGratuita, "captação sem venda — não se aplica")
    : razao(fatIngresso, invCaptacao, "faturamento de ingresso", "investimento de captação c/ imposto", fmtReais);
  const roasCaptacao = !capAplicavel
    ? nula(motivoGratuita, "captação sem venda — não se aplica")
    : razao(fatCaptacao, invCaptacao, "faturamento da captação (ingresso + combo + order bump)", "investimento de captação c/ imposto", fmtReais);
  if (roasSoIngresso.valor === null && capAplicavel && invCaptacao === 0) roasSoIngresso.motivo = semInvCap;
  if (roasCaptacao.valor === null && capAplicavel && invCaptacao === 0) roasCaptacao.motivo = semInvCap;

  const numTotalCent = fatGrupoCent.captacao + fatGrupoCent.principal + fatGrupoCent.downsell;
  const baseTotal = razao(
    reais(numTotalCent),
    invTotal,
    "faturamento s/ TMB (captação + principal + downsell)",
    "investimento total de mídia c/ imposto",
    fmtReais,
  );
  const semDownsell = razao(
    reais(fatGrupoCent.captacao + fatGrupoCent.principal),
    invTotal,
    "faturamento s/ TMB sem downsell (captação + principal) — decomposição auxiliar, não headline",
    "investimento total de mídia c/ imposto",
    fmtReais,
  );
  const roasTotalSemTmb: DebriefingMoneyTime["roasTotalSemTmb"] = {
    ...baseTotal,
    memoria:
      `${baseTotal.memoria} — captação ${fmtReais(reais(fatGrupoCent.captacao))} + principal ${fmtReais(reais(fatGrupoCent.principal))}` +
      ` + downsell ${fmtReais(reais(fatGrupoCent.downsell))}` +
      (tmbVendas > 0 ? ` (${textoTmb(contaveis.length - vendasGrupo.reabertura, tmbVendas - tmbPorGrupo.reabertura)})` : ""),
    numerador: reais(numTotalCent),
    denominador: invTotal,
    decomposicao: {
      captacao: reais(fatGrupoCent.captacao),
      principal: reais(fatGrupoCent.principal),
      downsell: reais(fatGrupoCent.downsell),
    },
    semDownsell,
  };

  const veredito: DebriefingMoneyTime["teseOrderBump"]["veredito"] =
    roasSoIngresso.valor === null || roasCaptacao.valor === null
      ? "indefinida"
      : roasSoIngresso.valor < 1 && roasCaptacao.valor > 1
        ? "confirmada"
        : "nao-confirmada";

  const reabAplicavel =
    config.datasChave.reabertura?.houve === true || config.etapas.some((e) => e.papel === "reabertura");
  const apendiceReabertura: DebriefingMoneyTime["apendiceReabertura"] = {
    aplicavel: reabAplicavel,
    vendas: vendasGrupo.reabertura,
    faturamento: reais(fatGrupoCent.reabertura),
    investimento: invReabertura,
    roasMarginal: reabAplicavel
      ? razao(reais(fatGrupoCent.reabertura), invReabertura, "faturamento da reabertura s/ TMB", "investimento da reabertura c/ imposto", fmtReais)
      : { valor: null, motivo: "SEM_REABERTURA", memoria: "não houve reabertura" },
    nota: "reaproveita audiência já paga",
  };
  const referenciaCombinada = {
    faturamento: reais(numTotalCent + fatGrupoCent.reabertura),
    investimento: invTotal + invReabertura,
    roas: razao(
      reais(numTotalCent + fatGrupoCent.reabertura),
      invTotal + invReabertura,
      "faturamento s/ TMB com reabertura",
      "investimento total c/ imposto com reabertura",
      fmtReais,
    ) as Metrica,
  };

  // ===================================================================
  // 9. ROAS diário da captação e pico-artefato
  // ===================================================================
  const diasCap = new Map<string, { inv: number; invPorEtapa: Record<string, number>; fatCent: number; fatPorEtapaCent: Record<string, number> }>();
  const diaDe = (dia: string) => {
    let d = diasCap.get(dia);
    if (!d) {
      d = { inv: 0, invPorEtapa: {}, fatCent: 0, fatPorEtapaCent: {} };
      diasCap.set(dia, d);
    }
    return d;
  };
  for (const m of midiaComImposto) {
    if (grupoDaEtapa(m.stageId) !== "captacao") continue;
    const d = diaDe(m.dia);
    d.inv += m.comImposto;
    d.invPorEtapa[m.stageId] = (d.invPorEtapa[m.stageId] ?? 0) + m.comImposto;
  }
  for (const l of linhasCap) {
    if (l.dia === null || !(l.v.tipo === "ingresso" || l.v.tipo === "combo" || l.v.tipo === "order_bump")) continue;
    const d = diaDe(l.dia);
    d.fatCent += l.centavos;
    d.fatPorEtapaCent[l.stageId] = (d.fatPorEtapaCent[l.stageId] ?? 0) + l.centavos;
  }
  const diasComGasto = [...diasCap.entries()].filter(([, d]) => d.inv > 0).map(([dia]) => dia).sort();
  const diasDoDenominador =
    diasComGasto.length > 0 ? diasEntre(diasComGasto[0]!, diasComGasto[diasComGasto.length - 1]!) + 1 : 0;
  const investimentoMedioDiarioCaptacao = diasDoDenominador > 0 ? invCaptacao / diasDoDenominador : null;
  const limiar = investimentoMedioDiarioCaptacao !== null ? investimentoMedioDiarioCaptacao * FRACAO_LIMIAR_PICO_ARTEFATO : null;

  const roasDiarioCaptacao: DiaDoRoasCaptacao[] = [];
  const todosDias = [...diasCap.keys()].sort();
  if (todosDias.length > 0) {
    const primeiro = todosDias[0]!;
    const ultimo = todosDias[todosDias.length - 1]!;
    for (let dia = primeiro; dia <= ultimo; dia = somarDias(dia, 1)) {
      const d = diasCap.get(dia) ?? { inv: 0, invPorEtapa: {}, fatCent: 0, fatPorEtapaCent: {} };
      const semGasto = !(d.inv > 0);
      roasDiarioCaptacao.push({
        dia,
        dMais: diasEntre(d0, dia),
        investimento: d.inv,
        faturamento: reais(d.fatCent),
        investimentoPorEtapa: { ...d.invPorEtapa },
        faturamentoPorEtapa: Object.fromEntries(Object.entries(d.fatPorEtapaCent).map(([k, c]) => [k, reais(c)])),
        roas: semGasto ? null : reais(d.fatCent) / d.inv,
        diaSemGasto: semGasto,
        picoArtefato: !semGasto && limiar !== null && d.inv < limiar,
      });
    }
  }

  // ===================================================================
  // Montagem
  // ===================================================================
  const faturamentoPorTipo = Object.fromEntries(TIPOS.map((t) => [t, reais(fatTipoCent[t])])) as Record<
    TipoDeProdutoNaVenda,
    number
  >;
  const dedupResumo = { camada1: dedup.camada1, camada2: dedup.camada2 };

  const resultado: DebriefingMoneyTime = {
    versao: 1,
    janela,
    criterioDeUnico,
    classificadorVersao: classificador.versao,
    origemDoValor: {
      captacao: "celula-crua",
      principal: "celula-crua",
      downsell: "celula-crua",
      reabertura: "celula-crua",
      tmb: "celula-crua",
      excluidas: "celula-crua",
    },
    higiene: {
      linhasLidas: lidas.length,
      excluidasPorStatus,
      linhasComValorNegativo,
      linhasSemValor,
      dedup: dedupResumo,
      dedupNaoAplicada: dedup.dedupNaoAplicada,
      fontesDuplicadas,
      utmsEmArray,
      foraDoPeriodo,
      vendasSemDia,
      linhasConvertidas: resultadoValor.linhasConvertidas,
      precoDistintoPorProduto: resultadoValor.precoDistintoPorProduto,
      produtosComPrecoContaminado: Object.entries(resultadoValor.precoDistintoPorProduto)
        .filter(([, n]) => n > LIMIARES_ALERTA.precosDistintos)
        .map(([produto, valoresDistintos]) => ({ produto, valoresDistintos }))
        .sort((a, b) => b.valoresDistintos - a.valoresDistintos || (a.produto < b.produto ? -1 : 1)),
    },
    dedup: dedupResumo,
    tmb: {
      vendas: tmbVendas,
      valorExcluido: reais(tmbCent),
      vendasNoPrincipal: tmbNoPrincipal,
      sinalizado: tmbVendas > 0,
      texto: tmbVendas > 0 ? textoTmb(contaveis.length, tmbVendas) : null,
    },
    vendasManuais: {
      linhasLidas: lidas.filter((l) => l.fonte === "manual").length,
      porGrupo: Object.fromEntries(
        GRUPOS.map((g) => [g, { vendas: manualPorGrupo[g], faturamento: reais(manualCentPorGrupo[g]) }]),
      ) as Record<GrupoDaEtapa, GrupoMonetario>,
      origemDoValor: "manual_sales.value",
    },
    faturamentoTotal: reais(faturamentoTotalCent),
    faturamentoPorEtapa: {
      captacao: reais(fatGrupoCent.captacao),
      principal: reais(fatGrupoCent.principal),
      downsell: reais(fatGrupoCent.downsell),
      reabertura: reais(fatGrupoCent.reabertura),
    },
    faturamentoPorStageId: Object.fromEntries(Object.entries(fatStageCent).map(([k, c]) => [k, reais(c)])),
    faturamentoPorTipo,
    imposto: {
      impostoPct: pct,
      impostoOrigem: config.imposto.origem,
      fatorImposto: fatorDoImposto(pct),
      impostoAplicadoPor: "motor",
      corteDeData: "2026-01-01",
    },
    midia: {
      porEtapa,
      porGrupo,
      midiaDiariaPorEtapa,
      investimentoTotal: {
        valor: invTotal,
        memoria:
          `captação ${fmtReais(invCaptacao)} + principal ${fmtReais(invPrincipal)} + downsell ${fmtReais(invDownsell)}` +
          ` = ${fmtReais(invTotal)} (spend cru ÷ (1 − ${fmtPct(pct * 100)}) por dia a partir de 2026-01-01; reabertura fora do headline)`,
      },
      linhasForaDoPeriodo: linhasMidiaFora,
    },
    captacao: {
      aplicavel: capAplicavel,
      ...(capAplicavel ? {} : { motivo: motivoGratuita }),
      vendasPorTipo: vendasPorTipoCap,
      faturamentoIngresso: metricaFat(fatTipoCapCent.ingresso, "faturamento de ingresso"),
      faturamentoCombo: metricaFat(fatTipoCapCent.combo, "faturamento de combo"),
      faturamentoOrderBump: metricaFat(fatTipoCapCent.order_bump, "faturamento de order bump"),
      faturamentoCaptacao: metricaFat(fatCapCent, "faturamento de ingresso + combo + order bump"),
      compradoresCaptacao,
      ingressosUnicos,
      compradoresUnicos,
      compradoresDaEtapaInclusiveAvulsos,
      comCombo,
      comOrderBump,
      comTierSuperior,
      avulsos: { compradores: avulsos, faturamento: reais(avulsosCent) },
      ticketCaptacao,
      produtosNaoClassificados,
      diferencaDeFonte,
      pctCompradoresPorCliques,
    },
    compradoresCaptacao,
    ingressosUnicos,
    compradores,
    diferencaDeFonte,
    produtosNaoClassificados,
    vendasPrincipalBrutas,
    vendasPrincipal,
    vendasExcluidas,
    faturamentoPrincipal: {
      valor: reais(fatGrupoCent.principal),
      memoria: `Σ vendas do principal (status pago, deduplicado, sem as anteriores à abertura, s/ TMB) = ${fmtReais(reais(fatGrupoCent.principal))}${notaTmb("principal")}`,
    },
    downsell: {
      aplicavel: config.datasChave.downsell?.houve === true || config.etapas.some((e) => GRUPO_DO_PAPEL[e.papel] === "downsell"),
      vendas: vendasGrupo.downsell,
      faturamento: reais(fatGrupoCent.downsell),
    },
    tabela1: {
      canais,
      fechamento: { closer: linhaFech("closer"), semCloser: linhaFech("sem-closer") },
      somas: {
        ingressosPorCanal: canais.reduce((s, c) => s + c.ingressos, 0),
        vendasPorCanal: canais.reduce((s, c) => s + c.vendas, 0),
        ingressosPorFechamento: ingressosPorFechamento.closer + ingressosPorFechamento["sem-closer"],
        vendasPorFechamento: vendasPorFechamento.closer + vendasPorFechamento["sem-closer"],
        referencia: { ingressosUnicos, vendasPrincipal },
      },
    },
    tuplasClassificadas,
    tuplasSemNomeDeCampanha,
    auditoriaDeVendas,
    coorte,
    coortePaga,
    conversaoIngressoPrincipal,
    roasSoIngresso,
    roasCaptacao,
    roasTotalSemTmb,
    teseOrderBump: { roasSoIngresso: roasSoIngresso.valor, roasCaptacao: roasCaptacao.valor, veredito },
    apendiceReabertura,
    referenciaCombinada,
    roasDiarioCaptacao,
    limiarPicoArtefato: {
      limiarPicoArtefato: limiar,
      investimentoMedioDiarioCaptacao,
      fracao: FRACAO_LIMIAR_PICO_ARTEFATO,
      diasDoDenominador,
      memoria:
        investimentoMedioDiarioCaptacao === null
          ? "sem dia com investimento de captação — sem limiar"
          : `investimento de captação c/ imposto ${fmtReais(invCaptacao)} ÷ ${diasDoDenominador} dia(s) de calendário` +
            ` (do primeiro ao último com gasto, inclusive) = ${fmtReais(investimentoMedioDiarioCaptacao)}; ` +
            `limiar = ${fmtNumero(FRACAO_LIMIAR_PICO_ARTEFATO * 100, 0)}% = ${fmtReais(limiar!)}`,
    },
    pendencias,
    lacunas,
  };
  // 49.12 (AC6): carrinho que não abriu até o corte → o que depende dele vira lacuna.
  const semCarrinho = corteSemCarrinho(janela);
  if (semCarrinho) return comLacunaDoCarrinho(resultado, semCarrinho);
  // 49.14 (AC2–AC4): carrinho aberto — fases em curso (parciais) e não começadas (lacuna).
  const comCarrinho = fasesComCarrinhoAberto(janela);
  return comCarrinho ? comFasesDoCorte(resultado, comCarrinho.corte, comCarrinho.fases) : resultado;
}

// ---------------------------------------------------------------------------
// Story 49.12 — corte e lacuna do carrinho
// ---------------------------------------------------------------------------

/** Leads criados até o corte (lead sem data legível fica — como a venda sem dia). */
function leadsAteOCorte(leads: readonly LeadInput[], corte: string): LeadInput[] {
  return leads.filter((l) => {
    const dia = dataBrt(l.dataCriacaoCru);
    return dia === null || dia <= corte;
  });
}

/**
 * As métricas do Motor I que dependem de venda do principal, reabertura ou
 * downsell (49.12 AC6). Com o carrinho fechado no corte, elas NÃO são
 * calculadas: `valor = null` com o motivo `CARRINHO_AINDA_NAO_ABRIU`, nunca 0.
 */
export const METRICAS_SEM_CARRINHO_DINHEIRO_TEMPO = [
  "faturamentoPrincipal",
  "conversaoIngressoPrincipal",
  "roasTotalSemTmb",
  "roasTotalSemTmb.semDownsell",
  "tabela1.canais[].conversao",
  "tabela1.fechamento.closer.conversao",
  "tabela1.fechamento.semCloser.conversao",
  "apendiceReabertura.roasMarginal",
  "referenciaCombinada.roas",
] as const;

/** `valor: null` com o motivo da lacuna do carrinho — o resto da métrica (numerador, denominador) fica como rastro. */
export function semValorPeloCarrinho<M extends { valor: unknown; memoria: string; motivo?: string }>(m: M, corte: CorteDaJanela): M {
  const texto = textoDaLacunaDoCarrinho(corte);
  return { ...m, valor: null, motivo: `${LACUNA_CARRINHO_AINDA_NAO_ABRIU}: ${texto}`, memoria: `não calculado — ${texto} (conta de rastro: ${m.memoria})` } as M;
}

function comLacunaDoCarrinho(r: DebriefingMoneyTime, corte: CorteDaJanela): DebriefingMoneyTime {
  const sem = <M extends { valor: unknown; memoria: string; motivo?: string }>(m: M) => semValorPeloCarrinho(m, corte);
  return {
    ...r,
    faturamentoPrincipal: sem(r.faturamentoPrincipal),
    conversaoIngressoPrincipal: sem(r.conversaoIngressoPrincipal),
    roasTotalSemTmb: { ...sem(r.roasTotalSemTmb), semDownsell: sem(r.roasTotalSemTmb.semDownsell) },
    tabela1: {
      ...r.tabela1,
      canais: r.tabela1.canais.map((c) => ({ ...c, conversao: sem(c.conversao) })),
      fechamento: {
        closer: { ...r.tabela1.fechamento.closer, conversao: sem(r.tabela1.fechamento.closer.conversao) },
        semCloser: { ...r.tabela1.fechamento.semCloser, conversao: sem(r.tabela1.fechamento.semCloser.conversao) },
      },
    },
    apendiceReabertura: { ...r.apendiceReabertura, roasMarginal: sem(r.apendiceReabertura.roasMarginal) },
    referenciaCombinada: { ...r.referenciaCombinada, roas: sem(r.referenciaCombinada.roas) },
    lacunas: [
      ...r.lacunas,
      {
        codigo: LACUNA_CARRINHO_AINDA_NAO_ABRIU,
        motivo: `${textoDaLacunaDoCarrinho(corte)} — o que depende de venda do principal, reabertura ou downsell não é calculado (lacuna escrita, nunca zero)`,
        detalhe: METRICAS_SEM_CARRINHO_DINHEIRO_TEMPO.join(", "),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Story 49.14 — carrinho aberto: fases em curso e não começadas (AC2–AC4)
// ---------------------------------------------------------------------------

/** Itens da lacuna da reabertura que não começou (49.14 AC4) — cobrados pela F11. */
export const METRICAS_SEM_REABERTURA = ["apendiceReabertura.roasMarginal", "referenciaCombinada.roas"] as const;
/** Itens da lacuna do downsell que não começou (49.14 AC4) — cobrados pela F11. */
export const METRICAS_SEM_DOWNSELL = ["downsell.vendas", "downsell.faturamento", "roasTotalSemTmb (downsell fora do numerador)"] as const;
/** Itens da coorte incompleta (49.14 AC3) — cobrados pela F11. */
export const METRICAS_DA_COORTE_INCOMPLETA = ["coorte", "coortePaga"] as const;

/**
 * Story 49.14 — com o carrinho aberto no corte:
 * - carrinho em curso (AC3): os números do principal são os que existem até o
 *   corte (nada muda na conta — a F7 fecha com eles); a coorte é marcada
 *   INCOMPLETA e a lacuna `COORTE_INCOMPLETA` declara isso;
 * - reabertura que não começou (AC2/AC4): ROAS marginal e referência
 *   combinada viram lacuna escrita (nunca a reabertura como zero);
 * - downsell que não começou (AC4): o ROAS total sai SEM o downsell
 *   (captação + principal ÷ investimento total), dito por extenso em
 *   `downsellNoCorte` — nunca tratado como zero; em curso, marcado parcial.
 */
function comFasesDoCorte(r: DebriefingMoneyTime, corte: CorteDaJanela, fases: FasesNoCorte): DebriefingMoneyTime {
  let out = r;
  const lacunas = [...r.lacunas];
  if (fases.carrinho.estado === "em-curso") {
    const incompleta = { ateDia: corte.dia, dMaisN: corte.dMaisN, texto: textoDaCoorteIncompleta(corte) };
    out = { ...out, coorte: { ...out.coorte, incompleta }, coortePaga: { ...out.coortePaga, incompleta } };
    lacunas.push({ codigo: LACUNA_COORTE_INCOMPLETA, motivo: `${textoDaFaseEmCurso("carrinho", corte)} — ${incompleta.texto}`, detalhe: METRICAS_DA_COORTE_INCOMPLETA.join(", ") });
  }
  if (fases.reabertura.estado === "nao-comecou") {
    const texto = textoDaFaseQueNaoComecou("reabertura", corte);
    const sem = <M extends { valor: unknown; memoria: string; motivo?: string }>(m: M): M =>
      ({ ...m, valor: null, motivo: `${LACUNA_REABERTURA_AINDA_NAO_COMECOU}: ${texto}`, memoria: `não calculado — ${texto} (conta de rastro: ${m.memoria})` }) as M;
    out = {
      ...out,
      apendiceReabertura: { ...out.apendiceReabertura, roasMarginal: sem(out.apendiceReabertura.roasMarginal) },
      referenciaCombinada: { ...out.referenciaCombinada, roas: sem(out.referenciaCombinada.roas) },
    };
    lacunas.push({ codigo: LACUNA_REABERTURA_AINDA_NAO_COMECOU, motivo: `${texto} — a reabertura não é calculada (lacuna escrita, nunca zero)`, detalhe: METRICAS_SEM_REABERTURA.join(", ") });
  }
  const rt = out.roasTotalSemTmb;
  if (fases.downsell.estado === "nao-comecou") {
    const texto = textoDaFaseQueNaoComecou("downsell", corte);
    const sd = rt.semDownsell as Metrica & Partial<Pick<MetricaRazao, "numerador" | "denominador">>;
    out = {
      ...out,
      roasTotalSemTmb: {
        ...rt,
        valor: sd.valor,
        ...(sd.motivo ? { motivo: sd.motivo } : {}),
        numerador: sd.numerador ?? rt.decomposicao.captacao + rt.decomposicao.principal,
        denominador: sd.denominador ?? rt.denominador,
        memoria: `downsell FORA do numerador — ${texto}: ${sd.memoria}`,
        downsellNoCorte: { estado: "nao-comecou", texto: `fora do ROAS total: ${texto}`, faturamentoFora: rt.decomposicao.downsell },
      },
    };
    lacunas.push({ codigo: LACUNA_DOWNSELL_AINDA_NAO_COMECOU, motivo: `${texto} — o downsell fica fora (lacuna escrita, nunca zero) e o ROAS total é o de captação + principal`, detalhe: METRICAS_SEM_DOWNSELL.join(", ") });
  } else if (fases.downsell.estado === "em-curso") {
    const texto = textoDaFaseEmCurso("downsell", corte);
    out = { ...out, roasTotalSemTmb: { ...rt, memoria: `${rt.memoria} — downsell ${texto}`, downsellNoCorte: { estado: "em-curso", texto: `downsell ${texto}` } } };
  }
  return out === r ? r : { ...out, lacunas };
}
