"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SpreadsheetInfo {
  id: string;
  name: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
}

export interface SheetData {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface FunnelSurvey {
  id: string;
  funnelId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  createdAt: string;
  responses?: number;
}

export interface SurveySummary {
  totalResponses: number;
  surveys: FunnelSurvey[];
  responseRate: number | null;
}

export function useSpreadsheets() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-sheets-spreadsheets"],
    queryFn: () => apiClient<{ spreadsheets: SpreadsheetInfo[] }>("/api/google-sheets/spreadsheets"),
    staleTime: 30 * 1000,
  });
}

export function useSpreadsheetSheets(spreadsheetId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-sheets-sheets", spreadsheetId],
    queryFn: () => apiClient<{ name: string; sheets: SheetInfo[] }>(`/api/google-sheets/spreadsheets/${spreadsheetId}/sheets`),
    enabled: !!spreadsheetId,
    staleTime: 30 * 1000,
  });
}

export function useSheetData(spreadsheetId: string | null, sheetName: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-sheets-data", spreadsheetId, sheetName],
    queryFn: () => apiClient<SheetData>(`/api/google-sheets/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName!)}/data`),
    enabled: !!spreadsheetId && !!sheetName,
    staleTime: 30 * 1000,
  });
}

export function useFunnelSurveys(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-surveys", projectId, funnelId, stageId ?? null],
    queryFn: () => {
      const qs = stageId ? `?stageId=${encodeURIComponent(stageId)}` : "";
      return apiClient<{ surveys: FunnelSurvey[] }>(
        `/api/projects/${projectId}/funnels/${funnelId}/surveys${qs}`,
      );
    },
  });
}

// Invalida a lista de surveys E a agregação de summary (que lê de verdade as
// planilhas e calcula totalResponses/responseRate). Sem invalidar o summary,
// adicionar/remover uma pesquisa mantém os KPIs agregados da planilha antiga
// em cache até reload.
function invalidateFunnelSurveys(qc: ReturnType<typeof useQueryClient>, projectId: string, funnelId: string) {
  qc.invalidateQueries({ queryKey: ["funnel-surveys", projectId, funnelId] });
  qc.invalidateQueries({ queryKey: ["funnel-surveys-summary", projectId, funnelId] });
}

export function useAddFunnelSurvey(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { stageId?: string; spreadsheetId: string; spreadsheetName: string; sheetName: string }) =>
      apiClient(`/api/projects/${projectId}/funnels/${funnelId}/surveys`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => { invalidateFunnelSurveys(qc, projectId, funnelId); },
  });
}

export function useRemoveFunnelSurvey(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (surveyId: string) =>
      apiClient(`/api/projects/${projectId}/funnels/${funnelId}/surveys/${surveyId}`, { method: "DELETE" }),
    onSuccess: () => { invalidateFunnelSurveys(qc, projectId, funnelId); },
  });
}

export function useSurveySummary(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-surveys-summary", projectId, funnelId, stageId ?? null],
    queryFn: () => {
      const qs = stageId ? `?stageId=${encodeURIComponent(stageId)}` : "";
      return apiClient<SurveySummary>(
        `/api/projects/${projectId}/funnels/${funnelId}/surveys/summary${qs}`,
      );
    },
    staleTime: 30 * 1000,
  });
}

export function useRefreshSheetData() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ spreadsheetId, sheetName }: { spreadsheetId: string; sheetName: string }) =>
      apiClient(`/api/google-sheets/spreadsheets/${spreadsheetId}/sheets/${encodeURIComponent(sheetName)}/refresh`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["google-sheets-data"] }); qc.invalidateQueries({ queryKey: ["funnel-surveys-summary"] }); },
  });
}
