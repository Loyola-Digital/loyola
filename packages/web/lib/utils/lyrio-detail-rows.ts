// ============================================================
// Story 42.5 — linhas do Detalhamento da etapa Lyrio.
//
// A etapa roda em DUAS plataformas, e cada uma entrega um formato diferente:
//
//   Meta   → CampaignAnalytics (campanha, público e criativo), com o spend JÁ
//            TRIBUTADO pelo backend (gross-up de 12,15% desde 2026-01-01, em
//            `services/traffic-analytics.ts`).
//   Google → só campanha, SEM imposto do Meta — o imposto é da Meta, não da
//            mídia paga em geral. Aplicá-lo aqui inflaria o investimento do
//            Google em 13,8%. Story 42.16 (D16): investimento, impressões e
//            cliques vêm do `/daily` por campanha na régua de SP, e CTR/CPC/CPM
//            são RECALCULADOS a partir dessa soma (antes vinham prontos da API,
//            na janela N + 1 em UTC do `/campaigns`).
//
// Este módulo é a fronteira entre os dois formatos e a tabela. Ele existe
// separado do componente porque é exatamente onde um imposto a mais entraria
// sem ninguém ver — e porque o vitest do web roda em `lib/utils`, sem jsdom.
//
// REGRA QUE ESTE MÓDULO PROTEGE: nenhuma multiplicação por fator de imposto
// acontece aqui. Ver o cabeçalho de `perpetual-detail-metrics.ts` para o
// histórico do bug (Story 29.24 → 29.27).
//
// Story 29.77: Cliques, CTR e CPC das linhas da Meta são de CLIQUE NO LINK,
// sem fallback — a regra única do produto (`shared/src/clique-no-link.ts`,
// 18.78). Até a 29.77 este módulo caía para cliques totais quando a Meta não
// devolvia `link_click`; agora a linha mostra `—` nas três colunas. As linhas
// do Google são cliques da campanha (não são cliques em link).
// ============================================================

import { ctrDeLink } from "@loyola-x/shared/src/clique-no-link";
import { deriveDetailMetrics } from "./perpetual-detail-metrics";
import type { DimensaoDoDetalhamento } from "./vendas-por-canal-lyrio";

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

/**
 * Uma campanha do Google vinculada, com o tráfego somado na régua de SP
 * (`trafegoDoGoogleNaRegua`, Story 42.16). PO-03: o nome vem de
 * `stage.googleAdsCampaigns`; o status pode vir de `useGoogleAdsCampaigns`
 * (status não é métrica de janela) — nenhuma métrica daquela resposta entra.
 */
export interface GoogleCampaignInput {
  id: string;
  name: string;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
}

export interface LyrioDetailRow {
  id: string;
  name: string;
  platform: LyrioPlatform;
  /** Só o Google expõe status por campanha nesta tela; Meta fica `null`. */
  status: string | null;
  spend: number;
  impressions: number;
  /** Meta: cliques no link, `null` (→ `—`) quando a Meta não os devolveu. Google: cliques da campanha. */
  clicks: number | null;
  ctr: number | null;
  /** Meta: CPC de clique no link, `null` sem `link_click`. Google: como vem da API. */
  cpc: number | null;
  /** `null` sem impressão (Google, D16: recalculado — nunca divisão por zero). */
  cpm: number | null;
  /** `null` quando não é anúncio de vídeo, ou quando a dimensão não é criativo. */
  hookRate: number | null;
  holdRate: number | null;
}

/**
 * Cliques no link, ou `null` quando a Meta não os devolveu. `0` conta como
 * "não devolvido": a mesma convenção do backend (`buildAnalyticsRow` recebe
 * `linkClicks > 0 ? n : null`) e do Detalhamento do Perpétuo.
 */
function cliquesNoLink(e: MetaEntityInput): number | null {
  return e.linkClicks && e.linkClicks > 0 ? e.linkClicks : null;
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
  const linkClicks = cliquesNoLink(e);
  return {
    id: e.campaignId,
    name: e.campaignName,
    platform: "meta",
    status: null,
    spend: e.spend,
    impressions: e.impressions,
    // Story 29.77: as três colunas concordam — cliques no link, ou `—`.
    clicks: linkClicks,
    ctr: ctrDeLink(linkClicks, e.impressions),
    cpc: m.cpc,
    cpm: m.cpm,
    hookRate: m.hookRate,
    holdRate: m.holdRate,
  };
}

/**
 * Converte uma campanha do Google em linha.
 *
 * Story 42.16 (D16, "Régua de SP, recalcula"): CTR, CPC e CPM são RECALCULADOS
 * a partir da soma diária na régua de SP — o mesmo período da Meta na mesma
 * tabela. Antes vinham prontos da API, numa janela de N + 1 dias em UTC; o
 * argumento de então ("re-derivar produziria divergência com o painel do
 * Google por arredondamento") perdeu para o período comum: a divergência com o
 * painel do Google agora é de janela, aceita e declarada no tooltip (R2).
 * Divisão por zero vira `null` ("—").
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
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : null,
    cpc: c.clicks > 0 ? c.spend / c.clicks : null,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null,
    hookRate: null,
    holdRate: null,
  };
}

/**
 * Story 42.16 (AC4f, PO-03) — as campanhas do Google do Detalhamento: as
 * vinculadas à etapa (nome de `stage.googleAdsCampaigns`), com o tráfego da
 * régua de SP. Entra só a campanha com entrega na janela (gasto, impressão ou
 * clique): era o que a lista do `/campaigns` mostrava, e a tabela diz
 * "Nenhuma campanha com veiculação no período" quando não sobra nenhuma.
 */
export function campanhasDoGoogleNaRegua(
  vinculadas: readonly { id: string; name: string }[],
  porCampanha: ReadonlyMap<string, { spend: number; impressions: number; clicks: number }>,
  statusPorId: ReadonlyMap<string, string>,
): GoogleCampaignInput[] {
  const saida: GoogleCampaignInput[] = [];
  for (const c of vinculadas) {
    const t = porCampanha.get(c.id);
    if (!t || (t.spend <= 0 && t.impressions <= 0 && t.clicks <= 0)) continue;
    saida.push({ id: c.id, name: c.name, status: statusPorId.get(c.id) ?? null, spend: t.spend, impressions: t.impressions, clicks: t.clicks });
  }
  return saida;
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

// ─────────────── Story 42.16 (AC4) — o filtro "Plataforma" do Detalhamento ───────────────

export type PlataformaDoDetalhamento = "todas" | "meta" | "google";

/** A dica das abas desabilitadas com o filtro Google (AC4c). */
export const DICA_DO_GOOGLE_SO_CAMPANHA = "O Google só tem nível de campanha neste painel";

/** AC4c — com Google, só "Por Campanha"; com Todas e Meta, as três. */
export function dimensoesHabilitadas(p: PlataformaDoDetalhamento): readonly DimensaoDoDetalhamento[] {
  return p === "google" ? ["campaign"] : ["campaign", "adset", "ad"];
}

/** AC4c — quem estava em Público ou Criativo volta para Campanha ao escolher Google. */
export function dimensaoDoFiltro(p: PlataformaDoDetalhamento, d: DimensaoDoDetalhamento): DimensaoDoDetalhamento {
  return dimensoesHabilitadas(p).includes(d) ? d : "campaign";
}

/**
 * AC4b/AC4c — que consulta fica ligada. Só a dimensão ativa consulta (42.5), e
 * a plataforma fora do filtro não consulta: nenhuma chamada só para descartar.
 * `googleStatus` é a de `useGoogleAdsCampaigns`, mantida só pelo status (PO-03).
 */
export function consultasDoDetalhamento(
  p: PlataformaDoDetalhamento,
  d: DimensaoDoDetalhamento,
  tem: { meta: boolean; google: boolean },
): { metaCampanhas: boolean; metaPublicos: boolean; metaCriativos: boolean; googleStatus: boolean } {
  const dim = dimensaoDoFiltro(p, d);
  const meta = tem.meta && p !== "google";
  const google = tem.google && p !== "meta";
  return {
    metaCampanhas: meta && dim === "campaign",
    metaPublicos: meta && dim === "adset",
    metaCriativos: meta && dim === "ad",
    googleStatus: google && dim === "campaign",
  };
}

/** AC4b/AC4c — as linhas que o filtro mostra. */
export function linhasDoFiltro(rows: readonly LyrioDetailRow[], p: PlataformaDoDetalhamento): LyrioDetailRow[] {
  return p === "todas" ? [...rows] : rows.filter((r) => r.platform === p);
}

/** AC4e — o aviso do Google em erro ou sem conta só faz sentido quando o Google está no filtro. */
export function mostraAvisoDoGoogle(p: PlataformaDoDetalhamento): boolean {
  return p !== "meta";
}

/**
 * AC4d — o rodapé segue o filtro. As linhas de venda da Meta que não casam
 * ("<nível> não identificado", "Sem linha nesta tabela") e o total de vendas da
 * Meta só existem quando a Meta está no filtro; com Google somem, e o Total é
 * só o das linhas exibidas (o investimento: `totalSpend` das linhas do filtro).
 */
export function rodapeDoFiltro<C>(
  p: PlataformaDoDetalhamento,
  vendas: { naoIdentificado: C | null; semLinha: C | null; totalMeta: C } | null,
): { naoIdentificado: C | null; semLinha: C | null; totalDeVendas: C | null } {
  if (!vendas || p === "google") return { naoIdentificado: null, semLinha: null, totalDeVendas: null };
  return { naoIdentificado: vendas.naoIdentificado, semLinha: vendas.semLinha, totalDeVendas: vendas.totalMeta };
}
