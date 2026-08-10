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
  /** Quebra das vendas do dia por origem (utm_source da venda), desc. */
  porSource: { source: string; vendas: number }[];
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
  /**
   * Cada dimensão responde uma pergunta diferente sobre os mesmos compradores.
   * `comInfo` = quantos tinham aquela informação no utm_term — sem isso, "3
   * vieram da lpa" esconde que só 5 dos 27 tinham LP registrada.
   */
  dimensoes: {
    key: string;
    label: string;
    comInfo: number;
    itens: { nome: string; compradores: number }[];
  }[];
  /** Compradores cujo utm_term seguia o padrão estruturado do Meta. */
  comTermEstruturado: number;
  /** Toda planilha conectada no funil (menos as de venda) e quantos casou. */
  fontes: { label: string; tipo: "pesquisa" | "aplicacao" | "captacao"; compradores: number }[];
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

export function useBuyersOrigin(
  projectId: string,
  funnelId: string,
  stageId: string,
  days?: number,
  enabled = true,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["buyers-origin", projectId, funnelId, stageId, days ?? null],
    queryFn: () =>
      apiClient<BuyersOrigin>(
        `${base(projectId, funnelId, stageId)}/buyers-origin${days ? `?days=${days}` : ""}`,
      ),
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
