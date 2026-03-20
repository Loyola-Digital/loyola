"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

export interface QualificationRule {
  field: string;
  operator: "equals" | "not_equals" | "gte" | "lte" | "contains" | "in";
  value: string;
}

export interface QualificationProfile {
  id: string;
  projectId: string;
  rules: QualificationRule[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualificationPreview {
  totalLeads: number;
  qualifiedLeads: number;
  qualificationRate: number;
}

// ============================================================
// HOOKS
// ============================================================

export function useQualificationProfile(projectId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["qualification-profile", projectId],
    queryFn: () =>
      apiClient<QualificationProfile>(
        `/api/traffic/qualification/${projectId}`
      ),
    enabled: !!projectId,
    retry: false,
  });
}

export function useSaveQualificationProfile() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { projectId: string; rules: QualificationRule[] }) =>
      apiClient<QualificationProfile>(
        `/api/traffic/qualification/${data.projectId}`,
        {
          method: "POST",
          body: JSON.stringify({ rules: data.rules }),
        }
      ),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["qualification-profile", vars.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["traffic-campaigns", vars.projectId],
      });
    },
  });
}

export function useDeleteQualificationProfile() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiClient(`/api/traffic/qualification/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({
        queryKey: ["qualification-profile", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["traffic-campaigns", projectId],
      });
    },
  });
}

export function useQualificationPreview() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: { projectId: string; rules: QualificationRule[] }) =>
      apiClient<QualificationPreview>(
        `/api/traffic/qualification/${data.projectId}/preview`,
        {
          method: "POST",
          body: JSON.stringify({ rules: data.rules }),
        }
      ),
  });
}

export function useAIGenerateRules() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: (data: { projectId: string; description: string }) =>
      apiClient<{ rules: QualificationRule[] }>(
        `/api/traffic/qualification/${data.projectId}/ai-generate`,
        {
          method: "POST",
          body: JSON.stringify({ description: data.description }),
        }
      ),
  });
}
