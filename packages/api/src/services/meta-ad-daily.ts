/**
 * Story 44.11 — a serie por CRIATIVO da aba Cadeia de CAC.
 *
 * Espelha `meta-campaign-daily.ts` (Story 44.1) um nivel abaixo: la a chave e
 * `campaign_id`, aqui e `ad_id`. Mesma tabela, mesmo recorte de data, mesmo
 * arredondamento de spend por dia — a aba nao pode mostrar um investimento
 * total por criativo que nao fecha com o da cadeia.
 *
 * O que NAO fazemos aqui: buscar na Meta o que falta. `ad_name` ja vive na
 * propria tabela, e o padrao do repo e DB-first para nao estourar rate limit.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { metaAdInsightsDaily } from "../db/schema.js";
import type { Database } from "../db/client.js";
import type { CriativoBruto } from "@loyola-x/shared";

interface Params {
  projectId: string;
  campaignIds: string[];
  from: string;
  to: string;
  explicitRange: boolean;
}

/** `actions[].{type}` somado — o mesmo leitor que a serie por campanha usa. */
function somaAction(actions: unknown, tipo: string): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) {
    const item = a as { action_type?: string; value?: string | number };
    if (item?.action_type === tipo) total += Number(item.value ?? 0) || 0;
  }
  return total;
}

/**
 * Carrega e agrega por `ad_id` no periodo.
 *
 * Atencao ao `null` de video: campo AUSENTE em `video_metrics` significa "nao
 * e video" e vira `null`; `0` significa "e video e ninguem passou de 3s". Sao
 * afirmacoes diferentes, e a tabela precisa distinguir — a coluna some no
 * primeiro caso e mostra zero no segundo.
 */
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
      spend: metaAdInsightsDaily.spend,
      impressions: metaAdInsightsDaily.impressions,
      actions: metaAdInsightsDaily.actions,
      videoMetrics: metaAdInsightsDaily.videoMetrics,
    })
    .from(metaAdInsightsDaily)
    .where(and(...filtros));

  const porAd = new Map<string, CriativoBruto>();
  for (const r of rows) {
    if (!r.adId) continue;
    const vm = r.videoMetrics as { p75?: number; views3s?: number } | null;
    // `video_view` e o 3s (Story 43.3) — nao existe campo `video_3_sec_*` na
    // API da Meta, e a premissa contraria ja custou uma rodada no Epic 43.
    const v3 = vm?.views3s ?? (r.videoMetrics ? somaAction(r.actions, "video_view") : null);
    const ehVideo = r.videoMetrics !== null;

    const atual = porAd.get(r.adId);
    const base = atual ?? {
      adId: r.adId,
      adName: r.adName ?? null,
      spend: 0,
      impressions: 0,
      linkClicks: 0,
      views3s: ehVideo ? 0 : null,
      p75: ehVideo ? 0 : null,
    };
    // Spend arredondado POR DIA antes de somar, igual a serie por campanha
    // (`meta-campaign-daily.ts`). Somar bruto e arredondar no fim divergiria
    // do total que a cadeia ja exibe, que e o que o epic existe para impedir.
    base.spend += Math.round(Number(r.spend ?? 0) * 100) / 100;
    base.impressions += Number(r.impressions ?? 0) || 0;
    base.linkClicks += somaAction(r.actions, "link_click");
    if (ehVideo) {
      base.views3s = (base.views3s ?? 0) + (Number(v3 ?? 0) || 0);
      base.p75 = (base.p75 ?? 0) + (Number(vm?.p75 ?? 0) || 0);
      // Um ad que virou video no meio do periodo: o nome fica, e as metricas
      // de video contam so os dias em que existiram.
    }
    // O nome mais recente ganha — `ad_name` muda quando o gestor renomeia.
    if (r.adName) base.adName = r.adName;
    porAd.set(r.adId, base);
  }

  return [...porAd.values()];
}
