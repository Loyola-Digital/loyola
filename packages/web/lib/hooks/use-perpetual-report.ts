"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 41.9 — geração e histórico do relatório perpétuo (botão 3, §C.8).

export interface PerpetualReportKpis {
  investimentoBruto: number;
  investimentoComImposto: number;
  vendas: number;
  transacoes: number;
  faturamentoBruto: number;
  ticketMedio: number | null;
  cac: number | null;
  roas: number | null;
  margem: number;
  margemPct: number | null;
  cacBreakeven: number | null;
  cacVsBreakeven: number | null;
}

export interface PerpetualReportAlerta {
  codigo: string;
  mensagem: string;
}

export interface PerpetualReportResult {
  id: string;
  createdAt: string;
  html: string;
  metricas: PerpetualReportKpis;
  alertas: PerpetualReportAlerta[];
}

export interface PerpetualReportListItem {
  id: string;
  dataInicio: string;
  dataFim: string;
  metricas: PerpetualReportKpis;
  alertas: PerpetualReportAlerta[];
  createdAt: string;
}

/** Corpo de erro do §C.8 — os três casos têm formatos distintos de propósito. */
export interface PerpetualReportErro {
  erro: "COMBINACAO_NAO_VALIDADA" | "INVARIANTE_VIOLADO" | "DADO_INDISPONIVEL";
  codigo?: string;
  detalhe: string;
  acao: string;
}

function basePath(projectId: string, funnelId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/perpetual-report`;
}

function listKey(projectId: string, funnelId: string) {
  return ["perpetual-reports", projectId, funnelId] as const;
}

export function usePerpetualReports(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: listKey(projectId ?? "", funnelId ?? ""),
    queryFn: () =>
      apiClient<{ reports: PerpetualReportListItem[] }>(basePath(projectId!, funnelId!)),
    enabled: !!projectId && !!funnelId,
    staleTime: 30 * 1000,
  });
}

export function useGeneratePerpetualReport(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dataInicio?: string | null; dataFim?: string | null }) =>
      apiClient<PerpetualReportResult>(basePath(projectId, funnelId), {
        method: "POST",
        body: JSON.stringify({ ...input, formato: "html" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId) });
    },
  });
}

export function usePerpetualReportHtml(
  projectId: string,
  funnelId: string,
  reportId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["perpetual-report", projectId, funnelId, reportId],
    queryFn: () =>
      apiClient<PerpetualReportListItem & { html: string }>(
        `${basePath(projectId, funnelId)}/${reportId}`,
      ),
    enabled: !!reportId,
    staleTime: 5 * 60 * 1000,
  });
}
