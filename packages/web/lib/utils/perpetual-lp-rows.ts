// ============================================================
// Story 29.40 — agregação dos anúncios por landing page.
//
// Vive fora do componente pelo mesmo motivo que `mergeConfigValues` saiu do
// handler na 29.38: a regra é de DOMÍNIO, não de apresentação. Enterrada num
// `useMemo` ela seria invisível para revisão e impossível de testar sem montar
// a árvore inteira do dashboard — e o AC6 exige provar, automatizadamente, que
// a soma desta tabela fecha com a do Detalhamento.
//
// A invariante que este módulo protege:
//
//   soma(investimento das linhas de LP, incluindo "Sem link resolvido")
//     === soma(investimento dos anúncios que entraram)
//
// Se ela quebrar, a tabela "quase bate" com o Detalhamento — e "quase" é
// indistinguível de erro de cálculo para quem lê.
// ============================================================

import { deriveDetailMetrics, type DetailMetricsOutput } from "./perpetual-detail-metrics";
import { normalizeLpUrl } from "./lp-url";

/** Chave da linha que recolhe o investimento sem LP identificada. */
export const UNRESOLVED_LP_KEY = "—";

/** O mínimo que um anúncio precisa expor para entrar na agregação. */
export interface LpAdInput {
  campaignId: string;
  /** Spend JÁ tributado pelo backend — nunca multiplicar por imposto aqui. */
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks?: number | null;
  revenue?: number | null;
  sales?: number | null;
}

export type LpRow = DetailMetricsOutput & {
  key: string;
  url: string | null;
  isUnresolved: boolean;
  semLinkNaMeta: number;
  foraDoCache: number;
  revenue: number;
  sales: number;
};

/**
 * Agrupa anúncios por LP normalizada e deriva as métricas de cada linha.
 *
 * @param ads         anúncios do funil (a mesma população do Detalhamento no
 *                    modo Criativo — é isso que faz o AC6 fechar por construção)
 * @param linkUrls    ad_id → URL de destino; ausente ou `null` = não resolvido
 * @param missingFromCache ad_ids ainda não sincronizados, para distinguir a
 *                    causa da não-resolução no tooltip (AC5)
 * @param feeRate     taxa da plataforma, para a margem líquida (AC4)
 */
export function buildLpRows(
  ads: LpAdInput[],
  linkUrls: Record<string, string | null>,
  missingFromCache: string[],
  feeRate: number,
): LpRow[] {
  if (!ads.length) return [];
  const missing = new Set(missingFromCache);

  type Acc = {
    key: string; url: string | null;
    spend: number; impressions: number; clicks: number; linkClicks: number;
    revenue: number; sales: number;
    semLinkNaMeta: number; foraDoCache: number;
  };
  const groups = new Map<string, Acc>();

  for (const ad of ads) {
    const raw = linkUrls[ad.campaignId] ?? null;
    const key = normalizeLpUrl(raw);
    // AC5: o não resolvido NUNCA é omitido. Omitir sumiria com o investimento
    // e a soma deixaria de bater sem que nada avisasse — pior que uma linha
    // feia, porque some em silêncio (GR-01).
    const bucket = key ?? UNRESOLVED_LP_KEY;
    const acc = groups.get(bucket) ?? {
      key: bucket, url: key ? raw : null,
      spend: 0, impressions: 0, clicks: 0, linkClicks: 0, revenue: 0, sales: 0,
      semLinkNaMeta: 0, foraDoCache: 0,
    };
    acc.spend += ad.spend;
    acc.impressions += ad.impressions;
    acc.clicks += ad.clicks;
    acc.linkClicks += ad.linkClicks ?? 0;
    acc.revenue += ad.revenue ?? 0;
    acc.sales += ad.sales ?? 0;
    if (!key) {
      if (missing.has(ad.campaignId)) acc.foraDoCache += 1;
      else acc.semLinkNaMeta += 1;
    }
    groups.set(bucket, acc);
  }

  return Array.from(groups.values()).map((g) => ({
    key: g.key,
    url: g.url,
    isUnresolved: g.key === UNRESOLVED_LP_KEY,
    semLinkNaMeta: g.semLinkNaMeta,
    foraDoCache: g.foraDoCache,
    revenue: g.revenue,
    sales: g.sales,
    // AC4: mesma aritmética do Detalhamento, via a MESMA função. Taxas são
    // re-derivadas dos somatórios da linha, jamais média das taxas dos
    // anúncios — média de médias foi bug antes e daria número errado calado.
    ...deriveDetailMetrics(
      {
        spend: g.spend, impressions: g.impressions, clicks: g.clicks,
        linkClicks: g.linkClicks > 0 ? g.linkClicks : null,
        revenue: g.revenue, sales: g.sales,
      },
      feeRate,
    ),
  }));
}

/**
 * Ordena o CONJUNTO INTEIRO e empurra "Sem link resolvido" para o fim.
 *
 * Ordenar antes de paginar é regra do AC2b da 29.32 — paginar antes já foi bug
 * uma vez, e o sintoma é traiçoeiro: a página 1 mostra o topo da página 1, não
 * o topo da tabela, e ninguém percebe até conferir à mão.
 */
export function sortLpRows(
  rows: LpRow[],
  col: "lp" | "spend" | "revenue" | "margin" | "marginPct" | "sales" | "cac" | "roas",
  dir: "asc" | "desc",
): LpRow[] {
  const num = (v: number | null | undefined) => (v == null ? Number.NEGATIVE_INFINITY : v);
  const key = (r: LpRow): number | string => {
    switch (col) {
      case "lp": return r.key;
      case "spend": return r.spend;
      case "revenue": return r.revenue;
      case "margin": return r.margin;
      case "marginPct": return num(r.marginPct);
      case "sales": return r.sales;
      case "cac": return num(r.costPerSale);
      case "roas": return num(r.roas);
      default: return r.spend;
    }
  };
  const sorted = [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    const cmp = typeof ka === "string" && typeof kb === "string"
      ? ka.localeCompare(kb, "pt-BR")
      : (ka as number) - (kb as number);
    return dir === "asc" ? cmp : -cmp;
  });
  return [...sorted.filter((r) => !r.isUnresolved), ...sorted.filter((r) => r.isUnresolved)];
}
