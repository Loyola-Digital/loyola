"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type {
  PerpetualSalesData,
  PerpetualSalesDataDaily,
  PerpetualHourlyData,
} from "@loyola-x/shared";
// Story 29.80 — o recorte por funil/oferta (29.79). Ausente ou `{}` = a URL e a
// resposta de sempre; o painel só o monta depois que a API declarou suporte.
import { sufixoDoRecorte, type RecorteDeVendas } from "@/lib/utils/filtro-funil-oferta";

const STALE_TIME = 2 * 60 * 1000;

/** A parte da queryKey que muda com o recorte — `null`/`null` em "Todos". */
const chaveDoRecorte = (r: RecorteDeVendas | undefined) => [r?.funil ?? null, r?.oferta ?? null] as const;

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
  recorte?: RecorteDeVendas,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data", projectId, funnelId, days, startDate, endDate, ...chaveDoRecorte(recorte)],
    queryFn: () =>
      apiClient<PerpetualSalesData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data?${buildRangeQuery(days, startDate, endDate)}${sufixoDoRecorte(recorte)}`,
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
  recorte?: RecorteDeVendas,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-sales-data-daily", projectId, funnelId, days, startDate, endDate, ...chaveDoRecorte(recorte)],
    queryFn: () =>
      apiClient<PerpetualSalesDataDaily>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily?${buildRangeQuery(days, startDate, endDate)}${sufixoDoRecorte(recorte)}`,
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
  recorte?: RecorteDeVendas,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: [
      "perpetual-sales-data-daily-by-entity",
      projectId, funnelId, groupBy, days, startDate, endDate, ...chaveDoRecorte(recorte),
    ],
    queryFn: () =>
      apiClient<PerpetualSalesDataDailyGrouped>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/sales-data-daily` +
          `?${buildRangeQuery(days, startDate, endDate)}&groupBy=${groupBy}${sufixoDoRecorte(recorte)}`,
      ),
    enabled: !!projectId && !!funnelId && !!groupBy,
    staleTime: STALE_TIME,
  });
}

/**
 * Story 29.69/29.70/29.71/29.72 — as duas agregações da seção "Análise
 * detalhada no período".
 *
 * Query própria, e não um campo a mais em `usePerpetualSalesData`: esta lê a
 * planilha INTEIRA linha a linha (para derivar hora) e cruza com o cache
 * horário do banco. Pendurá-la na query dos cards faria todo o dashboard
 * esperar por ela.
 */
export function usePerpetualHourly(
  projectId: string | null,
  funnelId: string | null,
  days: number,
  startDate?: string,
  endDate?: string,
  recorte?: RecorteDeVendas,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-hourly", projectId, funnelId, days, startDate, endDate, ...chaveDoRecorte(recorte)],
    queryFn: () =>
      apiClient<PerpetualHourlyData>(
        `/api/projects/${projectId}/funnels/${funnelId}/perpetual/hourly?${buildRangeQuery(days, startDate, endDate)}${sufixoDoRecorte(recorte)}`,
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STALE_TIME,
    /**
     * ⚠️ Rota NOVA (29.69): a API em produção pode ser mais velha que o front e
     * responder 404. A seção some sozinha (o componente devolve `null` sem
     * dado), e insistir gastaria três tentativas por render para receber o
     * mesmo 404 — a rota não vai passar a existir entre um retry e outro.
     */
    retry: (falhas, erro) => {
      const status = (erro as { status?: number })?.status;
      if (status === 404) return false;
      return falhas < 2;
    },
  });
}
