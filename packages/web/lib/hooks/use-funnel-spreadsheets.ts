"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ColumnMapping,
  FunnelSpreadsheet,
  FunnelSpreadsheetData,
  FunnelSpreadsheetType,
} from "@/lib/types/funnel-spreadsheet";

function listKey(projectId: string, funnelId: string) {
  return ["funnel-spreadsheets", projectId, funnelId] as const;
}

function dataKey(projectId: string, funnelId: string, id: string) {
  return ["funnel-spreadsheets", projectId, funnelId, id, "data"] as const;
}

export function useFunnelSpreadsheets(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: listKey(projectId, funnelId),
    queryFn: () =>
      apiClient<{ spreadsheets: FunnelSpreadsheet[] }>(
        `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets`,
      ),
    enabled: Boolean(projectId && funnelId),
  });
}

export interface CreateFunnelSpreadsheetInput {
  label: string;
  type: FunnelSpreadsheetType;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  columnMapping: ColumnMapping;
}

export function useCreateFunnelSpreadsheet(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFunnelSpreadsheetInput) =>
      apiClient<FunnelSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId) });
    },
  });
}

export interface UpdateFunnelSpreadsheetInput {
  id: string;
  label?: string;
  type?: FunnelSpreadsheetType;
  spreadsheetId?: string;
  spreadsheetName?: string;
  sheetName?: string;
  columnMapping?: ColumnMapping;
}

export function useUpdateFunnelSpreadsheet(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateFunnelSpreadsheetInput) =>
      apiClient<FunnelSpreadsheet>(
        `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets/${id}`,
        { method: "PUT", body: JSON.stringify(patch) },
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId) });
      qc.invalidateQueries({ queryKey: dataKey(projectId, funnelId, variables.id) });
    },
  });
}

export function useDeleteFunnelSpreadsheet(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ success: true }>(
        `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: listKey(projectId, funnelId) });
      qc.invalidateQueries({ queryKey: dataKey(projectId, funnelId, id) });
    },
  });
}

export function useFunnelSpreadsheetData(
  projectId: string,
  funnelId: string,
  id: string | null | undefined,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: dataKey(projectId, funnelId, id ?? ""),
    queryFn: () =>
      apiClient<FunnelSpreadsheetData>(
        `/api/projects/${projectId}/funnels/${funnelId}/spreadsheets/${id}/data`,
      ),
    enabled: Boolean(projectId && funnelId && id),
    staleTime: 5 * 60 * 1000,
  });
}
