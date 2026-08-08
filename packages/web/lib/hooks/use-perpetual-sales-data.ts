"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type { PerpetualSalesData, PerpetualSalesDataDaily } from "@loyola-x/shared";

const STALE_TIME = 2 * 60 * 1000;

function buildRangeQuery(days: number, startDate?: string, endDate?: string): string {
  if (startDate && endDate) return `startDate=${startDate}&endDate=${endDate}`;
  return `days=${days}`;
}

export function usePerpetualSalesData(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data", projectId, funnelId, days, startDate, endDate],
    queryFn: () =>
      apiClient<PerpetualSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data?${buildRangeQuery(days, startDate, endDate)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

export function usePerpetualSalesDataDaily(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data-daily", projectId, funnelId, days, startDate, endDate],
    queryFn: () =>
      apiClient<PerpetualSalesDataDaily>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily?${buildRangeQuery(days, startDate, endDate)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
  });
}

/** Story 29.42 (AC8) — dimensões que o `groupBy` do daily aceita. */
export type SalesDailyGroupBy = "campaign" | "adset" | "ad";

/** Série diária de UMA entidade (chave = valor cru do UTM, isto é, o ID Meta). */
export interface SalesDailyByEntity {
  revenueByDay: Record<string, number>;
  salesByDay: Record<string, number>;
}

export interface PerpetualSalesDataDailyGrouped {
  byDay: Record<string, number>;
  salesByDay: Record<string, number>;
  byEntity?: Record<string, SalesDailyByEntity>;
  groupBy?: SalesDailyGroupBy;
  semDados: boolean;
}

/**
 * Story 29.42 (AC8) — receita e vendas por entidade POR DIA.
 *
 * Query separada da `usePerpetualSalesDataDaily` de propósito: `byEntity` é
 * campo aditivo no backend, mas cachear as duas sob a mesma chave faria a
 * versão sem `groupBy` servir resposta com `byEntity` de outra dimensão (ou o
 * contrário) conforme a ordem de montagem dos componentes.
 */
export function usePerpetualSalesDataDailyByEntity(
  projectId: string | null,
  funnelId: string | null,
  groupBy: SalesDailyGroupBy | null,
  days: number,
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: [
      "perpetual-sales-data-daily-by-entity",
      projectId, funnelId, groupBy, days, startDate, endDate,
    ],
    queryFn: () =>
      apiClient<PerpetualSalesDataDailyGrouped>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily` +
          `?${buildRangeQuery(days, startDate, endDate)}&groupBy=${groupBy}`,
      ),
    enabled: !!projectId && !!funnelId && !!groupBy,
    staleTime: STALE_TIME,
  });
}
