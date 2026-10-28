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
// Story 29.59: a regra mudou para o shared, para que o relatório da API use a
// MESMA identidade de LP. Subpath porque este é o lado web — ver `index.ts`.
import { normalizeLpUrl } from "@loyola-x/shared/src/lp-url";
import {
  txConvConsolidada,
  txConvMidiaPaga,
  type TxConvConsolidada,
} from "@loyola-x/shared/src/taxa-conversao-lp";

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
  /** Story 18.91: LP View do anúncio; `null`/ausente = não medido (API < v55). */
  lpViews?: number | null;
  revenue?: number | null;
  sales?: number | null;
}

/**
 * Story 18.99 — o que a API (`/ad-link-urls`, contrato 61) diz de cada
 * anúncio para a coluna Status. Só os anúncios com status no cache estão em
 * `statusByAdId`: ausência é "desconhecido", nunca "pausado".
 */
export interface StatusDosAnuncios {
  statusByAdId: Record<string, "active" | "paused">;
  /** A campanha conta pelo id (como na 18.97); o nome vai para o tooltip. */
  campanhaByAdId?: Record<string, { campaignId: string; nome: string }>;
}

/**
 * Story 18.99 (AC6) — junta a resposta dos lotes de `/ad-link-urls`.
 *
 * Só há status se **todos** os lotes responderam com o campo. Lote ainda
 * carregando, com erro ou de API anterior ao contrato 61 deixa o conjunto
 * desconhecido ("—"). Juntar só os que chegaram podia pôr "Pausado" na linha
 * "Sem link resolvido" quando o único anúncio ativo estava no lote que falhou
 * (QA 18.99 REL-001).
 */
export function juntarStatusDosLotes(
  lotes: Array<Partial<StatusDosAnuncios> | undefined>,
): StatusDosAnuncios | undefined {
  if (lotes.length === 0 || lotes.some((l) => l?.statusByAdId === undefined)) return undefined;
  return {
    statusByAdId: Object.assign({}, ...lotes.map((l) => l?.statusByAdId)),
    campanhaByAdId: Object.assign({}, ...lotes.map((l) => l?.campanhaByAdId ?? {})),
  };
}

export type LpRow = DetailMetricsOutput & {
  key: string;
  url: string | null;
  isUnresolved: boolean;
  /**
   * Story 29.43 (AC2) — as TRÊS causas da não-resolução, contadas em anúncios.
   * Cada uma pede uma ação diferente do gestor, e tratá-las como uma só era o
   * defeito: a tela dizia QUANTO não foi atribuído, nunca POR QUÊ.
   */
  /** Está no cache, carimbado pelo resolver atual, e a Meta não tem URL. */
  semLinkNaMeta: number;
  /** Nunca sincronizado — abrir a aba Criativos resolve. */
  foraDoCache: number;
  /** Cache escrito por código anterior à 29.40 — exige backfill de criativos. */
  cacheDesatualizado: number;
  /**
   * Gate QA-11 — a API não informou `staleInCache`, então a causa do `null` é
   * **desconhecida**. Não é "a Meta não tem": afirmar isso encerraria a
   * investigação do gestor com base numa informação que não temos.
   *
   * Acontece quando o web está mais novo que a API — cenário recorrente neste
   * projeto (a própria 29.43 nasceu de uma janela dessas) porque o web sobe no
   * merge e a API é deploy separado.
   */
  causaIndeterminada: number;
  revenue: number;
  sales: number;
  /** Story 18.91: LP View da LP, ou `null` se algum anúncio dela não o informou. */
  lpViews: number | null;
  /** Story 18.91 (AC11): vendas atribuídas à LP ÷ LP View da LP × 100. */
  txConvMidiaPaga: number | null;
  /** Story 18.91 (AC11/P18): as mesmas vendas ÷ usuários únicos da LP — ou o motivo. */
  txConvConsolidada: TxConvConsolidada;
  /**
   * Story 18.99 (AC2) — a regra da 18.97: "active" se ≥ 1 anúncio da linha está
   * ACTIVE; "paused" se há status conhecido e nenhum ativo; "unknown" se nenhum
   * anúncio tem status. `undefined` = a API não informou (anterior ao
   * contrato 61). Os dois últimos viram "—" na tela.
   */
  status?: "active" | "paused" | "unknown";
  /**
   * Story 18.99 (AC3) — nomes das campanhas distintas (por `campaignId`) dos
   * anúncios ativos, em ordem alfabética, para o tooltip. Anúncio ativo sem
   * campanha conhecida cai num grupo único "", que conta 1 e não tem nome.
   */
  campanhasAtivas?: string[];
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
  /**
   * Story 29.43 (AC2): ad_ids cuja linha de cache foi escrita por código
   * anterior à correção do resolver.
   *
   * Gate QA-11 — `undefined` e `[]` significam coisas DIFERENTES e o código
   * anterior os colapsava:
   *
   *   `undefined` → a API não informou (versão antiga) → causa desconhecida
   *   `[]`        → a API informou que não há nenhum   → o `null` é da Meta
   *
   * Tratar o primeiro como o segundo fazia a tela afirmar "sem URL na Meta"
   * para linhas que eram só cache velho — e essa é a única das causas que não
   * tem ação, ou seja, a que encerra a investigação.
   */
  staleInCache?: string[],
  /**
   * Story 18.99: status e campanha por ad_id. `undefined` = a API não
   * informou → nenhuma linha ganha status (a coluna mostra "—").
   */
  statusDosAnuncios?: StatusDosAnuncios,
): LpRow[] {
  if (!ads.length) return [];
  const missing = new Set(missingFromCache);
  const apiInformouStale = staleInCache !== undefined;
  const stale = new Set(staleInCache ?? []);

  type Acc = {
    key: string; url: string | null;
    spend: number; impressions: number; clicks: number; linkClicks: number;
    lpViews: number | null;
    revenue: number; sales: number;
    semLinkNaMeta: number; foraDoCache: number;
    cacheDesatualizado: number; causaIndeterminada: number;
    ativos: number; comStatus: number; campanhasAtivas: Map<string, string>;
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
      spend: 0, impressions: 0, clicks: 0, linkClicks: 0, lpViews: 0, revenue: 0, sales: 0,
      semLinkNaMeta: 0, foraDoCache: 0, cacheDesatualizado: 0, causaIndeterminada: 0,
      ativos: 0, comStatus: 0, campanhasAtivas: new Map<string, string>(),
    };
    acc.spend += ad.spend;
    acc.impressions += ad.impressions;
    acc.clicks += ad.clicks;
    acc.linkClicks += ad.linkClicks ?? 0;
    acc.lpViews = ad.lpViews == null || acc.lpViews === null ? null : acc.lpViews + ad.lpViews;
    acc.revenue += ad.revenue ?? 0;
    acc.sales += ad.sales ?? 0;
    // Story 18.99 (AC2): o status sai dos MESMOS anúncios cujo gasto entra na
    // linha, já cortados pelo filtro de público. `campaignId` carrega o ad_id.
    const status = statusDosAnuncios?.statusByAdId[ad.campaignId];
    if (status) {
      acc.comStatus += 1;
      if (status === "active") {
        acc.ativos += 1;
        const campanha = statusDosAnuncios?.campanhaByAdId?.[ad.campaignId];
        acc.campanhasAtivas.set(campanha?.campaignId ?? "", campanha?.nome ?? "");
      }
    }
    if (!key) {
      // Ordem importa: fora do cache é a causa mais forte (não há linha), e
      // cache velho tem precedência sobre "a Meta não tem" — afirmar ausência
      // na Meta com base numa linha que nunca perguntou seria inventar.
      if (missing.has(ad.campaignId)) acc.foraDoCache += 1;
      else if (stale.has(ad.campaignId)) acc.cacheDesatualizado += 1;
      else if (!apiInformouStale) acc.causaIndeterminada += 1;
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
    cacheDesatualizado: g.cacheDesatualizado,
    causaIndeterminada: g.causaIndeterminada,
    revenue: g.revenue,
    sales: g.sales,
    lpViews: g.lpViews,
    // Story 18.91: a fórmula única do shared. Numerador = as vendas da linha
    // (atribuídas ao anúncio, P13); na Consolidada só o denominador muda (P18).
    txConvMidiaPaga: g.lpViews === null ? null : txConvMidiaPaga(g.sales, g.lpViews),
    txConvConsolidada: txConvConsolidada(g.sales, { motivo: "pendente" }),
    ...(statusDosAnuncios
      ? {
          status: g.ativos > 0 ? "active" as const : g.comStatus > 0 ? "paused" as const : "unknown" as const,
          campanhasAtivas: [...g.campanhasAtivas.values()].sort((x, y) => x.localeCompare(y, "pt-BR")),
        }
      : {}),
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
  col: "lp" | "status" | "spend" | "revenue" | "margin" | "marginPct" | "sales" | "cac" | "roas",
  dir: "asc" | "desc",
): LpRow[] {
  const num = (v: number | null | undefined) => (v == null ? Number.NEGATIVE_INFINITY : v);
  const key = (r: LpRow): number | string => {
    switch (col) {
      case "lp": return r.key;
      // Story 18.99 (AC4): Ativo → Pausado → "—", o rank da 18.61/18.97. O "—"
      // é 0, não -Infinity: muitas linhas sem status dariam -Inf - -Inf = NaN
      // no comparador, e o sort com NaN não tem ordem definida.
      case "status": return r.status === "active" ? 2 : r.status === "paused" ? 1 : 0;
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

/**
 * Gate QA-13 — o tom do aviso de cobertura, como função pura.
 *
 * Estava embutido no JSX, o que o tornava inalcançável por teste — e o AC6
 * pedia explicitamente um caso para "100% não resolvido → análise impossível".
 *
 * A distinção não é cosmética: uma tabela em que TODO o investimento caiu na
 * linha "—" não é uma comparação parcial, é a ausência de comparação. Chamá-la
 * de "análise parcial" sugere que as demais linhas dizem algo, quando não há
 * demais linhas.
 */
export type LpCoverageTone = "ok" | "parcial" | "impossivel";

/** Abaixo disto o aviso não aparece: ruído de atribuição é esperado. */
export const LP_PARTIAL_THRESHOLD = 10;
/** A partir daqui não sobrou investimento atribuído com que comparar. */
export const LP_IMPOSSIBLE_THRESHOLD = 99.5;

export function classifyLpCoverage(unresolvedSharePct: number): LpCoverageTone {
  if (unresolvedSharePct >= LP_IMPOSSIBLE_THRESHOLD) return "impossivel";
  if (unresolvedSharePct >= LP_PARTIAL_THRESHOLD) return "parcial";
  return "ok";
}
