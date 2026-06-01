"use client";

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
}

export function useSprintDashboardTasks(listIds: string[] | null) {
  const apiClient = useApiClient();
  const sorted = listIds ? [...listIds].sort() : [];
  const key = sorted.join(",");
  return useQuery({
    queryKey: ["sprint-dashboard-tasks", key],
    queryFn: () =>
      apiClient<{ tasks: ClickUpTaskShape[] }>(
        `/api/sprint-dashboard/tasks?listIds=${encodeURIComponent(key)}`,
      ),
    enabled: sorted.length > 0,
    staleTime: 2 * 60 * 1000,
  });
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
