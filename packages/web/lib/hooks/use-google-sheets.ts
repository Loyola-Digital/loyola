"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

export interface TabMapping {
  id: string;
  connectionId: string;
  tabName: string;
  tabType: "leads" | "survey" | "sales";
  columnMapping: Record<string, string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleSheetsConnection {
  id: string;
  projectId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetName: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tabMappings: TabMapping[];
}

export interface CreateConnectionResponse extends GoogleSheetsConnection {
  tabs: string[];
}

export interface TabPreview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

export interface TabMappingInput {
  tabName: string;
  tabType: "leads" | "survey" | "sales";
  columnMapping: Record<string, string>;
}

// ============================================================
// HOOKS
// ============================================================

export function useGoogleSheetsConnection(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["google-sheets-connection", projectId],
    queryFn: () =>
      apiClient<GoogleSheetsConnection>(
        `/api/google-sheets/connections/${projectId}`
      ),
    enabled: !!projectId,
    retry: false,
  });
}

export function useConnectGoogleSheet() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; spreadsheetUrl: string }) =>
      apiClient<CreateConnectionResponse>("/api/google-sheets/connections", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["google-sheets-connection", vars.projectId],
      });
    },
  });
}

export function useDeleteGoogleSheetsConnection() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) =>
      apiClient(`/api/google-sheets/connections/${vars.id}`, { method: "DELETE" }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["google-sheets-connection", vars.projectId],
      });
    },
  });
}

export function useMapSheetTabs() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      mappings,
    }: {
      connectionId: string;
      projectId: string;
      mappings: TabMappingInput[];
    }) =>
      apiClient<TabMapping[]>(
        `/api/google-sheets/connections/${connectionId}/tabs`,
        {
          method: "PUT",
          body: JSON.stringify({ mappings }),
        }
      ),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["google-sheets-connection", vars.projectId],
      });
    },
  });
}

export function useAvailableTabs(connectionId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sheet-available-tabs", connectionId],
    queryFn: () =>
      apiClient<{ tabs: string[] }>(
        `/api/google-sheets/connections/${connectionId}/available-tabs`
      ),
    enabled: !!connectionId,
  });
}

export function useSheetTabPreview(
  connectionId: string | null,
  tabName: string | null
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sheet-tab-preview", connectionId, tabName],
    queryFn: () =>
      apiClient<TabPreview>(
        `/api/google-sheets/connections/${connectionId}/tabs/${encodeURIComponent(tabName!)}/preview`
      ),
    enabled: !!connectionId && !!tabName,
  });
}
