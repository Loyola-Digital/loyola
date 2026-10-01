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
 * liberada ou lança. `loadDebriefingConfigRaw` existe só para a rota de leitura
 * da UI, que precisa exibir justamente o estado bloqueado.
 *
 * Ordem dos portões (49.1 AC11 + AC6; 49.6 AC1 passo 3):
 *   1. tipo do funil — `perpetual` (até a 49.10) e qualquer tipo fora de
 *      `launch`/`perpetual` (ex.: `mobile`) → TIPO_DE_FUNIL_NAO_SUPORTADO,
 *      sem ler a config nem chamar motor nenhum;
 *   2. sem config → COMBINACAO_NAO_VALIDADA (nunca assumir default);
 *   3. combinação fora da lista liberada e sem `validado` → COMBINACAO_NAO_VALIDADA;
 *   4. config incompleta → CONFIG_INCOMPLETA (lista os campos).
 *
 * O gate do Resumão (`assertReportScope`, `launch_report_configs`) NÃO é tocado.
 * O código `COMBINACAO_NAO_VALIDADA` é a mesma string por desenho (padrão 41.1);
 * as rotas são distintas e o `detalhe` diz "gerador de debriefing".
 */

import { eq, inArray } from "drizzle-orm";
import {
  debriefingConfigs,
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

export interface DebriefingConfigLancamento {
  tipoDeFunil: "launch";
  stageId: string;
  funnelId: string;
  projectId: string;
  datasChave: DatasChave;
  lancamentoComparacaoFunnelId: string | null;
  etapas: EtapaDoLancamento[];
  perguntasConfirmadas: PerguntasConfirmadas;
  closerMediums: string[];
  closerPorSellerName: boolean;
  dimensaoDeCriativo: DimensaoDeCriativo;
  imposto: ImpostoResolvido;
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
}

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
  lancamentoComparacaoFunnelId: string | null;
  etapas: EtapaDoLancamento[];
  perguntasConfirmadas: PerguntasConfirmadasGravadas;
  closerMediums: string[] | null;
  closerPorSellerName: boolean | null;
  dimensaoDeCriativo: DimensaoDeCriativo | null;
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
  "inicioCaptacao" | "aberturaCarrinho" | "fimCarrinho" | "reabertura" | "downsell"
>;

/**
 * AC2 — presença, resposta explícita, data existente e ordem coerente.
 * Usada pelo PUT (400) e pelo gate (CONFIG_INCOMPLETA): uma regra só.
 */
export function problemasDasDatasChave(d: DatasParciais): string[] {
  const p: string[] = [];
  const obrig = ["inicioCaptacao", "aberturaCarrinho", "fimCarrinho"] as const;
  for (const campo of obrig) {
    const v = d[campo];
    if (!v) p.push(`datasChave.${campo} é obrigatória`);
    else if (!dataExiste(v)) p.push(`datasChave.${campo} (${v}) não é uma data válida`);
  }
  for (const campo of ["reabertura", "downsell"] as const) {
    const r = d[campo];
    if (!r) {
      p.push(`datasChave.${campo} exige resposta explícita: { houve: false } ou { houve: true, abertura, fim }`);
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

/** AC4 (segunda metade) — papel de etapa extraordinária exige a data correspondente. */
export function problemasPapelXDatas(
  etapas: readonly EtapaDoLancamento[],
  d: Pick<ValoresDaConfig, "reabertura" | "downsell">,
): string[] {
  const p: string[] = [];
  for (const e of etapas) {
    if (e.papel === "reabertura" && d.reabertura?.houve !== true) {
      p.push(`etapas[${e.stageId}].papel=reabertura exige datasChave.reabertura.houve = true`);
    }
    if ((e.papel === "leads-downsell" || e.papel === "vendas-downsell") && d.downsell?.houve !== true) {
      p.push(`etapas[${e.stageId}].papel=${e.papel} exige datasChave.downsell.houve = true`);
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
  f.push(...problemasPapelXDatas(cfg.etapas, cfg));

  for (const stageId of cfg.etapasComPesquisa) {
    const conf = cfg.perguntasConfirmadas[stageId];
    if (!conf || !Object.prototype.hasOwnProperty.call(conf, "faixa") || conf.faixa === undefined) {
      f.push(`perguntasConfirmadas[${stageId}].faixa (chave da pergunta ou null = "sem faixa A→D")`);
    }
  }

  if (cfg.closerMediums === null) f.push("closerMediums (lista vazia é resposta válida)");
  if (cfg.closerPorSellerName === null) f.push("closerPorSellerName");
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
  // Depois de `assertDebriefingScope`, todo campo abaixo está preenchido.
  return {
    tipoDeFunil: "launch",
    ...base,
    datasChave: {
      inicioCaptacao: cfg.inicioCaptacao as string,
      aberturaCarrinho: cfg.aberturaCarrinho as string,
      fimCarrinho: cfg.fimCarrinho as string,
      reabertura: cfg.reabertura as RespostaEtapaExtra,
      downsell: cfg.downsell as RespostaEtapaExtra,
    },
    lancamentoComparacaoFunnelId: cfg.lancamentoComparacaoFunnelId,
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
    dimensaoDeCriativo: cfg.dimensaoDeCriativo as DimensaoDeCriativo,
    imposto: cfg.imposto,
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
    lancamentoComparacaoFunnelId: v.lancamentoComparacaoFunnelId,
    etapas: [...v.etapas]
      .map((e) => ({ stageId: e.stageId, papel: e.papel }))
      .sort((a, b) => a.stageId.localeCompare(b.stageId)),
    perguntasConfirmadas: v.perguntasConfirmadas,
    closerMediums: v.closerMediums === null ? null : [...v.closerMediums].sort(),
    closerPorSellerName: v.closerPorSellerName,
    dimensaoDeCriativo: v.dimensaoDeCriativo,
  });
}

/**
 * Toda coluna desta config é premissa (datas-chave, comparação, etapas,
 * perguntas, closer, criativo): mudou qualquer uma → a conferência anterior não
 * vale mais (mesma lógica da 41.1).
 */
export function premissaMudou(antes: ValoresDaConfig, depois: ValoresDaConfig): boolean {
  return chaveDasPremissas(antes) !== chaveDasPremissas(depois);
}

/** `trim` + minúsculas, sem repetição (49.1 AC10). Item vazio é rejeitado antes. */
export function normalizarCloserMediums(lista: readonly string[]): string[] {
  return [...new Set(lista.map((m) => m.trim().toLowerCase()))];
}

export function valoresDaLinha(row: DebriefingConfigRow): ValoresDaConfig {
  return {
    inicioCaptacao: row.inicioCaptacao ?? null,
    aberturaCarrinho: row.aberturaCarrinho ?? null,
    fimCarrinho: row.fimCarrinho ?? null,
    reabertura: row.reabertura ?? null,
    downsell: row.downsell ?? null,
    lancamentoComparacaoFunnelId: row.lancamentoComparacaoFunnelId ?? null,
    etapas: Array.isArray(row.etapas) ? row.etapas : [],
    perguntasConfirmadas:
      row.perguntasConfirmadas && typeof row.perguntasConfirmadas === "object" ? row.perguntasConfirmadas : {},
    closerMediums: Array.isArray(row.closerMediums) ? row.closerMediums : null,
    closerPorSellerName: row.closerPorSellerName ?? null,
    dimensaoDeCriativo: row.dimensaoDeCriativo ?? null,
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
  gravar(stageId: string, valores: ValoresDaConfig, opcoes: { existe: boolean; resetarValidado: boolean }): Promise<void>;
  /** Devolve o `validado_em` gravado, ou `null` se não existe config. */
  marcarValidado(stageId: string, userId: string): Promise<Date | null>;
  nomeDoUsuario(userId: string): Promise<string | null>;
}

export function criarDebriefingConfigStore(db: Database): DebriefingConfigStore {
  return {
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
    async gravar(stageId, valores, { existe, resetarValidado }) {
      if (!existe) {
        await db.insert(debriefingConfigs).values({ stageId, ...valores });
        return;
      }
      await db
        .update(debriefingConfigs)
        .set({
          ...valores,
          updatedAt: new Date(),
          ...(resetarValidado ? { validado: false, validadoEm: null, validadoPor: null } : {}),
        })
        .where(eq(debriefingConfigs.stageId, stageId));
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

/** Monta a forma crua a partir do que está gravado. `null` = etapa sem config. */
export async function montarConfigBruta(
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
  };
}

/**
 * Config CRUA (sem gate). USO EXCLUSIVO da rota de leitura da UI, que precisa
 * renderizar o estado bloqueado. Gerador nenhum chama isto — use
 * `loadDebriefingConfig`. `null` = a etapa não existe.
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
}

/**
 * Regras cruzadas do PUT que não dependem da planilha: ordem das datas,
 * comparação no mesmo projeto, etapas do mesmo funil, papel × datas e
 * `perguntasConfirmadas` só para etapas da lista. Devolve a lista de problemas
 * (vazia = ok); cada item nomeia o campo/par/item ofensor.
 */
export function problemasDoCorpoLancamento(v: ValoresDaConfig, ctx: ContextoDeValidacao): string[] {
  const p: string[] = [...problemasDasDatasChave(v)];

  // AC3
  if (v.lancamentoComparacaoFunnelId !== null) {
    if (v.lancamentoComparacaoFunnelId === ctx.funnelId) {
      p.push("lancamentoComparacaoFunnelId não pode ser o próprio funil da etapa");
    } else if (!ctx.funisDoProjeto.includes(v.lancamentoComparacaoFunnelId)) {
      p.push(`lancamentoComparacaoFunnelId (${v.lancamentoComparacaoFunnelId}) não é um funil do mesmo projeto`);
    }
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
