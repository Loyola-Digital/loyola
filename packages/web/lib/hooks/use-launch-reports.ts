"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Story 41.5 — geração e histórico do Resumão (§9.1).

export interface LaunchReportAlerta {
  codigo: string;
  mensagem: string;
}

export interface LaunchReportInvariante {
  codigo: string;
  status: "passed" | "failed" | "skipped";
  detalhe: string;
  acao: string;
}

export interface LaunchReportConferencia {
  status: "passed" | "failed" | "alerta" | "skipped";
  investimentoCalculado: number;
  investimentoOficial: number | null;
  delta: number | null;
  detalhe: string;
}

export interface LaunchReportResult {
  id: string;
  createdAt: string;
  html?: string;
  metricas: Record<string, unknown>;
  alertas: LaunchReportAlerta[];
  invariantes: LaunchReportInvariante[];
  conferencia: LaunchReportConferencia;
}

export interface LaunchReportListItem {
  id: string;
  kind: "resumao" | "comparativo";
  title: string;
  dataInicio: string | null;
  dataFim: string | null;
  alertas: LaunchReportAlerta[] | null;
  createdAt: string;
}

/**
 * Corpo de erro do §9.1. Os quatro casos têm formatos distintos de propósito: o
 * usuário precisa saber se falta **validar a combinação**, se falta **dado**, se
 * o **número não fecha** ou se o investimento **divergiu do oficial**.
 */
export interface LaunchReportErro {
  erro:
    | "COMBINACAO_NAO_VALIDADA"
    | "DADO_INDISPONIVEL"
    | "INVARIANTE_VIOLADO"
    | "CONFERENCIA_EXTERNA";
  codigo?: string;
  detalhe: string;
  acao: string;
  violacoes?: LaunchReportInvariante[];
}

function basePath(projectId: string, funnelId: string, stageId: string) {
  return `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/reports`;
}

function listKey(projectId: string, funnelId: string, stageId: string) {
  return ["launch-reports", projectId, funnelId, stageId] as const;
}

export function useLaunchReports(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: listKey(projectId ?? "", funnelId ?? "", stageId ?? ""),
    queryFn: () =>
      apiClient<{ reports: LaunchReportListItem[] }>(
        basePath(projectId!, funnelId!, stageId!),
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: 30 * 1000,
  });
}

export function useGenerateResumao(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      dataInicio?: string | null;
      dataFim?: string | null;
      investimentoOficial?: number | null;
    }) =>
      apiClient<LaunchReportResult>(`${basePath(projectId, funnelId, stageId)}/resumao`, {
        method: "POST",
        body: JSON.stringify({ ...input, formato: "html" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId, stageId) });
    },
  });
}

export function useLaunchReportHtml(
  projectId: string,
  funnelId: string,
  stageId: string,
  reportId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["launch-report", projectId, funnelId, stageId, reportId],
    queryFn: () =>
      apiClient<LaunchReportListItem & { html: string }>(
        `${basePath(projectId, funnelId, stageId)}/${reportId}`,
      ),
    enabled: !!reportId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteLaunchReport(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) =>
      apiClient<{ ok: true }>(`${basePath(projectId, funnelId, stageId)}/${reportId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId, stageId) });
    },
  });
}
