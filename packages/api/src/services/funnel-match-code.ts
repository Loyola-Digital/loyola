/**
 * O código do funil que as campanhas Meta têm no nome (`matchCode` efetivo).
 *
 * Regra única (QA 49.17 fatia C, MNT-001): o `match_code` cadastrado no funil,
 * aparado e em minúsculas; sem ele, o nome INTEIRO do funil, aparado e em
 * minúsculas; `null` sem nenhum dos dois. O casamento com a campanha é por
 * substring (`findMatchingCampaignsForStage`, `services/stage-phase.ts`).
 *
 * Usada nas campanhas órfãs (`routes/funnels.ts`), no auto-preenchimento das
 * campanhas da etapa (`routes/funnel-stages.ts`) e no código do lançamento do
 * Debriefing (`debriefing-money-time-loader.ts`, Story 49.17 fatia C).
 *
 * NÃO é a regra de `tokenDoFunil` (`services/sendflow-casamento.ts`, 2 primeiros
 * segmentos do nome) nem a de `funnelMatchToken` (Mautic e campaign-log): trocar
 * uma pela outra muda quais campanhas casam com o funil.
 *
 * Módulo folha (sem I/O), para o loader do Debriefing não puxar a Meta API.
 */

export interface FunilComCodigo {
  name: string | null;
  matchCode: string | null;
}

export interface MatchCodeDoFunil {
  /** Minúsculo, aparado (ex.: `dg-pg05`). */
  codigo: string;
  /** `match_code` = o código cadastrado no funil; `nome-do-funil` = o nome do funil (sem código cadastrado). */
  origem: "match_code" | "nome-do-funil";
}

/** O código efetivo e de onde ele veio. `null` = sem `match_code` e sem nome. Pura. */
export function matchCodeDoFunil(funnel: FunilComCodigo): MatchCodeDoFunil | null {
  const override = (funnel.matchCode ?? "").trim().toLowerCase();
  if (override.length > 0) return { codigo: override, origem: "match_code" };
  const fallback = (funnel.name ?? "").trim().toLowerCase();
  return fallback.length > 0 ? { codigo: fallback, origem: "nome-do-funil" } : null;
}

/** O código efetivo do funil (`match_code` ou o nome inteiro), ou `null`. Pura. */
export function effectiveMatchCode(funnel: FunilComCodigo): string | null {
  return matchCodeDoFunil(funnel)?.codigo ?? null;
}
