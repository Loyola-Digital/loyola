/**
 * O código do funil que as campanhas Meta têm no nome (`matchCode` efetivo).
 *
 * Regra única (QA 49.17 fatia C, MNT-001): o `match_code` cadastrado no funil,
 * aparado e em minúsculas; sem ele, o nome INTEIRO do funil, aparado e em
 * minúsculas; `null` sem nenhum dos dois. O casamento com a campanha é por
 * substring (`findMatchingCampaignsForStage`, `services/stage-phase.ts`).
 *
 * Usada nas campanhas órfãs (`routes/funnels.ts`), no auto-preenchimento das
 * campanhas da etapa (`routes/funnel-stages.ts`), no código do lançamento do
 * Debriefing (`debriefing-money-time-loader.ts`, Story 49.17 fatia C) e no
 * casamento por nome do log automático de atividades da Meta
 * (`codigosDosFunis`, `services/meta-activity-log-sync.ts`, Story 49.23).
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

// ============================================================
// O código da ETAPA (migration 0169)
// ============================================================

export interface EtapaComCodigo {
  matchCode: string | null;
}

export interface ChaveDaEtapa {
  /** Minúsculo, aparado. `null` = não há como casar; o caller não auto-popula. */
  codigo: string | null;
  /**
   * Segundo termo exigido no nome da campanha. `null` = só o `codigo` basta.
   *
   * Existe porque o código do FUNIL casa a campanha do funil inteiro: sem um
   * segundo termo, toda etapa receberia toda campanha do lançamento.
   */
  sufixo: string | null;
  /** De onde veio a chave — o aviso na tela diz isso para quem configurou. */
  origem: "etapa" | "funil-com-fase" | "nenhuma";
}

/**
 * A chave com que uma etapa encontra as campanhas dela.
 *
 * Duas regras, nesta ordem:
 *
 * 1. **Código da etapa preenchido** → é a chave completa, `sufixo: null`. Quem
 *    digitou `fz-a1` disse exatamente o que quer; adivinhar um sufixo em cima
 *    disso só tiraria campanha que o usuário pediu.
 * 2. **Vazio** → o de sempre: código do funil + sufixo de fase. Intacto, para
 *    as centenas de etapas que já existem não mudarem de comportamento.
 *
 * `codigo: null` só acontece quando o funil não tem código nem nome, ou quando
 * a etapa não tem código e a heurística de fase não se aplica (perpétuo, `cpl`,
 * `event`, nome ambíguo) — que é precisamente o caso que o campo novo resolve.
 *
 * Pura e sem I/O: é ela que decide quem casa, então precisa ser testável sem
 * subir a Meta API.
 */
export function codigoDaEtapa(
  funnel: FunilComCodigo,
  etapa: EtapaComCodigo,
  /** O que `resolveStagePhaseSuffix` devolveu. `null` = heurística não se aplica. */
  sufixoDeFase: string | null,
): ChaveDaEtapa {
  const daEtapa = (etapa.matchCode ?? "").trim().toLowerCase();
  if (daEtapa.length > 0) return { codigo: daEtapa, sufixo: null, origem: "etapa" };

  const doFunil = effectiveMatchCode(funnel);
  if (!doFunil || !sufixoDeFase) return { codigo: null, sufixo: null, origem: "nenhuma" };
  return { codigo: doFunil, sufixo: sufixoDeFase.toLowerCase(), origem: "funil-com-fase" };
}

/** A campanha casa com a chave? Substring, minúsculas, os dois termos. Pura. */
export function campanhaCasaComAEtapa(nomeDaCampanha: string, chave: ChaveDaEtapa): boolean {
  if (!chave.codigo) return false;
  const nome = nomeDaCampanha.toLowerCase();
  if (!nome.includes(chave.codigo)) return false;
  return chave.sufixo ? nome.includes(chave.sufixo) : true;
}
