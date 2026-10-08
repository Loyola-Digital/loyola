/**
 * Story 49.4 — Motor II do Debriefing: público.
 *
 * **Puro.** Entra o que o loader (`debriefing-audience-loader.ts`) leu — linhas
 * cruas da pesquisa, vendas já higienizadas pela sequência da 49.3, anúncios
 * do banco, a base do lançamento anterior —, a config da 49.1 e o
 * classificador da 49.2 injetado; sai o objeto de métricas de público com
 * memória de cálculo. Sem banco, planilha, relógio nem `Math.random`: a mesma
 * entrada dá o mesmo JSON, e a entrada nunca é mutada.
 *
 * Fases da skill `loyola-debriefing` cobertas: 8 (qualificação por origem),
 * 9 (faixa, criativo × faixa, tipo de criativo) e 10 (cross-launch).
 * Story 49.18: a mídia por anúncio (`midiaPorAnuncio`, motor puro em
 * `debriefing-midia-anuncios.ts`) sai daqui, com o ad-level e os compradores de captação.
 * Story 49.20: o cross-launch expõe as chaves (hash) de quem já estava na base, e
 * `computeRecompraPorOrigem` (puro, chamado pela composição) abre a recompra pela origem.
 * Armadilhas 6 (n inflado por e-mail repetido), 8 (listas somadas a canais),
 * 9 (classificadores diferentes), dimensão inventada e contribuição absoluta.
 *
 * Regras do dono que valem aqui (epic §Decisões — não reabrir):
 * - pesquisa respondida 2×: vale a resposta MAIS RECENTE (decisão 8) — maior
 *   dia de resposta; empate ou sem data → a da PESQUISA DE CAPTAÇÃO marcada
 *   na config quando as duas linhas são de pesquisas diferentes da mesma etapa
 *   (R6-7, Story 49.11); senão a linha de posição posterior;
 * - série histórica (49.11, R5-3/R6-6): a pergunta tem resposta no lançamento
 *   atual E em TODOS os lançamentos de comparação da lista — só a qualificação,
 *   sem % por lançamento; o cross-launch continua só com a principal;
 * - `%` por dimensão sobre o SEGMENTO INTEIRO, com a linha `semResposta`
 *   (decisão 9): valores + `semResposta` = 100% do segmento;
 * - dois eixos que nunca se somam: segmentos de aquisição × fechamento
 *   (decisão 3, R2-5 — balde próprio "Aquisição não rastreada (só closer)");
 * - origem SÓ pelo classificador da 49.2 — este arquivo não tem lista de fonte
 *   paga (R-49-2; um teste de superfície trava);
 * - imposto do Loyola uma vez, por dia (`aplicarImposto`); clique =
 *   `link_click`, ausente = `null`;
 * - sem PII: chaves em hash; nenhum e-mail, telefone ou nome no payload.
 *
 * Unidades: `pct*`, `taxaDeResposta`, `coberturaDeFaixa`, `ctr` e
 * `conversaoCliqueIngresso` em PERCENTUAL (0–100); `ingressoPrincipal` e
 * `ingressoBump` em FRAÇÃO (0–1), como `conversaoIngressoPrincipal` e
 * `comTierSuperior` da 49.3; dinheiro em reais.
 */

import {
  CANAIS,
  SEGMENTOS_DE_QUALIFICACAO,
  SEGMENTO_DE_QUALIFICACAO,
  cpcDeLink,
  ctrDeLink,
  normalizarNomeCampanha,
  somarLinkClicks,
  utmContentEfetivo,
  type Canal,
  type Fechamento,
  type SegmentoDeQualificacao,
  type Utm,
} from "@loyola-x/shared";
import { SURVEY_CANONICAL_FIELDS, type SurveyCanonicalField } from "../db/schema.js";
import type { DebriefingConfigLancamento, DimensaoDeCriativo } from "./debriefing-config.js";
import { PISO_DE_AMOSTRA } from "../utils/order-bump.js";
import { adNameDoTerm } from "./launch-report-normalize.js";
import { postDoGrupo } from "../utils/post-do-criativo.js";
import {
  computeMidiaPorAnuncio,
  formatoPeloNomeDaCampanha,
  type CompradorDaMidia,
  type MidiaPorAnuncio,
  type TextoDoAnuncio,
} from "./debriefing-midia-anuncios.js";
import {
  LACUNA_CARRINHO_AINDA_NAO_ABRIU,
  aplicarImposto,
  chavesDeComprador,
  corteSemCarrinho,
  dataBrt,
  diaDoCorteDeLeadsEPesquisa,
  desembrulharUtm,
  normalizarEmail,
  normalizarTelefone,
  textoDaLacunaDoCarrinho,
  type CorteDaJanela,
  type CriterioDeUnico,
  type JanelaDoDebriefing,
} from "./debriefing-hygiene.js";
import {
  fmtNumero,
  fmtReais,
  type ClassificadorInjetado,
  type CompradorDeCaptacao as CompradorDoMotorI,
  type GrupoDaEtapa,
  type Metrica,
  type MetricaRazao,
  type TuplaClassificada,
  semValorPeloCarrinho,
} from "./debriefing-money-time-engine.js";

// ---------------------------------------------------------------------------
// Constantes nomeadas
// ---------------------------------------------------------------------------

/** Ad ID da Meta: numérico longo — o mesmo critério de `isLikelyAdId` (`survey-aggregation.ts`). */
const RE_AD_ID = /^\d{10,}$/;

/** Formato do link da skill (`templates/referencia-relatorio-dg.html`). */
const URL_ADS_MANAGER = "https://adsmanager.facebook.com/adsmanager/manage/ads";

export const FAIXAS = ["A", "B", "C", "D"] as const;
export type Faixa = (typeof FAIXAS)[number];
/** Faixa de um respondente: letra A→D, vazia, ou um valor que não é letra A→D. */
export type FaixaDoRespondente = Faixa | "semFaixa" | "foraDoPadrao";
const FAIXAS_DO_RESPONDENTE: readonly FaixaDoRespondente[] = ["A", "B", "C", "D", "semFaixa", "foraDoPadrao"];

/** Motivo de uma dimensão não entrar (AC3). */
export type MotivoDimensaoAusente = "ausente-na-pesquisa" | "nao-confirmada" | "coluna-100pct-vazia";

export type TipoDeCriativo = "ia" | "humano" | "card-estatico" | "video" | "estatico";

export const TIPOS_POR_DIMENSAO: Readonly<Record<Exclude<DimensaoDeCriativo, "nenhuma">, readonly TipoDeCriativo[]>> = {
  "ia-humano": ["ia", "humano", "card-estatico"],
  "video-estatico": ["video", "estatico"],
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Uma planilha de pesquisa (`funnel_surveys`) de uma etapa do lançamento. */
export interface PesquisaInput {
  pesquisaId: string;
  stageId: string;
  /** Só para auditoria (`planilha / aba`). */
  rotulo: string;
  /** A planilha tem coluna de e-mail identificável. Sem ela não há dedup por e-mail. */
  temColunaEmail: boolean;
  /** Chaves de pergunta que a planilha tem (as de `resolveColumnIndexes`, as mesmas da 49.1). */
  chavesDePergunta: readonly string[];
  /**
   * Chave → texto do cabeçalho da coluna. No modo legado do mapeamento a chave
   * é um apelido (`renda_mensal`) e o cabeçalho é a pergunta real — a série
   * histórica casa pelos dois.
   */
  cabecalhoDaChave: Readonly<Record<string, string>>;
  /**
   * Story 49.11 (R6-7): é a pesquisa de captação marcada na config para a etapa
   * (`pesquisaDeCaptacaoPorEtapa`) — a sua linha vence o desempate sem data.
   * O loader decide pelo id; o motor não conhece nome de aba.
   */
  pesquisaDeCaptacao?: boolean;
}

/** Uma linha crua da pesquisa. E-mail, telefone e data chegam COMO NA CÉLULA. */
export interface RespostaInput {
  pesquisaId: string;
  /** Linha da planilha (1 = primeira linha de dado) — desempate de "mais recente". */
  linha: number;
  /** `linhaTemRespondente(row, emailIdx)` (`survey-aggregation.ts`) — a regra do Resumão, aplicada pelo loader. */
  linhaTemRespondente: boolean;
  emailCru: string | null;
  telefoneCru: string | null;
  /** Célula da data da resposta (carimbo do formulário). */
  dataRespostaCru: string | null;
  /** UTM da própria linha da pesquisa, com `campaignName` resolvido pelo loader (decisão 4). */
  utm: Utm;
  utmContentCru: string | null;
  /** Resposta por chave de pergunta (`chavesDePergunta`). */
  respostas: Readonly<Record<string, string | null>>;
}

/**
 * Uma linha de venda JÁ higienizada pela sequência da 49.3 (status, valor,
 * dedup em duas camadas, janela, principal antes da abertura). O motor não
 * conhece nome de produto: os três `comprou*` vêm resolvidos pelo loader a
 * partir de `tipoDoProduto`.
 */
export interface VendaHigienizadaInput {
  planilhaId: string;
  linha: number;
  grupo: GrupoDaEtapa;
  emailCru: string | null;
  telefoneCru: string | null;
  utm: Utm;
  utmContentCru: string | null;
  sellerName: string | null;
  /** Captação: `ingresso` ou `combo` (R2-1). */
  comprouCaptacao: boolean;
  /** Etapa do principal. */
  comprouPrincipal: boolean;
  /** Captação: `combo` ou `order_bump` (tier superior da 49.3). */
  comprouTierSuperior: boolean;
  /**
   * Story 49.18 — centavos que a linha soma ao faturamento (TMB = 0), pela MESMA
   * conversão do Motor I (`valorBrl`). Ausente = entrada anterior à 49.18 (ROAS
   * por anúncio não medido).
   */
  centavos?: number;
  /** Story 49.18 — dia da venda (BRT); `null` = sem data legível. Ausente = entrada anterior à 49.18. */
  dia?: string | null;
}

/** Um anúncio num dia (`meta_ad_insights_daily`, spend CRU). */
export interface AnuncioDiaInput {
  adId: string;
  adName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  dia: string;
  spendBruto: number;
  impressoes: number;
  /** `null` = a Meta não devolveu `link_click` (≠ 0). */
  linkClicks: number | null;
  /** Story 49.18 — `landing_page_view` de `actions`; `null`/ausente = a Meta não devolveu (≠ 0). */
  landingPageViews?: number | null;
  /** Story 49.18 (AC2) — conjunto (adset) da linha. Ausente = entrada anterior. */
  adsetId?: string | null;
  adsetName?: string | null;
}

export interface CriativosInput {
  /** Ad-level das campanhas de captação no período. Vazio = sem ad-level (PG02). */
  anuncios: readonly AnuncioDiaInput[];
  /** Ad ID → Ad Name do cache de anúncios do banco. */
  nomesDeAnuncio: Readonly<Record<string, string>>;
  /** Conta de anúncios do funil (`funnels.metaAccountId`), só dígitos; `null` = sem conta. */
  contaDeAnuncios: string | null;
  /**
   * R7-9 (49.6): Ad ID → post publicado, já resolvido pela cascata da 18.88
   * (`postDoAnuncio`: Instagram → Facebook) sobre `meta_ad_creatives_cache`.
   * Ad ID sem post (ou fora do cache) simplesmente não tem chave.
   */
  postsDosAnuncios: Readonly<Record<string, string>>;
  /**
   * Story 49.18 (AC6) — `title` e `body` do criativo por Ad ID, do cache
   * (`meta_ad_creatives_cache`). Ad ID fora do cache não tem chave. Ausente =
   * entrada anterior à 49.18 (copy não comparada).
   */
  textosDosAnuncios?: Readonly<Record<string, TextoDoAnuncio>>;
}

export interface IdentidadeInput {
  emailCru: string | null;
  telefoneCru: string | null;
}

/** Base do lançamento de comparação (49.1, opcional). */
export interface BaseAnteriorInput {
  funnelId: string;
  /** `leads+compradores` só quando o funil de comparação tem planilha de leads/pesquisa legível (AC10). */
  tipo: "leads+compradores" | "compradores";
  leads: readonly IdentidadeInput[];
  compradores: readonly IdentidadeInput[];
  /**
   * Chaves de pergunta E textos de cabeçalho com ao menos uma resposta nas
   * pesquisas do anterior; `null` = o anterior não tem pesquisa.
   */
  chavesDePerguntaComResposta: readonly string[] | null;
}

/**
 * Story 49.11 — um lançamento de comparação da série histórica, na ordem da
 * lista da config (o 1º é a principal).
 */
export interface SerieDeComparacaoInput {
  funnelId: string;
  /** Nome do funil (para o documento declarar a composição). `null` = não resolvido. */
  nome: string | null;
  /** Como `BaseAnteriorInput.chavesDePerguntaComResposta`: `null` = o lançamento não tem pesquisa. */
  chavesDePerguntaComResposta: readonly string[] | null;
}

export interface DebriefingAudienceInput {
  config: Pick<DebriefingConfigLancamento, "perguntasConfirmadas" | "dimensaoDeCriativo" | "imposto">;
  /** A janela do debriefing (`janelaDoDebriefing`, decisão 2A) — a mesma da 49.3; o loader já cortou vendas e ad-level nela. */
  janela: JanelaDoDebriefing;
  pesquisas: readonly PesquisaInput[];
  respondentes: readonly RespostaInput[];
  compradores: readonly VendaHigienizadaInput[];
  criativos: CriativosInput;
  baseAnterior?: BaseAnteriorInput | null;
  /**
   * Story 49.11 — todos os lançamentos da lista, na ordem (o 1º é o da
   * `baseAnterior`). Ausente = só o da `baseAnterior` (n = 1, o caso de antes).
   */
  seriesDeComparacao?: readonly SerieDeComparacaoInput[];
  classificador: ClassificadorInjetado;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export interface LacunaDePublico {
  codigo:
    | typeof LACUNA_CARRINHO_AINDA_NAO_ABRIU
    | "LISTAS_FRONT_COMUNIDADE"
    | "SEM_AD_LEVEL"
    | "BASE_ANTERIOR_SEM_LEADS"
    | "PESQUISA_SEM_COLUNA_DE_EMAIL"
    | "DESEMPATE_SEM_PESQUISA_DE_CAPTACAO";
  motivo: string;
  detalhe?: string;
}

export interface ValorDaDimensao {
  /** Rótulo exibido: a grafia mais comum do valor (regra do Resumão). */
  rotulo: string;
  n: number;
  /** `n ÷ n do segmento × 100`. */
  pct: Metrica;
}

/** Tabela de uma dimensão num recorte. `Σ valores.n + semResposta.n === n`. */
export interface TabelaDaDimensao {
  n: number;
  valores: ValorDaDimensao[];
  semResposta: { n: number; pct: Metrica };
}

export interface PerguntaDaDimensao {
  stageId: string;
  chave: string;
}

export interface DimensaoDePublico {
  campo: SurveyCanonicalField;
  /** As perguntas confirmadas (49.1) que alimentam a dimensão, por etapa. */
  perguntas: PerguntaDaDimensao[];
  serieHistorica: boolean;
  serieHistoricaMotivo: string;
  /**
   * Story 49.11, só com 2+ lançamentos na lista: os que NÃO têm resposta para
   * a pergunta (`AUSENTE_EM_LANCAMENTO_DA_LISTA`) — quais, nunca só "algum".
   */
  lancamentosAusentes?: string[];
  /** Story 49.11, só com 2+ lançamentos: os da lista sem pesquisa conectada (`COMPARACAO_SEM_PESQUISA`). */
  lancamentosSemPesquisa?: string[];
  /** Pesquisa inteira deduplicada. */
  total: TabelaDaDimensao;
  porSegmento: Record<SegmentoDeQualificacao, TabelaDaDimensao>;
  porFechamento: Record<Fechamento, TabelaDaDimensao>;
}

export interface DimensaoNaoConfirmada {
  campo: SurveyCanonicalField;
  motivo: MotivoDimensaoAusente;
  perguntas: { stageId: string; chave: string | null }[];
}

export interface TuplaDePublico extends TuplaClassificada {
  segmento: SegmentoDeQualificacao;
}

export interface LinhaDeConversao {
  n: number;
  comprouPrincipal: number;
  comTierSuperior: number;
  /** Fração: compradores de captação do recorte que compraram o principal ÷ compradores de captação do recorte. */
  ingressoPrincipal: MetricaRazao;
  /** Fração: os que levaram combo ou order bump ÷ compradores de captação do recorte. */
  ingressoBump: MetricaRazao;
  amostraBaixa: boolean;
}

export interface CriativoXFaixa {
  /** Nome exibido (cache do banco > `utm_term`); `nomeNaoResolvido` = o próprio Ad ID. */
  nome: string;
  nomeNaoResolvido: boolean;
  origemDoNome: "cache" | "utm_term" | "ad_id";
  adIds: string[];
  /** O Ad ID de maior volume — o do link. */
  adIdPrincipal: string;
  n: number;
  porFaixa: Record<FaixaDoRespondente, number>;
  pctAB: Metrica;
  pctCD: Metrica;
  /** Sem faixa A→D (vazia ou fora do padrão). `pctAB + pctCD + pctSemFaixa = 100`. */
  pctSemFaixa: Metrica;
  amostraBaixa: boolean;
  tipo: TipoDeCriativo | "conflito" | "nao-classificado" | null;
  /** Dado cru — escapar para `href` é da 49.6. */
  linkAdsManager: string | null;
  /**
   * R7-9 (49.6): o post publicado do grupo (Instagram → Facebook), do ad_id de
   * MAIOR investimento entre os que têm post (`postDoGrupo`, 18.88). Sem spend
   * no período (sem ad-level), o desempate é a ordem por volume de respondentes.
   * `null` = nenhum ad_id do grupo tem post público — o render cai no Ads Manager.
   */
  linkDoPost: string | null;
}

export interface ConflitoDeTipo {
  adId: string;
  adName: string;
  campaignName: string | null;
  pistaDoNome: TipoDeCriativo | "ambiguo";
  pistaDaCampanha: TipoDeCriativo | null;
  motivo: "NOME_X_CAMPANHA" | "IA_E_HUMANO_NO_NOME";
}

export interface LinhaDoTipoDeCriativo {
  tipo: TipoDeCriativo;
  criativos: number;
  respondentes: number;
  pctAB: Metrica;
  pctCD: Metrica;
  amostraBaixa: boolean;
  investimentoComImposto: Metrica;
  impressoes: number | null;
  linkClicks: number | null;
  ctr: Metrica;
  cpc: Metrica;
  ingressos: Metrica;
  conversaoCliqueIngresso: Metrica;
  custoPorIngresso: Metrica;
}

export interface DebriefingAudience {
  versao: 1;
  /** Decisão 2A: a janela que cortou vendas e ad-level (a mesma da 49.3). */
  janela: JanelaDoDebriefing;
  classificadorVersao: string;
  /** Único grupo monetário deste motor: o custo por tipo de criativo. */
  origemDoValor: { investimentoPorTipoDeCriativo: "meta_ad_insights_daily.spend" };

  pesquisa: {
    linhasLidas: number;
    vazias: number;
    duplicadasRemovidas: number;
    /**
     * Story 49.11 (R6-7): das `duplicadasRemovidas`, quantas foram decididas SEM
     * data (mesmo dia ou data ilegível) — pela pesquisa de captação ou pela posição.
     */
    duplicadasSemData: number;
    /** Das `duplicadasSemData`, quantas a pesquisa de captação marcada decidiu. */
    duplicadasDecididasPelaPesquisaDeCaptacao: number;
    respondentes: number;
    memoria: string;
    porPesquisa: { pesquisaId: string; stageId: string; rotulo: string; linhasLidas: number; vazias: number }[];
  };
  /** Eco da config (49.1) — a 49.5 confere `dimensoes[]` contra ela. */
  perguntasConfirmadas: DebriefingConfigLancamento["perguntasConfirmadas"];
  dimensoes: DimensaoDePublico[];
  dimensoesNaoConfirmadas: DimensaoNaoConfirmada[];

  casamento: { porEmail: number; porTelefone: number; semMatch: number };
  segmentos: { segmento: SegmentoDeQualificacao; n: number }[];
  fechamento: { closer: { n: number }; semCloser: { n: number } };
  somas: { segmentos: number; fechamento: number; respondentes: number };
  tuplasClassificadas: TuplaDePublico[];
  tuplasSemNomeDeCampanha: number;

  /** Mesmas chaves (hash) da 49.3 — a 49.5 F3 compara as duas contagens. */
  compradoresCaptacao: Record<CriterioDeUnico, string[]>;
  taxaDeResposta: MetricaRazao;

  faixa: {
    aplicavel: boolean;
    motivo?: string;
    perguntas: PerguntaDaDimensao[];
    distribuicao: Record<FaixaDoRespondente, number>;
    volumeAB: number;
    pctAB: MetricaRazao;
    volumeD: number;
    coberturaDeFaixa: MetricaRazao;
    conversaoPorFaixa: (LinhaDeConversao & { faixa: FaixaDoRespondente })[];
  };
  conversaoPorSegmento: (LinhaDeConversao & { segmento: SegmentoDeQualificacao })[];

  criativoXFaixa: {
    aplicavel: boolean;
    motivo?: string;
    criativos: CriativoXFaixa[];
    /** `vazio` = sem utm_content; `naoEhAdId` = rótulo (`org`, `link_in_bio`), macro (`{{ad.id}}`) ou id curto. */
    semCriativo: { n: number; vazio: number; naoEhAdId: number };
    somas: { criativos: number; semCriativo: number; respondentes: number };
  };

  tipoDeCriativo: {
    aplicavel: boolean;
    motivo?: string;
    dimensao: DimensaoDeCriativo;
    tipos: LinhaDoTipoDeCriativo[];
    naoClassificados: { criativos: number; respondentes: number };
    conflitosDeTipo: ConflitoDeTipo[];
    ressalvas: "COPY_NAO_PAREADA"[];
    adLevel: { aplicavel: boolean; motivo?: "SEM_AD_LEVEL"; linhas: number };
  };

  crossLaunch: {
    aplicavel: boolean;
    motivo?: string;
    funnelIdAnterior: string | null;
    tipoDaBase: BaseAnteriorInput["tipo"] | null;
    criterio: "email-ou-telefone";
    leadsAnteriores: number | null;
    compradoresAnteriores: number | null;
    /** Leads do anterior que compraram a captação agora ÷ leads do anterior (percentual). */
    retornoDaBase: MetricaRazao | Metrica;
    /** Leads do anterior que compraram o principal agora ÷ leads do anterior (percentual). */
    retornoDaBasePrincipal: MetricaRazao | Metrica;
    /** Compradores do destino presentes na base anterior (percentual). */
    jaEmBaseAnterior: { captacao: MetricaRazao | Metrica; principal: MetricaRazao | Metrica };
    /**
     * Story 49.20 (AC1) — as chaves anônimas (hash, critério headline — as mesmas
     * de `compradoresCaptacao.porEmail`) dos compradores de captação presentes na
     * base anterior: o numerador de `jaEmBaseAnterior.captacao`. A composição
     * (`montarPayloadDebriefing`) as cruza com a origem do Motor I. Ausente = sem
     * base de comparação, ou payload anterior à 49.20.
     */
    compradoresNaBaseAnterior?: string[];
  };

  /**
   * Story 49.20 (AC1) — a recompra (compradores de captação que já estavam na
   * base anterior) aberta pela origem do comprador. Montada na composição
   * (`montarPayloadDebriefing`), que tem a origem do Motor I e as chaves do
   * cross-launch. Ausente = payload anterior à 49.20 (aditivo; a versão não sobe).
   */
  recompraPorOrigem?: RecompraPorOrigem;

  lacunas: LacunaDePublico[];
  /**
   * Story 49.18 — mídia por anúncio (ranking por nome, estático × vídeo, público
   * com ADV+, peças de escassez por dia, copy igual). Ausente = payload anterior
   * à 49.18 (aditivo e opcional; a versão não sobe).
   */
  midiaPorAnuncio?: MidiaPorAnuncio;
  /**
   * Story 49.11 — a composição da série histórica, presente só com 2+
   * lançamentos na lista (com 1, o payload é o de antes: o lançamento é o
   * `crossLaunch.funnelIdAnterior`). `posicao` 1 = a principal.
   */
  serieHistorica?: { lancamentos: { funnelId: string; nome: string | null; posicao: number; principal: boolean }[] };
}

// ---------------------------------------------------------------------------
// Formatação e divisão segura
// ---------------------------------------------------------------------------

function fmtInt(v: number): string {
  return fmtNumero(v, 0);
}

function fmtPct(v: number): string {
  return `${fmtNumero(v, 2)}%`;
}

/** Razão com os dois lados expostos. Denominador 0 ⇒ `valor: null` + `motivo`, nunca 0/NaN/Infinity. */
function razao(
  numerador: number,
  denominador: number,
  rotuloNum: string,
  rotuloDen: string,
  opts: { percentual?: boolean; formatar?: (v: number) => string } = {},
): MetricaRazao {
  const fmt = opts.formatar ?? fmtInt;
  const base = `${rotuloNum} ${fmt(numerador)} ÷ ${rotuloDen} ${fmt(denominador)}`;
  if (!Number.isFinite(denominador) || denominador === 0 || !Number.isFinite(numerador)) {
    return { valor: null, numerador, denominador, memoria: `${base} — sem denominador`, motivo: `DIVISAO_POR_ZERO: ${rotuloDen} = 0` };
  }
  const valor = opts.percentual ? (numerador / denominador) * 100 : numerador / denominador;
  return {
    valor,
    numerador,
    denominador,
    memoria: opts.percentual ? `${base} × 100 = ${fmtPct(valor)}` : `${base} = ${fmtNumero(valor, 4)}`,
  };
}

function pctDe(n: number, total: number, rotuloNum: string, rotuloDen: string): Metrica {
  const r = razao(n, total, rotuloNum, rotuloDen, { percentual: true });
  return r.motivo ? { valor: r.valor, memoria: r.memoria, motivo: r.motivo } : { valor: r.valor, memoria: r.memoria };
}

function nula(motivo: string, memoria: string): Metrica {
  return { valor: null, motivo, memoria };
}

/**
 * UTM aparada, campos vazios → `null` e array do Postgres desembrulhado
 * (`{"qr","qr"}` → `qr`, regra 9 de higiene da skill — `desembrulharUtm`). É a
 * MESMA regra do `utmLimpa` da 49.3 (iteração 2): a tupla tem a mesma forma e o
 * classificador recebe a mesma UTM nos dois motores (a F6 da 49.5 compara as
 * duas). `campaignName` vem do loader, nunca de célula — só é aparado.
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

/**
 * Chave de agrupamento de uma resposta — a mesma normalização do Resumão
 * (`normalizeAnswer`, `survey-aggregation.ts`): minúsculas, sem acento,
 * espaços colapsados. O rótulo exibido é a grafia mais comum.
 */
function normalizarResposta(raw: string): string {
  return raw.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

/** Letra A→D da célula de faixa (a planilha decide a letra; o motor não recalcula score). */
export function faixaDaCelula(celula: string | null | undefined): FaixaDoRespondente {
  const t = (celula ?? "").trim();
  if (!t) return "semFaixa";
  const m = /^(?:faixa\s*)?([abcd])$/i.exec(t);
  return m ? (m[1]!.toUpperCase() as Faixa) : "foraDoPadrao";
}

function porOrdem(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Tipo de criativo (convenção do EXPERT — nunca global)
// ---------------------------------------------------------------------------

function semAcentoMinusculo(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Pista do NOME do anúncio.
 * - `ia-humano` (DG): `-ia-` = IA, `-h-` = Humano, demais = card/estático;
 *   as duas marcas no mesmo nome = `ambiguo` (vai para `conflitosDeTipo`).
 * - `video-estatico` (FZ): prefixo `v##` = vídeo; `c##`/`ad##`/sem prefixo = estático.
 */
export function tipoPeloNome(
  adName: string,
  dimensao: Exclude<DimensaoDeCriativo, "nenhuma">,
): TipoDeCriativo | "ambiguo" {
  const n = semAcentoMinusculo(adName).trim();
  if (dimensao === "ia-humano") {
    const ia = /(^|-)ia(-|$)/.test(n);
    const h = /(^|-)h(-|$)/.test(n);
    if (ia && h) return "ambiguo";
    if (ia) return "ia";
    if (h) return "humano";
    return "card-estatico";
  }
  return /^v\d+/.test(n) ? "video" : "estatico";
}

/** Pista da CAMPANHA (só `video-estatico`): sufixo `--videos` / `--estaticos`. */
export function tipoPelaCampanha(
  campaignName: string | null | undefined,
  dimensao: Exclude<DimensaoDeCriativo, "nenhuma">,
): TipoDeCriativo | null {
  if (dimensao !== "video-estatico") return null;
  // 49.18 (AC3): o padrão mora em `formatoPeloNomeDaCampanha`, que a mídia por anúncio usa sem a dimensão.
  return formatoPeloNomeDaCampanha(campaignName);
}

export function linkDoAdsManager(conta: string | null | undefined, adId: string | null | undefined): string | null {
  const act = (conta ?? "").trim().replace(/^act_/i, "");
  const id = (adId ?? "").trim();
  if (!/^\d+$/.test(act) || !RE_AD_ID.test(id)) return null;
  return `${URL_ADS_MANAGER}?act=${act}&selected_ad_ids=${id}`;
}

// ---------------------------------------------------------------------------
// Estruturas internas (nunca saem no payload)
// ---------------------------------------------------------------------------

interface Respondente {
  r: RespostaInput;
  pesquisa: PesquisaInput;
  ordem: number;
  email: string;
  telefone: string | null;
  dia: string | null;
  segmento: SegmentoDeQualificacao;
  fechamento: Fechamento;
  faixa: FaixaDoRespondente;
  adId: string | null;
  motivoSemCriativo: "vazio" | "naoEhAdId" | null;
}

interface CompradorDeCaptacao {
  chave: string;
  emails: Set<string>;
  telefones: Set<string>;
  tier: boolean;
  principal: boolean;
  /** Primeira linha de captação (ingresso/combo) — o `utm_content` do ingresso. */
  ancora: VendaHigienizadaInput;
  respondente: Respondente | null;
}

/**
 * Série histórica de UMA dimensão (Story 49.11). `temResposta(chaves)` diz se
 * a pergunta (chave ou cabeçalho, normalizados) tem resposta num lançamento.
 * - lista vazia → `SEM_LANCAMENTO_DE_COMPARACAO`;
 * - n = 1 → os quatro códigos e o texto de antes (`COMPARACAO_SEM_PESQUISA`,
 *   `PRESENTE_NOS_DOIS_LANCAMENTOS`, `AUSENTE_NO_LANCAMENTO_DE_COMPARACAO`);
 * - n ≥ 2 → série SÓ se a pergunta tem resposta em TODOS: lançamento sem
 *   pesquisa → `COMPARACAO_SEM_PESQUISA` + `lancamentosSemPesquisa`; algum sem
 *   a pergunta → `AUSENTE_EM_LANCAMENTO_DA_LISTA` + `lancamentosAusentes`;
 *   todos → `PRESENTE_EM_TODOS_OS_LANCAMENTOS`.
 */
export function qualificarSerie(
  series: readonly { funnelId: string; chaves: ReadonlySet<string> | null }[],
  temResposta: (chaves: ReadonlySet<string>) => boolean,
): { serieHistorica: boolean; serieHistoricaMotivo: string; lancamentosAusentes?: string[]; lancamentosSemPesquisa?: string[] } {
  if (series.length === 0) return { serieHistorica: false, serieHistoricaMotivo: "SEM_LANCAMENTO_DE_COMPARACAO" };
  if (series.length === 1) {
    const chaves = series[0]!.chaves;
    if (!chaves) return { serieHistorica: false, serieHistoricaMotivo: "COMPARACAO_SEM_PESQUISA" };
    return temResposta(chaves)
      ? { serieHistorica: true, serieHistoricaMotivo: "PRESENTE_NOS_DOIS_LANCAMENTOS" }
      : { serieHistorica: false, serieHistoricaMotivo: "AUSENTE_NO_LANCAMENTO_DE_COMPARACAO" };
  }
  const semPesquisa = series.filter((sr) => !sr.chaves).map((sr) => sr.funnelId);
  const ausentes = series.filter((sr) => sr.chaves && !temResposta(sr.chaves)).map((sr) => sr.funnelId);
  if (semPesquisa.length > 0) {
    return {
      serieHistorica: false,
      serieHistoricaMotivo: "COMPARACAO_SEM_PESQUISA",
      lancamentosSemPesquisa: semPesquisa,
      ...(ausentes.length > 0 ? { lancamentosAusentes: ausentes } : {}),
    };
  }
  if (ausentes.length > 0) {
    return { serieHistorica: false, serieHistoricaMotivo: "AUSENTE_EM_LANCAMENTO_DA_LISTA", lancamentosAusentes: ausentes };
  }
  return { serieHistorica: true, serieHistoricaMotivo: "PRESENTE_EM_TODOS_OS_LANCAMENTOS" };
}

/**
 * Decisão 8 + R6-7 (Story 49.11) — a ÚNICA regra entre duas respostas do mesmo
 * e-mail: datas legíveis e diferentes → a mais recente; empate de dia ou sem
 * data → a da pesquisa de captação marcada, quando as duas são de pesquisas
 * DIFERENTES da mesma etapa e só uma está marcada; senão a de posição posterior.
 */
export function desempatarResposta<
  T extends { dia: string | null; ordem: number; pesquisa: Pick<PesquisaInput, "pesquisaId" | "stageId" | "pesquisaDeCaptacao"> },
>(a: T, b: T): { vencedora: T; decididaPor: "data" | "pesquisaDeCaptacao" | "posicao" } {
  if (a.dia !== null && b.dia !== null && a.dia !== b.dia) {
    return { vencedora: a.dia > b.dia ? a : b, decididaPor: "data" };
  }
  const ma = a.pesquisa.pesquisaDeCaptacao === true;
  const mb = b.pesquisa.pesquisaDeCaptacao === true;
  if (a.pesquisa.pesquisaId !== b.pesquisa.pesquisaId && a.pesquisa.stageId === b.pesquisa.stageId && ma !== mb) {
    return { vencedora: ma ? a : b, decididaPor: "pesquisaDeCaptacao" };
  }
  return { vencedora: a.ordem > b.ordem ? a : b, decididaPor: "posicao" };
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

export function computeDebriefingAudience(input: DebriefingAudienceInput): DebriefingAudience {
  const { config, janela, classificador } = input;
  const pctImposto = config.imposto.valor;
  const lacunas: LacunaDePublico[] = [];
  // 49.12 (AC5): com corte, NADA depois dele entra — nem a resposta da
  // pesquisa (data ilegível fica, como a venda sem dia). Sem corte, as de sempre.
  // 49.14 (AC6, R9-5): com todas as fases concluídas, nada além do que o final corta.
  const corteDasRespostas = diaDoCorteDeLeadsEPesquisa(janela);
  const respostas = corteDasRespostas !== null ? respostasAteOCorte(input.respondentes, corteDasRespostas) : input.respondentes;

  // ===================================================================
  // 1. Higiene da pesquisa (AC2) — antes de QUALQUER n
  // ===================================================================
  const pesquisaPorId = new Map(input.pesquisas.map((p) => [p.pesquisaId, p]));
  const porPesquisa = input.pesquisas.map((p) => ({
    pesquisaId: p.pesquisaId,
    stageId: p.stageId,
    rotulo: p.rotulo,
    linhasLidas: 0,
    vazias: 0,
  }));
  const contagemPorPesquisa = new Map(porPesquisa.map((p) => [p.pesquisaId, p]));
  let vazias = 0;
  const validas: Omit<Respondente, "segmento" | "fechamento" | "faixa" | "adId" | "motivoSemCriativo">[] = [];
  respostas.forEach((r, ordem) => {
    const pesquisa = pesquisaPorId.get(r.pesquisaId);
    if (!pesquisa) {
      throw new Error(`computeDebriefingAudience: resposta de pesquisa desconhecida (${r.pesquisaId}) — o loader entrega as pesquisas junto`);
    }
    const c = contagemPorPesquisa.get(r.pesquisaId)!;
    c.linhasLidas += 1;
    if (!r.linhaTemRespondente) {
      vazias += 1;
      c.vazias += 1;
      return;
    }
    validas.push({
      r,
      pesquisa,
      ordem,
      email: normalizarEmail(r.emailCru),
      telefone: normalizarTelefone(r.telefoneCru),
      dia: dataBrt(r.dataRespostaCru),
    });
  });

  // Decisão 8 + R6-7: UMA função decide entre duas respostas do mesmo e-mail.
  const vencedoraPorEmail = new Map<string, (typeof validas)[number]>();
  const decididasPor = { data: 0, pesquisaDeCaptacao: 0, posicao: 0 };
  for (const v of validas) {
    if (!v.email) continue;
    const atual = vencedoraPorEmail.get(v.email);
    if (!atual) {
      vencedoraPorEmail.set(v.email, v);
      continue;
    }
    const d = desempatarResposta(atual, v);
    decididasPor[d.decididaPor] += 1;
    vencedoraPorEmail.set(v.email, d.vencedora);
  }
  const dedupadas = validas.filter((v) => !v.email || vencedoraPorEmail.get(v.email) === v);
  const duplicadasRemovidas = validas.length - dedupadas.length;
  const duplicadasSemData = decididasPor.pesquisaDeCaptacao + decididasPor.posicao;
  const nRespondentes = dedupadas.length;
  const temPesquisaMarcada = input.pesquisas.some((p) => p.pesquisaDeCaptacao === true);

  // R6-7: etapa com 2+ pesquisas e nenhuma marcada → o desempate sem data cai
  // na posição (ordem de leitura); a lacuna diz — nunca em silêncio.
  const pesquisasPorEtapa = new Map<string, PesquisaInput[]>();
  for (const p of input.pesquisas) pesquisasPorEtapa.set(p.stageId, [...(pesquisasPorEtapa.get(p.stageId) ?? []), p]);
  for (const [stageId, ps] of [...pesquisasPorEtapa.entries()].sort((a, b) => porOrdem(a[0], b[0]))) {
    if (ps.length < 2 || ps.some((p) => p.pesquisaDeCaptacao === true)) continue;
    lacunas.push({
      codigo: "DESEMPATE_SEM_PESQUISA_DE_CAPTACAO",
      motivo:
        "etapa com mais de uma pesquisa sem a pesquisa de captação marcada na config — resposta repetida sem data (ou do mesmo dia) fica com a linha lida por último",
      detalhe:
        `etapa ${stageId}: ${ps.map((p) => p.rotulo).join("; ")} — respostas repetidas decididas sem data: ` +
        `${fmtInt(duplicadasSemData)} de ${fmtInt(duplicadasRemovidas)} removidas`,
    });
  }

  const semEmail = input.pesquisas.filter((p) => !p.temColunaEmail);
  if (semEmail.length > 0) {
    lacunas.push({
      codigo: "PESQUISA_SEM_COLUNA_DE_EMAIL",
      motivo: "pesquisa sem coluna de e-mail — cada linha preenchida conta como um respondente (não há como deduplicar)",
      detalhe: semEmail.map((p) => p.rotulo).join("; "),
    });
  }

  // ===================================================================
  // 2. Vendas: índice de casamento (e-mail → telefone) e compradores
  // ===================================================================
  const prioridade = (v: VendaHigienizadaInput) =>
    v.comprouCaptacao ? 0 : v.comprouPrincipal ? 1 : v.grupo === "captacao" ? 2 : 3;
  const vendaPorEmail = new Map<string, VendaHigienizadaInput>();
  const vendaPorTelefone = new Map<string, VendaHigienizadaInput>();
  for (const v of input.compradores) {
    const e = normalizarEmail(v.emailCru);
    const t = normalizarTelefone(v.telefoneCru);
    for (const [mapa, k] of [
      [vendaPorEmail, e],
      [vendaPorTelefone, t],
    ] as const) {
      if (!k) continue;
      const atual = mapa.get(k);
      if (!atual || prioridade(v) < prioridade(atual)) mapa.set(k, v);
    }
  }

  // ===================================================================
  // 3. Classificação (classificador ÚNICO da 49.2) e criativo do respondente
  // ===================================================================
  const tuplas = new Map<string, TuplaDePublico>();
  const casamento = { porEmail: 0, porTelefone: 0, semMatch: 0 };
  const respondentes: Respondente[] = dedupadas.map((v) => {
    let venda: VendaHigienizadaInput | null = null;
    if (v.email && vendaPorEmail.has(v.email)) {
      venda = vendaPorEmail.get(v.email)!;
      casamento.porEmail += 1;
    } else if (v.telefone && vendaPorTelefone.has(v.telefone)) {
      venda = vendaPorTelefone.get(v.telefone)!;
      casamento.porTelefone += 1;
    } else {
      casamento.semMatch += 1;
    }
    const lead = utmLimpa(v.r.utm);
    const utmVenda = venda ? utmLimpa(venda.utm) : null;
    const sellerName = (venda?.sellerName ?? "").trim() || null;
    const res = classificador.classificar({ lead, venda: utmVenda, sellerName });
    const segmento = SEGMENTO_DE_QUALIFICACAO[res.canal];
    if (!segmento) throw new Error(`computeDebriefingAudience: canal fora da união: ${String(res.canal)}`);
    const k = JSON.stringify([lead, utmVenda, sellerName]);
    if (!tuplas.has(k)) {
      tuplas.set(k, { lead, venda: utmVenda, sellerName, canal: res.canal, fechamento: res.fechamento, segmento });
    }

    const conteudo = utmContentEfetivo(v.r.utmContentCru);
    const adId = conteudo && RE_AD_ID.test(conteudo) ? conteudo : null;
    return {
      ...v,
      segmento,
      fechamento: res.fechamento,
      faixa: "semFaixa" as FaixaDoRespondente,
      adId,
      motivoSemCriativo: adId ? null : (v.r.utmContentCru ?? "").trim() ? "naoEhAdId" : "vazio",
    };
  });

  // ===================================================================
  // 4. Gate de perguntas (AC3) — só dimensão confirmada e presente
  // ===================================================================
  const stagesComPesquisa = [...new Set(input.pesquisas.map((p) => p.stageId))].sort(porOrdem);
  const chavesPorStage = new Map<string, Set<string>>();
  for (const p of input.pesquisas) {
    const s = chavesPorStage.get(p.stageId) ?? new Set<string>();
    for (const k of p.chavesDePergunta) s.add(k);
    chavesPorStage.set(p.stageId, s);
  }
  const chaveConfirmada = (stageId: string, campo: SurveyCanonicalField): string | null | undefined => {
    const conf = config.perguntasConfirmadas[stageId] as Record<string, string | null | undefined> | undefined;
    return conf ? conf[campo] : undefined;
  };
  const respostaDe = (resp: Respondente, campo: SurveyCanonicalField): string => {
    const chave = chaveConfirmada(resp.pesquisa.stageId, campo);
    if (typeof chave !== "string" || !resp.pesquisa.chavesDePergunta.includes(chave)) return "";
    return (resp.r.respostas[chave] ?? "").trim();
  };

  // Série histórica (49.11): a lista inteira, na ordem; sem ela, o lançamento
  // da `baseAnterior` (n = 1, o caso de antes).
  const series: readonly SerieDeComparacaoInput[] =
    input.seriesDeComparacao ??
    (input.baseAnterior
      ? [{ funnelId: input.baseAnterior.funnelId, nome: null, chavesDePerguntaComResposta: input.baseAnterior.chavesDePerguntaComResposta }]
      : []);
  const chavesPorSerie = series.map((sr) => ({
    funnelId: sr.funnelId,
    chaves: sr.chavesDePerguntaComResposta ? new Set(sr.chavesDePerguntaComResposta.map(normalizarResposta)) : null,
  }));
  /** A chave e o cabeçalho da pergunta (normalizados) — a série casa por qualquer um dos dois. */
  const nomesDaPergunta = (p: PerguntaDaDimensao): string[] => {
    const nomes = [p.chave];
    for (const pq of input.pesquisas) {
      const cab = pq.stageId === p.stageId ? pq.cabecalhoDaChave[p.chave] : undefined;
      if (cab) nomes.push(cab);
    }
    return nomes.map(normalizarResposta);
  };

  const dimensoes: DimensaoDePublico[] = [];
  const dimensoesNaoConfirmadas: DimensaoNaoConfirmada[] = [];
  let perguntasDaFaixa: PerguntaDaDimensao[] = [];
  let motivoFaixa: string | null = null;

  // Faixa primeiro, depois a ordem de SURVEY_CANONICAL_FIELDS.
  const campos: SurveyCanonicalField[] = ["faixa", ...SURVEY_CANONICAL_FIELDS.filter((c) => c !== "faixa")];
  for (const campo of campos) {
    const declaradas = stagesComPesquisa.map((stageId) => ({ stageId, chave: chaveConfirmada(stageId, campo) }));
    const confirmadas = declaradas.filter((d): d is PerguntaDaDimensao => typeof d.chave === "string" && d.chave !== "");
    const perguntas = declaradas.map((d) => ({ stageId: d.stageId, chave: typeof d.chave === "string" ? d.chave : null }));

    if (confirmadas.length === 0) {
      if (campo === "faixa" && declaradas.length > 0 && declaradas.every((d) => d.chave === null)) {
        // Resposta explícita da 49.1: "esta pesquisa não tem faixa A→D" — não é "não confirmada".
        motivoFaixa = "SEM_FAIXA_A_D: a config (49.1) declara que a pesquisa não tem faixa A→D — o motor não inventa lead score";
        continue;
      }
      dimensoesNaoConfirmadas.push({ campo, motivo: "nao-confirmada", perguntas });
      if (campo === "faixa") {
        motivoFaixa =
          declaradas.length === 0
            ? "SEM_PESQUISA: nenhuma etapa do lançamento tem pesquisa conectada"
            : "FAIXA_NAO_CONFIRMADA: nenhuma etapa com pesquisa confirmou a pergunta de faixa";
      }
      continue;
    }
    const presentes = confirmadas.filter((c) => chavesPorStage.get(c.stageId)?.has(c.chave));
    if (presentes.length === 0) {
      dimensoesNaoConfirmadas.push({ campo, motivo: "ausente-na-pesquisa", perguntas });
      if (campo === "faixa") motivoFaixa = "FAIXA_AUSENTE_NA_PESQUISA: a pergunta confirmada não existe na planilha";
      continue;
    }
    if (!respondentes.some((resp) => respostaDe(resp, campo) !== "")) {
      dimensoesNaoConfirmadas.push({ campo, motivo: "coluna-100pct-vazia", perguntas });
      if (campo === "faixa") motivoFaixa = "FAIXA_100PCT_VAZIA: a coluna de faixa existe mas não tem nenhuma resposta";
      continue;
    }
    if (campo === "faixa") perguntasDaFaixa = presentes;

    // Série histórica: a pergunta precisa ter resposta no lançamento atual (já
    // garantido acima) E em TODOS os lançamentos da lista (49.11, R5-3/R6-6).
    const { serieHistorica, serieHistoricaMotivo, lancamentosAusentes, lancamentosSemPesquisa } = qualificarSerie(
      chavesPorSerie,
      (chaves) => presentes.every((p) => nomesDaPergunta(p).some((nome) => chaves.has(nome))),
    );

    const tabela = (linhas: readonly Respondente[], rotuloDoRecorte: string): TabelaDaDimensao => {
      const grupos = new Map<string, { brutos: Map<string, number>; n: number }>();
      let semResposta = 0;
      for (const resp of linhas) {
        const bruto = respostaDe(resp, campo);
        if (!bruto) {
          semResposta += 1;
          continue;
        }
        const k = normalizarResposta(bruto);
        const g = grupos.get(k) ?? { brutos: new Map<string, number>(), n: 0 };
        g.n += 1;
        g.brutos.set(bruto, (g.brutos.get(bruto) ?? 0) + 1);
        grupos.set(k, g);
      }
      const n = linhas.length;
      const valores = [...grupos.values()]
        .map((g) => {
          // Grafia mais comum; empate → a que apareceu primeiro (`mostCommonRaw` do Resumão).
          let rotulo = "";
          let maior = 0;
          for (const [bruto, c] of g.brutos) {
            if (c > maior) {
              rotulo = bruto;
              maior = c;
            }
          }
          return { rotulo, n: g.n, pct: pctDe(g.n, n, `"${rotulo}"`, `n do recorte (${rotuloDoRecorte})`) };
        })
        .sort((a, b) => b.n - a.n || porOrdem(a.rotulo, b.rotulo));
      return {
        n,
        valores,
        semResposta: { n: semResposta, pct: pctDe(semResposta, n, "sem resposta", `n do recorte (${rotuloDoRecorte})`) },
      };
    };

    dimensoes.push({
      campo,
      perguntas: presentes,
      serieHistorica,
      serieHistoricaMotivo,
      ...(lancamentosAusentes ? { lancamentosAusentes } : {}),
      ...(lancamentosSemPesquisa ? { lancamentosSemPesquisa } : {}),
      total: tabela(respondentes, "pesquisa inteira deduplicada"),
      porSegmento: Object.fromEntries(
        SEGMENTOS_DE_QUALIFICACAO.map((s) => [s, tabela(respondentes.filter((r) => r.segmento === s), s)]),
      ) as Record<SegmentoDeQualificacao, TabelaDaDimensao>,
      porFechamento: {
        closer: tabela(respondentes.filter((r) => r.fechamento === "closer"), "closer"),
        "sem-closer": tabela(respondentes.filter((r) => r.fechamento === "sem-closer"), "sem-closer"),
      },
    });
  }

  const faixaAplicavel = perguntasDaFaixa.length > 0;
  if (faixaAplicavel) {
    for (const resp of respondentes) resp.faixa = faixaDaCelula(respostaDe(resp, "faixa"));
  }

  // ===================================================================
  // 5. Segmentos (aquisição) × fechamento — nunca somados entre si
  // ===================================================================
  const segmentos = SEGMENTOS_DE_QUALIFICACAO.map((segmento) => ({
    segmento,
    n: respondentes.filter((r) => r.segmento === segmento).length,
  }));
  const nCloser = respondentes.filter((r) => r.fechamento === "closer").length;
  const nSemCloser = respondentes.filter((r) => r.fechamento === "sem-closer").length;

  // ===================================================================
  // 6. Compradores de captação — as MESMAS chaves da 49.3
  // ===================================================================
  const linhasCap = input.compradores.filter((v) => v.grupo === "captacao");
  const chaves = chavesDeComprador(
    linhasCap.map((l) => ({ emailCru: l.emailCru, telefoneCru: l.telefoneCru, planilhaId: l.planilhaId, linha: l.linha })),
  );
  const compradoresCaptacao: Record<CriterioDeUnico, string[]> = { porEmail: [], porEmailOuTelefone: [] };
  for (const crit of ["porEmail", "porEmailOuTelefone"] as const) {
    const ancorados = new Set<string>();
    linhasCap.forEach((l, i) => {
      if (l.comprouCaptacao) ancorados.add(chaves[crit][i]!);
    });
    compradoresCaptacao[crit] = [...ancorados].sort();
  }

  // Comprador (critério headline, decisão 1 = porEmail).
  const compradorPorChave = new Map<string, CompradorDeCaptacao>();
  linhasCap.forEach((l, i) => {
    const chave = chaves.porEmail[i]!;
    let c = compradorPorChave.get(chave);
    if (!c && l.comprouCaptacao) {
      c = { chave, emails: new Set(), telefones: new Set(), tier: false, principal: false, ancora: l, respondente: null };
      compradorPorChave.set(chave, c);
    }
    if (!c) return;
    const e = normalizarEmail(l.emailCru);
    const t = normalizarTelefone(l.telefoneCru);
    if (e) c.emails.add(e);
    if (t) c.telefones.add(t);
    if (l.comprouTierSuperior) c.tier = true;
  });
  // Linhas de tier (bump) que vieram ANTES da âncora na ordem: segunda passada.
  linhasCap.forEach((l, i) => {
    const c = compradorPorChave.get(chaves.porEmail[i]!);
    if (c && l.comprouTierSuperior) c.tier = true;
  });
  const compradores = compradoresCaptacao.porEmail.map((k) => compradorPorChave.get(k)!);

  // Principal: e-mail primeiro, telefone como fallback.
  const principalEmails = new Set<string>();
  const principalTelefones = new Set<string>();
  for (const v of input.compradores) {
    if (!v.comprouPrincipal) continue;
    const e = normalizarEmail(v.emailCru);
    const t = normalizarTelefone(v.telefoneCru);
    if (e) principalEmails.add(e);
    if (t) principalTelefones.add(t);
  }
  const algum = (s: ReadonlySet<string>, alvo: ReadonlySet<string>) => [...s].some((x) => alvo.has(x));
  for (const c of compradores) c.principal = algum(c.emails, principalEmails) || algum(c.telefones, principalTelefones);

  // Comprador → respondente: e-mail primeiro, telefone depois (o primeiro respondente na ordem).
  const respPorEmail = new Map<string, Respondente>();
  const respPorTelefone = new Map<string, Respondente>();
  for (const r of respondentes) {
    if (r.email && !respPorEmail.has(r.email)) respPorEmail.set(r.email, r);
    if (r.telefone && !respPorTelefone.has(r.telefone)) respPorTelefone.set(r.telefone, r);
  }
  for (const c of compradores) {
    const porEmail = [...c.emails].sort().map((e) => respPorEmail.get(e)).find(Boolean);
    const porTel = porEmail ?? [...c.telefones].sort().map((t) => respPorTelefone.get(t)).find(Boolean);
    c.respondente = porTel ?? null;
  }
  const nCompradores = compradores.length;
  const responderam = compradores.filter((c) => c.respondente);

  const taxaDeResposta = razao(responderam.length, nCompradores, "compradores de captação que responderam", "compradores de captação", {
    percentual: true,
  });

  // ===================================================================
  // 7. Faixa (AC5) e conversão por faixa e por público (AC7)
  // ===================================================================
  const distribuicao = Object.fromEntries(FAIXAS_DO_RESPONDENTE.map((f) => [f, 0])) as Record<FaixaDoRespondente, number>;
  if (faixaAplicavel) for (const r of respondentes) distribuicao[r.faixa] += 1;
  const volumeAB = distribuicao.A + distribuicao.B;

  const linhaDeConversao = (grupo: readonly CompradorDeCaptacao[], rotulo: string): LinhaDeConversao => {
    const n = grupo.length;
    const p = grupo.filter((c) => c.principal).length;
    const t = grupo.filter((c) => c.tier).length;
    return {
      n,
      comprouPrincipal: p,
      comTierSuperior: t,
      ingressoPrincipal: razao(p, n, `compradores de captação (${rotulo}) que compraram o principal`, `compradores de captação (${rotulo})`),
      ingressoBump: razao(t, n, `compradores de captação (${rotulo}) com combo ou order bump`, `compradores de captação (${rotulo})`),
      amostraBaixa: n < PISO_DE_AMOSTRA,
    };
  };

  const semFaixaMotivo = motivoFaixa ?? "SEM_FAIXA";
  const faixa: DebriefingAudience["faixa"] = faixaAplicavel
    ? {
        aplicavel: true,
        perguntas: perguntasDaFaixa,
        distribuicao,
        volumeAB,
        pctAB: razao(volumeAB, nRespondentes, "respondentes A+B", "respondentes (pesquisa inteira deduplicada)", { percentual: true }),
        volumeD: distribuicao.D,
        coberturaDeFaixa: razao(
          compradores.filter((c) => c.respondente && FAIXAS.includes(c.respondente.faixa as Faixa)).length,
          nCompradores,
          "compradores de captação com faixa A→D",
          "compradores de captação",
          { percentual: true },
        ),
        conversaoPorFaixa: FAIXAS_DO_RESPONDENTE.map((f) => ({
          faixa: f,
          ...linhaDeConversao(responderam.filter((c) => c.respondente!.faixa === f), `faixa ${f}`),
        })),
      }
    : {
        aplicavel: false,
        motivo: semFaixaMotivo,
        perguntas: [],
        distribuicao,
        volumeAB: 0,
        pctAB: { valor: null, numerador: 0, denominador: nRespondentes, motivo: semFaixaMotivo, memoria: "faixa não se aplica" },
        volumeD: 0,
        coberturaDeFaixa: { valor: null, numerador: 0, denominador: nCompradores, motivo: semFaixaMotivo, memoria: "faixa não se aplica" },
        conversaoPorFaixa: [],
      };

  const conversaoPorSegmento = SEGMENTOS_DE_QUALIFICACAO.map((segmento) => ({
    segmento,
    ...linhaDeConversao(responderam.filter((c) => c.respondente!.segmento === segmento), segmento),
  }));

  // ===================================================================
  // 8. Criativo × Faixa (AC8) — em PROPORÇÃO, nunca contribuição absoluta
  // ===================================================================
  const dimensaoCriativo = config.dimensaoDeCriativo;
  const comCriativo = respondentes.filter((r) => r.adId);
  const semCriativo = {
    n: respondentes.length - comCriativo.length,
    vazio: respondentes.filter((r) => r.motivoSemCriativo === "vazio").length,
    naoEhAdId: respondentes.filter((r) => r.motivoSemCriativo === "naoEhAdId").length,
  };

  // Ad ID → nome: (1) cache do banco, (2) `adNameDoTerm` mais frequente, (3) o próprio Ad ID.
  const respsPorAdId = new Map<string, Respondente[]>();
  for (const r of comCriativo) {
    const lista = respsPorAdId.get(r.adId!) ?? [];
    lista.push(r);
    respsPorAdId.set(r.adId!, lista);
  }
  const nomeDoAdId = new Map<string, { nome: string; origem: CriativoXFaixa["origemDoNome"] }>();
  for (const [adId, resps] of respsPorAdId) {
    const doCache = (input.criativos.nomesDeAnuncio[adId] ?? "").trim();
    if (doCache) {
      nomeDoAdId.set(adId, { nome: doCache, origem: "cache" });
      continue;
    }
    const contagem = new Map<string, number>();
    for (const r of resps) {
      const n = adNameDoTerm(desembrulharUtm(r.r.utm.term).valor);
      if (n) contagem.set(n, (contagem.get(n) ?? 0) + 1);
    }
    const melhor = [...contagem.entries()].sort((a, b) => b[1] - a[1] || porOrdem(a[0], b[0]))[0];
    nomeDoAdId.set(adId, melhor ? { nome: melhor[0], origem: "utm_term" } : { nome: adId, origem: "ad_id" });
  }

  // Campanhas (ad-level) de cada Ad ID — pista cruzada do `video-estatico`.
  const campanhasDoAdId = new Map<string, Set<string>>();
  for (const a of input.criativos.anuncios) {
    if (!a.campaignName) continue;
    const s = campanhasDoAdId.get(a.adId) ?? new Set<string>();
    s.add(a.campaignName);
    campanhasDoAdId.set(a.adId, s);
  }
  const conflitosDeTipo: ConflitoDeTipo[] = [];
  const conflitoVisto = new Set<string>();
  /** Tipo de um Ad ID pelo nome resolvido + pista da campanha; registra o conflito (uma vez por Ad ID). */
  const tipoDoAdId = (adId: string, nome: string | null): TipoDeCriativo | "conflito" | "nao-classificado" | null => {
    if (dimensaoCriativo === "nenhuma") return null;
    if (!nome) return "nao-classificado";
    const peloNome = tipoPeloNome(nome, dimensaoCriativo);
    if (peloNome === "ambiguo") {
      if (!conflitoVisto.has(adId)) {
        conflitoVisto.add(adId);
        conflitosDeTipo.push({ adId, adName: nome, campaignName: null, pistaDoNome: "ambiguo", pistaDaCampanha: null, motivo: "IA_E_HUMANO_NO_NOME" });
      }
      return "conflito";
    }
    for (const campanha of [...(campanhasDoAdId.get(adId) ?? [])].sort()) {
      const pista = tipoPelaCampanha(campanha, dimensaoCriativo);
      if (pista && pista !== peloNome) {
        if (!conflitoVisto.has(adId)) {
          conflitoVisto.add(adId);
          conflitosDeTipo.push({ adId, adName: nome, campaignName: campanha, pistaDoNome: peloNome, pistaDaCampanha: pista, motivo: "NOME_X_CAMPANHA" });
        }
        return "conflito";
      }
    }
    return peloNome;
  };

  interface GrupoDeCriativo {
    chave: string;
    adIds: Map<string, number>;
    nomes: Map<string, { nome: string; origem: CriativoXFaixa["origemDoNome"] }>;
    resps: Respondente[];
  }
  const grupos = new Map<string, GrupoDeCriativo>();
  for (const [adId, resps] of respsPorAdId) {
    const nome = nomeDoAdId.get(adId)!;
    const normal = nome.origem === "ad_id" ? "" : normalizarNomeCampanha(nome.nome);
    const chave = normal ? `n:${normal}` : `id:${adId}`;
    const g: GrupoDeCriativo = grupos.get(chave) ?? { chave, adIds: new Map(), nomes: new Map(), resps: [] };
    g.adIds.set(adId, resps.length);
    g.nomes.set(adId, nome);
    g.resps.push(...resps);
    grupos.set(chave, g);
  }

  // R7-9: investimento por ad_id (spend cru do ad-level) e posts do cache, para o link do grupo.
  const spendPorAdId = new Map<string, number>();
  for (const a of input.criativos.anuncios) spendPorAdId.set(a.adId, (spendPorAdId.get(a.adId) ?? 0) + a.spendBruto);
  const postPorAdId = new Map(Object.entries(input.criativos.postsDosAnuncios));

  const criativos: CriativoXFaixa[] = [...grupos.values()].map((g) => {
    const porVolume = [...g.adIds.entries()].sort((a, b) => b[1] - a[1] || porOrdem(a[0], b[0])).map(([id]) => id);
    const adIdPrincipal = porVolume[0]!;
    const nome = g.nomes.get(adIdPrincipal)!;
    const porFaixa = Object.fromEntries(FAIXAS_DO_RESPONDENTE.map((f) => [f, 0])) as Record<FaixaDoRespondente, number>;
    for (const r of g.resps) porFaixa[r.faixa] += 1;
    const n = g.resps.length;
    const ab = porFaixa.A + porFaixa.B;
    const cd = porFaixa.C + porFaixa.D;
    const tipos = new Set(
      [...g.adIds.keys()].map((id) => {
        const n = g.nomes.get(id)!;
        return tipoDoAdId(id, n.origem === "ad_id" ? null : n.nome);
      }),
    );
    const tipo = tipos.has("conflito") ? "conflito" : tipos.size === 1 ? [...tipos][0]! : tipos.size === 0 ? null : "conflito";
    return {
      nome: nome.nome,
      nomeNaoResolvido: nome.origem === "ad_id",
      origemDoNome: nome.origem,
      adIds: [...g.adIds.keys()].sort(),
      adIdPrincipal,
      n,
      porFaixa,
      pctAB: pctDe(ab, n, "respondentes A+B do criativo", "respondentes do criativo"),
      pctCD: pctDe(cd, n, "respondentes C+D do criativo", "respondentes do criativo"),
      pctSemFaixa: pctDe(n - ab - cd, n, "respondentes sem faixa A→D do criativo", "respondentes do criativo"),
      amostraBaixa: n < PISO_DE_AMOSTRA,
      tipo,
      linkAdsManager: linkDoAdsManager(input.criativos.contaDeAnuncios, adIdPrincipal),
      linkDoPost: postDoGrupo(porVolume, spendPorAdId, postPorAdId),
    };
  });
  criativos.sort((a, b) => b.n - a.n || porOrdem(a.nome, b.nome) || porOrdem(a.adIdPrincipal, b.adIdPrincipal));

  const criativoXFaixa: DebriefingAudience["criativoXFaixa"] = {
    aplicavel: faixaAplicavel,
    ...(faixaAplicavel ? {} : { motivo: semFaixaMotivo }),
    criativos: faixaAplicavel ? criativos : [],
    semCriativo,
    somas: {
      criativos: faixaAplicavel ? criativos.reduce((s, c) => s + c.n, 0) : comCriativo.length,
      semCriativo: semCriativo.n,
      respondentes: nRespondentes,
    },
  };

  // ===================================================================
  // 9. Tipo de criativo (AC9) — convenção do expert, vinda da config
  // ===================================================================
  const anuncios = input.criativos.anuncios;
  const temAdLevel = anuncios.length > 0;
  let tipoDeCriativo: DebriefingAudience["tipoDeCriativo"];
  if (dimensaoCriativo === "nenhuma") {
    // `adLevel` registra o fato; a lacuna SEM_AD_LEVEL NÃO entra: sem dimensão
    // exibida, nada do documento lê o ad-level (49.15 — a guarda segue a mesma regra).
    tipoDeCriativo = {
      aplicavel: false,
      motivo: "SEM_CONVENCAO_DE_CRIATIVO: o expert não tem convenção de tipo no Ad Name (config 49.1) — a dimensão não é exibida",
      dimensao: dimensaoCriativo,
      tipos: [],
      naoClassificados: { criativos: 0, respondentes: 0 },
      conflitosDeTipo: [],
      ressalvas: [],
      adLevel: { aplicavel: temAdLevel, ...(temAdLevel ? {} : { motivo: "SEM_AD_LEVEL" as const }), linhas: anuncios.length },
    };
  } else {
    const tiposDaDimensao = TIPOS_POR_DIMENSAO[dimensaoCriativo];
    // Tipo de cada Ad ID do ad-level (nome do cache > nome da linha).
    const tipoDoAnuncio = new Map<string, ReturnType<typeof tipoDoAdId>>();
    const nomeDoAnuncio = (a: AnuncioDiaInput) => (input.criativos.nomesDeAnuncio[a.adId] ?? "").trim() || (a.adName ?? "").trim() || null;
    for (const a of anuncios) if (!tipoDoAnuncio.has(a.adId)) tipoDoAnuncio.set(a.adId, tipoDoAdId(a.adId, nomeDoAnuncio(a)));

    // Ingressos por tipo: o `utm_content` da linha de ingresso/combo do comprador.
    const vendasComConteudo = input.compradores.some((v) => (v.utmContentCru ?? "").trim() !== "");
    const ingressosPorTipo = new Map<TipoDeCriativo, number>();
    for (const c of compradores) {
      const id = utmContentEfetivo(c.ancora.utmContentCru);
      if (!id || !RE_AD_ID.test(id)) continue;
      const resolvido = nomeDoAdId.get(id);
      const nome =
        (input.criativos.nomesDeAnuncio[id] ?? "").trim() || (resolvido && resolvido.origem !== "ad_id" ? resolvido.nome : null);
      const t = tipoDoAnuncio.get(id) ?? tipoDoAdId(id, nome);
      if (t && t !== "conflito" && t !== "nao-classificado") ingressosPorTipo.set(t, (ingressosPorTipo.get(t) ?? 0) + 1);
    }

    const tipos: LinhaDoTipoDeCriativo[] = tiposDaDimensao.map((tipo) => {
      const doTipo = criativos.filter((c) => c.tipo === tipo);
      const n = doTipo.reduce((s, c) => s + c.n, 0);
      const ab = doTipo.reduce((s, c) => s + c.porFaixa.A + c.porFaixa.B, 0);
      const cd = doTipo.reduce((s, c) => s + c.porFaixa.C + c.porFaixa.D, 0);
      const faixaPct = (num: number, rot: string): Metrica =>
        faixaAplicavel ? pctDe(num, n, `respondentes ${rot} (${tipo})`, `respondentes (${tipo})`) : nula(semFaixaMotivo, "faixa não se aplica");

      const semAd = nula("SEM_AD_LEVEL", "sem ad-level no banco para o período (meta_ad_insights_daily) — a comparação de faixa segue disponível");
      if (!temAdLevel) {
        return {
          tipo,
          criativos: doTipo.length,
          respondentes: n,
          pctAB: faixaPct(ab, "A+B"),
          pctCD: faixaPct(cd, "C+D"),
          amostraBaixa: n < PISO_DE_AMOSTRA,
          investimentoComImposto: semAd,
          impressoes: null,
          linkClicks: null,
          ctr: semAd,
          cpc: semAd,
          ingressos: semAd,
          conversaoCliqueIngresso: semAd,
          custoPorIngresso: semAd,
        };
      }
      const linhas = anuncios.filter((a) => tipoDoAnuncio.get(a.adId) === tipo);
      const investimento = linhas.reduce((s, a) => s + aplicarImposto(a.spendBruto, a.dia, pctImposto), 0);
      const impressoes = linhas.reduce((s, a) => s + a.impressoes, 0);
      const linkClicks = somarLinkClicks(linhas);
      const ctrV = ctrDeLink(linkClicks, impressoes);
      const cpcV = cpcDeLink(linkClicks, investimento);
      const ing = ingressosPorTipo.get(tipo) ?? 0;
      const semCliques = linkClicks == null;
      const ingressos: Metrica = vendasComConteudo
        ? { valor: ing, memoria: `compradores de captação cujo ingresso veio de anúncio "${tipo}" (utm_content da venda) = ${fmtInt(ing)}` }
        : nula("SEM_UTM_CONTENT_NA_VENDA", "as planilhas de venda não trazem utm_content — ingresso por criativo não medido");
      return {
        tipo,
        criativos: doTipo.length,
        respondentes: n,
        pctAB: faixaPct(ab, "A+B"),
        pctCD: faixaPct(cd, "C+D"),
        amostraBaixa: n < PISO_DE_AMOSTRA,
        investimentoComImposto: {
          valor: investimento,
          memoria: `Σ spend ÷ (1 − ${fmtPct(pctImposto * 100)}) por dia a partir de 2026-01-01, ${fmtInt(linhas.length)} linha(s) anúncio×dia = ${fmtReais(investimento)}`,
        },
        impressoes,
        linkClicks,
        ctr:
          ctrV === null
            ? nula(semCliques ? "LINK_CLICK_AUSENTE" : "SEM_IMPRESSOES", semCliques ? "a Meta não devolveu link_click — CTR não medido (nunca cliques totais)" : "sem impressões")
            : { valor: ctrV, memoria: `link_click ${fmtInt(linkClicks!)} ÷ impressões ${fmtInt(impressoes)} × 100 = ${fmtPct(ctrV)}` },
        cpc:
          cpcV === null
            ? nula(semCliques ? "LINK_CLICK_AUSENTE" : "SEM_CLIQUES", semCliques ? "a Meta não devolveu link_click — CPC não medido" : "zero link_click — sem denominador")
            : { valor: cpcV, memoria: `investimento c/ imposto ${fmtReais(investimento)} ÷ link_click ${fmtInt(linkClicks!)} = ${fmtReais(cpcV)}` },
        ingressos,
        conversaoCliqueIngresso:
          ingressos.valor === null
            ? ingressos
            : semCliques
              ? nula("LINK_CLICK_AUSENTE", "a Meta não devolveu link_click — conversão clique→ingresso não medida")
              : pctDe(ing, linkClicks!, `ingressos (${tipo})`, `link_click (${tipo})`),
        custoPorIngresso:
          ingressos.valor === null
            ? ingressos
            : (() => {
                const r = razao(investimento, ing, `investimento c/ imposto (${tipo})`, `ingressos (${tipo})`, { formatar: fmtReais });
                return r.motivo ? { valor: null, memoria: r.memoria, motivo: r.motivo } : { valor: r.valor, memoria: r.memoria };
              })(),
      };
    });

    const naoClass = criativos.filter((c) => c.tipo === "nao-classificado" || c.tipo === "conflito");
    tipoDeCriativo = {
      aplicavel: true,
      dimensao: dimensaoCriativo,
      tipos,
      naoClassificados: { criativos: naoClass.length, respondentes: naoClass.reduce((s, c) => s + c.n, 0) },
      conflitosDeTipo: [...conflitosDeTipo].sort((a, b) => porOrdem(a.adId, b.adId)),
      ressalvas: dimensaoCriativo === "ia-humano" ? ["COPY_NAO_PAREADA"] : [],
      adLevel: { aplicavel: temAdLevel, ...(temAdLevel ? {} : { motivo: "SEM_AD_LEVEL" as const }), linhas: anuncios.length },
    };
    if (!temAdLevel) {
      lacunas.push({
        codigo: "SEM_AD_LEVEL",
        motivo: "sem ad-level no banco para o período (meta_ad_insights_daily) — CTR, CPC e custo por tipo de criativo não medidos; a faixa por tipo segue",
      });
    }
  }

  // ===================================================================
  // 10. Cross-launch (AC10) — e-mail ∪ telefone
  // ===================================================================
  const base = input.baseAnterior ?? null;
  let crossLaunch: DebriefingAudience["crossLaunch"];
  if (!base) {
    const na = nula("SEM_LANCAMENTO_DE_COMPARACAO", "a config (49.1) não tem lançamento de comparação — cross-launch não se aplica");
    crossLaunch = {
      aplicavel: false,
      motivo: "SEM_LANCAMENTO_DE_COMPARACAO",
      funnelIdAnterior: null,
      tipoDaBase: null,
      criterio: "email-ou-telefone",
      leadsAnteriores: null,
      compradoresAnteriores: null,
      retornoDaBase: na,
      retornoDaBasePrincipal: na,
      jaEmBaseAnterior: { captacao: na, principal: na },
    };
  } else {
    /** Pessoas únicas de uma lista (união por e-mail OU telefone), com os identificadores de cada uma. */
    const pessoas = (lista: readonly IdentidadeInput[], escopo: string) => {
      const ch = chavesDeComprador(lista.map((x, i) => ({ emailCru: x.emailCru, telefoneCru: x.telefoneCru, planilhaId: escopo, linha: i + 1 })));
      const porChave = new Map<string, { emails: Set<string>; telefones: Set<string> }>();
      lista.forEach((x, i) => {
        const k = ch.porEmailOuTelefone[i]!;
        const p = porChave.get(k) ?? { emails: new Set<string>(), telefones: new Set<string>() };
        const e = normalizarEmail(x.emailCru);
        const t = normalizarTelefone(x.telefoneCru);
        if (e) p.emails.add(e);
        if (t) p.telefones.add(t);
        porChave.set(k, p);
      });
      // Linha sem e-mail nem telefone não identifica ninguém: fora da base.
      return [...porChave.values()].filter((p) => p.emails.size > 0 || p.telefones.size > 0);
    };
    const leadsAnt = base.tipo === "leads+compradores" ? pessoas(base.leads, "base-anterior-leads") : [];
    const compradoresAnt = pessoas(base.compradores, "base-anterior-compradores");
    const baseEmails = new Set<string>();
    const baseTelefones = new Set<string>();
    for (const p of [...leadsAnt, ...compradoresAnt]) {
      for (const e of p.emails) baseEmails.add(e);
      for (const t of p.telefones) baseTelefones.add(t);
    }
    const capEmails = new Set<string>();
    const capTelefones = new Set<string>();
    for (const c of compradores) {
      for (const e of c.emails) capEmails.add(e);
      for (const t of c.telefones) capTelefones.add(t);
    }
    const casa = (p: { emails: Set<string>; telefones: Set<string> }, emails: ReadonlySet<string>, tels: ReadonlySet<string>) =>
      algum(p.emails, emails) || algum(p.telefones, tels);

    // Compradores do principal (pessoas) do destino.
    const linhasPrincipal = input.compradores.filter((v) => v.comprouPrincipal);
    const principalPessoas = pessoas(
      linhasPrincipal.map((v) => ({ emailCru: v.emailCru, telefoneCru: v.telefoneCru })),
      "destino-principal",
    );

    let retornoDaBase: MetricaRazao | Metrica;
    let retornoDaBasePrincipal: MetricaRazao | Metrica;
    if (base.tipo === "leads+compradores") {
      const voltaram = leadsAnt.filter((p) => casa(p, capEmails, capTelefones)).length;
      const principal = leadsAnt.filter((p) => casa(p, principalEmails, principalTelefones)).length;
      retornoDaBase = razao(voltaram, leadsAnt.length, "leads do anterior que compraram a captação agora", "leads do anterior (únicos por e-mail ∪ telefone)", {
        percentual: true,
      });
      retornoDaBasePrincipal = razao(principal, leadsAnt.length, "leads do anterior que compraram o principal agora", "leads do anterior (únicos por e-mail ∪ telefone)", {
        percentual: true,
      });
    } else {
      const sem = nula(
        "BASE_ANTERIOR_SEM_LEADS",
        "o lançamento de comparação não tem planilha de leads nem pesquisa conectada — só a base de compradores (medida da skill não reproduzível)",
      );
      retornoDaBase = sem;
      retornoDaBasePrincipal = sem;
      lacunas.push({
        codigo: "BASE_ANTERIOR_SEM_LEADS",
        motivo: "o lançamento de comparação não tem planilha de leads nem pesquisa conectada — cross-launch medido só contra os compradores do anterior",
        detalhe: `funil ${base.funnelId}`,
      });
    }
    const rotuloBase = base.tipo === "leads+compradores" ? "base anterior (leads ∪ compradores)" : "base anterior (só compradores)";
    const naBase = compradores.filter((c) => casa(c, baseEmails, baseTelefones));
    crossLaunch = {
      aplicavel: true,
      funnelIdAnterior: base.funnelId,
      tipoDaBase: base.tipo,
      criterio: "email-ou-telefone",
      leadsAnteriores: base.tipo === "leads+compradores" ? leadsAnt.length : null,
      compradoresAnteriores: compradoresAnt.length,
      retornoDaBase,
      retornoDaBasePrincipal,
      jaEmBaseAnterior: {
        captacao: razao(
          naBase.length,
          nCompradores,
          `compradores de captação presentes na ${rotuloBase}`,
          "compradores de captação",
          { percentual: true },
        ),
        principal: razao(
          principalPessoas.filter((p) => casa(p, baseEmails, baseTelefones)).length,
          principalPessoas.length,
          `compradores do principal presentes na ${rotuloBase}`,
          "compradores do principal (únicos por e-mail ∪ telefone)",
          { percentual: true },
        ),
      },
      // 49.20 (AC1): quem é a recompra — a composição abre por origem do comprador (Motor I).
      compradoresNaBaseAnterior: naBase.map((c) => c.chave).sort(),
    };
  }

  // ===================================================================
  // 11. Mídia por anúncio (Story 49.18) — ad-level × compradores pelo ad_id da venda
  // ===================================================================
  const midiaPorAnuncio = computeMidiaPorAnuncio({
    anuncios: input.criativos.anuncios.map((a) => ({
      adId: a.adId,
      nome: (input.criativos.nomesDeAnuncio[a.adId] ?? "").trim() || (a.adName ?? "").trim() || null,
      campaignName: a.campaignName,
      dia: a.dia,
      investimentoComImposto: aplicarImposto(a.spendBruto, a.dia, pctImposto),
      linkClicks: a.linkClicks,
      landingPageViews: a.landingPageViews ?? null,
      conjuntoId: a.adsetId ?? null,
      conjuntoNome: a.adsetName ?? null,
    })),
    compradores: compradoresDaMidia(compradores, linhasCap, chaves.porEmail),
    vendasComConteudo: input.compradores.some((v) => (v.utmContentCru ?? "").trim() !== ""),
    postsDosAnuncios: input.criativos.postsDosAnuncios,
    ...(input.criativos.textosDosAnuncios ? { textosDosAnuncios: input.criativos.textosDosAnuncios } : {}),
    linkAdsManagerDe: (adId) => linkDoAdsManager(input.criativos.contaDeAnuncios, adId),
  });

  lacunas.push({
    codigo: "LISTAS_FRONT_COMUNIDADE",
    motivo: "sem fonte no Loyola",
    detalhe: "Comunidade/Front não são segmentos nem são aproximados — Comunidade→Principal e Front→Principal não são calculadas",
  });

  const tuplasClassificadas = [...tuplas.values()];
  const resultado: DebriefingAudience = {
    versao: 1,
    janela: { ...janela },
    classificadorVersao: classificador.versao,
    origemDoValor: { investimentoPorTipoDeCriativo: "meta_ad_insights_daily.spend" },
    pesquisa: {
      linhasLidas: respostas.length,
      vazias,
      duplicadasRemovidas,
      respondentes: nRespondentes,
      duplicadasSemData,
      duplicadasDecididasPelaPesquisaDeCaptacao: decididasPor.pesquisaDeCaptacao,
      memoria:
        `linhas lidas ${fmtInt(respostas.length)} − sem respondente ${fmtInt(vazias)} − e-mail repetido ${fmtInt(duplicadasRemovidas)}` +
        ` = ${fmtInt(nRespondentes)} respondente(s) (vale a resposta mais recente: maior dia; empate ou sem data → ` +
        (temPesquisaMarcada
          ? `a da pesquisa de captação marcada na config (${fmtInt(decididasPor.pesquisaDeCaptacao)}), senão a linha posterior)`
          : "linha posterior)"),
      porPesquisa,
    },
    perguntasConfirmadas: config.perguntasConfirmadas,
    dimensoes,
    dimensoesNaoConfirmadas,
    casamento,
    segmentos,
    fechamento: { closer: { n: nCloser }, semCloser: { n: nSemCloser } },
    somas: { segmentos: segmentos.reduce((s, x) => s + x.n, 0), fechamento: nCloser + nSemCloser, respondentes: nRespondentes },
    tuplasClassificadas,
    tuplasSemNomeDeCampanha: tuplasClassificadas.filter((t) => [t.lead, t.venda].some((u) => u && u.campaign && !u.campaignName)).length,
    compradoresCaptacao,
    taxaDeResposta,
    faixa,
    conversaoPorSegmento,
    criativoXFaixa,
    tipoDeCriativo,
    crossLaunch,
    lacunas,
    midiaPorAnuncio,
    ...(series.length >= 2
      ? {
          serieHistorica: {
            lancamentos: series.map((sr, i) => ({ funnelId: sr.funnelId, nome: sr.nome, posicao: i + 1, principal: i === 0 })),
          },
        }
      : {}),
  };
  // 49.12 (AC6): carrinho que não abriu até o corte → o que depende dele vira lacuna.
  const semCarrinho = corteSemCarrinho(janela);
  return semCarrinho ? comLacunaDoCarrinhoNoPublico(resultado, semCarrinho) : resultado;
}

// ---------------------------------------------------------------------------
// Story 49.18 — compradores de captação para a mídia por anúncio
// ---------------------------------------------------------------------------

/**
 * Cada comprador de captação (pessoa, critério headline) com o ad_id do
 * `utm_content` da linha de ingresso/combo (a âncora — a mesma do ingresso por
 * tipo de criativo), o faturamento da captação da pessoa (todas as linhas de
 * captação dela, como o `porComprador` do Motor I) e o dia da compra da âncora.
 */
function compradoresDaMidia(
  compradores: readonly CompradorDeCaptacao[],
  linhasCap: readonly VendaHigienizadaInput[],
  chavesPorEmail: readonly string[],
): CompradorDaMidia[] {
  const centavosPorChave = new Map<string, number | null>();
  linhasCap.forEach((l, i) => {
    const k = chavesPorEmail[i]!;
    const atual = centavosPorChave.get(k);
    if (atual === null) return;
    centavosPorChave.set(k, l.centavos === undefined ? null : (atual ?? 0) + l.centavos);
  });
  return compradores.map((c) => {
    const conteudo = utmContentEfetivo(c.ancora.utmContentCru);
    const centavos = centavosPorChave.get(c.chave);
    return {
      adId: conteudo && RE_AD_ID.test(conteudo) ? conteudo : null,
      faturamento: centavos === null || centavos === undefined ? null : centavos / 100,
      tierSuperior: c.tier,
      dia: c.ancora.dia ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Story 49.20 — recompra por origem do comprador (AC1)
// ---------------------------------------------------------------------------

/** A origem do comprador na recompra: os canais do classificador da 49.2, com o ADV+ separado do frio (49.18 AC4). */
export type OrigemDaRecompra = Canal | "Pago Frio ADV+";

/** A ordem fixa das linhas: a dos canais (`CANAIS`), com o "Pago Frio ADV+" logo depois do "Pago Frio". */
export const ORIGENS_DA_RECOMPRA: readonly OrigemDaRecompra[] = CANAIS.flatMap((c): OrigemDaRecompra[] =>
  c === "Pago Frio" ? [c, "Pago Frio ADV+"] : [c],
);

/** As origens pagas — o denominador de "quanto do pago é gente da casa". */
export const ORIGENS_PAGAS_DA_RECOMPRA: readonly OrigemDaRecompra[] = ["Pago Quente", "Pago Frio", "Pago Frio ADV+", "Pago N/D"];

export interface LinhaDaRecompra {
  origem: OrigemDaRecompra;
  /** Compradores de captação desta origem (critério headline). */
  compradores: number;
  /** Desses, os que já estavam na base do lançamento de comparação (e-mail ou telefone). */
  naBase: number;
  /** `naBase ÷ compradores` da origem (percentual): quanto da origem é gente da casa. */
  pctDaOrigem: MetricaRazao;
  /** `naBase ÷ total na base` (percentual): a composição da recompra. Σ = 100%. */
  pctDaRecompra: MetricaRazao;
}

export interface RecompraPorOrigem {
  aplicavel: boolean;
  motivo?: string;
  /** A mesma regra de casamento do cross-launch. */
  criterio: "email-ou-telefone";
  linhas: LinhaDaRecompra[];
  /**
   * `total.naBase` = o numerador de `crossLaunch.jaEmBaseAnterior.captacao`; `pctDaRecompra` = a soma
   * da coluna (100% quando alguém da base comprou). `null` quando não se aplica (nunca zero).
   */
  total: { compradores: number; naBase: number; pctDaRecompra: MetricaRazao } | null;
  /** AC1 — quanto do pago é gente da casa: compradores pagos já na base ÷ compradores pagos. `null` quando não se aplica. */
  pago: { compradores: number; naBase: number; daCasa: MetricaRazao } | null;
  memoria: string;
}

/** A origem de um comprador do Motor I na recompra (o ADV+ só existe dentro do frio). */
export function origemDaRecompra(c: Pick<CompradorDoMotorI, "canal" | "frioAdv">): OrigemDaRecompra {
  return c.canal === "Pago Frio" && c.frioAdv === true ? "Pago Frio ADV+" : c.canal;
}

/**
 * Story 49.20 (AC1) — puro. Cruza os compradores de captação do Motor I (a
 * origem de cada um: o canal da Tabela 1, com o ADV+) com as chaves que o
 * cross-launch do Motor II achou na base anterior. As duas listas usam as
 * MESMAS chaves (critério headline; a guarda F3 confere). As listas Comunidade
 * e Front continuam lacuna (`LISTAS_FRONT_COMUNIDADE`): não entram aqui.
 *
 * Nunca número errado em silêncio: sem base de comparação, payload anterior à
 * 49.20 ou chave da base que o Motor I não conhece → `aplicavel = false` com o motivo.
 */
export function computeRecompraPorOrigem(
  compradores: readonly Pick<CompradorDoMotorI, "chave" | "canal" | "frioAdv">[],
  crossLaunch: Pick<DebriefingAudience["crossLaunch"], "aplicavel" | "motivo" | "compradoresNaBaseAnterior">,
): RecompraPorOrigem {
  const vazio = (motivo: string, memoria: string): RecompraPorOrigem => ({
    aplicavel: false,
    motivo,
    criterio: "email-ou-telefone",
    linhas: [],
    total: null,
    pago: null,
    memoria,
  });
  if (!crossLaunch.aplicavel) {
    const motivo = crossLaunch.motivo ?? "SEM_LANCAMENTO_DE_COMPARACAO";
    return vazio(motivo, "sem base do lançamento de comparação — a recompra não se calcula");
  }
  const chavesNaBase = crossLaunch.compradoresNaBaseAnterior;
  if (!chavesNaBase) {
    return vazio("RECOMPRA_NAO_CALCULADA", "o cross-launch não traz quem estava na base (payload anterior à Story 49.20)");
  }
  const origemPorChave = new Map(compradores.map((c) => [c.chave, origemDaRecompra(c)]));
  const desconhecidas = chavesNaBase.filter((k) => !origemPorChave.has(k));
  if (desconhecidas.length > 0) {
    return vazio(
      "CHAVES_DIFERENTES_ENTRE_OS_MOTORES",
      `${fmtInt(desconhecidas.length)} comprador(es) da base anterior sem origem no Motor I — as chaves dos dois motores não batem (guarda F3)`,
    );
  }
  const naBase = new Set(chavesNaBase);
  const porOrigem = new Map<OrigemDaRecompra, { compradores: number; naBase: number }>(ORIGENS_DA_RECOMPRA.map((o) => [o, { compradores: 0, naBase: 0 }]));
  for (const c of compradores) {
    const g = porOrigem.get(origemDaRecompra(c));
    if (!g) throw new Error(`computeRecompraPorOrigem: canal fora da união: ${String(c.canal)}`);
    g.compradores += 1;
    if (naBase.has(c.chave)) g.naBase += 1;
  }
  const totalNaBase = naBase.size;
  const linhas: LinhaDaRecompra[] = ORIGENS_DA_RECOMPRA.map((origem) => {
    const g = porOrigem.get(origem)!;
    return {
      origem,
      compradores: g.compradores,
      naBase: g.naBase,
      pctDaOrigem: razao(g.naBase, g.compradores, `compradores de captação (${origem}) já na base anterior`, `compradores de captação (${origem})`, {
        percentual: true,
      }),
      pctDaRecompra: razao(g.naBase, totalNaBase, `compradores de captação (${origem}) já na base anterior`, "compradores de captação já na base anterior", {
        percentual: true,
      }),
    };
  });
  const pagas = linhas.filter((l) => ORIGENS_PAGAS_DA_RECOMPRA.includes(l.origem));
  const pagos = pagas.reduce((s, l) => s + l.compradores, 0);
  const pagosNaBase = pagas.reduce((s, l) => s + l.naBase, 0);
  return {
    aplicavel: true,
    criterio: "email-ou-telefone",
    linhas,
    total: {
      compradores: compradores.length,
      naBase: totalNaBase,
      pctDaRecompra: razao(totalNaBase, totalNaBase, "compradores de captação já na base anterior", "compradores de captação já na base anterior", {
        percentual: true,
      }),
    },
    pago: {
      compradores: pagos,
      naBase: pagosNaBase,
      daCasa: razao(pagosNaBase, pagos, "compradores pagos (quente, frio, frio ADV+, N/D) já na base anterior", "compradores pagos", { percentual: true }),
    },
    memoria:
      `${fmtInt(totalNaBase)} de ${fmtInt(compradores.length)} compradores de captação já estavam na base anterior (e-mail ou telefone — a regra do cross-launch); ` +
      "origem = o canal do comprador na Tabela 1 (classificador da 49.2), com o ADV+ (cold-adv no texto que decidiu a temperatura) separado do frio; " +
      "listas Comunidade/Front fora (lacuna LISTAS_FRONT_COMUNIDADE)",
  };
}

// ---------------------------------------------------------------------------
// Story 49.12 — corte e lacuna do carrinho
// ---------------------------------------------------------------------------

/** Respostas até o corte (resposta sem data legível fica). */
function respostasAteOCorte(respostas: readonly RespostaInput[], corte: string): RespostaInput[] {
  return respostas.filter((r) => {
    const dia = dataBrt(r.dataRespostaCru);
    return dia === null || dia <= corte;
  });
}

/**
 * As métricas do Motor II que dependem de venda do principal (49.12 AC6): com o
 * carrinho fechado no corte, `valor = null` com o motivo `CARRINHO_AINDA_NAO_ABRIU`.
 */
export const METRICAS_SEM_CARRINHO_PUBLICO = [
  "faixa.conversaoPorFaixa[].ingressoPrincipal",
  "conversaoPorSegmento[].ingressoPrincipal",
  "crossLaunch.retornoDaBasePrincipal",
  "crossLaunch.jaEmBaseAnterior.principal",
] as const;

function comLacunaDoCarrinhoNoPublico(r: DebriefingAudience, corte: CorteDaJanela): DebriefingAudience {
  const sem = <M extends { valor: unknown; memoria: string; motivo?: string }>(m: M) => semValorPeloCarrinho(m, corte);
  return {
    ...r,
    faixa: { ...r.faixa, conversaoPorFaixa: r.faixa.conversaoPorFaixa.map((l) => ({ ...l, ingressoPrincipal: sem(l.ingressoPrincipal) })) },
    conversaoPorSegmento: r.conversaoPorSegmento.map((l) => ({ ...l, ingressoPrincipal: sem(l.ingressoPrincipal) })),
    crossLaunch: r.crossLaunch.aplicavel
      ? {
          ...r.crossLaunch,
          retornoDaBasePrincipal: sem(r.crossLaunch.retornoDaBasePrincipal),
          jaEmBaseAnterior: { ...r.crossLaunch.jaEmBaseAnterior, principal: sem(r.crossLaunch.jaEmBaseAnterior.principal) },
        }
      : r.crossLaunch,
    lacunas: [
      ...r.lacunas,
      {
        codigo: LACUNA_CARRINHO_AINDA_NAO_ABRIU,
        motivo: `${textoDaLacunaDoCarrinho(corte)} — o que depende de venda do principal não é calculado (lacuna escrita, nunca zero)`,
        detalhe: METRICAS_SEM_CARRINHO_PUBLICO.join(", "),
      },
    ],
  };
}
