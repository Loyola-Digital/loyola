/**
 * Story 49.6 — orquestração do "Gerar debriefing" (AC1/AC2).
 *
 * Ordem FIXA dos portões (testada): guest → etapa (404 / 422 de tipo) → gate da
 * 49.1 (`loadDebriefingConfig`, a única porta) → carga + motores + composição
 * (49.3/49.4/49.5) → guardas (`validateDebriefing`, 49.5) → [49.7: textos da IA]
 * → render (413 acima de 5 MB) → persistência (HTML + payload, numa transação).
 * Nada é gravado quando qualquer passo antes da persistência falha.
 *
 * Comparação (Δ, título "A × B"): o 1º item da lista EFETIVA do contrato
 * (`config.lancamentoComparacaoFunnelId`, 49.11 CONTRACT-001 — nunca a lista
 * gravada do GET). Os números do lançamento de comparação saem dos MESMOS
 * motores, com a config de debriefing do próprio funil de comparação (a etapa
 * Debriefing dele, pela mesma porta `loadDebriefingConfig`). R7-7 (dono,
 * 2026-10-02): sem config liberada nele, vale o ÚLTIMO payload salvo dele
 * (`debriefing_payloads`, 0165) com aviso visível no documento; sem nenhum dos
 * dois, 422 `COMPARACAO_SEM_CONFIG` explicado — nunca Δ inventado nem "edição
 * única" silenciosa. Duas configs liberadas continua 422 (ambíguo, não ausente).
 *
 * As dependências são injetáveis (`DependenciasDaGeracao`): a rota usa as
 * reais; o teste prova a ordem e o "nada persistido" sem banco nem planilha.
 *
 * Story 49.12 — lançamento EM ANDAMENTO (captação aberta, R8-1): depois do
 * gate, o corte = ontem em Brasília no instante da geração (R8-2, AC3) entra na
 * config como ENTRADA dos motores; corte antes do início da captação → 422
 * `SEM_DIA_FECHADO`; carrinho já aberto até o corte → 422 `CARRINHO_JA_ABERTO`
 * (AC4, até a 49.14); mídia da Meta do dia de corte não sincronizada em alguma
 * conta → 422 `MIDIA_DO_CORTE_NAO_SINCRONIZADA` (AC15). A comparação pela
 * config é cortada no mesmo D+N (AC8); só com payload salvo, a parcial sai SEM
 * Δ e com aviso. Comparação que está ela mesma em andamento → 422
 * `COMPARACAO_EM_ANDAMENTO` (AC8, R9-4), em qualquer modo. A persistência
 * substitui a parcial da etapa (AC10) — o final também.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  debriefingPayloads,
  debriefings,
  funnelStages,
  funnels,
  metaAdsAccountProjects,
  metaAdsAccounts,
  metaSyncState,
  projects,
} from "../db/schema.js";
import type { Database } from "../db/client.js";
import {
  DebriefingConfigError,
  loadDebriefingConfig,
  type DebriefingConfig,
  type DebriefingConfigLancamento,
} from "./debriefing-config.js";
import { DebriefingDadoIndisponivelError, loadDebriefingMoneyTimeInput } from "./debriefing-money-time-loader.js";
import { loadDebriefingAudienceInput } from "./debriefing-audience-loader.js";
import { CRITERIO_DE_UNICO_HEADLINE, MAXD_PADRAO, computeDebriefingMoneyTime } from "./debriefing-money-time-engine.js";
import { computeDebriefingAudience } from "./debriefing-audience-engine.js";
import { DEBRIEFING_PAYLOAD_VERSAO, montarPayloadDebriefing, parcialDo, type DebriefingPayload } from "./debriefing-payload.js";
import { validateDebriefing, type AlertaFase12 } from "./debriefing-guards.js";
import { renderDebriefing, type ComparacaoDoDebriefing, type OrigemDaComparacao } from "./debriefing-render.js";
import { dataBr, diaMesBr } from "./launch-report-narrative.js";
import { diasEntre, somarDias } from "./debriefing-hygiene.js";
import { businessYesterday } from "../utils/sale-date.js";
import { violaUnicidade } from "../utils/db-errors.js";

/** Mesmo teto de `routes/debriefings.ts:17` e de `launch-reports.ts:47`. */
export const MAX_HTML_BYTES_DEBRIEFING = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Erros próprios da geração (o resto vem tipado dos loaders/gate/guardas)
// ---------------------------------------------------------------------------

export type CodigoErroDaGeracao =
  | "ETAPA_NAO_E_DEBRIEFING"
  | "COMPARACAO_SEM_CONFIG"
  // Story 49.12
  | "SEM_DIA_FECHADO"
  | "CARRINHO_JA_ABERTO"
  | "MIDIA_DO_CORTE_NAO_SINCRONIZADA"
  | "COMPARACAO_EM_ANDAMENTO";

export class DebriefingGeracaoError extends Error {
  constructor(
    readonly erro: CodigoErroDaGeracao,
    readonly detalhe: string,
    readonly acao: string,
  ) {
    super(detalhe);
    this.name = "DebriefingGeracaoError";
  }
  toResponse(): { erro: CodigoErroDaGeracao; detalhe: string; acao: string } {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

// ---------------------------------------------------------------------------
// Dependências
// ---------------------------------------------------------------------------

export interface EtapaResolvida {
  stageId: string;
  stageName: string;
  stageType: string;
  funnelId: string;
  funnelName: string;
  projectId: string;
  projectName: string;
}

export interface RegistroDoDebriefing {
  campaignName: string;
  stageId: string;
  html: string;
  /** Quem gerou: `createdBy` no registro novo; `updatedBy` quando substitui a parcial (49.12 AC10). */
  createdBy: string;
  payload: DebriefingPayload;
  comparacao: { funnelId: string; nome: string; payload: DebriefingPayload; origem: OrigemDaComparacao } | null;
  alertas: AlertaFase12[];
  /** Story 49.12 — o documento é uma parcial (no máximo uma por etapa). Ausente = final. */
  parcial?: boolean;
}

/**
 * Story 49.12 (AC15) — o estado do sync da mídia Meta de UMA conta do
 * lançamento (`meta_sync_state`). `ad-daily` é o passo que roda em toda rodada
 * (sucesso ou erro); `campaign-daily` só roda quando a conta teve anúncio no
 * período — por isso "sincronizado" é lido do `ad-daily`, e o `campaign-daily`
 * só pesa quando RODOU depois do corte e falhou (a mídia do debriefing sai dele).
 */
export interface EstadoDoSyncDaConta {
  /** `act_…` (a chave `accountId` do `meta_sync_state`). */
  accountId: string;
  nome: string | null;
  adDaily: { lastSuccessAt: string | null } | null;
  campaignDaily: { lastRunAt: string | null; lastSuccessAt: string | null } | null;
  /**
   * QA 49.12 REL-002 — a conta está vinculada ao projeto (`meta_ads_account_projects`)?
   * O sync só percorre as contas do projeto: conta da etapa/funil fora dele NUNCA é
   * sincronizada para este projeto, e "esperar o próximo sync" não resolve.
   * Ausente = vinculada (forma anterior).
   */
  vinculadaAoProjeto?: boolean;
}

export interface DependenciasDaGeracao {
  /** Etapa SE pertencer ao funil e ao projeto da URL; `null` = 404 (IDOR). */
  resolverEtapa(projectId: string, funnelId: string, stageId: string): Promise<EtapaResolvida | null>;
  /** A porta da 49.1 (`loadDebriefingConfig`) — lança `DebriefingConfigError`. */
  carregarConfig(stageId: string): Promise<DebriefingConfig>;
  /** Etapas do tipo Debriefing de um funil (para achar a config da comparação). */
  etapasDeDebriefingDoFunil(funnelId: string): Promise<string[]>;
  /** R7-7: o último payload salvo (0165) que descreve o funil dado, do projeto; `null` = nenhum. */
  ultimoPayloadSalvoDoFunil(projectId: string, funnelId: string): Promise<PayloadSalvo | null>;
  /** Loaders + motores + composição (49.3/49.4/49.5). Lança `DebriefingDadoIndisponivelError`. */
  calcularPayload(config: DebriefingConfigLancamento, geradoEm: Date): Promise<DebriefingPayload>;
  /** Nomes para o documento: funis do projeto e etapas dos funis dados. */
  nomes(projectId: string, funnelIds: string[]): Promise<{ funis: Record<string, string>; etapas: Record<string, string> }>;
  /**
   * Persistência (HTML + payload) numa transação. 49.12 (AC10): havendo
   * parcial da etapa, ATUALIZA esse mesmo debriefing (`substituiuParcial`).
   */
  gravar(registro: RegistroDoDebriefing): Promise<{ id: string; substituiuParcial?: boolean }>;
  /** Story 49.12 (AC15) — o sync da mídia Meta das contas do lançamento. Só o modo em andamento chama. */
  estadoDoSyncDaMidia(config: DebriefingConfigLancamento): Promise<EstadoDoSyncDaConta[]>;
  /** Relógio injetado — o render nunca lê o relógio (AC10). */
  agora(): Date;
}

/** Um payload persistido pela geração (`debriefing_payloads.payload`) e quando foi salvo. */
export interface PayloadSalvo {
  debriefingId: string;
  /** ISO 8601 (`debriefing_payloads.created_at`). */
  salvoEm: string;
  payload: DebriefingPayload;
}

export interface ParametrosDaGeracao {
  projectId: string;
  funnelId: string;
  stageId: string;
  userId: string;
  userRole: string | undefined;
  /** Conferência externa da 49.5 — opcional, nunca derivada (sem ela, `skipped`). */
  investimentoOficial: number | null;
}

/** Resultado da geração: status HTTP e corpo — a rota só repassa. */
export type ResultadoDaGeracao =
  | {
      status: 200;
      body: {
        id: string;
        html: string;
        payload: DebriefingPayload;
        alertas: AlertaFase12[];
        /** Story 49.12 (AC10/AC11) — a geração atualizou a parcial que existia (o mesmo id). */
        substituiuParcial: boolean;
      };
    }
  | { status: 403 | 404 | 413 | 422; body: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

export async function gerarDebriefing(deps: DependenciasDaGeracao, params: ParametrosDaGeracao): Promise<ResultadoDaGeracao> {
  // 1 — guest
  if (params.userRole === "guest") return { status: 403, body: { error: "Acesso negado" } };

  // 2 — etapa da URL
  const etapa = await deps.resolverEtapa(params.projectId, params.funnelId, params.stageId);
  if (!etapa) return { status: 404, body: { error: "Etapa não encontrada" } };
  if (etapa.stageType !== "debriefing") {
    return {
      status: 422,
      body: new DebriefingGeracaoError(
        "ETAPA_NAO_E_DEBRIEFING",
        `a etapa "${etapa.stageName}" é do tipo "${etapa.stageType}" — o gerador de debriefing só roda numa etapa do tipo Debriefing`,
        "Abrir a etapa Debriefing do funil (ou criar uma) e gerar a partir dela",
      ).toResponse(),
    };
  }

  try {
    // 3 — gate da 49.1 (tipo do funil → combinação → completude)
    const config = await deps.carregarConfig(params.stageId);
    if (config.tipoDeFunil !== "launch") {
      // A 49.1 já lança TIPO_DE_FUNIL_NAO_SUPORTADO para perpétuo antes da 49.10;
      // esta linha é a rede caso o gate mude sem a 49.10 despachar.
      return {
        status: 422,
        body: {
          erro: "TIPO_DE_FUNIL_NAO_SUPORTADO",
          detalhe: "o gerador de debriefing de funil perpétuo ainda não está disponível",
          acao: "Aguardar a Story 49.10",
        },
      };
    }

    // 3b — Story 49.12: lançamento em andamento → corte (AC3), carrinho (AC4) e
    // sync da mídia do dia de corte (AC15), ANTES de qualquer carga pesada.
    const geradoEm = deps.agora();
    const corte = config.situacaoDoLancamento === "em-andamento" ? await corteDaParcial(deps, config, geradoEm) : null;
    const configDaGeracao: DebriefingConfigLancamento = corte ? { ...config, corte: corte.dia } : config;

    // 4 — carga + motores + composição (atual e, havendo, a comparação principal)
    // A config da comparação é conferida ANTES da carga pesada: sem ela, falha cedo.
    const comparacaoId = config.lancamentoComparacaoFunnelId;
    const fonteComparacao = comparacaoId ? await fonteDaComparacao(deps, etapa.projectId, comparacaoId) : null;
    const payload = await deps.calcularPayload(configDaGeracao, geradoEm);

    const nomes = await deps.nomes(etapa.projectId, [etapa.funnelId, ...(comparacaoId ? [comparacaoId] : [])]);
    let comparacao: ComparacaoDoDebriefing | null = null;
    let comparacaoSemDelta: { funnelId: string; nome: string; salvoEm: string } | null = null;
    if (comparacaoId && fonteComparacao) {
      const nome = nomes.funis[comparacaoId] ?? comparacaoId;
      if (fonteComparacao.tipo === "config") {
        // 49.12 (AC8, R8-3): na parcial, a comparação é cortada no MESMO D+N —
        // do início da captação dela até início + N (ou o fim da janela dela).
        const cfgComp = corte
          ? { ...fonteComparacao.config, corte: somarDias(fonteComparacao.config.datasChave.inicioCaptacao, corte.dMaisN) }
          : fonteComparacao.config;
        comparacao = { funnelId: comparacaoId, nome, payload: await deps.calcularPayload(cfgComp, geradoEm), origem: { tipo: "recalculada" } };
      } else if (corte) {
        // 49.12 (AC8, R8-3): relatório salvo tem os totais fechados — não dá para
        // cortar em D+N. Sai SEM Δ, com aviso; a geração não é bloqueada.
        comparacaoSemDelta = { funnelId: comparacaoId, nome, salvoEm: fonteComparacao.salvo.salvoEm };
      } else {
        comparacao = {
          funnelId: comparacaoId,
          nome,
          payload: fonteComparacao.salvo.payload,
          origem: {
            tipo: "payload-salvo",
            debriefingId: fonteComparacao.salvo.debriefingId,
            salvoEm: fonteComparacao.salvo.salvoEm,
            motivo: fonteComparacao.motivo,
          },
        };
      }
    }

    // 5 — guardas ANTES do render (49.5): invariante e conferência externa bloqueiam;
    // alerta vira banner. O payload da comparação também precisa fechar — um Δ
    // contra números que reprovam invariante seria o "número errado em silêncio".
    const guardas = validateDebriefing(payload, { investimentoOficial: params.investimentoOficial });
    const bloqueio = corpoDoBloqueio(guardas, null);
    if (bloqueio) return { status: 422, body: bloqueio };
    if (comparacao) {
      const gc = validateDebriefing(comparacao.payload, {});
      const bc = corpoDoBloqueio(gc, comparacao.nome);
      if (bc) return { status: 422, body: bc };
    }

    // 5b — (49.7) textos da IA entram aqui, depois das guardas e antes do render.

    // 6 — render
    const html = renderDebriefing({
      payload,
      comparacao,
      rotulos: { projeto: etapa.projectName, lancamento: etapa.funnelName, etapas: nomes.etapas, funis: nomes.funis },
      alertas: guardas.alertas,
      ...(comparacaoSemDelta ? { comparacaoSemDelta } : {}),
    });
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES_DEBRIEFING) {
      return { status: 413, body: { error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" } };
    }

    // 7 — persiste (só aqui). 49.12 (AC7): a parcial diz no título que é parcial e até quando.
    const j = payload.dinheiroTempo.janela;
    const parcial = parcialDo(payload);
    const campaignName =
      `Debriefing ${etapa.projectName} ${etapa.funnelName}${comparacao ? ` × ${comparacao.nome}` : ""} — ` +
      (parcial ? `PARCIAL — dados até ${diaMesBr(parcial.corte)} · D+${parcial.dMaisN}` : `${diaMesBr(j.inicio)} a ${diaMesBr(j.fim)}`);
    const { id, substituiuParcial } = await deps.gravar({
      campaignName: campaignName.slice(0, 300),
      stageId: params.stageId,
      html,
      createdBy: params.userId,
      payload,
      comparacao: comparacao
        ? { funnelId: comparacao.funnelId, nome: comparacao.nome, payload: comparacao.payload, origem: comparacao.origem }
        : null,
      alertas: guardas.alertas,
      ...(parcial ? { parcial: true } : {}),
    });
    return { status: 200, body: { id, html, payload, alertas: guardas.alertas, substituiuParcial: substituiuParcial ?? false } };
  } catch (err) {
    if (err instanceof DebriefingConfigError) return { status: 422, body: err.toResponse() };
    if (err instanceof DebriefingDadoIndisponivelError) return { status: 422, body: err.toResponse() };
    if (err instanceof DebriefingGeracaoError) return { status: 422, body: err.toResponse() };
    throw err;
  }
}

/** Corpo 422 das guardas (49.5 AC3/AC5), ou `null` quando liberado. */
function corpoDoBloqueio(
  g: ReturnType<typeof validateDebriefing>,
  daComparacao: string | null,
): Record<string, unknown> | null {
  const prefixo = daComparacao ? `lançamento de comparação ${daComparacao}: ` : "";
  const primeira = g.violacoes[0];
  if (primeira) {
    return {
      erro: "INVARIANTE_VIOLADO",
      codigo: primeira.codigo,
      detalhe: `${prefixo}${primeira.detalhe}`,
      acao: primeira.acao,
      violacoes: g.violacoes,
    };
  }
  if (g.conferencia.status === "failed") {
    return {
      erro: "CONFERENCIA_EXTERNA",
      detalhe: `${prefixo}${g.conferencia.detalhe}`,
      acao: "Conferir o investimento oficial informado contra a mídia do período (ou deixar o campo em branco)",
      conferencia: g.conferencia,
    };
  }
  return null;
}

/**
 * De onde saem os números do lançamento de comparação (R7-7):
 * 1. a config de debriefing liberada da etapa Debriefing dele (mesma porta da
 *    49.1) → recálculo pelos motores; exige exatamente UMA liberada (duas = 422);
 * 2. sem nenhuma liberada → o último payload salvo dele, com o motivo (vai para
 *    o aviso do documento);
 * 3. sem nenhum dos dois → 422 `COMPARACAO_SEM_CONFIG` explicado.
 */
type FonteDaComparacao =
  | { tipo: "config"; config: DebriefingConfigLancamento }
  | { tipo: "payload-salvo"; salvo: PayloadSalvo; motivo: string };

async function fonteDaComparacao(deps: DependenciasDaGeracao, projectId: string, funnelId: string): Promise<FonteDaComparacao> {
  const etapas = await deps.etapasDeDebriefingDoFunil(funnelId);
  const liberadas: DebriefingConfigLancamento[] = [];
  const motivos: string[] = [];
  for (const stageId of etapas) {
    try {
      const c = await deps.carregarConfig(stageId);
      if (c.tipoDeFunil === "launch") liberadas.push(c);
    } catch (err) {
      if (err instanceof DebriefingConfigError) motivos.push(`${err.erro}: ${err.detalhe}`);
      else throw err;
    }
  }
  if (liberadas.length === 1) {
    const c = liberadas[0]!;
    // 49.12 (AC8, R9-4): comparação que está ela mesma em andamento → 422, nunca Δ sobre parcial.
    if (c.situacaoDoLancamento === "em-andamento") {
      throw erroComparacaoEmAndamento(funnelId, 'a config de debriefing dele está marcada "em andamento"');
    }
    return { tipo: "config", config: c };
  }
  if (liberadas.length > 1) {
    throw new DebriefingGeracaoError(
      "COMPARACAO_SEM_CONFIG",
      `o lançamento de comparação (${funnelId}) tem ${liberadas.length} etapas Debriefing com config liberada — não dá para saber qual descreve o lançamento`,
      "Deixar a config de debriefing em uma só etapa Debriefing do lançamento de comparação",
    );
  }
  const semConfig =
    etapas.length === 0
      ? "ele não tem etapa Debriefing"
      : `ele não tem config de debriefing liberada (${motivos.join(" | ")})`;
  const salvo = await deps.ultimoPayloadSalvoDoFunil(projectId, funnelId);
  if (salvo) {
    // 49.12 (AC8, R9-4): o ÚLTIMO salvo é uma parcial (mesmo que exista um final
    // mais antigo — o AC10 deixa gerar parcial nova depois de um final) → 422.
    const parcialSalva = parcialDo(salvo.payload);
    if (parcialSalva) {
      throw erroComparacaoEmAndamento(
        funnelId,
        `o último debriefing salvo dele é uma PARCIAL (dados até ${dataBr(parcialSalva.corte)}, D+${parcialSalva.dMaisN}) — relatório parcial não tem os totais fechados`,
      );
    }
    return { tipo: "payload-salvo", salvo, motivo: semConfig };
  }
  throw new DebriefingGeracaoError(
    "COMPARACAO_SEM_CONFIG",
    `o lançamento de comparação (${funnelId}) não tem como entrar no Δ: ${semConfig}, e nenhum debriefing dele foi gerado e salvo pelo Loyola — sem config não há datas-chave nem etapas para recalcular, e sem payload salvo não há números para comparar`,
    "Configurar (e validar) o debriefing na etapa Debriefing do lançamento de comparação — ou tirar a comparação do formulário para gerar como edição única",
  );
}

function erroComparacaoEmAndamento(funnelId: string, porque: string): DebriefingGeracaoError {
  return new DebriefingGeracaoError(
    "COMPARACAO_EM_ANDAMENTO",
    `o lançamento de comparação (${funnelId}) ainda está em andamento: ${porque} — um Δ contra números parciais seria inventado`,
    "Tirar este lançamento da lista de comparação na configuração do debriefing, ou esperar o fim dele (e gerá-lo como encerrado) e gerar de novo",
  );
}

// ---------------------------------------------------------------------------
// Story 49.12 — corte da parcial (AC3), carrinho (AC4) e sync da mídia (AC15)
// ---------------------------------------------------------------------------

/** O corte de uma geração parcial: o dia (ontem em Brasília) e o D+N. */
export interface CorteDaParcial {
  dia: string;
  dMaisN: number;
}

/**
 * AC3 — a data de corte é ONTEM em `America/Sao_Paulo` no instante da geração
 * (R8-2), calculada aqui (o orquestrador lê o relógio injetado; os motores não).
 * AC4 — carrinho já aberto até o corte → 422 até a 49.14. AC15 — mídia do dia
 * de corte não sincronizada em alguma conta → 422, antes de calcular.
 */
async function corteDaParcial(
  deps: DependenciasDaGeracao,
  config: Extract<DebriefingConfigLancamento, { situacaoDoLancamento: "em-andamento" }>,
  agora: Date,
): Promise<CorteDaParcial> {
  const dia = businessYesterday(agora);
  const inicio = config.datasChave.inicioCaptacao;
  if (dia < inicio) {
    throw new DebriefingGeracaoError(
      "SEM_DIA_FECHADO",
      `a captação começa em ${dataBr(inicio)} e o último dia fechado (ontem, no fuso de Brasília) é ${dataBr(dia)} — ainda não há dia fechado de captação para analisar`,
      `Gerar a partir de ${dataBr(somarDias(inicio, 1))}, quando o primeiro dia de captação (${dataBr(inicio)}) já estiver fechado`,
    );
  }
  const abertura = config.datasChave.aberturaCarrinho;
  if (abertura !== null && abertura <= dia) {
    throw new DebriefingGeracaoError(
      "CARRINHO_JA_ABERTO",
      `o carrinho abriu em ${dataBr(abertura)}, antes do corte (dados até ${dataBr(dia)}) — o modo em andamento com o carrinho aberto ainda não existe (Story 49.14)`,
      'Esperar o fim do lançamento e gerar como encerrado (marcar "encerrado" e informar as datas na configuração do debriefing)',
    );
  }
  const atrasadas = contasAtrasadasNoCorte(await deps.estadoDoSyncDaMidia(config), dia);
  if (atrasadas.length > 0) {
    const fora = atrasadas.filter((a) => a.foraDoProjeto);
    const esperar = atrasadas.filter((a) => !a.foraDoProjeto);
    const rot = (a: (typeof atrasadas)[number]) => `${a.accountId}${a.nome ? ` (${a.nome})` : ""}`;
    // QA REL-002: conta fora do projeto não se resolve esperando — a ação diz o que fazer.
    const acoes = [
      ...(fora.length
        ? [
            `Vincular a conta ${fora.map(rot).join(", ")} ao projeto (contas de anúncio do projeto) ou tirá-la da etapa/funil do lançamento — ` +
              "sem o vínculo o sync da Meta nunca a sincroniza para este projeto, e esperar não resolve",
          ]
        : []),
      ...(esperar.length
        ? ["Esperar o próximo sync da mídia da Meta (roda a cada 15 minutos) ou rodar a sincronização (admin: Sincronizar mídia Meta)"]
        : []),
    ];
    throw new DebriefingGeracaoError(
      "MIDIA_DO_CORTE_NAO_SINCRONIZADA",
      `a mídia da Meta do dia de corte (${dataBr(dia)}) ainda não foi sincronizada em ${atrasadas.length} conta(s) do lançamento: ` +
        atrasadas.map((a) => `${rot(a)} — ${a.situacao}`).join("; "),
      `${acoes.map((a, i) => (i ? a[0]!.toLowerCase() + a.slice(1) : a)).join("; e ")}; depois, gerar de novo`,
    );
  }
  return { dia, dMaisN: diasEntre(inicio, dia) };
}

/** Instante em que o dia de corte termina em Brasília (BRT = UTC−3 fixo desde 2019). */
export function fimDoDiaEmBrasilia(dia: string): number {
  return Date.parse(`${somarDias(dia, 1)}T00:00:00-03:00`);
}

/** "06/10/2026 às 03:15 (Brasília)" de um instante ISO. */
function instanteBr(iso: string): string {
  const t = Date.parse(iso);
  const x = new Date(t - 3 * 3600_000).toISOString();
  return `${dataBr(x.slice(0, 10))} às ${x.slice(11, 16)} (Brasília)`;
}

/**
 * AC15 (puro) — contas cuja mídia do dia de corte ainda não está no banco:
 * o `ad-daily` (passo que roda sempre) sem sucesso depois do fim do dia de
 * corte; ou o `campaign-daily` (de onde sai a mídia do debriefing) que RODOU
 * depois do corte e falhou. Conta parada (sem `campaign-daily` recente) não
 * bloqueia — o `campaign-daily` só é gravado quando houve anúncio.
 */
export function contasAtrasadasNoCorte(
  contas: readonly EstadoDoSyncDaConta[],
  corte: string,
): { accountId: string; nome: string | null; situacao: string; foraDoProjeto?: true }[] {
  const limite = fimDoDiaEmBrasilia(corte);
  const depois = (iso: string | null | undefined) => !!iso && Date.parse(iso) >= limite;
  const atrasadas: { accountId: string; nome: string | null; situacao: string; foraDoProjeto?: true }[] = [];
  for (const c of contas) {
    if (c.vinculadaAoProjeto === false) {
      atrasadas.push({ accountId: c.accountId, nome: c.nome, situacao: "não está vinculada ao projeto — o sync da Meta não a percorre", foraDoProjeto: true });
      continue;
    }
    const ok = c.adDaily?.lastSuccessAt ?? null;
    if (!depois(ok)) {
      atrasadas.push({
        accountId: c.accountId,
        nome: c.nome,
        situacao: ok ? `sincronizada pela última vez em ${instanteBr(ok)}` : "nunca sincronizada",
      });
      continue;
    }
    const camp = c.campaignDaily;
    if (camp && depois(camp.lastRunAt) && !depois(camp.lastSuccessAt)) {
      atrasadas.push({
        accountId: c.accountId,
        nome: c.nome,
        situacao:
          `o passo de mídia por campanha falhou na última rodada (${instanteBr(camp.lastRunAt!)})` +
          (camp.lastSuccessAt ? `; último sucesso em ${instanteBr(camp.lastSuccessAt)}` : "; nunca teve sucesso"),
      });
    }
  }
  return atrasadas;
}

// ---------------------------------------------------------------------------
// Dependências reais
// ---------------------------------------------------------------------------

export function dependenciasReais(db: Database): DependenciasDaGeracao {
  return {
    async resolverEtapa(projectId, funnelId, stageId) {
      const [row] = await db
        .select({
          stageId: funnelStages.id,
          stageName: funnelStages.name,
          stageType: funnelStages.stageType,
          funnelId: funnels.id,
          funnelName: funnels.name,
          projectId: projects.id,
          projectName: projects.name,
        })
        .from(funnelStages)
        .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
        .innerJoin(projects, eq(projects.id, funnels.projectId))
        .where(and(eq(funnelStages.id, stageId), eq(funnelStages.funnelId, funnelId), eq(funnels.projectId, projectId)))
        .limit(1);
      return row ?? null;
    },
    carregarConfig: (stageId) => loadDebriefingConfig(db, stageId),
    async etapasDeDebriefingDoFunil(funnelId) {
      const rows = await db
        .select({ id: funnelStages.id })
        .from(funnelStages)
        .where(and(eq(funnelStages.funnelId, funnelId), eq(funnelStages.stageType, "debriefing")));
      return rows.map((r) => r.id);
    },
    ultimoPayloadSalvoDoFunil: (projectId, funnelId) => lerUltimoPayloadSalvoDoFunil(db, projectId, funnelId),
    calcularPayload: (config, geradoEm) => calcularPayloadDebriefing(db, config, geradoEm),
    async nomes(projectId, funnelIds) {
      const [fs, es] = await Promise.all([
        db.select({ id: funnels.id, name: funnels.name }).from(funnels).where(eq(funnels.projectId, projectId)),
        funnelIds.length
          ? db.select({ id: funnelStages.id, name: funnelStages.name }).from(funnelStages).where(inArray(funnelStages.funnelId, funnelIds))
          : Promise.resolve([] as { id: string; name: string }[]),
      ]);
      return {
        funis: Object.fromEntries(fs.map((f) => [f.id, f.name])),
        etapas: Object.fromEntries(es.map((e) => [e.id, e.name])),
      };
    },
    gravar: (registro) => gravarDebriefingGerado(db, registro),
    estadoDoSyncDaMidia: (config) => lerEstadoDoSyncDaMidia(db, config),
    agora: () => new Date(),
  };
}

/**
 * R7-7: o último payload de LANÇAMENTO salvo que descreve o funil dado
 * (`payload.config.funnelId`), do mesmo projeto e da versão de payload atual.
 * Lê pelo `config` do payload, não pela etapa: o documento pode ter sido movido
 * e a etapa apagada (o `stage_id_origem` não tem FK).
 */
export async function lerUltimoPayloadSalvoDoFunil(db: Database, projectId: string, funnelId: string): Promise<PayloadSalvo | null> {
  const [row] = await db
    .select({ debriefingId: debriefingPayloads.debriefingId, createdAt: debriefingPayloads.createdAt, payload: debriefingPayloads.payload })
    .from(debriefingPayloads)
    .where(
      and(
        eq(debriefingPayloads.tipo, "lancamento"),
        eq(debriefingPayloads.versao, DEBRIEFING_PAYLOAD_VERSAO),
        sql`${debriefingPayloads.payload} -> 'config' ->> 'funnelId' = ${funnelId}`,
        sql`${debriefingPayloads.payload} -> 'config' ->> 'projectId' = ${projectId}`,
      ),
    )
    .orderBy(desc(debriefingPayloads.createdAt))
    .limit(1);
  if (!row) return null;
  const salvoEm = row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(String(row.createdAt)).toISOString();
  return { debriefingId: row.debriefingId, salvoEm, payload: row.payload as unknown as DebriefingPayload };
}

/** Loaders + motores (49.3/49.4) + composição (49.5) — a mesma sequência do `debriefing-conferir.ts`. */
export async function calcularPayloadDebriefing(
  db: Database,
  config: DebriefingConfigLancamento,
  geradoEm: Date,
): Promise<DebriefingPayload> {
  const mtIn = await loadDebriefingMoneyTimeInput(db, { config });
  const mt = computeDebriefingMoneyTime({ ...mtIn, criterioDeUnico: CRITERIO_DE_UNICO_HEADLINE, maxD: MAXD_PADRAO });
  const auIn = await loadDebriefingAudienceInput(db, { config }, { entradaMoneyTime: mtIn });
  const au = computeDebriefingAudience(auIn);
  return montarPayloadDebriefing(mt, au, config, geradoEm);
}

/**
 * HTML em `debriefings` + payload em `debriefing_payloads`, na MESMA transação
 * (AC2): ou os dois, ou nenhum.
 *
 * Story 49.12 (AC10, R8-4): se a etapa (`payload.config.stageId`) tem uma
 * PARCIAL, a geração — outra parcial ou o final — ATUALIZA esse mesmo
 * debriefing (HTML, título, `updatedAt`/`updatedBy`, payload); os comentários
 * ficam. Sem parcial, insere (o final nunca é sobrescrito: só a linha com
 * `parcial = true` é procurada). A parcial é travada (`FOR UPDATE`) dentro da
 * transação; duas primeiras parciais simultâneas esbarram no índice único
 * parcial e a perdedora refaz a transação — e encontra a parcial para atualizar.
 */
export async function gravarDebriefingGerado(db: Database, r: RegistroDoDebriefing): Promise<{ id: string; substituiuParcial: boolean }> {
  try {
    return await gravarNumaTransacao(db, r);
  } catch (err) {
    if (r.parcial && violaUnicidade(err, "uq_debriefing_payloads_parcial_por_etapa")) return gravarNumaTransacao(db, r);
    throw err;
  }
}

async function gravarNumaTransacao(db: Database, r: RegistroDoDebriefing): Promise<{ id: string; substituiuParcial: boolean }> {
  return db.transaction(async (tx) => {
    const dados = {
      tipo: r.payload.tipo,
      versao: r.payload.versao,
      payload: r.payload as unknown as Record<string, unknown>,
      comparacao: r.comparacao as unknown as Record<string, unknown> | null,
      alertas: r.alertas,
      impostoOrigem: r.payload.dinheiroTempo.imposto.impostoOrigem,
      parcial: r.parcial === true,
    };
    const [parcial] = await tx
      .select({ id: debriefingPayloads.debriefingId })
      .from(debriefingPayloads)
      .where(and(eq(debriefingPayloads.stageIdOrigem, r.payload.config.stageId), eq(debriefingPayloads.parcial, true)))
      .limit(1)
      .for("update");
    if (parcial) {
      const agora = new Date();
      await tx
        .update(debriefings)
        .set({ campaignName: r.campaignName, html: r.html, updatedBy: r.createdBy, updatedAt: agora })
        .where(eq(debriefings.id, parcial.id));
      // `created_at` do payload = quando ESTE payload foi gerado (o "último salvo" da comparação ordena por ele).
      await tx.update(debriefingPayloads).set({ ...dados, createdAt: agora }).where(eq(debriefingPayloads.debriefingId, parcial.id));
      return { id: parcial.id, substituiuParcial: true };
    }
    const [salvo] = await tx
      .insert(debriefings)
      .values({ campaignName: r.campaignName, stageId: r.stageId, html: r.html, fileName: null, createdBy: r.createdBy })
      .returning({ id: debriefings.id });
    await tx.insert(debriefingPayloads).values({ debriefingId: salvo!.id, stageIdOrigem: r.payload.config.stageId, ...dados });
    return { id: salvo!.id, substituiuParcial: false };
  });
}

/**
 * Story 49.12 (AC15) — as contas de anúncio do lançamento e o estado do sync
 * delas. Conta = a das etapas do lançamento (`funnel_stages.meta_account_id`)
 * e a do funil (`funnels.meta_account_id`); sem nenhuma, as contas ativas do
 * projeto (as que o sync percorre).
 */
export async function lerEstadoDoSyncDaMidia(db: Database, config: DebriefingConfigLancamento): Promise<EstadoDoSyncDaConta[]> {
  const ids = config.etapas.map((e) => e.stageId);
  const [dasEtapas, doFunil] = await Promise.all([
    ids.length
      ? db
          .select({ accountId: metaAdsAccounts.metaAccountId, nome: metaAdsAccounts.accountName })
          .from(funnelStages)
          .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, funnelStages.metaAccountId))
          .where(inArray(funnelStages.id, ids))
      : Promise.resolve([] as { accountId: string; nome: string }[]),
    db
      .select({ accountId: metaAdsAccounts.metaAccountId, nome: metaAdsAccounts.accountName })
      .from(funnels)
      .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, funnels.metaAccountId))
      .where(eq(funnels.id, config.funnelId)),
  ]);
  // REL-002: as contas vinculadas ao projeto (as únicas que o sync percorre).
  const vinculadas = new Set(
    (
      await db
        .select({ accountId: metaAdsAccounts.metaAccountId })
        .from(metaAdsAccountProjects)
        .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, metaAdsAccountProjects.accountId))
        .where(eq(metaAdsAccountProjects.projectId, config.projectId))
    ).map((c) => c.accountId),
  );
  let contas = [...dasEtapas, ...doFunil];
  if (contas.length === 0) {
    contas = await db
      .select({ accountId: metaAdsAccounts.metaAccountId, nome: metaAdsAccounts.accountName })
      .from(metaAdsAccountProjects)
      .innerJoin(metaAdsAccounts, eq(metaAdsAccounts.id, metaAdsAccountProjects.accountId))
      .where(and(eq(metaAdsAccountProjects.projectId, config.projectId), eq(metaAdsAccounts.isActive, true)));
  }
  const unicas = [...new Map(contas.map((c) => [c.accountId, c])).values()];
  if (unicas.length === 0) return [];
  const estados = await db
    .select({ accountId: metaSyncState.accountId, kind: metaSyncState.kind, lastRunAt: metaSyncState.lastRunAt, lastSuccessAt: metaSyncState.lastSuccessAt })
    .from(metaSyncState)
    .where(
      and(
        eq(metaSyncState.projectId, config.projectId),
        inArray(metaSyncState.accountId, unicas.map((c) => c.accountId)),
        inArray(metaSyncState.kind, ["ad-daily", "campaign-daily"]),
      ),
    );
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return unicas
    .map((c) => {
      const ad = estados.find((e) => e.accountId === c.accountId && e.kind === "ad-daily");
      const camp = estados.find((e) => e.accountId === c.accountId && e.kind === "campaign-daily");
      return {
        accountId: c.accountId,
        nome: c.nome,
        adDaily: ad ? { lastSuccessAt: iso(ad.lastSuccessAt) } : null,
        campaignDaily: camp ? { lastRunAt: iso(camp.lastRunAt), lastSuccessAt: iso(camp.lastSuccessAt) } : null,
        vinculadaAoProjeto: vinculadas.has(c.accountId),
      };
    })
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}
