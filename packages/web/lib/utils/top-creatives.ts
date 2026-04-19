import type {
  TopPerformerAd,
  MetaAdCreative,
  VideoMetrics,
} from "@/lib/hooks/use-traffic-analytics";
import type { FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";
import { PAID_SOURCES, safeDivide } from "@/lib/utils/funnel-metrics";

/**
 * Representa um criativo agregado — vários `TopPerformerAd` com o mesmo
 * `campaignName` (que no tipo do Meta é o nome do AD, não da campanha) viram
 * uma única entrada com métricas somadas e a imagem do de maior spend.
 *
 * Introduzido pela Story 18.5 pra consolidar variações de um mesmo criativo
 * lançadas em campanhas diferentes.
 */
export interface AggregatedCreative {
  name: string;
  ids: string[];
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  creative: MetaAdCreative;
  parentInfo?: string;
  videoMetrics?: VideoMetrics | null;

  /** Leads pagos cruzados com a planilha (utm_content ∈ ids && utm_source ∈ PAID_SOURCES) */
  leadsPagos: number;
  /** CPL Pago = spend / leadsPagos (null se leadsPagos === 0) */
  cplPago: number | null;

  /**
   * CPL Qualificado do backend (metodologia legada).
   * Soma ponderada: Σ(cplQualified * leads) / Σ(leads) quando disponível,
   * senão null.
   */
  cplQualified: number | null;

  /** Total de leads do backend (legado, pra ordenação 'leads' OLD — mantido por compat) */
  leadsLegacy: number;
  /** Total de vendas do backend (legado) */
  salesLegacy: number;
  /** ROAS ponderado do backend (legado) */
  roasLegacy: number | null;
}

/**
 * Agrupa ads por `campaignName` (nome do criativo) case-sensitive. Ads sem nome
 * (vazio ou null) são ignorados.
 *
 * Para cada grupo:
 * - Soma: spend, impressions, clicks, reach, leads legacy, sales legacy
 * - Recalcula: CTR ponderado (sumClicks/sumImpressions × 100), CPC (sumSpend/sumClicks)
 * - Escolhe `creative` e `videoMetrics` do ad com MAIOR spend do grupo
 */
export function aggregateCreativesByName(
  ads: TopPerformerAd[],
): AggregatedCreative[] {
  const groups = new Map<string, TopPerformerAd[]>();
  for (const ad of ads) {
    if (!ad.campaignName || ad.campaignName.trim() === "") continue;
    if (!ad.creative?.imageUrl && !ad.creative?.thumbnailUrl) continue;
    const list = groups.get(ad.campaignName) ?? [];
    list.push(ad);
    groups.set(ad.campaignName, list);
  }

  const result: AggregatedCreative[] = [];
  for (const [name, groupAds] of groups.entries()) {
    const sorted = [...groupAds].sort((a, b) => b.spend - a.spend);
    const leader = sorted[0];
    const spend = sorted.reduce((s, a) => s + a.spend, 0);
    const impressions = sorted.reduce((s, a) => s + a.impressions, 0);
    const clicks = sorted.reduce((s, a) => s + a.clicks, 0);
    const reach = sorted.reduce((s, a) => s + a.reach, 0);
    const leadsLegacy = sorted.reduce((s, a) => s + (a.leads ?? 0), 0);
    const salesLegacy = sorted.reduce((s, a) => s + (a.sales ?? 0), 0);

    // Soma ponderada pelo spend pra ROAS e CPL Qualificado
    const roasSum = sorted.reduce(
      (s, a) => s + (a.roas != null ? a.roas * a.spend : 0),
      0,
    );
    const cplQualSum = sorted.reduce(
      (s, a) => s + (a.cplQualified != null ? a.cplQualified * (a.leads ?? 0) : 0),
      0,
    );

    result.push({
      name,
      ids: sorted.map((a) => a.campaignId),
      spend,
      impressions,
      clicks,
      reach,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: safeDivide(spend, clicks) ?? 0,
      creative: leader.creative!,
      parentInfo: `${leader.parentCampaignName} › ${leader.adsetName}`,
      videoMetrics: leader.videoMetrics,

      // Preenchidos depois pelo countPaidLeadsForAds
      leadsPagos: 0,
      cplPago: null,

      cplQualified: leadsLegacy > 0 ? cplQualSum / leadsLegacy : null,
      leadsLegacy,
      salesLegacy,
      roasLegacy: spend > 0 ? roasSum / spend : null,
    });
  }
  return result;
}

/**
 * Conta linhas da planilha (já filtradas por janela de datas, caller's responsibility)
 * onde `utm_content ∈ adIds` **e** `utm_source.toLowerCase() ∈ PAID_SOURCES`.
 *
 * Se a coluna utm_content não está mapeada na planilha, retorna 0 (não tem como cruzar).
 */
export function countPaidLeadsForAds(
  rows: FunnelSpreadsheetRow[],
  adIds: string[],
  utmContentMapped: boolean,
  utmSourceMapped: boolean,
): number {
  if (!utmContentMapped || !utmSourceMapped) return 0;
  const idSet = new Set(adIds);
  let count = 0;
  for (const row of rows) {
    const utmContent = row.named.utm_content ?? "";
    if (!idSet.has(utmContent)) continue;
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    if (PAID_SOURCES.has(utmSource)) count += 1;
  }
  return count;
}

/**
 * Enriquece uma lista de `AggregatedCreative` com `leadsPagos` e `cplPago`
 * calculados via cruzamento com linhas da planilha.
 *
 * Retorna uma lista nova (imutável). As rows devem vir já filtradas por janela
 * de datas (use `filterSheetRowsByDays` antes).
 */
export function enrichWithPaidLeads(
  creatives: AggregatedCreative[],
  filteredRows: FunnelSpreadsheetRow[],
  utmContentMapped: boolean,
  utmSourceMapped: boolean,
): AggregatedCreative[] {
  return creatives.map((c) => {
    const leadsPagos = countPaidLeadsForAds(
      filteredRows,
      c.ids,
      utmContentMapped,
      utmSourceMapped,
    );
    return {
      ...c,
      leadsPagos,
      cplPago: safeDivide(c.spend, leadsPagos),
    };
  });
}
