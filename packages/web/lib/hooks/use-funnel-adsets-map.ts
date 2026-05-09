import { useMemo } from "react";
import { useAllAdSets } from "@/lib/hooks/use-traffic-analytics";

interface UseFunnelAdsetsMapResult {
  /** Map de adset_id → adset_name vindo da Meta API. */
  adsetsMap: Map<string, string>;
  isLoading: boolean;
}

/**
 * Constrói um Map de adset_id → adset_name agregado de todas as campanhas
 * vinculadas ao funil. Usado pra resolver `utm_medium` (que armazena o adset_id)
 * pro nome humano do adset.
 *
 * Reusa o endpoint /all-adsets (1 request agregado) — antes fazia N requests
 * (1 por campanha) o que estourava rate limit Meta em funis com muitas
 * campanhas. Cache backend é 15min default.
 *
 * Retorna Map vazio enquanto carrega — o consumidor faz fallback pro id
 * literal se a chave não estiver presente.
 */
export function useFunnelAdsetsMap(
  projectId: string,
  campaignIds: string[],
  days: number = 30,
): UseFunnelAdsetsMapResult {
  const ids = campaignIds.length > 0 ? campaignIds : null;
  const query = useAllAdSets(projectId, days, ids);

  const adsetsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!query.data?.adsets) return map;
    for (const a of query.data.adsets) {
      // No response de all-adsets, `campaignId` e `campaignName` na verdade
      // carregam adset_id e adset_name (backend reusa CampaignAnalytics shape).
      if (a.campaignId && a.campaignName && !map.has(a.campaignId)) {
        map.set(a.campaignId, a.campaignName);
      }
    }
    return map;
  }, [query.data]);

  return { adsetsMap, isLoading: query.isLoading };
}

/**
 * Resolve um `Record<medium, count>` aplicando o `adsetsMap` e re-agrupa por
 * nome resolvido. Se múltiplos adset_ids tiverem o mesmo nome, suas contagens
 * são somadas.
 *
 * Quando o medium não tem match no map (ex: "(sem medium)" ou um ID inválido/
 * de outra conta), preserva o medium original como label.
 */
export function resolveMediumByAdsets(
  byMedium: Record<string, number>,
  adsetsMap: Map<string, string>,
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const [medium, count] of Object.entries(byMedium)) {
    const label = adsetsMap.get(medium) ?? medium;
    resolved[label] = (resolved[label] ?? 0) + count;
  }
  return resolved;
}

/**
 * Versão pra arrays no formato `{ medium, vendas, bruto, liquido }` que vem do
 * stage-sales-data API. Re-agrupa por nome resolvido somando as métricas.
 */
export function resolveSalesByMediumByAdsets<
  T extends { medium: string; vendas: number; bruto: number; liquido: number },
>(items: T[], adsetsMap: Map<string, string>): T[] {
  const grouped = new Map<string, T>();
  for (const item of items) {
    const label = adsetsMap.get(item.medium) ?? item.medium;
    const existing = grouped.get(label);
    if (existing) {
      existing.vendas += item.vendas;
      existing.bruto += item.bruto;
      existing.liquido += item.liquido;
    } else {
      grouped.set(label, { ...item, medium: label });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.vendas - a.vendas);
}

/**
 * Versão pra arrays `{ term, vendas, bruto, liquido }` (utm_term em vendas).
 * Mesmo padrão de resolveSalesByMediumByAdsets — utm_term carrega adset_id no
 * setup Loyola, então fazemos lookup pro nome humano e re-agrupamos.
 */
export function resolveSalesByTermByAdsets<
  T extends { term: string; vendas: number; bruto: number; liquido: number },
>(items: T[], adsetsMap: Map<string, string>): T[] {
  const grouped = new Map<string, T>();
  for (const item of items) {
    const label = adsetsMap.get(item.term) ?? item.term;
    const existing = grouped.get(label);
    if (existing) {
      existing.vendas += item.vendas;
      existing.bruto += item.bruto;
      existing.liquido += item.liquido;
    } else {
      grouped.set(label, { ...item, term: label });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.vendas - a.vendas);
}

