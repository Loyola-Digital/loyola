import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAllAdSets } from "@/lib/hooks/use-traffic-analytics";
import { useApiClient } from "@/lib/hooks/use-api-client";

interface UseFunnelAdsetsMapResult {
  /** Map de adset_id → adset_name vindo da Meta API. */
  adsetsMap: Map<string, string>;
  isLoading: boolean;
}

/**
 * Story 18.26 Fase 1: hook leve que resolve adset_id → adset_name via
 * endpoint POST /meta-names/resolve (cache DB 24h via meta_entity_names_cache).
 *
 * Use quando voce JA tem a lista de ids (ex: utm_medium da planilha de leads).
 * Evita a chamada Meta API completa do /all-adsets (que retorna insights tambem).
 *
 * Retorna Map vazio enquanto carrega — o consumidor faz fallback pro id
 * literal se a chave não estiver presente.
 */
export function useResolveAdsetNames(
  projectId: string,
  ids: string[],
): UseFunnelAdsetsMapResult {
  const apiClient = useApiClient();
  // Dedup + ordena pra cache key estavel (queryKey hash)
  const dedupedIds = useMemo(() => {
    const set = new Set(ids.filter((x) => x && x.trim().length > 0));
    return Array.from(set).sort();
  }, [ids]);
  const idsKey = dedupedIds.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["meta-names-resolve", projectId, "adset", idsKey],
    queryFn: () =>
      apiClient<{ names: Record<string, string> }>(
        `/api/traffic/analytics/${projectId}/meta-names/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType: "adset", ids: dedupedIds }),
        },
      ),
    enabled: !!projectId && dedupedIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5min no react-query (DB ja cacheia 24h)
  });

  const adsetsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!data?.names) return map;
    for (const [id, name] of Object.entries(data.names)) {
      map.set(id, name);
    }
    return map;
  }, [data]);

  return { adsetsMap, isLoading };
}

/**
 * Constrói um Map de adset_id → adset_name agregado de todas as campanhas
 * vinculadas ao funil. Usado pra resolver `utm_medium` (que armazena o adset_id)
 * pro nome humano do adset.
 *
 * Reusa o endpoint /all-adsets (1 request agregado) — antes fazia N requests
 * (1 por campanha) o que estourava rate limit Meta em funis com muitas
 * campanhas. Cache backend é 15min default em memoria.
 *
 * Story 18.26 Fase 1: pra fluxos que ja tem os ids (planilha), prefira
 * `useResolveAdsetNames` que vai direto no cache DB de 24h sem refetch Meta.
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

