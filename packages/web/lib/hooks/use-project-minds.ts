"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProjectMind {
  id: string;
  mindId: string;
  mindName: string;
  squad: string;
  squadDisplayName: string;
  specialty: string;
  addedBy: string;
  createdAt: string;
}

export function useProjectMinds(projectId: string) {
  const apiClient = useApiClient();

  return useQuery({
    queryKey: ["project-minds", projectId],
    queryFn: () =>
      apiClient<{ minds: ProjectMind[] }>(`/api/projects/${projectId}/minds`),
    enabled: !!projectId,
    select: (data) => data.minds,
  });
}

export function useLinkMindToProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, mindId }: { projectId: string; mindId: string }) =>
      apiClient(`/api/projects/${projectId}/minds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindId }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-minds", variables.projectId] });
    },
  });
}

export function useUnlinkMindFromProject() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, mindId }: { projectId: string; mindId: string }) =>
      apiClient(`/api/projects/${projectId}/minds/${mindId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-minds", variables.projectId] });
    },
  });
}
