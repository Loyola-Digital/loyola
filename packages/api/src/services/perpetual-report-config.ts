/**
 * Story 41.7 — Config do relatório de funil perpétuo + gate (complemento §C.2, §C.8).
 *
 * Mesmo princípio da 41.1: o gate mora AQUI DENTRO, no carregador. Não existe
 * caminho que obtenha a config sem passar por `assertPerpetualScope`. Quem
 * precisa da config crua (a UI, que renderiza justamente o estado bloqueado)
 * usa `loadPerpetualReportConfigRaw`.
 *
 * ⚠️ Diferença deliberada em relação à 41.1: lá, `assertReportScope` libera sem
 * `validado` quando a combinação é a pré-validada (pago/vendas-captacao, §12.1).
 * Aqui NÃO existe equivalente — nenhuma combinação perpétua foi conferida casa
 * a casa pela spec. Só `validado = true` libera. (Nota @po, 2026-07-28.)
 */

import { eq } from "drizzle-orm";
import { META_TAX_RATE } from "../utils/meta-tax.js";
import { ReportScopeError } from "./launch-report-config.js";
import {
  perpetualReportConfigs,
  funnels,
  funnelStages,
  projects,
  metaAdsAccountProjects,
} from "../db/schema.js";
import type { Database } from "../db/client.js";

export { ReportScopeError };

export interface PerpetualReportConfig {
  funnelId: string;
  funnelName: string;
  projectId: string;
  projectName: string;
  /** Conta Meta vem do funil (`funnels.metaAccountId`), não da config. */
  metaAccountId: string | null;
  /** Campanhas vinculadas ao funil — a FONTE das campanhas do relatório (§C.3.1). */
  campanhas: { id: string; name: string }[];
  /** Auxiliar de descoberta: aponta campanha que casa e não foi vinculada. Não é fonte. */
  prefixoCampanha: string | null;
  produto: string | null;
  produtosOrderBump: string[];
  temSplitFormato: boolean;
  origensPagas: string[];
  inicioTrafego: string | null;
  validado: boolean;
  validadoEm: Date | null;
  validadoPor: string | null;
  /**
   * Story 29.35 — inputs do CAC alvo (`reverse_calculation` do protocolo).
   *
   * `null` significa NÃO PREENCHIDO, e o CAC alvo sai como indisponível com o
   * campo nomeado. Não existe default: um valor plausível aqui produziria um
   * teto de mídia inventado, que é o erro mais caro que este cálculo pode
   * cometer (GR-01.a).
   */
  margemDesejadaPct: number | null;
  /** CMV por unidade, em reais. */
  cmv: number | null;
  /** Parcela fixa do gateway, em R$/transação. */
  gatewayFixo: number | null;
  /** Gross-up de mídia já resolvido (override do funil → META_TAX_RATE). */
  impostoPct: number;
  impostoOrigem: RateOrigem;
  /** Overrides crus das taxas de receita — resolvidos por `resolvePerpetualRates`. */
  taxaPlataformaPct: number | null;
  taxaImpostoPct: number | null;
  taxaOutrosPct: number | null;
}

export type RateOrigem = "config" | "default";

// ------------------------------------------------------------------
// Taxas da receita (§C.3.4)
// ------------------------------------------------------------------
// A spec fixa 83,01% de receita líquida (4,99 + 11 + 1). Isso é verdade para
// UM ramo: Kiwify com coluna de status na planilha, que é onde caem os 3 funis
// de conferência da §C.10. O código já tratava os dois ramos desde a 29.7:
//
//   sem coluna de status → 4% de reembolso ESTIMADO entram na conta (79,01%)
//   com coluna de status → reembolso é medido e já saiu do bruto (83,01%)
//
// e Hotmart cobra 10% de marketplace, não 4,99%. Fixar a constante da spec
// quebraria os dois casos. (Decisão do usuário, 2026-07-28.)

/** Composição default por plataforma. Soma == `PLATFORM_FEE_RATES` da 29.7. */
export const PLATFORM_RATE_BREAKDOWN: Record<
  string,
  { plataforma: number; imposto: number; outros: number; reembolso: number }
> = {
  kiwify: { plataforma: 0.0499, imposto: 0.11, outros: 0.01, reembolso: 0.04 },
  hotmart: { plataforma: 0.1, imposto: 0.11, outros: 0.01, reembolso: 0.04 },
  other: { plataforma: 0, imposto: 0, outros: 0, reembolso: 0 },
};

export interface PerpetualRates {
  plataforma: number;
  imposto: number;
  outros: number;
  /** 0 quando a planilha tem status real — o reembolso já saiu do bruto. */
  reembolso: number;
  /** Fração do bruto que sobra. Kiwify + status real == 0.8301 (§C.3.4). */
  receitaLiquidaPct: number;
  fonte: {
    plataforma: RateOrigem;
    imposto: RateOrigem;
    outros: RateOrigem;
  };
}

/**
 * Resolve as taxas efetivas com procedência. Sem override na config, replica
 * `effectivePlatformFeeRate` (`routes/perpetual-sales-data.ts`): a soma bate com
 * `PLATFORM_FEE_RATES` (kiwify 20,99% / hotmart 26%), menos os 4% de reembolso
 * quando `hasStatusCol` é true.
 *
 * A procedência não é enfeite: um override digitado errado passa despercebido
 * no relatório se ninguém disser de onde o número veio (R2 da story).
 */
export function resolvePerpetualRates(
  config: Pick<
    PerpetualReportConfig,
    "taxaPlataformaPct" | "taxaImpostoPct" | "taxaOutrosPct"
  > | null,
  platform: string | null | undefined,
  hasStatusCol: boolean,
): PerpetualRates {
  const base = PLATFORM_RATE_BREAKDOWN[platform ?? ""] ?? PLATFORM_RATE_BREAKDOWN.other;

  const pick = (override: number | null | undefined, fallback: number) =>
    override !== null && override !== undefined && Number.isFinite(override)
      ? { valor: override, origem: "config" as RateOrigem }
      : { valor: fallback, origem: "default" as RateOrigem };

  const plataforma = pick(config?.taxaPlataformaPct, base.plataforma);
  const imposto = pick(config?.taxaImpostoPct, base.imposto);
  const outros = pick(config?.taxaOutrosPct, base.outros);
  // Reembolso não é configurável: ou é medido na planilha, ou é a estimativa da
  // plataforma. Uma terceira fonte só criaria desencontro com o dashboard.
  const reembolso = hasStatusCol ? 0 : base.reembolso;

  const total = plataforma.valor + imposto.valor + outros.valor + reembolso;

  return {
    plataforma: plataforma.valor,
    imposto: imposto.valor,
    outros: outros.valor,
    reembolso,
    receitaLiquidaPct: round4(1 - total),
    fonte: {
      plataforma: plataforma.origem,
      imposto: imposto.origem,
      outros: outros.origem,
    },
  };
}

/** Evita 0.8300999999999999 virar o número que a invariante P5 compara. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** `numeric` do Postgres chega como string no driver — "" e NaN não são override. */
function toFiniteNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Gate do §C.8. Só `validado = true` libera — sem bypass de combinação. */
export function assertPerpetualScope(cfg: PerpetualReportConfig): void {
  if (cfg.validado) return;
  throw new ReportScopeError(
    `funil=${cfg.funnelName} (expert=${cfg.projectName}) não foi marcado como ` +
      `validado — o checklist §C.11 precisa ser conferido contra o painel antes ` +
      `de liberar o relatório`,
  );
}

/**
 * Carrega a config CRUA (sem gate). Uso exclusivo da UI de configuração.
 * Geradores usam `loadPerpetualReportConfig`.
 */
export async function loadPerpetualReportConfigRaw(
  db: Database,
  funnelId: string,
): Promise<PerpetualReportConfig | null> {
  const [row] = await db
    .select({
      cfg: perpetualReportConfigs,
      funnelName: funnels.name,
      funnelType: funnels.type,
      metaAccountId: funnels.metaAccountId,
      campanhas: funnels.campaigns,
      projectId: funnels.projectId,
      projectName: projects.name,
    })
    .from(perpetualReportConfigs)
    .innerJoin(funnels, eq(funnels.id, perpetualReportConfigs.funnelId))
    .innerJoin(projects, eq(projects.id, funnels.projectId))
    .where(eq(perpetualReportConfigs.funnelId, funnelId))
    .limit(1);

  if (!row) return null;

  // ⚠️ As campanhas de um funil perpétuo NÃO vivem só em `funnels.campaigns`.
  // A página da etapa monta `stageAsFunnel` sobrescrevendo `campaigns` com as do
  // stage (`page.tsx:156-164`), e no banco a maioria dos perpétuos tem o vínculo
  // no STAGE, não no funil (conferido em 2026-07-28: 3 de 4 funis com
  // `funnels.campaigns` vazio e o stage preenchido). Ler só o funil devolveria
  // zero campanhas — e o relatório sairia com investimento zero, calado.
  // Por isso a fonte é a UNIÃO das duas, deduplicada por ID.
  const stages = await db
    .select({ campaigns: funnelStages.campaigns, metaAccountId: funnelStages.metaAccountId })
    .from(funnelStages)
    .where(eq(funnelStages.funnelId, funnelId));

  const campanhasPorId = new Map<string, { id: string; name: string }>();
  for (const c of row.campanhas ?? []) campanhasPorId.set(c.id, c);
  for (const s of stages) {
    for (const c of s.campaigns ?? []) if (!campanhasPorId.has(c.id)) campanhasPorId.set(c.id, c);
  }

  // Conta Meta: funil → stage → vínculo do projeto. Nos perpétuos reais os dois
  // primeiros estão nulos e a conta vem de `meta_ads_account_projects`.
  let metaAccountId = row.metaAccountId ?? stages.find((s) => s.metaAccountId)?.metaAccountId ?? null;
  if (!metaAccountId) {
    const [vinculo] = await db
      .select({ accountId: metaAdsAccountProjects.accountId })
      .from(metaAdsAccountProjects)
      .where(eq(metaAdsAccountProjects.projectId, row.projectId))
      .limit(1);
    metaAccountId = vinculo?.accountId ?? null;
  }

  const impostoOverride = toFiniteNumber(row.cfg.impostoPct);
  return {
    funnelId: row.cfg.funnelId,
    funnelName: row.funnelName,
    projectId: row.projectId,
    projectName: row.projectName,
    metaAccountId,
    campanhas: [...campanhasPorId.values()],
    prefixoCampanha: row.cfg.prefixoCampanha,
    produto: row.cfg.produto,
    produtosOrderBump: row.cfg.produtosOrderBump ?? [],
    temSplitFormato: row.cfg.temSplitFormato,
    origensPagas: row.cfg.origensPagas ?? [],
    inicioTrafego: row.cfg.inicioTrafego,
    validado: row.cfg.validado,
    validadoEm: row.cfg.validadoEm,
    validadoPor: row.cfg.validadoPor,
    impostoPct: impostoOverride ?? META_TAX_RATE,
    impostoOrigem: impostoOverride !== null ? "config" : "default",
    taxaPlataformaPct: toFiniteNumber(row.cfg.taxaPlataformaPct),
    taxaImpostoPct: toFiniteNumber(row.cfg.taxaImpostoPct),
    taxaOutrosPct: toFiniteNumber(row.cfg.taxaOutrosPct),
    // Story 29.35 — inputs do CAC alvo. `toFiniteNumber` devolve null quando
    // a coluna está vazia, e é assim que o cálculo sabe que falta dado em vez
    // de assumir zero (que seria um teto de mídia inventado).
    margemDesejadaPct: toFiniteNumber(row.cfg.margemDesejadaPct),
    cmv: toFiniteNumber(row.cfg.cmv),
    gatewayFixo: toFiniteNumber(row.cfg.gatewayFixo),
  };
}

/**
 * Carrega a config JÁ liberada pelo gate. É a única porta para o motor (41.8):
 * ou devolve config validada, ou lança `ReportScopeError`.
 *
 * Funil sem config cadastrada também bloqueia — não assumir default é o ponto
 * inteiro do §C.8.
 */
export async function loadPerpetualReportConfig(
  db: Database,
  funnelId: string,
): Promise<PerpetualReportConfig> {
  const cfg = await loadPerpetualReportConfigRaw(db, funnelId);
  if (!cfg) {
    throw new ReportScopeError(
      `funil=${funnelId} não tem configuração de relatório perpétuo cadastrada — ` +
        `sem config não há como afirmar origens pagas, taxas nem split de formato`,
    );
  }
  assertPerpetualScope(cfg);
  return cfg;
}

/**
 * Campanhas que casam com o prefixo e NÃO estão vinculadas ao funil (§C.3.1).
 * É o detector de coleta incompleta: a fonte das campanhas é `funnels.campaigns`,
 * o prefixo só aponta o que ficou de fora. Devolve vazio sem prefixo configurado.
 */
export function findUnlinkedCampaigns(
  cfg: Pick<PerpetualReportConfig, "prefixoCampanha" | "campanhas">,
  campanhasDaConta: { id: string; name: string }[],
): { id: string; name: string }[] {
  const prefixo = cfg.prefixoCampanha?.trim().toLowerCase();
  if (!prefixo) return [];
  const vinculadas = new Set(cfg.campanhas.map((c) => c.id));
  return campanhasDaConta.filter(
    (c) => !vinculadas.has(c.id) && c.name.toLowerCase().includes(prefixo),
  );
}
