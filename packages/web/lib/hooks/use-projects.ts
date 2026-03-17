"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Project {
  id: string;
  name: string;
  clientName: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  clientName: string;
  description?: string;
  color?: string;
}

// GET /api/projects — scoped by authenticated user
export function useProjects() {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient<Project[]>("/api/projects"),
  });
}

// POST /api/projects
export function useCreateProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectInput) =>
      apiClient<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// DELETE /api/projects/:id
export function useDeleteProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/projects/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
