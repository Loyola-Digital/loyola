"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  FunnelGroupsSpreadsheetLink,
  FunnelGroupsSyncResult,
  FunnelGroupsDailyResponse,
} from "@loyola-x/shared";

const linkKey = (projectId: string, funnelId: string) =>
  ["funnel-groups-link", projectId, funnelId] as const;

const dailyKey = (projectId: string, funnelId: string, from?: string, to?: string) =>
  ["funnel-groups-daily", projectId, funnelId, from ?? null, to ?? null] as const;

export function useFunnelGroupsLink(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: linkKey(projectId, funnelId),
    queryFn: async () => {
      try {
        return await apiClient<FunnelGroupsSpreadsheetLink>(
          `/api/projects/${projectId}/funnels/${funnelId}/groups-spreadsheet`
        );
      } catch (err) {
        // 404 = sem link ainda. Retorna null em vez de lançar.
        if (err instanceof Error && err.message.includes("404")) return null;
        throw err;
      }
    },
  });
}

export function useFunnelGroupsDaily(
  projectId: string,
  funnelId: string,
  opts?: { from?: string; to?: string; enabled?: boolean }
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: dailyKey(projectId, funnelId, opts?.from, opts?.to),
    queryFn: () => {
      const params = new URLSearchParams();
      if (opts?.from) params.set("from", opts.from);
      if (opts?.to) params.set("to", opts.to);
      const qs = params.toString();
      return apiClient<FunnelGroupsDailyResponse>(
        `/api/projects/${projectId}/funnels/${funnelId}/group-snapshots/daily${qs ? `?${qs}` : ""}`
      );
    },
    enabled: opts?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useLinkFunnelGroupsSpreadsheet(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { spreadsheetId: string; spreadsheetName: string; sheetName: string }) =>
      apiClient<FunnelGroupsSpreadsheetLink>(
        `/api/projects/${projectId}/funnels/${funnelId}/groups-spreadsheet`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linkKey(projectId, funnelId) });
    },
  });
}

export function useUnlinkFunnelGroupsSpreadsheet(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<void>(`/api/projects/${projectId}/funnels/${funnelId}/groups-spreadsheet`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linkKey(projectId, funnelId) });
      qc.invalidateQueries({ queryKey: ["funnel-groups-daily", projectId, funnelId] });
    },
  });
}

export function useSyncFunnelGroups(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient<FunnelGroupsSyncResult>(
        `/api/projects/${projectId}/funnels/${funnelId}/groups-spreadsheet/sync`,
        { method: "POST" }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: linkKey(projectId, funnelId) });
      qc.invalidateQueries({ queryKey: ["funnel-groups-daily", projectId, funnelId] });
    },
  });
}
