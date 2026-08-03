/**
 * Story 41.1 — Config do gerador de Resumão/Comparativo + gate de escopo.
 *
 * A spec do gerador foi validada casa a casa para UMA combinação: lançamento
 * PAGO, etapa `vendas-captacao` (DG-PG02-ABR26 e DG-PG04-JUL26). Gratuito,
 * perpétuo e as demais etapas têm métricas DIFERENTES — não é questão de valor,
 * é questão de quais métricas existem (gratuito não tem ROAS nem ticket, por
 * exemplo). Rodar o gerador nelas devolveria número com cara de confiável.
 *
 * Por isso o gate mora AQUI DENTRO, no carregador: não existe caminho que
 * obtenha a config sem passar por `assertReportScope`. Quem quiser a config crua
 * (a UI, que precisa mostrar o estado bloqueado) usa `loadReportConfigRaw`.
 */

import { eq } from "drizzle-orm";
import { META_TAX_RATE } from "../utils/meta-tax.js";
import {
  launchReportConfigs,
  expertReportConfigs,
  funnelStages,
  funnels,
  projects,
  type LaunchReportTipo,
  type LaunchReportEtapa,
  type LaunchReportEntidade,
  type SurveyCanonicalField,
} from "../db/schema.js";
import type { Database } from "../db/client.js";

/** Combinação para a qual a spec foi validada (§12.1). */
export const SCOPE_VALIDADO = { tipo: "pago", etapa: "vendas-captacao" } as const;

export interface LaunchReportConfig {
  stageId: string;
  projectId: string;
  projectName: string;
  stageName: string;
  tipo: LaunchReportTipo;
  etapa: LaunchReportEtapa;
  entidadeCaptura: LaunchReportEntidade;
  dataInicio: string | null;
  dataFim: string | null;
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
  /** Alíquota efetiva já resolvida (stage → projeto → default). */
  impostoPct: number;
  /** De onde veio a alíquota — a UI mostra e o memorial do Resumão cita. */
  impostoOrigem: ImpostoOrigem;
  camposPesquisa: Partial<Record<SurveyCanonicalField, string>>;
}

export type ImpostoOrigem = "stage" | "project" | "default";

export interface ImpostoResolvido {
  valor: number;
  origem: ImpostoOrigem;
}

/**
 * Resolve a alíquota efetiva na ordem override do stage → override do projeto →
 * constante global. Devolve TAMBÉM a procedência: sem isso, um override digitado
 * errado passa despercebido no relatório.
 */
export function resolveImpostoPct(
  stageOverride: string | number | null | undefined,
  projectOverride: string | number | null | undefined,
): ImpostoResolvido {
  const stageVal = toFiniteNumber(stageOverride);
  if (stageVal !== null) return { valor: stageVal, origem: "stage" };
  const projectVal = toFiniteNumber(projectOverride);
  if (projectVal !== null) return { valor: projectVal, origem: "project" };
  return { valor: META_TAX_RATE, origem: "default" };
}

/** `numeric` do Postgres chega como string no driver — e "" / NaN não são override. */
function toFiniteNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Erro de escopo — o caller traduz em 422 com o corpo do §12.2. */
export class ReportScopeError extends Error {
  readonly erro = "COMBINACAO_NAO_VALIDADA";
  readonly detalhe: string;
  readonly acao: string;

  constructor(detalhe: string) {
    super(detalhe);
    this.name = "ReportScopeError";
    this.detalhe = detalhe;
    this.acao =
      "Preencher a configuração e rodar conferência manual contra o painel antes de liberar este botão";
  }

  toResponse() {
    return { erro: this.erro, detalhe: this.detalhe, acao: this.acao };
  }
}

/**
 * Gate do §12.2. Passa quando a combinação é a validada OU quando o time marcou
 * `validado = true` explicitamente (assumindo a conferência). Qualquer outro
 * caso lança — nunca devolve número como se fosse confiável.
 */
export function assertReportScope(cfg: LaunchReportConfig): void {
  if (cfg.validado) return;
  if (cfg.tipo === SCOPE_VALIDADO.tipo && cfg.etapa === SCOPE_VALIDADO.etapa) return;

  throw new ReportScopeError(
    `expert=${cfg.projectName} tipo=${cfg.tipo} etapa=${cfg.etapa} — ` +
      `a spec foi validada para ${SCOPE_VALIDADO.tipo}/${SCOPE_VALIDADO.etapa}`,
  );
}

/**
 * Carrega a config CRUA (sem gate). Uso exclusivo da UI de configuração, que
 * precisa renderizar justamente o estado bloqueado. Geradores usam
 * `loadReportConfig`.
 */
export async function loadReportConfigRaw(
  db: Database,
  stageId: string,
): Promise<LaunchReportConfig | null> {
  const [row] = await db
    .select({
      cfg: launchReportConfigs,
      projectId: funnels.projectId,
      projectName: projects.name,
      stageName: funnelStages.name,
      expertImposto: expertReportConfigs.impostoPct,
      expertCampos: expertReportConfigs.camposPesquisa,
    })
    .from(launchReportConfigs)
    .innerJoin(funnelStages, eq(funnelStages.id, launchReportConfigs.stageId))
    .innerJoin(funnels, eq(funnels.id, funnelStages.funnelId))
    .innerJoin(projects, eq(projects.id, funnels.projectId))
    .leftJoin(expertReportConfigs, eq(expertReportConfigs.projectId, funnels.projectId))
    .where(eq(launchReportConfigs.stageId, stageId))
    .limit(1);

  if (!row) return null;

  const imposto = resolveImpostoPct(row.cfg.impostoPct, row.expertImposto);
  return {
    stageId: row.cfg.stageId,
    projectId: row.projectId,
    projectName: row.projectName,
    stageName: row.stageName,
    tipo: row.cfg.tipo,
    etapa: row.cfg.etapa,
    entidadeCaptura: row.cfg.entidadeCaptura,
    dataInicio: row.cfg.dataInicio,
    dataFim: row.cfg.dataFim,
    validado: row.cfg.validado,
    validadoEm: row.cfg.validadoEm,
    validadoPor: row.cfg.validadoPor,
    impostoPct: imposto.valor,
    impostoOrigem: imposto.origem,
    camposPesquisa: row.expertCampos ?? {},
  };
}

/**
 * Carrega a config JÁ validada pelo gate. É a única porta para os geradores
 * (41.5/41.6): ou devolve config liberada, ou lança `ReportScopeError`.
 *
 * Etapa sem config cadastrada também bloqueia — não assumir default é o ponto
 * inteiro do §12.2.
 */
export async function loadReportConfig(
  db: Database,
  stageId: string,
): Promise<LaunchReportConfig> {
  const cfg = await loadReportConfigRaw(db, stageId);
  if (!cfg) {
    throw new ReportScopeError(
      `stage=${stageId} não tem configuração de relatório cadastrada — ` +
        `sem config não há como afirmar tipo/etapa/entidade de captura`,
    );
  }
  assertReportScope(cfg);
  return cfg;
}
