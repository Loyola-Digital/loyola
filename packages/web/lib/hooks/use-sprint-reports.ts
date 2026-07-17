"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Relatórios HTML gerados por IA (skill dashboard-campanhas da gestora).

export interface SprintReportMeta {
  id: string;
  title: string;
  author: string | null;
  kind: string | null;
  createdAt: string;
}

export interface SprintReportFull extends SprintReportMeta {
  html: string;
}

export function useSprintReports() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-reports"],
    queryFn: () => apiClient<{ reports: SprintReportMeta[] }>("/api/sprint-reports"),
    staleTime: 30 * 1000,
  });
}

export function useSprintReport(id: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-report", id],
    queryFn: () => apiClient<SprintReportFull>(`/api/sprint-reports/${id}`),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteSprintReport() {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<{ ok: boolean }>(`/api/sprint-reports/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sprint-reports"] }),
  });
}
