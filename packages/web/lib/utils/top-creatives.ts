import type {
  TopPerformerAd,
  MetaAdCreative,
  VideoMetrics,
} from "@/lib/hooks/use-traffic-analytics";
import type { FunnelSpreadsheetRow } from "@/lib/types/funnel-spreadsheet";
import { PAID_SOURCES, safeDivide } from "@/lib/utils/funnel-metrics";
import { normalizeNumericId, utmContentEfetivo } from "@/lib/utils/normalize-answer";
// Story 29.65 (AC4): o piso de amostra é o MESMO da 43.8. Um terceiro critério
// de "amostra suficiente" no painel seria uma terceira resposta para a mesma
// pergunta — e nenhuma delas ganharia a confiança de quem lê.
import { PISO_DE_REPRODUCOES } from "@loyola-x/shared/src/video-camadas";

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
  /**
   * **CTR sobre cliques NO LINK** — decisão do gestor em 2026-09-03: o produto
   * tem um CTR só, e é este. `Σ linkClicks ÷ Σ impressões × 100`.
   *
   * `null` quando a Meta não devolveu `link_click` nas actions de nenhum
   * anúncio do grupo. **Sem fallback para cliques totais**: era o fallback
   * silencioso de `buildAnalyticsRow` que fazia esta galeria mostrar um CTR e a
   * tabela de Desempenho de Criativos mostrar outro, com o mesmo rótulo.
   */
  ctr: number | null;
  /** CPC sobre cliques NO LINK. Mesma regra de ausência do `ctr`. */
  cpc: number | null;
  /** Cliques em qualquer lugar do anúncio. Guardado como dado bruto. */
  clicksTotais: number;
  creative: MetaAdCreative | null;
  parentInfo?: string;
  /**
   * ⚠️ Métricas de vídeo do anúncio LÍDER (maior investimento do grupo) — NÃO
   * do grupo inteiro. Mantido como estava para não mudar quem já lia isto.
   *
   * **Não derive taxa daqui.** O numerador seria de 1 anúncio e o denominador
   * (`impressions`, logo acima) é a soma de N. Use `hookRate`.
   */
  videoMetrics?: VideoMetrics | null;
  /**
   * Story 29.65 — gancho do grupo: `Σ views3s ÷ Σ impressões × 100`.
   *
   * `null` quando NENHUM anúncio do grupo tem `views3s` — nunca `0`. A 43.3
   * deixa o campo `undefined` de propósito para "não medimos" não se passar por
   * "ninguém assistiu", e num filtro chamado *Melhores Hooks* essa diferença é
   * a diferença entre omitir e acusar.
   */
  hookRate: number | null;
  /** Σ views3s do grupo. `null` = nenhum anúncio trouxe a métrica. */
  views3s: number | null;
  /** Story 18.76: Σ views a 75% do grupo. `null` = ninguém trouxe a métrica. */
  views75: number | null;
  /** Story 18.76: `Σ views75 ÷ Σ views3s × 100`. `null` ≠ 0. */
  holdRate: number | null;
  /** Story 18.76: `Σ spend ÷ Σ impressões × 1000`. Nunca média de CPMs. */
  cpm: number | null;
  /**
   * Story 18.76 (AC11): Σ cliques no link do grupo. **Diferente de `clicks`**,
   * que conta clique em qualquer lugar do anúncio. `null` = não medido.
   */
  linkClicks: number | null;
  /** Story 29.65 (AC4): abaixo do piso de reproduções — fora do ranking. */
  amostraBaixa: boolean;

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
/**
 * Story 18.74 (AC3) — a visão "Todos": um card por ANÚNCIO, sem agrupar.
 *
 * Reusa `aggregateCreativesByName` com uma lista de um elemento em vez de
 * reimplementar a construção do `AggregatedCreative`. Duas construções do mesmo
 * objeto divergiriam no dia em que um campo novo entrasse — e o sintoma seria
 * uma aba mostrando um número que a outra não mostra.
 *
 * A unidade muda: aqui `ids` tem sempre um elemento, e o mesmo nome pode
 * aparecer N vezes. Quem consome precisa usar `ids[0]` como chave, não `name`.
 */
export function aggregateCreativesByAd(ads: TopPerformerAd[]): AggregatedCreative[] {
  return ads.flatMap((ad) => aggregateCreativesByName([ad]));
}

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

    // Story 29.65 — o gancho do grupo sai dos SOMATÓRIOS, não do líder.
    //
    // `videoMetrics` abaixo é do anúncio de maior investimento; `impressions`
    // acima é a soma de todos. Dividir um pelo outro mistura numerador de 1 com
    // denominador de N — e não erra pouco. Medido ao vivo no BBE (2026-08-26,
    // 30 dias), pelo caminho que esta tela usa:
    //
    //   ADS 5 V3 REEDITADO   4 ads   25,59% real  →   7,75% pelo líder  (−70%)
    //   ADS 3 V4             8 ads   21,96% real  →   8,24% pelo líder  (−62%)
    //   ADS 5 V1 REEDITADO   4 ads   25,47% real  →  11,55% pelo líder  (−55%)
    //
    // 96,8% dos grupos do BBE têm mais de um anúncio, então isso não é caso de
    // borda: é o caso comum. O terceiro exemplo bate a meta de 25% e apareceria
    // entre os piores do funil.
    //
    // Só os anúncios que TÊM a métrica entram nas duas pontas. Somar as
    // impressões de quem não tem infla o denominador — o erro estrutural que a
    // 43.8 documentou. (Medido: nos 10 maiores grupos do BBE isso não muda o
    // resultado, porque o anúncio sem `views3s` tem impressões desprezíveis.
    // Fazer certo custa uma linha e para de depender dessa coincidência.)
    const comVideo = sorted.filter((a) => a.videoMetrics?.views3s != null);
    const views3s =
      comVideo.length > 0
        ? comVideo.reduce((s, a) => s + (a.videoMetrics!.views3s ?? 0), 0)
        : null;
    const impressoesDeVideo = comVideo.reduce((s, a) => s + a.impressions, 0);
    const hookRate =
      views3s === null || impressoesDeVideo <= 0
        ? null
        : (views3s / impressoesDeVideo) * 100;

    /**
     * Story 18.76 (AC8/AC10) — Hold Rate do GRUPO: `Σ views75 ÷ Σ views3s`.
     *
     * Mesma regra do `hookRate` acima: só os anúncios que TÊM a métrica entram
     * nas duas pontas, e `null` quando nenhum tem. A fonte é `videoMetrics.p75`
     * do anúncio — **não** o `videoMetrics` do líder do grupo, que é de UM
     * anúncio e erraria o denominador (o defeito que a 29.64 pagou).
     */
    const views75 =
      comVideo.length > 0
        ? comVideo.reduce((s, a) => s + (a.videoMetrics?.p75 ?? 0), 0)
        : null;
    const holdRate =
      views75 === null || views3s === null || views3s <= 0
        ? null
        : (views75 / views3s) * 100;

    /**
     * Story 18.76 — CPM do grupo: `Σ spend ÷ Σ impressões × 1000`.
     * Média de CPMs não é o CPM do grupo: um anúncio caro com 10 impressões
     * puxaria a média sem ter custado quase nada.
     */
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;

    /**
     * Story 18.76 (AC11) — cliques NO LINK, somados do grupo.
     *
     * `clicks` (acima) é o clique em qualquer lugar do anúncio; `linkClicks` é
     * o `inline_link_clicks`. Os dois existem no payload e são números
     * diferentes — a tabela de Desempenho de Criativos usa o segundo desde a
     * 18.59, e é ele que a categoria "Cliques no link" precisa.
     *
     * `null` quando NENHUM anúncio do grupo trouxe a métrica: a Meta não
     * devolve `inline_link_clicks` para todo objetivo de campanha, e zerar
     * transformaria "não medido" em "ninguém clicou".
     */
    const comLinkClicks = sorted.filter((a) => a.linkClicks != null);
    const linkClicks =
      comLinkClicks.length > 0
        ? comLinkClicks.reduce((s, a) => s + (a.linkClicks ?? 0), 0)
        : null;
    /**
     * Um CTR só no produto, e é o de link (decisão do gestor, 2026-09-03).
     * `0` medido continua sendo `0` — só a ausência da métrica vira `null`.
     */
    const ctrDeLink =
      linkClicks === null || impressions <= 0 ? null : (linkClicks / impressions) * 100;
    const cpcDeLink = linkClicks === null || linkClicks <= 0 ? null : spend / linkClicks;

    result.push({
      name,
      ids: sorted.map((a) => a.campaignId),
      spend,
      impressions,
      clicks,
      reach,
      ctr: ctrDeLink,
      cpc: cpcDeLink,
      clicksTotais: clicks,
      creative: leader.creative ?? null,
      parentInfo: `${leader.parentCampaignName} › ${leader.adsetName}`,
      videoMetrics: leader.videoMetrics,
      hookRate,
      views3s,
      views75,
      holdRate,
      cpm,
      linkClicks,
      // Story 29.65 (AC4): mesmo piso da 43.8, não um terceiro critério novo.
      // Um criativo com 200 impressões e 3 reproduções mostra 1,5% ou 60%
      // dependendo do dia; sem piso, o topo de "Melhores Hooks" vira ruído.
      amostraBaixa: (views3s ?? 0) < PISO_DE_REPRODUCOES,

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
    const utmContent = utmContentEfetivo(row.named.utm_content ?? "");
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
    const utmContent = utmContentEfetivo(row.named.utm_content ?? "");
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
 * Story 8.9: resultado do cálculo do limiar de relevância estatística.
 *
 * - `mode: 'cpa'` — há vendas no período. threshold = 2 × (sum(spend) / sum(vendas)).
 * - `mode: 'spend'` — fallback sem vendas. threshold = 2 × (sum(spend) / count(spend>0)).
 * - `mode: 'disabled'` — lista vazia ou spend total = 0. Filtro inativo.
 *
 * `cpaMedio` só é populado em `mode: 'cpa'`.
 */
export interface RelevanceThreshold {
  threshold: number;
  mode: "cpa" | "spend" | "disabled";
  cpaMedio: number | null;
}

/**
 * Story 8.9: calcula o limiar de gasto a partir do qual um criativo tem
 * relevância estatística no período. Regra original 2× (Lucas, 2026-05-19),
 * revisada pra 1,5× na Story 18.29 (Lucas, 2026-06-08) pra exibir mais
 * criativos por padrão (o 2× ocultava demais em CBO):
 *
 *   threshold = 1,5 × CPA agregado do período
 *   onde CPA agregado = sum(spend) / sum(vendas) sobre todos os criativos
 *
 * Fallback (sum(vendas) === 0): usa gasto médio em vez de CPA.
 * Fallback duplo (lista vazia ou spend total = 0): desativa o filtro.
 *
 * Função PURA — não muta a lista de entrada. Cálculo client-side, leve.
 */
export function computeRelevanceThreshold(
  creatives: AggregatedCreative[],
): RelevanceThreshold {
  if (creatives.length === 0) {
    return { threshold: 0, mode: "disabled", cpaMedio: null };
  }
  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  if (totalSpend === 0) {
    return { threshold: 0, mode: "disabled", cpaMedio: null };
  }
  const totalSales = creatives.reduce((s, c) => s + c.salesLegacy, 0);
  if (totalSales > 0) {
    const cpaMedio = totalSpend / totalSales;
    return { threshold: 1.5 * cpaMedio, mode: "cpa", cpaMedio };
  }
  // Fallback: sem vendas no período → usa gasto médio entre criativos com spend > 0
  const withSpend = creatives.filter((c) => c.spend > 0).length;
  if (withSpend === 0) {
    return { threshold: 0, mode: "disabled", cpaMedio: null };
  }
  const gastoMedio = totalSpend / withSpend;
  return { threshold: 1.5 * gastoMedio, mode: "spend", cpaMedio: null };
}

/**
 * Story 8.9: aplica o filtro de relevância sobre uma lista agregada.
 * Criativos com `spend < threshold` são separados. Retorna a lista visível
 * e a contagem de ocultos pra o indicador no UI.
 *
 * Se `mode === 'disabled'`, retorna a lista inteira intacta (filtro inativo).
 */
export function applyRelevanceFilter(
  creatives: AggregatedCreative[],
  threshold: RelevanceThreshold,
): { visible: AggregatedCreative[]; hiddenCount: number } {
  if (threshold.mode === "disabled") {
    return { visible: creatives, hiddenCount: 0 };
  }
  const visible: AggregatedCreative[] = [];
  let hiddenCount = 0;
  for (const c of creatives) {
    if (c.spend >= threshold.threshold) {
      visible.push(c);
    } else {
      hiddenCount += 1;
    }
  }
  return { visible, hiddenCount };
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

/**
 * Story 28.2: versão dinâmica do `mergeSurveyForGroup`. Aceita um conjunto
 * arbitrário de `questionKeys` (vindas do mapping configurado) e retorna o top-1
 * de cada uma. Substitui o `mergeSurveyForGroup` quando a pesquisa usa mapping
 * dinâmico — galera nova passa a renderizar as perguntas custom do usuário.
 */
export function mergeSurveyDynamicForGroup(
  surveyDataByAdId: Record<string, Record<string, Array<{ label: string; count: number }>>> | undefined,
  questionKeys: string[],
  adIds: string[],
  totalLeadsOfGroup: number,
): Record<string, TopSurveyAnswer | null> {
  const result: Record<string, TopSurveyAnswer | null> = {};
  if (!surveyDataByAdId || questionKeys.length === 0) {
    for (const k of questionKeys) result[k] = null;
    return result;
  }
  const buckets = new Map<string, Map<string, number>>();
  const totalResponses = new Map<string, number>();
  for (const k of questionKeys) {
    buckets.set(k, new Map());
    totalResponses.set(k, 0);
  }
  for (const rawId of adIds) {
    const adData = surveyDataByAdId[rawId] ?? surveyDataByAdId[normalizeNumericId(rawId)];
    if (!adData) continue;
    for (const key of questionKeys) {
      const entries = adData[key];
      if (!entries) continue;
      const bucket = buckets.get(key)!;
      for (const item of entries) {
        bucket.set(item.label, (bucket.get(item.label) ?? 0) + item.count);
        totalResponses.set(key, (totalResponses.get(key) ?? 0) + item.count);
      }
    }
  }
  for (const key of questionKeys) {
    const bucket = buckets.get(key)!;
    let best: TopSurveyAnswer | null = null;
    for (const [label, count] of bucket.entries()) {
      if (!best || count > best.count) {
        best = {
          label,
          count,
          total: totalLeadsOfGroup,
          totalResponses: totalResponses.get(key) ?? 0,
        };
      }
    }
    result[key] = best;
  }
  return result;
}
