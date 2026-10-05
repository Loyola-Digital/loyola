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
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { debriefingPayloads, debriefings, funnelStages, funnels, projects } from "../db/schema.js";
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
import { DEBRIEFING_PAYLOAD_VERSAO, montarPayloadDebriefing, type DebriefingPayload } from "./debriefing-payload.js";
import { validateDebriefing, type AlertaFase12 } from "./debriefing-guards.js";
import { renderDebriefing, type ComparacaoDoDebriefing, type OrigemDaComparacao } from "./debriefing-render.js";
import { diaMesBr } from "./launch-report-narrative.js";

/** Mesmo teto de `routes/debriefings.ts:17` e de `launch-reports.ts:47`. */
export const MAX_HTML_BYTES_DEBRIEFING = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Erros próprios da geração (o resto vem tipado dos loaders/gate/guardas)
// ---------------------------------------------------------------------------

export type CodigoErroDaGeracao = "ETAPA_NAO_E_DEBRIEFING" | "COMPARACAO_SEM_CONFIG";

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
  createdBy: string;
  payload: DebriefingPayload;
  comparacao: { funnelId: string; nome: string; payload: DebriefingPayload; origem: OrigemDaComparacao } | null;
  alertas: AlertaFase12[];
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
  /** Persistência (HTML + payload) numa transação. */
  gravar(registro: RegistroDoDebriefing): Promise<{ id: string }>;
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
  | { status: 200; body: { id: string; html: string; payload: DebriefingPayload; alertas: AlertaFase12[] } }
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

    // 4 — carga + motores + composição (atual e, havendo, a comparação principal)
    // A config da comparação é conferida ANTES da carga pesada: sem ela, falha cedo.
    const comparacaoId = config.lancamentoComparacaoFunnelId;
    const fonteComparacao = comparacaoId ? await fonteDaComparacao(deps, etapa.projectId, comparacaoId) : null;
    const geradoEm = deps.agora();
    const payload = await deps.calcularPayload(config, geradoEm);

    const nomes = await deps.nomes(etapa.projectId, [etapa.funnelId, ...(comparacaoId ? [comparacaoId] : [])]);
    let comparacao: ComparacaoDoDebriefing | null = null;
    if (comparacaoId && fonteComparacao) {
      const nome = nomes.funis[comparacaoId] ?? comparacaoId;
      comparacao =
        fonteComparacao.tipo === "config"
          ? { funnelId: comparacaoId, nome, payload: await deps.calcularPayload(fonteComparacao.config, geradoEm), origem: { tipo: "recalculada" } }
          : {
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
    });
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES_DEBRIEFING) {
      return { status: 413, body: { error: "HTML acima de 5MB", code: "PAYLOAD_TOO_LARGE" } };
    }

    // 7 — persiste (só aqui)
    const j = payload.dinheiroTempo.janela;
    const campaignName =
      `Debriefing ${etapa.projectName} ${etapa.funnelName}${comparacao ? ` × ${comparacao.nome}` : ""} — ` +
      `${diaMesBr(j.inicio)} a ${diaMesBr(j.fim)}`;
    const { id } = await deps.gravar({
      campaignName: campaignName.slice(0, 300),
      stageId: params.stageId,
      html,
      createdBy: params.userId,
      payload,
      comparacao: comparacao
        ? { funnelId: comparacao.funnelId, nome: comparacao.nome, payload: comparacao.payload, origem: comparacao.origem }
        : null,
      alertas: guardas.alertas,
    });
    return { status: 200, body: { id, html, payload, alertas: guardas.alertas } };
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
  if (liberadas.length === 1) return { tipo: "config", config: liberadas[0]! };
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
  if (salvo) return { tipo: "payload-salvo", salvo, motivo: semConfig };
  throw new DebriefingGeracaoError(
    "COMPARACAO_SEM_CONFIG",
    `o lançamento de comparação (${funnelId}) não tem como entrar no Δ: ${semConfig}, e nenhum debriefing dele foi gerado e salvo pelo Loyola — sem config não há datas-chave nem etapas para recalcular, e sem payload salvo não há números para comparar`,
    "Configurar (e validar) o debriefing na etapa Debriefing do lançamento de comparação — ou tirar a comparação do formulário para gerar como edição única",
  );
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
 */
export async function gravarDebriefingGerado(db: Database, r: RegistroDoDebriefing): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [salvo] = await tx
      .insert(debriefings)
      .values({ campaignName: r.campaignName, stageId: r.stageId, html: r.html, fileName: null, createdBy: r.createdBy })
      .returning({ id: debriefings.id });
    await tx.insert(debriefingPayloads).values({
      debriefingId: salvo!.id,
      tipo: r.payload.tipo,
      versao: r.payload.versao,
      stageIdOrigem: r.payload.config.stageId,
      payload: r.payload as unknown as Record<string, unknown>,
      comparacao: r.comparacao as unknown as Record<string, unknown> | null,
      alertas: r.alertas,
      impostoOrigem: r.payload.dinheiroTempo.imposto.impostoOrigem,
    });
    return { id: salvo!.id };
  });
}
