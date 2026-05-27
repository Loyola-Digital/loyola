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

export type SurveyType = "paid" | "organic";

export interface SurveyQuestionConfig {
  columnName: string;
  label: string;
  showInDashboard: boolean;
}

export interface SurveyColumnMapping {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  email?: string;
  phone?: string;
  timestamp?: string;
  /** Story 18.17: coluna com faixa pré-calculada (A/B/C/D) */
  faixa?: string;
  questions?: SurveyQuestionConfig[];
}

export interface FunnelSurvey {
  id: string;
  funnelId: string;
  stageId: string | null;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  surveyType: SurveyType;
  columnMapping: SurveyColumnMapping;
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

function buildSurveyQuery(stageId?: string | null, surveyType?: SurveyType | null): string {
  const params = new URLSearchParams();
  if (stageId) params.set("stageId", stageId);
  if (surveyType) params.set("surveyType", surveyType);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useFunnelSurveys(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
  surveyType?: SurveyType | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-surveys", projectId, funnelId, stageId ?? null, surveyType ?? null],
    queryFn: () => {
      return apiClient<{ surveys: FunnelSurvey[] }>(
        `/api/projects/${projectId}/funnels/${funnelId}/surveys${buildSurveyQuery(stageId, surveyType)}`,
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
    mutationFn: (data: {
      stageId?: string;
      spreadsheetId: string;
      spreadsheetName: string;
      sheetName: string;
      surveyType?: SurveyType;
    }) =>
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

export function useUpdateSurveyMapping(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ surveyId, mapping }: { surveyId: string; mapping: SurveyColumnMapping }) =>
      apiClient<FunnelSurvey>(
        `/api/projects/${projectId}/funnels/${funnelId}/surveys/${surveyId}/mapping`,
        { method: "PATCH", body: JSON.stringify(mapping) },
      ),
    onSuccess: () => { invalidateFunnelSurveys(qc, projectId, funnelId); },
  });
}

export function useSurveySummary(
  projectId: string,
  funnelId: string,
  stageId?: string | null,
  surveyType?: SurveyType | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-surveys-summary", projectId, funnelId, stageId ?? null, surveyType ?? null],
    queryFn: () => {
      return apiClient<SurveySummary>(
        `/api/projects/${projectId}/funnels/${funnelId}/surveys/summary${buildSurveyQuery(stageId, surveyType)}`,
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
