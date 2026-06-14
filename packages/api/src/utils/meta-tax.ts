/**
 * Imposto sobre Meta Ads vigente a partir de 2026-01-01 (12,15%).
 *
 * O `spend` que vem da API do Meta é o valor LÍQUIDO (sem imposto). O custo real
 * inclui o imposto "por dentro" (gross-up): o imposto incide sobre o valor BRUTO.
 *   total  = spend / (1 − alíquota)
 *   imposto = total × alíquota = spend / (1 − alíquota) × alíquota
 *
 * Espelha `applyMetaAdsTax` do frontend (`packages/web/lib/utils/funnel-metrics.ts`).
 * Aplicar SOMENTE em endpoints cujo spend NÃO é tributado no frontend — ou seja,
 * NÃO usar nos daily insights (card/Dados Diários já aplicam via sumMetaInsights),
 * nem no creative-performance (Criativos/LPs aplicam no frontend).
 */
export const META_TAX_EFFECTIVE_DATE = "2026-01-01";
export const META_TAX_RATE = 0.1215;

/**
 * Aplica o imposto ao spend líquido se a data for >= 2026-01-01 (gross-up).
 * @param spend - spend líquido (da API Meta)
 * @param dateIsoYmd - data do insight no formato YYYY-MM-DD (ex: date_start)
 */
export function applyMetaTax(spend: number, dateIsoYmd: string | undefined | null): number {
  if (!dateIsoYmd || !(spend > 0)) return spend;
  return dateIsoYmd >= META_TAX_EFFECTIVE_DATE ? spend / (1 - META_TAX_RATE) : spend;
}
