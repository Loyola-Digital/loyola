import type { CampaignDailyInsight } from "@/lib/hooks/use-traffic-analytics";
import type { FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";

/**
 * utm_source values que classificam um lead como "pago" (vindo de mídia paga).
 * Comparação é case-insensitive — valores da planilha devem ser normalizados
 * com `toLowerCase` antes de consultar este Set.
 */
export const PAID_SOURCES = new Set(["meta", "meta-ads", "google-ads"]);

/**
 * Retorna o value numérico de uma action específica do array `actions[]` do Meta Ads.
 * Usado pra extrair `link_click`, `landing_page_view`, etc.
 */
export function getActionValue(
  actions: { action_type: string; value: string }[] | undefined,
  type: string,
): number {
  if (!actions) return 0;
  const found = actions.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) : 0;
}

/**
 * Divisão segura. Retorna null quando o denominador é zero (em vez de Infinity/NaN)
 * pra permitir que a UI exiba "—" sem tratamento especial.
 */
export function safeDivide(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/**
 * Agrega os insights diários de múltiplas campanhas em totais escalares.
 * IMPORTANTE: usa `link_click` (não `clicks` bruto) pra alinhar com a metodologia da Story 18.1.
 */
export function sumMetaInsights(allInsights: CampaignDailyInsight[][]): {
  spend: number;
  impressions: number;
  linkClicks: number;
  lpViews: number;
} {
  let spend = 0;
  let impressions = 0;
  let linkClicks = 0;
  let lpViews = 0;
  for (const insights of allInsights) {
    for (const row of insights) {
      spend += parseFloat(row.spend || "0");
      impressions += parseFloat(row.impressions || "0");
      linkClicks += getActionValue(row.actions, "link_click");
      lpViews += getActionValue(row.actions, "landing_page_view");
    }
  }
  return { spend, impressions, linkClicks, lpViews };
}

/**
 * Categoriza as linhas da planilha de leads em 3 grupos baseados em `utm_source`:
 *
 * - `leadsPagos`: utm_source ∈ PAID_SOURCES (meta, meta-ads, google-ads)
 * - `leadsOrg`: utm_source preenchido mas não é pago
 * - `leadsSemTrack`: utm_source vazio, ausente ou coluna não mapeada
 *
 * Quando `utmSourceMapped` é `false` (coluna utm_source não está mapeada pelo usuário),
 * todas as linhas são classificadas como `leadsSemTrack`.
 */
export function categorizeLeads(
  rows: FunnelSpreadsheetRow[],
  utmSourceMapped: boolean,
): { leadsPagos: number; leadsOrg: number; leadsSemTrack: number } {
  let leadsPagos = 0;
  let leadsOrg = 0;
  let leadsSemTrack = 0;
  for (const row of rows) {
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    if (!utmSource || !utmSourceMapped) {
      leadsSemTrack += 1;
    } else if (PAID_SOURCES.has(utmSource)) {
      leadsPagos += 1;
    } else {
      leadsOrg += 1;
    }
  }
  return { leadsPagos, leadsOrg, leadsSemTrack };
}
