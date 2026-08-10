// ============================================================
// Story 29.47 — a população da tabela de LPs, no grão de `ad_id`.
//
// ## O defeito que este módulo fecha
//
// A tabela nasceu (29.40) partindo de `funnelAds`, que vem de
// `getAllAdsForProject` — e aquele serviço agrega por **Ad Name**, guardando
// um único `ad_id` por nome (`traffic-analytics.ts:839-841`). Os demais ids
// são somados às métricas e descartados.
//
// LP é atributo do `ad_id`, não do Ad Name. Quando o mesmo criativo roda em
// campanhas que apontam para páginas diferentes — que é EXATAMENTE o desenho
// de um teste de LP — todas as páginas colapsam na do primeiro id.
//
// Medido em produção (2026-08-10, projeto e25369be…, 30 dias):
//
//   ad04-bbe-ppt-mai26--o-netão-te-ensina-corrigido ... 4 LPs   R$ 1.419,02
//   ADS 3 V5 - WORKSHOP CHURRASCO .................... 4 LPs   R$   444,65
//   ad07-bbe-ppt-mai26--sal-grosso-sozinho-não-salva . 4 LPs   R$   437,69
//
//   investimento em Ad Name colidido: R$ 2.495,29 de R$ 9.878,54 (25,26%)
//
// Quanto melhor desenhado o teste, mais dado a tabela perdia.
//
// ## Por que aqui, e não dentro do componente
//
// Mesma razão de `buildLpRows` e `classifyLpCoverage`: é regra de domínio, o
// runner do pacote só executa `lib/utils`, e o AC4 exige um teste que reproduza
// a colisão — impossível de escrever contra o JSX.
// ============================================================

import type { LpAdInput } from "./perpetual-lp-rows";

/** Uma linha diária no grão de anúncio, como `/entity-daily?groupBy=ad` devolve. */
export interface EntityDailyAdRow {
  entityId: string;
  dateStart: string;
  /** BRUTO — o imposto Meta é aplicado aqui, uma única vez, via `applyTax`. */
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
}

/** Vendas da planilha por `ad_id` (`utm_content`), sem passar por Ad Name. */
export interface AdSales {
  vendas: number;
  bruto: number;
}

/**
 * Agrega a série diária por `ad_id` e cola a receita do mesmo grão.
 *
 * @param rows      linhas diárias por anúncio (spend BRUTO)
 * @param salesByAdId  vendas/receita por `ad_id` — vem de `porUtmContent`, cujo
 *                  `content` É o ad id. O Detalhamento resolve esse id para o
 *                  Ad Name e agrega por nome; para LP isso não serve, porque é
 *                  a mesma perda de granularidade do investimento.
 * @param applyTax  gross-up do imposto Meta, aplicado **por dia** — a alíquota
 *                  é date-aware (vale a partir de 2026-01-01), então somar
 *                  primeiro e tributar depois daria número errado numa janela
 *                  que cruze a virada do ano.
 */
export function buildLpAdInputs(
  rows: EntityDailyAdRow[],
  salesByAdId: Map<string, AdSales>,
  applyTax: (spend: number, dateIsoYmd: string) => number,
): LpAdInput[] {
  const porAd = new Map<string, LpAdInput>();

  for (const r of rows) {
    const acc = porAd.get(r.entityId) ?? {
      // `campaignId` é o nome do campo genérico de id de entidade em
      // `CampaignAnalytics`, herdado por `LpAdInput`. Aqui ele carrega um
      // ad_id — é o grão que a tabela de LPs precisa.
      campaignId: r.entityId,
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      revenue: 0,
      sales: 0,
    };
    acc.spend += applyTax(r.spend, r.dateStart);
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.linkClicks = (acc.linkClicks ?? 0) + r.linkClicks;
    porAd.set(r.entityId, acc);
  }

  // A receita entra DEPOIS do laço, uma vez por anúncio. Somada dentro dele,
  // seria contada uma vez por dia com insight — o anúncio com 30 dias de
  // veiculação apareceria com 30× o faturamento.
  for (const [adId, acc] of porAd) {
    const s = salesByAdId.get(adId);
    if (s) {
      acc.revenue = s.bruto;
      acc.sales = s.vendas;
    }
  }

  return Array.from(porAd.values());
}

/**
 * Divide os ids em lotes para a consulta de URLs.
 *
 * `useAdLinkUrls` monta a query string com todos os ids. No grão de Ad Name
 * eram 32 ids (~0,6 KB) no funil medido; no grão de anúncio são 184 (~3,5 KB),
 * e isso cresce linearmente: ~500 anúncios ativos passam de 9 KB e batem no
 * limite prático de URL de proxies.
 *
 * O modo de falha seria uma requisição que simplesmente para de responder num
 * funil maior, sem nada na tela — o mesmo silêncio que a 29.45 acabou de
 * eliminar dos gráficos. Lotear é a correção barata; trocar a rota para POST
 * seria a cara.
 */
export const LP_LINK_URL_BATCH = 120;

export function chunkAdIds(ids: string[], size = LP_LINK_URL_BATCH): string[][] {
  if (ids.length === 0) return [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
