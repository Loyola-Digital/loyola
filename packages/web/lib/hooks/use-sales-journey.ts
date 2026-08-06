"use client";

/**
 * Etapa de Vendas: comparação D-day, origem dos compradores e jornada do lead.
 *
 * As três leem Google Sheets ao vivo no servidor, então o staleTime é generoso —
 * remontar a aba não deve custar uma nova rodada de leitura de planilha.
 */

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";

export interface SalesDay {
  /** 1 = primeiro dia com venda daquele funil. */
  dia: number;
  date: string;
  vendas: number;
  acumulado: number;
}

export interface SalesDailyComparison {
  funnelName: string;
  /** true = nenhuma planilha de produto principal vinculada. */
  semPlanilha: boolean;
  total: number;
  /** Vendas descartadas por não terem data válida na planilha. */
  semData: number;
  points: SalesDay[];
  comparacao: {
    funnelName: string;
    points: SalesDay[];
    total: number;
    semPlanilha: boolean;
  } | null;
  /** Acumulado atual vs. o do anterior NO MESMO D-day. null = sem base. */
  deltaPercent: number | null;
}

export interface BuyersOrigin {
  semDados: boolean;
  totalCompradores: number;
  casados: number;
  /** Comprou sem passar pela aplicação, ou usou outro e-mail no checkout. */
  semOrigem: number;
  porFonte: { nome: string; compradores: number }[];
  porCampanha: { nome: string; compradores: number }[];
  fontes: { label: string; tipo: "pesquisa" | "aplicacao" | "captacao" }[];
}

export interface JourneyEvent {
  kind: "captacao" | "aplicacao" | "pesquisa" | "compra" | "venda_manual" | "comercial";
  date: string | null;
  titulo: string;
  detalhe: string | null;
  funnelName: string;
  stageName: string | null;
  campos: { label: string; valor: string }[];
}

export interface LeadJourney {
  email: string;
  scope: "funnel" | "project";
  encontrado: boolean;
  eventos: JourneyEvent[];
  resumo: {
    total: number;
    compras: number;
    primeiroContato: string | null;
    funis: string[];
  };
}

function base(projectId: string, funnelId: string, stageId: string): string {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`;
}

export function useSalesDailyComparison(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sales-daily-comparison", projectId, funnelId, stageId],
    queryFn: () => apiClient<SalesDailyComparison>(`${base(projectId, funnelId, stageId)}/sales-daily-comparison`),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBuyersOrigin(projectId: string, funnelId: string, stageId: string, enabled = true) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["buyers-origin", projectId, funnelId, stageId],
    queryFn: () => apiClient<BuyersOrigin>(`${base(projectId, funnelId, stageId)}/buyers-origin`),
    enabled: enabled && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * A jornada só dispara quando há um e-mail buscado — varrer planilha sem alvo
 * seria puro desperdício de leitura do Sheets.
 */
export function useLeadJourney(
  projectId: string,
  funnelId: string,
  stageId: string,
  email: string | null,
  scope: "funnel" | "project",
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["lead-journey", projectId, funnelId, stageId, email, scope],
    queryFn: () =>
      apiClient<LeadJourney>(
        `${base(projectId, funnelId, stageId)}/lead-journey?email=${encodeURIComponent(email ?? "")}&scope=${scope}`,
      ),
    enabled: !!email && email.length >= 3 && !!projectId && !!funnelId && !!stageId,
    staleTime: 5 * 60 * 1000,
  });
}
