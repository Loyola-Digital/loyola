"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FunnelStage } from "@loyola-x/shared";

const STAGE_STALE_TIME = 2 * 60 * 1000; // 2 min

export interface CreateStageInput {
  name: string;
  stageType?: "paid" | "free";
  metaAccountId?: string | null;
  campaigns?: { id: string; name: string }[];
  googleAdsAccountId?: string | null;
  googleAdsCampaigns?: { id: string; name: string }[];
  switchyFolderIds?: { id: number; name: string }[];
  switchyLinkedLinks?: { uniq: number; id: string; domain: string }[];
}

export type UpdateStageInput = Partial<CreateStageInput>;

export function useFunnelStages(projectId: string | null, funnelId: string | null) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-stages", projectId, funnelId],
    queryFn: () =>
      apiClient<FunnelStage[]>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages`
      ),
    enabled: !!projectId && !!funnelId,
    staleTime: STAGE_STALE_TIME,
  });
}

export function useFunnelStage(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["funnel-stage", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<FunnelStage>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STAGE_STALE_TIME,
  });
}

export function useCreateStage(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStageInput) =>
      apiClient<FunnelStage>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages`,
        { method: "POST", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnel-stages", projectId, funnelId] });
    },
  });
}

export function useUpdateStage(projectId: string, funnelId: string, stageId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateStageInput) =>
      apiClient<FunnelStage>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`,
        { method: "PUT", body: JSON.stringify(data) }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnel-stages", projectId, funnelId] });
      queryClient.invalidateQueries({ queryKey: ["funnel-stage", projectId, funnelId, stageId] });
    },
  });
}

export function useDeleteStage(projectId: string, funnelId: string) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}`,
        { method: "DELETE" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funnel-stages", projectId, funnelId] });
    },
  });
}
