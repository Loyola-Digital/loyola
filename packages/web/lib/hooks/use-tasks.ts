"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api-client";
import type { DelegatedTask } from "@loyola-x/shared";

interface UseTasksOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

interface TaskListResponse {
  tasks: DelegatedTask[];
  total: number;
}

export function useTasks(options?: UseTasksOptions) {
  const apiClient = useApiClient();
  const { status, limit = 20, offset = 0 } = options ?? {};

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks", { status, limit, offset }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (status) params.set("status", status);
      return apiClient<TaskListResponse>(`/api/tasks?${params.toString()}`);
    },
  });

  return {
    tasks: data?.tasks,
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
