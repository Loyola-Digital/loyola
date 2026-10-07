/**
 * Story 49.1 — Config do gerador de debriefing + gates (Epic 49).
 *
 * A skill `loyola-debriefing` não avança sem as premissas da Fase 0 (datas-chave:
 * captação, carrinho, reabertura "se houve", downsell) e da Fase 8 (perguntas da
 * pesquisa confirmadas: dimensão que a pesquisa não tem NÃO entra). Nenhuma
 * delas existe no banco; esta config as guarda por ETAPA DE DEBRIEFING.
 *
 * Mesmo princípio da 41.1: o gate mora AQUI DENTRO, no carregador.
 * `loadDebriefingConfig` é a ÚNICA porta dos geradores (49.3+): devolve config
 * liberada ou lança. `loadDebriefingConfigRaw` é a ÚNICA porta crua e existe só
 * para a rota de leitura da UI (`routes/debriefing-config.ts`), que precisa
 * exibir justamente o estado bloqueado. O montador da forma crua não é
 * exportado, e um teste de superfície falha se outro arquivo de `src/` importar
 * a porta crua, o store ou a tabela `debriefingConfigs` (49.1 QA ARCH-001).
 *
 * Ordem dos portões (49.1 AC11 + AC6; 49.6 AC1 passo 3):
 *   1. tipo do funil — `perpetual` (até a 49.10) e qualquer tipo fora de
 *      `launch`/`perpetual` (ex.: `mobile`) → TIPO_DE_FUNIL_NAO_SUPORTADO,
 *      sem ler a config nem chamar motor nenhum;
 *   2. sem config → COMBINACAO_NAO_VALIDADA (nunca assumir default);
 *   3. combinação fora da lista liberada e sem `validado` → COMBINACAO_NAO_VALIDADA;
 *   4. config incompleta → CONFIG_INCOMPLETA (lista os campos).
 *
 * Story 49.11: o lançamento de comparação vira uma LISTA ordenada
 * (`lancamentosComparacao`, migration 0162; o 1º é a principal, R6-5) — lida
 * sempre por `comparacoesDe`, com a coluna antiga mandando na divergência
 * (`listaDeComparacaoDaLinha`) — e a config ganha `pesquisaDeCaptacaoPorEtapa`
 * (R6-7: a pesquisa que vence o desempate sem data).
 *
 * O gate do Resumão (`assertReportScope`, `launch_report_configs`) NÃO é tocado.
 * O código `COMBINACAO_NAO_VALIDADA` é a mesma string por desenho (padrão 41.1);
 * as rotas são distintas e o `detalhe` diz "gerador de debriefing".
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  debriefingConfigs,
  debriefingPayloads,
  expertReportConfigs,
  funnelStages,
  funnelSurveys,
  funnels,
  projects,
  users,
  LAUNCH_REPORT_ETAPAS,
  SURVEY_CANONICAL_FIELDS,
  type SurveyCanonicalField,
} from "../db/schema.js";
import type { Database } from "../db/client.js";
import { resolveImpostoPct, type ImpostoResolvido } from "./launch-report-config.js";
import { computeSurveyForStage } from "./survey-aggregation.js";

// ------------------------------------------------------------------
// Vocabulário
// ------------------------------------------------------------------

/**
 * Papel de cada etapa que compõe o lançamento. MESMO vocabulário do Resumão
 * (`LAUNCH_REPORT_ETAPAS`, por spread — a constante do Resumão não muda) mais
 * `reabertura`: as taxas headline do lançamento não incluem etapa
 * extraordinária (padrão §4b.4), e o motor da 49.3 precisa separá-la.
 */
export const DEBRIEFING_PAPEIS = [...LAUNCH_REPORT_ETAPAS, "reabertura"] as const;
export type DebriefingPapel = (typeof DEBRIEFING_PAPEIS)[number];

/** Recorte de criativo do expert (49.4 AC9). `nenhuma` é resposta explícita. */
export const DIMENSOES_DE_CRIATIVO = ["ia-humano", "video-estatico", "nenhuma"] as const;
export type DimensaoDeCriativo = (typeof DIMENSOES_DE_CRIATIVO)[number];

/** Reabertura/downsell: resposta EXPLÍCITA. Ausência (null) ≠ "não houve". */
export type RespostaEtapaExtra =
  | { houve: false }
  | { houve: true; abertura: string; fim: string };

/**
 * Story 49.12 (R8-1, AC1) — "O lançamento terminou?": resposta EXPLÍCITA na
 * config. Config salva antes da 49.12 = `encerrado` (decisão de escopo: o PUT
 * só aceitava as três datas, então toda config gravada descreve um lançamento
 * encerrado; a 0168 grava o DEFAULT `encerrado`).
 */
export const SITUACOES_DO_LANCAMENTO = ["encerrado", "em-andamento"] as const;
export type SituacaoDoLancamento = (typeof SITUACOES_DO_LANCAMENTO)[number];

/**
 * Story 49.12 (AC2) — as fases que aceitam "ainda não aconteceu" no modo em
 * andamento. "Ainda não aconteceu" ≠ "não houve": "não houve" afirma que a
 * etapa não existiu; "ainda não aconteceu" diz que ela não começou até o corte.
 */
export const FASES_QUE_PODEM_NAO_TER_ACONTECIDO = ["aberturaCarrinho", "fimCarrinho", "reabertura", "downsell"] as const;
export type FaseQuePodeNaoTerAcontecido = (typeof FASES_QUE_PODEM_NAO_TER_ACONTECIDO)[number];

export interface EtapaDoLancamento {
  stageId: string;
  papel: DebriefingPapel;
}

/**
 * Perguntas confirmadas de UMA etapa com pesquisa. `faixa` exige resposta
 * explícita (chave da pergunta, ou `null` = "esta pesquisa não tem faixa A→D");
 * as demais dimensões são opcionais — a não confirmada não existe para os blocos
 * seguintes (nunca vira erro, nunca é inferida).
 */
export type PerguntasConfirmadasDaEtapa = {
  faixa: string | null;
} & Partial<Record<Exclude<SurveyCanonicalField, "faixa">, string>>;

/** Contrato: `{ [stageId]: PerguntasConfirmadasDaEtapa }` — só etapas com pesquisa. */
export type PerguntasConfirmadas = Record<string, PerguntasConfirmadasDaEtapa>;

/**
 * Como está gravado: `faixa` pode faltar (sem resposta → CONFIG_INCOMPLETA).
 * O gate só entrega `PerguntasConfirmadas` depois de exigir a `faixa`.
 */
export type PerguntasConfirmadasGravadas = Record<string, Partial<PerguntasConfirmadasDaEtapa>>;

export type TipoDeFunil = "launch" | "perpetual" | "mobile";

// ------------------------------------------------------------------
// Combinações liberadas (decisão 2 do dono, 2026-09-30)
// ------------------------------------------------------------------

export interface CombinacaoLiberada {
  projectId: string;
  funnelId: string;
  /** Só para leitura humana/auditoria — a chave é o par de ids. */
  rotulo: string;
}

/**
 * Decisão 2 do dono (2026-09-30): **DG + FZ + Netão, em Lançamentos E Perpétuo**.
 * A chave é (projectId, funnelId) POR ID (resolução 8). Retrato "no dia 1":
 * os funis `launch`/`perpetual` desses três projetos existentes na
 * implementação, levantados por SELECT somente leitura em produção em
 * 2026-10-01 (lista também no Change Log da story 49.1). Nenhum id foi escrito
 * a partir do nome.
 *
 * Funil criado DEPOIS deste retrato não entra sozinho: fica bloqueado até
 * `validado = true` (R-49-5: "é parecido com o DG, habilita"). Mudar esta lista
 * é PR revisada — nunca flag de tela. Para funil perpétuo, estar aqui NÃO
 * dispensa o gate da 41.7 (49.10 AC2).
 */
export const DEBRIEFING_COMBINACOES_LIBERADAS: readonly CombinacaoLiberada[] = [
  // DG & CPDF (projeto 738cda16-c5be-4268-9c98-92e46c359569)
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "09b91c05-ee68-4a00-98b5-fe98c9a4abda", rotulo: "DG & CPDF · dg-pg02 (launch)" },
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "e3112225-37c4-4862-88ee-f95d2c1910dd", rotulo: "DG & CPDF · dg-pg03 (launch)" },
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "c8700552-89ab-456f-a9cd-eaeb4250db16", rotulo: "DG & CPDF · dg-pg04 (launch)" },
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "d36db817-4681-468c-8ea6-58d260d22f11", rotulo: "DG & CPDF · dgpg05-out-26 (launch)" },
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "16d10d04-6666-4569-8e76-1acac68f4ad0", rotulo: "DG & CPDF · dg-a1 (perpetual)" },
  { projectId: "738cda16-c5be-4268-9c98-92e46c359569", funnelId: "bf9ccd5c-000d-449b-917d-750d75463c80", rotulo: "DG & CPDF · dg_claude-negocio_perpétuo (perpetual)" },
  // FZ & MFB (projeto 4d7f55ea-ff1b-4fa8-b3cc-caed182878b3)
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "8b5a73d8-969a-4e0e-8e08-9ed57cbabf39", rotulo: "FZ & MFB · fz-l2-jun-26 (launch)" },
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "65408a4a-62d6-4111-a458-7c11485717ea", rotulo: "FZ & MFB · fz-l3-jul-26 (launch)" },
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "f900c895-a5f8-4239-a4e5-1fdfb8a978ce", rotulo: "FZ & MFB · fz-m1-mai26 (launch)" },
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "8203135e-3439-4f89-9ea6-d5069d77a3f2", rotulo: "FZ & MFB · fz-m2-jul26 (launch)" },
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "66aa4c1f-c8dc-4d87-b402-0a74fc8243d7", rotulo: "FZ & MFB · fz-m3-set-26 (launch)" },
  { projectId: "4d7f55ea-ff1b-4fa8-b3cc-caed182878b3", funnelId: "b67b738a-7480-4939-acd1-e37bb08696a8", rotulo: "FZ & MFB · fz_english-kids-club_perpétuo (perpetual)" },
  // BBE = Netão (projeto e25369be-1d04-4153-8178-14a3b617e70e)
  { projectId: "e25369be-1d04-4153-8178-14a3b617e70e", funnelId: "5492a226-4378-44fa-8775-dec28140117e", rotulo: "BBE · bbe-pr1-mar-26 (launch)" },
  { projectId: "e25369be-1d04-4153-8178-14a3b617e70e", funnelId: "a93b2ecb-e360-4c93-8d4b-0a280b42ac15", rotulo: "BBE · bbe-pr2-out-26 (launch)" },
  { projectId: "e25369be-1d04-4153-8178-14a3b617e70e", funnelId: "edff3655-cb86-43ea-ad51-1836eb461881", rotulo: "BBE · bbe-web-mai-26 (launch)" },
  { projectId: "e25369be-1d04-4153-8178-14a3b617e70e", funnelId: "052437fa-7b4e-4b4a-954a-0b695ce99736", rotulo: "BBE · bbe_churrasco_perpétuo (perpetual)" },
  { projectId: "e25369be-1d04-4153-8178-14a3b617e70e", funnelId: "10caa67c-08cb-485e-a8fd-f715a2cb7dd3", rotulo: "BBE · bbe_hamburguer_perpétuo (perpetual)" },
];

export function isCombinacaoLiberada(
  par: { projectId: string; funnelId: string },
  liberadas: readonly CombinacaoLiberada[] = DEBRIEFING_COMBINACOES_LIBERADAS,
): boolean {
  return liberadas.some((c) => c.projectId === par.projectId && c.funnelId === par.funnelId);
}

// ------------------------------------------------------------------
// Contrato exportado (consumido por 49.3, 49.4, 49.5, 49.6, 49.10)
// ------------------------------------------------------------------

export interface DatasChave {
  inicioCaptacao: string;
  aberturaCarrinho: string;
  fimCarrinho: string;
  reabertura: RespostaEtapaExtra;
  downsell: RespostaEtapaExtra;
}

/**
 * Story 49.12 — datas-chave do lançamento EM ANDAMENTO. O início da captação é
 * sempre informado; as demais podem ser "ainda não aconteceu" (`null` aqui, e a
 * fase listada em `aindaNaoAconteceu`) — depois do gate, `null` nunca é "sem
 * resposta".
 */
export interface DatasChaveEmAndamento {
  inicioCaptacao: string;
  aberturaCarrinho: string | null;
  fimCarrinho: string | null;
  reabertura: RespostaEtapaExtra | null;
  downsell: RespostaEtapaExtra | null;
}

interface DebriefingConfigLancamentoBase {
  tipoDeFunil: "launch";
  stageId: string;
  funnelId: string;
  projectId: string;
  /**
   * A comparação PRINCIPAL = `lancamentosComparacao[0] ?? null` (49.11, R6-5) —
   * mantido para os consumidores da versão anterior do contrato (49.4 cross-
   * launch, título "Comparativo A × B" da 49.6). `null` = edição única. Também
   * `null` quando todas as comparações gravadas foram apagadas/saíram do
   * projeto depois de salvar — `avisos` traz `COMPARACAO_REMOVIDA` (R4-14).
   */
  lancamentoComparacaoFunnelId: string | null;
  /**
   * Story 49.11 — lista EFETIVA (ordem preservada, sem os funis que não são
   * mais do projeto) dos lançamentos de comparação da série histórica. O
   * carregador sempre preenche; opcional só para quem monta o contrato na
   * forma anterior (vale `[lancamentoComparacaoFunnelId]` — `comparacoesDe`).
   */
  lancamentosComparacao?: string[];
  /**
   * Story 49.11 (R6-7) — `{ stageId: funnel_surveys.id }`: a pesquisa de
   * captação que vence o desempate sem data (etapa com 2+ pesquisas). O
   * carregador sempre preenche (`{}` = nenhuma marca).
   */
  pesquisaDeCaptacaoPorEtapa?: Record<string, string>;
  etapas: EtapaDoLancamento[];
  perguntasConfirmadas: PerguntasConfirmadas;
  closerMediums: string[];
  closerPorSellerName: boolean;
  /**
   * `utm_source` de ferramentas de atendimento do expert (ex.: `letalk`,
   * `chatwoot`) — não são pessoa nem canal; o classificador (49.2, R4-12,
   * `ConfigClassificador.ferramentasDeAtendimento`) as lê junto do medium de
   * closer. Normalizados; `[]` = resposta explícita "nenhuma".
   */
  ferramentasDeAtendimento: string[];
  dimensaoDeCriativo: DimensaoDeCriativo;
  imposto: ImpostoResolvido;
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
  /** Avisos que NÃO bloqueiam e que o documento precisa declarar (49.6). */
  avisos: DebriefingAviso[];
  /**
   * Story 49.12 — data de corte da GERAÇÃO (`YYYY-MM-DD`, BRT, inclusive). O
   * gate nunca a preenche (não lê relógio): quem orquestra a acrescenta — no
   * modo em andamento, ontem em Brasília (R8-2); no lançamento de comparação,
   * início + N (o mesmo D+N, R8-3). Ausente = sem corte (o encerrado de sempre).
   */
  corte?: string;
}

/** O lançamento encerrado — as regras de datas da 49.1, sem mudança (49.12 AC1). */
export interface DebriefingConfigLancamentoEncerrado extends DebriefingConfigLancamentoBase {
  /** Ausente = forma anterior à 49.12 (que só conhecia o encerrado). O gate sempre preenche. */
  situacaoDoLancamento?: "encerrado";
  datasChave: DatasChave;
}

/** Story 49.12 — o lançamento em andamento (captação aberta; carrinho aberto é a 49.14). */
export interface DebriefingConfigLancamentoEmAndamento extends DebriefingConfigLancamentoBase {
  situacaoDoLancamento: "em-andamento";
  datasChave: DatasChaveEmAndamento;
  /** As fases respondidas "ainda não aconteceu", na ordem de `FASES_QUE_PODEM_NAO_TER_ACONTECIDO`. */
  aindaNaoAconteceu: FaseQuePodeNaoTerAcontecido[];
}

/** União discriminada por `situacaoDoLancamento` (49.12). */
export type DebriefingConfigLancamento = DebriefingConfigLancamentoEncerrado | DebriefingConfigLancamentoEmAndamento;

export interface DebriefingConfigPerpetuo {
  tipoDeFunil: "perpetual";
  stageId: string;
  funnelId: string;
  projectId: string;
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
}

/** União discriminada por `tipoDeFunil`. Datas em YYYY-MM-DD. */
export type DebriefingConfig = DebriefingConfigLancamento | DebriefingConfigPerpetuo;

// ------------------------------------------------------------------
// Forma crua (persistida) e contexto da etapa
// ------------------------------------------------------------------

export interface ContextoDaEtapa {
  stageId: string;
  stageName: string;
  stageType: string;
  funnelId: string;
  funnelName: string;
  funnelType: string;
  projectId: string;
  projectName: string;
}

/** Os valores que o PUT grava. Nulo = "sem resposta". */
export interface ValoresDaConfig {
  inicioCaptacao: string | null;
  aberturaCarrinho: string | null;
  fimCarrinho: string | null;
  reabertura: RespostaEtapaExtra | null;
  downsell: RespostaEtapaExtra | null;
  /** A comparação principal — sempre `lancamentosComparacao[0] ?? null` quando a lista vem junto. */
  lancamentoComparacaoFunnelId: string | null;
  /**
   * Story 49.11 — lista ORDENADA dos lançamentos de comparação (o 1º é a
   * principal, R6-5). Ausente = valores na forma da 49.1 (só a coluna antiga),
   * que valem como `[lancamentoComparacaoFunnelId]` — ler sempre por
   * `comparacoesDe`. `valoresDaLinha` e o PUT preenchem as duas, coerentes.
   */
  lancamentosComparacao?: string[];
  /** Story 49.11 (R6-7) — `{ stageId: funnel_surveys.id }`. Ausente = `{}`. */
  pesquisaDeCaptacaoPorEtapa?: Record<string, string>;
  etapas: EtapaDoLancamento[];
  perguntasConfirmadas: PerguntasConfirmadasGravadas;
  closerMediums: string[] | null;
  closerPorSellerName: boolean | null;
  /** R4-12 (pedido da 49.2): mesmo comportamento de `closerMediums` — nulo = sem resposta. */
  ferramentasDeAtendimento: string[] | null;
  dimensaoDeCriativo: DimensaoDeCriativo | null;
  /**
   * Story 49.12 (AC1) — ausente = forma anterior à 49.12 = `encerrado`
   * (`situacaoDe`). `valoresDaLinha` e o PUT sempre preenchem.
   */
  situacaoDoLancamento?: SituacaoDoLancamento;
  /** Story 49.12 (AC2) — fases respondidas "ainda não aconteceu". Ausente = `[]`. */
  aindaNaoAconteceu?: FaseQuePodeNaoTerAcontecido[];
}

/** A situação de uns valores: ausente = `encerrado` (decisão de escopo da 49.12). */
export function situacaoDe(v: Pick<ValoresDaConfig, "situacaoDoLancamento">): SituacaoDoLancamento {
  return v.situacaoDoLancamento ?? "encerrado";
}

/** As fases "ainda não aconteceu", sem repetição e na ordem canônica. */
export function aindaNaoAconteceuDe(v: Pick<ValoresDaConfig, "aindaNaoAconteceu">): FaseQuePodeNaoTerAcontecido[] {
  const marcadas = new Set(v.aindaNaoAconteceu ?? []);
  return FASES_QUE_PODEM_NAO_TER_ACONTECIDO.filter((f) => marcadas.has(f));
}

export const VALORES_VAZIOS: Readonly<ValoresDaConfig> = Object.freeze({
  inicioCaptacao: null,
  aberturaCarrinho: null,
  fimCarrinho: null,
  reabertura: null,
  downsell: null,
  lancamentoComparacaoFunnelId: null,
  etapas: [],
  perguntasConfirmadas: {},
  closerMediums: null,
  closerPorSellerName: null,
  ferramentasDeAtendimento: null,
  dimensaoDeCriativo: null,
});

/** Config como está no banco + contexto — pode estar incompleta. Uso da UI e do gate. */
export interface DebriefingConfigRaw extends ContextoDaEtapa, ValoresDaConfig {
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
  imposto: ImpostoResolvido;
  /** Etapas da lista que têm pesquisa cadastrada — cada uma exige `faixa` explícita. */
  etapasComPesquisa: string[];
  /** Etapas da lista que não pertencem mais ao funil (apagadas/movidas depois de salvar). */
  etapasForaDoFunil: string[];
  /**
   * A comparação gravada não é mais um funil do projeto (apagado ou movido
   * depois de salvar). Decisão do dono R4-14: NÃO bloqueia nem derruba
   * `validado` — o contrato sai como edição única (`lancamentoComparacaoFunnelId
   * = null`) com o aviso `COMPARACAO_REMOVIDA`. O id gravado fica como rastro.
   * Story 49.11: `true` quando AO MENOS UM item da lista foi removido.
   */
  comparacaoRemovida: boolean;
  /**
   * Story 49.11 — os ids da lista gravada que não são mais funil do projeto,
   * na ordem da lista (um aviso `COMPARACAO_REMOVIDA` por item). O carregador
   * sempre preenche; ausente = forma da 49.1 (`comparacaoRemovida` fala da
   * principal) — ler por `comparacoesRemovidasDe`.
   */
  comparacoesRemovidas?: string[];
}

// ------------------------------------------------------------------
// Lista de comparação (Story 49.11) — leitura compatível com a 49.1
// ------------------------------------------------------------------

/** Teto do PUT (higiene de payload; a skill compara 3 lançamentos no DG — não é regra de negócio). */
export const MAX_LANCAMENTOS_COMPARACAO = 10;

/**
 * A lista ORDENADA de comparação de uns valores: a lista, quando veio; senão a
 * forma da 49.1 (`[lancamentoComparacaoFunnelId]` ou `[]`). Toda leitura da
 * comparação passa por aqui.
 */
export function comparacoesDe(v: Pick<ValoresDaConfig, "lancamentoComparacaoFunnelId" | "lancamentosComparacao">): string[] {
  if (v.lancamentosComparacao !== undefined) return [...v.lancamentosComparacao];
  return v.lancamentoComparacaoFunnelId ? [v.lancamentoComparacaoFunnelId] : [];
}

/**
 * Lista efetiva de uma LINHA gravada (duas versões da API escrevem na mesma
 * linha durante o deploy/rollback). A coluna antiga manda:
 * - lista não vazia com o 1º item igual à coluna antiga → a lista;
 * - lista vazia (linha de antes da 0162, ou API antiga) → `[antiga]` ou `[]`;
 * - divergência (a API antiga escreveu por último) → `[antiga]` ou `[]`.
 * Assim nenhuma config validada muda de premissa pela migração.
 */
export function listaDeComparacaoDaLinha(lista: readonly string[], antiga: string | null): string[] {
  if (lista.length > 0 && lista[0] === antiga) return [...lista];
  return antiga ? [antiga] : [];
}

/** Os mesmos valores com outra lista, na MESMA forma (a coluna antiga = o 1º item). */
function comComparacoes(v: ValoresDaConfig, lista: string[]): ValoresDaConfig {
  const principal = lista[0] ?? null;
  return v.lancamentosComparacao === undefined
    ? { ...v, lancamentoComparacaoFunnelId: principal }
    : { ...v, lancamentoComparacaoFunnelId: principal, lancamentosComparacao: lista };
}

/** Ids removidos da lista gravada (R4-14 por item). Forma da 49.1: a principal, se `comparacaoRemovida`. */
export function comparacoesRemovidasDe(cfg: DebriefingConfigRaw): string[] {
  if (cfg.comparacoesRemovidas !== undefined) return [...cfg.comparacoesRemovidas];
  const principal = comparacoesDe(cfg)[0];
  return cfg.comparacaoRemovida && principal ? [principal] : [];
}

/**
 * Comparação do corpo do PUT (AC3 c): o campo antigo continua aceito. Só ele →
 * `[id]`; só a lista → a lista; os dois com `antigo ≠ lista[0]` → erro (nunca
 * presumir qual vale); `null`/`[]`/omitido → sem comparação.
 */
export function comparacaoDoCorpo(
  antigo: string | null | undefined,
  lista: readonly string[] | undefined,
): { lista: string[]; peloCampoAntigo: boolean } | { erro: string } {
  if (lista === undefined) return { lista: antigo ? [antigo] : [], peloCampoAntigo: true };
  if (antigo !== undefined && (antigo ?? null) !== (lista[0] ?? null)) {
    return {
      erro:
        `lancamentoComparacaoFunnelId (${antigo ?? "null"}) diverge de lancamentosComparacao[0] (${lista[0] ?? "lista vazia"}) — ` +
        "envie só a lista, ou o campo antigo igual ao 1º item da lista",
    };
  }
  return { lista: [...lista], peloCampoAntigo: false };
}

export type DebriefingConfigRow = typeof debriefingConfigs.$inferSelect;

// ------------------------------------------------------------------
// Erros
// ------------------------------------------------------------------

export type DebriefingErroCodigo =
  | "COMBINACAO_NAO_VALIDADA"
  | "CONFIG_INCOMPLETA"
  | "TIPO_DE_FUNIL_NAO_SUPORTADO";

/** Erro do gate — a rota traduz em 422 com `{ erro, detalhe, acao }`. */
export class DebriefingConfigError extends Error {
  readonly erro: DebriefingErroCodigo;
  readonly detalhe: string;
  readonly acao: string;
  /** Só em CONFIG_INCOMPLETA — também listados no `detalhe`. */
  readonly camposFaltantes: string[];

  constructor(erro: DebriefingErroCodigo, detalhe: string, acao: string, camposFaltantes: string[] = []) {
    super(detalhe);
    this.name = "DebriefingConfigError";
    this.erro = erro;
    this.detalhe = detalhe;
    this.acao = acao;
    this.camposFaltantes = camposFaltantes;
  }

  toResponse(): { erro: DebriefingErroCodigo; detalhe: string; acao: string } {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

// ------------------------------------------------------------------
// Avisos (não bloqueiam)
// ------------------------------------------------------------------

export type DebriefingAvisoCodigo = "COMPARACAO_REMOVIDA";

/** Mesma forma do corpo de erro, mas não bloqueia: o documento declara (49.6). */
export interface DebriefingAviso {
  codigo: DebriefingAvisoCodigo;
  detalhe: string;
  acao: string;
}

/**
 * Avisos da config crua, em ordem estável. Usado pelo contrato (49.6 mostra no
 * documento) e pelo GET (o formulário mostra ao lado do campo).
 */
export function avisosDebriefing(cfg: DebriefingConfigRaw): DebriefingAviso[] {
  const gravadas = comparacoesDe(cfg);
  const removidas = comparacoesRemovidasDe(cfg);
  if (removidas.length === 0) return [];

  // Lista de UM item (o caso da 49.1): o mesmo aviso de antes, palavra por palavra.
  if (gravadas.length <= 1) {
    return removidas.map((id) => ({
      codigo: "COMPARACAO_REMOVIDA" as const,
      detalhe:
        `o funil de comparação (${id}) foi apagado ou não é mais do projeto ${cfg.projectName} — ` +
        `o debriefing será gerado como edição única, sem comparação`,
      acao: "Escolher outra comparação na configuração do debriefing, ou remover a comparação para tirar este aviso",
    }));
  }

  // Lista de 2+: um aviso por item removido, com a posição; quando o removido
  // era a principal, o aviso diz qual passou a ser (R6-5) — ou que não resta nenhuma.
  const fora = new Set(removidas);
  const efetiva = gravadas.filter((id) => !fora.has(id));
  const novaPrincipal = efetiva[0];
  const estado = novaPrincipal
    ? null
    : "não resta nenhum lançamento de comparação: o debriefing será gerado como edição única, sem comparação";
  return gravadas
    .map((id, i) => ({ id, posicao: i + 1 }))
    .filter((x) => fora.has(x.id))
    .map(({ id, posicao }) => {
      const quem =
        posicao === 1
          ? `o funil de comparação principal (${id}, posição 1 da lista)`
          : `o funil de comparação ${id} (posição ${posicao} da lista)`;
      const efeito =
        estado ??
        (posicao === 1
          ? `a comparação principal passa a ser ${novaPrincipal} (posição ${gravadas.indexOf(novaPrincipal!) + 1} da lista)`
          : `ele sai da série histórica; a comparação principal continua ${novaPrincipal}`);
      return {
        codigo: "COMPARACAO_REMOVIDA" as const,
        detalhe: `${quem} foi apagado ou não é mais do projeto ${cfg.projectName} — ${efeito}`,
        acao: "Tirar este lançamento da lista de comparação (ou trocá-lo por outro) na configuração do debriefing para tirar este aviso",
      };
    });
}

const ACAO_COMBINACAO =
  "Conferir os números contra as fixtures do expert e marcar a combinação como validada antes de liberar este botão";
const ACAO_SEM_CONFIG =
  "Salvar a configuração do debriefing desta etapa (datas-chave, etapas, perguntas da pesquisa) e, se a combinação não estiver liberada, conferir os números e marcar como validada";
const ACAO_INCOMPLETA =
  "Preencher os campos faltantes na configuração do debriefing — o gerador não presume nenhuma premissa";

/** Erro de etapa inexistente / que não é de debriefing (o carregador nunca assume default). */
function erroEtapaInvalida(stageId: string, motivo: string): DebriefingConfigError {
  return new DebriefingConfigError(
    "COMBINACAO_NAO_VALIDADA",
    `stage=${stageId} ${motivo} — o gerador de debriefing só roda numa etapa do tipo Debriefing`,
    ACAO_SEM_CONFIG,
  );
}

export function erroTipoDeFunilNaoSuportado(funnelType: string): DebriefingConfigError {
  if (funnelType === "perpetual") {
    return new DebriefingConfigError(
      "TIPO_DE_FUNIL_NAO_SUPORTADO",
      "o gerador de debriefing de funil perpétuo ainda não está disponível — a geração de lançamento não se aplica a funil perpétuo",
      "Aguardar a entrega do debriefing de perpétuo (Story 49.10); para o perpétuo, hoje use o relatório do botão 3 (Resumão perpétuo)",
    );
  }
  return new DebriefingConfigError(
    "TIPO_DE_FUNIL_NAO_SUPORTADO",
    `o gerador de debriefing não se aplica a funil do tipo "${funnelType}" — existe só para funil de lançamento (e de perpétuo, com a Story 49.10)`,
    "Gerar o debriefing a partir da etapa Debriefing de um funil de lançamento",
  );
}

export function erroSemConfig(ctx: ContextoDaEtapa): DebriefingConfigError {
  return new DebriefingConfigError(
    "COMBINACAO_NAO_VALIDADA",
    `expert=${ctx.projectName} lancamento=${ctx.funnelName} — a etapa de debriefing não tem configuração cadastrada; ` +
      `sem config não há como afirmar datas-chave, etapas nem perguntas da pesquisa`,
    ACAO_SEM_CONFIG,
  );
}

// ------------------------------------------------------------------
// Portões (puros)
// ------------------------------------------------------------------

/** Etapa existe e é do tipo Debriefing. */
export function assertEtapaDeDebriefing(
  ctx: ContextoDaEtapa | null,
  stageId: string,
): asserts ctx is ContextoDaEtapa {
  if (!ctx) throw erroEtapaInvalida(stageId, "não existe");
  if (ctx.stageType !== "debriefing") {
    throw erroEtapaInvalida(stageId, `é do tipo "${ctx.stageType}", não "debriefing"`);
  }
}

/**
 * AC11. Enquanto a Story 49.10 não está no ar, só `launch` gera: `perpetual`
 * lança com o corpo exato do AC11 (nunca roda o motor de lançamento sobre
 * perpétuo, R-49-5) e qualquer outro tipo (`mobile`) lança permanentemente.
 * A 49.10 remove o ramo do `perpetual` aqui.
 */
export function assertTipoDeFunilSuportado(ctx: Pick<ContextoDaEtapa, "funnelType">): void {
  if (ctx.funnelType === "launch") return;
  throw erroTipoDeFunilNaoSuportado(ctx.funnelType);
}

/** Tipos para os quais a config existe (o mecanismo aceita perpétuo — AC11). */
export function tipoAceitaConfig(funnelType: string): funnelType is "launch" | "perpetual" {
  return funnelType === "launch" || funnelType === "perpetual";
}

/** Data `YYYY-MM-DD` que existe no calendário (`2026-02-30` não existe). */
export function dataExiste(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

type DatasParciais = Pick<
  ValoresDaConfig,
  "inicioCaptacao" | "aberturaCarrinho" | "fimCarrinho" | "reabertura" | "downsell" | "situacaoDoLancamento" | "aindaNaoAconteceu"
>;

/**
 * AC2 — presença, resposta explícita, data existente e ordem coerente.
 * Usada pelo PUT (400) e pelo gate (CONFIG_INCOMPLETA): uma regra só.
 *
 * Story 49.12: no modo `encerrado` (o de sempre), a regra é a da 49.1 sem
 * nenhuma mudança — e "ainda não aconteceu" é recusado. No modo
 * `em-andamento`, o início continua obrigatório; abertura, fim do carrinho,
 * reabertura e downsell aceitam também "ainda não aconteceu" (a fase em
 * `aindaNaoAconteceu`, sem valor). A ordem vale entre as datas que existirem.
 */
export function problemasDasDatasChave(d: DatasParciais): string[] {
  const p: string[] = [];
  const emAndamento = situacaoDe(d) === "em-andamento";
  const aindaNao = new Set(aindaNaoAconteceuDe(d));
  if (!emAndamento && aindaNao.size > 0) {
    p.push(
      `datasChave.aindaNaoAconteceu (${[...aindaNao].join(", ")}) só vale com o lançamento em andamento — ` +
        `no lançamento encerrado, informe as datas (ou "não houve" na reabertura/downsell)`,
    );
  }
  const obrig = ["inicioCaptacao", "aberturaCarrinho", "fimCarrinho"] as const;
  for (const campo of obrig) {
    const v = d[campo];
    if (emAndamento && campo !== "inicioCaptacao" && aindaNao.has(campo)) {
      if (v) p.push(`datasChave.${campo}: responda a data OU "ainda não aconteceu", não os dois`);
      continue;
    }
    if (!v) {
      p.push(
        emAndamento && campo !== "inicioCaptacao"
          ? `datasChave.${campo} é obrigatória (ou "ainda não aconteceu", com o lançamento em andamento)`
          : `datasChave.${campo} é obrigatória`,
      );
    } else if (!dataExiste(v)) p.push(`datasChave.${campo} (${v}) não é uma data válida`);
  }
  for (const campo of ["reabertura", "downsell"] as const) {
    const r = d[campo];
    if (emAndamento && aindaNao.has(campo)) {
      if (r) p.push(`datasChave.${campo}: responda "houve"/"não houve" OU "ainda não aconteceu", não os dois`);
      continue;
    }
    if (!r) {
      p.push(
        emAndamento
          ? `datasChave.${campo} exige resposta explícita: { houve: false }, { houve: true, abertura, fim } ou "ainda não aconteceu"`
          : `datasChave.${campo} exige resposta explícita: { houve: false } ou { houve: true, abertura, fim }`,
      );
      continue;
    }
    if (r.houve === true) {
      if (!r.abertura) p.push(`datasChave.${campo}.abertura é obrigatória quando houve ${campo}`);
      else if (!dataExiste(r.abertura)) p.push(`datasChave.${campo}.abertura (${r.abertura}) não é uma data válida`);
      if (!r.fim) p.push(`datasChave.${campo}.fim é obrigatória quando houve ${campo}`);
      else if (!dataExiste(r.fim)) p.push(`datasChave.${campo}.fim (${r.fim}) não é uma data válida`);
    }
  }

  // Ordem — só entre datas válidas (as inválidas já foram apontadas acima).
  const ok = (v: string | null | undefined): v is string => !!v && dataExiste(v);
  const ordem = (a: string, va: string | null | undefined, b: string, vb: string | null | undefined) => {
    if (ok(va) && ok(vb) && va > vb) p.push(`${a} (${va}) é posterior a ${b} (${vb})`);
  };
  ordem("datasChave.inicioCaptacao", d.inicioCaptacao, "datasChave.aberturaCarrinho", d.aberturaCarrinho);
  ordem("datasChave.aberturaCarrinho", d.aberturaCarrinho, "datasChave.fimCarrinho", d.fimCarrinho);
  for (const campo of ["reabertura", "downsell"] as const) {
    const r = d[campo];
    if (r?.houve === true) {
      ordem(`datasChave.${campo}.abertura`, r.abertura, `datasChave.${campo}.fim`, r.fim);
    }
  }
  return p;
}

/**
 * AC4 (segunda metade) — papel de etapa extraordinária exige a data
 * correspondente. Story 49.12 (AC2/AC9): no modo em andamento, "ainda não
 * aconteceu" também satisfaz o papel (a etapa existe e ainda não começou); no
 * encerrado, a regra é a de sempre.
 */
export function problemasPapelXDatas(
  etapas: readonly EtapaDoLancamento[],
  d: Pick<ValoresDaConfig, "reabertura" | "downsell" | "situacaoDoLancamento" | "aindaNaoAconteceu">,
): string[] {
  const p: string[] = [];
  const aindaNao = situacaoDe(d) === "em-andamento" ? new Set(aindaNaoAconteceuDe(d)) : new Set<string>();
  const ok = (campo: "reabertura" | "downsell") => d[campo]?.houve === true || aindaNao.has(campo);
  const sufixo = aindaNao.size > 0 || situacaoDe(d) === "em-andamento" ? ' (ou "ainda não aconteceu")' : "";
  for (const e of etapas) {
    if (e.papel === "reabertura" && !ok("reabertura")) {
      p.push(`etapas[${e.stageId}].papel=reabertura exige datasChave.reabertura.houve = true${sufixo}`);
    }
    if ((e.papel === "leads-downsell" || e.papel === "vendas-downsell") && !ok("downsell")) {
      p.push(`etapas[${e.stageId}].papel=${e.papel} exige datasChave.downsell.houve = true${sufixo}`);
    }
  }
  return p;
}

/**
 * O que falta para a config de lançamento poder gerar (AC2/AC4/AC5/AC10).
 * Funil perpétuo: nada é exigido (AC11) — a linha só ancora a etapa e `validado`.
 */
export function camposFaltantesDebriefing(cfg: DebriefingConfigRaw): string[] {
  if (cfg.funnelType !== "launch") return [];
  const f: string[] = [...problemasDasDatasChave(cfg)];

  if (cfg.etapas.length === 0) f.push("etapas (ao menos 1 etapa compõe o lançamento)");
  for (const e of cfg.etapas) {
    if (!(DEBRIEFING_PAPEIS as readonly string[]).includes(e.papel)) {
      f.push(`etapas[${e.stageId}].papel ("${e.papel}") fora de DEBRIEFING_PAPEIS`);
    }
  }
  for (const id of cfg.etapasForaDoFunil) f.push(`etapas[${id}] não pertence mais ao funil`);
  // Comparação apagada NÃO entra aqui (R4-14): vira aviso, não bloqueio.
  f.push(...problemasPapelXDatas(cfg.etapas, cfg));

  for (const stageId of cfg.etapasComPesquisa) {
    const conf = cfg.perguntasConfirmadas[stageId];
    if (!conf || !Object.prototype.hasOwnProperty.call(conf, "faixa") || conf.faixa === undefined) {
      f.push(`perguntasConfirmadas[${stageId}].faixa (chave da pergunta ou null = "sem faixa A→D")`);
    }
  }

  if (cfg.closerMediums === null) f.push("closerMediums (lista vazia é resposta válida)");
  if (cfg.closerPorSellerName === null) f.push("closerPorSellerName");
  if (cfg.ferramentasDeAtendimento === null) f.push("ferramentasDeAtendimento (lista vazia é resposta válida)");
  if (cfg.dimensaoDeCriativo === null) {
    f.push("dimensaoDeCriativo");
  } else if (!(DIMENSOES_DE_CRIATIVO as readonly string[]).includes(cfg.dimensaoDeCriativo)) {
    f.push(`dimensaoDeCriativo ("${cfg.dimensaoDeCriativo}") fora de ${DIMENSOES_DE_CRIATIVO.join(" | ")}`);
  }
  return f;
}

/**
 * Gate de combinação (AC6). Passa quando a combinação (projeto + funil) está na
 * lista liberada OU o time marcou `validado = true`; depois disso, exige a
 * config completa (CONFIG_INCOMPLETA). Qualquer outro caso lança.
 *
 * `liberadas` só existe para o teste provar que a lista vazia bloqueia tudo; o
 * carregador e a rota usam sempre a constante (`aplicarGateDebriefing` não
 * repassa o parâmetro).
 */
export function assertDebriefingScope(
  cfg: DebriefingConfigRaw,
  liberadas: readonly CombinacaoLiberada[] = DEBRIEFING_COMBINACOES_LIBERADAS,
): void {
  if (!cfg.validado && !isCombinacaoLiberada(cfg, liberadas)) {
    throw new DebriefingConfigError(
      "COMBINACAO_NAO_VALIDADA",
      `expert=${cfg.projectName} lancamento=${cfg.funnelName} — o gerador de debriefing ainda não foi conferido para esta combinação`,
      ACAO_COMBINACAO,
    );
  }
  const faltantes = camposFaltantesDebriefing(cfg);
  if (faltantes.length > 0) {
    throw new DebriefingConfigError(
      "CONFIG_INCOMPLETA",
      `expert=${cfg.projectName} lancamento=${cfg.funnelName} — config do debriefing incompleta: ${faltantes.join("; ")}`,
      ACAO_INCOMPLETA,
      faltantes,
    );
  }
}

/**
 * A sequência INTEIRA do gate sobre dados já lidos (tipo → existência →
 * combinação → completude). O carregador e a rota de leitura da UI usam esta
 * mesma função — não há segunda implementação da ordem.
 */
export function aplicarGateDebriefing(
  ctx: ContextoDaEtapa,
  raw: DebriefingConfigRaw | null,
): DebriefingConfig {
  assertTipoDeFunilSuportado(ctx);
  if (!raw) throw erroSemConfig(ctx);
  assertDebriefingScope(raw);
  return montarDebriefingConfig(raw);
}

/** Estado do gate para a UI: `null` = liberado. */
export function avaliarBloqueioDebriefing(
  ctx: ContextoDaEtapa,
  raw: DebriefingConfigRaw | null,
): { erro: DebriefingErroCodigo; detalhe: string; acao: string } | null {
  try {
    aplicarGateDebriefing(ctx, raw);
    return null;
  } catch (err) {
    if (err instanceof DebriefingConfigError) return err.toResponse();
    throw err;
  }
}

/** Raw já aprovado pelo gate → contrato `DebriefingConfig`. Não exportado: só o gate o chama. */
function montarDebriefingConfig(cfg: DebriefingConfigRaw): DebriefingConfig {
  const base = {
    stageId: cfg.stageId,
    funnelId: cfg.funnelId,
    projectId: cfg.projectId,
    validado: cfg.validado,
    validadoEm: cfg.validadoEm,
    validadoPor: cfg.validadoPor,
  };
  if (cfg.funnelType === "perpetual") return { tipoDeFunil: "perpetual", ...base };
  // Comparação removida → sai da lista efetiva (R4-14 por item); a próxima
  // válida vira a principal (R6-5); lista vazia → edição única. Aviso em `avisos`.
  const removidas = new Set(comparacoesRemovidasDe(cfg));
  const efetiva = comparacoesDe(cfg).filter((id) => !removidas.has(id));
  // Story 49.12 — a situação discrimina as datas: no em andamento, `null` é
  // "ainda não aconteceu" (o gate já exigiu a resposta explícita de cada fase).
  const situacao =
    situacaoDe(cfg) === "em-andamento"
      ? {
          situacaoDoLancamento: "em-andamento" as const,
          datasChave: {
            inicioCaptacao: cfg.inicioCaptacao as string,
            aberturaCarrinho: cfg.aberturaCarrinho,
            fimCarrinho: cfg.fimCarrinho,
            reabertura: cfg.reabertura,
            downsell: cfg.downsell,
          },
          aindaNaoAconteceu: aindaNaoAconteceuDe(cfg),
        }
      : {
          situacaoDoLancamento: "encerrado" as const,
          datasChave: {
            inicioCaptacao: cfg.inicioCaptacao as string,
            aberturaCarrinho: cfg.aberturaCarrinho as string,
            fimCarrinho: cfg.fimCarrinho as string,
            reabertura: cfg.reabertura as RespostaEtapaExtra,
            downsell: cfg.downsell as RespostaEtapaExtra,
          },
        };
  // Depois de `assertDebriefingScope`, todo campo abaixo está preenchido.
  return {
    tipoDeFunil: "launch",
    ...base,
    ...situacao,
    lancamentoComparacaoFunnelId: efetiva[0] ?? null,
    lancamentosComparacao: efetiva,
    pesquisaDeCaptacaoPorEtapa: { ...(cfg.pesquisaDeCaptacaoPorEtapa ?? {}) },
    etapas: cfg.etapas.map((e) => ({ stageId: e.stageId, papel: e.papel })),
    // Só etapas com pesquisa (AC5), e todas com `faixa` explícita (exigida acima).
    perguntasConfirmadas: Object.fromEntries(
      cfg.etapasComPesquisa.map((id) => {
        const conf = cfg.perguntasConfirmadas[id] ?? {};
        return [id, { ...conf, faixa: conf.faixa ?? null }];
      }),
    ) as PerguntasConfirmadas,
    closerMediums: [...(cfg.closerMediums as string[])],
    closerPorSellerName: cfg.closerPorSellerName as boolean,
    ferramentasDeAtendimento: [...(cfg.ferramentasDeAtendimento as string[])],
    dimensaoDeCriativo: cfg.dimensaoDeCriativo as DimensaoDeCriativo,
    imposto: cfg.imposto,
    avisos: avisosDebriefing(cfg),
  };
}

// ------------------------------------------------------------------
// Premissa mudou → `validado` volta a false
// ------------------------------------------------------------------

/** JSON com chaves ordenadas — a ordem das chaves não é premissa. */
function jsonEstavel(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Forma canônica das premissas: a ordem das listas (etapas, mediums) também não é premissa. */
function chaveDasPremissas(v: ValoresDaConfig): string {
  return jsonEstavel({
    inicioCaptacao: v.inicioCaptacao,
    aberturaCarrinho: v.aberturaCarrinho,
    fimCarrinho: v.fimCarrinho,
    reabertura: v.reabertura,
    downsell: v.downsell,
    // 49.11: a lista ORDENADA é premissa — adicionar, remover ou reordenar
    // (trocar a principal) derruba `validado`. Forma da 49.1 = `[antiga]`.
    lancamentosComparacao: comparacoesDe(v),
    // 49.11 (R6-7): trocar a pesquisa marcada muda o desempate.
    pesquisaDeCaptacaoPorEtapa: v.pesquisaDeCaptacaoPorEtapa ?? {},
    etapas: [...v.etapas]
      .map((e) => ({ stageId: e.stageId, papel: e.papel }))
      .sort((a, b) => a.stageId.localeCompare(b.stageId)),
    perguntasConfirmadas: v.perguntasConfirmadas,
    closerMediums: v.closerMediums === null ? null : [...v.closerMediums].sort(),
    closerPorSellerName: v.closerPorSellerName,
    ferramentasDeAtendimento: v.ferramentasDeAtendimento === null ? null : [...v.ferramentasDeAtendimento].sort(),
    dimensaoDeCriativo: v.dimensaoDeCriativo,
    // 49.12: a situação e as fases "ainda não aconteceu" são premissa (R9-2:
    // mudar zera `validado`, como qualquer premissa). Forma anterior = encerrado, [].
    situacaoDoLancamento: situacaoDe(v),
    aindaNaoAconteceu: aindaNaoAconteceuDe(v),
  });
}

/**
 * Toda coluna desta config é premissa (datas-chave, comparação, etapas,
 * perguntas, closer, ferramentas de atendimento, criativo): mudou qualquer uma
 * → a conferência anterior não vale mais (mesma lógica da 41.1).
 */
export function premissaMudou(antes: ValoresDaConfig, depois: ValoresDaConfig): boolean {
  return chaveDasPremissas(antes) !== chaveDasPremissas(depois);
}

/**
 * `trim` + minúsculas, sem repetição (49.1 AC10). Item vazio é rejeitado antes.
 * Vale para qualquer lista de valores de UTM da config: `closerMediums` e
 * `ferramentasDeAtendimento` (R4-12).
 */
export function normalizarCloserMediums(lista: readonly string[]): string[] {
  return [...new Set(lista.map((m) => m.trim().toLowerCase()))];
}

/**
 * Premissa EFETIVA de valores gravados: comparação que não é mais funil do
 * projeto já vale como "sem comparação" (R4-14 — o gerador já não a usa).
 * Assim, limpar a comparação órfã no PUT não derruba `validado`; trocar por
 * OUTRO funil continua derrubando. Story 49.11: POR ITEM da lista — os órfãos
 * saem e a ordem dos demais fica (o próximo válido é a principal, R6-5).
 * Nada a filtrar → devolve a MESMA referência.
 */
export function premissaEfetiva(v: ValoresDaConfig, funisDoProjeto: readonly string[]): ValoresDaConfig {
  const lista = comparacoesDe(v);
  const efetiva = lista.filter((id) => funisDoProjeto.includes(id));
  if (efetiva.length === lista.length) return v;
  return comComparacoes(v, efetiva);
}

/** `{ stageId: surveyId }` gravado: só pares de string (jsonb solto vira `{}`). */
function mapaDePesquisaDeCaptacao(bruto: unknown): Record<string, string> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return Object.fromEntries(
    Object.entries(bruto as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

export function valoresDaLinha(row: DebriefingConfigRow): ValoresDaConfig {
  const antiga = row.lancamentoComparacaoFunnelId ?? null;
  const gravada = Array.isArray(row.lancamentosComparacao)
    ? row.lancamentosComparacao.filter((id): id is string => typeof id === "string")
    : [];
  const lista = listaDeComparacaoDaLinha(gravada, antiga);
  return {
    inicioCaptacao: row.inicioCaptacao ?? null,
    aberturaCarrinho: row.aberturaCarrinho ?? null,
    fimCarrinho: row.fimCarrinho ?? null,
    reabertura: row.reabertura ?? null,
    downsell: row.downsell ?? null,
    lancamentoComparacaoFunnelId: lista[0] ?? null,
    lancamentosComparacao: lista,
    pesquisaDeCaptacaoPorEtapa: mapaDePesquisaDeCaptacao(row.pesquisaDeCaptacaoPorEtapa),
    etapas: Array.isArray(row.etapas) ? row.etapas : [],
    perguntasConfirmadas:
      row.perguntasConfirmadas && typeof row.perguntasConfirmadas === "object" ? row.perguntasConfirmadas : {},
    closerMediums: Array.isArray(row.closerMediums) ? row.closerMediums : null,
    closerPorSellerName: row.closerPorSellerName ?? null,
    ferramentasDeAtendimento: Array.isArray(row.ferramentasDeAtendimento) ? row.ferramentasDeAtendimento : null,
    dimensaoDeCriativo: row.dimensaoDeCriativo ?? null,
    // 49.12 (0168): linha anterior à migration = DEFAULT 'encerrado' / '[]'.
    situacaoDoLancamento: row.situacaoDoLancamento === "em-andamento" ? "em-andamento" : "encerrado",
    aindaNaoAconteceu: Array.isArray(row.aindaNaoAconteceu)
      ? aindaNaoAconteceuDe({
          aindaNaoAconteceu: row.aindaNaoAconteceu.filter((f): f is FaseQuePodeNaoTerAcontecido =>
            (FASES_QUE_PODEM_NAO_TER_ACONTECIDO as readonly string[]).includes(f as string),
          ),
        })
      : [],
  };
}

// ------------------------------------------------------------------
// Acesso a dados (I/O) — interface para a rota e o carregador
// ------------------------------------------------------------------

export interface PerguntaDaPesquisa {
  key: string;
  label: string;
}

/**
 * Tudo o que a config e o gate leem/gravam. A implementação real é
 * `criarDebriefingConfigStore(db)`; os testes de rota injetam uma em memória.
 */
export interface DebriefingConfigStore {
  contextoDaEtapa(stageId: string): Promise<ContextoDaEtapa | null>;
  linhaDaConfig(stageId: string): Promise<DebriefingConfigRow | null>;
  etapasDoFunil(funnelId: string): Promise<{ id: string; name: string; stageType: string }[]>;
  funisDoProjeto(projectId: string): Promise<string[]>;
  /** Subconjunto de `stageIds` com pesquisa cadastrada (`funnel_surveys`) — sem abrir planilha. */
  etapasComPesquisa(stageIds: string[]): Promise<string[]>;
  impostoDoProjeto(projectId: string): Promise<string | null>;
  /** Perguntas reais (mesma fonte do Resumão). `null` = sem pesquisa; LANÇA se a planilha falhar. */
  perguntasDaEtapa(stageId: string): Promise<PerguntaDaPesquisa[] | null>;
  /** Story 49.11 (R6-7) — as pesquisas (`funnel_surveys.id`) de cada etapa, sem abrir planilha. */
  pesquisasDasEtapas(stageIds: string[]): Promise<{ id: string; stageId: string }[]>;
  /**
   * Story 49.6 — as mesmas pesquisas, com o nome da aba, para o seletor
   * "pesquisa de captação" do formulário (49.11 AC7). Opcional: store sem ele
   * (fixtures da 49.1) faz o GET omitir `pesquisasPorEtapa`.
   */
  pesquisasComRotulo?(stageIds: string[]): Promise<{ id: string; stageId: string; rotulo: string }[]>;
  /**
   * Story 49.12 (AC11) — a parcial gerada desta etapa (no máximo uma, AC10),
   * para o botão avisar que a próxima geração a substitui. Opcional: store sem
   * ele (fixtures) faz o GET omitir `parcialAtual`.
   */
  parcialDaEtapa?(stageId: string): Promise<ParcialDaEtapa | null>;
  /**
   * Upsert por etapa (`ON CONFLICT (stage_id)`): dois "salvar" simultâneos na
   * primeira gravação não dão 500 (49.1 QA REL-001). `resetarValidado` só pesa
   * quando a linha já existe; a rota manda `true` quando não viu linha nenhuma,
   * porque, se outra requisição a criou no meio, não há premissa para comparar.
   */
  gravar(stageId: string, valores: ValoresDaConfig, opcoes: { resetarValidado: boolean }): Promise<void>;
  /** Devolve o `validado_em` gravado, ou `null` se não existe config. */
  marcarValidado(stageId: string, userId: string): Promise<Date | null>;
  nomeDoUsuario(userId: string): Promise<string | null>;
}

/** Story 49.12 — a parcial salva de uma etapa (`debriefing_payloads.parcial`). */
export interface ParcialDaEtapa {
  debriefingId: string;
  /** ISO 8601 — quando a parcial foi gerada (a última substituição). */
  geradaEm: string;
  corte: string | null;
  dMaisN: number | null;
}

export function criarDebriefingConfigStore(db: Database): DebriefingConfigStore {
  return {
    async parcialDaEtapa(stageId) {
      const [row] = await db
        .select({
          debriefingId: debriefingPayloads.debriefingId,
          createdAt: debriefingPayloads.createdAt,
          corte: sql<string | null>`${debriefingPayloads.payload} -> 'situacao' ->> 'corte'`,
          dMaisN: sql<string | null>`${debriefingPayloads.payload} -> 'situacao' ->> 'dMaisN'`,
        })
        .from(debriefingPayloads)
        .where(and(eq(debriefingPayloads.stageIdOrigem, stageId), eq(debriefingPayloads.parcial, true)))
        .limit(1);
      if (!row) return null;
      const n = row.dMaisN === null ? null : Number(row.dMaisN);
      return {
        debriefingId: row.debriefingId,
        geradaEm: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(String(row.createdAt)).toISOString(),
        corte: row.corte,
        dMaisN: n !== null && Number.isFinite(n) ? n : null,
      };
    },
    async contextoDaEtapa(stageId) {
      const [row] = await db
        .select({
          stageId: funnelStages.id,
          stageName: funnelStages.name,
          stageType: funnelStages.stageType,
          funnelId: funnels.id,
          funnelName: funnels.name,
          funnelType: funnels.type,
          projectId: projects.id,
          projectName: projects.name,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .innerJoin(projects, eq(projects.id, funnels.projectId))
        .where(eq(funnelStages.id, stageId))
        .limit(1);
      return row ?? null;
    },
    async linhaDaConfig(stageId) {
      const [row] = await db
        .select()
        .from(debriefingConfigs)
        .where(eq(debriefingConfigs.stageId, stageId))
        .limit(1);
      return row ?? null;
    },
    async etapasDoFunil(funnelId) {
      return db
        .select({ id: funnelStages.id, name: funnelStages.name, stageType: funnelStages.stageType })
        .from(funnelStages)
        .where(eq(funnelStages.funnelId, funnelId))
        .orderBy(funnelStages.sortOrder);
    },
    async funisDoProjeto(projectId) {
      const rows = await db.select({ id: funnels.id }).from(funnels).where(eq(funnels.projectId, projectId));
      return rows.map((r) => r.id);
    },
    async etapasComPesquisa(stageIds) {
      if (stageIds.length === 0) return [];
      const rows = await db
        .selectDistinct({ stageId: funnelSurveys.stageId })
        .from(funnelSurveys)
        .where(inArray(funnelSurveys.stageId, stageIds));
      const com = new Set(rows.map((r) => r.stageId).filter((id): id is string => !!id));
      return stageIds.filter((id) => com.has(id));
    },
    async impostoDoProjeto(projectId) {
      const [row] = await db
        .select({ impostoPct: expertReportConfigs.impostoPct })
        .from(expertReportConfigs)
        .where(eq(expertReportConfigs.projectId, projectId))
        .limit(1);
      return row?.impostoPct ?? null;
    },
    async perguntasDaEtapa(stageId) {
      const payload = await computeSurveyForStage(db, stageId);
      if (!payload) return null;
      return payload.questions.map((q) => ({ key: q.key, label: q.label }));
    },
    async pesquisasDasEtapas(stageIds) {
      if (stageIds.length === 0) return [];
      const rows = await db
        .select({ id: funnelSurveys.id, stageId: funnelSurveys.stageId })
        .from(funnelSurveys)
        .where(inArray(funnelSurveys.stageId, stageIds));
      return rows
        .filter((r): r is { id: string; stageId: string } => !!r.stageId)
        .sort((a, b) => a.stageId.localeCompare(b.stageId) || a.id.localeCompare(b.id));
    },
    async pesquisasComRotulo(stageIds) {
      if (stageIds.length === 0) return [];
      const rows = await db
        .select({ id: funnelSurveys.id, stageId: funnelSurveys.stageId, rotulo: funnelSurveys.sheetName })
        .from(funnelSurveys)
        .where(inArray(funnelSurveys.stageId, stageIds));
      return rows
        .filter((r): r is { id: string; stageId: string; rotulo: string } => !!r.stageId)
        .sort((a, b) => a.stageId.localeCompare(b.stageId) || a.rotulo.localeCompare(b.rotulo) || a.id.localeCompare(b.id));
    },
    async gravar(stageId, valores, { resetarValidado }) {
      // 49.11: as DUAS colunas sempre coerentes (a antiga = o 1º item da lista),
      // venham os valores na forma da 49.1 ou na nova — a API antiga lê a antiga.
      const lista = comparacoesDe(valores);
      const linha = {
        ...valores,
        lancamentoComparacaoFunnelId: lista[0] ?? null,
        lancamentosComparacao: lista,
        pesquisaDeCaptacaoPorEtapa: valores.pesquisaDeCaptacaoPorEtapa ?? {},
        // 49.12: valores na forma anterior (sem os campos) = encerrado, [].
        situacaoDoLancamento: situacaoDe(valores),
        aindaNaoAconteceu: aindaNaoAconteceuDe(valores),
      };
      await db
        .insert(debriefingConfigs)
        .values({ stageId, ...linha })
        .onConflictDoUpdate({
          target: debriefingConfigs.stageId,
          set: {
            ...linha,
            updatedAt: new Date(),
            ...(resetarValidado ? { validado: false, validadoEm: null, validadoPor: null } : {}),
          },
        });
    },
    async marcarValidado(stageId, userId) {
      const agora = new Date();
      const [row] = await db
        .update(debriefingConfigs)
        .set({ validado: true, validadoEm: agora, validadoPor: userId, updatedAt: agora })
        .where(eq(debriefingConfigs.stageId, stageId))
        .returning({ validadoEm: debriefingConfigs.validadoEm });
      return row?.validadoEm ?? null;
    },
    async nomeDoUsuario(userId) {
      const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      return u?.name ?? null;
    },
  };
}

// ------------------------------------------------------------------
// Carregadores
// ------------------------------------------------------------------

/**
 * Monta a forma crua a partir do que está gravado. `null` = etapa sem config.
 * NÃO exportado: a forma crua só sai por `loadDebriefingConfigRaw` (UI) ou
 * passa pelo gate em `loadDebriefingConfig`.
 */
async function montarConfigBruta(
  store: DebriefingConfigStore,
  ctx: ContextoDaEtapa,
): Promise<DebriefingConfigRaw | null> {
  const row = await store.linhaDaConfig(ctx.stageId);
  if (!row) return null;
  const valores = valoresDaLinha(row);

  let etapasForaDoFunil: string[] = [];
  let etapasComPesquisa: string[] = [];
  if (ctx.funnelType === "launch" && valores.etapas.length > 0) {
    const doFunil = new Set((await store.etapasDoFunil(ctx.funnelId)).map((s) => s.id));
    const ids = valores.etapas.map((e) => e.stageId);
    etapasForaDoFunil = ids.filter((id) => !doFunil.has(id));
    etapasComPesquisa = await store.etapasComPesquisa(ids.filter((id) => doFunil.has(id)));
  }

  // A comparação não tem FK (um SET NULL apagaria a premissa sem deixar
  // rastro): confere aqui se cada funil da lista ainda é do projeto. O que não
  // for sai da lista efetiva com um aviso por item (R4-14) — não bloqueia; a
  // lista inteira removida = edição única.
  const gravadas = comparacoesDe(valores);
  let comparacoesRemovidas: string[] = [];
  if (ctx.funnelType === "launch" && gravadas.length > 0) {
    const doProjeto = new Set(await store.funisDoProjeto(ctx.projectId));
    comparacoesRemovidas = gravadas.filter((id) => !doProjeto.has(id));
  }

  // A config do debriefing não tem override de imposto próprio: cai no do
  // projeto → META_TAX_RATE, com procedência (nunca ×1,13 — decisão ✅2).
  const imposto = resolveImpostoPct(null, await store.impostoDoProjeto(ctx.projectId));

  return {
    ...ctx,
    ...valores,
    validado: row.validado,
    validadoEm: row.validadoEm ?? null,
    validadoPor: row.validadoPor ?? null,
    imposto,
    etapasComPesquisa,
    etapasForaDoFunil,
    comparacaoRemovida: comparacoesRemovidas.length > 0,
    comparacoesRemovidas,
  };
}

/**
 * Config CRUA (sem gate) — a ÚNICA porta crua. USO EXCLUSIVO da rota de
 * leitura da UI (`routes/debriefing-config.ts`), que precisa renderizar o
 * estado bloqueado. Gerador nenhum chama isto — use `loadDebriefingConfig`.
 * O teste de superfície (R1) falha se outro arquivo de `src/` importar esta
 * função. `null` = a etapa não existe.
 */
export async function loadDebriefingConfigRaw(
  db: Database,
  stageId: string,
  store: DebriefingConfigStore = criarDebriefingConfigStore(db),
): Promise<{ contexto: ContextoDaEtapa; config: DebriefingConfigRaw | null } | null> {
  const contexto = await store.contextoDaEtapa(stageId);
  if (!contexto) return null;
  return { contexto, config: await montarConfigBruta(store, contexto) };
}

/**
 * A ÚNICA porta dos geradores (49.3+): devolve config liberada pelo gate ou
 * lança `DebriefingConfigError` (TIPO_DE_FUNIL_NAO_SUPORTADO /
 * COMBINACAO_NAO_VALIDADA / CONFIG_INCOMPLETA). O tipo do funil é checado ANTES
 * de ler a config: funil não suportado não toca loader nenhum.
 */
export async function loadDebriefingConfig(
  db: Database,
  stageId: string,
  store: DebriefingConfigStore = criarDebriefingConfigStore(db),
): Promise<DebriefingConfig> {
  const ctx = await store.contextoDaEtapa(stageId);
  assertEtapaDeDebriefing(ctx, stageId);
  assertTipoDeFunilSuportado(ctx);
  const raw = await montarConfigBruta(store, ctx);
  return aplicarGateDebriefing(ctx, raw);
}

// ------------------------------------------------------------------
// Validação do PUT (pura) — AC2/AC3/AC4/AC5/AC10
// ------------------------------------------------------------------

export interface ContextoDeValidacao {
  stageId: string;
  funnelId: string;
  /** Ids das etapas do funil da etapa de debriefing. */
  etapasDoFunil: readonly string[];
  /** Ids dos funis do projeto. */
  funisDoProjeto: readonly string[];
  /**
   * Story 49.11 — a comparação veio pelo campo antigo (`lancamentoComparacaoFunnelId`):
   * os problemas citam o campo antigo, como na 49.1. Ausente = deduzido da forma
   * dos valores (sem `lancamentosComparacao` = forma da 49.1).
   */
  comparacaoPeloCampoAntigo?: boolean;
}

/**
 * Regras cruzadas do PUT que não dependem da planilha: ordem das datas,
 * comparação no mesmo projeto, etapas do mesmo funil, papel × datas e
 * `perguntasConfirmadas` só para etapas da lista. Devolve a lista de problemas
 * (vazia = ok); cada item nomeia o campo/par/item ofensor.
 */
export function problemasDoCorpoLancamento(v: ValoresDaConfig, ctx: ContextoDeValidacao): string[] {
  const p: string[] = [...problemasDasDatasChave(v)];

  // AC3 (49.1) e 49.11 AC3 — as mesmas regras, POR ITEM da lista: mesmo
  // projeto, ≠ o próprio funil, sem repetição, no máximo 10.
  const lista = comparacoesDe(v);
  const peloCampoAntigo = ctx.comparacaoPeloCampoAntigo ?? v.lancamentosComparacao === undefined;
  if (peloCampoAntigo && lista.length <= 1) {
    const id = lista[0];
    if (id === ctx.funnelId) {
      p.push("lancamentoComparacaoFunnelId não pode ser o próprio funil da etapa");
    } else if (id !== undefined && !ctx.funisDoProjeto.includes(id)) {
      p.push(`lancamentoComparacaoFunnelId (${id}) não é um funil do mesmo projeto`);
    }
  } else {
    if (lista.length > MAX_LANCAMENTOS_COMPARACAO) {
      p.push(`lancamentosComparacao tem ${lista.length} itens — no máximo ${MAX_LANCAMENTOS_COMPARACAO}`);
    }
    lista.forEach((id, i) => {
      const item = `lancamentosComparacao[${i}] (${id})`;
      const primeira = lista.indexOf(id);
      if (primeira !== i) p.push(`${item} repetido — igual a lancamentosComparacao[${primeira}]`);
      else if (id === ctx.funnelId) p.push(`${item} é o próprio funil da etapa`);
      else if (!ctx.funisDoProjeto.includes(id)) p.push(`${item} não é um funil do mesmo projeto`);
    });
  }

  // AC4
  if (v.etapas.length === 0) p.push("etapas precisa ter ao menos 1 item");
  const vistos = new Set<string>();
  for (const e of v.etapas) {
    if (e.stageId === ctx.stageId) p.push(`etapas[${e.stageId}] é a própria etapa de debriefing`);
    else if (!ctx.etapasDoFunil.includes(e.stageId)) p.push(`etapas[${e.stageId}] não pertence ao funil da etapa`);
    if (vistos.has(e.stageId)) p.push(`etapas[${e.stageId}] repetida`);
    vistos.add(e.stageId);
  }
  p.push(...problemasPapelXDatas(v.etapas, v));

  // AC5 — só etapas da lista entram em perguntasConfirmadas
  for (const stageId of Object.keys(v.perguntasConfirmadas)) {
    if (!vistos.has(stageId)) p.push(`perguntasConfirmadas[${stageId}] não é uma das etapas do lançamento`);
  }
  return p;
}

/**
 * AC5 — cada chave confirmada precisa existir nas perguntas REAIS da etapa, e
 * etapa sem pesquisa não entra em `perguntasConfirmadas`.
 */
export function problemasDasPerguntas(
  perguntas: PerguntasConfirmadasGravadas,
  disponiveis: ReadonlyMap<string, readonly PerguntaDaPesquisa[] | null>,
): string[] {
  const p: string[] = [];
  for (const [stageId, conf] of Object.entries(perguntas)) {
    const reais = disponiveis.get(stageId);
    if (reais === null || reais === undefined) {
      p.push(`perguntasConfirmadas[${stageId}]: a etapa não tem pesquisa — etapa sem pesquisa não entra`);
      continue;
    }
    const chaves = new Set(reais.map((q) => q.key));
    for (const campo of SURVEY_CANONICAL_FIELDS) {
      const chave = (conf as Record<string, string | null | undefined>)[campo];
      if (typeof chave === "string" && !chaves.has(chave)) {
        p.push(`perguntasConfirmadas[${stageId}].${campo} = "${chave}" não existe nas perguntas da pesquisa`);
      }
    }
  }
  return p;
}

/** Ids das etapas cujas perguntas confirmadas apontam alguma chave (precisam da planilha). */
export function etapasComChaveConfirmada(perguntas: PerguntasConfirmadasGravadas): string[] {
  return Object.entries(perguntas)
    .filter(([, conf]) => Object.values(conf).some((v) => typeof v === "string"))
    .map(([id]) => id);
}

/**
 * Story 49.11 (R6-7) — `pesquisaDeCaptacaoPorEtapa` do PUT: cada chave é uma
 * etapa do lançamento (`etapas` da config) COM pesquisa, e cada valor é um
 * `funnel_surveys.id` DAQUELA etapa. Cada problema nomeia a etapa.
 */
export function problemasDaPesquisaDeCaptacao(
  mapa: Readonly<Record<string, string>>,
  etapasDoLancamento: readonly string[],
  pesquisasDasEtapas: readonly { id: string; stageId: string }[],
): string[] {
  const p: string[] = [];
  for (const [stageId, pesquisaId] of Object.entries(mapa)) {
    const campo = `pesquisaDeCaptacaoPorEtapa[${stageId}]`;
    if (!etapasDoLancamento.includes(stageId)) {
      p.push(`${campo} não é uma das etapas do lançamento`);
      continue;
    }
    const daEtapa = pesquisasDasEtapas.filter((s) => s.stageId === stageId).map((s) => s.id);
    if (daEtapa.length === 0) p.push(`${campo}: a etapa não tem pesquisa`);
    else if (!daEtapa.includes(pesquisaId)) p.push(`${campo} = ${pesquisaId} não é uma pesquisa desta etapa`);
  }
  return p;
}
