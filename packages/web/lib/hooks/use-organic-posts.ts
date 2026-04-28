"use client";

import { useApiClient } from "@/lib/hooks/use-api-client";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  OrganicPostSource,
  OrganicPostLinksMap,
  StageOrganicPostHydrated,
  StageOrganicPost,
} from "@loyola-x/shared";

const STALE = 5 * 60 * 1000;

export function useOrganicPostLinks(
  projectId: string | null,
  source: OrganicPostSource,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["organic-post-links", projectId, source],
    queryFn: () =>
      apiClient<OrganicPostLinksMap[]>(
        `/api/projects/${projectId}/organic-posts/links?source=${source}`,
      ),
    enabled: !!projectId,
    staleTime: STALE,
  });
}

export function useStageOrganicPosts(
  projectId: string | null,
  funnelId: string | null,
  stageId: string | null,
) {
  const apiClient = useApiClient();
  return useQuery({
    queryKey: ["stage-organic-posts", projectId, funnelId, stageId],
    queryFn: () =>
      apiClient<StageOrganicPostHydrated[]>(
        `/api/projects/${projectId}/funnels/${funnelId}/stages/${stageId}/organic-posts`,
      ),
    enabled: !!projectId && !!funnelId && !!stageId,
    staleTime: STALE,
    refetchOnWindowFocus: false,
  });
}

export function useLinkOrganicPost(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      funnelId: string;
      stageId: string;
      source: OrganicPostSource;
      externalId: string;
    }) =>
      apiClient<StageOrganicPost>(
        `/api/projects/${projectId}/funnels/${input.funnelId}/stages/${input.stageId}/organic-posts`,
        {
          method: "POST",
          body: JSON.stringify({
            source: input.source,
            externalId: input.externalId,
          }),
        },
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["organic-post-links", projectId, variables.source],
      });
      qc.invalidateQueries({
        queryKey: [
          "stage-organic-posts",
          projectId,
          variables.funnelId,
          variables.stageId,
        ],
      });
    },
  });
}

export function useUnlinkOrganicPost(projectId: string) {
  const apiClient = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      funnelId: string;
      stageId: string;
      linkId: string;
      source: OrganicPostSource;
    }) =>
      apiClient<void>(
        `/api/projects/${projectId}/funnels/${input.funnelId}/stages/${input.stageId}/organic-posts/${input.linkId}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({
        queryKey: ["organic-post-links", projectId, variables.source],
      });
      qc.invalidateQueries({
        queryKey: [
          "stage-organic-posts",
          projectId,
          variables.funnelId,
          variables.stageId,
        ],
      });
    },
  });
}
