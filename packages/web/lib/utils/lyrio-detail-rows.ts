// ============================================================
// Story 42.5 — linhas do Detalhamento da etapa Lyrio.
//
// A etapa roda em DUAS plataformas, e cada uma entrega um formato diferente:
//
//   Meta   → CampaignAnalytics (campanha, público e criativo), com o spend JÁ
//            TRIBUTADO pelo backend (gross-up de 12,15% desde 2026-01-01, em
//            `services/traffic-analytics.ts`).
//   Google → GoogleAdsCampaign (só campanha), com CTR/CPC/CPM já prontos da API
//            e SEM imposto do Meta — o imposto é da Meta, não da mídia paga em
//            geral. Aplicá-lo aqui inflaria o investimento do Google em 13,8%.
//
// Este módulo é a fronteira entre os dois formatos e a tabela. Ele existe
// separado do componente porque é exatamente onde um imposto a mais entraria
// sem ninguém ver — e porque o vitest do web roda em `lib/utils`, sem jsdom.
//
// REGRA QUE ESTE MÓDULO PROTEGE: nenhuma multiplicação por fator de imposto
// acontece aqui. Ver o cabeçalho de `perpetual-detail-metrics.ts` para o
// histórico do bug (Story 29.24 → 29.27).
// ============================================================

import { deriveDetailMetrics } from "./perpetual-detail-metrics";

export type LyrioPlatform = "meta" | "google";

/** Subconjunto de `CampaignAnalytics` que a tabela consome. */
export interface MetaEntityInput {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks?: number | null;
  videoViews3s?: number;
  videoViews75?: number;
}

/** Subconjunto de `GoogleAdsCampaign` que a tabela consome. */
export interface GoogleCampaignInput {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
}

export interface LyrioDetailRow {
  id: string;
  name: string;
  platform: LyrioPlatform;
  /** Só o Google expõe status por campanha nesta tela; Meta fica `null`. */
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number;
  cpm: number;
  /** `null` quando não é anúncio de vídeo, ou quando a dimensão não é criativo. */
  hookRate: number | null;
  holdRate: number | null;
}

/** Cliques que servem de base para CTR e CPC — link click quando houver. */
function costClicks(e: MetaEntityInput): number {
  return e.linkClicks && e.linkClicks > 0 ? e.linkClicks : e.clicks;
}

/**
 * Converte uma entidade da Meta (campanha, público ou anúncio) em linha.
 *
 * `revenue` e `sales` vão como `null` de propósito: esta tabela não tem
 * atribuição de venda, e passar zero faria `deriveDetailMetrics` devolver
 * ROAS 0 em vez de `null` — a diferença entre "não vendeu" e "não sabemos".
 */
export function metaRow(e: MetaEntityInput): LyrioDetailRow {
  const m = deriveDetailMetrics(
    {
      spend: e.spend,
      impressions: e.impressions,
      clicks: e.clicks,
      linkClicks: e.linkClicks,
      revenue: null,
      sales: null,
      videoViews3s: e.videoViews3s,
      videoViews75: e.videoViews75,
    },
    0, // feeRate irrelevante sem receita — margem não é coluna desta tabela
  );
  const base = costClicks(e);
  return {
    id: e.campaignId,
    name: e.campaignName,
    platform: "meta",
    status: null,
    spend: e.spend,
    impressions: e.impressions,
    clicks: base,
    ctr: e.impressions > 0 ? (base / e.impressions) * 100 : null,
    cpc: m.cpc,
    cpm: m.cpm,
    hookRate: m.hookRate,
    holdRate: m.holdRate,
  };
}

/**
 * Converte uma campanha do Google em linha.
 *
 * CTR, CPC e CPM vêm prontos da API do Google e são usados como vêm: re-derivar
 * produziria divergência com o painel do próprio Google por arredondamento.
 * Hook e Hold ficam `null` — o Google reporta retenção em quartis (p25…p100),
 * que não é o mesmo que os 3s/75% da Meta e não pode ser somado na mesma coluna.
 */
export function googleRow(c: GoogleCampaignInput): LyrioDetailRow {
  return {
    id: c.id,
    name: c.name,
    platform: "google",
    status: c.status,
    spend: c.spend,
    impressions: c.impressions,
    clicks: c.clicks,
    ctr: c.ctr,
    cpc: c.cpc,
    cpm: c.cpm,
    hookRate: null,
    holdRate: null,
  };
}

/**
 * Linhas da dimensão "Por Campanha": Meta + Google na mesma tabela.
 *
 * `metaEntities` já deve vir filtrado pelas campanhas da etapa — o hook
 * `useTrafficCampaigns` traz TODAS as campanhas do projeto e não aceita filtro
 * no servidor. `googleCampaigns` idem, pelos ids salvos em
 * `stage.googleAdsCampaigns`.
 */
export function buildCampaignRows(
  metaEntities: MetaEntityInput[],
  googleCampaigns: GoogleCampaignInput[],
): LyrioDetailRow[] {
  return [...metaEntities.map(metaRow), ...googleCampaigns.map(googleRow)];
}

export type LyrioSortKey = keyof Pick<
  LyrioDetailRow,
  "name" | "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "hookRate" | "holdRate"
>;

/**
 * Ordena o CONJUNTO todo (regra da Story 29.32 — paginar é da visualização,
 * ordenar é do conjunto). `null` sempre no fim, nas duas direções: linha sem
 * dado não é "a pior", é desconhecida.
 */
export function sortRows(
  rows: LyrioDetailRow[],
  key: LyrioSortKey,
  dir: "asc" | "desc",
): LyrioDetailRow[] {
  const fator = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return va.localeCompare(vb, "pt-BR") * fator;
    }
    return ((va as number) - (vb as number)) * fator;
  });
}

/** Soma de investimento das linhas — o rodapé da tabela. */
export function totalSpend(rows: LyrioDetailRow[]): number {
  return rows.reduce((soma, r) => soma + r.spend, 0);
}
