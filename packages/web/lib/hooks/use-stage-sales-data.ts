"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { StageSalesData, StageSalesSubtype } from "@loyola-x/shared";

const STALE_TIME = 30 * 1000;

export function useStageSalesData(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  // Story 18.38: aceita um subtype único OU CSV ("main_product,tmb") pra agregar
  // Produto Principal + TMB numa resposta só (mesmo padrão do useAllSales).
  subtype: StageSalesSubtype | (string & {}),
  days?: number
) {
  const apiClient = useApiClient();
  const query = useQuery({
    queryKey: ["stage-sales-data", projectId, funnelId, stageId, subtype, days],
    queryFn: () => {
      const qs = new URLSearchParams({ subtype, debug: "1" });
      if (days) qs.set("days", String(days));
      return apiClient<StageSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/sales-data?${qs}`
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });

  // Story 28.4 hotfix: loga debug counters automaticamente no console quando
  // a query retorna — sem precisar adicionar ?debug=1 manual na URL.
  useEffect(() => {
    if (query.data?.debug) {
      console.log(
        `[stage-sales-data] ${subtype} (stage=${stageId}, days=${days ?? "all"})`,
        query.data.debug,
        { totalVendas: query.data.totalVendas, faturamentoBruto: query.data.faturamentoBruto }
      );
    }
  }, [query.data, subtype, stageId, days]);

  return query;
}
