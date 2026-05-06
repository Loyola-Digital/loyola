import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { AdSetAnalyticsResponse } from "@/lib/hooks/use-traffic-analytics";

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
 * Uma campanha pode ter N adsets; o hook faz uma query paralela por campanha
 * via React Query. Cache de 60s evita refetch agressivo já que adsets mudam
 * pouco.
 *
 * Retorna Map vazio enquanto carrega — o consumidor faz fallback pro
 * id literal se a chave não estiver presente.
 */
export function useFunnelAdsetsMap(
  projectId: string,
  campaignIds: string[],
  days: number = 30,
): UseFunnelAdsetsMapResult {
  const apiClient = useApiClient();

  const queries = useQueries({
    queries: campaignIds.map((campaignId) => ({
      queryKey: ["funnel-adsets-map", projectId, campaignId, days] as const,
      queryFn: () =>
        apiClient<AdSetAnalyticsResponse>(
          `/api/traffic/analytics/${projectId}/adsets?campaignId=${campaignId}&days=${days}`,
        ),
      staleTime: 60 * 1000,
      enabled: !!projectId && campaignIds.length > 0,
    })),
  });

  const adsetsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of queries) {
      const data = q.data;
      if (!data?.adsets) continue;
      for (const a of data.adsets) {
        // No response de adsets, `campaignId` e `campaignName` na verdade carregam
        // adset_id e adset_name (o backend reusa CampaignAnalytics shape).
        if (a.campaignId && a.campaignName && !map.has(a.campaignId)) {
          map.set(a.campaignId, a.campaignName);
        }
      }
    }
    return map;
  }, [queries]);

  const isLoading = queries.some((q) => q.isLoading);

  return { adsetsMap, isLoading };
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

interface AdNameMapResponse {
  map: Record<string, string>;
}

/**
 * Hook que retorna Map<ad_id, ad_name> de TODOS os ads das campanhas do funil
 * (sem agregar por nome). Usa o endpoint `/ad-name-map` que preserva todos os
 * pares (vários ad_ids podem ter o mesmo nome — mesmo criativo em adsets/
 * campanhas diferentes).
 *
 * Necessário pra resolver `utm_content` (ad_id) → ad_name na tabela "Por Content
 * (Ad)" da seção de vendas — `useAllAds` agrega por nome e não serve aqui.
 */
export function useFunnelAdNamesMap(
  projectId: string,
  campaignIds: string[],
  days: number = 30,
) {
  const apiClient = useApiClient();
  const enabled = !!projectId && campaignIds.length > 0;
  const ids = campaignIds.slice().sort().join(",");

  const query = useQuery({
    queryKey: ["funnel-ad-names-map", projectId, ids, days] as const,
    queryFn: () =>
      apiClient<AdNameMapResponse>(
        `/api/traffic/analytics/${projectId}/ad-name-map?days=${days}&campaignIds=${encodeURIComponent(ids)}`,
      ),
    staleTime: 60 * 1000,
    enabled,
  });

  const adsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!query.data?.map) return map;
    for (const [id, name] of Object.entries(query.data.map)) {
      if (id && name) map.set(id, name);
    }
    return map;
  }, [query.data]);

  return { adsMap, isLoading: query.isLoading };
}

/**
 * Versão pra arrays `{ content, vendas, bruto, liquido }` (utm_content em
 * vendas). utm_content carrega ad_id no setup Loyola — fazemos lookup pro nome
 * humano e re-agrupamos pelos mesmos nomes de ad.
 */
export function resolveSalesByContentByAds<
  T extends { content: string; vendas: number; bruto: number; liquido: number },
>(items: T[], adsMap: Map<string, string>): T[] {
  const grouped = new Map<string, T>();
  for (const item of items) {
    const label = adsMap.get(item.content) ?? item.content;
    const existing = grouped.get(label);
    if (existing) {
      existing.vendas += item.vendas;
      existing.bruto += item.bruto;
      existing.liquido += item.liquido;
    } else {
      grouped.set(label, { ...item, content: label });
    }
  }
  return Array.from(grouped.values()).sort((a, b) => b.vendas - a.vendas);
}
