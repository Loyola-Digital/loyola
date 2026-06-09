"use client";

import { useEffect } from "react";
import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SprintDashboardBlock, SprintDashboardConfig } from "@loyola-x/shared";

const STALE_TIME = 60 * 1000;

// ============================================================
// Config (singleton global)
// ============================================================

export function useSprintDashboardConfig() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-dashboard-config"],
    queryFn: () => apiClient<SprintDashboardConfig>("/api/sprint-dashboard/config"),
    staleTime: STALE_TIME,
  });
}

export function useUpdateSprintDashboardConfig() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blocks: SprintDashboardBlock[]) =>
      apiClient<SprintDashboardConfig>("/api/sprint-dashboard/config", {
        method: "PUT",
        body: JSON.stringify({ blocks }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-config"] });
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-metrics"] });
    },
  });
}

// ============================================================
// Tasks (pull on-demand + cache 5min server-side)
// ============================================================

export interface ClickUpTaskShape {
  id: string;
  name: string;
  status: string;
  statusColor: string | null;
  /** Story 31.9 — type do status ClickUp ("open"=não iniciado, "custom"=em progresso, "done"/"closed"=concluído). */
  statusType: string | null;
  tags: string[];
  url: string;
  dueDate: string | null;
  startDate: string | null;
  assignees: Array<{ id: number | null; name: string; avatar: string | null }>;
  listId: string;
  listName: string;
  folderId: string | null;
  folderName: string | null;
  /** Story 31.7 iter — Task Type custom (Campanha, Bug, etc). null = "Task". */
  customItemId: number | null;
  /** Story 31.8 — Nome do Task Type custom (resolvido no backend). null = default. */
  customItemName: string | null;
}

export function useSprintDashboardTasks(listIds: string[] | null) {
  const apiClient = useApiClient();
  const sorted = listIds ? [...listIds].sort() : [];
  const key = sorted.join(",");
  const query = useQuery({
    queryKey: ["sprint-dashboard-tasks", key],
    queryFn: () =>
      apiClient<{ tasks: ClickUpTaskShape[] }>(
        `/api/sprint-dashboard/tasks?listIds=${encodeURIComponent(key)}`,
      ),
    enabled: sorted.length > 0,
    staleTime: 2 * 60 * 1000,
  });
  // Story 31.8 — debug: identifica custom types únicos no batch atual.
  // Ajuda a diagnosticar quando o customItemName não vem resolvido.
  useEffect(() => {
    if (!query.data?.tasks) return;
    const customTypes = new Map<string, { id: number | null; name: string | null; count: number }>();
    for (const t of query.data.tasks) {
      if (t.customItemId == null) continue;
      const k = String(t.customItemId);
      const cur = customTypes.get(k) ?? { id: t.customItemId, name: t.customItemName, count: 0 };
      cur.count += 1;
      customTypes.set(k, cur);
    }
    if (customTypes.size > 0) {
      console.log(
        "[sprint-dashboard] custom types vistos no batch:",
        Array.from(customTypes.values()),
      );
    }
  }, [query.data]);
  return query;
}

export function useUpdateTaskStatus() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      apiClient<{ ok: boolean; taskId: string; status: string }>(
        `/api/sprint-dashboard/task/${taskId}/status`,
        {
          method: "PUT",
          body: JSON.stringify({ status }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-metrics"] });
    },
  });
}

export interface UpdateTaskInput {
  taskId: string;
  status?: string;
  name?: string;
  /** Unix ms — null remove, undefined não toca */
  dueDate?: number | null;
}

export function useUpdateTask() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...rest }: UpdateTaskInput) =>
      apiClient<{ ok: boolean; taskId: string }>(
        `/api/sprint-dashboard/task/${taskId}`,
        {
          method: "PUT",
          body: JSON.stringify(rest),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sprint-dashboard-metrics"] });
    },
  });
}

// ============================================================
// Metrics (Story 31.6)
// ============================================================

export interface SprintFolderMetric {
  folderId: string;
  folderName: string;
  total: number;
  done: number;
  overdue: number;
  notStarted: number; // Story 31.9 — não-done com status type "open"
  inProgress: number;
  upcoming: number;
  nextDueDate: number | null;
  nextDueTaskName: string | null;
}

export interface SprintDashboardMetrics {
  byFolder: SprintFolderMetric[];
  activeProjectsCount: number;
}

export function useSprintDashboardMetrics() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-dashboard-metrics"],
    queryFn: () => apiClient<SprintDashboardMetrics>("/api/sprint-dashboard/metrics"),
    staleTime: 5 * 60 * 1000,
  });
}

// ============================================================
// Builder helpers — hierarchy + list statuses
// ============================================================

export interface ClickUpHierarchy {
  spaces: Array<{
    id: string;
    name: string;
    folders: Array<{
      id: string;
      name: string;
      lists: Array<{ id: string; name: string }>;
    }>;
    folderlessLists: Array<{ id: string; name: string }>;
  }>;
}

export function useClickUpHierarchy(enabled: boolean) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-dashboard-hierarchy"],
    queryFn: () => apiClient<ClickUpHierarchy>("/api/sprint-dashboard/hierarchy"),
    enabled,
    staleTime: 15 * 60 * 1000,
  });
}

export interface ClickUpListStatus {
  status: string;
  color: string;
  orderindex: number;
  type: string;
}

export function useListStatuses(listId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["sprint-dashboard-list-statuses", listId],
    queryFn: () =>
      apiClient<{ statuses: ClickUpListStatus[] }>(
        `/api/sprint-dashboard/list/${listId}/statuses`,
      ),
    enabled: !!listId,
    staleTime: 15 * 60 * 1000,
  });
}
