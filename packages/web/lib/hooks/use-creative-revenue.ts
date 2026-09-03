"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";

/**
 * Story 21.7 — faturamento real por criativo.
 *
 * Backend cruza ad_id → utm_content (planilha leads) → email → venda
 * (planilha stage_sales_spreadsheets subtype=capture) e retorna um map por
 * adId com o Set de emails que compraram (pra o frontend deduplicar quando
 * soma múltiplos ad_ids do mesmo criativo agregado).
 */
export interface CreativeRevenueAdEntry {
  faturamentoBruto: number;
  faturamentoLiquido: number;
  vendas: number;
  /** Lista de emails que compraram via este ad — usada pra dedup no frontend. */
  emails: string[];
}

export interface CreativeRevenueData {
  byAdId: Record<string, CreativeRevenueAdEntry>;
  totalVendas: number;
  faturamentoBruto: number;
  faturamentoLiquido: number;
  semDados: boolean;
}

const STALE_TIME = 30 * 1000;

export function useCreativeRevenue(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
  days?: number,
  /**
   * Story 18.75 (AC9): range explícito, para telas com data custom (Perpétuo).
   * Quando os dois vêm, o range ganha de `days` — é a escolha do usuário
   * contra o preset. Sem propagar isto, o card mostrava faturamento de uma
   * janela ao lado do investimento de outra, com aparência de coerência.
   */
  startDate?: string,
  endDate?: string,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["creative-revenue", projectId, funnelId, stageId, days, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      } else if (days) {
        params.set("days", String(days));
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      return apiClient<CreativeRevenueData>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/creative-revenue${qs}`,
      );
    },
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE_TIME,
  });
}
