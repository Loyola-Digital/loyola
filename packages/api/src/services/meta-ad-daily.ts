/**
 * Story 44.11 — a serie por CRIATIVO da aba Cadeia de CAC.
 *
 * Espelha `meta-campaign-daily.ts` (Story 44.1) um nivel abaixo: la a chave e
 * `campaign_id`, aqui e `ad_id`. Mesma tabela, mesmo recorte de data, mesmo
 * arredondamento de spend por dia, e o MESMO `accumulate` — a aba nao pode
 * mostrar um investimento por criativo que nao fecha com o da cadeia.
 *
 * O que NAO fazemos aqui: buscar na Meta o que falta. `ad_name` ja vive na
 * propria tabela, e o padrao do repo e DB-first para nao estourar rate limit.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { metaAdInsightsDaily } from "../db/schema.js";
import type { Database } from "../db/client.js";
import type { CriativoBruto } from "@loyola-x/shared";
import { accumulate, emptyAgg, type InsightRow, type MetricAgg } from "../utils/meta-insight-agg.js";
import { round } from "../utils/meta-metrics.js";

interface Params {
  projectId: string;
  campaignIds: string[];
  from: string;
  to: string;
  explicitRange: boolean;
}

export async function carregarCriativosDaEtapa(db: Database, p: Params): Promise<CriativoBruto[]> {
  if (p.campaignIds.length === 0) return [];

  const filtros = [
    eq(metaAdInsightsDaily.projectId, p.projectId),
    inArray(metaAdInsightsDaily.campaignId, p.campaignIds),
  ];
  if (p.explicitRange) {
    filtros.push(gte(metaAdInsightsDaily.dateStart, p.from), lte(metaAdInsightsDaily.dateStart, p.to));
  }

  const rows = await db
    .select({
      adId: metaAdInsightsDaily.adId,
      adName: metaAdInsightsDaily.adName,
      dateStart: metaAdInsightsDaily.dateStart,
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      reach: metaAdInsightsDaily.reach,
      clicks: metaAdInsightsDaily.clicks,
      actions: metaAdInsightsDaily.actions,
      actionValues: metaAdInsightsDaily.actionValues,
      lastSyncedAt: metaAdInsightsDaily.lastSyncedAt,
      videoMetrics: metaAdInsightsDaily.videoMetrics,
    })
    .from(metaAdInsightsDaily)
    .where(and(...filtros));

  /**
   * QA-4411-01 — a agregacao usa `accumulate`, o MESMO agregador da serie por
   * campanha (`meta-campaign-daily.ts`), e nao uma soma artesanal.
   *
   * A primeira versao somava `spend` cru e reimplementava a leitura de
   * `actions`. Medido contra producao: o bloco mostrava **13,83% a menos** de
   * investimento que o topo da propria aba, porque `accumulate` aplica o
   * gross-up do imposto Meta (`valor / (1 - 0,1215)`) e a soma artesanal nao.
   *
   * O comentario do proprio `meta-insight-agg.ts` avisa por que ele existe:
   * "duas rotas montando a mesma serie de dois jeitos e a semente da proxima
   * divergencia do connectRate". Era exatamente isso.
   *
   * O `spend` que sai daqui ja vem TRIBUTADO. Quem consome nao reaplica — foi
   * o bug da 29.24, corrigido na 29.27.
   */
  const porAd = new Map<string, { adName: string | null; dias: Map<string, MetricAgg>; ehVideo: boolean; views3s: number; p75: number }>();
  for (const r of rows) {
    if (!r.adId) continue;
    let a = porAd.get(r.adId);
    if (!a) {
      a = { adName: r.adName ?? null, dias: new Map(), ehVideo: false, views3s: 0, p75: 0 };
      porAd.set(r.adId, a);
    }
    // O nome mais recente ganha — `ad_name` muda quando o gestor renomeia.
    if (r.adName) a.adName = r.adName;

    let agg = a.dias.get(r.dateStart);
    if (!agg) {
      agg = emptyAgg();
      a.dias.set(r.dateStart, agg);
    }
    accumulate(agg, r as unknown as InsightRow);

    const vm = r.videoMetrics as { p75?: number; views3s?: number } | null;
    if (vm) {
      a.ehVideo = true;
      // `video_view` e o 3s (Story 43.3) — nao existe campo `video_3_sec_*` na
      // API da Meta, e a premissa contraria ja custou uma rodada no Epic 43.
      a.views3s += Number(vm.views3s ?? 0) || 0;
      a.p75 += Number(vm.p75 ?? 0) || 0;
    }
  }

  return [...porAd.entries()].map(([adId, a]) => {
    const dias = [...a.dias.values()];
    return {
      adId,
      adName: a.adName,
      // Arredondado POR DIA antes de somar, igual a serie por campanha: somar
      // bruto e arredondar no fim daria outro total, e a aba compara os dois.
      spend: dias.reduce((s, d) => s + (round(d.spend) ?? 0), 0),
      impressions: dias.reduce((s, d) => s + d.impressions, 0),
      linkClicks: dias.reduce((s, d) => s + d.linkClicks, 0),
      // Ausencia de video e `null`, nao `0`: `0` afirmaria "e video e ninguem
      // passou de 3s", que e um criativo pessimo, nao um que nao e video.
      views3s: a.ehVideo ? a.views3s : null,
      p75: a.ehVideo ? a.p75 : null,
    };
  });

}
