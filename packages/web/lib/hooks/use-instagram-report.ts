"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery } from "@tanstack/react-query";
import type {
  InstagramMonthlyReportRecord,
  InstagramMonthlyReportListItem,
} from "@loyola-x/shared";

export function useInstagramReport(
  projectId: string | null,
  reportId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-report", projectId, reportId],
    queryFn: () =>
      apiClient<InstagramMonthlyReportRecord>(
        `/api/projects/${projectId}/reports/instagram/${reportId}`,
      ),
    enabled: !!projectId && !!reportId,
    staleTime: 60 * 60 * 1000, // 1h — relatório é snapshot, raramente muda
  });
}

export function useInstagramReports(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["instagram-reports", projectId],
    queryFn: () =>
      apiClient<(InstagramMonthlyReportListItem & { generatedByName?: string })[]>(
        `/api/projects/${projectId}/reports/instagram`,
      ),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5min
  });
}
