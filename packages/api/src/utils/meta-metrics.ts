/**
 * Extração de métricas dos arrays `actions` / `action_values` do Meta Ads.
 *
 * Lógica espelhada de `services/traffic-analytics.ts` (mesma fonte da verdade do
 * dashboard interno) para a API pública (Story 36.3) retornar números que batem
 * com o dashboard. Funções puras — sem dependência de DB/rede.
 */

export type MetaAction = { action_type: string; value: string };

export function parseActionCount(
  actions: MetaAction[] | undefined | null,
  type: string
): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === type);
  return action ? parseInt(action.value, 10) || 0 : 0;
}

export function parseActionFloat(
  values: MetaAction[] | undefined | null,
  type: string
): number {
  if (!values) return 0;
  const action = values.find((a) => a.action_type === type);
  return action ? parseFloat(action.value) || 0 : 0;
}

/** Leads — usa SOMENTE `lead` (leadgen_grouped / onsite_conversion.lead_grouped são duplicados). */
export function parseLeads(actions?: MetaAction[] | null): number {
  return parseActionCount(actions, "lead");
}

/** Purchases — tenta padrão, depois pixel, depois omni (evita dupla contagem). */
export function parsePurchases(actions?: MetaAction[] | null): number {
  if (!actions) return 0;
  for (const type of ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]) {
    const v = parseActionCount(actions, type);
    if (v > 0) return v;
  }
  return 0;
}

/** Receita de compra — mesma estratégia de dedup de `parsePurchases`. */
export function parsePurchaseRevenue(values?: MetaAction[] | null): number {
  if (!values) return 0;
  for (const type of ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]) {
    const v = parseActionFloat(values, type);
    if (v > 0) return v;
  }
  return 0;
}

/** Divisão segura: retorna `null` quando o denominador é 0 (em vez de Infinity/NaN). */
export function safeDiv(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Arredonda para `n` casas decimais (default 2). */
export function round(value: number | null, n = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** n;
  return Math.round(value * f) / f;
}
