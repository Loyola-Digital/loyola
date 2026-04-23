import type {
  TopPerformerAd,
  MetaAdCreative,
  VideoMetrics,
} from "@/lib/hooks/use-traffic-analytics";
import type { FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";
import { PAID_SOURCES, safeDivide } from "@/lib/utils/funnel-metrics";
import { normalizeNumericId } from "@/lib/utils/normalize-answer";

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
  creative: MetaAdCreative | null;
  parentInfo?: string;
  videoMetrics?: VideoMetrics | null;

  /** Leads pagos cruzados com a planilha (utm_content ∈ ids && utm_source ∈ PAID_SOURCES) */
  leadsPagos: number;
  /** Leads orgânicos (utm_content ∈ ids && utm_source preenchido mas não pago) */
  leadsOrg: number;
  /** Leads sem rastreamento (utm_content ∈ ids && utm_source vazio/não mapeado) */
  leadsSemTrack: number;
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
    const name = ad.campaignName?.trim();
    if (!name) continue;
    // Ads sem creative/imagem entram mesmo assim — o componente renderiza um
    // placeholder em vez de esconder o card. Evita sumir com performers legítimos.
    const list = groups.get(name) ?? [];
    list.push(ad);
    groups.set(name, list);
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
      creative: leader.creative ?? null,
      parentInfo: `${leader.parentCampaignName} › ${leader.adsetName}`,
      videoMetrics: leader.videoMetrics,

      // Preenchidos depois pelo enrichWithPaidLeads
      leadsPagos: 0,
      leadsOrg: 0,
      leadsSemTrack: 0,
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
  const idSet = new Set(adIds.map(normalizeNumericId));
  let count = 0;
  for (const row of rows) {
    const utmContent = normalizeNumericId(row.named.utm_content ?? "");
    if (!idSet.has(utmContent)) continue;
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    if (PAID_SOURCES.has(utmSource)) count += 1;
  }
  return count;
}

/**
 * Conta leads por origem (Pagos/Org/SemTrack) para um grupo de ad_ids.
 * Deduplicação por e-mail normalizado (lowercase + trim) dentro de cada categoria.
 * Leads sem e-mail recebem key única por índice.
 */
export function countLeadsByOriginForAds(
  rows: FunnelSpreadsheetRow[],
  adIds: string[],
  utmContentMapped: boolean,
  utmSourceMapped: boolean,
): { leadsPagos: number; leadsOrg: number; leadsSemTrack: number } {
  if (!utmContentMapped) return { leadsPagos: 0, leadsOrg: 0, leadsSemTrack: 0 };
  const idSet = new Set(adIds.map(normalizeNumericId));
  const seen = {
    leadsPagos: new Set<string>(),
    leadsOrg: new Set<string>(),
    leadsSemTrack: new Set<string>(),
  };
  let rowIdx = 0;
  for (const row of rows) {
    const utmContent = normalizeNumericId(row.named.utm_content ?? "");
    if (!idSet.has(utmContent)) { rowIdx++; continue; }
    const email = (row.named.email ?? "").trim().toLowerCase();
    const key = email || `__no-email_${rowIdx}`;
    const utmSource = (row.named.utm_source ?? "").trim().toLowerCase();
    let category: "leadsPagos" | "leadsOrg" | "leadsSemTrack";
    if (!utmSource || !utmSourceMapped) {
      category = "leadsSemTrack";
    } else if (PAID_SOURCES.has(utmSource)) {
      category = "leadsPagos";
    } else {
      category = "leadsOrg";
    }
    seen[category].add(key);
    rowIdx++;
  }
  return {
    leadsPagos: seen.leadsPagos.size,
    leadsOrg: seen.leadsOrg.size,
    leadsSemTrack: seen.leadsSemTrack.size,
  };
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
    const { leadsPagos, leadsOrg, leadsSemTrack } = countLeadsByOriginForAds(
      filteredRows,
      c.ids,
      utmContentMapped,
      utmSourceMapped,
    );
    return {
      ...c,
      leadsPagos,
      leadsOrg,
      leadsSemTrack,
      cplPago: safeDivide(c.spend, leadsPagos),
    };
  });
}

/**
 * Top resposta (moda) de uma pergunta pro grupo de ads agregados.
 * Usado na Story 18.6 (3.b) pra exibir resposta mais frequente por criativo.
 *
 * Campos:
 * - `label`: versão raw mais comum da opção normalizada
 * - `count`: quantos leads escolheram essa opção
 * - `total`: **total de leads pagos do criativo** (denominador pro cálculo de %)
 * - `totalResponses`: total de respostas da pesquisa desse criativo (pra saber
 *   quantos dos `total` leads respondeu de fato)
 */
export interface TopSurveyAnswer {
  label: string;
  count: number;
  total: number;
  totalResponses: number;
}

/**
 * Agrega respostas de pesquisa dos vários ad_ids de um grupo agregado e retorna
 * o top-1 de cada pergunta-alvo.
 *
 * O denominador do `%` é o **total de leads pagos do criativo** (recebido via
 * `totalLeadsOfGroup`), não o total de respostas da pesquisa. Assim "1/4 (25%)"
 * significa "25% dos 4 leads pagos respondeu essa opção" — muito mais informativo
 * que "1/1 (100%) = das 1 respostas, 100% foi essa".
 *
 * Retorna null em cada campo quando não há dados da pesquisa pra aquele ad
 * do grupo (ou aquela pergunta específica ausente).
 */
export function mergeSurveyForGroup(
  surveyDataByAdId:
    | Record<
        string,
        {
          faturamento: Array<{ label: string; count: number }>;
          profissao: Array<{ label: string; count: number }>;
          funcionarios: Array<{ label: string; count: number }>;
          voce_e: Array<{ label: string; count: number }>;
        }
      >
    | undefined,
  adIds: string[],
  totalLeadsOfGroup: number,
): {
  faturamento: TopSurveyAnswer | null;
  profissao: TopSurveyAnswer | null;
  funcionarios: TopSurveyAnswer | null;
  voce_e: TopSurveyAnswer | null;
} {
  if (!surveyDataByAdId) {
    return { faturamento: null, profissao: null, funcionarios: null, voce_e: null };
  }
  const buckets = {
    faturamento: new Map<string, number>(),
    profissao: new Map<string, number>(),
    funcionarios: new Map<string, number>(),
    voce_e: new Map<string, number>(),
  };
  const totalResponses = { faturamento: 0, profissao: 0, funcionarios: 0, voce_e: 0 };
  for (const rawId of adIds) {
    const adData = surveyDataByAdId[rawId] ?? surveyDataByAdId[normalizeNumericId(rawId)];
    if (!adData) continue;
    for (const key of ["faturamento", "profissao", "funcionarios", "voce_e"] as const) {
      for (const item of adData[key]) {
        buckets[key].set(item.label, (buckets[key].get(item.label) ?? 0) + item.count);
        totalResponses[key] += item.count;
      }
    }
  }
  function top(
    bucket: Map<string, number>,
    totalResp: number,
  ): TopSurveyAnswer | null {
    let best: TopSurveyAnswer | null = null;
    for (const [label, count] of bucket.entries()) {
      if (!best || count > best.count) {
        best = { label, count, total: totalLeadsOfGroup, totalResponses: totalResp };
      }
    }
    return best;
  }
  return {
    faturamento: top(buckets.faturamento, totalResponses.faturamento),
    profissao: top(buckets.profissao, totalResponses.profissao),
    funcionarios: top(buckets.funcionarios, totalResponses.funcionarios),
    voce_e: top(buckets.voce_e, totalResponses.voce_e),
  };
}
