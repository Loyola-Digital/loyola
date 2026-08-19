/**
 * Série DIÁRIA por campanha — **uma linha por (campanha, dia)**.
 *
 * Story 44.8 (AC2): este bloco vivia inline no handler de
 * `GET .../stages/:stageId/campaigns/daily` (Story 44.1). Saiu de lá para cá
 * porque a rota da cadeia de CAC (`public-cadeia-cac.ts`) precisa da MESMA
 * série, e a alternativa era escrevê-la de novo.
 *
 * ## Por que a unicidade por data é contrato, não detalhe
 *
 * O gate da 44.7 (QA-447-01) mediu o que acontece quando a série chega com
 * mais de uma linha na mesma data: numa campanha com dois anúncios por dia, o
 * teto de CPC saiu **0,20 em vez de 0,92** — 4,6× inflado, vindo de um anúncio
 * isolado que virou "a melhor janela".
 *
 * O `Map<data, agregado>` daqui garante a unicidade **por construção**: linhas
 * ad-level do mesmo dia caem no mesmo balde antes de qualquer conta. O
 * `ultimoDaData` de `janelasDe7Dias` protege a janela; ele NÃO protege a base
 * do piso de confiança. A proteção certa é não deixar a duplicata nascer.
 *
 * ## Sem taxa derivada, de propósito
 *
 * Só brutos somáveis. Toda taxa é razão de somas sobre o período que o
 * consumidor escolher; entregar `cpm`/`ctr` por dia convidaria a tirar média de
 * médias diárias, que dá outro número (spec §2.6).
 *
 * ⚠️ `spend` sai **TRIBUTADO** — `accumulate` já aplicou `applyMetaTax`. Não
 * reaplicar (bug da 29.24, corrigido na 29.27).
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { metaAdInsightsDaily } from "../db/schema.js";
import { round } from "../utils/meta-metrics.js";
import { accumulate, emptyAgg, type InsightRow, type MetricAgg } from "../utils/meta-insight-agg.js";

/** Um dia de uma campanha. Os nomes batem com `DiaBruto` do `@loyola-x/shared`. */
export interface DiaDaCampanha {
  date: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  checkouts: number;
  /** Pixel, não Loyola. A venda/lead real por campanha vem da Story 44.3. */
  leadsProxyPixel: number;
  purchasesProxyPixel: number;
  revenueProxyPixel: number;
}

export interface CampanhaDiaria {
  campaignId: string;
  campaignName: string | null;
  /**
   * `null` (com `motivo`) quando a campanha está vinculada à etapa mas não tem
   * NENHUMA linha no cache. Devolver `[]` diria "rodou e não teve nada", que é
   * afirmação diferente e falsa — a distinção que a 44.1 trava em teste.
   */
  days: DiaDaCampanha[] | null;
  motivo: "semDados" | null;
  lastSyncedAt: string | null;
}

export interface SerieDiariaParams {
  projectId: string;
  /** IDs vindos de `funnel_stages.campaigns`. Vazio devolve `[]`. */
  campaignIds: string[];
  from: string;
  to: string;
  /** `false` = sem filtro de data na query (o default de 30 dias não se aplica). */
  explicitRange: boolean;
}

/**
 * Lê `meta_ad_insights_daily` e agrupa em (campanha → dia → agregado).
 *
 * ## Fonte: ad-level, e a razão importa
 *
 * A mesma fonte do `/campaigns` e do `/stages/:stageId/daily`. Não é a escolha
 * óbvia (existe `meta_campaign_insights_daily`, com grão já por campanha) e foi
 * medida antes de ser feita: as duas tabelas divergem em `spend` em 21 das 164
 * campanhas comuns, com diferença de até R$ 24.424,85 (Story 44.1).
 */
export async function carregarSerieDiariaPorCampanha(
  db: Database,
  params: SerieDiariaParams,
): Promise<CampanhaDiaria[]> {
  const { projectId, campaignIds, from, to, explicitRange } = params;
  if (campaignIds.length === 0) return [];

  const base = [
    eq(metaAdInsightsDaily.projectId, projectId),
    inArray(metaAdInsightsDaily.campaignId, campaignIds),
  ];
  const rows = await db
    .select({
      campaignId: metaAdInsightsDaily.campaignId,
      campaignName: metaAdInsightsDaily.campaignName,
      dateStart: metaAdInsightsDaily.dateStart,
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      reach: metaAdInsightsDaily.reach,
      clicks: metaAdInsightsDaily.clicks,
      actions: metaAdInsightsDaily.actions,
      actionValues: metaAdInsightsDaily.actionValues,
      lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
    })
    .from(metaAdInsightsDaily)
    .where(
      explicitRange
        ? and(...base, gte(metaAdInsightsDaily.dateStart, from), lte(metaAdInsightsDaily.dateStart, to))
        : and(...base),
    );

  const porCampanha = new Map<
    string,
    { nome: string | null; dias: Map<string, MetricAgg>; lastSyncedAt: Date | null }
  >();
  for (const row of rows) {
    if (!row.campaignId) continue;
    let c = porCampanha.get(row.campaignId);
    if (!c) {
      c = { nome: row.campaignName ?? null, dias: new Map(), lastSyncedAt: null };
      porCampanha.set(row.campaignId, c);
    }
    if (!c.nome && row.campaignName) c.nome = row.campaignName;
    let agg = c.dias.get(row.dateStart);
    if (!agg) {
      agg = emptyAgg();
      c.dias.set(row.dateStart, agg);
    }
    accumulate(agg, row as InsightRow);
    if (!c.lastSyncedAt || row.lastSyncedAt > c.lastSyncedAt) c.lastSyncedAt = row.lastSyncedAt;
  }

  return campaignIds.map((campaignId) => {
    const c = porCampanha.get(campaignId);
    if (!c) {
      return {
        campaignId,
        campaignName: null,
        days: null,
        motivo: "semDados" as const,
        lastSyncedAt: null,
      };
    }
    const days = [...c.dias.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, a]) => ({
        date,
        spend: round(a.spend) ?? 0,
        impressions: a.impressions,
        linkClicks: a.linkClicks,
        landingPageViews: a.lpViews,
        checkouts: a.checkouts,
        leadsProxyPixel: a.leads,
        purchasesProxyPixel: a.purchases,
        revenueProxyPixel: round(a.revenue) ?? 0,
      }));
    return {
      campaignId,
      campaignName: c.nome,
      days,
      motivo: null,
      lastSyncedAt: c.lastSyncedAt ? c.lastSyncedAt.toISOString() : null,
    };
  });
}
